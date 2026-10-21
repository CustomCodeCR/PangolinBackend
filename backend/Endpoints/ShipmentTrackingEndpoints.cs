using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Endpoints;

public static class ShipmentTrackingEndpoints
{
    private static readonly HashSet<string> Kinds =
        new(StringComparer.Ordinal) { "BL", "HBL", "IDTRA", "CONTAINER", "PO" };

    public static IEndpointRouteBuilder MapShipmentTracking(this IEndpointRouteBuilder app)
    {
        // Consulta sin sesión: únicamente datos marcados explícitamente para difusión.
        // No exponer un CRUD público ni datos de clientes a partir de referencias adivinables.
        app.MapGet("/api/tracking/search", async (
            string? kind, string? reference, AppDbContext db, HttpContext http,
            CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            var normalizedKind = kind?.Trim().ToUpperInvariant();
            var normalizedReference = reference?.Trim().ToUpperInvariant();

            if (normalizedKind is null || !Kinds.Contains(normalizedKind) ||
                normalizedReference is null || normalizedReference.Length is < 5 or > 100 ||
                !normalizedReference.All(c => c is >= 'A' and <= 'Z' or >= '0' and <= '9' or '-' or '_' or '/'))
                return Results.BadRequest(new { error = "Revisá el tipo y la referencia (5 a 100 caracteres)." });

            var shipment = await db.ShipmentTrackings.AsNoTracking()
                .Where(x => x.ReferenceKind == normalizedKind &&
                            x.ReferenceNormalized == normalizedReference && x.IsPublic)
                .Select(x => new
                {
                    x.Id,
                    kind = x.ReferenceKind,
                    reference = x.ReferenceNormalized,
                    x.Status,
                    x.Origin,
                    x.Destination,
                    x.Eta,
                    updatedAt = x.UpdatedAtUtc,
                    x.IsDemo
                }).SingleOrDefaultAsync(ct);

            // Respuesta indistinguible entre inexistente y privado.
            if (shipment is null)
                return Results.NotFound(new { error = "No se encontró un embarque disponible para consulta." });

            var events = await db.ShipmentTrackingEvents.AsNoTracking()
                .Where(x => x.TrackingId == shipment.Id)
                .OrderByDescending(x => x.EventAtUtc).ThenByDescending(x => x.Id)
                .Take(30)
                .Select(x => new
                {
                    at = x.EventAtUtc,
                    x.Status,
                    x.Location,
                    x.Description
                }).ToListAsync(ct);

            return Results.Ok(new
            {
                shipment.kind,
                shipment.reference,
                shipment.Status,
                shipment.Origin,
                shipment.Destination,
                shipment.Eta,
                shipment.updatedAt,
                shipment.IsDemo,
                events
            });
        }).RequireRateLimiting("tracking");

        return app;
    }
}
