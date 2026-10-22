using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services.Realtime;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// CRUD PostgreSQL para noticias y multimedia del panel. El público solo ve
// noticias marcadas como publicadas; toda escritura exige JWT administrador.
public static class ContentEndpoints
{
    private const int MaxImageChars = 3_350_000; // Aproximadamente 2.5 MB en base64.
    private const int MaxUrlChars = 2048;

    public static void MapManagedContent(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/content/news", async (AppDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(await db.ManagedNews.AsNoTracking()
                .Where(x => x.Published)
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Title, x.Category, x.Description, x.Body, x.Image, x.Published })
                .ToListAsync(ct));
        });

        // Traducción pública exclusivamente de artículos publicados. Almacena en caché
        // por ID + versión para no volver a cobrar por cada cambio del idioma.
        app.MapGet("/api/content/news/{id:guid}/translation", async (
            Guid id, string? lang, AppDbContext db, NewsTranslationService translator, CancellationToken ct) =>
        {
            if (!string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Solo se admite lang=en." });
            var article = await db.ManagedNews.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id && x.Published, ct);
            if (article is null) return Results.NotFound();
            if (!translator.IsConfigured)
                return Results.Problem("Traducción al inglés no configurada en el servidor.", statusCode: 503);
            try
            {
                var english = await translator.TranslateAsync(article, ct);
                return Results.Ok(english);
            }
            catch (NewsTranslationException)
            {
                return Results.Problem("No fue posible traducir la noticia en este momento.", statusCode: 502);
            }
        }).RequireRateLimiting("news-translation");

        app.MapGet("/api/content/comments", async (AppDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(await db.ManagedComments.AsNoTracking()
                .Where(x => x.Published)
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Author, x.Section, x.Message, x.Published })
                .Take(100).ToListAsync(ct));
        });

        var admin = app.MapGroup("/api/admin/content").RequireAuthorization("admin");

        admin.MapGet("/comments", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.ManagedComments.AsNoTracking()
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Author, x.Section, x.Message, x.Published })
                .ToListAsync(ct)));

        admin.MapPost("/comments", async (SaveCommentRequest input, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var error = ValidateComment(input);
            if (error is not null) return Results.BadRequest(new { error });
            var comment = new ManagedComment();
            ApplyComment(comment, input);
            db.ManagedComments.Add(comment);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("comments-admin");
            if (comment.Published) await updates.PublicAsync("comments");
            return Results.Created($"/api/admin/content/comments/{comment.Id}", CommentView(comment));
        });

        admin.MapPut("/comments/{id:guid}", async (Guid id, SaveCommentRequest input, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var error = ValidateComment(input);
            if (error is not null) return Results.BadRequest(new { error });
            var comment = await db.ManagedComments.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (comment is null) return Results.NotFound(new { error = "Comentario no encontrado." });
            var wasPublished = comment.Published;
            ApplyComment(comment, input);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("comments-admin");
            if (wasPublished || comment.Published) await updates.PublicAsync("comments");
            return Results.Ok(CommentView(comment));
        });

        admin.MapDelete("/comments/{id:guid}", async (Guid id, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var comment = await db.ManagedComments.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (comment is null) return Results.NotFound(new { error = "Comentario no encontrado." });
            db.ManagedComments.Remove(comment);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("comments-admin");
            if (comment.Published) await updates.PublicAsync("comments");
            return Results.NoContent();
        });

        admin.MapGet("/news", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.ManagedNews.AsNoTracking()
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Title, x.Category, x.Description, x.Body, x.Image, x.Published })
                .ToListAsync(ct)));

        admin.MapPost("/news", async (SaveNewsRequest input, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var validation = ValidateNews(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var news = new ManagedNews();
            ApplyNews(news, input);
            db.ManagedNews.Add(news);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("news-admin");
            if (news.Published) await updates.PublicAsync("news");
            return Results.Created($"/api/admin/content/news/{news.Id}", NewsView(news));
        });

        admin.MapPut("/news/{id:guid}", async (
            Guid id, SaveNewsRequest input, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var validation = ValidateNews(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var news = await db.ManagedNews.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (news is null) return Results.NotFound(new { error = "Noticia no encontrada." });
            var wasPublished = news.Published;
            ApplyNews(news, input);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("news-admin");
            if (wasPublished || news.Published) await updates.PublicAsync("news");
            return Results.Ok(NewsView(news));
        });

        admin.MapDelete("/news/{id:guid}", async (Guid id, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var news = await db.ManagedNews.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (news is null) return Results.NotFound(new { error = "Noticia no encontrada." });
            db.ManagedNews.Remove(news);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("news-admin");
            if (news.Published) await updates.PublicAsync("news");
            return Results.NoContent();
        });

        // El editor conserva cargas Base64 de imágenes si esta instalación no usa S3.
        admin.MapGet("/media/storage-status", (ObjectStorageService storage) =>
            Results.Ok(new { enabled = storage.Enabled }));

        admin.MapGet("/media", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.ManagedMedia.AsNoTracking()
                .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Name, x.Kind, x.Src, x.ObjectKey, x.MimeType, x.SizeBytes })
                .ToListAsync(ct)));

        admin.MapPost("/media", async (SaveMediaRequest input, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var validation = ValidateMedia(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var media = new ManagedMedia();
            ApplyMedia(media, input);
            db.ManagedMedia.Add(media);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("media");
            return Results.Created($"/api/admin/content/media/{media.Id}", MediaView(media));
        });

        admin.MapPut("/media/{id:guid}", async (
            Guid id, SaveMediaRequest input, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var validation = ValidateMedia(input);
            if (validation is not null) return Results.BadRequest(new { error = validation });
            var media = await db.ManagedMedia.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound(new { error = "Archivo no encontrado." });
            if (media.ObjectKey is not null &&
                (media.Src != input.Src?.Trim() || media.Kind != input.Kind?.Trim()))
                return Results.Conflict(new { error = "El archivo almacenado en S3 no puede reemplazarse desde el editor de enlaces. Subí otro archivo." });
            ApplyMedia(media, input);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("media");
            return Results.Ok(MediaView(media));
        });

        admin.MapDelete("/media/{id:guid}", async (Guid id, AppDbContext db, ObjectStorageService storage, ILogger<ManagedMedia> logger, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var media = await db.ManagedMedia.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound(new { error = "Archivo no encontrado." });
            if (await db.SiteCmsSlots.AnyAsync(x => x.DraftMediaId == id || x.PublishedMediaId == id, ct))
                return Results.Conflict(new { error = "Este archivo está asignado a una sección del sitio. Primero cambiá esa ubicación." });
            if (await db.ManagedNews.AnyAsync(n => n.Image == media.Src, ct))
                return Results.Conflict(new { error = "Este archivo está siendo usado por una noticia. Cambiá la imagen de la noticia antes de eliminarlo." });
            db.ManagedMedia.Remove(media);
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("media");
            if (media.ObjectKey is not null && storage.Enabled)
            {
                try { await storage.DeleteAsync(media.ObjectKey, ct); }
                catch (Exception ex) { logger.LogError(ex, "Objeto S3 huérfano: {ObjectKey}", media.ObjectKey); }
            }
            return Results.NoContent();
        });
    }

    private static string? ValidateComment(SaveCommentRequest x)
    {
        if (string.IsNullOrWhiteSpace(x.Author) || x.Author.Trim().Length > 100)
            return "El autor debe tener entre 1 y 100 caracteres.";
        if ((x.Section?.Trim().Length ?? 0) > 100)
            return "La sección no puede superar 100 caracteres.";
        if (string.IsNullOrWhiteSpace(x.Message) || x.Message.Trim().Length > 1200)
            return "El comentario debe tener entre 1 y 1200 caracteres.";
        return null;
    }

    private static void ApplyComment(ManagedComment target, SaveCommentRequest input)
    {
        target.Author = input.Author!.Trim();
        target.Section = input.Section?.Trim() ?? "";
        target.Message = input.Message!.Trim();
        target.Published = input.Published;
        target.UpdatedAt = DateTime.UtcNow;
    }

    private static object CommentView(ManagedComment x) => new { x.Id, x.Author, x.Section, x.Message, x.Published };

    private static string? ValidateNews(SaveNewsRequest x)
    {
        if (string.IsNullOrWhiteSpace(x.Title) || x.Title.Trim().Length > 160)
            return "El título debe tener entre 1 y 160 caracteres.";
        if (string.IsNullOrWhiteSpace(x.Category) || x.Category.Trim().Length > 60)
            return "La categoría debe tener entre 1 y 60 caracteres.";
        if (string.IsNullOrWhiteSpace(x.Description) || x.Description.Trim().Length > 1200)
            return "La descripción debe tener entre 1 y 1200 caracteres.";
        if ((x.Body?.Trim().Length ?? 0) > 20_000)
            return "El contenido completo no puede superar 20 000 caracteres.";
        if (!ValidImage(x.Image, allowEmpty: true))
            return "La imagen debe ser HTTPS, /images/ o PNG/JPEG/WebP/GIF hasta 2.5 MB.";
        return null;
    }

    private static string? ValidateMedia(SaveMediaRequest x)
    {
        if (string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 200)
            return "El nombre debe tener entre 1 y 200 caracteres.";
        var kind = x.Kind?.Trim();
        if (kind is not ("Imagen" or "Video" or "Documento" or "Video (enlace)" or "Documento (enlace)"))
            return "Tipo de archivo multimedia desconocido.";
        if (kind is "Video" or "Documento")
            return ValidInternalMediaLink(x.Src)
                ? null : "Los archivos almacenados en S3 deben conservar su referencia interna.";

        if (kind == "Imagen")
            return ValidImage(x.Src, allowEmpty: false)
                ? null : "La imagen debe ser HTTPS, /images/ o PNG/JPEG/WebP/GIF hasta 2.5 MB.";

        return ValidHttpsLink(x.Src)
            ? null : "Los videos y documentos deben tener un enlace HTTPS válido (máximo 2048 caracteres).";
    }

    // Videos y documentos son enlaces, no archivos binarios ni datos base64.
    private static bool ValidHttpsLink(string? src)
    {
        if (string.IsNullOrWhiteSpace(src)) return false;
        var value = src.Trim();
        return value.Length <= MaxUrlChars &&
            Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
            uri.Scheme == Uri.UriSchemeHttps &&
            uri.Host.Length > 0 &&
            string.IsNullOrEmpty(uri.UserInfo);
    }

    private static bool ValidInternalMediaLink(string? src)
    {
        if (string.IsNullOrWhiteSpace(src)) return false;
        var value = src.Trim();
        if (!value.StartsWith("/api/content/media/", StringComparison.Ordinal) ||
            !value.EndsWith("/file", StringComparison.Ordinal) || value.Length > 100) return false;
        return Guid.TryParse(value["/api/content/media/".Length..^"/file".Length], out _);
    }

    private static bool ValidImage(string? src, bool allowEmpty)
    {
        if (string.IsNullOrWhiteSpace(src)) return allowEmpty;
        var value = src.Trim();
        if (value.Length > MaxImageChars) return false;
        if (value.StartsWith("/images/", StringComparison.Ordinal) &&
            value.Length <= MaxUrlChars &&
            !value.Contains("..", StringComparison.Ordinal) &&
            !value.Contains('\\')) return true;
        if (ValidHttpsLink(value)) return true;
        if (ValidInternalMediaLink(value)) return true;

        // Sólo aceptamos tipos raster conocidos; nunca data:image/svg+xml.
        string[] prefixes = [
            "data:image/png;base64,", "data:image/jpeg;base64,",
            "data:image/webp;base64,", "data:image/gif;base64,"
        ];
        var prefix = prefixes.FirstOrDefault(p => value.StartsWith(p, StringComparison.OrdinalIgnoreCase));
        if (prefix is null) return false;
        var encoded = value.AsSpan(prefix.Length);
        if (encoded.IsEmpty || encoded.Length % 4 != 0) return false;
        var paddingStarted = false;
        var paddingCount = 0;
        foreach (var ch in encoded)
        {
            if (ch == '=')
            {
                paddingStarted = true;
                if (++paddingCount > 2) return false;
            }
            else if (paddingStarted || !(ch is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '+' or '/'))
                return false;
        }
        return true;
    }

    private static void ApplyNews(ManagedNews target, SaveNewsRequest input)
    {
        target.Title = input.Title!.Trim();
        target.Category = input.Category!.Trim();
        target.Description = input.Description!.Trim();
        target.Body = input.Body?.Trim() ?? "";
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
        x.Id, x.Title, x.Category, x.Description, x.Body, x.Image, x.Published
    };

    private static object MediaView(ManagedMedia x) => new { x.Id, x.Name, x.Kind, x.Src, x.ObjectKey, x.MimeType, x.SizeBytes };
}
