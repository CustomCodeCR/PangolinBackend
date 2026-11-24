using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using CastroFallas.MiniQuote.Api.Models;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Server-only preparation using authorized GETs and an explicitly selected
/// temporary catalog with optional expiry. No POST or implicit fallback.
/// Missing or stale live data and invalid configured expiry fail closed.
/// </summary>
public sealed class DholeOfficialPublishedDispatchSource(
    DholeQuoteFormCatalogLoader forms,
    DholeLookupCatalogService lookups,
    IConfiguration configuration)
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);
    private bool UseTemporary => configuration.GetValue<bool>("DholeSubmission:TemporaryCatalogsEnabled");

    private bool TryTemporaryValidity(out DateTimeOffset? expiry) =>
        DholeTemporaryDispatchCatalog.TryReadValidity(
            configuration["DholeSubmission:TemporaryCatalogsValidUntilUtc"],
            DateTimeOffset.UtcNow, out expiry);

    public bool IsConfiguredFor(string shipmentType) => UseTemporary
        ? TryTemporaryValidity(out _)
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
        DateTimeOffset? expiry = null;
        if (useTemporary && !TryTemporaryValidity(out expiry))
            throw new DholeLookupUnavailableException();
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
            (useTemporary && (!TryTemporaryValidity(out var currentExpiry) || currentExpiry != expiry)))
            throw new DholeLookupUnavailableException();
        var manualCommercialReview = configuration.GetValue<bool>(
            "DholeSubmission:ManualCommercialReviewEnabled");
        var review = useTemporary
            ? DholeOfficialDispatchPreflight.ReviewSavedQuoteWithTemporaryCatalogs(
                savedQuote, route, all, now, expiry, manualCommercialReview)
            : DholeOfficialDispatchPreflight.ReviewSavedQuoteWithPublishedCatalogs(
                savedQuote, route, all, now, manualCommercialReview);

        if (!configuration.GetValue<bool>("DholeSubmission:CurrencyPilotEnabled"))
            return review;
        // Only a persisted synthetic LCL quote with explicit operator scope,
        // controlled email and a fresh bounded temporary catalog may carry money.
        if (!useTemporary || expiry is null || !manualCommercialReview ||
            !DholeQuotePostTransport.IsCurrencyPilotScope(configuration, savedQuote.Id) ||
            !string.Equals(form.ContactEmail, configuration["DholeSubmission:CurrencyPilotContactEmail"], StringComparison.Ordinal) ||
            form.CargoValue is not decimal amount ||
            DholeTemporaryDispatchCatalog.CurrencyId(form.CargoCurrencyCode, now, expiry) is not Guid currencyId ||
            !DholeTemporaryDispatchCatalog.IsCurrencyPilotPair(currencyId, amount))
            throw new ArgumentException("Currency pilot scope or controlled amount invalid.");
        var body = JsonNode.Parse(review.Body.GetRawText())!.AsObject();
        body["form_cargoValue"] = amount;
        body["form_currencyId"] = currencyId.ToString("D");
        var pilotReview = review with { Body = JsonSerializer.SerializeToElement(body) };
        if (!DholeQuotePostTransport.IsValidForQuote(configuration, savedQuote.Id, pilotReview.Body))
            throw new ArgumentException("Currency pilot payload invalid.");
        return pilotReview;
    }
}
