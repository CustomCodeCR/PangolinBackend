using System.Collections.Concurrent;
using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Experimento efímero: los mensajes permanecen solo en memoria hasta reiniciar la API.
[Authorize(Policy = "admin")]
public sealed class AdminChatHub : Hub
{
    public const string Path = "/api/hubs/admin-chat";
    private static readonly ConcurrentQueue<ChatMessage> History = new();
    private static readonly ConcurrentDictionary<string, DateTimeOffset> LastMessage = new();
    private static readonly ConcurrentDictionary<string, byte> Online = new();
    // Estado efímero por cuenta, nunca aceptamos la identidad del cliente.
    private static readonly ConcurrentDictionary<Guid, ReadReceipt> Seen = new();
    private const int Limit = 60;

    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext();
        var identity = http?.Items["auth.identity"] as AuthIdentity;
        // No se confía en nombre, rol ni identidad enviados por el cliente.
        if (identity is null || identity.Role != "admin")
        {
            Context.Abort();
            return;
        }
        // Un sitio tercero no debe iniciar un hub que usa cookies.
        var origin = http?.Request.Headers.Origin.ToString();
        if (!string.IsNullOrWhiteSpace(origin) &&
            (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
             !string.Equals(uri.Authority, http!.Request.Host.Value, StringComparison.OrdinalIgnoreCase) ||
             (uri.Scheme != "http" && uri.Scheme != "https")))
        {
            Context.Abort();
            return;
        }
        Online.TryAdd(Context.ConnectionId, 0);
        await Clients.Caller.SendAsync("History", History.ToArray(), Seen.Values.ToArray());
        await Clients.All.SendAsync("Presence", Online.Count);
        await base.OnConnectedAsync();
    }

    public async Task SendMessage(string? body)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        var text = body?.Trim();
        if (string.IsNullOrEmpty(text) || text.Length > 500)
            throw new HubException("El mensaje debe tener entre 1 y 500 caracteres.");
        var now = DateTimeOffset.UtcNow;
        if (LastMessage.TryGetValue(Context.ConnectionId, out var previous) && now - previous < TimeSpan.FromMilliseconds(650))
            throw new HubException("Enviás mensajes demasiado rápido.");
        LastMessage[Context.ConnectionId] = now;
        var message = new ChatMessage(Guid.NewGuid(), identity.UsuarioId, identity.NombreCliente, identity.Correo, text, now);
        History.Enqueue(message);
        while (History.Count > Limit) History.TryDequeue(out _);
        await Clients.All.SendAsync("Message", message);
    }

    // La marca de lectura solo avanza hasta un mensaje real del historial del servidor.
    // No significa "entregado": el navegador debe tener visible la conversación.
    public async Task MarkSeen(string? messageId)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        if (!Guid.TryParse(messageId, out var id)) throw new HubException("Mensaje inválido.");
        var message = History.FirstOrDefault(item => item.Id == id);
        if (message is null) return;

        var receipt = new ReadReceipt(identity.UsuarioId, identity.NombreCliente, message.SentAt);
        while (true)
        {
            if (!Seen.TryGetValue(identity.UsuarioId, out var prior))
            {
                if (Seen.TryAdd(identity.UsuarioId, receipt)) break;
            }
            else
            {
                if (prior.LastReadAt >= receipt.LastReadAt) return;
                if (Seen.TryUpdate(identity.UsuarioId, receipt, prior)) break;
            }
        }
        await Clients.All.SendAsync("Seen", receipt);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Online.TryRemove(Context.ConnectionId, out _);
        LastMessage.TryRemove(Context.ConnectionId, out _);
        await Clients.All.SendAsync("Presence", Online.Count);
        await base.OnDisconnectedAsync(exception);
    }

    public sealed record ChatMessage(Guid Id, Guid UserId, string Name, string Email, string Text, DateTimeOffset SentAt);
    public sealed record ReadReceipt(Guid UserId, string Name, DateTimeOffset LastReadAt);
}
