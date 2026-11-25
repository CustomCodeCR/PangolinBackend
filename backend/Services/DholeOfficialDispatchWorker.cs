using System.Globalization;
using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>Fixed activation scope, never inferred from old pending jobs.</summary>
public sealed record DholeOfficialWorkerScope(Guid? PilotQuoteId, DateTime? StartAfterUtc)
{
    public static DholeOfficialWorkerScope? Read(IConfiguration config)
    {
        if (!config.GetValue<bool>("DholeSubmission:WorkerEnabled") ||
            !config.GetValue<bool>("DholeSubmission:ApplicantContactSharingApproved") ||
            !config.GetValue<bool>("DholeSubmission:ClientCreateIdempotencyEnabled"))
            return null;

        var pilot = config["DholeSubmission:PilotQuoteId"];
        var start = config["DholeSubmission:NewQuotesStartUtc"];
        var all = config.GetValue<bool>("DholeSubmission:AllNewQuotesEnabled");
        // Single-quote pilot and broad activation are mutually exclusive.
        if (!all && string.IsNullOrWhiteSpace(start) &&
            Guid.TryParseExact(pilot, "D", out var id) && id != Guid.Empty)
            return new(id, null);
        if (all && string.IsNullOrWhiteSpace(pilot) &&
            DateTimeOffset.TryParseExact(start, "yyyy-MM-dd'T'HH:mm:ss'Z'",
                CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var utc) &&
            utc.Offset == TimeSpan.Zero && utc.UtcDateTime <= DateTime.UtcNow)
            return new(null, utc.UtcDateTime);
        return null;
    }
}

