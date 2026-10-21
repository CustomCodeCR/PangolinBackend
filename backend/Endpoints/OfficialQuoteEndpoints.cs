using System.Net.Mail;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services.Auth;
using Microsoft.EntityFrameworkCore;

namespace CastroFallas.MiniQuote.Api.Endpoints;

// Captura oficial independiente: no llama ni sincroniza con Dhole.
public static class OfficialQuoteEndpoints
{
    private static readonly string[] Incoterms =
        ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
    private static readonly string[] States = ["Received", "InReview", "AwaitingInformation", "Closed"];
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static async Task<OfficialQuotePermission?> Permission(
        AppDbContext db, AuthIdentity? user, CancellationToken ct)
    {
        // Los administradores autenticados pueden consultar y gestionar todas las solicitudes.
        // La autorización para Dhole es el único permiso especial, asignado explícitamente.
        if (user is null || user.Role != "admin") return null;
        var specific = await db.OfficialQuotePermissions.AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == user.UsuarioId, ct);
        return new OfficialQuotePermission
        {
            UserId = user.UsuarioId,
            CanView = true,
            CanManage = true,
            CanAuthorize = specific?.CanAuthorize == true
        };
    }

    private static string Required(string? value, string name, int max)
    {
        var x = value?.Trim();
        if (string.IsNullOrWhiteSpace(x) || x.Length > max)
            throw new ArgumentException($"{name} es obligatorio (máximo {max} caracteres).");
        return x;
    }

    private static string? Optional(string? value, int max)
    {
        var x = value?.Trim();
        if (x?.Length > max) throw new ArgumentException($"Un texto excede el máximo de {max} caracteres.");
        return string.IsNullOrWhiteSpace(x) ? null : x;
    }

    private static void Validate(OfficialQuoteSubmit s)
    {
        var validPair = (s.Mode, s.ShipmentType) switch
        {
            ("Maritime", "FCL" or "LCL") => true,
            ("Air", "AIR_LCL") => true,
            ("Land", "FTL" or "LTL") => true,
            _ => false
        };
        if (!validPair) throw new ArgumentException("Combinación de modalidad y embarque inválida.");
        if (s.OriginLocationId is null || s.DestinationLocationId is null ||
            s.OriginLocationId == Guid.Empty || s.DestinationLocationId == Guid.Empty ||
            s.OriginLocationId == s.DestinationLocationId)
            throw new ArgumentException("Seleccioná origen y destino diferentes.");
        if (s.Mode != "Maritime" && s.PodLocationId is not null)
            throw new ArgumentException("POD solo corresponde a marítimo.");
        if (s.ShipmentType == "LCL" && s.PodLocationId is null)
            throw new ArgumentException("Seleccioná el POD requerido para marítimo LCL.");
        if (s.Incoterm is not null && !Incoterms.Contains(s.Incoterm))
            throw new ArgumentException("Incoterm inválido.");
        if (s.CargoReadyDate is null) throw new ArgumentException("Indicá la fecha de carga lista.");
        Required(s.ContactName, "Nombre de contacto", 150);
        var email = Required(s.ContactEmail, "Correo", 255);
        if (!MailAddress.TryCreate(email, out var parsed) ||
            !string.Equals(parsed.Address, email, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Correo inválido.");
        Required(s.ContactPhone, "Teléfono", 40);
        if (s.Services is null || s.Services.Count is < 1 or > 20 ||
            s.Services.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 100) ||
            s.Services.Distinct(StringComparer.OrdinalIgnoreCase).Count() != s.Services.Count)
            throw new ArgumentException("Seleccioná al menos un servicio válido.");
        if (s.Equipment?.Count > 25 || s.Packages?.Count > 25)
            throw new ArgumentException("Se permiten hasta 25 líneas de carga.");
        bool equipment = s.ShipmentType is "FCL" or "FTL";
        if (equipment && (s.Equipment?.Count is not > 0 || s.Packages?.Count > 0) ||
            !equipment && (s.Packages?.Count is not > 0 || s.Equipment?.Count > 0))
            throw new ArgumentException("Completá las líneas del tipo de carga seleccionado.");
        if (equipment)
        {
            foreach (var line in s.Equipment!)
            {
                Required(line.Size, "Tamaño/tipo de equipo", 60);
                Required(line.Type, "Tipo de equipo", 100);
                if (line.Quantity is null or < 1 or > 100 ||
                    line.UnitWeightsKg is null || line.UnitWeightsKg.Count != line.Quantity ||
                    line.UnitWeightsKg.Any(x => x <= 0 || x > 100000000))
                    throw new ArgumentException("Cada equipo requiere un peso positivo por unidad.");
            }
        }
        else
        {
            if (s.WeightUnit is not ("kg" or "lb") ||
                s.DimensionUnit is not ("cm" or "m" or "in"))
                throw new ArgumentException("Seleccioná las unidades de peso y dimensiones.");
            foreach (var line in s.Packages!)
            {
                Required(line.Description, "Descripción de bulto", 400);
                if (line.Quantity is null or < 1 or > 10000 ||
                    line.Weight is null or <= 0 or > 100000000 ||
                    line.Length is null or <= 0 or > 100000 ||
                    line.Width is null or <= 0 or > 100000 ||
                    line.Height is null or <= 0 or > 100000 ||
                    line.Stackability is not ("Stackable" or "NonStackable"))
                    throw new ArgumentException("Completá cantidades, peso, medidas y estibabilidad.");
            }
        }
        Required(s.CargoDescription, "Descripción de carga", 4000);
        Optional(s.CabysCode, 40);
        Optional(s.Observations, 4000);
        if (s.CargoValue is < 0 || s.DeclaredWeight is < 0 || s.DeclaredPackages is < 0)
            throw new ArgumentException("Valor, peso y cantidad no admiten negativos.");
        if (s.CargoFlags?.Count > 12 || s.CargoFlags?.Any(x => x.Length > 50) == true)
            throw new ArgumentException("Opciones de carga inválidas.");
        if (s.Incoterm == "EXW")
        {
            if (s.ExwCargoStatus is not ("fiscal" or "nationalized"))
                throw new ArgumentException("Seleccioná tipo de carga EXW.");
            Required(s.ExwPickupAddress, "Dirección de recolección", 800);
        }
        else if (!string.IsNullOrWhiteSpace(s.ExwCargoStatus) || !string.IsNullOrWhiteSpace(s.ExwPickupAddress))
            throw new ArgumentException("La recolección EXW solo aplica a EXW.");
        Optional(s.DestinationHandling, 100);
        if (s.Services.Contains("Transporte entrega"))
            Required(s.DeliveryAddress, "Dirección de entrega", 800);
        else if (!string.IsNullOrWhiteSpace(s.DeliveryAddress))
            throw new ArgumentException("Dirección de entrega sin servicio de entrega.");
        if (s.Services.Contains("Transporte recolección"))
            Required(s.PickupAddress, "Dirección de recolección", 800);
        else if (!string.IsNullOrWhiteSpace(s.PickupAddress))
            throw new ArgumentException("Dirección de recolección sin servicio de recolección.");
        if (s.Services.Contains("Almacenamiento"))
        {
            if (s.FiscalStorageDays is null or < 1 or > 36500)
                throw new ArgumentException("Indicá los días de almacenaje fiscal.");
        }
        else if (s.FiscalStorageDays is not null)
            throw new ArgumentException("Días de almacenaje sin servicio de almacenamiento.");
    }

    public static IEndpointRouteBuilder MapOfficialQuotes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/quotes/official").RequireAuthorization("registered");

        group.MapGet("/locations", async (string kind, string shipmentType, string routeRole, AppDbContext db, CancellationToken ct) =>
        {
            if (kind is not ("seaport" or "airport" or "inland") ||
                shipmentType is not ("FCL" or "LCL" or "AIR_LCL" or "FTL" or "LTL") ||
                routeRole is not ("origin" or "destination" or "pod") ||
                (routeRole == "pod" && shipmentType is not ("FCL" or "LCL")) ||
                (shipmentType is "FCL" or "LCL" ? kind != "seaport" :
                 shipmentType == "AIR_LCL" ? kind != "airport" : kind != "inland"))
                return Results.BadRequest(new { error = "Selección de catálogo inválida." });
            var items = await db.OfficialQuoteLocations.AsNoTracking()
                .Where(x => x.Active && (routeRole == "pod" || x.Kind == kind) &&
                    db.OfficialQuoteLocationUsages.Any(u => u.LocationId == x.Id &&
                        u.ShipmentType == shipmentType && u.RouteRole == routeRole))
                // No mezclar lugares ficticios en una lista que ya contiene opciones verificadas.
                .OrderBy(x => x.DisplayName).Select(x => new { x.Id, x.DisplayName, x.Code }).Take(500).ToListAsync(ct);
            if (items.Any(x => x.Code is not null && !x.Code.StartsWith("DEV-", StringComparison.Ordinal)))
                items = items.Where(x => x.Code is null || !x.Code.StartsWith("DEV-", StringComparison.Ordinal)).ToList();
            return Results.Ok(new { items });
        });

        group.MapPost("", async (OfficialQuoteSubmit input, AppDbContext db, AuthService auth,
            HttpContext http, CancellationToken ct) =>
        {
            var user = await auth.GetIdentityAsync(http, ct);
            if (user is null) return Results.Unauthorized();
            try
            {
                Validate(input);
                var kind = input.Mode switch { "Maritime" => "seaport", "Air" => "airport", _ => "inland" };
                var ids = new[] { input.OriginLocationId!.Value, input.DestinationLocationId!.Value };
                if (input.PodLocationId.HasValue) ids = [..ids, input.PodLocationId.Value];
                var locations = await db.OfficialQuoteLocations.AsNoTracking()
                    .Where(x => ids.Contains(x.Id) && x.Active && (x.Kind == kind || input.PodLocationId == x.Id && x.Kind == "inland" && kind == "seaport"))
                    .ToDictionaryAsync(x => x.Id, ct);
                if (locations.Count != ids.Distinct().Count())
                    return Results.BadRequest(new { error = "Seleccioná ubicaciones activas del catálogo." });
                // Validar el campo específico, no solo que la ubicación exista.
                var requiredUses = new List<(Guid LocationId, string Role)>
                {
                    (input.OriginLocationId.Value, "origin"),
                    (input.DestinationLocationId.Value, "destination")
                };
                if (input.PodLocationId.HasValue) requiredUses.Add((input.PodLocationId.Value, "pod"));
                var assigned = await db.OfficialQuoteLocationUsages.AsNoTracking()
                    .Where(x => ids.Contains(x.LocationId) && x.ShipmentType == input.ShipmentType)
                    .Select(x => new { x.LocationId, x.RouteRole }).ToListAsync(ct);
                if (requiredUses.Any(u => !assigned.Any(a => a.LocationId == u.LocationId && a.RouteRole == u.Role)))
                    return Results.BadRequest(new { error = "La ubicación no está habilitada para este campo y modalidad." });
                var quote = new OfficialQuoteRequest
                {
                    Id = Guid.NewGuid(), ClienteId = user.ClienteId, UsuarioId = user.UsuarioId,
                    CustomerName = Required(user.NombreCliente, "Cliente", 200),
                    ContactName = input.ContactName!.Trim(), ContactEmail = input.ContactEmail!.Trim(),
                    ContactPhone = input.ContactPhone!.Trim(),
                    Mode = input.Mode!, ShipmentType = input.ShipmentType!,
                    OriginName = locations[input.OriginLocationId!.Value].DisplayName,
                    DestinationName = locations[input.DestinationLocationId!.Value].DisplayName,
                    FormJson = JsonSerializer.Serialize(input, Json)
                };
                db.OfficialQuotes.Add(quote);
                await db.SaveChangesAsync(ct);
                http.Response.Headers.CacheControl = "no-store";
                return Results.Created($"/api/quotes/official/{quote.Id}", new
                {
                    quote.Id, quote.Status, quote.Authorization, quote.CreatedAtUtc
                });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        }).RequireRateLimiting("auth");

        group.MapGet("/{id:guid}", async (Guid id, AppDbContext db, AuthService auth,
            HttpContext http, CancellationToken ct) =>
        {
            var user = await auth.GetIdentityAsync(http, ct);
            if (user is null) return Results.Unauthorized();
            // Un admin que no tenga permiso tampoco puede consultar solicitudes de otros.
            var query = db.OfficialQuotes.AsNoTracking().Where(q => q.Id == id &&
                q.ClienteId == user.ClienteId && q.UsuarioId == user.UsuarioId);
            var quote = await query.FirstOrDefaultAsync(ct);
            if (quote is null) return Results.NotFound();
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new
            {
                quote.Id, quote.Mode, quote.ShipmentType, quote.Status, quote.Authorization,
                quote.CreatedAtUtc, form = JsonSerializer.Deserialize<JsonElement>(quote.FormJson)
            });
        });

        var admin = app.MapGroup("/api/admin/quotes/official").RequireAuthorization("admin");
        admin.MapGet("/permissions/me", async (AppDbContext db, AuthService auth, HttpContext http,
            CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            var p = await Permission(db, actor, ct);
            return Results.Ok(new { canView = p?.CanView == true || p?.CanManage == true || p?.CanAuthorize == true,
                canManage = p?.CanManage == true, canAuthorize = p?.CanAuthorize == true });
        });
        admin.MapGet("", async (AppDbContext db, AuthService auth, HttpContext http,
            int? page, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            var p = await Permission(db, actor, ct);
            if (p is null || !(p.CanView || p.CanManage || p.CanAuthorize)) return Results.Forbid();
            var n = page ?? 1;
            if (n is < 1 or > 100000) return Results.BadRequest();
            var q = db.OfficialQuotes.AsNoTracking();
            var total = await q.CountAsync(ct);
            var items = await q.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id)
                .Skip((n - 1) * 20).Take(20)
                .Select(x => new { x.Id, x.CustomerName, x.Mode, x.ShipmentType,
                    x.OriginName, x.DestinationName, x.Status, x.Authorization, x.CreatedAtUtc })
                .ToListAsync(ct);
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { items, total, page = n });
        });
        admin.MapGet("/{id:guid}", async (Guid id, AppDbContext db, AuthService auth,
            HttpContext http, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            var p = await Permission(db, actor, ct);
            if (p is null || !(p.CanView || p.CanManage || p.CanAuthorize)) return Results.Forbid();
            var q = await db.OfficialQuotes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (q is null) return Results.NotFound();
            var history = await db.OfficialQuoteAudit.AsNoTracking()
                .Where(x => x.QuoteId == id).OrderByDescending(x => x.CreatedAtUtc)
                .Select(x => new { x.Action, x.Comment, x.ActorUserId, x.CreatedAtUtc })
                .Take(100).ToListAsync(ct);
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { q.Id, q.CustomerName, q.Mode, q.ShipmentType, q.Status,
                q.Authorization, q.AuthorizedAtUtc, q.CreatedAtUtc,
                form = JsonSerializer.Deserialize<JsonElement>(q.FormJson), history });
        });

        admin.MapPut("/{id:guid}/review", async (Guid id, OfficialReviewUpdate update,
            AppDbContext db, AuthService auth, HttpContext http, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            var p = await Permission(db, actor, ct);
            if (p?.CanManage != true) return Results.Forbid();
            if (update.Status is null || !States.Contains(update.Status) ||
                update.Comment?.Length > 2000)
                return Results.BadRequest(new { error = "Estado o comentario inválido." });
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var q = await db.OfficialQuotes.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (q is null) return Results.NotFound();
            q.Status = update.Status;
            q.UpdatedAtUtc = DateTime.UtcNow;
            db.OfficialQuoteAudit.Add(new OfficialQuoteAudit {
                QuoteId = id, ActorUserId = actor!.UsuarioId, Action = "Review",
                Comment = string.IsNullOrWhiteSpace(update.Comment) ? null : update.Comment.Trim()
            });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(new { q.Id, q.Status });
        }).RequireRateLimiting("auth");

        admin.MapPut("/{id:guid}/authorization", async (Guid id, string decision,
            AppDbContext db, AuthService auth, HttpContext http, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            var p = await Permission(db, actor, ct);
            if (p?.CanAuthorize != true) return Results.Forbid();
            if (decision is not ("Authorized" or "Rejected"))
                return Results.BadRequest(new { error = "Decisión inválida." });
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var q = await db.OfficialQuotes.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (q is null) return Results.NotFound();
            if (q.Authorization != "Pending")
                return Results.Conflict(new { error = "La solicitud ya tiene decisión." });
            q.Authorization = decision;
            q.AuthorizedAtUtc = DateTime.UtcNow;
            q.AuthorizedById = actor!.UsuarioId;
            q.UpdatedAtUtc = DateTime.UtcNow;
            db.OfficialQuoteAudit.Add(new OfficialQuoteAudit {
                QuoteId = id, ActorUserId = actor.UsuarioId, Action = decision
            });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            // Solo autoriza internamente. NO envía ni declara enviada la solicitud a Dhole.
            return Results.Ok(new { q.Id, q.Authorization, q.AuthorizedAtUtc });
        }).RequireRateLimiting("auth");
        return app;
    }
}

