using CastroFallas.MiniQuote.Api.Services;

namespace CastroFallas.MiniQuote.Api.Endpoints;

public static class DholeCatalogEndpoints
{
    public static IEndpointRouteBuilder MapDholeCatalogs(this IEndpointRouteBuilder app)
    {
        // Independent from /api/quotes/official and /api/itinerarios while the
        // local UUID reconciliation and form migration are still being designed.
        app.MapGet("/api/dhole/catalogs/{catalog}", async (
            string catalog, DholeCatalogService service, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";

            if (!DholeCatalogService.IsKnownCatalog(catalog))
                return Results.NotFound(new { code = "unknown_catalog" });

            if (!service.IsConfigured)
                return Results.Json(new { code = "catalog_not_configured" },
                    statusCode: StatusCodes.Status503ServiceUnavailable);

            try
            {
                var snapshot = await service.GetAsync(catalog, ct);
                return Results.Ok(new
                {
                    catalog = snapshot.Catalog,
                    fetchedAtUtc = snapshot.FetchedAtUtc,
                    stale = snapshot.Stale,
                    items = snapshot.Items
                });
            }
            catch (DholeCatalogUnavailableException)
            {
                return Results.Json(new { code = "catalog_upstream_unavailable" },
                    statusCode: StatusCodes.Status502BadGateway);
            }
        }).RequireRateLimiting("public-read");

        return app;
    }
}
