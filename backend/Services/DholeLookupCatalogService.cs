using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CastroFallas.MiniQuote.Api.Services;

// Separate admin-only, read-only lookup. Never shares the catalogue key or
// enables Pricing POST. An explicit published endpoint and an independently
// scoped key are required for EACH catalogue.
public sealed record DholeLookupItem(
    string Id, string Code, string Name, string Value, bool? IsActive, string? Size, string? Kind);
public sealed record DholeLookupResult(
    string Catalog, DateTimeOffset FetchedAtUtc, bool Stale, DholeLookupItem[] Items);

public sealed class DholeLookupUnavailableException : Exception
{
    public DholeLookupUnavailableException() : base("Dhole lookup is not available.") { }
}

public sealed class DholeLookupCatalogService(
    IConfiguration configuration, IHttpClientFactory clients,
    ILogger<DholeLookupCatalogService> logger)
{
    private const int MaxBytes = 2 * 1024 * 1024;
    // Fail closed: no absolute URI, query, fragments, traversal, or dynamic host.
    private static readonly Regex PublishedPath = new(
        @"\Aapi/external/v1/[a-z0-9][a-z0-9-]{2,63}\z",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly IReadOnlyDictionary<string, string> CatalogPathSettings =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["pricing-services"] = "PricingServicesPath",
            ["land-equipment-types"] = "LandEquipmentTypesPath"
        };

    public bool Enabled => configuration.GetValue<bool>("DholeLookups:Enabled");
    public static bool IsKnownCatalog(string catalog) =>
        CatalogPathSettings.ContainsKey(catalog);

    private string? PathFor(string catalog)
    {
        if (!CatalogPathSettings.TryGetValue(catalog, out var setting)) return null;
        var path = configuration["DholeLookups:" + setting];
        return path is not null && PublishedPath.IsMatch(path) ? path : null;
    }

    public bool IsConfiguredFor(string catalog) =>
        Enabled && !string.IsNullOrWhiteSpace(configuration["DholeLookups:ApiKey"]) &&
        PathFor(catalog) is not null;

    public async Task<DholeLookupResult> GetAsync(string catalog, CancellationToken ct)
    {
        if (!IsKnownCatalog(catalog)) throw new ArgumentException("Unknown Dhole lookup.", nameof(catalog));
        if (!IsConfiguredFor(catalog)) throw new DholeLookupUnavailableException();

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, PathFor(catalog));
            request.Headers.Add("X-Api-Key", configuration["DholeLookups:ApiKey"]!.Trim());
            request.Headers.Accept.ParseAdd("application/json");

            using var response = await clients.CreateClient("DholeLookups")
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

            if (!response.IsSuccessStatusCode ||
                response.Content.Headers.ContentLength is > MaxBytes)
                throw new DholeLookupUnavailableException();

            await response.Content.LoadIntoBufferAsync(MaxBytes, ct);
            var items = DholeCatalogNormalizer.Parse(
                await response.Content.ReadAsStringAsync(ct));
            // The selected fields are sufficient for offline matching; do NOT
            // forward opaque Pricing metadata, context, or upstream JSON.
            var safe = items.Select(x => new DholeLookupItem(
                x.Id, x.Code, x.Name, x.Value, x.IsActive, x.Size, x.Kind)).ToArray();
            // This client has no stale-cache fallback: success means a fresh GET.
            return new DholeLookupResult(catalog, DateTimeOffset.UtcNow, false, safe);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested &&
            ex is (HttpRequestException or JsonException or IOException or
                InvalidDataException or InvalidOperationException or
                ArgumentException or OperationCanceledException or DholeLookupUnavailableException))
        {
            // Avoid logging raw upstream payloads, secrets, or personal data.
            logger.LogWarning("Dhole lookup {Catalog} could not be retrieved.", catalog);
            throw new DholeLookupUnavailableException();
        }
    }
}
