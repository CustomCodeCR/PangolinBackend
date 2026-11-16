using System.Security.Cryptography;
using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// The legacy CMS stored inline data:image/...;base64,... in news.Image.
// Avoid serializing those megabyte-sized values into public JSON and Nuxt SSR
// without changing their PostgreSQL originals or the admin editing contract.
// Deliberately no S3 dependency and no WebP conversion.
public static class CmsInlineNewsImages
{
    private const int MaxDataUrlChars = 3_350_000;

    public static string PublicImageSrc(Guid id, string original, bool enabled)
    {
        if (!enabled || !IsSupportedDataUrl(original)) return original;
        return $"/api/content/news/{id}/image";
    }

    private static bool IsSupportedDataUrl(string? dataUrl)
    {
        if (string.IsNullOrEmpty(dataUrl) || dataUrl.Length > MaxDataUrlChars)
            return false;
        return Prefix(dataUrl) is not null;
    }

    private static (string mime, string prefix)? Prefix(string value)
    {
        foreach (var item in new[] {
            (mime: "image/png", prefix: "data:image/png;base64,"),
            (mime: "image/jpeg", prefix: "data:image/jpeg;base64,"),
            (mime: "image/webp", prefix: "data:image/webp;base64,"),
            (mime: "image/gif", prefix: "data:image/gif;base64,")
        })
            if (value.StartsWith(item.prefix, StringComparison.OrdinalIgnoreCase))
                return item;
        return null;
    }

    private static bool TryDecode(string source, out byte[] bytes, out string mime)
    {
        bytes = Array.Empty<byte>();
        mime = "";
        if (!IsSupportedDataUrl(source)) return false;
        var found = Prefix(source);
        if (found is null) return false;
        mime = found.Value.mime;
        var encoded = source.AsSpan(found.Value.prefix.Length);
        // Bound decoded payload even if a historic record bypassed validation.
        if (encoded.IsEmpty || encoded.Length % 4 != 0) return false;
        try { bytes = Convert.FromBase64String(source[found.Value.prefix.Length..]); }
        catch (FormatException) { return false; }
        if (bytes.Length == 0 || bytes.Length > 2_500_000) return false;
        var span = bytes.AsSpan();
        return mime switch
        {
            "image/png" => span.Length >= 8 &&
                span[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/jpeg" => span.Length >= 3 &&
                span[..3].SequenceEqual(new byte[] { 255, 216, 255 }),
            "image/webp" => span.Length >= 12 &&
                span[..4].SequenceEqual("RIFF"u8) && span.Slice(8, 4).SequenceEqual("WEBP"u8),
            "image/gif" => span.Length >= 6 &&
                (span[..6].SequenceEqual("GIF87a"u8) || span[..6].SequenceEqual("GIF89a"u8)),
            _ => false
        };
    }

    public static void MapCmsInlineNewsImages(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/content/news/{id:guid}/image", async Task<IResult> (
            Guid id, AppDbContext db, HttpContext http, CancellationToken ct) =>
        {
            // Every request checks publication/expiration against PostgreSQL,
            // including requests with an If-None-Match validator.
            http.Response.Headers.CacheControl = MediaHttpCachePolicy.NoStore;
            var source = await db.ManagedNews.AsNoTracking()
                .Where(n => n.Id == id && n.Published &&
                    (n.ExpiresAt == null || n.ExpiresAt > DateTime.UtcNow))
                .Select(n => n.Image)
                .FirstOrDefaultAsync(ct);
            if (source is null || !TryDecode(source, out var bytes, out var mime))
                return Results.NotFound();

            // The bytes may change when an admin edits a news item, so hash
            // its contents instead of using the immutable S3 object validator.
            var digest = Convert.ToHexString(SHA256.HashData(bytes));
            var etag = $"\"cms-news-{id:N}-{digest}\"";
            var range = http.Request.Headers.Range.ToString();
            http.Response.Headers.ETag = etag;
            http.Response.Headers.CacheControl = MediaHttpCachePolicy.PublishedMedia;
            http.Response.Headers.XContentTypeOptions = "nosniff";

            if (MediaHttpCachePolicy.IsNotModified(http.Request.Headers.IfNoneMatch.ToString(), range, etag))
                return Results.StatusCode(StatusCodes.Status304NotModified);

            // Framework-native range handling preserves actual image bytes,
            // rather than embedding them in HTML or returning a data URI.
            return Results.File(bytes, contentType: mime, enableRangeProcessing: true);
        }).RequireRateLimiting("public-read");
    }
}
