using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services.Realtime;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Services;

// Editor visual. Claves de contenido fijas, texto plano (sin HTML) y medios existentes.
public static class SiteCmsEndpoints
{
    private static readonly HashSet<string> MediaKeys = new(StringComparer.Ordinal)
    {
        "home.hero.media", "home.services.air.media", "home.services.maritime.media",
        "home.services.land.media", "home.services.multimodal.media",
        "home.about.media", "home.tracking.media", "home.quote.media",
        "about.hero.media", "about.operations.media",
        "services.hero.media", "services.air.media", "services.maritime.media",
        "services.land.media", "services.multimodal.media",
        "services.complementary.customs.media", "services.complementary.warehouse.media",
        "services.tracking.media", "services.quote.media",
        "login.hero.media", "shared.logo.media"
    };
    private static readonly HashSet<string> TextKeys = new(StringComparer.Ordinal)
    {
        "home.hero.title1", "home.hero.title2", "home.hero.intro",
        "home.services.heading1", "home.services.heading2", "home.services.intro",
        "home.about.intro", "home.quote.heading1", "home.quote.heading2",
        "home.digital.heading1", "home.digital.heading2", "home.digital.heading3",
        "home.digital.intro", "home.faq.heading1", "home.faq.heading2",
        "home.services.air.title", "home.services.air.detail",
        "home.services.maritime.title", "home.services.maritime.detail",
        "home.services.land.title", "home.services.land.detail",
        "home.services.multimodal.title", "home.services.multimodal.detail",
        "about.hero.title", "about.intro", "about.values.heading",
        "services.hero.heading1", "services.hero.heading2", "services.hero.intro",
        "services.complementary.heading1", "services.complementary.heading2",
        "services.complementary.intro", "services.complementary.customs.title",
        "services.complementary.customs.intro", "services.complementary.warehouse.title",
        "services.complementary.warehouse.intro",
        "login.hero.title1", "login.hero.title2", "login.hero.title3", "login.hero.intro",
        "home.digital.card.0.title",
        "home.digital.card.0.subtitle",
        "home.digital.card.1.title",
        "home.digital.card.1.subtitle",
        "home.digital.card.2.title",
        "home.digital.card.2.subtitle",
        "home.faq.0.q",
        "home.faq.0.a",
        "about.values.0",
        "home.faq.1.q",
        "home.faq.1.a",
        "about.values.1",
        "home.faq.2.q",
        "home.faq.2.a",
        "about.values.2",
        "home.faq.3.q",
        "home.faq.3.a",
        "home.faq.heading3",
        "services.catalog.heading1", "services.catalog.heading2", "services.catalog.intro",
        "about.values.3",
        "about.values.4",
        "services.air.title",
        "services.air.detail",
        "services.maritime.title",
        "services.maritime.detail",
        "services.land.title",
        "services.land.detail",
        "services.multimodal.title",
        "services.multimodal.detail"
    };

