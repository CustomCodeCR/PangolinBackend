using System.Net.Http.Json;
using System.Text.Json;

namespace CastroFallas.MiniQuote.Api.Endpoints;

// Experimental, read-only Dynamics integration. Admin authorization is enforced by the endpoint.
public static class DholeTrackingEndpoints
{
    private sealed record SearchInput(string? Type, string? Reference);

    public static IEndpointRouteBuilder MapDholeTracking(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/tracking/dynamics/search", async (
            SearchInput input, IConfiguration config, IHttpClientFactory clients,
            HttpContext http, CancellationToken cancellationToken) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (!config.GetValue<bool>("DholeTracking:Enabled"))
                return Results.Json(new { code = "tracking_disabled", error = "El rastreo de Dynamics no está habilitado." },
                    statusCode: StatusCodes.Status503ServiceUnavailable);

            var kind = input.Type?.Trim().ToUpperInvariant();
            var reference = input.Reference?.Trim().ToUpperInvariant();
            var query = kind switch
            {
                "IDTRA" => (slug: "trackingbyidtranologin", parameter: "idtra"),
                "BCF" => (slug: "trackingbybcfnologin", parameter: "bcf"),
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
                return Results.Json(new { code = "tracking_not_configured", error = "Conexión de rastreo no configurada." },
                    statusCode: StatusCodes.Status503ServiceUnavailable);

            // The browser never gets the Dhole API key or a direct Dynamics connection.
            // No user-supplied URL or query name is sent upstream.
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
                using var upstream = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                if (!upstream.IsSuccessStatusCode)
                    return Results.Json(new { code = "tracking_upstream_error", error = "No fue posible consultar el rastreo." },
                        statusCode: StatusCodes.Status502BadGateway);

                // Limit the maximum bytes read from the upstream system.
                await upstream.Content.LoadIntoBufferAsync(1024 * 1024, cancellationToken);
                await using var stream = await upstream.Content.ReadAsStreamAsync(cancellationToken);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                if (doc.RootElement.ValueKind != JsonValueKind.Object ||
                    !doc.RootElement.TryGetProperty("items", out var items) ||
                    items.ValueKind != JsonValueKind.Array)
                    return Results.Json(new { code = "tracking_bad_response", error = "Respuesta de rastreo inesperada." },
                        statusCode: StatusCodes.Status502BadGateway);

                var records = items.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.Object)
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

                bool truncated = (items.GetArrayLength() > 25) ||
                    (doc.RootElement.TryGetProperty("truncated", out var truncatedNode) &&
                     truncatedNode.ValueKind == JsonValueKind.True) ||
                    (doc.RootElement.TryGetProperty("nextCursor", out var cursor) &&
                     cursor.ValueKind == JsonValueKind.String && !string.IsNullOrEmpty(cursor.GetString()));

                return Results.Ok(new
                {
                    source = "dynamics",
                    referenceType = kind,
                    referenceCode = reference,
                    records,
                    truncated
                });
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
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
                return Results.Json(new { code = "tracking_bad_response", error = "Respuesta de rastreo inesperada." },
                    statusCode: StatusCodes.Status502BadGateway);
            }
        }).RequireAuthorization("admin").RequireRateLimiting("tracking");

        return app;
    }

    private static string? Get(JsonElement item, string key)
    {
        if (!item.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String)
            return null;
        var text = value.GetString()?.Trim();
        return string.IsNullOrWhiteSpace(text) ? null : text.Length > 256 ? text[..256] : text;
    }

    private static string? GetFormatted(JsonElement item, string key) =>
        Get(item, key + "@OData.Community.Display.V1.FormattedValue");
}
