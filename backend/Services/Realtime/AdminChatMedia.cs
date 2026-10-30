using CastroFallas.MiniQuote.Api.Services.Auth;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Ephemeral, bounded, admin-only media. View-once grants are enforced by the server,
// per recipient account. No public URL may return the bytes of view-once media.
public sealed class AdminChatMediaStore
{
    public const int MaxAvatarBytes = 170_000;
    public const int MaxMessageBytes = 800_000;
    private const int MaxItems = 110;
    private const long MaxTotalBytes = 36_000_000;

    private readonly object _gate = new();
    private readonly Dictionary<Guid, ChatMedia> _files = new();
    private readonly Queue<Guid> _oldest = new();
    private long _totalBytes;

    public sealed class ChatMedia
    {
        public required Guid Id { get; init; }
        public required Guid Owner { get; init; }
        public required bool IsAvatar { get; init; }
        public required byte[] Bytes { get; init; }
        public required string MimeType { get; init; }
        public required DateTimeOffset CreatedAt { get; init; }
        public bool Published { get; set; }
        public bool IsViewOnce { get; set; }
        public HashSet<Guid> ViewedBy { get; } = new();
    }

    public static string Url(Guid id) => $"/api/admin/chat/images/{id:N}";

    public Guid Save(Guid owner, bool isAvatar, byte[] bytes, string mimeType)
    {
        var id = Guid.NewGuid();
        lock (_gate)
        {
            while (_oldest.Count >= MaxItems || _totalBytes + bytes.Length > MaxTotalBytes)
            {
                if (!_oldest.TryDequeue(out var evicted)) break;
                if (_files.Remove(evicted, out var old)) _totalBytes -= old.Bytes.Length;
            }
            _files[id] = new ChatMedia
            {
                Id = id, Owner = owner, IsAvatar = isAvatar, Bytes = bytes,
                MimeType = mimeType, CreatedAt = DateTimeOffset.UtcNow
            };
            _oldest.Enqueue(id);
            _totalBytes += bytes.Length;
        }
        return id;
    }

    public ChatMedia? Find(Guid id)
    {
        lock (_gate) return _files.GetValueOrDefault(id);
    }

    public bool IsOwned(Guid id, Guid userId, bool avatar)
    {
        lock (_gate)
            return _files.TryGetValue(id, out var item) && item.Owner == userId &&
                item.IsAvatar == avatar && (avatar || !item.Published);
    }

    public bool Publish(Guid id, Guid owner, bool once)
    {
        lock (_gate)
        {
            if (!_files.TryGetValue(id, out var item) || item.Owner != owner ||
                item.IsAvatar || item.Published) return false;
            item.IsViewOnce = once;
            item.Published = true;
            return true;
        }
    }

    public ChatMedia? ReadRegular(Guid id)
    {
        lock (_gate)
        {
            if (!_files.TryGetValue(id, out var item) ||
                (!item.IsAvatar && (!item.Published || item.IsViewOnce))) return null;
            return item;
        }
    }

    public bool WasViewed(Guid id, Guid userId)
    {
        lock (_gate)
            return _files.TryGetValue(id, out var item) && item.IsViewOnce &&
                (item.Owner == userId || item.ViewedBy.Contains(userId));
    }

    // Atomic consumption: a second request, including from another tab of the
    // same administrator account, never obtains the image bytes again.
    public ChatMedia? ConsumeOnce(Guid id, Guid userId)
    {
        lock (_gate)
        {
            if (!_files.TryGetValue(id, out var item) || !item.Published ||
                !item.IsViewOnce || item.IsAvatar || item.Owner == userId ||
                !item.ViewedBy.Add(userId)) return null;
            return item;
        }
    }
}

public static class AdminChatMediaEndpoints
{
    private static bool IsSameOriginMediaAction(HttpContext http) =>
        http.Request.Headers["X-Chat-Media"] == "1" &&
        http.Request.Headers.TryGetValue("Origin", out var originHeader) &&
        Uri.TryCreate(originHeader.ToString(), UriKind.Absolute, out var origin) &&
        string.Equals(origin.Authority, http.Request.Host.Value, StringComparison.OrdinalIgnoreCase) &&
        (origin.Scheme == "http" || origin.Scheme == "https");

