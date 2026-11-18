using System.Globalization;
using System.Text.Json;

namespace CastroFallas.MiniQuote.Api.Services;

// Deliberately exposes only fields needed for public quote/itinerary catalogues.
// Dhole's opaque metadata and pricing flags are never returned to visitors.
public sealed record DholeCatalogItem(
    string Id,
    string Code,
    string Name,
    string Value,
    bool? IsActive,
    int SortOrder,
    string? TransportMode,
    string? TerminalType,
    string? RouteRole,
    string? CountryCode,
    string? Size,
    string? Kind,
    int? Feet,
    decimal? CapacityTons,
    string[] Modalities,
    string[] ShipmentModes);

public static class DholeCatalogNormalizer
{
    public static DholeCatalogItem[] Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        // Dhole endpoints currently return either an array or { "value": [...] }.
        JsonElement items;
        if (root.ValueKind == JsonValueKind.Array)
            items = root;
        else if (root.ValueKind == JsonValueKind.Object &&
                 Find(root, "value", out var envelope) &&
                 envelope.ValueKind == JsonValueKind.Array)
            items = envelope;
        else
            throw new InvalidDataException("Invalid Dhole catalogue envelope.");

        if (items.GetArrayLength() > 20_000)
            throw new InvalidDataException("Dhole catalogue exceeds the allowed item count.");

        var result = new List<DholeCatalogItem>();
        var seen = new HashSet<Guid>();
        foreach (var item in items.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
                throw new InvalidDataException("Invalid Dhole catalogue item.");

            var active = ReadBool(item, "isActive");
            if (active == false) continue; // Missing/null isActive is NOT an exclusion.

            var idText = ReadString(item, "id");
            if (!Guid.TryParse(idText, out var id) || id == Guid.Empty || !seen.Add(id))
                throw new InvalidDataException("Missing, invalid or duplicate Dhole catalogue ID.");

            var name = ReadString(item, "name");
            var value = ReadString(item, "value");
            if (string.IsNullOrWhiteSpace(name) || name.Length > 300 ||
                string.IsNullOrWhiteSpace(value) || value.Length > 300)
                throw new InvalidDataException("Invalid Dhole catalogue name/value.");

            JsonDocument? metadataDocument = null;
            try
            {
                var metadata = default(JsonElement);
                if (Find(item, "metadata", out var meta) && meta.ValueKind == JsonValueKind.Object)
                    metadata = meta;
                else
                {
                    var metadataJson = ReadString(item, "metadataJson");
                    if (!string.IsNullOrWhiteSpace(metadataJson))
                    {
                        metadataDocument = JsonDocument.Parse(metadataJson);
                        if (metadataDocument.RootElement.ValueKind == JsonValueKind.Object)
                            metadata = metadataDocument.RootElement;
                    }
                }

                var mode = Resolve(item, metadata, "transportMode");
                var terminal = Resolve(item, metadata, "terminalType");
                var role = Resolve(item, metadata, "routeRole");

                result.Add(new DholeCatalogItem(
                    id.ToString(),
                    ReadString(item, "code") ?? value,
                    name.Trim(),
                    value.Trim(),
                    active,
                    ReadInt(item, "sortOrder") ?? 0,
                    mode,
                    terminal?.ToUpperInvariant(),
                    role?.ToUpperInvariant(),
                    Resolve(item, metadata, "countryCode")?.ToUpperInvariant(),
                    ReadString(metadata, "size"),
                    ReadString(metadata, "kind"),
                    ReadInt(metadata, "feet"),
                    ReadDecimal(metadata, "capacityTons"),
                    ReadStringArray(metadata, "modalities"),
                    ReadStringArray(metadata, "shipmentModes")));
            }
            finally
            {
                metadataDocument?.Dispose();
            }
        }

        return result.OrderBy(x => x.SortOrder).ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static bool Find(JsonElement obj, string name, out JsonElement value)
    {
        if (obj.ValueKind == JsonValueKind.Object)
        {
            if (obj.TryGetProperty(name, out value)) return true;
            foreach (var prop in obj.EnumerateObject())
            {
                if (string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = prop.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }

    private static string? ReadString(JsonElement obj, string name) =>
        Find(obj, name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim()
            : null;

    private static bool? ReadBool(JsonElement obj, string name)
    {
        if (!Find(obj, name, out var value)) return null;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null
        };
    }

    private static int? ReadInt(JsonElement obj, string name)
    {
        if (!Find(obj, name, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number))
            return number;
        if (value.ValueKind == JsonValueKind.String &&
            int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out number))
            return number;
        return null;
    }

    private static decimal? ReadDecimal(JsonElement obj, string name)
    {
        if (!Find(obj, name, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
            return number;
        return null;
    }

    private static string[] ReadStringArray(JsonElement obj, string name) =>
        Find(obj, name, out var array) && array.ValueKind == JsonValueKind.Array
            ? array.EnumerateArray()
                .Where(value => value.ValueKind == JsonValueKind.String)
                .Select(value => value.GetString()?.Trim())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value!)
                .ToArray()
            : [];

    private static string? Resolve(JsonElement item, JsonElement metadata, string property)
    {
        var direct = ReadString(item, property);
        var nested = ReadString(metadata, property);
        if (!string.IsNullOrWhiteSpace(direct) && !string.IsNullOrWhiteSpace(nested) &&
            !string.Equals(direct, nested, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Conflicting Dhole catalogue metadata.");
        return !string.IsNullOrWhiteSpace(direct) ? direct : nested;
    }
}
