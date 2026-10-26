using System.Net.Http.Json;
using System.Text.Json;

namespace CastroFallas.MiniQuote.Api.Endpoints;

public sealed record DholeTrackingSearchInput(string? Type, string? Reference);

public static class DholeTrackingEndpoints
{
    public static IEndpointRouteBuilder MapDholeTracking(this IEndpointRouteBuilder app)
    {
        // Full record preview: authenticated administrators only.
        app.MapPost("/api/tracking/dynamics/search", (
            DholeTrackingSearchInput input, IConfiguration config, IHttpClientFactory clients,
            HttpContext http, CancellationToken ct) =>
            SearchAsync(input, config, clients, http, false, ct))
            .RequireAuthorization("admin").RequireRateLimiting("tracking");

        // Public lookup: only a small allowlist of logistics fields. Disabled by default.
        // A known shipment reference is NOT proof of ownership.
        app.MapPost("/api/tracking/search", (
            DholeTrackingSearchInput input, IConfiguration config, IHttpClientFactory clients,
            HttpContext http, CancellationToken ct) =>
            SearchAsync(input, config, clients, http, true, ct))
            .RequireRateLimiting("tracking-public");

        return app;
    }

    private static async Task<IResult> SearchAsync(
        DholeTrackingSearchInput input, IConfiguration config, IHttpClientFactory clients,
        HttpContext http, bool publicLookup, CancellationToken ct)
    {
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers["Pragma"] = "no-cache";

        if (!config.GetValue<bool>("DholeTracking:Enabled") ||
            (publicLookup && !config.GetValue<bool>("DholeTracking:PublicEnabled")))
            return Results.Json(new { code = "tracking_disabled", error = "El rastreo no está habilitado." },
                statusCode: StatusCodes.Status503ServiceUnavailable);

        var kind = input.Type?.Trim().ToUpperInvariant();
        var reference = input.Reference?.Trim().ToUpperInvariant();
        // Legacy BL/HBL selectors currently use the BCF lookup per business request.
        // Keep the alias explicit until logistics validates the document convention.
        var query = kind switch
        {
            "IDTRA" => (slug: "trackingbyidtranologin", parameter: "idtra"),
            "BL" or "HBL" or "BCF" => (slug: "trackingbybcfnologin", parameter: "bcf"),
            "CONTAINER" => (slug: "trackingbycontenedornologin", parameter: "contenedor"),
            "PO" => (slug: "trackingbyponologin", parameter: "po"),
            _ => (slug: "", parameter: "")
        };

        if (string.IsNullOrEmpty(query.slug) || string.IsNullOrWhiteSpace(reference) ||
            reference.Length is < 3 or > 64 ||
            reference.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_')))
            return Results.BadRequest(new { code = "invalid_reference", error = "Tipo o referencia inválidos." });

        var apiKey = config["DholeTracking:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            return Results.Json(new { code = "tracking_not_configured", error = "Rastreo no configurado." },
                statusCode: StatusCodes.Status503ServiceUnavailable);

        var client = clients.CreateClient("DholeTracking");
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"api/dynamics-connector/keyed/saved-queries/{query.slug}/execute");
        request.Headers.Add("X-Dhole-Api-Key", apiKey);
        request.Content = JsonContent.Create(new
        {
            connectionCode = "principal",
            parameters = new Dictionary<string, string> { [query.parameter] = reference }
        });

        try
        {
            using var upstream = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!upstream.IsSuccessStatusCode)
                return Results.Json(new { code = "tracking_upstream_error", error = "No fue posible consultar el rastreo." },
                    statusCode: StatusCodes.Status502BadGateway);

            await upstream.Content.LoadIntoBufferAsync(1024 * 1024, ct);
            await using var stream = await upstream.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (doc.RootElement.ValueKind != JsonValueKind.Object ||
                !doc.RootElement.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
                return Results.Json(new { code = "tracking_bad_response", error = "Respuesta inesperada." },
                    statusCode: StatusCodes.Status502BadGateway);

            bool truncated = items.GetArrayLength() > 25 ||
                (doc.RootElement.TryGetProperty("truncated", out var truncatedNode) &&
                    truncatedNode.ValueKind == JsonValueKind.True) ||
                (doc.RootElement.TryGetProperty("nextCursor", out var cursor) &&
                    cursor.ValueKind == JsonValueKind.String && !string.IsNullOrEmpty(cursor.GetString()));

            if (publicLookup)
            {
                // Never return account names, private identifiers, containers, BCF, vessel or raw Dynamics rows.
                var publicRecords = items.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.Object)
                    .Take(25).Select(item => new
                    {
                        status = GetFormatted(item, "new_preestado2"),
                        origin = GetFormatted(item, "new_origen"),
                        destination = GetFormatted(item, "new_destino"),
                        mode = GetFormatted(item, "new_transporte"),
                        portOfLoading = GetFormatted(item, "new_pol"),
                        portOfEntry = GetFormatted(item, "new_poe"),
                        etd = Get(item, "new_etd1"),
                        eta = Get(item, "new_eta")
                    }).ToArray();
                return Results.Ok(new { source = "dynamics", records = publicRecords, truncated });
            }

            var adminRecords = items.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.Object)
                .Take(25).Select(item => new
                {
                    title = Get(item, "title"),
                    status = GetFormatted(item, "new_preestado2"),
                    origin = GetFormatted(item, "new_origen"),
                    destination = GetFormatted(item, "new_destino"),
                    mode = GetFormatted(item, "new_transporte"),
                    portOfLoading = GetFormatted(item, "new_pol"),
                    portOfEntry = GetFormatted(item, "new_poe"),
                    etd = Get(item, "new_etd1"),
                    eta = Get(item, "new_eta"),
                    vessel = Get(item, "new_barcodesalida"),
                    container = Get(item, "new_contenedor"),
                    bcf = Get(item, "new_bcf"),
                    updatedAtUtc = Get(item, "modifiedon")
                }).ToArray();
            return Results.Ok(new
            {
                source = "dynamics", referenceType = kind, referenceCode = reference,
                records = adminRecords, truncated
            });
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return Results.Json(new { code = "tracking_timeout", error = "La consulta tardó demasiado." },
                statusCode: StatusCodes.Status504GatewayTimeout);
        }
        catch (HttpRequestException)
        {
            return Results.Json(new { code = "tracking_unavailable", error = "No fue posible conectar con Dhole." },
                statusCode: StatusCodes.Status502BadGateway);
        }
        catch (JsonException)
        {
            return Results.Json(new { code = "tracking_bad_response", error = "Respuesta inesperada." },
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private static string? Get(JsonElement item, string key)
    {
        if (!item.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String)
            return null;
        var text = value.GetString()?.Trim();
        return string.IsNullOrWhiteSpace(text) ? null : text.Length > 256 ? text[..256] : text;
    }

    private static string? GetFormatted(JsonElement item, string key) =>
        Get(item, key + "@OData.Community.Display.V1.FormattedValue") ?? Get(item, key);
}
