using CastroFallas.MiniQuote.Api.Data;
using Microsoft.Extensions.Configuration;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// One-shot dispatcher building block, NOT a registered worker, scheduler,
/// route or live integration. All feature flags are default OFF. A future
/// operator-controlled host must independently supply a fresh server-only
/// DholeOfficialFlatReview from the persisted ADMIN quote and current catalogs.
/// No automatic reclaims/retries and never infers provider confirmation.
/// </summary>
public sealed record DholeOfficialDispatchAttemptResult(
    string State, bool Claimed, bool TransportAcceptedLocally,
    bool RemoteCreationConfirmed, bool AutomaticRetryAllowed);

public sealed class DholeOfficialDispatchAttemptCoordinator(
    IConfiguration configuration,
    DholeOfficialOutboxClaimService claimer,
    DholeOfficialOutboxOutcomeService recorder,
    DholeQuotePostTransport transport)
{
    // DispatcherEnabled is intentionally NOT configured in any Compose file,
    // Program.cs service registration, endpoint, timer or background job.
    public bool Enabled =>
        configuration.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") &&
        configuration.GetValue<bool>("DholeSubmission:DispatcherEnabled") &&
        claimer.Enabled && recorder.Enabled && transport.IsConfiguredForOneAttempt;

    public async Task<DholeOfficialDispatchAttemptResult> AttemptOnceAsync(
        AppDbContext db, DholeOfficialFlatReview? review, CancellationToken ct)
    {
        static DholeOfficialDispatchAttemptResult Stop(string state) =>
            new(state, false, false, false, false);

        if (!Enabled) return Stop("Disabled");
        if (review is null || !review.ReadyForContractReview ||
            review.RemoteSubmissionPermitted ||
            !DholeQuotePostTransport.IsValidFlatBody(review.Body))
            return Stop("PreflightBlocked");

        // Claim is an irreversible once-only reservation *before* HTTP.
        // A crash or network ambiguity afterward must be manually reconciled.
        var id = await claimer.ClaimReviewedQuoteForOfflineReviewAsync(db, review, ct);
        if (id is null) return Stop("AlreadyClaimedOrInvalid");

        DholeQuotePostOutcome outcome;
        try
        {
            outcome = await transport.PostValidatedAsync(id.Value, review.Body, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or IOException or
            OperationCanceledException or InvalidOperationException)
        {
            // A thrown exception after claim may mean the remote side created
            // the request. Never auto resend or mark creation confirmed.
            outcome = DholeQuotePostOutcome.Unconfirmed;
        }

        var completionEvent = outcome switch
        {
            DholeQuotePostOutcome.HttpAcceptedUnverified =>
                DholeDeliveryEvent.HttpAcceptedButUnverified,
            DholeQuotePostOutcome.Rejected =>
                DholeDeliveryEvent.ProviderRejected,
            DholeQuotePostOutcome.Unconfirmed =>
                DholeDeliveryEvent.RemoteResultUnknown,
            _ => DholeDeliveryEvent.LocalValidationFailed
        };
        // A failure persisting the result leaves InFlight, which is intentionally
        // NOT automatically reclaimed. No raw response or PII is logged.
        var recorded = await recorder.RecordAttemptOutcomeForOfflineReviewAsync(
            db, id.Value, completionEvent, CancellationToken.None);
        var state = recorded
            ? DholeOfficialDeliveryStateMachine.Advance(
                "InFlight", completionEvent).NextState
            : "InFlight";
        return new DholeOfficialDispatchAttemptResult(
            state, true,
            outcome == DholeQuotePostOutcome.HttpAcceptedUnverified,
            RemoteCreationConfirmed:false,
            AutomaticRetryAllowed:false);
    }
}
