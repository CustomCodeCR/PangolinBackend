using System.Net.Http.Headers;
using System.Text.Json;
using System.Net.Http.Json;

namespace CastroFallas.MiniQuote.Api.Services.Auth;

/// <summary>
/// Envía correos a través de Microsoft Graph con credenciales de aplicación.
/// Nunca se llama desde el navegador ni registra claves, tokens o contenido OTP.
/// </summary>
public sealed record InlineEmailImage(string FileName, string MimeType, string ContentId, byte[] Content);

public sealed class GraphEmailSender(HttpClient client, IConfiguration config)
{
    public async Task SendAsync(string to, string subject, string body, CancellationToken ct, string? htmlBody = null, IReadOnlyList<InlineEmailImage>? inlineImages = null)
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

        // HttpClient.Timeout applies per request: OAuth and sendMail can each
        // take up to 20 seconds. Bound the complete two-step operation so a
        // stalled Microsoft provider cannot prolong the OTP form indefinitely.
        // A shorter budget can be supplied for isolated regression tests.
        var configuredSeconds = config.GetValue<int?>("Graph:TotalTimeoutSeconds");
        var budgetSeconds = Math.Clamp(configuredSeconds ?? 25, 1, 25);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(budgetSeconds));
        var graphCt = deadline.Token;

        using var tokenResponse = await client.PostAsync(
            $"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = app,
                ["client_secret"] = secret,
                ["scope"] = "https://graph.microsoft.com/.default",
                ["grant_type"] = "client_credentials"
            }), graphCt);
        if (!tokenResponse.IsSuccessStatusCode)
            throw new HttpRequestException($"No se pudo obtener token Graph (HTTP {(int)tokenResponse.StatusCode}).");

        using var tokenDocument = JsonDocument.Parse(await tokenResponse.Content.ReadAsStringAsync(graphCt));
        if (!tokenDocument.RootElement.TryGetProperty("access_token", out var tokenElement))
            throw new InvalidOperationException("Respuesta OAuth de Graph sin access_token.");
        var token = tokenElement.GetString();
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Token OAuth de Graph vacío.");

        var graphMessage = new Dictionary<string, object>
        {
            ["subject"] = subject,
            ["body"] = new { contentType = htmlBody is null ? "Text" : "HTML", content = htmlBody ?? body },
            ["toRecipients"] = new[] { new { emailAddress = new { address = to } } }
        };
        if (inlineImages is { Count: > 0 })
        {
            // Images travel with the message. Outlook/Gmail need no public image URLs.
            graphMessage["attachments"] = inlineImages.Select(image =>
                new Dictionary<string, object>
                {
                    ["@odata.type"] = "#microsoft.graph.fileAttachment",
                    ["name"] = image.FileName,
                    ["contentType"] = image.MimeType,
                    ["contentId"] = image.ContentId,
                    ["isInline"] = true,
                    ["contentBytes"] = Convert.ToBase64String(image.Content)
                }).ToArray();
        }
        var payload = new { message = graphMessage, saveToSentItems = false };
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
        using var response = await client.SendAsync(request, graphCt);
        if (!response.IsSuccessStatusCode)
        {
            // El cuerpo de Graph puede contener datos personales. Registrar solo códigos
            // estructurados y los identificadores de correlación, nunca el mensaje libre.
            string? errorCode = null;
            string? innerCode = null;
            try
            {
                await using var stream = await response.Content.ReadAsStreamAsync(graphCt);
                using var errorDocument = await JsonDocument.ParseAsync(stream, cancellationToken: graphCt);
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
