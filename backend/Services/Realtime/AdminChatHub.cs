using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using CastroFallas.MiniQuote.Api.Services.Auth;
using CastroFallas.MiniQuote.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Experimento efímero: los mensajes permanecen solo en memoria hasta reiniciar la API.
[Authorize(Policy = "admin")]
public sealed partial class AdminChatHub : Hub
{
    public const string Path = "/api/hubs/admin-chat";
    private static readonly ConcurrentQueue<ChatMessage> History = new();
    private static readonly SemaphoreSlim ChatMutations = new(1, 1);
    // Hasta qué fecha ocultó el historial cada administrador. Estado temporal por cuenta.
    private static readonly ConcurrentDictionary<Guid, DateTimeOffset> ClearedForUser = new();
    internal static string PersonalGroup(Guid userId) => $"admin-chat-user:{userId:N}";
    private static readonly Dictionary<Guid, Dictionary<string, HashSet<Guid>>> ReactionsByMessage = new();
    // Server-verified names let every admin see who reacted, even without a message from that user.
    private static readonly ConcurrentDictionary<Guid, string> ReactionNames = new();
    // Temporary, per-account one-way hide lists. Accessed only under ChatMutations.
    private static readonly Dictionary<Guid, HashSet<Guid>> BlockedByUser = new();
    private static readonly Dictionary<Guid, Queue<ChatBlockNotice>> BlockNotices = new();
    private static readonly ConcurrentDictionary<Guid, DateTimeOffset> LastBlockAction = new();
    private static readonly ConcurrentDictionary<string, Guid> ConnectedUsers = new();
    private const int MaxBlockedUsers = 35;
    private const int MaxBlockNotices = 30;
    private static readonly string[] AllowedReactions = [
        "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "👌", "✌️", "🤞",
        "❤️", "🩷", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔",
        "😂", "🤣", "🥹", "😊", "😍", "🥰", "😘", "😎", "🤩", "🥳",
        "😀", "😁", "😅", "😉", "😌", "😋", "😜", "🤪", "🤔", "🤨",
        "😮", "😱", "😳", "🥺", "😢", "😭", "😤", "😡", "🤯", "😴",
        "👀", "💯", "🔥", "✨", "🎉", "🎊", "🎈", "🎂", "🎁", "🏆",
        "⭐", "🌟", "🚀", "💡", "✅", "❌", "⚠️", "📌", "💬", "🫶",
        "🐱", "🐶", "🐼", "🐸", "🦄", "🍕", "🍔", "🍩", "☕", "🍓", "🦞", "🏳️‍🌈"
    ];
    // Opt-in video presence; actual camera frames travel peer-to-peer via WebRTC.
    private static readonly ConcurrentDictionary<string, CameraParticipant> Cameras = new();
    private readonly AdminChatAudioStore _audio;
    private static readonly ConcurrentDictionary<string, DateTimeOffset> LastMessage = new();
    private static readonly ConcurrentDictionary<string, byte> Online = new();
    // Estado efímero por cuenta, nunca aceptamos la identidad del cliente.
    private static readonly ConcurrentDictionary<Guid, ReadReceipt> Seen = new();
    // Solo es una etiqueta de presentación para este chat, no cambia identidad ni permisos.
    private static readonly ConcurrentDictionary<Guid, string> Nicknames = new();
    private static readonly ConcurrentDictionary<Guid, Guid> Avatars = new();
    private readonly AdminChatMediaStore _images;

