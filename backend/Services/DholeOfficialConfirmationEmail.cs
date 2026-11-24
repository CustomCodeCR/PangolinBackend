using System.Net.Mail;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Separate once-only notification pass, dormant until explicitly enabled and
/// invoked by the future host. Graph acceptance is not inbox delivery. Never
/// causes another Dhole POST. Requires either independent GET confirmation
/// or a newly recorded, explicitly authorized creation receipt.
/// </summary>
public sealed class DholeOfficialConfirmationEmail(
    IConfiguration config, GraphEmailSender graph)
{
    public bool Enabled =>
        config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") &&
        config.GetValue<bool>("DholeSubmission:ConfirmationEmailEnabled") &&
        string.Equals(config["Email:Mode"], "Graph", StringComparison.OrdinalIgnoreCase) &&
        new[] { "Graph:TenantId", "Graph:ClientId", "Graph:ClientSecret", "Graph:From" }
            .All(key => !string.IsNullOrWhiteSpace(config[key]));

    public async Task<int> RunAsync(AppDbContext db, CancellationToken ct,
        DholeOfficialWorkerScope? scope = null)
    {
        if (!Enabled) return 0;
        var outbox = db.OfficialQuoteDholeCreationOutbox.AsNoTracking();
        if (scope?.PilotQuoteId is Guid pilot)
            outbox = outbox.Where(x => x.QuoteId == pilot);
        if (scope?.StartAfterUtc is DateTime start)
            outbox = outbox.Where(x => x.CreatedAtUtc >= start);
        var jobs = await (
            from o in outbox
            join q in db.OfficialQuotes.AsNoTracking() on o.QuoteId equals q.Id
            where o.AttemptCount == 1 && o.ConfirmationEmailClaimedAtUtc == null &&
                ((o.State == "Confirmed" && o.VerifiedAtUtc != null && o.ExternalReference != null) ||
                 (o.State == "HttpAcceptedUnverified" && o.CreationReceiptAcceptedAtUtc != null &&
                  o.ProviderReferenceCandidate != null && o.ProviderReferenceCandidate != Guid.Empty &&
                  o.ExternalReference == null && o.VerifiedAtUtc == null))
            orderby o.VerifiedAtUtc ?? o.CreationReceiptAcceptedAtUtc, o.QuoteId
            select new { o.QuoteId, o.State, o.ExternalReference, o.ProviderReferenceCandidate,
                q.ContactEmail })
            .Take(20).ToListAsync(ct);

        int accepted = 0;
        foreach (var job in jobs)
        {
            ct.ThrowIfCancellationRequested();
            if (!Enabled) break;
            var independentlyVerified = job.State == "Confirmed";
            if (independentlyVerified
                ? !Guid.TryParse(job.ExternalReference, out var reference) || reference == Guid.Empty
                : job.ProviderReferenceCandidate is null || job.ProviderReferenceCandidate == Guid.Empty)
                continue;
            // Atomic reservation before Graph. No auto-reclaim: ambiguous email
            // delivery must be reconciled separately, not sent repeatedly.
            var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE public.official_quote_dhole_creation_outbox
                SET confirmation_email_claimed_at_utc = now()
                WHERE quote_id = {job.QuoteId} AND attempt_count = 1
                  AND confirmation_email_claimed_at_utc IS NULL
                  AND ((state = 'Confirmed' AND verified_at_utc IS NOT NULL
                        AND external_reference = {job.ExternalReference})
                    OR (state = 'HttpAcceptedUnverified' AND creation_receipt_accepted_at_utc IS NOT NULL
                        AND provider_reference_candidate = CAST({job.ProviderReferenceCandidate?.ToString("D")} AS uuid)
                        AND external_reference IS NULL AND verified_at_utc IS NULL))
                """, ct);
            if (claimed != 1) continue;
            string? error = null;
            try
            {
                if (!MailAddress.TryCreate(job.ContactEmail, out var address) ||
                    !string.Equals(address.Address, job.ContactEmail, StringComparison.OrdinalIgnoreCase))
                    error = "InvalidRecipient";
                else
                {
                    var subject = "Solicitud de cotización enviada | Castro Fallas";
                    var body = "¡Gracias por confiar en Castro Fallas!\n\n" +
                        "Tu solicitud de cotización se envió correctamente. " +
                        "Nuestro equipo de Pricing la atenderá y se pondrá en contacto con vos.\n\n" +
                        "Referencia de tu solicitud: " + job.QuoteId.ToString("D") + "\n\n" +
                        "Este mensaje confirma la recepción de la solicitud, no una tarifa aprobada.\n\n" +
                        "Logística Castro Fallas";
                    await graph.SendAsync(address.Address, subject, body, ct);
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or IOException or
                InvalidOperationException or ArgumentException or OperationCanceledException or System.Text.Json.JsonException)
            {
                error = "EmailOutcomeUnknown";
            }
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE public.official_quote_dhole_creation_outbox
                SET confirmation_email_accepted_at_utc =
                    CASE WHEN CAST({error} AS text) IS NULL THEN now() ELSE NULL END,
                    confirmation_email_error_code = {error}
                WHERE quote_id = {job.QuoteId}
                  AND confirmation_email_claimed_at_utc IS NOT NULL
                  AND confirmation_email_accepted_at_utc IS NULL
                  AND confirmation_email_error_code IS NULL
                """, CancellationToken.None);
            if (error is null) accepted++;
        }
        return accepted;
    }
}
