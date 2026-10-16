using Amazon.S3;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// Subida binaria privada al almacenamiento de objetos. Compatible con MinIO/S3.
// Los registros previos con SRC Base64 o HTTPS no se alteran.
public static class ManagedMediaObjectEndpoints
{
    private const long MaxImage = 5 * 1024 * 1024;
    private const long MaxDocument = 10 * 1024 * 1024;
    private const long MaxVideo = 20 * 1024 * 1024;

    public static void MapManagedMediaObjects(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/admin/content/media/upload", async Task<IResult> (
            HttpRequest request, AppDbContext db, ObjectStorageService storage, CancellationToken ct) =>
        {
            if (!storage.Enabled)
                return Results.Json(new { error = "El almacenamiento S3 no está habilitado." }, statusCode: 503);
            if (!request.HasFormContentType)
                return Results.BadRequest(new { error = "Se requiere multipart/form-data." });
            if (request.ContentLength is > MaxVideo + 1024 * 1024)
                return Results.BadRequest(new { error = "La solicitud excede el tamaño permitido." });

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file");
            if (file is null)
                return Results.BadRequest(new { error = "Seleccioná un archivo." });
            if (!TryDetectFile(file, out var kind, out var mime, out var error))
                return Results.BadRequest(new { error });
            var requestedKind = form["kind"].ToString();
            if (!string.IsNullOrWhiteSpace(requestedKind) && requestedKind != kind)
                return Results.BadRequest(new { error = "El tipo seleccionado no coincide con el archivo." });

            var name = form["name"].ToString().Trim();
            if (string.IsNullOrWhiteSpace(name))
                name = Path.GetFileName(file.FileName);
            if (name.Length is < 1 or > 200)
                return Results.BadRequest(new { error = "El nombre debe tener entre 1 y 200 caracteres." });

            var media = new ManagedMedia { Name = name, Kind = kind, MimeType = mime, SizeBytes = file.Length };
            var suffix = Path.GetExtension(file.FileName).ToLowerInvariant();
            var key = $"media/{media.Id:N}{suffix}";
            media.ObjectKey = key;
            media.Src = $"/api/content/media/{media.Id}/file";

            await using var body = file.OpenReadStream();
            try
            {
                await storage.UploadAsync(key, body, file.Length, mime, ct);
            }
            catch (AmazonS3Exception)
            {
                return Results.Json(new { error = "No se pudo guardar el archivo en MinIO. Revisá bucket y permisos." }, statusCode: 503);
            }

            try
            {
                db.ManagedMedia.Add(media);
                await db.SaveChangesAsync(ct);
            }
            catch
            {
                try { await storage.DeleteAsync(key, CancellationToken.None); }
                catch { /* La reconciliación de objetos huérfanos debe registrarse en operaciones. */ }
                throw;
            }
            return Results.Created($"/api/admin/content/media/{media.Id}", new {
                media.Id, media.Name, media.Kind, media.Src,
                media.ObjectKey, media.MimeType, media.SizeBytes
            });
        }).RequireAuthorization("admin");

        app.MapGet("/api/admin/content/media/{id:guid}/file", async Task<IResult> (
            Guid id, AppDbContext db, ObjectStorageService storage, CancellationToken ct) =>
            await ReadObject(id, db, storage, onlyPublished: false, ct))
            .RequireAuthorization("admin");

        app.MapGet("/api/content/media/{id:guid}/file", async Task<IResult> (
            Guid id, AppDbContext db, ObjectStorageService storage, CancellationToken ct) =>
            await ReadObject(id, db, storage, onlyPublished: true, ct));
    }

    private static async Task<IResult> ReadObject(Guid id, AppDbContext db,
        ObjectStorageService storage, bool onlyPublished, CancellationToken ct)
    {
        var media = await db.ManagedMedia.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id, ct);
        if (media?.ObjectKey is null || !storage.Enabled)
            return Results.NotFound();

        if (onlyPublished)
        {
            var link = $"/api/content/media/{id}/file";
            var isPublishedInNews = media.Kind == "Imagen" &&
                await db.ManagedNews.AsNoTracking().AnyAsync(n => n.Published && n.Image == link, ct);
            var isPublishedOnSite = (media.Kind == "Imagen" || media.Kind == "Video") &&
                await db.SiteCmsSlots.AsNoTracking().AnyAsync(x => x.PublishedMediaId == id, ct);
            if (!isPublishedInNews && !isPublishedOnSite) return Results.NotFound();
        }

        try
        {
            var response = await storage.DownloadAsync(media.ObjectKey, ct);
            var contentType = media.MimeType ?? "application/octet-stream";
            // Documentos se descargan, nunca se ejecutan HTML/SVG desde el dominio de la web.
            return Results.Stream(response.ResponseStream,
                contentType: contentType,
                fileDownloadName: media.Kind == "Documento" ? media.Name : null);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return Results.NotFound();
        }
        catch (AmazonS3Exception)
        {
            return Results.Json(new { error = "Almacenamiento de archivos temporalmente no disponible." }, statusCode: 503);
        }
    }

    private static bool TryDetectFile(IFormFile file, out string kind, out string mime, out string error)
    {
        kind = mime = "";
        error = "";
        if (file.Length == 0) { error = "El archivo está vacío."; return false; }
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        (kind, mime, var max) = ext switch
        {
            ".png" => ("Imagen", "image/png", MaxImage),
            ".jpg" or ".jpeg" => ("Imagen", "image/jpeg", MaxImage),
            ".gif" => ("Imagen", "image/gif", MaxImage),
            ".webp" => ("Imagen", "image/webp", MaxImage),
            ".pdf" => ("Documento", "application/pdf", MaxDocument),
            ".mp4" => ("Video", "video/mp4", MaxVideo),
            ".webm" => ("Video", "video/webm", MaxVideo),
            _ => ("", "", 0L)
        };
        if (max == 0) { error = "Solo se aceptan PNG, JPEG, GIF, WebP, PDF, MP4 y WebM."; return false; }
        if (file.Length > max) { error = $"El tamaño máximo para {kind} es {max / (1024 * 1024)} MB."; return false; }

        Span<byte> head = stackalloc byte[16];
        using var stream = file.OpenReadStream();
        var bytes = stream.Read(head);
        var valid = mime switch
        {
            "image/png" => bytes >= 8 && head[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/jpeg" => bytes >= 3 && head[..3].SequenceEqual(new byte[] { 255, 216, 255 }),
            "image/gif" => bytes >= 6 && (head[..6].SequenceEqual("GIF87a"u8) || head[..6].SequenceEqual("GIF89a"u8)),
            "image/webp" => bytes >= 12 && head[..4].SequenceEqual("RIFF"u8) && head.Slice(8, 4).SequenceEqual("WEBP"u8),
            "application/pdf" => bytes >= 5 && head[..5].SequenceEqual("%PDF-"u8),
            "video/mp4" => bytes >= 12 && head.Slice(4, 4).SequenceEqual("ftyp"u8),
            "video/webm" => bytes >= 4 && head[..4].SequenceEqual(new byte[] { 26, 69, 223, 163 }),
            _ => false
        };
        if (!valid) error = "El contenido del archivo no coincide con su extensión.";
        return valid;
    }
}