    public AdminChatHub(AdminChatMediaStore images, AdminChatAudioStore audio, AppDbContext chatDb)
    {
        _images = images;
        _audio = audio;
        _chatDb = chatDb;
    }
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
        ConnectedUsers[Context.ConnectionId] = identity.UsuarioId;
        ReactionNames[identity.UsuarioId] = DisplayName(identity);
        await Groups.AddToGroupAsync(Context.ConnectionId, PersonalGroup(identity.UsuarioId));
        await Clients.Others.SendAsync("DirectPresenceChanged", identity.UsuarioId, true);
        Nicknames.TryGetValue(identity.UsuarioId, out var nickname);
        await Clients.Caller.SendAsync("ChatProfile", new { displayName = nickname ?? identity.NombreCliente, customName = nickname });
        await Clients.Caller.SendAsync("AvatarSnapshot", Avatars
            .Where(entry => _images.Find(entry.Value) is not null)
            .Select(entry => new { userId = entry.Key, url = AdminChatMediaStore.Url(entry.Value) }).ToArray());
        await ChatMutations.WaitAsync();
        try
        {
            await Clients.Caller.SendAsync("BlockedSnapshot",
                BlockedAccountsFor(identity.UsuarioId),
                BlockNotices.GetValueOrDefault(identity.UsuarioId)?.ToArray()
                    ?? Array.Empty<ChatBlockNotice>());
            await SendPersonalHistory(Clients.Caller, identity.UsuarioId);
        }
        finally { ChatMutations.Release(); }
        await Clients.Caller.SendAsync("TypingSnapshot", Typing.Values
            .Where(x => x.ConnectionId != Context.ConnectionId && x.ExpiresAt > DateTimeOffset.UtcNow)
            .ToArray());
        await Clients.Caller.SendAsync("DirectDirectory", await GetDirectContacts());
        await Clients.Caller.SendAsync("CameraSnapshot", Cameras.Values.ToArray());
        await Clients.Others.SendAsync("CameraViewerJoined", Context.ConnectionId);
        await Clients.All.SendAsync("Presence", Online.Count);
        await base.OnConnectedAsync();
    }

    private static bool IsBlocked(Guid viewerId, Guid authorId) =>
        BlockedByUser.TryGetValue(viewerId, out var blocked) && blocked.Contains(authorId);

    private static BlockedAccount[] BlockedAccountsFor(Guid viewerId) =>
        BlockedByUser.TryGetValue(viewerId, out var blocked)
            ? blocked.Select(id => new BlockedAccount(id,
                ReactionNames.GetValueOrDefault(id) ?? "Administrador")).ToArray()
            : Array.Empty<BlockedAccount>();

    private ChatMessage PersonalizeMessage(ChatMessage message, Guid viewerId)
    {
        var reply = message.ReplyTo;
        if (reply is not null && IsBlocked(viewerId, reply.UserId))
            reply = reply with { Name = "Mensaje oculto", Text = "Mensaje de un administrador bloqueado" };
        return message with
        {
            ReplyTo = reply,
            Reactions = ReadReactions(message.Id),
            ImageViewed = message.ImageId is Guid image && _images.WasViewed(image, viewerId)
        };
    }

    private Task SendPersonalHistory(IClientProxy destination, Guid viewerId)
    {
        var cutoff = ClearedForUser.GetValueOrDefault(viewerId, DateTimeOffset.MinValue);
        var filtered = History.Where(message => message.SentAt > cutoff &&
            !IsBlocked(viewerId, message.UserId))
            .Select(message => PersonalizeMessage(message, viewerId)).ToArray();
        return destination.SendAsync("History", filtered, Seen.Values.ToArray(), cutoff);
    }

    // The actor and the target receive an inline system notice, never the entire room.
    private static void RememberBlockNotice(Guid recipientId, ChatBlockNotice notice)
    {
        if (!BlockNotices.TryGetValue(recipientId, out var queue))
            BlockNotices[recipientId] = queue = new Queue<ChatBlockNotice>();
        queue.Enqueue(notice);
        while (queue.Count > MaxBlockNotices) queue.Dequeue();
    }

    public async Task SetUserBlocked(string? targetUserId, bool blocked)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        if (!Guid.TryParse(targetUserId, out var targetId) ||
            targetId == identity.UsuarioId || !ReactionNames.ContainsKey(targetId))
            throw new HubException("Seleccioná otro administrador del chat.");

        await ChatMutations.WaitAsync();
        try
        {
            var viewerId = identity.UsuarioId;
            if (!BlockedByUser.TryGetValue(viewerId, out var hidden))
                BlockedByUser[viewerId] = hidden = new HashSet<Guid>();
            if (hidden.Contains(targetId) == blocked) return;
            var now = DateTimeOffset.UtcNow;
            if (LastBlockAction.TryGetValue(viewerId, out var previous) &&
                now - previous < TimeSpan.FromSeconds(2))
                throw new HubException("Esperá un momento antes de cambiar otro bloqueo.");
            if (blocked && hidden.Count >= MaxBlockedUsers)
                throw new HubException("Llegaste al límite de usuarios bloqueados.");
            LastBlockAction[viewerId] = now;
            if (blocked) hidden.Add(targetId);
            else hidden.Remove(targetId);
            if (hidden.Count == 0) BlockedByUser.Remove(viewerId);

            var notice = new ChatBlockNotice(Guid.NewGuid(), viewerId, DisplayName(identity),
                targetId, ReactionNames.GetValueOrDefault(targetId) ?? "Administrador",
                blocked, now);
            RememberBlockNotice(viewerId, notice);
            RememberBlockNotice(targetId, notice);
            await Clients.Group(PersonalGroup(viewerId)).SendAsync("BlockListChanged",
                BlockedAccountsFor(viewerId));
            await Clients.Group(PersonalGroup(viewerId)).SendAsync("ChatBlockNotice", notice);
            await Clients.Group(PersonalGroup(targetId)).SendAsync("ChatBlockNotice", notice);
            if (!blocked) // Rehydrate messages missed while this account blocked the sender.
                await SendPersonalHistory(Clients.Group(PersonalGroup(viewerId)), viewerId);
        }
        finally { ChatMutations.Release(); }
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
        ReactionNames[identity.UsuarioId] = display;
        // Una actualización del nombre no da acceso a cuentas ajenas.
        await Clients.All.SendAsync("NicknameChanged", identity.UsuarioId, display);
        await Clients.All.SendAsync("DirectContactsRefresh");
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
        await Clients.All.SendAsync("DirectContactsRefresh");
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

    // Compatibilidad: navegadores antiguos que llaman ClearChat también limpian
    // únicamente SU vista, nunca eliminan el historial compartido.
    public Task ClearChat() => ClearMyChat();

    public async Task ClearMyChat()
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");

        await ChatMutations.WaitAsync();
        try
        {
            var cutoff = DateTimeOffset.UtcNow;
            ClearedForUser[identity.UsuarioId] = cutoff;
            BlockNotices.Remove(identity.UsuarioId);
            // Solo las sesiones de esta cuenta reciben la orden de ocultar mensajes.
            // El historial, los vistos y los archivos de los demás no se modifican.
            await Clients.Group(PersonalGroup(identity.UsuarioId))
                .SendAsync("ChatClearedForUser", new { clearedAt = cutoff });
        }
        finally { ChatMutations.Release(); }
    }

    // Se conserva el método original para navegadores que aún tienen el frontend anterior.
    public Task SendMessage(string? body) => SendCore(body, null, null, false, false);

    // La referencia viaja como ID: autor y texto se obtienen exclusivamente del servidor.
    public Task ReplyToMessage(string? body, string? replyToId) => SendCore(body, replyToId, null, false, false);

    // Legacy clients continue to send normal images with the previous method.
    public Task SendImage(string? imageId, string? caption, string? replyToId) =>
        SendCore(caption, replyToId, imageId, false, false);

    public Task SendMedia(string? imageId, string? caption, string? replyToId, string? mode)
    {
        if (mode is not ("image" or "sticker" or "once"))
            throw new HubException("Tipo de envío no permitido.");
        if (string.IsNullOrWhiteSpace(imageId)) throw new HubException("Seleccioná una imagen.");
        return SendCore(caption, replyToId, imageId, mode == "once", mode == "sticker");
    }

    public Task SendVoice(string? audioId, string? replyToId, string? caption = null)
    {
        if (!Guid.TryParse(audioId, out _)) throw new HubException("Audio inválido.");
        return SendCore(caption, replyToId, null, false, false, audioId);
    }

    private async Task SendCore(string? body, string? replyToId, string? imageId,
        bool viewOnce, bool sticker, string? audioId = null)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        var text = body?.Trim() ?? "";
        if (text.Length > 500 || (text.Length == 0 && imageId is null && audioId is null))
            throw new HubException("Enviá texto, una imagen o un audio (máximo 500 caracteres).");
        Guid? voiceId = null;
        if (audioId is not null)
        {
            if (!Guid.TryParse(audioId, out var clipId) ||
                !_audio.IsOwnedUnpublished(clipId, identity.UsuarioId))
                throw new HubException("El audio no pertenece a tu cuenta.");
            voiceId = clipId;
        }

        string? imageUrl = null;
        Guid? mediaId = null;
        if (imageId is not null)
        {
            if (!Guid.TryParse(imageId, out var id) ||
                !_images.IsOwned(id, identity.UsuarioId, avatar: false))
                throw new HubException("La imagen no pertenece a tu cuenta.");
            mediaId = id;
            // A view-once message must never carry a GET-able media URL.
            imageUrl = viewOnce ? null : AdminChatMediaStore.Url(id);
        }

        ChatReply? reply = null;
        if (replyToId is not null)
        {
            if (!Guid.TryParse(replyToId, out var originalId))
                throw new HubException("La referencia del mensaje no es válida.");
            var original = History.FirstOrDefault(item => item.Id == originalId);
            if (original is null)
                throw new HubException("El mensaje original ya no está en el historial temporal.");
            var replyText = string.IsNullOrWhiteSpace(original.Text)
                ? original.AudioUrl is not null ? "🎤 Mensaje de voz" : original.IsViewOnce ? "🔒 Foto de una vez" : original.IsSticker ? "Sticker" : "📷 Imagen"
                : original.Text;
            var excerpt = replyText.Length > 140 ? replyText[..140].TrimEnd() + "…" : replyText;
            reply = new ChatReply(original.Id, original.UserId, original.Name, excerpt);
        }

        var now = DateTimeOffset.UtcNow;
        if (LastMessage.TryGetValue(Context.ConnectionId, out var previous) &&
            now - previous < TimeSpan.FromMilliseconds(650))
            throw new HubException("Enviás mensajes demasiado rápido.");

        LastMessage[Context.ConnectionId] = now;
        await ClearTypingAsync();
        var message = new ChatMessage(
            Guid.NewGuid(), identity.UsuarioId, DisplayName(identity),
            identity.Correo, text, now, reply, imageUrl, mediaId, viewOnce, sticker,
            Array.Empty<ChatReaction>(), false,
            voiceId is Guid voice ? AdminChatAudioStore.Url(voice) : null);
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
            if (mediaId is Guid idToPublish && !_images.Publish(idToPublish, identity.UsuarioId, viewOnce))
                throw new HubException("No se pudo publicar la imagen.");
            if (voiceId is Guid voiceToPublish && !_audio.Publish(voiceToPublish, identity.UsuarioId))
                throw new HubException("El audio ya no está disponible.");
            // La hora efectiva de publicación se decide dentro del bloqueo, en orden
            // con ClearMyChat, para que los mensajes posteriores vuelvan a aparecer.
            var published = message with { SentAt = DateTimeOffset.UtcNow };
            History.Enqueue(published);
            while (History.Count > Limit && History.TryDequeue(out var removed))
                ReactionsByMessage.Remove(removed.Id);
            // Never deliver a blocked author's new message to the blocker, even on
            // an older browser tab that has not yet received its block-list update.
            foreach (var (connectionId, viewerId) in ConnectedUsers)
            {
                if (IsBlocked(viewerId, published.UserId)) continue;
                await Clients.Client(connectionId).SendAsync("Message",
                    PersonalizeMessage(published, viewerId));
            }
        }
        finally { ChatMutations.Release(); }
    }

    private static ChatReaction[] ReadReactions(Guid id) =>
        ReactionsByMessage.TryGetValue(id, out var all)
            ? all.Where(entry => entry.Value.Count > 0)
                .Select(entry =>
                {
                    var ids = entry.Value.ToArray();
                    return new ChatReaction(entry.Key, ids,
                        ids.Select(userId => ReactionNames.GetValueOrDefault(userId)
                            ?? "Administrador").ToArray());
                }).ToArray()
            : Array.Empty<ChatReaction>();

    // Server-controlled emoji allowlist, authenticated account IDs and bounded history.
    public async Task ToggleReaction(string? messageId, string? emoji)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        if (!Guid.TryParse(messageId, out var id) || emoji is null ||
            !AllowedReactions.Contains(emoji)) throw new HubException("Reacción no permitida.");
        ReactionNames[identity.UsuarioId] = DisplayName(identity);
        await ChatMutations.WaitAsync();
        try
        {
            var message = History.FirstOrDefault(item => item.Id == id);
            var cutoff = ClearedForUser.GetValueOrDefault(identity.UsuarioId, DateTimeOffset.MinValue);
            if (message is null || message.SentAt <= cutoff ||
                IsBlocked(identity.UsuarioId, message.UserId))
                throw new HubException("Mensaje fuera de tu historial.");
            if (!ReactionsByMessage.TryGetValue(id, out var all))
                ReactionsByMessage[id] = all = new Dictionary<string, HashSet<Guid>>();
            if (!all.TryGetValue(emoji, out var users))
                all[emoji] = users = new HashSet<Guid>();
            if (!users.Add(identity.UsuarioId)) users.Remove(identity.UsuarioId);
            if (users.Count == 0) all.Remove(emoji);
            if (all.Count == 0) ReactionsByMessage.Remove(id);
            await Clients.All.SendAsync("ReactionChanged", id, ReadReactions(id));
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
            if (message is null || IsBlocked(identity.UsuarioId, message.UserId)) return;
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

    public async Task<string[]> StartCamera()
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        if (!Cameras.ContainsKey(Context.ConnectionId) && Cameras.Count >= 6)
            throw new HubException("El espacio de cámaras permite hasta 6 participantes.");
        var self = new CameraParticipant(Context.ConnectionId, identity.UsuarioId, DisplayName(identity));
        Cameras[Context.ConnectionId] = self;
        await Clients.Others.SendAsync("CameraStarted", self);
        return Online.Keys.Where(id => id != Context.ConnectionId).ToArray();
    }

    public async Task StopCamera()
    {
        if (Cameras.TryRemove(Context.ConnectionId, out _))
            await Clients.Others.SendAsync("CameraStopped", Context.ConnectionId);
    }

    // Relay signaling only. Browser media streams never pass through the hub.
    public async Task SendCameraSignal(string ownerId, string peerId, string kind, string payload)
    {
        var identity = Context.GetHttpContext()?.Items["auth.identity"] as AuthIdentity;
        if (identity is null || identity.Role != "admin") throw new HubException("Sin autorización.");
        if (string.IsNullOrWhiteSpace(payload) || payload.Length > 40_000 ||
            kind is not ("offer" or "answer" or "ice") ||
            !Cameras.ContainsKey(ownerId) || !Online.ContainsKey(peerId) ||
            ownerId == peerId)
            throw new HubException("Señal de cámara inválida.");
        var sender = Context.ConnectionId;
        if (sender != ownerId && sender != peerId)
            throw new HubException("No pertenecés a esa conexión.");
        if ((kind == "offer" && sender != ownerId) ||
            (kind == "answer" && sender != peerId) ||
            (kind == "ice" && payload.Length > 4_000))
            throw new HubException("Señal de cámara no permitida.");
        var receiver = sender == ownerId ? peerId : ownerId;
        await Clients.Client(receiver).SendAsync("CameraSignal", new
        {
            ownerId, peerId, senderId = sender, kind, payload
        });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Online.TryRemove(Context.ConnectionId, out _);
        ConnectedUsers.TryRemove(Context.ConnectionId, out var disconnectedUser);
        if (disconnectedUser != Guid.Empty && !ConnectedUsers.Values.Contains(disconnectedUser))
            await Clients.Others.SendAsync("DirectPresenceChanged", disconnectedUser, false);
        await StopCamera();
        await Clients.Others.SendAsync("CameraViewerLeft", Context.ConnectionId);
        LastMessage.TryRemove(Context.ConnectionId, out _);
        await ClearTypingAsync();
        await Clients.All.SendAsync("Presence", Online.Count);
        await base.OnDisconnectedAsync(exception);
    }

    public sealed record BlockedAccount(Guid UserId, string Name);
    public sealed record ChatBlockNotice(Guid Id, Guid ActorId, string ActorName,
        Guid TargetId, string TargetName, bool Blocked, DateTimeOffset SentAt);
    public sealed record ChatMessage(Guid Id, Guid UserId, string Name, string Email, string Text,
        DateTimeOffset SentAt, ChatReply? ReplyTo, string? ImageUrl, Guid? ImageId,
        bool IsViewOnce, bool IsSticker, ChatReaction[] Reactions, bool ImageViewed,
        string? AudioUrl = null, Guid? RecipientId = null);
    public sealed record CameraParticipant(string ConnectionId, Guid UserId, string Name);
    public sealed record ChatReaction(string Emoji, Guid[] UserIds, string[] UserNames);
    public sealed record ChatReply(Guid Id, Guid UserId, string Name, string Text);
    public sealed record ReadReceipt(Guid UserId, string Name, DateTimeOffset LastReadAt);
    public sealed record TypingStatus(
        string ConnectionId, Guid UserId, string Name, bool IsTyping,
        DateTimeOffset ExpiresAt, DateTimeOffset UpdatedAt);
}
