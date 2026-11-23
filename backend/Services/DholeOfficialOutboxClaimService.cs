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
