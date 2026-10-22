using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Endpoints;

public static class TrackingDemoEndpoints
{
    public static IEndpointRouteBuilder MapTrackingDemo(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/tracking/demo", async (
            string? type, string? reference, AppDbContext db, IHostEnvironment env,
            HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (!env.IsDevelopment()) return Results.NotFound();
            var kind = type?.Trim().ToUpperInvariant();
            var code = reference?.Trim().ToUpperInvariant();
            if (kind is not ("BL" or "HBL" or "IDTRA" or "CONTAINER" or "PO") ||
                string.IsNullOrEmpty(code) || code.Length is < 3 or > 64 ||
                code.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_')))
                return Results.BadRequest(new { error = "Tipo o referencia de prueba inválidos." });

            var shipment = await db.TrackingDemoShipments.AsNoTracking()
                .Where(x => x.IsDemo && x.ReferenceType == kind && x.ReferenceCode == code)
                .Select(x => new
                {
                    demo = true,
                    referenceType = x.ReferenceType,
                    referenceCode = x.ReferenceCode,
                    origin = new { name = x.OriginName, lat = x.OriginLat, lon = x.OriginLon },
                    destination = new { name = x.DestinationName, lat = x.DestinationLat, lon = x.DestinationLon },
                    status = x.Status,
                    progressPercent = x.ProgressPercent,
                    etd = x.Etd,
                    eta = x.Eta,
                    updatedAtUtc = x.UpdatedAtUtc
                }).SingleOrDefaultAsync(ct);

            return shipment is null
                ? Results.NotFound(new { error = "No hay un embarque de demostración con esa referencia." })
                : Results.Ok(shipment);
        }).RequireRateLimiting("tracking");
        return app;
    }
}
