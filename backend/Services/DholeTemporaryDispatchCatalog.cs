using System.Text.Json;
using System.Globalization;

namespace CastroFallas.MiniQuote.Api.Services;

// Temporary server-side snapshot supplied by the project owner, November 2026.
// Catalog UUIDs are identifiers, not API credentials. Never exposed by the public form.
// Owner approved continued use without a mandatory calendar expiry on 2026-11-24.
// An optional operator-configured UTC expiry remains supported.
// Do not relabel this snapshot as live; replace it with authorized GETs when available.
internal static class DholeTemporaryDispatchCatalog
{
    private static readonly DateTimeOffset SnapshotDay = new(2026, 11, 24, 0, 0, 0, TimeSpan.Zero);
    public static bool IsUsable(DateTimeOffset now, DateTimeOffset? expires) =>
        now >= SnapshotDay && (expires is null ||
            (expires.Value.Offset == TimeSpan.Zero && now < expires.Value));

    // Empty is intentional indefinite validity, not an invalid timestamp.
    // A nonempty malformed or expired setting must still fail closed.
    public static bool TryReadValidity(string? text, DateTimeOffset now, out DateTimeOffset? expires)
    {
        expires = null;
        if (string.IsNullOrEmpty(text))
            return IsUsable(now, null);
        if (!DateTimeOffset.TryParseExact(text, "yyyy-MM-dd'T'HH:mm:ss'Z'",
            CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
            return false;
        expires = parsed;
        return IsUsable(now, expires);
    }

    private static readonly (string Id, string Code, string Name)[] Services =
    [
        ("c2300000-0000-4000-8000-000000000001", "INT_TRANSPORT", "Transporte Internacional"),
        ("c2300000-0000-4000-8000-000000000002", "CUSTOMS_CR", "Agencia de Aduanas CRC"),
        ("c2300000-0000-4000-8000-000000000003", "CUSTOMS_FOREIGN", "Agencia de Aduanas Exterior"),
        ("c2300000-0000-4000-8000-000000000004", "STORAGE", "Almacenamiento"),
        ("c2300000-0000-4000-8000-000000000005", "CARGO_INSURANCE", "Seguro de carga"),
        ("c2300000-0000-4000-8000-000000000006", "INVENTORY_CONTROL", "Control de inventario"),
        ("c2300000-0000-4000-8000-000000000007", "PICKING", "Picking cargas"),
        ("c2300000-0000-4000-8000-000000000008", "RECEPTION", "Recepción de carga"),
        ("c2300000-0000-4000-8000-000000000009", "PACKING", "Embalaje de carga"),
        ("c2300000-0000-4000-8000-000000000010", "EXONERATION", "Exoneración"),
        ("c2300000-0000-4000-8000-000000000011", "DELIVERY", "Transporte entrega"),
        ("c2300000-0000-4000-8000-000000000012", "PICKUP", "Transporte recolección")
    ];

    private static readonly (string Id, string Code, string Name, string Size, string Kind)[] Land =
    [
        ("c2140000-0000-4000-8000-000000000001", "24_DRY_VAN", "24 pies / 5 TON · Furgón seco", "24", "dry-van"),
        ("c2140000-0000-4000-8000-000000000002", "24_PLATFORM", "24 pies / 5 TON · Plataforma / Carreta", "24", "platform"),
        ("c2140000-0000-4000-8000-000000000003", "24_REEFER", "24 pies / 5 TON · Refrigerado", "24", "reefer"),
        ("c2140000-0000-4000-8000-000000000004", "24_CURTAIN_SIDE", "24 pies / 5 TON · Furgón con cortina", "24", "curtain-side"),
        ("c2140000-0000-4000-8000-000000000005", "26_DRY_VAN", "26 pies / 7 TON · Furgón seco", "26", "dry-van"),
        ("c2140000-0000-4000-8000-000000000006", "26_PLATFORM", "26 pies / 7 TON · Plataforma / Carreta", "26", "platform"),
        ("c2140000-0000-4000-8000-000000000007", "26_REEFER", "26 pies / 7 TON · Refrigerado", "26", "reefer"),
        ("c2140000-0000-4000-8000-000000000008", "26_CURTAIN_SIDE", "26 pies / 7 TON · Furgón con cortina", "26", "curtain-side"),
        ("c2130000-0000-4000-8000-000000000001", "48_DRY_VAN", "48 pies · Furgón seco", "48", "dry-van"),
        ("c2130000-0000-4000-8000-000000000002", "48_PLATFORM", "48 pies · Plataforma / Carreta", "48", "platform"),
        ("c2130000-0000-4000-8000-000000000003", "48_REEFER", "48 pies · Refrigerado", "48", "reefer"),
        ("c2130000-0000-4000-8000-000000000004", "48_CURTAIN_SIDE", "48 pies · Furgón con cortina", "48", "curtain-side"),
        ("c2130000-0000-4000-8000-000000000005", "53_DRY_VAN", "53 pies · Furgón seco", "53", "dry-van"),
        ("c2130000-0000-4000-8000-000000000006", "53_PLATFORM", "53 pies · Plataforma / Carreta", "53", "platform"),
        ("c2130000-0000-4000-8000-000000000007", "53_REEFER", "53 pies · Refrigerado", "53", "reefer"),
        ("c2130000-0000-4000-8000-000000000008", "53_CURTAIN_SIDE", "53 pies · Furgón con cortina", "53", "curtain-side")
    ];

    private static readonly IReadOnlyDictionary<string, Guid> Currencies =
        new Dictionary<string, Guid>(StringComparer.Ordinal)
        {
            ["USD"] = Guid.Parse("873e26af-62a3-4e8d-83ba-0aaca1470ac0"),
            ["CRC"] = Guid.Parse("e13c17e0-904f-4a13-bac7-041559f482fe"),
            ["EUR"] = Guid.Parse("39c1ff4c-3bb2-48ac-820c-8de95259fbd8")
        };

    // Catalog data only. Does not establish the commercial meaning of form_currencyId.
    public static Guid? CurrencyId(string? iso, DateTimeOffset now, DateTimeOffset? expires) =>
        IsUsable(now, expires) && iso is not null && Currencies.TryGetValue(iso, out var id)
            ? id : null;

    public static JsonElement Items(string group, int expected)
    {
        var result = group switch
        {
            "pricing-services" => JsonSerializer.SerializeToElement(Services.Select(x =>
                new { id = x.Id, code = x.Code, name = x.Name, isActive = true }).ToArray()),
            "land-equipment-types" => JsonSerializer.SerializeToElement(Land.Select(x =>
                new { id = x.Id, code = x.Code, name = x.Name, size = x.Size,
                    kind = x.Kind, isActive = true }).ToArray()),
            _ => throw new ArgumentException("Unknown temporary catalog.")
        };
        if (result.GetArrayLength() != expected)
            throw new ArgumentException("Incomplete temporary catalog.");
        return result;
    }
}
