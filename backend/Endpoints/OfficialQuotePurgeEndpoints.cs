using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace CastroFallas.MiniQuote.Api.Endpoints;

/// <summary>
/// Purges a locally cancelled unlinked quote, or a previously archived completed
/// legacy quote, without requiring an archived-first workflow or waiting 24 hours.
/// Never touches Dhole, ever retries an external operation, or bulk-deletes.
/// The quote's personal data and cascading audit history are erased; a
/// minimal PII-free tombstone records who performed the irreversible action.
/// </summary>
public static class OfficialQuotePurgeEndpoints
{
    public sealed record PurgeRequest(string? Confirmation, string? Reason);

    public static IEndpointRouteBuilder MapOfficialQuotePurge(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin/quotes/official")
            .RequireAuthorization("admin");

        admin.MapGet("/archived", async (int? page, AppDbContext db,
            AuthService auth, HttpContext http, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            if (actor?.Role != "admin") return Results.Forbid();
            var n = page ?? 1;
            if (n is < 1 or > 100000) return Results.BadRequest();
            var query = db.OfficialQuotes.AsNoTracking()
                .Where(x => x.ArchivedAtUtc != null);
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.ArchivedAtUtc)
                .ThenBy(x => x.Id).Skip((n - 1) * 20).Take(20)
                .Select(x => new { x.Id, x.CustomerName, x.Status, x.Authorization,
                    x.ShipmentType, x.CreatedAtUtc, x.ArchivedAtUtc })
                .ToListAsync(ct);
            var canPurge = await db.OfficialQuotePermissions.AsNoTracking()
                .AnyAsync(x => x.UserId == actor.UsuarioId && x.CanAuthorize, ct);
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { items, total, page = n, canPurge });
        }).RequireRateLimiting("auth");

        admin.MapDelete("/archived/{id:guid}", PurgeQuoteAsync).RequireRateLimiting("auth");
        admin.MapDelete("/{id:guid}/purge", PurgeQuoteAsync).RequireRateLimiting("auth");

        return app;
    }

    private static async Task<IResult> PurgeQuoteAsync(Guid id, [FromBody] PurgeRequest request,
        AppDbContext db, AuthService auth, HttpContext http, CancellationToken ct)
    {
            http.Response.Headers.CacheControl = "no-store";
            var actor = await auth.GetIdentityAsync(http, ct);
            if (actor?.Role != "admin" ||
                !await db.OfficialQuotePermissions.AsNoTracking()
                    .AnyAsync(x => x.UserId == actor.UsuarioId && x.CanAuthorize, ct))
                return Results.Forbid();

            // Require an exact, case-sensitive written confirmation from the
            // caller, even for a direct HTTP request bypassing the browser.
            if (request.Confirmation != $"ELIMINAR {id:D}" ||
                request.Reason is not ("Prueba" or "Defectuosa"))
                return Results.BadRequest(new {
                    code = "quote_purge_confirmation_required",
                    error = "Indicá el motivo y escribí ELIMINAR seguido del UUID completo."
                });

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Serialize against archiving, reviewing, and authorizing.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT 1 FROM public.official_quote_requests WHERE id = {id} FOR UPDATE", ct);
            var quote = await db.OfficialQuotes.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id, ct);
            if (quote is null) return Results.NotFound();

            // New workflow: status Cancelled is required for ACTIVE records.
            // Previously archived Closed/Rejected records remain eligible for
            // manual cleanup, without a 24-hour wait; nothing is automatic.
            var eligible = quote.Status == "Cancelled" ||
                (quote.ArchivedAtUtc != null &&
                    (quote.Status == "Closed" || quote.Authorization == "Rejected"));
            if (!eligible || quote.Authorization == "Authorized")
                return Results.Conflict(new {
                    code = "quote_purge_not_cancelled",
                    error = "Para eliminar una solicitud activa, primero cambiá su estado a Cancelada. Las archivadas finalizadas también pueden eliminarse."
                });

            // All mandatory proof tables must be present before authorizing any
            // destructive query. A partial or old schema fails CLOSED.
            var completeSchema = await db.Database.SqlQueryRaw<bool>("""
                SELECT to_regclass('public.official_quote_dhole_creation_outbox') IS NOT NULL
                    AND to_regclass('public.official_quote_dhole_outbox') IS NOT NULL
                    AND to_regclass('public.official_quote_client_submissions') IS NOT NULL
                    AND to_regclass('public.official_quote_purge_audit') IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'official_quote_purge_audit'
                          AND column_name = 'submission_key'
                    ) AS "Value"
                """).SingleAsync(ct);
            if (!completeSchema)
                return Results.Json(new {
                    code = "quote_purge_schema_incomplete",
                    error = "La base de datos no tiene las tablas de protección requeridas."
                }, statusCode: StatusCodes.Status503ServiceUnavailable);

            // Never remove evidence of even ONE Dhole state, including pending,
            // rejected, unverified, and cases where feature flags are disabled.
            var dholeLinked =
                await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                    .AnyAsync(x => x.QuoteId == id, ct) ||
                await db.OfficialQuoteDholeOutbox.AsNoTracking()
                    .AnyAsync(x => x.QuoteId == id, ct);
            if (dholeLinked)
                return Results.Conflict(new {
                    code = "quote_purge_dhole_protected",
                    error = "Esta cotización tiene registros de Dhole y no puede eliminarse de la base de datos."
                });

            // Keep ONLY the random UUID key as a durable tombstone, without
            // its former payload digest or any customer details. Its original FK
            // must be deleted before the quote so PostgreSQL can enforce RESTRICT.
            var requestKey = await db.OfficialQuoteClientSubmissions.AsNoTracking()
                .Where(x => x.QuoteId == id)
                .Select(x => (Guid?)x.SubmissionKey)
                .SingleOrDefaultAsync(ct);
            if (requestKey.HasValue)
            {
                // Creation acquires this advisory lock before inserting. Taking
                // the same lock here prevents the old browser key from being
                // recycled while the archive is being permanently removed.
                await OfficialQuoteEndpoints.LockCreationKeyAsync(
                    db, requestKey.Value, tx, ct);
            }

            try
            {
                // Insert the no-PII tombstone and remove the optional FK before
                // deleting the parent. ALL changes must commit atomically.
                await db.Database.ExecuteSqlInterpolatedAsync(
                    $"""
                    INSERT INTO public.official_quote_purge_audit
                        (quote_id, actor_user_id, reason, submission_key)
                    VALUES ({id}, {actor.UsuarioId}, {request.Reason}, {requestKey})
                    """, ct);
                if (requestKey.HasValue)
                {
                    var removedKey = await db.Database.ExecuteSqlInterpolatedAsync(
                        $"""
                        DELETE FROM public.official_quote_client_submissions
                        WHERE quote_id = {id} AND submission_key = {requestKey.Value}
                        """, ct);
                    if (removedKey != 1)
                        return Results.Conflict(new {
                            code = "quote_purge_changed",
                            error = "La clave de reintento cambió durante la operación; no se eliminó nada."
                        });
                }

                // The original audit FK has ON DELETE CASCADE. Only the separate
                // key tombstone survives, intentionally without PII or digest.
                var deleted = await db.Database.ExecuteSqlInterpolatedAsync(
                    $"DELETE FROM public.official_quote_requests WHERE id = {id} AND approval_status <> 'Authorized' AND (status = 'Cancelled' OR (archived_at_utc IS NOT NULL AND (status = 'Closed' OR approval_status = 'Rejected')))", ct);
                if (deleted != 1)
                    return Results.Conflict(new {
                        code = "quote_purge_changed",
                        error = "La cotización cambió durante la operación; no se eliminó."
                    });
                await tx.CommitAsync(ct);
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.ForeignKeyViolation ||
                ex.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                // Another protected relation or purge tombstone appeared.
                // The transaction rolls back; no raw SQL/PII is returned.
                return Results.Conflict(new {
                    code = "quote_purge_references",
                    error = "Existen referencias protegidas o un registro previo de eliminación; no se eliminó nada."
                });
            }

            return Results.Ok(new { id, deleted = true });
    }
}
