using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CastroFallas.MiniQuote.Api.Services;

public sealed record DholeCatalogSnapshot(
    string Catalog,
    DateTimeOffset FetchedAtUtc,
    bool Stale,
    DholeCatalogItem[] Items);

public sealed class DholeCatalogUnavailableException : Exception
{
    public DholeCatalogUnavailableException() : base("Dhole catalogue unavailable.") { }
}

/// <summary>
/// Server-only read-only client. URLs are allowlisted, the external API key stays
/// in IConfiguration, and public consumers receive normalized data, never raw JSON.
/// No quote, tariff or other Dhole write methods are called.
/// </summary>
public sealed class DholeCatalogService(
    IConfiguration config,
    IHttpClientFactory clientFactory,
    IMemoryCache cache,
    ILogger<DholeCatalogService> logger)
{
    private const int MaximumResponseBytes = 4 * 1024 * 1024;
    private static readonly TimeSpan FreshFor = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan StaleFor = TimeSpan.FromHours(1);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _gates = new();

    private static readonly IReadOnlyDictionary<string, string> Paths =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["incoterms"] = "api/external/v1/incoterms-wi15gr9",
            ["pod"] = "api/external/v1/pod-puerto-de-destino-wi14v6w",
            ["poe"] = "api/external/v1/poe-puerto-de-entrada-wi14b3j",
            ["pol"] = "api/external/v1/pol-puerto-de-origen-wi11hg7",
            ["container-sizes"] = "api/external/v1/tamano-de-contenedor-wja5k6l",
            ["container-types"] = "api/external/v1/tipo-de-contenedor-wja62r8",
            ["truck-sizes"] = "api/external/v1/tamano-de-furgon-wja6f0k"
        };

    public static bool IsKnownCatalog(string catalog) => Paths.ContainsKey(catalog);

    // Opt-in: the first deployment of this feature cannot change existing traffic.
    public bool IsConfigured =>
        config.GetValue<bool>("DholeCatalogs:Enabled") &&
        !string.IsNullOrWhiteSpace(config["DholeCatalogs:ApiKey"]);

    public async Task<DholeCatalogSnapshot> GetAsync(string catalog, CancellationToken ct)
    {
        if (!IsKnownCatalog(catalog)) throw new ArgumentException("Unknown catalog.", nameof(catalog));
        if (!IsConfigured) throw new DholeCatalogUnavailableException();

        var freshKey = "dhole-catalog:fresh:" + catalog;
        var staleKey = "dhole-catalog:stale:" + catalog;
        var retryKey = "dhole-catalog:retry:" + catalog;
        if (cache.TryGetValue<DholeCatalogSnapshot>(freshKey, out var fresh) && fresh is not null)
            return fresh;
        // Limit failed refreshes as well as successful ones; avoid bursts after outages.
        if (cache.TryGetValue<bool>(retryKey, out var retryBlocked) && retryBlocked)
        {
            if (cache.TryGetValue<DholeCatalogSnapshot>(staleKey, out var previous) && previous is not null)
                return previous with { Stale = true };
            throw new DholeCatalogUnavailableException();
        }

        var gate = _gates.GetOrAdd(catalog, static _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            if (cache.TryGetValue<DholeCatalogSnapshot>(freshKey, out fresh) && fresh is not null)
                return fresh;
            if (cache.TryGetValue<bool>(retryKey, out retryBlocked) && retryBlocked)
            {
                if (cache.TryGetValue<DholeCatalogSnapshot>(staleKey, out var previous) && previous is not null)
                    return previous with { Stale = true };
                throw new DholeCatalogUnavailableException();
            }

            try
            {
                // Never accept an upstream URL or path supplied by the browser.
                using var request = new HttpRequestMessage(HttpMethod.Get, Paths[catalog]);
                request.Headers.Add("X-Api-Key", config["DholeCatalogs:ApiKey"]!.Trim());

                using var response = await clientFactory.CreateClient("DholeCatalogs")
                    .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

                if (!response.IsSuccessStatusCode)
                    throw new DholeCatalogUnavailableException();

                await response.Content.LoadIntoBufferAsync(MaximumResponseBytes, ct);
                var json = await response.Content.ReadAsStringAsync(ct);
                var items = DholeCatalogNormalizer.Parse(json);

                var snapshot = new DholeCatalogSnapshot(catalog, DateTimeOffset.UtcNow, false, items);
                cache.Set(freshKey, snapshot, FreshFor);
                cache.Set(staleKey, snapshot, StaleFor);
                cache.Remove(retryKey);
                return snapshot;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested && ex is
                       (DholeCatalogUnavailableException or HttpRequestException or
                        JsonException or InvalidDataException or IOException or
                        InvalidOperationException or ArgumentException or OperationCanceledException))
            {
                cache.Set(retryKey, true, TimeSpan.FromSeconds(30));
                // Do not log the exception: headers and remote request details can contain credentials.
                logger.LogWarning("Dhole catalogue {Catalog} refresh failed.", catalog);
                if (cache.TryGetValue<DholeCatalogSnapshot>(staleKey, out var previous) && previous is not null)
                    return previous with { Stale = true };

                throw new DholeCatalogUnavailableException();
            }
        }
        finally
        {
            gate.Release();
        }
    }
}
