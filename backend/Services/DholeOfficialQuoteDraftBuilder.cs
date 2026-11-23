using CastroFallas.MiniQuote.Api.Models;

namespace CastroFallas.MiniQuote.Api.Services;

// Local-only projection of a freshly validated official web/GIO submission.
// This NEVER performs HTTP, reads a secret, changes Admin records or creates outbox jobs.
// A later connector must resolve current Dhole service, Incoterm and equipment UUIDs
// from trusted catalogs before constructing the published flat POST contract.
public sealed record DholeOfficialCargoUnit(
    string Description, int Quantity, string UnitType,
    decimal WeightKgPerUnit, decimal LengthCm, decimal WidthCm, decimal HeightCm,
    bool IsStackable);
public sealed record DholeOfficialEquipmentUnit(
    string Size, string Type, int Quantity, IReadOnlyList<decimal> UnitWeightsKg);
public sealed record DholeOfficialQuoteDraft(
    Guid OfficialQuoteId, string Mode, string ShipmentMode,
    Guid OriginId, Guid PoeId, Guid? PodId,
    string OriginName, string PoeName, string? PodName,
    string IncotermValue, DateOnly CargoReadyDate,
    IReadOnlyList<string> Services, string CargoDescriptionWithApplicant,
    IReadOnlyList<DholeOfficialCargoUnit> CargoUnits,
    IReadOnlyList<DholeOfficialEquipmentUnit> EquipmentUnits,
    decimal TotalWeightKg, int TotalPackages, bool NonStackable,
    IReadOnlyList<string> PendingCatalogResolutions,
    string? CabysCode = null, string? Observations = null,
    string? PickupAddress = null, string? DeliveryAddress = null,
    int? FiscalStorageDays = null, bool DangerousCargo = false,
    bool OverweightCargo = false, decimal? CargoValue = null,
    decimal? DeclaredWeight = null, int? DeclaredPackages = null,
    string? DestinationHandling = null, string? ExwCargoStatus = null,
    string? ExwPickupAddress = null, string? CargoCurrencyCode = null)
{
    // A draft is NOT a sendable request, even if all quantities are valid.
    public bool RemoteSubmissionPermitted => false;
}

public static class DholeOfficialQuoteDraftBuilder
{
    private const int MaxDescriptionLength = 4000;
    private static readonly HashSet<string> UnitTypes =
        new(StringComparer.Ordinal) { "Box", "Pallet", "Loose", "Other" };

    private static decimal Positive(decimal? value, string field)
    {
        if (value is null or <= 0)
            throw new ArgumentException("Dhole: " + field + " requiere un número positivo.");
        return value.Value;
    }

    private static decimal InKg(decimal weight, string unit) => unit switch
    {
        "kg" => weight,
        "lb" => weight * 0.45359237m,
        _ => throw new ArgumentException("Dhole: unidad de peso no compatible.")
    };

    private static decimal InCm(decimal length, string unit) => unit switch
    {
        "cm" => length,
        "m" => length * 100m,
        "in" => length * 2.54m,
        _ => throw new ArgumentException("Dhole: unidad de dimensiones no compatible.")
    };