    public static void MapAdminChatMedia(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/chat/images").RequireAuthorization("admin");

        group.MapPost("", async (
            HttpContext http, AdminChatMediaStore store, CancellationToken ct) =>
        {
            if (http.Items["auth.identity"] is not AuthIdentity identity || identity.Role != "admin")
                return Results.Forbid();
            if (!IsSameOriginMediaAction(http))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var kind = http.Request.Query["kind"].ToString();
            var avatar = kind == "avatar";
            if (!avatar && kind != "message")
                return Results.BadRequest(new { error = "Tipo de imagen no válido." });
            var mime = http.Request.ContentType?.ToLowerInvariant();
            if (mime != "image/jpeg" && mime != "image/png")
                return Results.BadRequest(new { error = "Solo se admiten imágenes JPEG o PNG procesadas." });
            if (avatar && mime != "image/jpeg")
                return Results.BadRequest(new { error = "La foto de perfil debe ser JPEG." });

            var max = avatar ? AdminChatMediaStore.MaxAvatarBytes : AdminChatMediaStore.MaxMessageBytes;
            if (http.Request.ContentLength is > max)
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            var buffer = new byte[max + 1];
            var count = 0;
            while (count < buffer.Length)
            {
                var read = await http.Request.Body.ReadAsync(buffer.AsMemory(count, buffer.Length - count), ct);
                if (read == 0) break;
                count += read;
            }
            if (count > max) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            var validJpeg = count >= 12 && buffer[0] == 0xff && buffer[1] == 0xd8 &&
                buffer[2] == 0xff && buffer[count - 2] == 0xff && buffer[count - 1] == 0xd9;
            var validPng = count >= 45 &&
                buffer.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) &&
                buffer.AsSpan(12, 4).SequenceEqual("IHDR"u8) &&
                buffer.AsSpan(count - 8, 4).SequenceEqual("IEND"u8);
            if ((mime == "image/jpeg" && !validJpeg) || (mime == "image/png" && !validPng))
                return Results.BadRequest(new { error = "La firma de la imagen no es válida." });
            if (validPng)
            {
                var width = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(buffer.AsSpan(16, 4));
                var height = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(buffer.AsSpan(20, 4));
                if (width < 1 || height < 1 || (long)width * height > 28_000_000)
                    return Results.BadRequest(new { error = "Dimensiones de PNG no permitidas." });
            }

            var id = store.Save(identity.UsuarioId, avatar, buffer.AsSpan(0, count).ToArray(), mime!);
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { imageId = id, url = AdminChatMediaStore.Url(id) });
        });

        // Ordinary pictures and avatars can render inline for authenticated admins.
        // View-once media is never reachable through a reusable GET URL.
        group.MapGet("/{id:guid}", (Guid id, HttpContext http, AdminChatMediaStore store) =>
        {
            if (http.Items["auth.identity"] is not AuthIdentity identity || identity.Role != "admin")
                return Results.Forbid();
            http.Response.Headers.CacheControl = "no-store";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            var image = store.ReadRegular(id);
            return image is null ? (IResult)Results.NotFound() :
                Results.File(image.Bytes, image.MimeType, enableRangeProcessing: false);
        });

        group.MapPost("/{id:guid}/consume", async (
            Guid id, HttpContext http, AdminChatMediaStore store,
            Microsoft.AspNetCore.SignalR.IHubContext<AdminChatHub> hub) =>
        {
            if (http.Items["auth.identity"] is not AuthIdentity identity || identity.Role != "admin")
                return Results.Forbid();
            if (!IsSameOriginMediaAction(http))
                return Results.StatusCode(StatusCodes.Status403Forbidden);
            http.Response.Headers.CacheControl = "no-store, private";
            http.Response.Headers["Pragma"] = "no-cache";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            var image = store.ConsumeOnce(id, identity.UsuarioId);
            if (image is null) return Results.NotFound();
            // Synchronize other tabs for the same authenticated account.
            await hub.Clients.Group(AdminChatHub.PersonalGroup(identity.UsuarioId))
                .SendAsync("OneTimeImageViewed", id);
            return Results.File(image.Bytes, image.MimeType, enableRangeProcessing: false);
        });
    }
}
