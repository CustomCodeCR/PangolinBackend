using System.Text.Json;
using CastroFallas.MiniQuote.Api.Models;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Server-only preparation using published, authorized GETs. No POST, no
/// manual-export fallback and no worker registration. Paths and read credentials
/// must be configured by the operator; missing or stale catalogs fail closed.
/// </summary>
public sealed class DholeOfficialPublishedDispatchSource(
    DholeQuoteFormCatalogLoader forms,
    DholeLookupCatalogService lookups)
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);
    public bool IsConfiguredFor(string shipmentType) =>
        lookups.IsConfiguredFor("pricing-services") &&
        (shipmentType != "FTL" || lookups.IsConfiguredFor("land-equipment-types"));

    public async Task<DholeOfficialFlatReview> ReviewAsync(
        OfficialQuoteRequest savedQuote, CancellationToken ct)
    {
        if (savedQuote.Id == Guid.Empty || string.IsNullOrWhiteSpace(savedQuote.FormJson) ||
            savedQuote.FormJson.Length > 128 * 1024)
            throw new ArgumentException("Invalid saved quote.");
        var form = JsonSerializer.Deserialize<OfficialQuoteSubmit>(savedQuote.FormJson, WebJson)
            ?? throw new ArgumentException("Invalid saved quote.");
        if (form.CatalogSource != "dhole" || form.Mode != savedQuote.Mode ||
            form.ShipmentType != savedQuote.ShipmentType)
            throw new ArgumentException("Invalid saved quote source.");
        if (!IsConfiguredFor(form.ShipmentType))
            throw new DholeLookupUnavailableException();

        var catalogJob = forms.LoadFreshWithSnapshotsAsync(form.Mode, form.ShipmentType, ct);
        var keys = form.ShipmentType == "FTL"
            ? new[] { "pricing-services", "land-equipment-types" }
            : new[] { "pricing-services" };
        var lookupJob = Task.WhenAll(keys.Select(key => lookups.GetAsync(key, ct)));
        await Task.WhenAll(catalogJob, lookupJob);
        var (catalog, snapshots) = await catalogJob;
        var route = DholeQuoteSelectionValidator.Validate(form, catalog);
        var all = snapshots.ToDictionary(s => s.Catalog,
            s => new DholeOfficialExistingCatalogSnapshot(s.Catalog, s.FetchedAtUtc, s.Stale, s.Items),
            StringComparer.Ordinal);
        foreach (var lookup in await lookupJob)
        {
            all.Add(lookup.Catalog, new(lookup.Catalog, lookup.FetchedAtUtc, lookup.Stale,
                lookup.Items.Select(x => new DholeCatalogItem(x.Id, x.Code, x.Name, x.Value,
                    x.IsActive, 0, null, null, null, null, x.Size, x.Kind,
                    null, null, [], [])).ToArray()));
        }
        var now = DateTime.UtcNow;
        if (all.Values.Any(x => x.Stale || x.FetchedAtUtc > now ||
            now - x.FetchedAtUtc > TimeSpan.FromMinutes(5)))
            throw new DholeCatalogUnavailableException();

        return DholeOfficialDispatchPreflight.ReviewSavedQuoteWithPublishedCatalogs(
            savedQuote, route, all, now);
    }
}