/// <summary>
/// Explicitly opt-in scoped host. Only new/pilot jobs; one claim per quote,
/// separate read-only reconciliation and once-only Graph notification.
/// No automatic reclaim of InFlight, ambiguous POST, or email reservations.
/// </summary>
public sealed class DholeOfficialDispatchWorker(
    IServiceScopeFactory scopes, IConfiguration config,
    ILogger<DholeOfficialDispatchWorker> logger) : BackgroundService
{
    // Pricing delivery and email are independent operations. Keep the
    // explicit dispatch/receipt-evidence gates; per-quote preflight checks the
    // applicable catalogs before any claim. Graph configuration is not a POST gate.
    public static bool CanDispatchNewQuotes(IConfiguration config, bool dispatchConfigured, bool receiptEvidenceConfigured) =>
        dispatchConfigured && receiptEvidenceConfigured &&
        config.GetValue<bool>("Features:OfficialQuotesEnabled") &&
        config.GetValue<bool>("DholeCatalogs:FormEnabled") &&
        config.GetValue<bool>("DholeCatalogs:SubmissionEnabled");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Capture once: broadening scope requires a deliberate restart. A
        // runtime configuration change disables the loop instead of widening it.
        var scope = DholeOfficialWorkerScope.Read(config);
        if (scope is null)
        {
            logger.LogWarning("Dhole worker not started: missing explicit activation scope or approval.");
            return;
        }
        Guid? dispatchCursor = null;
        Guid? verifyCursor = null;
        var nextHealthCheckUtc = DateTime.MinValue;
        while (!stoppingToken.IsCancellationRequested &&
               DholeOfficialWorkerScope.Read(config) == scope)
        {
            try
            {
                await using var services = scopes.CreateAsyncScope();
                var sp = services.ServiceProvider;
                var db = sp.GetRequiredService<AppDbContext>();
                var coordinator = sp.GetRequiredService<DholeOfficialDispatchAttemptCoordinator>();
                var verifier = sp.GetRequiredService<DholeOfficialPricingVerification>();
                var mail = sp.GetRequiredService<DholeOfficialConfirmationEmail>();

                var receiptPolicy = sp.GetRequiredService<DholeOfficialOutboxOutcomeService>();
                bool canDispatch = CanDispatchNewQuotes(config, coordinator.Enabled,
                    verifier.Enabled || receiptPolicy.AcceptCreationReceipt);
                // Aggregate monitoring only, bounded to the approved activation
                // scope. A two-minute age is a signal to inspect, not a failure
                // or a permission to retry. No names, IDs or payloads in logs.
                var now = DateTime.UtcNow;
                if (config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") &&
                    now >= nextHealthCheckUtc)
                {
                    nextHealthCheckUtc = now.AddMinutes(2);
                    try
                    {
                        var cutoff = now.AddMinutes(-2);
                        var scoped = db.OfficialQuoteDholeCreationOutbox.AsNoTracking();
                        if (scope.PilotQuoteId is Guid healthPilot)
                            scoped = scoped.Where(x => x.QuoteId == healthPilot);
                        if (scope.StartAfterUtc is DateTime healthStart)
                            scoped = scoped.Where(x => x.CreatedAtUtc >= healthStart);
                        int pending = await scoped.CountAsync(x => x.State == "PendingDispatch" &&
                            x.CreatedAtUtc <= cutoff, stoppingToken);
                        int inFlight = await scoped.CountAsync(x => x.State == "InFlight" &&
                            x.LastAttemptAtUtc != null && x.LastAttemptAtUtc <= cutoff, stoppingToken);
                        if (pending > 0 || inFlight > 0 || (canDispatch && !mail.Enabled))
                            logger.LogWarning("Dhole queue health: pending over two minutes {Pending}; in-flight over two minutes {InFlight}; dispatch configured {DispatchConfigured}; notification configured {NotificationConfigured}.",
                                pending, inFlight, canDispatch, mail.Enabled);
                    }
                    catch (Exception) when (!stoppingToken.IsCancellationRequested)
                    {
                        // Observability must never become another delivery gate.
                        logger.LogWarning("Dhole queue health check failed; delivery gates remain unchanged.");
                    }
                }
                if (DholeOfficialWorkerScope.Read(config) != scope) break;
                if (canDispatch)
                {
                    var batch = await sp.GetRequiredService<DholeOfficialDispatchPass>()
                        .RunAsync(db, dispatchCursor, stoppingToken, scope, limit: 1);
                    dispatchCursor = batch.NextCursor;
                    if (batch.Blocked > 0)
                        logger.LogWarning("Dhole dispatch preflight blocked {Count} pending job(s).", batch.Blocked);
                }
                if (DholeOfficialWorkerScope.Read(config) != scope) break;
                if (verifier.Enabled)
                {
                    var query = db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                        .Where(x => x.State == "HttpAcceptedUnverified" &&
                            x.AttemptCount == 1 && x.ProviderReferenceCandidate != null &&
                            x.ExternalReference == null && x.VerifiedAtUtc == null);
                    if (scope.PilotQuoteId is Guid pilot)
                        query = query.Where(x => x.QuoteId == pilot);
                    if (scope.StartAfterUtc is DateTime start)
                        query = query.Where(x => x.CreatedAtUtc >= start);
                    if (verifyCursor is Guid cursor)
                        query = query.Where(x => x.QuoteId.CompareTo(cursor) > 0);
                    var ids = await query.OrderBy(x => x.QuoteId)
                        .Select(x => x.QuoteId).Take(5).ToListAsync(stoppingToken);
                    foreach (var id in ids)
                    {
                        if (DholeOfficialWorkerScope.Read(config) != scope) break;
                        await verifier.VerifyAsync(db, id, stoppingToken);
                    }
                    verifyCursor = ids.Count < 5 ? null : ids[^1];
                }
                if (DholeOfficialWorkerScope.Read(config) != scope) break;
                if (mail.Enabled)
                    await mail.RunAsync(db, stoppingToken, scope);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception)
            {
                // No exception text: provider responses and DB exceptions can
                // carry credentials or PII. Durable state is the source of truth.
                logger.LogError("Dhole worker pass failed; inspect delivery states. No ambiguous send will be retried.");
            }
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