    public static DholeOfficialQuoteDraft Project(
        OfficialQuoteSubmit input, Guid quoteId, DholeValidatedRoute route)
    {
        if (quoteId == Guid.Empty || input.CatalogSource != "dhole" ||
            !input.OriginLocationId.HasValue || input.OriginLocationId == Guid.Empty ||
            !input.DestinationLocationId.HasValue || input.DestinationLocationId == Guid.Empty ||
            string.IsNullOrWhiteSpace(route.OriginName) ||
            string.IsNullOrWhiteSpace(route.DestinationName))
            throw new ArgumentException("Dhole: falta identidad o ruta previamente verificada.");

        var shipment = (input.Mode, input.ShipmentType) switch
        {
            ("Maritime", "FCL") => "Fcl",
            ("Maritime", "LCL") => "Lcl",
            ("Air", "AIR_LCL") => "Air",
            ("Land", "FTL") => "Ftl",
            ("Land", "LTL") => "Ltl",
            _ => throw new ArgumentException("Dhole: modalidad y tipo de embarque inválidos.")
        };
        if (input.Mode == "Maritime" &&
            (input.PodLocationId is null || input.PodLocationId == Guid.Empty ||
             string.IsNullOrWhiteSpace(route.PodName)))
            throw new ArgumentException("Dhole: falta POD marítimo validado.");
        if (input.Mode != "Maritime" && input.PodLocationId != null)
            throw new ArgumentException("Dhole: POD incompatible con modalidad.");

        if (input.CargoReadyDate is null ||
            string.IsNullOrWhiteSpace(input.Incoterm) ||
            input.Services is not { Count: > 0 } ||
            string.IsNullOrWhiteSpace(input.CargoDescription) ||
            string.IsNullOrWhiteSpace(input.ContactName) ||
            string.IsNullOrWhiteSpace(input.ContactEmail) ||
            string.IsNullOrWhiteSpace(input.ContactPhone))
            throw new ArgumentException("Dhole: faltan datos de la solicitud oficial.");

        // The Dhole Gateway commercial names are locked. Keep requester's contacts
        // only in the description, with labels and without inventing any client ID.
        var contacts = new[] {
            "Nombre: " + input.ContactName.Trim(),
            "Correo: " + input.ContactEmail.Trim(),
            "Teléfono: " + input.ContactPhone.Trim()
        };
        if (contacts.Any(value => value.Any(char.IsControl)))
            throw new ArgumentException("Dhole: datos de contacto contienen caracteres no permitidos.");
        var description = input.CargoDescription.TrimEnd() +
            "\n\nSolicitante desde la web de Castro Fallas:\n" +
            string.Join("\n", contacts);
        if (description.Length > MaxDescriptionLength)
            throw new ArgumentException("Dhole: descripción con contacto excede 4000 caracteres.");

        List<DholeOfficialCargoUnit> cargo = [];
        List<DholeOfficialEquipmentUnit> equipment = [];
        decimal totalKg = 0m;
        int totalPackages = 0;
        bool full = shipment is "Fcl" or "Ftl";
        if (full)
        {
            if (input.Equipment is not { Count: > 0 } ||
                input.Packages is { Count: > 0 })
                throw new ArgumentException("Dhole: equipos incompatibles con la carga declarada.");
            foreach (var line in input.Equipment)
            {
                if (string.IsNullOrWhiteSpace(line.Size) ||
                    string.IsNullOrWhiteSpace(line.Type) ||
                    line.Quantity is not > 0 ||
                    line.UnitWeightsKg is not { Count: > 0 } weights ||
                    weights.Count != line.Quantity ||
                    weights.Any(weight => weight <= 0))
                    throw new ArgumentException("Dhole: equipo sin pesos por unidad.");
                equipment.Add(new(line.Size, line.Type, line.Quantity.Value,
                    weights.ToArray()));
                totalKg += weights.Sum();
            }
        }
        else
        {
            if (input.Packages is not { Count: > 0 } ||
                input.Equipment is { Count: > 0 })
                throw new ArgumentException("Dhole: falta la carga consolidada.");
            foreach (var line in input.Packages)
            {
                if (line.Quantity is not > 0 || string.IsNullOrWhiteSpace(line.Description) ||
                    line.UnitType is null || !UnitTypes.Contains(line.UnitType) ||
                    line.Stackability is not ("Stackable" or "NonStackable"))
                    throw new ArgumentException("Dhole: seleccioná tipo de unidad y estibabilidad.");
                var count = line.Quantity.Value;
                // The official wizard supplies TOTAL weight for each line. GIO's
                // per-package answer is converted to line total before persistence.
                var lineTotalKg = InKg(Positive(line.Weight, "peso"), input.WeightUnit ?? "");
                cargo.Add(new(
                    line.Description.Trim(), count, line.UnitType,
                    lineTotalKg / count,
                    InCm(Positive(line.Length, "largo"), input.DimensionUnit ?? ""),
                    InCm(Positive(line.Width, "ancho"), input.DimensionUnit ?? ""),
                    InCm(Positive(line.Height, "alto"), input.DimensionUnit ?? ""),
                    line.Stackability == "Stackable"));
                totalKg += lineTotalKg;
                checked { totalPackages += count; }
            }
        }

        var blockers = new List<string> { "incotermId: consultar UUID Dhole vigente",
            "serviceIds: consultar IDs del catálogo pricing-services mediante fuente autorizada" };
        if (full) blockers.Add("equipmentIds: resolver equipo/tamaño con identificadores vigentes");
        // Fields needing separate Pricing currency/handling contracts are kept
        // in the local draft and Administration but NEVER guessed for outbound.
        if (input.CargoValue is not null)
            blockers.Add("cargoValue: falta moneda y UUID de divisa verificados en Dhole");
        if (!string.IsNullOrWhiteSpace(input.DestinationHandling))
            blockers.Add("destinationHandling: falta mapear modalidad de manipulación publicada");
        if (input.DeclaredWeight is not null || input.DeclaredPackages is not null)
            blockers.Add("declaredFigures: revisar uso comercial antes de transportar");
        // This is a projection of the original Admin copy, never a replacement.
        return new DholeOfficialQuoteDraft(
            quoteId, input.Mode!, shipment,
            input.OriginLocationId!.Value, input.DestinationLocationId!.Value,
            input.PodLocationId, route.OriginName, route.DestinationName, route.PodName,
            input.Incoterm!, input.CargoReadyDate.Value, input.Services.ToArray(),
            description, cargo, equipment, totalKg, totalPackages,
            input.CargoFlags?.Contains("No estibable") == true ||
                cargo.Any(x => !x.IsStackable),
            blockers,
            CabysCode: input.CabysCode?.Trim(),
            Observations: input.Observations?.Trim(),
            PickupAddress: input.PickupAddress?.Trim(),
            DeliveryAddress: input.DeliveryAddress?.Trim(),
            FiscalStorageDays: input.FiscalStorageDays,
            DangerousCargo: input.CargoFlags?.Contains("Carga peligrosa") == true,
            OverweightCargo: input.CargoFlags?.Contains("Sobrepeso") == true,
            CargoValue: input.CargoValue,
            DeclaredWeight: input.DeclaredWeight,
            DeclaredPackages: input.DeclaredPackages,
            DestinationHandling: input.DestinationHandling,
            ExwCargoStatus: input.ExwCargoStatus,
            ExwPickupAddress: input.ExwPickupAddress,
            CargoCurrencyCode: input.CargoCurrencyCode);
    }
}
