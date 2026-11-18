namespace CastroFallas.MiniQuote.Api.Services;

// Projection only: the legacy form still submits size/type text. The eventual
// adapter must validate BOTH fields against one Dhole combined equipment UUID.
public sealed record DholeFclEquipmentOption(
    string SizeExternalId,
    string TypeExternalId,
    string SizeCode,
    string SizeName,
    string TypeCode,
    string TypeName,
    bool MultimodalOnly);

public sealed record DholeFtlSizeOption(
    string ExternalId, string Code, string Name, int? Feet, decimal? CapacityTons);

public sealed record DholeEquipmentProjection(
    DholeFclEquipmentOption[] FclCombinations,
    DholeFtlSizeOption[] FtlSizes,
    string[] RejectedTypeCodes);

public static class DholeEquipmentProjector
{
    private static readonly IReadOnlyDictionary<string, string> Types =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["dry-van"] = "Dry Van",
            ["high-cube"] = "High Cube",
            ["open-top"] = "Open Top",
            ["open-side"] = "Open Side",
            ["tank"] = "Tank",
            ["flat-rack"] = "Flat Rack",
            ["nor"] = "NOR"
        };

    public static DholeEquipmentProjection Project(
        IReadOnlyList<DholeCatalogItem> containerSizes,
        IReadOnlyList<DholeCatalogItem> containerTypes,
        IReadOnlyList<DholeCatalogItem> truckSizes)
    {
        // Use Dhole values for active sizes; no static fallback to older 40-ft FTL.
        var sizes = containerSizes
            .Where(x => x.IsActive != false)
            .GroupBy(x => x.Value, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.ToArray(), StringComparer.Ordinal);
        var combinations = new List<DholeFclEquipmentOption>();
        var rejected = new List<string>();

        foreach (var item in containerTypes.Where(x => x.IsActive != false))
        {
            // Air LCL equipment is intentionally out of scope pending business approval.
            if (!item.ShipmentModes.Contains("FCL", StringComparer.OrdinalIgnoreCase))
                continue;

            // We did not create a separate multimodal wizard. Equipment marked
            // Multimodal is eligible in its maritime workflow when applicable.
            bool maritime = item.Modalities.Contains("Maritime", StringComparer.OrdinalIgnoreCase);
            bool multimodal = item.Modalities.Contains("Multimodal", StringComparer.OrdinalIgnoreCase);
            if (!maritime && !multimodal) continue;

            if (string.IsNullOrWhiteSpace(item.Size) || string.IsNullOrWhiteSpace(item.Kind) ||
                !Types.TryGetValue(item.Kind, out var typeName) ||
                !sizes.TryGetValue(item.Size, out var matchingSizes) || matchingSizes.Length != 1)
            {
                rejected.Add(item.Code);
                continue;
            }

            var size = matchingSizes[0];
            combinations.Add(new(
                size.Id,
                item.Id,
                size.Value,
                size.Name,
                item.Code,
                typeName,
                !maritime && multimodal));
        }

        var trucks = truckSizes
            .Where(x => x.IsActive != false)
            .Select(x => new DholeFtlSizeOption(x.Id, x.Value, x.Name, x.Feet, x.CapacityTons))
            .OrderBy(x => x.Feet ?? int.MaxValue)
            .ThenBy(x => x.Code, StringComparer.Ordinal)
            .ToArray();

        return new(
            combinations.OrderBy(x => int.TryParse(x.SizeCode, out var feet) ? feet : int.MaxValue)
                .ThenBy(x => x.TypeName, StringComparer.Ordinal)
                .ThenBy(x => x.TypeExternalId, StringComparer.Ordinal)
                .ToArray(),
            trucks,
            rejected.Distinct(StringComparer.Ordinal).OrderBy(x => x, StringComparer.Ordinal).ToArray());
    }
}
