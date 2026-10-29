using System.Net.Http.Headers;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services.Realtime;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace CastroFallas.MiniQuote.Api.Endpoints;

public sealed record SaveFeaturedReelRequest(string? Url, Guid? MediaId);

public static class InstagramReelEndpoints
{
    private const string ProfileUrl = "https://www.instagram.com/grupocastrofallas1/";
    private const string CacheKey = "social:instagram:latest-reel:v1";
    private const string ManualReelKey = "home.instagram.reel";
    private sealed record Reel(string Permalink, string? ThumbnailUrl, DateTimeOffset PublishedAt, string? VideoSrc = null);
    private sealed record Response(Reel? Reel, string ProfileUrl);

    public static IEndpointRouteBuilder MapInstagramReel(this IEndpointRouteBuilder app)
    {
        // Public endpoint: never sends an Instagram access token to a visitor.
        app.MapGet("/api/social/instagram/latest-reel", GetLatestReelAsync);

        // A simple, atomic publish operation for site administrators. It uses the
        // existing CMS table, without introducing a new database schema or tokens.
        app.MapPut("/api/admin/content/instagram-reel", async Task<IResult> (
            SaveFeaturedReelRequest input, AppDbContext db,
            ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var value = input.Url?.Trim() ?? "";
            if (value.Length > 512) return Results.BadRequest(new { error = "El enlace es demasiado largo." });
            var url = value.Length == 0 ? null : NormalizeReelUrl(value);
            if (value.Length != 0 && url is null)
                return Results.BadRequest(new { error = "Pegá un enlace HTTPS válido de un Reel de Instagram (instagram.com/reel/...)."});

            // Optional full-bleed player: a company-owned MP4/WebM already uploaded to
            // the protected media library. No remote video URLs or scraping.
            if (input.MediaId is Guid videoId)
            {
                if (url is null)
                    return Results.BadRequest(new { error = "Primero indicá el enlace del Reel original." });
                var isVideo = await db.ManagedMedia.AsNoTracking().AnyAsync(m => m.Id == videoId
                    && m.Kind == "Video" && m.ObjectKey != null
                    && (m.MimeType == "video/mp4" || m.MimeType == "video/webm"), ct);
                if (!isVideo)
                    return Results.BadRequest(new { error = "Seleccioná un MP4 o WebM de la biblioteca multimedia." });
            }

            var slot = await db.SiteCmsSlots.FindAsync([ManualReelKey], ct);
            if (slot is null) { slot = new SiteCmsSlot { Key = ManualReelKey }; db.SiteCmsSlots.Add(slot); }
            slot.DraftEs = slot.PublishedEs = url;
            slot.DraftEn = slot.PublishedEn = null;
            slot.DraftMediaId = slot.PublishedMediaId = input.MediaId;
            slot.UpdatedAt = DateTime.UtcNow;
            slot.PublishedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("site-admin");
            await updates.PublicAsync("site");
            return Results.Ok(new { url, mediaId = slot.PublishedMediaId });
        }).RequireAuthorization("admin");

        return app;
    }

