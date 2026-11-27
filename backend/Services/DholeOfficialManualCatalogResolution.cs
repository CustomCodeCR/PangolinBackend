using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text.Json;

namespace CastroFallas.MiniQuote.Api.Services;

// OFFLINE contract review only. This adapts a short-lived manual Config export
// into the same typed resolution consumed by DholeOfficialQuoteFlatPreviewBuilder.
// It has NO sender, outbox access, API key, worker or network calls. A future
// dispatcher must separately authorize and validate upstream identity/response.
// Snapshot DTO intentionally independent from the live HTTP/catalogue service.
// A future coordinator can adapt an actual verified DholeOfficialExistingCatalogSnapshot, but
// this offline bridge has no dependency on HttpClient, DI or network libraries.
public sealed record DholeOfficialExistingCatalogSnapshot(
    string Catalog, DateTimeOffset FetchedAtUtc, bool Stale,
    DholeCatalogItem[] Items);

public static class DholeOfficialManualCatalogResolution
{
    private static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(5);
    private static readonly string[] RequiredServiceCodes =
    [
        "INT_TRANSPORT", "CUSTOMS_CR", "CUSTOMS_FOREIGN", "STORAGE",
        "INVENTORY_CONTROL", "PACKING", "EXONERATION", "PICKING",
        "RECEPTION", "CARGO_INSURANCE", "DELIVERY", "PICKUP"
    ];
    private static readonly IReadOnlyDictionary<string, string> ServiceCodes =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Transporte internacional"] = "INT_TRANSPORT",
            ["Agencia de Aduanas CR"] = "CUSTOMS_CR",
            ["Agencia de Aduanas Exterior"] = "CUSTOMS_FOREIGN",
            ["Almacenamiento"] = "STORAGE",
            ["Control de inventario"] = "INVENTORY_CONTROL",
            ["Embalaje"] = "PACKING",
            ["Exoneración"] = "EXONERATION",
            ["Picking Carga"] = "PICKING",
            ["Recepción de carga"] = "RECEPTION",
            ["Seguro de carga"] = "CARGO_INSURANCE",
            ["Transporte entrega"] = "DELIVERY",
            ["Transporte recolección"] = "PICKUP"
        };
    private static readonly IReadOnlyDictionary<string, (string Kind, string Type)> LandKinds =
        new Dictionary<string, (string, string)>(StringComparer.Ordinal)
        {
            ["DRY_VAN"] = ("dry-van", "Furgón seco"),
            ["PLATFORM"] = ("platform", "Plataforma / Carreta"),
            ["REEFER"] = ("reefer", "Refrigerado"),
            ["CURTAIN_SIDE"] = ("curtain-side", "Furgón con cortina")
        };
    private static readonly string[] LandSizes = ["24", "26", "48", "53"];

    private static void Require([DoesNotReturnIf(false)] bool condition, string error)
    {
        if (!condition) throw new ArgumentException("Mapeo temporal Dhole: " + error);
    }

    private static string Text(JsonElement element, string key)
    {
        Require(element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(key, out var value) &&
            value.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(value.GetString()), "falta campo " + key);
        return element.GetProperty(key).GetString()!;
    }

    private static Guid Id(JsonElement item)
    {
        var text = Text(item, "id");
        Require(Guid.TryParseExact(text, "D", out var id) && id != Guid.Empty,
            "UUID de catálogo inválido");
        return Guid.Parse(text);
    }

    private static DateTimeOffset ParseUtc(string text)
    {
        Require(DateTimeOffset.TryParseExact(text, "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
            CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal,
            out var parsed) && parsed.Offset == TimeSpan.Zero,
            "fecha de exportación inválida");
        return parsed;
    }

    private static void Fresh(DateTimeOffset timestamp, DateTimeOffset now, string name)
    {
        Require(timestamp <= now && now - timestamp <= MaxAge,
            name + " no fue verificado en los últimos 5 minutos");
    }

    private static DholeOfficialExistingCatalogSnapshot Live(
        IReadOnlyDictionary<string, DholeOfficialExistingCatalogSnapshot> snapshots,
        string catalog, DateTimeOffset now)
    {
        Require(snapshots.TryGetValue(catalog, out var snapshot) &&
            snapshot is not null && snapshot.Catalog == catalog &&
            !snapshot.Stale && snapshot.Items is not null, catalog + " sin GET vigente");
        Fresh(snapshot!.FetchedAtUtc, now, catalog);
        return snapshot;
    }

    public static DholeOfficialCatalogResolution Review(
        DholeOfficialQuoteDraft draft, JsonElement manual,
        IReadOnlyDictionary<string, DholeOfficialExistingCatalogSnapshot> liveSnapshots, DateTime utcNow)
    {
        Require(utcNow.Kind == DateTimeKind.Utc && draft is not null &&
            manual.ValueKind == JsonValueKind.Object &&
            liveSnapshots is not null, "revisión inválida");
        var now = new DateTimeOffset(utcNow);
        Require(Text(manual, "source") == "temporary-internal-config-browser-export" &&
            manual.TryGetProperty("readyForRemotePost", out var allowed) &&
            allowed.ValueKind == JsonValueKind.False &&
            manual.TryGetProperty("noTransport", out var transport) &&
            transport.ValueKind == JsonValueKind.True, "exportación no apta");
        var reviewed = ParseUtc(Text(manual, "reviewedAtUtc"));
        var expires = ParseUtc(Text(manual, "expiresAtUtc"));
        Require(expires - reviewed == MaxAge, "caducidad alterada");
        Fresh(reviewed, now, "exportación manual");
        Require(now <= expires, "exportación manual vencida");
        Require(manual.TryGetProperty("snapshots", out var snapshots) &&
            snapshots.ValueKind == JsonValueKind.Object, "faltan grupos de catálogos");

        JsonElement Items(string key, int expected)
        {
            JsonElement items = default;
            Require(snapshots.TryGetProperty(key, out var snapshot) &&
                snapshot.ValueKind == JsonValueKind.Object &&
                Text(snapshot, "catalog") == key &&
                Text(snapshot, "provenance") ==
                    "manually-reviewed-internal-config-export-not-live-get" &&
                Text(snapshot, "fetchedAtUtc") == reviewed.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture) &&
                snapshot.TryGetProperty("stale", out var stale) &&
                stale.ValueKind == JsonValueKind.False &&
                snapshot.TryGetProperty("items", out items) &&
                items.ValueKind == JsonValueKind.Array && items.GetArrayLength() == expected,
                key + " incompleto o sin procedencia");
            return items;
        }

        return Resolve(draft, liveSnapshots, now, reviewed, Items);
    }

    // Separate source for real, authenticated published GETs. Never wrap live
    // data as a manual export or extend the timestamp of a browser snapshot.
    public static DholeOfficialCatalogResolution ReviewPublished(
        DholeOfficialQuoteDraft draft,
        IReadOnlyDictionary<string, DholeOfficialExistingCatalogSnapshot> snapshots,
        DateTime utcNow)
    {
        Require(draft is not null && snapshots is not null &&
            utcNow.Kind == DateTimeKind.Utc, "revisión publicada inválida");
        var now = new DateTimeOffset(utcNow);
        var services = Live(snapshots, "pricing-services", now);
        var earliest = services.FetchedAtUtc;
        if (draft.ShipmentMode == "Ftl")
        {
            var land = Live(snapshots, "land-equipment-types", now);
            if (land.FetchedAtUtc < earliest) earliest = land.FetchedAtUtc;
        }

        JsonElement Items(string key, int expected)
        {
            var snapshot = Live(snapshots, key, now);
            Require(snapshot.Items.Length == expected, key + " incompleto");
            return JsonSerializer.SerializeToElement(snapshot.Items.Select(x => new
            {
                id = x.Id, code = x.Code, name = x.Name, value = x.Value,
                isActive = x.IsActive, size = x.Size, kind = x.Kind
            }).ToArray());
        }
        return Resolve(draft, snapshots, now, earliest, Items);
    }

    // The explicitly enabled temporary deployment catalog may have an optional expiry.
    // Its entries are not live GET observations; preserve the real timestamps
    // for all route, Incoterm and equipment-size/type GETs.
    public static DholeOfficialCatalogResolution ReviewTemporary(
        DholeOfficialQuoteDraft draft,
        IReadOnlyDictionary<string, DholeOfficialExistingCatalogSnapshot> liveSnapshots,
        DateTime utcNow, DateTimeOffset? validUntilUtc)
    {
        Require(draft is not null && liveSnapshots is not null &&
            utcNow.Kind == DateTimeKind.Utc, "revisión temporal inválida");
        var now = new DateTimeOffset(utcNow);
        Require(DholeTemporaryDispatchCatalog.IsUsable(now, validUntilUtc),
            "catálogo temporal no autorizado o vencido");
        var oldestLive = Live(liveSnapshots, "incoterms", now).FetchedAtUtc;
        return Resolve(draft, liveSnapshots, now, oldestLive,
            DholeTemporaryDispatchCatalog.Items);
    }

    private static DholeOfficialCatalogResolution Resolve(
        DholeOfficialQuoteDraft draft,
        IReadOnlyDictionary<string, DholeOfficialExistingCatalogSnapshot> liveSnapshots,
        DateTimeOffset now, DateTimeOffset reviewed,
        Func<string, int, JsonElement> Items)
    {
        var services = Items("pricing-services", 12);
        var indexedServices = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var serviceIds = new HashSet<Guid>();
        foreach (var item in services.EnumerateArray())
        {
            var code = Text(item, "code");
            Require(RequiredServiceCodes.Contains(code, StringComparer.Ordinal) &&
                item.TryGetProperty("isActive", out var active) &&
                active.ValueKind == JsonValueKind.True &&
                indexedServices.TryAdd(code, item) && serviceIds.Add(Id(item)),
                "servicios inactivos, ambiguos o con UUID duplicado");
        }
        var selectedServices = new List<DholeOfficialServiceResolution>();
        foreach (var name in draft.Services)
        {
            JsonElement item = default;
            Require(ServiceCodes.TryGetValue(name, out var code) &&
                indexedServices.TryGetValue(code!, out item),
                "servicio sin correspondencia confirmada: " + name);
            selectedServices.Add(new(name, code!, Id(item), true));
        }

        var incoterms = Live(liveSnapshots, "incoterms", now).Items
            .Where(x => x.IsActive == true &&
                x.Value == draft.IncotermValue && Guid.TryParse(x.Id, out var v) &&
                v != Guid.Empty).ToArray();
        Require(incoterms.Length == 1, "Incoterm ambiguo o inactivo");
        var incotermId = Guid.Parse(incoterms[0].Id);

        var equipment = new List<DholeOfficialEquipmentResolution>();
        if (draft.ShipmentMode == "Fcl")
        {
            var sizes = Live(liveSnapshots, "container-sizes", now).Items;
            var types = Live(liveSnapshots, "container-types", now).Items;
            Require(sizes.All(x => x.IsActive != null) &&
                types.All(x => x.IsActive != null), "estado de catálogo FCL sin verificar");
            var projected = DholeEquipmentProjector.Project(sizes, types, []);
            foreach (var pair in draft.EquipmentUnits
                .Select(x => (x.Size, x.Type)).Distinct())
            {
                var matches = projected.FclCombinations.Where(x =>
                    x.SizeName == pair.Size && x.TypeName == pair.Type &&
                    Guid.TryParse(x.TypeExternalId, out var id) && id != Guid.Empty)
                    .ToArray();
                Require(matches.Length == 1, "tipo FCL sin UUID único verificado");
                var match = matches[0];
                equipment.Add(new("Fcl", pair.Size, pair.Type,
                    Guid.Parse(match.TypeExternalId), match.TypeName,
                    match.TypeCode, true));
            }
        }
        if (draft.ShipmentMode == "Ftl")
        {
            var trucks = Live(liveSnapshots, "truck-sizes", now).Items;
            var land = Items("land-equipment-types", 16);
            var indexedLand = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            var landIds = new HashSet<Guid>();
            foreach (var item in land.EnumerateArray())
            {
                var code = Text(item, "code");
                var size = Text(item, "size");
                var kind = Text(item, "kind");
                var expected = LandKinds.FirstOrDefault(x =>
                    code == size + "_" + x.Key &&
                    x.Value.Kind == kind && LandSizes.Contains(size, StringComparer.Ordinal));
                Require(!string.IsNullOrEmpty(expected.Key) &&
                    item.TryGetProperty("isActive", out var active) &&
                    active.ValueKind == JsonValueKind.True &&
                    indexedLand.TryAdd(code, item) && landIds.Add(Id(item)),
                    "tipo FTL inactivo, repetido o con metadatos contradictorios");
            }
            foreach (var pair in draft.EquipmentUnits.Select(x => (x.Size, x.Type)).Distinct())
            {
                var knownSizes = trucks.Where(x => x.IsActive == true &&
                    x.Name == pair.Size && LandSizes.Contains(x.Value, StringComparer.Ordinal))
                    .ToArray();
                Require(knownSizes.Length == 1, "tamaño FTL no vigente");
                Require(Guid.TryParseExact(knownSizes[0].Id, "D", out var sizeId) &&
                    sizeId != Guid.Empty && !landIds.Contains(sizeId) &&
                    knownSizes[0].Code == knownSizes[0].Value &&
                    trucks.Count(x => x.Id == knownSizes[0].Id) == 1 &&
                    trucks.Count(x => x.IsActive == true && x.Value == knownSizes[0].Value) == 1,
                    "UUID o código de tamaño FTL inválido o ambiguo");
                var kind = LandKinds.Where(x => x.Value.Type == pair.Type).ToArray();
                Require(kind.Length == 1, "tipo FTL desconocido");
                var code = knownSizes[0].Value + "_" + kind[0].Key;
                Require(indexedLand.TryGetValue(code, out var item),
                    "falta tipo FTL para el tamaño seleccionado");
                equipment.Add(new("Ftl", pair.Size, pair.Type, Id(item),
                    Text(item, "name"), code, true, sizeId));
            }
        }
        // Preserve the oldest timestamp of all relevant verified sources.
        var keys = new List<string> { "incoterms" };
        if (draft.ShipmentMode == "Fcl") keys.AddRange(["container-sizes", "container-types"]);
        if (draft.ShipmentMode == "Ftl") keys.Add("truck-sizes");
        var verifiedAt = keys.Select(key => Live(liveSnapshots, key, now).FetchedAtUtc)
            .Append(reviewed).Min();
        return new DholeOfficialCatalogResolution(
            verifiedAt.UtcDateTime, incotermId, draft.IncotermValue,
            selectedServices, equipment);
    }
}
