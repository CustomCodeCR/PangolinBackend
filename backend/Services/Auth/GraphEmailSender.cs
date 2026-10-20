using System.Net.Http.Headers;
using System.Text.Json;
using System.Net.Http.Json;

namespace CastroFallas.MiniQuote.Api.Services.Auth;

/// <summary>
/// Envía correos a través de Microsoft Graph con credenciales de aplicación.
/// Nunca se llama desde el navegador ni registra claves, tokens o contenido OTP.
/// </summary>
public sealed class GraphEmailSender(HttpClient client, IConfiguration config)
{
    public async Task SendAsync(string to, string subject, string body, CancellationToken ct)
    {
        var tenant = Require("Graph:TenantId");
        var app = Require("Graph:ClientId");
        var secret = Require("Graph:ClientSecret");
        var sender = Require("Graph:From");

        if (!Guid.TryParse(tenant, out _) || !Guid.TryParse(app, out _))
            throw new InvalidOperationException("Graph:TenantId o Graph:ClientId inválido.");
        if (!System.Net.Mail.MailAddress.TryCreate(sender, out var parsed) ||
            !string.Equals(parsed.Address, sender, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Graph:From inválido.");

        using var tokenResponse = await client.PostAsync(
            $"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = app,
                ["client_secret"] = secret,
                ["scope"] = "https://graph.microsoft.com/.default",
                ["grant_type"] = "client_credentials"
            }), ct);
        if (!tokenResponse.IsSuccessStatusCode)
            throw new HttpRequestException($"No se pudo obtener token Graph (HTTP {(int)tokenResponse.StatusCode}).");

        using var tokenDocument = JsonDocument.Parse(await tokenResponse.Content.ReadAsStringAsync(ct));
        if (!tokenDocument.RootElement.TryGetProperty("access_token", out var tokenElement))
            throw new InvalidOperationException("Respuesta OAuth de Graph sin access_token.");
        var token = tokenElement.GetString();
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Token OAuth de Graph vacío.");

        var payload = new
        {
            message = new
            {
                subject,
                body = new { contentType = "Text", content = body },
                toRecipients = new[] { new { emailAddress = new { address = to } } }
            },
            saveToSentItems = false
        };
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(sender)}/sendMail")
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        // Correlación para Microsoft Support; no incluir token ni OTP en logs.
        var clientRequestId = Guid.NewGuid();
        request.Headers.Add("client-request-id", clientRequestId.ToString());
        request.Headers.Add("return-client-request-id", "true");
        using var response = await client.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            // El cuerpo de Graph puede contener datos personales. Registrar solo códigos
            // estructurados y los identificadores de correlación, nunca el mensaje libre.
            string? errorCode = null;
            string? innerCode = null;
            try
            {
                await using var stream = await response.Content.ReadAsStreamAsync(ct);
                using var errorDocument = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
                if (errorDocument.RootElement.TryGetProperty("error", out var error) &&
                    error.ValueKind == JsonValueKind.Object)
                {
                    errorCode = SafeCode(error);
                    if ((error.TryGetProperty("innerError", out var inner) ||
                         error.TryGetProperty("innererror", out inner)) &&
                        inner.ValueKind == JsonValueKind.Object)
                        innerCode = SafeCode(inner);
                }
            }
            catch (JsonException)
            {
                // Las respuestas intermedias pueden no contener JSON válido.
            }

            string graphRequestId = "unavailable";
            if (response.Headers.TryGetValues("request-id", out var requestIds) &&
                Guid.TryParse(requestIds.FirstOrDefault(), out var parsedRequestId))
                graphRequestId = parsedRequestId.ToString();

            throw new HttpRequestException(
                $"Microsoft Graph rechazó sendMail (HTTP {(int)response.StatusCode}, " +
                $"graphCode={errorCode ?? "unknown"}, innerCode={innerCode ?? "unknown"}, " +
                $"requestId={graphRequestId}, clientRequestId={clientRequestId}).");
        }
        // HTTP 202 indica aceptación de Graph, no garantiza entrega final en el buzón.
    }

    private static string? SafeCode(JsonElement element)
    {
        if (!element.TryGetProperty("code", out var prop) || prop.ValueKind != JsonValueKind.String)
            return null;
        var code = prop.GetString();
        if (string.IsNullOrEmpty(code) || code.Length > 96) return null;
        foreach (var ch in code)
            if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
                  (ch >= '0' && ch <= '9') || ch is '_' or '-' or '.'))
                return null;
        return code;
    }

    private string Require(string key) =>
        config[key] is { Length: > 0 } value && !string.IsNullOrWhiteSpace(value)
            ? value.Trim()
            : throw new InvalidOperationException($"Falta configuración {key}.");
}
