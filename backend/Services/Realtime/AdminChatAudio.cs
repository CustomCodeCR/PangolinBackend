using CastroFallas.MiniQuote.Api.Services.Auth;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Small private voice notes. Not a general-purpose file hosting endpoint.
public sealed class AdminChatAudioStore
{
    public const int MaxClipBytes = 2_500_000;
    private const int MaxItems = 50;
    private const long MaxTotalBytes = 24_000_000;
    private readonly object _gate = new();
    private readonly Dictionary<Guid, Clip> _clips = new();
    private readonly Queue<Guid> _oldest = new();
    private long _totalBytes;

    public sealed class Clip
    {
        public required Guid Id { get; init; }
        public required Guid Owner { get; init; }
        public required string Mime { get; init; }
        public required byte[] Bytes { get; init; }
        public bool Published { get; set; }
        public Guid? RecipientId { get; set; }
    }

    public static string Url(Guid id) => $"/api/admin/chat/audio/{id:N}";

    public Guid Save(Guid owner, byte[] bytes, string mime)
    {
        var id = Guid.NewGuid();
        lock (_gate)
        {
            while (_oldest.Count >= MaxItems || _totalBytes + bytes.Length > MaxTotalBytes)
            {
                if (!_oldest.TryDequeue(out var evicted)) break;
                if (_clips.Remove(evicted, out var old)) _totalBytes -= old.Bytes.Length;
            }
            _clips[id] = new Clip { Id = id, Owner = owner, Mime = mime, Bytes = bytes };
            _oldest.Enqueue(id);
            _totalBytes += bytes.Length;
        }
        return id;
    }
    public bool IsOwnedUnpublished(Guid id, Guid userId)
    {
        lock (_gate) return _clips.TryGetValue(id, out var item) &&
            item.Owner == userId && !item.Published;
    }
    public bool Publish(Guid id, Guid userId, Guid? recipientId = null)
    {
        lock (_gate)
        {
            if (!_clips.TryGetValue(id, out var item) || item.Owner != userId || item.Published)
                return false;
            item.RecipientId = recipientId;
            item.Published = true;
            return true;
        }
    }
    public Clip? FindPublished(Guid id, Guid viewerId)
    {
        lock (_gate) return _clips.TryGetValue(id, out var item) && item.Published &&
            (item.RecipientId is not Guid recipient || item.Owner == viewerId ||
                recipient == viewerId) ? item : null;
    }
}

public static class AdminChatAudioEndpoints
{
    public static void MapAdminChatAudio(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/chat/audio").RequireAuthorization("admin");
        group.MapPost("", async (HttpContext http, AdminChatAudioStore store, CancellationToken ct) =>
        {
            if (http.Items["auth.identity"] is not AuthIdentity identity || identity.Role != "admin")
                return Results.Forbid();
            // Match the anti-CSRF requirements used by image uploads.
            if (http.Request.Headers["X-Chat-Media"] != "1" ||
                !http.Request.Headers.TryGetValue("Origin", out var rawOrigin) ||
                !Uri.TryCreate(rawOrigin.ToString(), UriKind.Absolute, out var origin) ||
                (origin.Scheme is not ("http" or "https")) ||
                !string.Equals(origin.Authority, http.Request.Host.Value, StringComparison.OrdinalIgnoreCase))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var mime = http.Request.ContentType?.Split(';', 2)[0].Trim().ToLowerInvariant();
            if (mime is not ("audio/webm" or "audio/mp4" or "audio/ogg"))
                return Results.BadRequest(new { error = "Formato de audio no admitido." });
            if (http.Request.ContentLength is > AdminChatAudioStore.MaxClipBytes)
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

            var buffer = new byte[AdminChatAudioStore.MaxClipBytes + 1];
            var count = 0;
            while (count < buffer.Length)
            {
                var read = await http.Request.Body.ReadAsync(buffer.AsMemory(count, buffer.Length - count), ct);
                if (read == 0) break;
                count += read;
            }
            if (count > AdminChatAudioStore.MaxClipBytes)
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
            // Require the expected media container signature, not just a claimed MIME.
            var validWebm = mime == "audio/webm" && count > 16 &&
                buffer.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 });
            var validOgg = mime == "audio/ogg" && count > 16 &&
                buffer.AsSpan(0, 4).SequenceEqual("OggS"u8);
            var validMp4 = mime == "audio/mp4" && count > 16 &&
                buffer.AsSpan(4, 4).SequenceEqual("ftyp"u8);
            if (!(validWebm || validOgg || validMp4))
                return Results.BadRequest(new { error = "El archivo no es una grabación válida." });

            var id = store.Save(identity.UsuarioId, buffer.AsSpan(0, count).ToArray(), mime!);
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { audioId = id, url = AdminChatAudioStore.Url(id) });
        });

        group.MapGet("/{id:guid}", (Guid id, HttpContext http, AdminChatAudioStore store) =>
        {
            if (http.Items["auth.identity"] is not AuthIdentity identity || identity.Role != "admin")
                return Results.Forbid();
            http.Response.Headers.CacheControl = "no-store, private";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            var clip = store.FindPublished(id, identity.UsuarioId);
            return clip is null ? (IResult)Results.NotFound() :
                Results.File(clip.Bytes, clip.Mime, enableRangeProcessing: false);
        });
    }
}
