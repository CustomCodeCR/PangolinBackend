using System.Net.Mail;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Separate once-only notification pass, dormant until explicitly enabled and
/// invoked by the future host. Graph acceptance is not inbox delivery. Never
/// causes another Dhole POST, never mails an unverified quote.
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

    public async Task<int> RunAsync(AppDbContext db, CancellationToken ct)
    {
        if (!Enabled) return 0;
        var jobs = await (
            from o in db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
            join q in db.OfficialQuotes.AsNoTracking() on o.QuoteId equals q.Id
            where o.State == "Confirmed" && o.AttemptCount == 1 &&
                o.VerifiedAtUtc != null && o.ExternalReference != null &&
                o.ConfirmationEmailClaimedAtUtc == null
            orderby o.VerifiedAtUtc, o.QuoteId
            select new { o.QuoteId, o.ExternalReference, q.ContactEmail })
            .Take(20).ToListAsync(ct);

        int accepted = 0;
        foreach (var job in jobs)
        {
            ct.ThrowIfCancellationRequested();
            if (!Enabled) break;
            if (!Guid.TryParse(job.ExternalReference, out var reference) || reference == Guid.Empty)
                continue;
            // Atomic reservation before Graph. No auto-reclaim: ambiguous email
            // delivery must be reconciled separately, not sent repeatedly.
            var claimed = await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE public.official_quote_dhole_creation_outbox
                SET confirmation_email_claimed_at_utc = now()
                WHERE quote_id = {job.QuoteId} AND state = 'Confirmed'
                  AND attempt_count = 1 AND verified_at_utc IS NOT NULL
                  AND external_reference = {job.ExternalReference}
                  AND confirmation_email_claimed_at_utc IS NULL
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
                WHERE quote_id = {job.QuoteId} AND state = 'Confirmed'
                  AND confirmation_email_claimed_at_utc IS NOT NULL
                  AND confirmation_email_accepted_at_utc IS NULL
                  AND confirmation_email_error_code IS NULL
                """, CancellationToken.None);
            if (error is null) accepted++;
        }
        return accepted;
    }
}
