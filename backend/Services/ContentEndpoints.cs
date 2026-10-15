using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// CRUD PostgreSQL para noticias y multimedia del panel. El público solo ve
// noticias marcadas como publicadas; toda escritura exige JWT administrador.
public static class ContentEndpoints
{
    private const int MaxImageChars = 3_500_000;

    public static void MapManagedContent(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/content/news", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.ManagedNews.AsNoTracking()
                .Where(x => x.Published)
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Title, x.Category, x.Description, x.Image, x.Published })
                .ToListAsync(ct)));

        var admin = app.MapGroup("/api/admin/content").RequireAuthorization("admin");

        admin.MapGet("/news", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.ManagedNews.AsNoTracking()
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Title, x.Category, x.Description, x.Image, x.Published })
                .ToListAsync(ct)));

        admin.MapPost("/news", async (SaveNewsRequest input, AppDbContext db, CancellationToken ct) =>
        {
            var validation = ValidateNews(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var news = new ManagedNews();
            ApplyNews(news, input);
            db.ManagedNews.Add(news);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/admin/content/news/{news.Id}", NewsView(news));
        });

        admin.MapPut("/news/{id:guid}", async (
            Guid id, SaveNewsRequest input, AppDbContext db, CancellationToken ct) =>
        {
            var validation = ValidateNews(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var news = await db.ManagedNews.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (news is null) return Results.NotFound(new { error = "Noticia no encontrada." });
            ApplyNews(news, input);
            await db.SaveChangesAsync(ct);
            return Results.Ok(NewsView(news));
        });

        admin.MapDelete("/news/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var news = await db.ManagedNews.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (news is null) return Results.NotFound(new { error = "Noticia no encontrada." });
            db.ManagedNews.Remove(news);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        admin.MapGet("/media", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.ManagedMedia.AsNoTracking()
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Name, x.Kind, x.Src })
                .ToListAsync(ct)));

        admin.MapPost("/media", async (SaveMediaRequest input, AppDbContext db, CancellationToken ct) =>
        {
            var validation = ValidateMedia(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var media = new ManagedMedia();
            ApplyMedia(media, input);
            db.ManagedMedia.Add(media);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/admin/content/media/{media.Id}", MediaView(media));
        });

        admin.MapPut("/media/{id:guid}", async (
            Guid id, SaveMediaRequest input, AppDbContext db, CancellationToken ct) =>
        {
            var validation = ValidateMedia(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var media = await db.ManagedMedia.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound(new { error = "Archivo no encontrado." });
            ApplyMedia(media, input);
            await db.SaveChangesAsync(ct);
            return Results.Ok(MediaView(media));
        });

        admin.MapDelete("/media/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var media = await db.ManagedMedia.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound(new { error = "Archivo no encontrado." });
            db.ManagedMedia.Remove(media);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    private static string? ValidateNews(SaveNewsRequest x)
    {
        if (string.IsNullOrWhiteSpace(x.Title) || x.Title.Trim().Length > 160)
            return "El título debe tener entre 1 y 160 caracteres.";
        if (string.IsNullOrWhiteSpace(x.Category) || x.Category.Trim().Length > 60)
            return "La categoría debe tener entre 1 y 60 caracteres.";
        if (string.IsNullOrWhiteSpace(x.Description) || x.Description.Trim().Length > 1200)
            return "La descripción debe tener entre 1 y 1200 caracteres.";
        if (!ValidImage(x.Image, allowEmpty: true))
            return "La imagen debe ser HTTPS, /images/ o PNG/JPEG/WebP/GIF hasta 2.5 MB.";
        return null;
    }

    private static string? ValidateMedia(SaveMediaRequest x)
    {
        if (string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 200)
            return "El nombre debe tener entre 1 y 200 caracteres.";
        if (string.IsNullOrWhiteSpace(x.Kind) || x.Kind.Trim().Length > 30)
            return "El tipo de archivo debe tener entre 1 y 30 caracteres.";
        if (!ValidImage(x.Src, allowEmpty: false))
            return "La URL/imagen no es válida o supera el tamaño permitido.";
        return null;
    }

    private static bool ValidImage(string? src, bool allowEmpty)
    {
        if (string.IsNullOrWhiteSpace(src)) return allowEmpty;
        var value = src.Trim();
        if (value.Length > MaxImageChars) return false;
        if (value.StartsWith("/images/", StringComparison.Ordinal) &&
            !value.Contains("..", StringComparison.Ordinal) &&
            !value.Contains('\\')) return true;
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
            uri.Scheme == Uri.UriSchemeHttps && uri.Host.Length > 0) return true;
        return new[] { "data:image/png;base64,", "data:image/jpeg;base64,",
            "data:image/webp;base64,", "data:image/gif;base64," }
            .Any(prefix => value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    private static void ApplyNews(ManagedNews target, SaveNewsRequest input)
    {
        target.Title = input.Title!.Trim();
        target.Category = input.Category!.Trim();
        target.Description = input.Description!.Trim();
        target.Image = input.Image?.Trim() ?? "";
        target.Published = input.Published;
        target.UpdatedAt = DateTime.UtcNow;
    }

    private static void ApplyMedia(ManagedMedia target, SaveMediaRequest input)
    {
        target.Name = input.Name!.Trim();
        target.Kind = input.Kind!.Trim();
        target.Src = input.Src!.Trim();
        target.UpdatedAt = DateTime.UtcNow;
    }

    private static object NewsView(ManagedNews x) => new
    {
        x.Id, x.Title, x.Category, x.Description, x.Image, x.Published
    };

    private static object MediaView(ManagedMedia x) => new { x.Id, x.Name, x.Kind, x.Src };
}
