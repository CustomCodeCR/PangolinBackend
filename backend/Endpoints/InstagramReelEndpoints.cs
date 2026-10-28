using System.Net.Http.Headers;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services.Realtime;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace CastroFallas.MiniQuote.Api.Endpoints;

public static class InstagramReelEndpoints
{
    private const string ProfileUrl = "https://www.instagram.com/grupocastrofallas1/";
    private const string CacheKey = "social:instagram:latest-reel:v1";
    private const string ManualReelKey = "home.instagram.reel";
    private sealed record SaveFeaturedReelRequest(string? Url);
    private sealed record Reel(string Permalink, string? ThumbnailUrl, DateTimeOffset PublishedAt);
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

            var slot = await db.SiteCmsSlots.FindAsync([ManualReelKey], ct);
            if (slot is null) { slot = new SiteCmsSlot { Key = ManualReelKey }; db.SiteCmsSlots.Add(slot); }
            slot.DraftEs = slot.PublishedEs = url;
            slot.DraftEn = slot.PublishedEn = null;
            slot.DraftMediaId = slot.PublishedMediaId = null;
            slot.UpdatedAt = DateTime.UtcNow;
            slot.PublishedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("site-admin");
            await updates.PublicAsync("site");
            return Results.Ok(new { url });
        }).RequireAuthorization("admin");

        return app;
    }

    private static async Task<IResult> GetLatestReelAsync(
        IConfiguration config, IHttpClientFactory clients, IMemoryCache cache,
        AppDbContext db, HttpContext http, CancellationToken ct)
    {
        // A manually selected Reel always wins, even if the Meta API is not configured.
        // The existing site CMS persists this setting across Docker restarts.
        var chosen = await db.SiteCmsSlots.AsNoTracking()
            .Where(s => s.Key == ManualReelKey)
            .Select(s => new { s.PublishedEs, s.PublishedAt })
            .FirstOrDefaultAsync(ct);
        var chosenUrl = NormalizeReelUrl(chosen?.PublishedEs);
        if (chosenUrl is not null)
        {
            http.Response.Headers.CacheControl = "no-store";
            var date = chosen?.PublishedAt is DateTime stamp
                ? new DateTimeOffset(DateTime.SpecifyKind(stamp, DateTimeKind.Utc))
                : DateTimeOffset.UtcNow;
            return Results.Ok(new Response(new Reel(chosenUrl, null, date), ProfileUrl));
        }

        http.Response.Headers.CacheControl = "public, max-age=120";

        var token = config["Instagram:AccessToken"];
        if (string.IsNullOrWhiteSpace(token))
            return Results.Ok(new Response(null, ProfileUrl));

        if (cache.TryGetValue<Response>(CacheKey, out var saved) && saved is not null)
            return Results.Ok(saved);

        // Server-side only. The HTTP client has a fixed Meta host and no redirects.
        Reel? latest;
        try
        {
            latest = await FetchAsync(clients.CreateClient("Instagram"), token.Trim(), ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            latest = null; // Meta timed out; preserve a working Home.
        }
        catch (HttpRequestException)
        {
            latest = null;
        }
        catch (JsonException)
        {
            latest = null;
        }

        var result = new Response(latest, ProfileUrl);
        cache.Set(CacheKey, result, latest is null ? TimeSpan.FromMinutes(2) : TimeSpan.FromMinutes(10));
        return Results.Ok(result);
    }

    private static async Task<Reel?> FetchAsync(HttpClient client, string token, CancellationToken ct)
    {
        // Verify the token belongs to the official company account. A token from
        // any other account must never populate the company website.
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

        // Instagram Login for Business/Creator, read-only instagram_business_basic.
        // Fetch recent media and pick the newest Reel by timestamp, not a fixed post.
        using var request = NewRequest(
            "me/media?fields=id,media_type,permalink,thumbnail_url,timestamp&limit=50", token);
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
            if (item.ValueKind != JsonValueKind.Object) continue;
            var url = NormalizeReelUrl(GetString(item, "permalink"));
            if (url is null) continue;
            if (!string.Equals(GetString(item, "media_product_type"), "REELS", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(GetString(item, "media_type"), "VIDEO", StringComparison.OrdinalIgnoreCase))
                continue;

            if (!DateTimeOffset.TryParse(GetString(item, "timestamp"), out var publishedAt)) continue;
            var thumbnail = TrustedThumbnail(GetString(item, "thumbnail_url"));
            var candidate = new Reel(url, thumbnail, publishedAt);
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
