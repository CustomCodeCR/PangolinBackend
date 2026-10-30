using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services.Realtime;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Endpoints;

public sealed record SaveFeaturedFacebookVideoRequest(string? Url, Guid? MediaId);

public static class FacebookFeaturedVideoEndpoints
{
    private const string SlotKey = "home.facebook.video";
    private const string ProfileUrl = "https://www.facebook.com/grupocastrofallas1";
    private sealed record FeaturedVideo(string Permalink, string? VideoSrc, DateTimeOffset PublishedAt);
    private sealed record Response(FeaturedVideo? Video, string ProfileUrl);

    public static IEndpointRouteBuilder MapFacebookFeaturedVideo(this IEndpointRouteBuilder app)
    {
        // Public, read-only content. Facebook does not provide a token-free latest-video API.
        // Show only a video explicitly published by an admin.
        app.MapGet("/api/social/facebook/featured-video", async Task<IResult> (
            AppDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var slot = await db.SiteCmsSlots.AsNoTracking()
                .Where(s => s.Key == SlotKey)
                .Select(s => new { s.PublishedEs, s.PublishedMediaId, s.PublishedAt })
                .FirstOrDefaultAsync(ct);
            var link = NormalizeVideoUrl(slot?.PublishedEs);
            if (link is null) return Results.Ok(new Response(null, ProfileUrl));

            string? videoSrc = null;
            if (slot?.PublishedMediaId is Guid mediaId)
            {
                var available = await db.ManagedMedia.AsNoTracking().AnyAsync(m =>
                    m.Id == mediaId && m.Kind == "Video" && m.ObjectKey != null &&
                    (m.MimeType == "video/mp4" || m.MimeType == "video/webm"), ct);
                if (available) videoSrc = $"/api/content/media/{mediaId}/file";
            }

            var publishedAt = slot?.PublishedAt is DateTime timestamp
                ? new DateTimeOffset(DateTime.SpecifyKind(timestamp, DateTimeKind.Utc))
                : DateTimeOffset.UtcNow;
            return Results.Ok(new Response(new FeaturedVideo(link, videoSrc, publishedAt), ProfileUrl));
        });

        app.MapPut("/api/admin/content/facebook-video", async Task<IResult> (
            SaveFeaturedFacebookVideoRequest input, AppDbContext db,
            ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var value = input.Url?.Trim() ?? "";
            var link = NormalizeVideoUrl(value);
            if (value.Length != 0 && link is null)
                return Results.BadRequest(new { error = "Indicá un enlace HTTPS válido de video o Reel de Facebook." });
            if (input.MediaId is Guid mediaId)
            {
                if (link is null)
                    return Results.BadRequest(new { error = "Indicá el enlace público del video antes de asociar un archivo." });
                var valid = await db.ManagedMedia.AsNoTracking().AnyAsync(m =>
                    m.Id == mediaId && m.Kind == "Video" && m.ObjectKey != null &&
                    (m.MimeType == "video/mp4" || m.MimeType == "video/webm"), ct);
                if (!valid)
                    return Results.BadRequest(new { error = "Seleccioná un MP4 o WebM de la biblioteca multimedia." });
            }

            var slot = await db.SiteCmsSlots.FindAsync([SlotKey], ct);
            if (slot is null)
            {
                slot = new SiteCmsSlot { Key = SlotKey };
                db.SiteCmsSlots.Add(slot);
            }
            slot.DraftEs = slot.PublishedEs = link;
            slot.DraftEn = slot.PublishedEn = null;
            slot.DraftMediaId = slot.PublishedMediaId = input.MediaId;
            slot.UpdatedAt = DateTime.UtcNow;
            slot.PublishedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("site-admin");
            await updates.PublicAsync("site");
            return Results.Ok(new { url = link, mediaId = slot.PublishedMediaId });
        }).RequireAuthorization("admin");

        return app;
    }

    // Strictly allow known Facebook video formats, not arbitrary sites or page URLs.
    private static string? NormalizeVideoUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 512 ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            (uri.Host != "www.facebook.com" && uri.Host != "facebook.com" && uri.Host != "m.facebook.com") ||
            uri.Port != 443 || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Fragment))
            return null;

        var parts = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        static bool IsIdentifier(string id) => id.Length is >= 5 and <= 80 &&
            id.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');
        static bool IsVideoId(string id) => id.Length is >= 5 and <= 40 && id.All(char.IsAsciiDigit);

        if (parts.Length == 2 && parts[0] == "reel" && IsIdentifier(parts[1]))
            return $"https://www.facebook.com/reel/{parts[1]}/";

        if (parts.Length == 3 && parts[0] == "grupocastrofallas1" &&
            parts[1] == "videos" && IsVideoId(parts[2]))
            return $"https://www.facebook.com/grupocastrofallas1/videos/{parts[2]}/";

        if (parts.Length == 2 && parts[0] == "videos" && IsVideoId(parts[1]))
            return $"https://www.facebook.com/videos/{parts[1]}/";

        if (parts.Length == 1 && parts[0] == "watch")
        {
            var query = uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries);
            var videoId = query.Select(pair => pair.Split('=', 2))
                .Where(pair => pair.Length == 2 && pair[0] == "v")
                .Select(pair => pair[1]).FirstOrDefault();
            if (videoId is not null && IsVideoId(videoId))
                return $"https://www.facebook.com/watch/?v={videoId}";
        }
        return null;
    }
}
