using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Bounded queue consumer. An explicitly authorized host supplies a fresh
/// scoped DbContext and a fixed pilot/new-submission scope for each pass.
/// Only never-attempted pending rows qualify; no replay of ambiguous deliveries.
/// </summary>
public sealed record DholeOfficialDispatchPassResult(
    Guid? NextCursor, int Reviewed, int Claimed, int Blocked);

public enum DholePreflightBlockReason
{
    MissingSavedQuote,
    CatalogUnavailable,
    LookupUnavailable,
    InvalidSavedQuoteOrMapping,
    InvalidPayload
}

public sealed class DholeOfficialDispatchPass(
    DholeOfficialPublishedDispatchSource source,
    DholeOfficialDispatchAttemptCoordinator coordinator)
{
    // Only a never-attempted row can receive a preflight diagnostic. A
    // concurrent claim/outcome always wins; unchanged reasons do not rewrite
    // the row every polling cycle. Never persist exception or provider text.
    public static async Task<bool> RecordPreflightBlockAsync(
        AppDbContext db, Guid quoteId, DholePreflightBlockReason reason, CancellationToken ct)
    {
        string code = reason switch
        {
            DholePreflightBlockReason.MissingSavedQuote => "PreflightMissingSavedQuote",
            DholePreflightBlockReason.CatalogUnavailable => "PreflightCatalogUnavailable",
            DholePreflightBlockReason.LookupUnavailable => "PreflightLookupUnavailable",
            DholePreflightBlockReason.InvalidSavedQuoteOrMapping => "PreflightInvalidSavedQuoteOrMapping",
            DholePreflightBlockReason.InvalidPayload => "PreflightInvalidPayload",
            _ => throw new ArgumentOutOfRangeException(nameof(reason))
        };
        return await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE public.official_quote_dhole_creation_outbox
            SET last_error_code = {code}, updated_at_utc = now()
            WHERE quote_id = {quoteId} AND state = 'PendingDispatch'
              AND attempt_count = 0 AND last_attempt_at_utc IS NULL
              AND provider_reference_candidate IS NULL AND external_reference IS NULL
              AND verified_at_utc IS NULL AND last_error_code IS DISTINCT FROM {code}
            """, ct) == 1;
    }

    public async Task<DholeOfficialDispatchPassResult> RunAsync(
        AppDbContext db, Guid? afterQuoteId, CancellationToken ct,
        DholeOfficialWorkerScope? scope = null, int limit = 20)
    {
        if (!coordinator.Enabled)
            return new(afterQuoteId, 0, 0, 0);

        // Keyset paging prevents a permanently blocked quote from starving later
        // requests. The host starts a new scan after NextCursor returns null.
        // Limit work per pass; claims themselves remain atomic in the coordinator.
        var query = db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
            .Where(x => x.State == "PendingDispatch" && x.AttemptCount == 0 &&
                x.LastAttemptAtUtc == null && x.ProviderReferenceCandidate == null &&
                x.ExternalReference == null && x.VerifiedAtUtc == null);
        if (scope?.PilotQuoteId is Guid pilot)
            query = query.Where(x => x.QuoteId == pilot);
        if (scope?.StartAfterUtc is DateTime start)
            query = query.Where(x => x.CreatedAtUtc >= start);
        limit = Math.Clamp(limit, 1, 20);
        if (afterQuoteId is Guid cursor)
            query = query.Where(x => x.QuoteId.CompareTo(cursor) > 0);
        var ids = await query.OrderBy(x => x.QuoteId).Select(x => x.QuoteId)
            .Take(limit).ToListAsync(ct);
        int reviewed = 0, claimed = 0, blocked = 0;
        foreach (var id in ids)
        {
            ct.ThrowIfCancellationRequested();
            if (!coordinator.Enabled) break;
            var saved = await db.OfficialQuotes.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == id, ct);
            if (saved is null)
            {
                await RecordPreflightBlockAsync(db, id, DholePreflightBlockReason.MissingSavedQuote, ct);
                blocked++; reviewed++; continue;
            }
            DholeOfficialFlatReview review;
            try
            {
                review = await source.ReviewAsync(saved, ct);
            }
            catch (Exception ex) when (ex is DholeCatalogUnavailableException or
                DholeLookupUnavailableException or ArgumentException or System.Text.Json.JsonException)
            {
                // Keep the copy and unclaimed job. No PII or upstream error text.
                var reason = ex switch
                {
                    DholeCatalogUnavailableException => DholePreflightBlockReason.CatalogUnavailable,
                    DholeLookupUnavailableException => DholePreflightBlockReason.LookupUnavailable,
                    _ => DholePreflightBlockReason.InvalidSavedQuoteOrMapping
                };
                await RecordPreflightBlockAsync(db, id, reason, ct);
                blocked++;
                reviewed++;
                continue;
            }
            var result = await coordinator.AttemptOnceAsync(db, review, ct);
            reviewed++;
            if (result.Claimed) claimed++;
            else
            {
                if (result.State == "PreflightBlocked")
                    await RecordPreflightBlockAsync(db, id, DholePreflightBlockReason.InvalidPayload, ct);
                blocked++;
            }
        }
        return new(reviewed == 0 || reviewed == ids.Count && ids.Count < limit
            ? null : ids[reviewed - 1], reviewed, claimed, blocked);
    }
}
