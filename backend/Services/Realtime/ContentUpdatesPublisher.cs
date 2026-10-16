using Microsoft.AspNetCore.SignalR;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Mensajes mínimos, sin datos privados. Falla el canal en tiempo real,
// no la escritura ya confirmada en PostgreSQL.
public sealed class ContentUpdatesPublisher(
    IHubContext<ContentUpdatesHub> hub, ILogger<ContentUpdatesPublisher> logger)
{
    private static object Message(string resource) => new
    {
        type = "data-changed",
        eventId = Guid.NewGuid().ToString(),
        resource,
        timestamp = DateTimeOffset.UtcNow
    };

    private async Task DeliverAsync(IClientProxy recipients, string resource)
    {
        try { await recipients.SendCoreAsync("DataChanged", [Message(resource)]); }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo entregar el aviso de actualización para {Resource}", resource);
        }
    }

    // Solo información pública (noticias publicadas, portada, etc).
    public Task PublicAsync(string resource) => DeliverAsync(hub.Clients.All, resource);
    // Metadatos de las áreas de administración, nunca contenido de usuarios.
    public Task AdminsAsync(string resource) => DeliverAsync(hub.Clients.Group(ContentUpdatesHub.Admins), resource);
    public Task RegisteredAsync(string resource) => DeliverAsync(hub.Clients.Group(ContentUpdatesHub.Registered), resource);
    // Una cotización de administrador pertenece solamente a ese usuario;
    // una cotización de cliente pertenece a su empresa (excluye admins).
    public Task QuoteAsync(Guid userId, Guid customerId, bool isAdmin) =>
        DeliverAsync(hub.Clients.Group(isAdmin
            ? ContentUpdatesHub.User(userId)
            : ContentUpdatesHub.Customer(customerId)), "quotes");
}
