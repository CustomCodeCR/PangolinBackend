using CastroFallas.MiniQuote.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// Safe first step before any legacy CMS migration: inspect PostgreSQL metadata
// only. The inventory neither opens S3 nor returns raw URLs or Base64 payloads.
public static class CmsImageInventoryEndpoints
{
    private const int PageLimit = 500;
    private const int PrefixLength = 128;
    private const long MaxBackfillBytes = 5L * 1024 * 1024;

    public static void MapCmsImageInventory(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/content/media/inventory", async Task<IResult> (
            AppDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = MediaHttpCachePolicy.NoStore;

            // String.Length and Substring are evaluated by PostgreSQL.
            // Never load megabyte-sized inline image strings into the API,
            // even for unpublished news. Only a 128-char prefix is retrieved.
            var newsRows = await db.ManagedNews.AsNoTracking()
                .OrderByDescending(x => x.Image.Length).ThenBy(x => x.Id)
                .Select(x => new
                {
                    x.Id, x.Title, x.Published, x.ExpiresAt,
                    SourceCharacters = x.Image.Length,
                    SourcePrefix = x.Image.Substring(0, PrefixLength)
                })
                .Take(PageLimit + 1)
                .ToListAsync(ct);

            var mediaRows = await db.ManagedMedia.AsNoTracking()
                .OrderByDescending(x => x.SizeBytes).ThenBy(x => x.Id)
                .Select(x => new
                {
                    x.Id, x.Name, x.Kind, x.MimeType, x.SizeBytes, x.ObjectKey,
                    SourceCharacters = x.Src.Length,
                    SourcePrefix = x.Src.Substring(0, PrefixLength)
                })
                .Take(PageLimit + 1)
                .ToListAsync(ct);

            var siteRows = await db.SiteCmsSlots.AsNoTracking()
                .Where(x => x.PublishedMediaId.HasValue || x.DraftMediaId.HasValue)
                .OrderBy(x => x.Key)
                .Select(x => new { x.Key, x.PublishedMediaId, x.DraftMediaId })
                .Take(PageLimit + 1)
                .ToListAsync(ct);

            var moreNews = newsRows.Count > PageLimit;
            var moreMedia = mediaRows.Count > PageLimit;
            var moreSlots = siteRows.Count > PageLimit;
            var mediaIndex = mediaRows.Take(PageLimit).ToDictionary(x => x.Id);
            var news = newsRows.Take(PageLimit).Select(x =>
            {
                var source = Classify(x.SourcePrefix, x.SourceCharacters);
                var mediaId = CmsId(x.SourcePrefix, x.SourceCharacters);
                var linked = mediaId.HasValue && mediaIndex.TryGetValue(mediaId.Value, out var _);
                var stored = linked && mediaIndex[mediaId!.Value].ObjectKey is not null;
                var backfillCandidate = linked && Eligible(
                    mediaId!.Value, mediaIndex[mediaId.Value].Kind, mediaIndex[mediaId.Value].MimeType,
                    mediaIndex[mediaId.Value].SizeBytes, mediaIndex[mediaId.Value].ObjectKey,
                    mediaIndex[mediaId.Value].SourcePrefix, mediaIndex[mediaId.Value].SourceCharacters);

                return new
                {
                    x.Id, x.Title, x.Published, x.ExpiresAt,
                    SourceType = source,
                    x.SourceCharacters,
                    EstimatedInlineBytes = source == "inline-base64"
                        ? EstimateDataBytes(x.SourceCharacters, x.SourcePrefix) : null,
                    MediaId = mediaId,
                    HasStoredObject = stored,
                    BackfillCandidate = backfillCandidate,
                    // A missing media row might simply be outside the limited
                    // inventory. Never say it is absent without checking.
                    MediaReferenceVerified = !mediaId.HasValue || linked,
                };
            }).ToArray();

            var media = mediaRows.Take(PageLimit).Select(x =>
            {
                var candidate = Eligible(
                    x.Id, x.Kind, x.MimeType, x.SizeBytes, x.ObjectKey,
                    x.SourcePrefix, x.SourceCharacters);
                var source = Classify(x.SourcePrefix, x.SourceCharacters);
                return new
                {
                    x.Id, x.Name, x.Kind, x.MimeType, x.SizeBytes,
                    SourceType = source,
                    IsStoredObject = x.ObjectKey is not null,
                    BackfillCandidate = candidate,
                    ReferencedByPublishedNews = news.Any(n => n.Published && n.MediaId == x.Id),
                    ReferencedByPublishedSlot = siteRows.Any(s => s.PublishedMediaId == x.Id),
                    ReferencedByDraftSlot = siteRows.Any(s => s.DraftMediaId == x.Id),
                    EstimatedInlineBytes = source == "inline-base64"
                        ? EstimateDataBytes(x.SourceCharacters, x.SourcePrefix) : null
                };
            }).ToArray();

            return Results.Ok(new
            {
                Mode = "read-only",
                DataSource = "postgres-metadata",
                ConsultedS3 = false,
                NoObjectWrites = true,
                PageLimit,
                MoreNews = moreNews, MoreMedia = moreMedia, MoreSlots = moreSlots,
                News = news,
                Media = media,
                // Slot keys are CMS section identifiers, not URLs or image bytes.
                Slots = siteRows.Take(PageLimit).Select(x => new {
                    x.Key, x.PublishedMediaId, x.DraftMediaId
                }).ToArray()
            });
        }).RequireAuthorization("admin");
    }

    private static string Classify(string prefix, int chars)
    {
        if (chars == 0) return "empty";
        if (prefix.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) &&
            prefix.Contains(";base64,", StringComparison.OrdinalIgnoreCase))
            return "inline-base64";
        if (CmsId(prefix, chars).HasValue) return "cms-media";
        if (prefix.StartsWith("/images/", StringComparison.Ordinal)) return "bundled-static";
        if (prefix.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return "external-https";
        return "other";
    }

    private static Guid? CmsId(string prefix, int chars)
    {
        const string start = "/api/content/media/";
        const string end = "/file";
        // 36-char GUID: reject query strings, fragments, admin paths and
        // truncated prefixes. We deliberately do not return the raw URL.
        if (chars != start.Length + 36 + end.Length ||
            !prefix.StartsWith(start, StringComparison.Ordinal) ||
            !prefix.EndsWith(end, StringComparison.Ordinal))
            return null;
        return Guid.TryParseExact(prefix.Substring(start.Length, 36), "D", out var id) ? id : null;
    }

    private static long? EstimateDataBytes(int chars, string prefix)
    {
        var comma = prefix.IndexOf(',');
        if (comma < 0 || chars <= comma + 1) return null;
        // Base64 padding is not known from the SQL prefix, so approximate.
        return 3L * ((chars - comma - 1) / 4);
    }

    private static bool Eligible(Guid id, string kind, string? mime, long? bytes,
        string? key, string srcPrefix, int srcChars)
    {
        if (kind != "Imagen" ||
            mime is not ("image/jpeg" or "image/png" or "image/webp") ||
            bytes is null or <= 0 or > MaxBackfillBytes ||
            key is null || CmsId(srcPrefix, srcChars) != id)
            return false;

        return new[] { ".jpg", ".jpeg", ".png", ".webp" }
            .Any(ext => string.Equals(key, $"media/{id:N}{ext}", StringComparison.Ordinal));
    }
}
