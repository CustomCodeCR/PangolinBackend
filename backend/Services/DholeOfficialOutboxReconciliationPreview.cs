using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CastroFallas.MiniQuote.Api.Services;

// Diagnostic-only read model for a FUTURE authorized Pricing reconciliation.
// Not registered as an endpoint, worker, host service, timer or HTTP client.
// Its output cannot confirm a provider-side creation or allow a retry.
public sealed record DholeOutboxReconciliationReview(
    Guid QuoteId,
    string IdempotencyKey,
    string State,
    int AttemptCount,
    string NextReviewAction,
    bool LocalConfirmationRecorded,
    bool AutomaticRetryAllowed,
    bool DataIntegrityProblem);

public sealed class DholeOfficialOutboxReconciliationPreview(IConfiguration configuration)
{
    public bool Enabled =>
        configuration.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") &&
        configuration.GetValue<bool>("DholeSubmission:ReconciliationPreviewEnabled");

    public async Task<DholeOutboxReconciliationReview?> PreviewAsync(
        AppDbContext db, Guid quoteId, CancellationToken ct)
    {
        if (!Enabled) return null;
        if (quoteId == Guid.Empty)
            throw new ArgumentException("Quote ID is required.", nameof(quoteId));

        // Read only the local outbox row; no contact details or original form.
        // This is a diagnostic snapshot, NOT authoritative Pricing evidence.
        var entry = await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
            .Where(x => x.QuoteId == quoteId)
            .Select(x => new
            {
                x.QuoteId, x.IdempotencyKey, x.State, x.AttemptCount,
                x.LastAttemptAtUtc, x.ExternalReference, x.VerifiedAtUtc
            })
            .SingleOrDefaultAsync(ct);
        if (entry is null) return null;

        // Treat unexpected combinations as a manual incident, never as
        // permission to send again or mark a request confirmed.
        bool validIdentity = entry.IdempotencyKey ==
            "cf-official-" + entry.QuoteId.ToString("D");
        bool expectedAttemptCount = entry.State == "PendingDispatch"
            ? entry.AttemptCount == 0 && entry.LastAttemptAtUtc is null
            : entry.AttemptCount >= 1 && entry.LastAttemptAtUtc is not null;

        bool hasReference = !string.IsNullOrWhiteSpace(entry.ExternalReference);
        bool hasVerification = entry.VerifiedAtUtc is not null;
        bool isVerified = entry.State == "Confirmed" &&
                          hasReference && hasVerification;
        bool evidenceConsistent = entry.State == "Confirmed"
            ? isVerified
            : !hasReference && !hasVerification;

        bool knownState = entry.State is
            "PendingDispatch" or "InFlight" or "HttpAcceptedUnverified" or
            "Rejected" or "Unconfirmed" or "Confirmed" or "Failed";

        bool integrityProblem = !validIdentity || !expectedAttemptCount ||
                                !evidenceConsistent || !knownState;

        var action = integrityProblem ? "InvestigateLocalDataIntegrity" :
            entry.State switch
            {
                "PendingDispatch" => "AwaitAuthorizedDispatch",
                "InFlight" => "VerifyUnknownRemoteOutcome",
                "HttpAcceptedUnverified" => "VerifyProviderCreationInPricing",
                "Unconfirmed" => "VerifyUnknownRemoteOutcome",
                "Rejected" => "ReviewExplicitProviderRejection",
                "Failed" => "ReviewLocalValidationFailure",
                "Confirmed" => "AlreadyVerifiedLocally",
                _ => "InvestigateLocalDataIntegrity"
            };

        // "LocalConfirmationRecorded" indicates ONLY that the local database
        // holds a confirmed row with reference and verification timestamp. It
        // never independently attests to what currently exists in Pricing.
        return new DholeOutboxReconciliationReview(
            entry.QuoteId, entry.IdempotencyKey, entry.State,
            entry.AttemptCount, action,
            LocalConfirmationRecorded: !integrityProblem && isVerified,
            AutomaticRetryAllowed: false,
            DataIntegrityProblem: integrityProblem);
    }
}
