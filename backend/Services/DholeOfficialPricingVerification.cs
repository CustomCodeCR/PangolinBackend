using System.Text.Json;
using System.Text.RegularExpressions;
using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Independent, GET-only verification of a stored provider receipt. Not
/// registered as a worker. Requires a separately published, restricted
/// Pricing detail endpoint and a read-only key. Does not retry a POST.
/// </summary>
public sealed class DholeOfficialPricingVerification(
    IConfiguration config, IHttpClientFactory clients)
{
    private static readonly Regex PathFormat = new(
        @"\Aapi/external/v1/[a-z0-9][a-z0-9-]{2,63}\z", RegexOptions.CultureInvariant);
    private static readonly Regex KeyFormat = new(
        @"\Adh_ext_[a-fA-F0-9]{64}\z", RegexOptions.CultureInvariant);

    private string? Path =>
        config["DholeSubmission:VerificationPath"] is { } path && PathFormat.IsMatch(path)
            ? path : null;
    private string? Key =>
        config["DholeSubmission:VerificationApiKey"] is { } key && KeyFormat.IsMatch(key)
            ? key : null;
    public bool Enabled =>
        config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") &&
        config.GetValue<bool>("DholeSubmission:VerificationEnabled") &&
        Path is not null && Key is { } key &&
        !string.Equals(key, config["DholeSubmission:ApiKey"], StringComparison.Ordinal);

    public async Task<bool> VerifyAsync(AppDbContext db, Guid quoteId, CancellationToken ct)
    {
        if (!Enabled || quoteId == Guid.Empty) return false;
        var candidate = await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
            .Where(x => x.QuoteId == quoteId && x.AttemptCount == 1 &&
                x.State == "HttpAcceptedUnverified" && x.LastAttemptAtUtc != null &&
                x.ExternalReference == null && x.VerifiedAtUtc == null)
            .Select(x => x.ProviderReferenceCandidate).SingleOrDefaultAsync(ct);
        if (candidate is not Guid reference || reference == Guid.Empty) return false;
        var path = Path;
        var key = Key;
        if (!Enabled || path is null || key is null) return false;

        try
        {
            // Fixed origin; slug is operator-only and never received from browser.
            using var request = new HttpRequestMessage(HttpMethod.Get,
                "https://api.logisticacastrofallas.com/" + path + "/" + reference.ToString("D"));
            request.Headers.Add("X-Api-Key", key);
            request.Headers.Accept.ParseAdd("application/json");
            using var response = await clients.CreateClient("DholeQuoteVerification")
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            const int max = 16 * 1024;
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength is > max)
                return false;
            await response.Content.LoadIntoBufferAsync(max, ct);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            // Publication must project only id/status. Do not retrieve, log or
            // persist contact data, full Pricing payload, or other quotes.
            if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 2 ||
                !root.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String ||
                !Guid.TryParseExact(id.GetString(), "D", out var remote) || remote != reference ||
                !root.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(status.GetString()) ||
                status.GetString()!.Contains("cancel", StringComparison.OrdinalIgnoreCase))
                return false;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested && ex is
            (HttpRequestException or IOException or JsonException or InvalidOperationException or
             ArgumentException or OperationCanceledException))
        {
            return false;
        }
        // Compare-and-set against the exact stored receipt and attempt.
        // An uncertain result never gets sent again; only successful matching
        // independent GET evidence moves it to Confirmed.
        if (!Enabled) return false;
        var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE public.official_quote_dhole_creation_outbox
            SET state = 'Confirmed', external_reference = {reference.ToString("D")},
                verified_at_utc = now(), updated_at_utc = now(), last_error_code = NULL
            WHERE quote_id = {quoteId} AND state = 'HttpAcceptedUnverified'
              AND attempt_count = 1 AND last_attempt_at_utc IS NOT NULL
              AND provider_reference_candidate = {reference}
              AND external_reference IS NULL AND verified_at_utc IS NULL
            """, ct);
        return affected == 1;
    }
}
