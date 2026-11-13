using Amazon.S3;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// One-image-at-a-time backfill for existing CMS images. The default operation
// is inspection only; writing requires two separate opt-in configuration flags.
// No public endpoint, background job, bucket listing or automatic migration.
public static class CmsMediaBackfillEndpoints
{
    private const long MaxOriginalBytes = 5L * 1024 * 1024;
    private static readonly SemaphoreSlim ApplySlot = new(1, 1);

    public sealed record BackfillRequest(bool Apply);

    public static void MapCmsMediaBackfill(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/admin/content/media/{id:guid}/webp-backfill", async Task<IResult> (
            Guid id, BackfillRequest input, AppDbContext db, ObjectStorageService storage,
            IConfiguration configuration, ILoggerFactory loggerFactory, HttpContext http, CancellationToken ct) =>
        {
            // Do not cache administrative inventory, including 400/404/409 results.
            http.Response.Headers.CacheControl = MediaHttpCachePolicy.NoStore;
            if (!storage.Enabled)
                return Results.Json(new { error = "Almacenamiento S3 no disponible." }, statusCode: 503);

            var media = await db.ManagedMedia.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id, ct);
            if (media is null) return Results.NotFound();

            // Only objects uploaded by our own UUID-addressed CMS path are
            // eligible. External links, Base64 and arbitrary imported keys are not.
            var expectedPrefix = $"media/{id:N}.";
            if (media.Kind != "Imagen" ||
                media.MimeType is not ("image/jpeg" or "image/png" or "image/webp") ||
                media.ObjectKey is null ||
                !media.ObjectKey.StartsWith(expectedPrefix, StringComparison.Ordinal) ||
                !new[] { ".jpg", ".jpeg", ".png", ".webp" }
                    .Any(suffix => media.ObjectKey.Equals(expectedPrefix + suffix[1..], StringComparison.Ordinal)))
                return Results.BadRequest(new { error = "Solo se admiten imágenes estáticas almacenadas por el CMS." });

            // The active upload path still defaults to disabled. Existing files
            // additionally require a separate, explicit maintenance opt-in.
            if (input.Apply && (!configuration.GetValue<bool>("CmsMedia:ResponsiveWebpEnabled") ||
                                !configuration.GetValue<bool>("CmsMedia:ExistingImageBackfillEnabled")))
                return Results.Conflict(new { error = "La generación para archivos existentes no está habilitada." });

            var claimed = false;
            if (input.Apply)
            {
                claimed = await ApplySlot.WaitAsync(0, ct);
                if (!claimed)
                    return Results.Json(new { error = "Ya hay una conversión de mantenimiento en curso." }, statusCode: 429);
            }

            try
            {
                // HEAD before any download: historical objects may have larger
                // sizes than their metadata field. Never trust the DB length.
                var originalBytes = await storage.TryGetSizeAsync(media.ObjectKey, ct);
                if (originalBytes is null)
                    return Results.NotFound(new { error = "El original no está disponible en S3." });
                if (originalBytes <= 0 || originalBytes > MaxOriginalBytes)
                    return Results.Json(new { error = "El original excede el límite de 5 MiB." }, statusCode: 413);

                var existing = new List<int>();
                var missing = new List<int>();
                foreach (var width in CmsImageVariants.Widths)
                {
                    var size = await storage.TryGetSizeAsync(CmsImageVariants.ObjectKey(media.ObjectKey, width), ct);
                    if (size.HasValue) existing.Add(width);
                    else missing.Add(width);
                }

                if (!input.Apply)
                    return Results.Ok(new {
                        mediaId = media.Id, mode = "dry-run", originalBytes,
                        existingWidths = existing, missingWidths = missing,
                        originalPreserved = true
                    });

                var generated = new List<int>();
                var notGenerated = new List<int>();
                if (missing.Count > 0)
                {
                    // Byte-limit stream reads as a second line of defense in
                    // case a remote S3 object changes between HEAD and GET.
                    using var fetched = await storage.DownloadAsync(media.ObjectKey, ct);
                    if (fetched.ContentLength > MaxOriginalBytes)
                        return Results.Json(new { error = "El original excede el límite de 5 MiB." }, statusCode: 413);

                    await using var bytes = new MemoryStream((int)originalBytes.Value);
                    var buffer = new byte[32 * 1024];
                    int count;
                    while ((count = await fetched.ResponseStream.ReadAsync(buffer, ct)) != 0)
                    {
                        if (bytes.Length + count > MaxOriginalBytes)
                            return Results.Json(new { error = "El original excede el límite de 5 MiB." }, statusCode: 413);
                        await bytes.WriteAsync(buffer.AsMemory(0, count), ct);
                    }
                    bytes.Position = 0;
                    var file = new FormFile(bytes, 0, bytes.Length, "file", media.Name)
                    {
                        Headers = new HeaderDictionary(),
                        ContentType = media.MimeType!
                    };
                    var logger = loggerFactory.CreateLogger("CmsLegacyWebpBackfill");
                    var variants = await CmsImageVariants.EncodeAsync(file, media.MimeType!, logger, ct);
                    foreach (var width in missing)
                    {
                        if (!variants.TryGetValue(width, out var encoded))
                        {
                            notGenerated.Add(width); // small, animated, EXIF or failed encode
                            continue;
                        }

                        // Never intentionally overwrite a derivative generated
                        // earlier. This is a per-process mutex, not a cross-host
                        // distributed lock; enable only for single-worker maintenance.
                        var key = CmsImageVariants.ObjectKey(media.ObjectKey, width);
                        if ((await storage.TryGetSizeAsync(key, ct)).HasValue)
                        {
                            existing.Add(width);
                            continue;
                        }
                        try
                        {
                            using var stream = new MemoryStream(encoded, writable: false);
                            await storage.UploadAsync(key, stream, encoded.LongLength, "image/webp", ct);
                            generated.Add(width);
                        }
                        catch (AmazonS3Exception ex)
                        {
                            logger.LogWarning(ex, "CMS legacy WebP PUT failed for width {Width}", width);
                            notGenerated.Add(width);
                        }
                    }
                }
                return Results.Ok(new {
                    mediaId = media.Id, mode = "apply", originalBytes,
                    existingWidths = existing, generatedWidths = generated,
                    unavailableWidths = notGenerated, originalPreserved = true
                });
            }
            catch (AmazonS3Exception)
            {
                return Results.Json(new { error = "Almacenamiento S3 temporalmente no disponible." }, statusCode: 503);
            }
            finally
            {
                if (claimed) ApplySlot.Release();
            }
        }).RequireAuthorization("admin");
    }
}
