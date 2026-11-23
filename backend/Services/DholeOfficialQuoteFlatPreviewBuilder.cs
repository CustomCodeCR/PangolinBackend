using System.Globalization;
using System.Text.Json;

namespace CastroFallas.MiniQuote.Api.Services;

// Contract review only. An authorized backend catalogue loader must create
// these resolutions from CURRENT and trusted Dhole catalogue responses.
// This preview never contacts Dhole, stores secrets, or hands data to a sender.
public sealed record DholeOfficialServiceResolution(
    string Name, string Code, Guid Id, bool IsActive);
public sealed record DholeOfficialEquipmentResolution(
    string ShipmentMode, string Size, string Type, Guid TypeId, string TypeName, string TypeCode);
public sealed record DholeOfficialCatalogResolution(
    DateTime VerifiedAtUtc, Guid IncotermId, string IncotermValue,
    IReadOnlyList<DholeOfficialServiceResolution> Services,
    IReadOnlyList<DholeOfficialEquipmentResolution> Equipment);
public sealed record DholeOfficialFlatReview(
    Guid OfficialQuoteId, string IdempotencyKey, JsonElement Body,
    IReadOnlyList<string> BlockingIssues)
{
    // A locally complete contract review is NOT permission for an external POST.
    // Unsupported commercial fields must be resolved, not silently dropped.
    public bool ReadyForContractReview => BlockingIssues.Count == 0;
    public bool RemoteSubmissionPermitted => false;
}

public static class DholeOfficialQuoteFlatPreviewBuilder
{
    private const decimal WeightToleranceKg = 0.00001m;
    // Stable Config/Pricing service codes; IDs MUST come from a currently
    // authorized catalogue snapshot, never from this map or a browser.
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
    private static readonly TimeSpan MaximumCatalogAge = TimeSpan.FromMinutes(15);

    private static string Required(string? text, string field)
    {
        if (string.IsNullOrWhiteSpace(text) || text != text.Trim())
            throw new ArgumentException("Dhole preview: campo no verificado: " + field);
        return text;
    }

    private static void CheckId(Guid id, string field)
    {
        if (id == Guid.Empty)
            throw new ArgumentException("Dhole preview: falta UUID de " + field);
    }