    private static async Task<IResult> GetLatestReelAsync(
        IConfiguration config, IHttpClientFactory clients, IMemoryCache cache,
        AppDbContext db, HttpContext http, CancellationToken ct)
    {
        // The selected Reel and its original company video always have priority.
        // A Meta connection can supply a native video when no file was uploaded.
        var chosen = await db.SiteCmsSlots.AsNoTracking()
            .Where(s => s.Key == ManualReelKey)
            .Select(s => new { s.PublishedEs, s.PublishedMediaId, s.PublishedAt })
            .FirstOrDefaultAsync(ct);
        var chosenUrl = NormalizeReelUrl(chosen?.PublishedEs);
        // Signed CDN URLs expire, so browser caches must not keep old responses.
        http.Response.Headers.CacheControl = "no-store";

        Reel? selected = null;
        if (chosenUrl is not null)
        {
            var date = chosen?.PublishedAt is DateTime stamp
                ? new DateTimeOffset(DateTime.SpecifyKind(stamp, DateTimeKind.Utc))
                : DateTimeOffset.UtcNow;
            string? videoSrc = null;
            if (chosen?.PublishedMediaId is Guid mediaId)
            {
                var file = await db.ManagedMedia.AsNoTracking()
                    .Where(m => m.Id == mediaId && m.Kind == "Video" && m.ObjectKey != null
                        && (m.MimeType == "video/mp4" || m.MimeType == "video/webm"))
                    .Select(m => new { m.Id })
                    .FirstOrDefaultAsync(ct);
                if (file is not null) videoSrc = $"/api/content/media/{file.Id}/file";
            }
            selected = new Reel(chosenUrl, null, date, videoSrc);
            if (videoSrc is not null)
                return Results.Ok(new Response(selected, ProfileUrl));
        }

        // In manual mode without an uploaded video, look up the same Reel in
        // Instagram's authorized media list. Never silently substitute a different Reel.
        var token = config["Instagram:AccessToken"];
        if (string.IsNullOrWhiteSpace(token))
            return Results.Ok(new Response(selected, ProfileUrl));

        var key = chosenUrl is null ? CacheKey : $"{CacheKey}:{chosenUrl}";
        if (cache.TryGetValue<Response>(key, out var saved) && saved is not null)
            return Results.Ok(saved);

        Reel? fromMeta = null;
        try
        {
            fromMeta = await FetchAsync(clients.CreateClient("Instagram"), token.Trim(), chosenUrl, ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { }
        catch (HttpRequestException) { }
        catch (JsonException) { }

        // The embed/link remains available if the media URL is missing or Meta is down.
        var result = new Response(fromMeta ?? selected, ProfileUrl);
        // Short TTL: media_url links are temporary and must be requested again.
        cache.Set(key, result, TimeSpan.FromMinutes(fromMeta?.VideoSrc is null ? 2 : 4));
        return Results.Ok(result);
    }

    private static async Task<Reel?> FetchAsync(HttpClient client, string token, string? selectedUrl, CancellationToken ct)
    {
        // A token belonging to any other Instagram account must not populate this website.
        using var identity = NewRequest("me?fields=username", token);
        using var identityResponse = await client.SendAsync(identity, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!identityResponse.IsSuccessStatusCode) return null;
        await identityResponse.Content.LoadIntoBufferAsync(16 * 1024, ct);
        await using (var body = await identityResponse.Content.ReadAsStreamAsync(ct))
        {
            using var document = await JsonDocument.ParseAsync(body, cancellationToken: ct);
            if (!string.Equals(GetString(document.RootElement, "username"), "grupocastrofallas1",
                StringComparison.OrdinalIgnoreCase))
                return null;
        }

        // Read only the fields supported by Instagram Login. Reels have media_type
        // VIDEO and /reel/ links; media_product_type may not be available.
        using var request = NewRequest(
            "me/media?fields=id,media_type,permalink,media_url,thumbnail_url,timestamp&limit=50", token);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode) return null;
        await response.Content.LoadIntoBufferAsync(512 * 1024, ct);
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (doc.RootElement.ValueKind != JsonValueKind.Object ||
            !doc.RootElement.TryGetProperty("data", out var data) ||
            data.ValueKind != JsonValueKind.Array) return null;

        Reel? newest = null;
        foreach (var item in data.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object ||
                !string.Equals(GetString(item, "media_type"), "VIDEO", StringComparison.OrdinalIgnoreCase))
                continue;
            var url = NormalizeReelUrl(GetString(item, "permalink"));
            if (url is null || (selectedUrl is not null && url != selectedUrl)) continue;
            if (!DateTimeOffset.TryParse(GetString(item, "timestamp"), out var date)) continue;

            var thumbnail = TrustedThumbnail(GetString(item, "thumbnail_url"));
            var nativeVideo = TrustedMetaMediaUrl(GetString(item, "media_url"));
            var candidate = new Reel(url, thumbnail, date, nativeVideo);
            if (selectedUrl is not null) return candidate;
            if (newest is null || candidate.PublishedAt > newest.PublishedAt) newest = candidate;
        }
        return newest;
    }

    private static HttpRequestMessage NewRequest(string path, string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    private static string? GetString(JsonElement node, string name) =>
        node.ValueKind == JsonValueKind.Object &&
        node.TryGetProperty(name, out var value) &&
        value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static string? NormalizeReelUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 512 ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            (uri.Host != "www.instagram.com" && uri.Host != "instagram.com" && uri.Host != "m.instagram.com") ||
            uri.Port != 443 || !string.IsNullOrEmpty(uri.UserInfo)) return null;

        var parts = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2 || parts[0] != "reel" ||
            parts[1].Length is < 5 or > 80 ||
            parts[1].Any(c => !char.IsAsciiLetterOrDigit(c) && c != '_' && c != '-')) return null;

        return $"https://www.instagram.com/reel/{parts[1]}/";
    }

    // CDN video files supplied by Meta may be rendered natively, but never use
    // arbitrary URLs or expose the Instagram token in an HTML video element.
    private static string? TrustedMetaMediaUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 4096 ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps || uri.Port != 443 ||
            !string.IsNullOrEmpty(uri.UserInfo))
            return null;

        var host = uri.Host;
        return host.Equals("fbcdn.net", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".fbcdn.net", StringComparison.OrdinalIgnoreCase) ||
               host.Equals("cdninstagram.com", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".cdninstagram.com", StringComparison.OrdinalIgnoreCase)
            ? value : null;
    }

    private static string? TrustedThumbnail(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps || uri.Port != 443) return null;
        var host = uri.Host;
        return host.Equals("fbcdn.net", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".fbcdn.net", StringComparison.OrdinalIgnoreCase) ||
               host.Equals("cdninstagram.com", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".cdninstagram.com", StringComparison.OrdinalIgnoreCase)
            ? value : null;
    }
}
