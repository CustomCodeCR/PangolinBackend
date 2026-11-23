using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Isolated, optional claim primitive for a FUTURE delivery dispatcher.
/// Not registered as a hosted service, worker, timer, endpoint or sender.
/// This method changes only PostgreSQL state; it never contacts Dhole.
/// </summary>
public sealed class DholeOfficialOutboxClaimService(IConfiguration configuration)
{
    // Requires two independent opt-ins before touching optional tables.
    // ClaimPreviewEnabled is intentionally absent from all default Compose
    // environments; it exists only to exercise isolated PostgreSQL tests.
    public bool Enabled =>
        configuration.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") &&
        configuration.GetValue<bool>("DholeSubmission:ClaimPreviewEnabled");


    /// <summary>
    /// Future-dispatch preparation path: claims exactly the quote that passed
    /// the server-only preflight. The old ClaimOne method remains restricted to
    /// disposable Postgres tests; this method never sends HTTP either.
    /// A review result is NOT authorization for a Pricing POST.
    /// </summary>
    public async Task<Guid?> ClaimReviewedQuoteForOfflineReviewAsync(
        AppDbContext db, DholeOfficialFlatReview? review, CancellationToken ct)
    {
        if (!Enabled || review is null ||
            !review.ReadyForContractReview || review.RemoteSubmissionPermitted ||
            review.OfficialQuoteId == Guid.Empty ||
            review.Body.ValueKind != System.Text.Json.JsonValueKind.Object ||
            review.IdempotencyKey !=
                "cf-official-" + review.OfficialQuoteId.ToString("D"))
            return null;

        // Independently verify local outbox identity/state; never trust a
        // browser-supplied ID, a stale InFlight row, or any attempt already made.
        var item = await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
            .SingleOrDefaultAsync(x => x.QuoteId == review.OfficialQuoteId, ct);
        if (item is null ||
            item.State != "PendingDispatch" ||
            item.IdempotencyKey != review.IdempotencyKey ||
            item.AttemptCount != 0 ||
            item.LastAttemptAtUtc is not null ||
            item.ExternalReference is not null ||
            item.VerifiedAtUtc is not null)
            return null;

        // Verify that an administrative copy still exists and is explicitly
        // a Dhole-backed submission. Never read the legacy approval outbox.
        var saved = await db.OfficialQuotes.AsNoTracking()
            .Where(x => x.Id == item.QuoteId)
            .Select(x => new { x.FormJson, x.Mode, x.ShipmentType })
            .SingleOrDefaultAsync(ct);
        if (saved is null || string.IsNullOrWhiteSpace(saved.FormJson) ||
            saved.FormJson.Length > 128 * 1024)
            return null;
        try
        {
            using var stored = System.Text.Json.JsonDocument.Parse(saved.FormJson);
            var root = stored.RootElement;
            if (root.ValueKind != System.Text.Json.JsonValueKind.Object ||
                !root.TryGetProperty("catalogSource", out var source) ||
                source.ValueKind != System.Text.Json.JsonValueKind.String ||
                source.GetString() != "dhole" ||
                !root.TryGetProperty("mode", out var mode) ||
                mode.GetString() != saved.Mode ||
                !root.TryGetProperty("shipmentType", out var shipment) ||
                shipment.GetString() != saved.ShipmentType)
                return null;
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }

        // The final CAS protects the state after the checks above, including
        // concurrent workers that independently reviewed the same quote.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = tx.GetDbTransaction();
        command.CommandText = """
            UPDATE public.official_quote_dhole_creation_outbox
            SET state = 'InFlight',
                attempt_count = attempt_count + 1,
                last_attempt_at_utc = now(),
                updated_at_utc = now()
            WHERE quote_id = @quote_id
              AND idempotency_key = @idempotency_key
              AND state = 'PendingDispatch'
              AND attempt_count = 0
              AND last_attempt_at_utc IS NULL
              AND external_reference IS NULL
              AND verified_at_utc IS NULL
            RETURNING quote_id
            """;
        var id = command.CreateParameter();
        id.ParameterName = "quote_id";
        id.Value = review.OfficialQuoteId;
        command.Parameters.Add(id);
        var key = command.CreateParameter();
        key.ParameterName = "idempotency_key";
        key.Value = review.IdempotencyKey;
        command.Parameters.Add(key);
        var claimed = await command.ExecuteScalarAsync(ct);
        await tx.CommitAsync(ct);
        return claimed is Guid selected ? selected : null;
    }

    public async Task<Guid?> ClaimOneForOfflineReviewAsync(
        AppDbContext db, CancellationToken ct)
    {
        if (!Enabled) return null;

        // A single PostgreSQL statement selects and transitions at most one
        // pending row. SKIP LOCKED prevents concurrent claimers from returning
        // the same quote; no automatic reclaim or lease expiry is permitted:
        // after a worker crash, the remote outcome may be UNKNOWN.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = tx.GetDbTransaction();
        command.CommandText = """
            WITH candidate AS (
                SELECT quote_id
                FROM public.official_quote_dhole_creation_outbox
                WHERE state = 'PendingDispatch'
                ORDER BY created_at_utc, quote_id
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE public.official_quote_dhole_creation_outbox AS o
            SET state = 'InFlight',
                attempt_count = attempt_count + 1,
                last_attempt_at_utc = now(),
                updated_at_utc = now()
            FROM candidate
            WHERE o.quote_id = candidate.quote_id
              AND o.state = 'PendingDispatch'
            RETURNING o.quote_id
            """;

        var claimed = await command.ExecuteScalarAsync(ct);
        await tx.CommitAsync(ct);
        return claimed is Guid id ? id : null;
    }
}
