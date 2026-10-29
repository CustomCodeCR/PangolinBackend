using System.Collections.Concurrent;
using System.Text.RegularExpressions;
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
    private static readonly SemaphoreSlim ChatMutations = new(1, 1);
    private static readonly ConcurrentDictionary<string, DateTimeOffset> LastMessage = new();
    private static readonly ConcurrentDictionary<string, byte> Online = new();
    // Estado efímero por cuenta, nunca aceptamos la identidad del cliente.
    private static readonly ConcurrentDictionary<Guid, ReadReceipt> Seen = new();
    // Solo es una etiqueta de presentación para este chat, no cambia identidad ni permisos.
    private static readonly ConcurrentDictionary<Guid, string> Nicknames = new();
    private static readonly ConcurrentDictionary<Guid, Guid> Avatars = new();
    private readonly AdminChatMediaStore _images;

    public AdminChatHub(AdminChatMediaStore images) => _images = images;
    // Presencia temporal por conexión: nunca se transmite el contenido del borrador.
    private static readonly ConcurrentDictionary<string, TypingStatus> Typing = new();
    private static readonly TimeSpan TypingLifetime = TimeSpan.FromSeconds(5);
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
        Nicknames.TryGetValue(identity.UsuarioId, out var nickname);
        await Clients.Caller.SendAsync("ChatProfile", new { displayName = nickname ?? identity.NombreCliente, customName = nickname });
        await Clients.Caller.SendAsync("AvatarSnapshot", Avatars
            .Where(entry => _images.Find(entry.Value) is not null)
            .Select(entry => new { userId = entry.Key, url = AdminChatMediaStore.Url(entry.Value) }).ToArray());
        await ChatMutations.WaitAsync();
        try { await Clients.Caller.SendAsync("History", History.ToArray(), Seen.Values.ToArray()); }
        finally { ChatMutations.Release(); }
        await Clients.Caller.SendAsync("TypingSnapshot", Typing.Values
            .Where(x => x.ConnectionId != Context.ConnectionId && x.ExpiresAt > DateTimeOffset.UtcNow)
            .ToArray());
        await Clients.All.SendAsync("Presence", Online.Count);
        await base.OnConnectedAsync();
    }

    // El apodo lo decide cada administrador autenticado, nunca modifica la cuenta.
    // La API toma el ID de la sesión JWT revocable, no del navegador.
    public async Task<string> SetDisplayName(string? requested)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        var value = Regex.Replace(requested?.Trim() ?? "", @"\s+", " ");
        if (value.Length > 32 || (value.Length > 0 && value.Length < 2) ||
            value.Any(char.IsControl))
            throw new HubException("Usá un apodo de 2 a 32 caracteres.");

        if (value.Length == 0)
            Nicknames.TryRemove(identity.UsuarioId, out _);
        else
            Nicknames[identity.UsuarioId] = value;

        var display = value.Length > 0 ? value : identity.NombreCliente;
        // Una actualización del nombre no da acceso a cuentas ajenas.
        await Clients.All.SendAsync("NicknameChanged", identity.UsuarioId, display);
        return display;
    }

    public async Task SetAvatarImage(string? imageId)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        string? url = null;
        if (!string.IsNullOrWhiteSpace(imageId))
        {
            if (!Guid.TryParse(imageId, out var id) ||
                !_images.IsOwned(id, identity.UsuarioId, avatar: true))
                throw new HubException("La foto no pertenece a tu cuenta.");
            Avatars[identity.UsuarioId] = id;
            url = AdminChatMediaStore.Url(id);
        }
        else
        {
            Avatars.TryRemove(identity.UsuarioId, out _);
        }
        await Clients.All.SendAsync("AvatarChanged", identity.UsuarioId, url);
    }

    private static string DisplayName(AuthIdentity identity) =>
        Nicknames.TryGetValue(identity.UsuarioId, out var nickname)
            ? nickname : identity.NombreCliente;

    // Estado de escritura autenticado y efímero. Se identifica por conexión para que
    // dos pestañas del mismo administrador no se pisen entre sí.
    public async Task SetTyping(bool isTyping)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");

        if (!isTyping)
        {
            await ClearTypingAsync();
            return;
        }

        var now = DateTimeOffset.UtcNow;
        if (Typing.TryGetValue(Context.ConnectionId, out var prior) &&
            now - prior.UpdatedAt < TimeSpan.FromMilliseconds(900))
            return;

        var state = new TypingStatus(
            Context.ConnectionId, identity.UsuarioId, DisplayName(identity),
            true, now.Add(TypingLifetime), now);
        Typing[Context.ConnectionId] = state;
        await Clients.Others.SendAsync("TypingChanged", state);
    }

    private async Task ClearTypingAsync()
    {
        if (Typing.TryRemove(Context.ConnectionId, out var state))
            await Clients.Others.SendAsync("TypingChanged", state with { IsTyping = false });
    }

    // Vaciar el historial es una operación del administrador aplicada a todos los clientes.
    public async Task ClearChat()
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");

        await ChatMutations.WaitAsync();
        try
        {
            while (History.TryDequeue(out _)) { }
            Seen.Clear();
            _images.ClearMessageImages();
            await Clients.All.SendAsync("ChatCleared", new { clearedAt = DateTimeOffset.UtcNow, clearedBy = DisplayName(identity) });
        }
        finally { ChatMutations.Release(); }
    }

    // Se conserva el método original para navegadores que aún tienen el frontend anterior.
    public Task SendMessage(string? body) => SendCore(body, null, null);

    // La referencia viaja como ID: autor y texto se obtienen exclusivamente del servidor.
    public Task ReplyToMessage(string? body, string? replyToId) => SendCore(body, replyToId, null);

    public Task SendImage(string? imageId, string? caption, string? replyToId) =>
        SendCore(caption, replyToId, imageId);

    private async Task SendCore(string? body, string? replyToId, string? imageId)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        var text = body?.Trim();
        if (text is null || text.Length > 500 || (text.Length == 0 && imageId is null))
            throw new HubException("Enviá texto o una imagen (máximo 500 caracteres).");

        string? imageUrl = null;
        if (imageId is not null)
        {
            if (!Guid.TryParse(imageId, out var id) ||
                !_images.IsOwned(id, identity.UsuarioId, avatar: false))
                throw new HubException("La imagen no pertenece a tu cuenta.");
            imageUrl = AdminChatMediaStore.Url(id);
        }

        ChatReply? reply = null;
        if (replyToId is not null)
        {
            if (!Guid.TryParse(replyToId, out var originalId))
                throw new HubException("La referencia del mensaje no es válida.");
            var original = History.FirstOrDefault(item => item.Id == originalId);
            if (original is null)
                throw new HubException("El mensaje original ya no está en el historial temporal.");
            var replyText = string.IsNullOrWhiteSpace(original.Text) ? "📷 Imagen" : original.Text;
            var excerpt = replyText.Length > 140 ? replyText[..140].TrimEnd() + "…" : replyText;
            reply = new ChatReply(original.Id, original.Name, excerpt);
        }

        var now = DateTimeOffset.UtcNow;
        if (LastMessage.TryGetValue(Context.ConnectionId, out var previous) &&
            now - previous < TimeSpan.FromMilliseconds(650))
            throw new HubException("Enviás mensajes demasiado rápido.");

        LastMessage[Context.ConnectionId] = now;
        await ClearTypingAsync();
        var message = new ChatMessage(
            Guid.NewGuid(), identity.UsuarioId, DisplayName(identity),
            identity.Correo, text, now, reply, imageUrl);
        await ChatMutations.WaitAsync();
        try
        {
            if (replyToId is not null &&
                (!Guid.TryParse(replyToId, out var targetId) ||
                 !History.Any(item => item.Id == targetId)))
                throw new HubException("El mensaje original ya no está disponible.");
            if (imageId is not null &&
                (!Guid.TryParse(imageId, out var originalImageId) ||
                 !_images.IsOwned(originalImageId, identity.UsuarioId, avatar: false)))
                throw new HubException("La imagen ya no está disponible. Adjuntala nuevamente.");
            History.Enqueue(message);
            while (History.Count > Limit) History.TryDequeue(out _);
            await Clients.All.SendAsync("Message", message);
        }
        finally { ChatMutations.Release(); }
    }

    // La marca de lectura solo avanza hasta un mensaje real del historial del servidor.
    // No significa "entregado": el navegador debe tener visible la conversación.
    public async Task MarkSeen(string? messageId)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        if (!Guid.TryParse(messageId, out var id)) throw new HubException("Mensaje inválido.");

        await ChatMutations.WaitAsync();
        try
        {
            var message = History.FirstOrDefault(item => item.Id == id);
            if (message is null) return;
            var receipt = new ReadReceipt(identity.UsuarioId, DisplayName(identity), message.SentAt);
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
        finally { ChatMutations.Release(); }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Online.TryRemove(Context.ConnectionId, out _);
        LastMessage.TryRemove(Context.ConnectionId, out _);
        await ClearTypingAsync();
        await Clients.All.SendAsync("Presence", Online.Count);
        await base.OnDisconnectedAsync(exception);
    }

    public sealed record ChatMessage(Guid Id, Guid UserId, string Name, string Email, string Text, DateTimeOffset SentAt, ChatReply? ReplyTo, string? ImageUrl);
    public sealed record ChatReply(Guid Id, string Name, string Text);
    public sealed record ReadReceipt(Guid UserId, string Name, DateTimeOffset LastReadAt);
    public sealed record TypingStatus(
        string ConnectionId, Guid UserId, string Name, bool IsTyping,
        DateTimeOffset ExpiresAt, DateTimeOffset UpdatedAt);
}
