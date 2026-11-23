using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Future-dispatcher DATABASE primitive. No registration, route, hosted worker,
/// network client or retry loop. Disabled unless both flags are explicitly true.
/// It can only record outcomes of one pre-existing InFlight attempt; never
/// sets Confirmed, stores provider text, or generates a remote reference.
/// </summary>
public sealed class DholeOfficialOutboxOutcomeService(IConfiguration configuration)
{
    public bool Enabled =>
        configuration.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") &&
        configuration.GetValue<bool>("DholeSubmission:OutcomePreviewEnabled");

    public async Task<bool> RecordAttemptOutcomeForOfflineReviewAsync(
        AppDbContext db, Guid quoteId, DholeDeliveryEvent outcome, CancellationToken ct)
    {
        if (!Enabled) return false;
        if (quoteId == Guid.Empty)
            throw new ArgumentException("An official quote ID is required.", nameof(quoteId));

        // Guard against adding a new unsafe state transition to the enum.
        if (outcome is not (DholeDeliveryEvent.HttpAcceptedButUnverified or
            DholeDeliveryEvent.RemoteResultUnknown or
            DholeDeliveryEvent.ProviderRejected or
            DholeDeliveryEvent.LocalValidationFailed))
            throw new InvalidOperationException("This outcome cannot be persisted automatically.");

        var decision = DholeOfficialDeliveryStateMachine.Advance("InFlight", outcome);
        if (decision.RemoteCreationConfirmed || decision.AutomaticRetryAllowed ||
            decision.NextState is not ("HttpAcceptedUnverified" or "Unconfirmed" or "Rejected" or "Failed"))
            throw new InvalidOperationException("Unsafe Dhole outcome.");

        // Controlled codes only: no remote response text, URLs, PII or credentials.
        string? errorCode = outcome switch
        {
            DholeDeliveryEvent.HttpAcceptedButUnverified => null,
            DholeDeliveryEvent.RemoteResultUnknown => "RemoteOutcomeUnknown",
            DholeDeliveryEvent.ProviderRejected => "ProviderRejected",
            DholeDeliveryEvent.LocalValidationFailed => "LocalValidationFailed",
            _ => throw new InvalidOperationException("Unexpected Dhole event.")
        };

        // Atomic compare-and-set. A second or concurrent completion cannot
        // overwrite a recorded outcome. We intentionally do not reclaim stale
        // InFlight rows after crashes: reconciliation requires human review.
        var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE public.official_quote_dhole_creation_outbox
            SET state = {decision.NextState},
                last_error_code = {errorCode},
                updated_at_utc = now()
            WHERE quote_id = {quoteId}
              AND state = 'InFlight'
              AND attempt_count = 1
              AND external_reference IS NULL
              AND verified_at_utc IS NULL
            """, ct);

        return affected == 1;
    }
}
