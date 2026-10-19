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
        using var response = await client.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Microsoft Graph rechazó sendMail (HTTP {(int)response.StatusCode}).");
        // HTTP 202 indica aceptación de Graph, no garantiza entrega final en el buzón.
    }

    private string Require(string key) =>
        config[key] is { Length: > 0 } value && !string.IsNullOrWhiteSpace(value)
            ? value.Trim()
            : throw new InvalidOperationException($"Falta configuración {key}.");
}
