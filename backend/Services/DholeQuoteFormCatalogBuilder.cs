using CastroFallas.MiniQuote.Api.Models;

namespace CastroFallas.MiniQuote.Api.Services;

// A single reviewed, read-only projection can be consumed by both the wizard
// and HTTP submission validation. External UUIDs remain external and are never
// mapped by name onto legacy OfficialQuoteLocation IDs.
public sealed record DholeFormLocation(Guid Id, string DisplayName, string Code);
public sealed record DholeFormEquipmentSize(string Value, string Label);

public sealed record DholeQuoteFormCatalog(
    string Source,
    string Mode,
    string ShipmentType,
    string[] Incoterms,
    DholeFormLocation[] Origins,
    DholeFormLocation[] Destinations,
    DholeFormLocation[] Pods,
    DholeFormEquipmentSize[] EquipmentSizes,
    Dictionary<string, string[]> EquipmentTypesBySize);

public sealed record DholeValidatedRoute(string OriginName, string DestinationName, string? PodName);

public static class DholeQuoteFormCatalogBuilder
{
    public static DholeQuoteFormCatalog Build(
        string mode,
        string shipmentType,
        IReadOnlyList<DholeCatalogItem> incoterms,
        IReadOnlyList<DholeCatalogItem> pol,
        IReadOnlyList<DholeCatalogItem> poe,
        IReadOnlyList<DholeCatalogItem> pod,
        IReadOnlyList<DholeCatalogItem> containerSizes,
        IReadOnlyList<DholeCatalogItem> containerTypes,
        IReadOnlyList<DholeCatalogItem> truckSizes)
    {
        bool validPair = (mode, shipmentType) switch
        {
            ("Maritime", "FCL" or "LCL") => true,
            ("Air", "AIR_LCL") => true,
            ("Land", "FTL" or "LTL") => true,
            _ => false
        };
        if (!validPair) throw new ArgumentException("Modalidad y embarque inválidos.");

        var incotermValues = incoterms
            .Where(x => x.IsActive != false)
            .Select(x => x.Value)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var origins = DholeQuoteLocationProjector.Project("origin", mode, pol).Options;
        var destinations = DholeQuoteLocationProjector.Project("destination", mode, poe).Options;
        var pods = mode == "Maritime"
            ? DholeQuoteLocationProjector.Project("pod", mode, pod).Options
            : [];

        var sizes = Array.Empty<DholeFormEquipmentSize>();
        var typesBySize = new Dictionary<string, string[]>(StringComparer.Ordinal);

        if (shipmentType == "FCL")
        {
            var equipment = DholeEquipmentProjector.Project(
                containerSizes, containerTypes, Array.Empty<DholeCatalogItem>());
            sizes = equipment.FclCombinations
                .GroupBy(x => x.SizeName, StringComparer.Ordinal)
                .Select(g => new DholeFormEquipmentSize(g.Key, g.Key))
                .ToArray();
            foreach (var size in sizes)
            {
                typesBySize[size.Value] = equipment.FclCombinations
                    .Where(x => x.SizeName == size.Value)
                    .Select(x => x.TypeName)
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();
            }
        }
        else if (shipmentType == "FTL")
        {
            var equipment = DholeEquipmentProjector.Project(
                Array.Empty<DholeCatalogItem>(), Array.Empty<DholeCatalogItem>(), truckSizes);
            sizes = equipment.FtlSizes
                .Select(x => new DholeFormEquipmentSize(x.Name, x.Name))
                .ToArray();
            foreach (var size in sizes)
                typesBySize[size.Value] = ["Furgón"];
        }

        return new DholeQuoteFormCatalog(
            "dhole", mode, shipmentType, incotermValues,
            ProjectLocations(origins),
            ProjectLocations(destinations),
            ProjectLocations(pods),
            sizes, typesBySize);
    }

    private static DholeFormLocation[] ProjectLocations(IEnumerable<DholeQuoteLocationOption> options) =>
        options.Select(x => new DholeFormLocation(
            Guid.Parse(x.ExternalId), x.Name, x.Code)).ToArray();
}

public static class DholeQuoteSelectionValidator
{
    public static DholeValidatedRoute Validate(OfficialQuoteSubmit input, DholeQuoteFormCatalog catalog)
    {
        if (input.CatalogSource != "dhole" ||
            input.Mode != catalog.Mode || input.ShipmentType != catalog.ShipmentType)
            throw new ArgumentException("La fuente o modalidad de cotización no coincide.");

        if (string.IsNullOrWhiteSpace(input.Incoterm) ||
            !catalog.Incoterms.Contains(input.Incoterm, StringComparer.Ordinal))
            throw new ArgumentException("Seleccioná un Incoterm vigente de Dhole.");

        var origin = catalog.Origins.SingleOrDefault(x => x.Id == input.OriginLocationId);
        var destination = catalog.Destinations.SingleOrDefault(x => x.Id == input.DestinationLocationId);
        if (origin is null || destination is null)
            throw new ArgumentException("Seleccioná ubicaciones vigentes de Dhole para esta ruta.");
        // Existing official_quote_requests columns are VARCHAR(180). Validate
        // upstream labels rather than silently truncating official place names.
        if (origin.DisplayName.Length > 180 || destination.DisplayName.Length > 180)
            throw new ArgumentException("Una ubicación de Dhole excede la longitud admitida para solicitudes.");

        var pod = input.PodLocationId.HasValue
            ? catalog.Pods.SingleOrDefault(x => x.Id == input.PodLocationId.Value)
            : null;
        if (input.PodLocationId.HasValue && pod is null)
            throw new ArgumentException("El POD seleccionado no está habilitado en Dhole.");

        if (input.ShipmentType is "FCL" or "FTL")
        {
            foreach (var line in input.Equipment ?? [])
            {
                if (string.IsNullOrWhiteSpace(line.Size) ||
                    string.IsNullOrWhiteSpace(line.Type) ||
                    !catalog.EquipmentTypesBySize.TryGetValue(line.Size, out var allowedTypes) ||
                    !allowedTypes.Contains(line.Type, StringComparer.Ordinal))
                    throw new ArgumentException("La combinación de equipo ya no está habilitada en Dhole.");
            }
        }

        return new DholeValidatedRoute(origin.DisplayName, destination.DisplayName, pod?.DisplayName);
    }
}