    public static DholeOfficialFlatReview BuildReview(
        DholeOfficialQuoteDraft draft, DholeOfficialCatalogResolution catalogs, DateTime nowUtc)
    {
        if (draft is null || catalogs is null || nowUtc.Kind != DateTimeKind.Utc ||
            catalogs.VerifiedAtUtc.Kind != DateTimeKind.Utc ||
            catalogs.VerifiedAtUtc > nowUtc.AddMinutes(1) ||
            nowUtc - catalogs.VerifiedAtUtc > MaximumCatalogAge)
            throw new ArgumentException("Dhole preview: catálogos no verificados recientemente en UTC.");

        CheckId(draft.OfficialQuoteId, "cotización");
        CheckId(draft.OriginId, "origen");
        CheckId(draft.PoeId, "POE");
        CheckId(catalogs.IncotermId, "Incoterm");
        Required(draft.OriginName, "origen");
        Required(draft.PoeName, "POE");
        Required(draft.CargoDescriptionWithApplicant, "descripción de mercancía y solicitante");
        if (!draft.CargoDescriptionWithApplicant.Contains(
                "\n\nSolicitante desde la web de Castro Fallas:\n", StringComparison.Ordinal))
            throw new ArgumentException("Dhole preview: falta identificación del solicitante.");

        var requiredMode = draft.ShipmentMode switch
        {
            "Fcl" or "Lcl" => "Maritime",
            "Air" => "Air",
            "Ftl" or "Ltl" => "Land",
            _ => throw new ArgumentException("Dhole preview: tipo de embarque inválido.")
        };
        if (draft.Mode != requiredMode)
            throw new ArgumentException("Dhole preview: modalidad incoherente.");
        var maritime = draft.Mode == "Maritime";
        if (maritime)
        {
            if (draft.PodId is null || draft.PodId == Guid.Empty)
                throw new ArgumentException("Dhole preview: falta POD marítimo.");
            Required(draft.PodName, "POD");
        }
        else if (draft.PodId is not null || draft.PodName is not null)
            throw new ArgumentException("Dhole preview: POD incompatible con modalidad.");

        if (catalogs.IncotermValue != draft.IncotermValue ||
            string.IsNullOrWhiteSpace(draft.IncotermValue))
            throw new ArgumentException("Dhole preview: Incoterm no coincide con catálogo.");
        if (draft.Services is not { Count: > 0 } || catalogs.Services is null ||
            draft.Services.Count != catalogs.Services.Count ||
            catalogs.Services.Any(s => s is null || s.IsActive != true ||
                string.IsNullOrWhiteSpace(s.Name) || string.IsNullOrWhiteSpace(s.Code) ||
                s.Id == Guid.Empty))
            throw new ArgumentException("Dhole preview: servicios sin resolución completa.");

        var serviceIds = new List<string>();
        var uniqueServiceIds = new HashSet<Guid>();
        var uniqueServiceNames = new HashSet<string>(StringComparer.Ordinal);
        foreach (var name in draft.Services)
        {
            if (!uniqueServiceNames.Add(name))
                throw new ArgumentException("Dhole preview: servicio repetido.");
            var found = catalogs.Services.Where(s => s.Name == name).ToArray();
            if (!ServiceCodes.TryGetValue(name, out var expectedCode) ||
                found.Length != 1 || found[0].Code != expectedCode ||
                !uniqueServiceIds.Add(found[0].Id))
                throw new ArgumentException("Dhole preview: servicio sin UUID único verificado.");
            serviceIds.Add(found[0].Id.ToString("D"));
        }

        var payload = new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["priority"] = "Green",
            ["shipmentMode"] = draft.ShipmentMode,
            ["originName"] = draft.OriginName,
            ["destinationName"] = draft.PoeName,
            ["poeId"] = draft.PoeId.ToString("D"),
            ["poeName"] = draft.PoeName,
            ["form_rateType"] = "Spot",
            ["form_modality"] = draft.Mode,
            ["form_shipmentMode"] = draft.ShipmentMode,
            ["form_originId"] = draft.OriginId.ToString("D"),
            ["form_destinationId"] = draft.PoeId.ToString("D"),
            ["form_incotermId"] = catalogs.IncotermId.ToString("D"),
            ["form_serviceIds"] = serviceIds,
            ["form_loadDate"] = draft.CargoReadyDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["form_cargoDescription"] = draft.CargoDescriptionWithApplicant,
            ["form_cargoWeightKg"] = draft.TotalWeightKg,
            ["form_nonStackable"] = draft.NonStackable,
            ["requestContext_incotermName"] = draft.IncotermValue,
            ["requestContext_poeId"] = draft.PoeId.ToString("D"),
            ["sellerContext_cargoReadyDate"] = draft.CargoReadyDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
        };
        // Preserves the user-provided business details already validated by
        // OfficialQuoteEndpoints. These published contract keys are optional:
        // never invent prices, a currency UUID, commercial identities or rate IDs.
        if (!string.IsNullOrWhiteSpace(draft.CabysCode))
            payload["form_cabysCode"] = draft.CabysCode;
        if (!string.IsNullOrWhiteSpace(draft.Observations))
            payload["form_cargoObservations"] = draft.Observations;
        if (draft.FiscalStorageDays is > 0)
            payload["form_storageDays"] = draft.FiscalStorageDays;
        if (draft.DangerousCargo)
            payload["form_dangerousCargo"] = true;
        if (draft.OverweightCargo)
            payload["form_overweight"] = true;
        var effectivePickupAddress = !string.IsNullOrWhiteSpace(draft.PickupAddress)
            ? draft.PickupAddress : draft.ExwPickupAddress;
        if (!string.IsNullOrWhiteSpace(effectivePickupAddress))
            payload["form_pickupAddress"] = effectivePickupAddress;
        if (!string.IsNullOrWhiteSpace(draft.DeliveryAddress))
            payload["form_inlandDeliveryLocation_address"] = draft.DeliveryAddress;

        if (maritime)
        {
            payload["podId"] = draft.PodId!.Value.ToString("D");
            payload["podName"] = draft.PodName;
            payload["form_podId"] = draft.PodId.Value.ToString("D");
            payload["requestContext_podId"] = draft.PodId.Value.ToString("D");
        }

