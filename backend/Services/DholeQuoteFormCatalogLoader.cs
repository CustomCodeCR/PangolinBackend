namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Loads a mutually consistent, fresh read-only view for both the public form
/// and the eventual Dhole-backed quote submission. Never uses stale data for
/// an operation that can create a quote.
/// </summary>
public sealed class DholeQuoteFormCatalogLoader(DholeCatalogService catalogs)
{
    public async Task<DholeQuoteFormCatalog> LoadFreshAsync(
        string mode, string shipmentType, CancellationToken ct) =>
        (await LoadFreshWithSnapshotsAsync(mode, shipmentType, ct)).Catalog;

    // Reuse the same route/equipment reads for server-only dispatch preflight.
    // The original timestamps are retained, not replaced with the review time.
    public async Task<(DholeQuoteFormCatalog Catalog, DholeCatalogSnapshot[] Snapshots)>
        LoadFreshWithSnapshotsAsync(string mode, string shipmentType, CancellationToken ct)
    {
        if ((mode, shipmentType) is not
            (("Maritime", "FCL") or ("Maritime", "LCL") or
             ("Air", "AIR_LCL") or ("Land", "FTL") or ("Land", "LTL")))
            throw new ArgumentException("Modalidad y embarque inválidos.");

        var keys = new List<string> { "incoterms", "pol", "poe" };
        if (mode == "Maritime") keys.Add("pod");
        if (shipmentType == "FCL")
        {
            keys.Add("container-sizes");
            keys.Add("container-types");
        }
        if (shipmentType == "FTL") keys.Add("truck-sizes");

        var jobs = keys.Select(key => catalogs.GetAsync(key, ct)).ToArray();
        var snapshots = await Task.WhenAll(jobs);
        if (snapshots.Any(x => x.Stale))
            throw new DholeCatalogUnavailableException();

        var byName = snapshots.ToDictionary(x => x.Catalog, x => x.Items, StringComparer.Ordinal);
        static DholeCatalogItem[] Get(Dictionary<string, DholeCatalogItem[]> map, string key) =>
            map.TryGetValue(key, out var items) ? items : [];

        var result = DholeQuoteFormCatalogBuilder.Build(
            mode, shipmentType,
            Get(byName, "incoterms"), Get(byName, "pol"), Get(byName, "poe"),
            Get(byName, "pod"), Get(byName, "container-sizes"),
            Get(byName, "container-types"), Get(byName, "truck-sizes"));

        // Fail closed on missing critical fields instead of resurrecting local
        // options (which Dhole may have removed).
        if (result.Incoterms.Length == 0 ||
            result.Origins.Length == 0 || result.Destinations.Length == 0 ||
            (mode == "Maritime" && result.Pods.Length == 0) ||
            (shipmentType is "FCL" or "FTL" && result.EquipmentSizes.Length == 0))
            throw new DholeCatalogUnavailableException();

        return (result, snapshots);
    }
}
