using System.Text.Json;
using System.Globalization;
using Microsoft.Extensions.Configuration;
using CastroFallas.MiniQuote.Api.Models;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Server-only preparation using authorized GETs and an explicitly selected
/// short-lived temporary catalog. No POST, implicit fallback or worker registration.
/// Missing, stale or expired data fails closed.
/// </summary>
public sealed class DholeOfficialPublishedDispatchSource(
    DholeQuoteFormCatalogLoader forms,
    DholeLookupCatalogService lookups,
    IConfiguration configuration)
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);
    private bool UseTemporary => configuration.GetValue<bool>("DholeSubmission:TemporaryCatalogsEnabled");

    private DateTimeOffset? TemporaryExpiry()
    {
        var text = configuration["DholeSubmission:TemporaryCatalogsValidUntilUtc"];
        return DateTimeOffset.TryParseExact(text, "yyyy-MM-dd'T'HH:mm:ss'Z'",
            CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var expires)
            && DholeTemporaryDispatchCatalog.IsUsable(DateTimeOffset.UtcNow, expires)
            ? expires : null;
    }

    public bool IsConfiguredFor(string shipmentType) => UseTemporary
        ? TemporaryExpiry() is not null
        : lookups.IsConfiguredFor("pricing-services") &&
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

        var useTemporary = UseTemporary;
        var expiry = useTemporary ? TemporaryExpiry() : null;
        if (useTemporary && expiry is null) throw new DholeLookupUnavailableException();
        var catalogJob = forms.LoadFreshWithSnapshotsAsync(form.Mode, form.ShipmentType, ct);
        string[] keys = useTemporary ? [] : form.ShipmentType == "FTL"
            ? ["pricing-services", "land-equipment-types"]
            : ["pricing-services"];
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

        if (useTemporary != UseTemporary ||
            (useTemporary && TemporaryExpiry() != expiry))
            throw new DholeLookupUnavailableException();
        return useTemporary
            ? DholeOfficialDispatchPreflight.ReviewSavedQuoteWithTemporaryCatalogs(
                savedQuote, route, all, now, expiry!.Value)
            : DholeOfficialDispatchPreflight.ReviewSavedQuoteWithPublishedCatalogs(
                savedQuote, route, all, now);
    }
}