        var full = draft.ShipmentMode is "Fcl" or "Ftl";
        if (full)
        {
            if (draft.EquipmentUnits is not { Count: > 0 } || draft.CargoUnits.Count != 0 ||
                catalogs.Equipment is null)
                throw new ArgumentException("Dhole preview: faltan equipos completos.");
            var mapping = catalogs.Equipment;
            var pairs = draft.EquipmentUnits
                .Select(e => (e.Size, e.Type)).Distinct().ToArray();
            if (mapping.Count != pairs.Length ||
                mapping.Any(e => e is null || e.ShipmentMode != draft.ShipmentMode ||
                    e.TypeId == Guid.Empty ||
                    string.IsNullOrWhiteSpace(e.TypeName) || string.IsNullOrWhiteSpace(e.TypeCode)) ||
                mapping.Select(e => (e.Size, e.Type)).Distinct().Count() != mapping.Count)
                throw new ArgumentException("Dhole preview: resolución de tipos de equipo inválida.");
            var items = new List<Dictionary<string, object?>>();
            decimal weightSum = 0;
            foreach (var unit in draft.EquipmentUnits)
            {
                if (unit.Quantity < 1 || unit.UnitWeightsKg.Count != unit.Quantity ||
                    unit.UnitWeightsKg.Any(w => w <= 0))
                    throw new ArgumentException("Dhole preview: pesos de equipos inválidos.");
                var found = mapping.Where(e => e.Size == unit.Size && e.Type == unit.Type).ToArray();
                if (found.Length != 1)
                    throw new ArgumentException("Dhole preview: tamaño/tipo no corresponde al UUID verificado.");
                weightSum += unit.UnitWeightsKg.Sum();
                items.Add(new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["containerTypeId"] = found[0].TypeId.ToString("D"),
                    ["containerTypeName"] = found[0].TypeName,
                    ["containerTypeCode"] = found[0].TypeCode,
                    ["quantity"] = unit.Quantity,
                    ["unitWeightsKg"] = unit.UnitWeightsKg
                });
            }
            if (Math.Abs(weightSum - draft.TotalWeightKg) > WeightToleranceKg)
                throw new ArgumentException("Dhole preview: peso de equipos no coincide.");
            payload[draft.ShipmentMode == "Fcl" ? "form_fclContainers" : "form_landContainers"] = items;
        }
        else
        {
            if (draft.EquipmentUnits.Count != 0 ||
                draft.CargoUnits is not { Count: > 0 } || catalogs.Equipment is not { Count: 0 })
                throw new ArgumentException("Dhole preview: consolidado incompatible con equipos.");
            var items = new List<Dictionary<string, object?>>();
            int packageCount = 0;
            decimal weightSum = 0;
            foreach (var line in draft.CargoUnits)
            {
                if (line.Quantity < 1 ||
                    line.UnitType is not ("Box" or "Pallet" or "Loose" or "Other") ||
                    string.IsNullOrWhiteSpace(line.Description) ||
                    line.WeightKgPerUnit <= 0 ||
                    line.LengthCm <= 0 || line.WidthCm <= 0 || line.HeightCm <= 0)
                    throw new ArgumentException("Dhole preview: línea consolidada inválida.");
                checked { packageCount += line.Quantity; }
                weightSum += line.WeightKgPerUnit * line.Quantity;
                items.Add(new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["description"] = line.Description,
                    ["quantity"] = line.Quantity,
                    ["unitType"] = line.UnitType,
                    ["weightKg"] = line.WeightKgPerUnit,
                    ["length"] = line.LengthCm,
                    ["width"] = line.WidthCm,
                    ["height"] = line.HeightCm,
                    ["isStackable"] = line.IsStackable
                });
            }
            if (packageCount != draft.TotalPackages ||
                Math.Abs(weightSum - draft.TotalWeightKg) > WeightToleranceKg)
                throw new ArgumentException("Dhole preview: suma de bultos/pesos inconsistente.");
            payload["form_cargoPackages"] = packageCount;
            payload["sellerContext_consolidatedCargoLines"] = items;
        }
        // The preview deliberately excludes fixed Dhole identities, sellerUserId,
        // money without verified currency, and all unpublished API fields.
        // The published Gateway schema contains many optional Pricing fields.
        // If the original request has extra commercial information that we have
        // not resolved from an authorized catalog, the review is BLOCKED even
        // though the safe, partial JSON preview can still be inspected offline.
        var unresolved = draft.PendingCatalogResolutions.Where(x =>
            x.StartsWith("cargoValue:", StringComparison.Ordinal) ||
            x.StartsWith("destinationHandling:", StringComparison.Ordinal) ||
            x.StartsWith("declaredFigures:", StringComparison.Ordinal)).ToArray();
        return new DholeOfficialFlatReview(
            draft.OfficialQuoteId,
            "cf-official-" + draft.OfficialQuoteId.ToString("D"),
            JsonSerializer.SerializeToElement(payload),
            unresolved);
    }
}