    public static void MapSiteCms(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/content/site", async (AppDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var rows = await db.SiteCmsSlots.AsNoTracking().Where(x =>
                x.PublishedEs != null || x.PublishedEn != null || x.PublishedMediaId != null)
                .ToListAsync(ct);
            var mediaIds = rows.Where(x => x.PublishedMediaId != null)
                .Select(x => x.PublishedMediaId!.Value).ToHashSet();
            var media = await db.ManagedMedia.AsNoTracking().Where(m => mediaIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, ct);
            return Results.Ok(rows.Select(x => new {
                x.Key, textEs = x.PublishedEs, textEn = x.PublishedEn,
                mediaSrc = x.PublishedMediaId is Guid id && media.TryGetValue(id, out var file) ? file.Src : null,
                mediaKind = x.PublishedMediaId is Guid mid && media.TryGetValue(mid, out var item) ? item.Kind : null
            }));
        });

        var admin = app.MapGroup("/api/admin/content/site").RequireAuthorization("admin");
        admin.MapGet("", async (AppDbContext db, CancellationToken ct) =>
            Results.Ok(await db.SiteCmsSlots.AsNoTracking().OrderBy(x => x.Key).ToListAsync(ct)));

        admin.MapPut("/{key}", async Task<IResult> (string key, SaveSiteDraftRequest draft, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            var isMedia = MediaKeys.Contains(key);
            if (!isMedia && !TextKeys.Contains(key)) return Results.NotFound();
            if (isMedia && (!string.IsNullOrEmpty(draft.TextEs) || !string.IsNullOrEmpty(draft.TextEn)))
                return Results.BadRequest(new { error = "Esta ubicación solo admite imagen o video." });
            if (!isMedia && draft.MediaId is not null)
                return Results.BadRequest(new { error = "Esta ubicación solo admite texto." });
            if ((draft.TextEs?.Length ?? 0) > 1600 || (draft.TextEn?.Length ?? 0) > 1600)
                return Results.BadRequest(new { error = "Los textos no pueden superar 1600 caracteres." });
            if (draft.MediaId is Guid id)
            {
                var allowedVideo = key != "shared.logo.media";
                var accepted = await db.ManagedMedia.AsNoTracking().AnyAsync(m => m.Id == id &&
                    (m.Kind == "Imagen" || (allowedVideo && m.Kind == "Video")), ct);
                if (!accepted) return Results.BadRequest(new { error = "Seleccioná una imagen o video subido a MinIO. El logo solo admite imágenes." });
            }
            var slot = await db.SiteCmsSlots.FindAsync([key], ct);
            if (slot is null) { slot = new SiteCmsSlot { Key = key }; db.SiteCmsSlots.Add(slot); }
            slot.DraftEs = isMedia ? null : Normalize(draft.TextEs);
            slot.DraftEn = isMedia ? null : Normalize(draft.TextEn);
            slot.DraftMediaId = isMedia ? draft.MediaId : null;
            slot.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("site-admin");
            return Results.Ok(slot);
        });

        admin.MapPost("/{key}/publish", async Task<IResult> (string key, AppDbContext db, ContentUpdatesPublisher updates, CancellationToken ct) =>
        {
            if (!MediaKeys.Contains(key) && !TextKeys.Contains(key)) return Results.NotFound();
            var slot = await db.SiteCmsSlots.FindAsync([key], ct);
            if (slot is null) return Results.NotFound(new { error = "Primero guardá un borrador." });
            if (slot.DraftMediaId is Guid id &&
                !await db.ManagedMedia.AnyAsync(m => m.Id == id, ct))
                return Results.BadRequest(new { error = "La imagen o video del borrador ya no existe." });
            slot.PublishedEs = slot.DraftEs;
            slot.PublishedEn = slot.DraftEn;
            slot.PublishedMediaId = slot.DraftMediaId;
            slot.PublishedAt = DateTime.UtcNow;
            slot.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("site-admin");
            await updates.PublicAsync("site");
            return Results.Ok(slot);
        });

        admin.MapPost("/{key}/restore", async Task<IResult> (string key, AppDbContext db, CancellationToken ct) =>
        {
            if (!MediaKeys.Contains(key) && !TextKeys.Contains(key)) return Results.NotFound();
            var slot = await db.SiteCmsSlots.FindAsync([key], ct);
            if (slot is null) return Results.NotFound();
            // Vuelve al contenido originalmente programado en Vue, sin eliminar objetos S3.
            slot.DraftEs = slot.PublishedEs = null;
            slot.DraftEn = slot.PublishedEn = null;
            slot.DraftMediaId = slot.PublishedMediaId = null;
            slot.UpdatedAt = DateTime.UtcNow;
            slot.PublishedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            await updates.AdminsAsync("site-admin");
            await updates.PublicAsync("site");
            return Results.Ok(slot);
        });
    }

    private static string? Normalize(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
