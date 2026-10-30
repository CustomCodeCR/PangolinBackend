using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Direct threads are isolated from the group timeline and held only in memory.
// Every read/write validates the signed-in administrator and the other active admin account.
public sealed partial class AdminChatHub
{
    private readonly AppDbContext _chatDb;
    private static readonly Dictionary<string, Queue<ChatMessage>> DirectThreads = new();
    private static readonly Queue<string> DirectThreadOrder = new();
    private static readonly Dictionary<string, DateTimeOffset> DirectReadAt = new();
    private const int MaxDirectThreads = 100;
    private const int MaxDirectMessages = 60;

    public sealed record DirectContact(Guid UserId, string Name, bool Online,
        string? AvatarUrl, int UnreadCount, DateTimeOffset? LastMessageAt);

    private static string DirectThreadKey(Guid first, Guid second) =>
        first.CompareTo(second) < 0 ? $"{first:N}:{second:N}" : $"{second:N}:{first:N}";
    private static string DirectReadKey(Guid viewer, Guid other) => $"{viewer:N}:{other:N}";

    private AuthIdentity RequireDirectAdmin()
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin")
            throw new HubException("Solo administradores autenticados.");
        return identity;
    }

    private async Task<Guid> CheckDirectPeer(Guid viewer, string? otherId, CancellationToken ct)
    {
        if (!Guid.TryParse(otherId, out var peer) || peer == viewer)
            throw new HubException("Seleccioná otra cuenta administradora.");
        var exists = await _chatDb.Usuarios.AsNoTracking().AnyAsync(user =>
            user.Uuid == peer && user.TipoAcceso == "usuario" &&
            user.Status && user.DeletedAt == null &&
            user.Cliente.Status && user.Cliente.DeletedAt == null, ct);
        if (!exists) throw new HubException("La cuenta seleccionada ya no está disponible.");
        return peer;
    }

    public async Task<DirectContact[]> GetDirectContacts()
    {
        var identity = RequireDirectAdmin();
        var users = await _chatDb.Usuarios.AsNoTracking()
            .Where(user => user.Uuid != identity.UsuarioId &&
                user.TipoAcceso == "usuario" && user.Status && user.DeletedAt == null &&
                user.Cliente.Status && user.Cliente.DeletedAt == null)
            .OrderBy(user => user.Correo)
            .Select(user => new { user.Uuid, user.Correo })
            .Take(150).ToArrayAsync(Context.ConnectionAborted);
        var onlineIds = ConnectedUsers.Values.ToHashSet();
        await ChatMutations.WaitAsync(Context.ConnectionAborted);
        try
        {
            return users.Select(user =>
            {
                var threadKey = DirectThreadKey(identity.UsuarioId, user.Uuid);
                var thread = DirectThreads.GetValueOrDefault(threadKey);
                var lastRead = DirectReadAt.GetValueOrDefault(DirectReadKey(identity.UsuarioId, user.Uuid),
                    DateTimeOffset.MinValue);
                var unread = thread?.Count(message => message.UserId == user.Uuid &&
                    message.RecipientId == identity.UsuarioId && message.SentAt > lastRead) ?? 0;
                var last = thread?.LastOrDefault();
                var fallback = user.Correo.Split('@')[0];
                var name = Nicknames.GetValueOrDefault(user.Uuid) ?? fallback;
                string? image = Avatars.TryGetValue(user.Uuid, out var avatar) &&
                    _images.Find(avatar) is not null ? AdminChatMediaStore.Url(avatar) : null;
                return new DirectContact(user.Uuid, name, onlineIds.Contains(user.Uuid),
                    image, unread, last?.SentAt);
            }).OrderByDescending(user => user.LastMessageAt)
                .ThenBy(user => user.Name).ToArray();
        }
        finally { ChatMutations.Release(); }
    }

    public async Task<ChatMessage[]> OpenDirectChat(string? peerId)
    {
        var identity = RequireDirectAdmin();
        var peer = await CheckDirectPeer(identity.UsuarioId, peerId, Context.ConnectionAborted);
        await ChatMutations.WaitAsync(Context.ConnectionAborted);
        try
        {
            if (IsBlocked(identity.UsuarioId, peer) || IsBlocked(peer, identity.UsuarioId))
                throw new HubException("Esta conversación está bloqueada.");
            DirectReadAt[DirectReadKey(identity.UsuarioId, peer)] = DateTimeOffset.UtcNow;
            var key = DirectThreadKey(identity.UsuarioId, peer);
            return DirectThreads.TryGetValue(key, out var messages)
                ? messages.Select(message => PersonalizeMessage(message, identity.UsuarioId)).ToArray()
                : Array.Empty<ChatMessage>();
        }
        finally { ChatMutations.Release(); }
    }

    public async Task MarkDirectSeen(string? peerId)
    {
        var identity = RequireDirectAdmin();
        var peer = await CheckDirectPeer(identity.UsuarioId, peerId, Context.ConnectionAborted);
        await ChatMutations.WaitAsync(Context.ConnectionAborted);
        try
        {
            if (IsBlocked(identity.UsuarioId, peer) || IsBlocked(peer, identity.UsuarioId)) return;
            DirectReadAt[DirectReadKey(identity.UsuarioId, peer)] = DateTimeOffset.UtcNow;
        }
        finally { ChatMutations.Release(); }
    }

    public Task SendDirectText(string? peerId, string? body, string? replyToId = null) =>
        SendDirectCore(peerId, body, replyToId, null, null, null);

    public Task SendDirectMedia(string? peerId, string? imageId, string? caption,
        string? replyToId, string? mode)
    {
        if (mode is not ("image" or "sticker" or "once"))
            throw new HubException("Formato de imagen no permitido.");
        return SendDirectCore(peerId, caption, replyToId, imageId, mode, null);
    }

    public Task SendDirectVoice(string? peerId, string? audioId, string? caption,
        string? replyToId = null) =>
        SendDirectCore(peerId, caption, replyToId, null, null, audioId);

    private async Task SendDirectCore(string? peerId, string? body, string? replyToId,
        string? imageId, string? imageMode, string? audioId)
    {
        var identity = RequireDirectAdmin();
        var recipient = await CheckDirectPeer(identity.UsuarioId, peerId, Context.ConnectionAborted);
        var text = body?.Trim() ?? "";
        if (text.Length > 500 || (text.Length == 0 && imageId is null && audioId is null))
            throw new HubException("Escribí un mensaje o adjuntá una imagen o audio.");

        Guid? mediaId = null;
        Guid? voiceId = null;
        if (imageId is not null)
        {
            if (!Guid.TryParse(imageId, out var id) ||
                !_images.IsOwned(id, identity.UsuarioId, avatar: false))
                throw new HubException("No se pudo verificar la imagen adjunta.");
            mediaId = id;
        }
        if (audioId is not null)
        {
            if (!Guid.TryParse(audioId, out var id) ||
                !_audio.IsOwnedUnpublished(id, identity.UsuarioId))
                throw new HubException("No se pudo verificar el audio adjunto.");
            voiceId = id;
        }

        var now = DateTimeOffset.UtcNow;
        await ChatMutations.WaitAsync(Context.ConnectionAborted);
        try
        {
            if (IsBlocked(identity.UsuarioId, recipient) || IsBlocked(recipient, identity.UsuarioId))
                throw new HubException("No podés enviar mensajes a esta conversación.");
            if (LastMessage.TryGetValue(Context.ConnectionId, out var prior) &&
                now - prior < TimeSpan.FromMilliseconds(650))
                throw new HubException("Enviás mensajes demasiado rápido.");
            var threadKey = DirectThreadKey(identity.UsuarioId, recipient);
            if (!DirectThreads.TryGetValue(threadKey, out var thread))
            {
                if (DirectThreads.Count >= MaxDirectThreads &&
                    DirectThreadOrder.TryDequeue(out var oldest))
                    DirectThreads.Remove(oldest);
                DirectThreads[threadKey] = thread = new Queue<ChatMessage>();
                DirectThreadOrder.Enqueue(threadKey);
            }

            ChatReply? reply = null;
            if (!string.IsNullOrWhiteSpace(replyToId))
            {
                if (!Guid.TryParse(replyToId, out var replyId))
                    throw new HubException("Referencia del mensaje inválida.");
                var original = thread.FirstOrDefault(message => message.Id == replyId);
                if (original is null) throw new HubException("El mensaje al que respondés ya no existe.");
                var snippet = original.Text.Length > 0 ? original.Text :
                    original.IsViewOnce ? "Foto de una vez" :
                    original.IsSticker ? "Sticker" :
                    original.ImageId is not null ? "Imagen" : "Mensaje de voz";
                reply = new ChatReply(original.Id, original.UserId, original.Name,
                    snippet.Length > 140 ? snippet[..140] + "…" : snippet);
            }

            if (mediaId is Guid image && !_images.Publish(image, identity.UsuarioId,
                imageMode == "once", recipient))
                throw new HubException("La imagen ya no se encuentra disponible.");
            if (voiceId is Guid voice && !_audio.Publish(voice, identity.UsuarioId, recipient))
                throw new HubException("El audio ya no está disponible.");

            var message = new ChatMessage(Guid.NewGuid(), identity.UsuarioId,
                DisplayName(identity), identity.Correo, text, DateTimeOffset.UtcNow, reply,
                mediaId is Guid img && imageMode != "once" ? AdminChatMediaStore.Url(img) : null,
                mediaId, imageMode == "once", imageMode == "sticker",
                Array.Empty<ChatReaction>(), false,
                voiceId is Guid aud ? AdminChatAudioStore.Url(aud) : null, recipient);
            LastMessage[Context.ConnectionId] = now;
            thread.Enqueue(message);
            while (thread.Count > MaxDirectMessages && thread.TryDequeue(out var removed))
                ReactionsByMessage.Remove(removed.Id);
            await Clients.Group(PersonalGroup(identity.UsuarioId)).SendAsync("DirectMessage", message);
            await Clients.Group(PersonalGroup(recipient)).SendAsync("DirectMessage", message);
            await Clients.Group(PersonalGroup(identity.UsuarioId))
                .SendAsync("DirectInboxUpdated", recipient);
            await Clients.Group(PersonalGroup(recipient))
                .SendAsync("DirectInboxUpdated", identity.UsuarioId);
        }
        finally { ChatMutations.Release(); }
    }

    public async Task ToggleDirectReaction(string? peerId, string? messageId, string? emoji)
    {
        var identity = RequireDirectAdmin();
        var peer = await CheckDirectPeer(identity.UsuarioId, peerId, Context.ConnectionAborted);
        if (!Guid.TryParse(messageId, out var id) || emoji is null ||
            !AllowedReactions.Contains(emoji)) throw new HubException("Reacción inválida.");
        ReactionNames[identity.UsuarioId] = DisplayName(identity);
        await ChatMutations.WaitAsync(Context.ConnectionAborted);
        try
        {
            if (IsBlocked(identity.UsuarioId, peer) || IsBlocked(peer, identity.UsuarioId))
                throw new HubException("Conversación bloqueada.");
            var key = DirectThreadKey(identity.UsuarioId, peer);
            if (!DirectThreads.TryGetValue(key, out var thread) ||
                !thread.Any(message => message.Id == id))
                throw new HubException("El mensaje no pertenece a tu conversación.");
            if (!ReactionsByMessage.TryGetValue(id, out var all))
                ReactionsByMessage[id] = all = new Dictionary<string, HashSet<Guid>>();
            if (!all.TryGetValue(emoji, out var users))
                all[emoji] = users = new HashSet<Guid>();
            if (!users.Add(identity.UsuarioId)) users.Remove(identity.UsuarioId);
            if (users.Count == 0) all.Remove(emoji);
            if (all.Count == 0) ReactionsByMessage.Remove(id);
            var reactions = ReadReactions(id);
            await Clients.Group(PersonalGroup(identity.UsuarioId))
                .SendAsync("DirectReactionChanged", id, reactions);
            await Clients.Group(PersonalGroup(peer))
                .SendAsync("DirectReactionChanged", id, reactions);
        }
        finally { ChatMutations.Release(); }
    }
}
