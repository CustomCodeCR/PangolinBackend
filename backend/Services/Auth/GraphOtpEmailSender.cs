using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Net.Mail;
using System.Text.Json;

namespace CastroFallas.MiniQuote.Api.Services.Auth;

// OAuth2 client credentials + Microsoft Graph. No se registran tokens, secretos ni OTP.
public sealed class GraphOtpEmailSender(IConfiguration configuration, IHttpClientFactory httpClientFactory)
{
    public async Task SendAsync(string recipientEmail, string otp, CancellationToken cancellationToken)
    {
        var tenantId = Required("Graph:TenantId");
        var clientId = Required("Graph:ClientId");
        var clientSecret = Required("Graph:ClientSecret");
        var from = Required("Graph:From");

        if (!Guid.TryParse(tenantId, out _) || !Guid.TryParse(clientId, out _))
            throw new InvalidOperationException("Graph:TenantId y Graph:ClientId deben ser GUID válidos.");
        if (!MailAddress.TryCreate(from, out _) || !MailAddress.TryCreate(recipientEmail, out _))
            throw new InvalidOperationException("Graph:From o destinatario no es un correo válido.");

        var http = httpClientFactory.CreateClient("PangolinGraphMail");
        using var tokenRequest = new HttpRequestMessage(
            HttpMethod.Post, $"https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["grant_type"] = "client_credentials",
                ["scope"] = "https://graph.microsoft.com/.default"
            })
        };

        using var tokenResponse = await http.SendAsync(tokenRequest, cancellationToken);
        tokenResponse.EnsureSuccessStatusCode();
        await using var tokenStream = await tokenResponse.Content.ReadAsStreamAsync(cancellationToken);
        using var tokenJson = await JsonDocument.ParseAsync(tokenStream, cancellationToken: cancellationToken);
        if (!tokenJson.RootElement.TryGetProperty("access_token", out var tokenElement) ||
            string.IsNullOrWhiteSpace(tokenElement.GetString()))
            throw new InvalidOperationException("Microsoft Entra no devolvió un token de acceso.");

        using var sendRequest = new HttpRequestMessage(
            HttpMethod.Post, $"https://graph.microsoft.com/v1.0/users/{Uri.EscapeDataString(from)}/sendMail");
        sendRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenElement.GetString());
        sendRequest.Content = JsonContent.Create(new
        {
            message = new
            {
                subject = "Código de acceso | Castro Fallas",
                body = new
                {
                    contentType = "Text",
                    content = $"Tu código temporal de Castro Fallas es: {otp}\n\nVálido durante 5 minutos y una sola vez. Si no lo solicitaste, ignorá este mensaje."
                },
                toRecipients = new[] { new { emailAddress = new { address = recipientEmail } } }
            },
            saveToSentItems = true
        });

        using var sendResponse = await http.SendAsync(sendRequest, cancellationToken);
        // Graph devuelve 202 Accepted: aceptación de la solicitud, no garantía de entrega.
        if (sendResponse.StatusCode != HttpStatusCode.Accepted)
        {
            sendResponse.EnsureSuccessStatusCode();
            throw new HttpRequestException($"Graph sendMail devolvió el estado inesperado {(int)sendResponse.StatusCode}.");
        }
    }

    private string Required(string key)
    {
        var value = configuration[key];
        return string.IsNullOrWhiteSpace(value)
            ? throw new InvalidOperationException($"Falta configuración obligatoria: {key}.")
            : value;
    }
}
