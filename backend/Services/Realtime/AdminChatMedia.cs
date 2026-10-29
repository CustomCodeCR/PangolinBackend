using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.AspNetCore.Mvc;

namespace CastroFallas.MiniQuote.Api.Services.Realtime;

// Almacenamiento acotado, exclusivo de este experimento. Nunca expone archivos públicos.
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

    public sealed record ChatMedia(Guid Id, Guid Owner, bool IsAvatar, byte[] Bytes, DateTimeOffset CreatedAt);
    public static string Url(Guid id) => $"/api/admin/chat/images/{id:N}";

    public Guid Save(Guid owner, bool isAvatar, byte[] jpeg)
    {
        var id = Guid.NewGuid();
        lock (_gate)
        {
            while (_oldest.Count >= MaxItems || _totalBytes + jpeg.Length > MaxTotalBytes)
            {
                if (!_oldest.TryDequeue(out var evicted)) break;
                if (_files.Remove(evicted, out var old)) _totalBytes -= old.Bytes.Length;
            }
            _files[id] = new ChatMedia(id, owner, isAvatar, jpeg, DateTimeOffset.UtcNow);
            _oldest.Enqueue(id);
            _totalBytes += jpeg.Length;
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
            return _files.TryGetValue(id, out var item) && item.Owner == userId && item.IsAvatar == avatar;
    }

    // Vaciar el chat debe borrar las fotos enviadas en mensajes, no los avatares.
    public void ClearMessageImages()
    {
        lock (_gate)
        {
            var messages = _files.Values.Where(file => !file.IsAvatar).Select(file => file.Id).ToArray();
            foreach (var id in messages)
            {
                if (_files.Remove(id, out var removed))
                    _totalBytes -= removed.Bytes.Length;
            }
            // Compactar el índice cronológico: las entradas eliminadas tampoco deben quedar en cola.
            var retained = _oldest.Where(id => _files.ContainsKey(id)).ToArray();
            _oldest.Clear();
            foreach (var id in retained) _oldest.Enqueue(id);
        }
    }
}

public static class AdminChatMediaEndpoints
{
    public static void MapAdminChatMedia(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/chat/images").RequireAuthorization("admin");

        group.MapPost("", async (
            HttpContext http, AdminChatMediaStore store, CancellationToken ct) =>
        {
            if (http.Items["auth.identity"] is not AuthIdentity identity || identity.Role != "admin")
                return Results.Forbid();
            // Header propio + origen same-origin: bloquean publicaciones mediante formularios
            // externos que intenten reutilizar la cookie de sesión.
            if (http.Request.Headers["X-Chat-Media"] != "1" ||
                !http.Request.Headers.TryGetValue("Origin", out var originHeader) ||
                !Uri.TryCreate(originHeader.ToString(), UriKind.Absolute, out var origin) ||
                !string.Equals(origin.Authority, http.Request.Host.Value, StringComparison.OrdinalIgnoreCase) ||
                (origin.Scheme != "http" && origin.Scheme != "https"))
                return Results.StatusCode(StatusCodes.Status403Forbidden);

            var avatar = http.Request.Query["kind"] == "avatar";
            if (!avatar && http.Request.Query["kind"] != "message")
                return Results.BadRequest(new { error = "Tipo de imagen no válido." });
            if (!string.Equals(http.Request.ContentType, "image/jpeg", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Solo se admite una imagen JPEG procesada." });

            var max = avatar ? AdminChatMediaStore.MaxAvatarBytes : AdminChatMediaStore.MaxMessageBytes;
            if (http.Request.ContentLength is > 0 && http.Request.ContentLength > max)
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
            // No aceptar SVG, HTML ni archivos arbitrarios renombrados.
            if (count < 12 || buffer[0] != 0xff || buffer[1] != 0xd8 || buffer[2] != 0xff ||
                buffer[count - 2] != 0xff || buffer[count - 1] != 0xd9)
                return Results.BadRequest(new { error = "No es una imagen JPEG válida." });

            var saved = store.Save(identity.UsuarioId, avatar, buffer.AsSpan(0, count).ToArray());
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { imageId = saved, url = AdminChatMediaStore.Url(saved) });
        });

        group.MapGet("/{id:guid}", (Guid id, HttpContext http, AdminChatMediaStore store) =>
        {
            if (http.Items["auth.identity"] is not AuthIdentity identity || identity.Role != "admin")
                return Results.Forbid();
            http.Response.Headers.CacheControl = "no-store";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            var image = store.Find(id);
            return image is null
                ? (IResult)Results.NotFound()
                : Results.File(image.Bytes, "image/jpeg", enableRangeProcessing: false);
        });
    }
}
