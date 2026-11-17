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

        // Admin-only, read-only preview: Dhole IDs are NOT local quote IDs.
        // Never reuse this endpoint directly in the existing quote submission flow.
        app.MapGet("/api/dhole/quote-location-preview", async (
            string mode, string role, DholeCatalogService service, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (mode is not ("Maritime" or "Air" or "Land") ||
                role is not ("origin" or "destination" or "pod") ||
                (role == "pod" && mode != "Maritime"))
                return Results.BadRequest(new { code = "invalid_catalog_selection" });

            if (!service.IsConfigured)
                return Results.Json(new { code = "catalog_not_configured" },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            try
            {
                var catalog = DholeQuoteLocationProjector.CatalogForRole(role);
                var snapshot = await service.GetAsync(catalog, ct);
                var projection = DholeQuoteLocationProjector.Project(role, mode, snapshot.Items);
                return Results.Ok(new
                {
                    source = "dhole",
                    catalog,
                    mode,
                    role,
                    fetchedAtUtc = snapshot.FetchedAtUtc,
                    stale = snapshot.Stale,
                    options = projection.Options,
                    reviewCount = projection.Issues.Length,
                    // No external UUID is accepted as OfficialQuoteLocation.Id yet.
                    submissionEnabled = false
                });
            }
            catch (DholeCatalogUnavailableException)
            {
                return Results.Json(new { code = "catalog_upstream_unavailable" },
                    statusCode: StatusCodes.Status502BadGateway);
            }
        }).RequireAuthorization("admin").RequireRateLimiting("public-read");

        // Admin-only isolated equipment preview; does NOT alter any quote form.
        app.MapGet("/api/dhole/quote-equipment-preview", async (
            DholeCatalogService service, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (!service.IsConfigured)
                return Results.Json(new { code = "catalog_not_configured" },
                    statusCode: StatusCodes.Status503ServiceUnavailable);

            try
            {
                var sizesTask = service.GetAsync("container-sizes", ct);
                var typesTask = service.GetAsync("container-types", ct);
                var trucksTask = service.GetAsync("truck-sizes", ct);
                await Task.WhenAll(sizesTask, typesTask, trucksTask);

                var sizes = await sizesTask;
                var types = await typesTask;
                var trucks = await trucksTask;
                var projection = DholeEquipmentProjector.Project(
                    sizes.Items, types.Items, trucks.Items);
                return Results.Ok(new
                {
                    source = "dhole",
                    stale = sizes.Stale || types.Stale || trucks.Stale,
                    fclCombinations = projection.FclCombinations,
                    ftlSizes = projection.FtlSizes,
                    rejectedTypeCodes = projection.RejectedTypeCodes,
                    airEquipmentDecisionPending = true,
                    submissionEnabled = false
                });
            }
            catch (DholeCatalogUnavailableException)
            {
                return Results.Json(new { code = "catalog_upstream_unavailable" },
                    statusCode: StatusCodes.Status502BadGateway);
            }
        }).RequireAuthorization("admin").RequireRateLimiting("public-read");

        return app;
    }
}
