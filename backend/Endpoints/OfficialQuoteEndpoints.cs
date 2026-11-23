using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services.Auth;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CastroFallas.MiniQuote.Api.Endpoints;

// Captura oficial: guarda la copia administrativa; un outbox opcional
// se crea en la misma transacción y no depende de aprobación previa.
// Nunca llama a una API de escritura de Dhole.
public static class OfficialQuoteEndpoints
{
    private static readonly string[] Incoterms =
        ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
    private static readonly string[] States = ["Received", "InReview", "AwaitingInformation", "Closed"];
    // Solo servicios ofrecidos por el formulario y GIO. Validar también en HTTP directo.
    private static readonly HashSet<string> AllowedServices = new(StringComparer.Ordinal)
    {
        "Transporte internacional", "Agencia de Aduanas CR", "Agencia de Aduanas Exterior",
        "Almacenamiento", "Control de inventario", "Embalaje", "Exoneración",
        "Picking Carga", "Recepción de carga", "Seguro de carga", "Transporte entrega",
        "Transporte recolección"
    };
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    // Usar el día calendario de Costa Rica, no UTC ni la zona horaria del servidor.
    private static readonly TimeZoneInfo CostaRicaTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById("America/Costa_Rica");

    private static DateOnly TodayInCostaRica() =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, CostaRicaTimeZone));

    // Creation deduplication is distinct from the future Dhole delivery key.
    // It is enabled only with its own opt-in, after the additive SQL migration.
    private static string SubmissionDigest(OfficialQuoteSubmit input, AuthIdentity? actor)
    {
        var canonical = JsonSerializer.Serialize(input, Json);
        var fingerprintInput = canonical + "|user:" + actor?.UsuarioId.ToString("D") +
            "|customer:" + actor?.ClienteId.ToString("D");
        return Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes(fingerprintInput))).ToLowerInvariant();
    }

    private static async Task<IResult> RepeatReceiptAsync(
        OfficialQuoteClientSubmission submission, string expectedDigest,
        bool stageDirect, AppDbContext db, CancellationToken ct)
    {
        if (!string.Equals(submission.RequestDigest, expectedDigest, StringComparison.Ordinal))
            return Results.Conflict(new {
                code = "quote_request_key_conflict",
                error = "Esta clave ya fue usada para una solicitud diferente. Consultá con soporte antes de reenviar."
            });
        // The FK guarantees the parent exists. The key table stores no PII.
        var existing = await db.OfficialQuotes.AsNoTracking()
            .SingleAsync(x => x.Id == submission.QuoteId, ct);
        var dispatchState = stageDirect
            ? await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                .Where(x => x.QuoteId == existing.Id)
                .Select(x => x.State).FirstOrDefaultAsync(ct) ?? "NotStaged"
            : "Disabled";
        return Results.Created($"/api/quotes/official/{existing.Id}", new
        {
            existing.Id, existing.Status, existing.Authorization,
            existing.CreatedAtUtc, dholeDispatchState = dispatchState,
            idempotentReplay = true
        });
    }

    private static async Task LockCreationKeyAsync(
        AppDbContext db, Guid key, IDbContextTransaction transaction, CancellationToken ct)
    {
        // PostgreSQL transaction-scoped advisory lock makes concurrent
        // requests with the same random 128-bit key serialize. The UNIQUE
        // index is an independent DB-level duplicate defence.
        await using var cmd = db.Database.GetDbConnection().CreateCommand();
        cmd.Transaction = transaction.GetDbTransaction();
        cmd.CommandText = "SELECT pg_advisory_xact_lock(274, hashtext(@submission_key))";
        var parameter = cmd.CreateParameter();
        parameter.ParameterName = "submission_key";
        parameter.Value = key.ToString("N");
        cmd.Parameters.Add(parameter);
        await cmd.ExecuteScalarAsync(ct);
    }

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

    private static void Validate(OfficialQuoteSubmit s, bool useDholeCatalogs = false)
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
        if (s.Mode == "Maritime" && (!s.PodLocationId.HasValue || s.PodLocationId == Guid.Empty))
            throw new ArgumentException("Seleccioná el POD requerido para todo transporte marítimo.");
        if (!useDholeCatalogs && s.Incoterm is not null && !Incoterms.Contains(s.Incoterm))
            throw new ArgumentException("Incoterm inválido.");
        if (s.CargoReadyDate is null) throw new ArgumentException("Indicá la fecha de carga lista.");
        if (s.CargoReadyDate.Value < TodayInCostaRica())
            throw new ArgumentException("La fecha de carga lista debe ser hoy o posterior (hora de Costa Rica).");
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
        if (s.Services.Any(service => !AllowedServices.Contains(service)))
            throw new ArgumentException("Seleccioná servicios del catálogo oficial.");
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
                var selectedSize = Required(line.Size, "Tamaño/tipo de equipo", 60);
                var selectedType = Required(line.Type, "Tipo de equipo", 100);
                // Compartir las restricciones del cotizador oficial con GIO: no permitir
                // valores libres de equipo aunque la solicitud llegue por HTTP directo.
                var allowedSizes = s.ShipmentType == "FCL"
                    ? new[] { "20 pies", "40 pies", "45 pies", "48 pies" }
                    : new[] { "24 pies / 5 TON", "26 pies / 7 TON", "48 pies", "53 pies" };
                var allowedTypes = s.ShipmentType == "FCL"
                    ? new[] { "Dry Van", "High Cube", "Open Top", "Open Side", "Tank", "Flat Rack", "NOR" }
                    : new[] { "Furgón seco", "Plataforma / Carreta", "Refrigerado", "Furgón con cortina" };
                if (!useDholeCatalogs && (!allowedSizes.Contains(selectedSize, StringComparer.Ordinal) ||
                    !allowedTypes.Contains(selectedType, StringComparer.Ordinal)))
                    throw new ArgumentException("Seleccioná tamaño y tipo de equipo de las opciones oficiales.");
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
                if (useDholeCatalogs && line.UnitType is not ("Box" or "Pallet" or "Loose" or "Other"))
                    throw new ArgumentException("Seleccioná el tipo de unidad para cada línea que se enviará a Dhole.");
            }
        }
        Required(s.CargoDescription, "Descripción de carga", 4000);
        Optional(s.CabysCode, 40);
        Optional(s.Observations, 4000);
        if (s.CargoValue is < 0 || s.DeclaredWeight is < 0 || s.DeclaredPackages is < 0)
            throw new ArgumentException("Valor, peso y cantidad no admiten negativos.");
        // A requested cargo insurance quote cannot be priced from an unspecified
        // declared amount/currency. The ISO code is NOT a trusted Dhole UUID.
        if (s.Services.Contains("Seguro de carga") && s.CargoValue is null or <= 0)
            throw new ArgumentException("Para seguro de carga indicá el valor declarado de la mercancía.");
        var needsCurrency = s.CargoValue is > 0;
        if (needsCurrency && (s.CargoCurrencyCode is null ||
            s.CargoCurrencyCode.Length != 3 ||
            s.CargoCurrencyCode.Any(x => x is < 'A' or > 'Z')))
            throw new ArgumentException("Indicá la moneda del valor declarado con un código ISO de tres letras.");
        if (!needsCurrency && !string.IsNullOrWhiteSpace(s.CargoCurrencyCode))
            throw new ArgumentException("La moneda declarada requiere un valor de mercancía positivo.");
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

    // Public, read-only catalogue for GIO's guest quote builder. Only active,
    // non-development locations enabled for the requested shipment type and role
    // are returned. Public quote creation uses server validation and rate limiting.
    private static async Task<IResult> GetPublicAssistantLocations(
        string kind, string shipmentType, string routeRole, AppDbContext db, HttpContext http, CancellationToken ct)
    {
        http.Response.Headers.CacheControl = "no-store";
        var validType = shipmentType switch
        {
            "FCL" or "LCL" => kind == "seaport",
            "AIR_LCL" => kind == "airport",
            "FTL" or "LTL" => kind == "inland",
            _ => false
        };
        if (!validType || routeRole is not ("origin" or "destination" or "pod") ||
            (routeRole == "pod" && shipmentType is not ("FCL" or "LCL")))
            return Results.BadRequest(new { error = "Catálogo solicitado inválido." });

        var items = await db.OfficialQuoteLocations.AsNoTracking()
            .Where(x => x.Active &&
                (routeRole == "pod" || x.Kind == kind) &&
                (x.Code == null || !x.Code.StartsWith("DEV-")) &&
                db.OfficialQuoteLocationUsages.Any(u => u.LocationId == x.Id &&
                    u.ShipmentType == shipmentType && u.RouteRole == routeRole))
            .OrderBy(x => x.DisplayName)
            .Select(x => new { x.Id, x.DisplayName, x.Code })
            .Take(500)
            .ToListAsync(ct);
        return Results.Ok(new { items });
    }

    public static IEndpointRouteBuilder MapOfficialQuotes(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/assistant/quote-locations", GetPublicAssistantLocations)
            .RequireRateLimiting("public-read");
        var group = app.MapGroup("/api/quotes/official");

        // Use the same verified public catalogue for the standalone form and GIO.
        group.MapGet("/locations", GetPublicAssistantLocations)
            .RequireRateLimiting("public-read");

        group.MapPost("", async (OfficialQuoteSubmit input, AppDbContext db, AuthService auth,
            IConfiguration config, DholeCatalogService dholeService,
            DholeQuoteFormCatalogLoader dholeLoader, HttpContext http, CancellationToken ct) =>
        {
            // Guest submissions are independent from registered customer accounts.
            var user = await auth.GetIdentityAsync(http, ct);
            try
            {
                // No ID from Dhole is ever looked up as a legacy local ID.
                // A missing catalogSource remains the original, fully validated path.
                if (input.CatalogSource is not null && input.CatalogSource is not ("local" or "dhole"))
                    return Results.BadRequest(new { error = "Fuente de catálogo inválida." });
                bool useDhole = input.CatalogSource == "dhole";
                bool dynamicRollout = config.GetValue<bool>("DholeCatalogs:FormEnabled") &&
                    config.GetValue<bool>("DholeCatalogs:SubmissionEnabled");
                if (useDhole && (!dynamicRollout || !dholeService.IsConfigured))
                    return Results.Json(new { code = "dhole_quote_disabled", error = "El catálogo Dhole no está habilitado." },
                        statusCode: StatusCodes.Status503ServiceUnavailable);
                // Once the dynamic wizard AND its submit validator are enabled,
                // no new request may bypass Dhole by omitting catalogSource.
                // Historical records and deployments with flags off are unaffected.
                if (!useDhole && dynamicRollout)
                    return Results.Json(new { code = "catalog_source_required", error = "Actualizá la página de cotizaciones para utilizar el catálogo vigente." },
                        statusCode: StatusCodes.Status409Conflict);

                var stageDirect = useDhole && config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled");
                var deduplicateCreate = useDhole &&
                    config.GetValue<bool>("DholeSubmission:ClientCreateIdempotencyEnabled");
                Guid? requestKey = null;
                string? requestDigest = null;
                if (deduplicateCreate)
                {
                    // Do not read the optional schema or claim success unless
                    // the exact random client key and identical data match.
                    string suppliedKey = http.Request.Headers["X-CF-Quote-Request-Key"].ToString();
                    if (!Guid.TryParseExact(suppliedKey, "D", out var parsedKey) ||
                        parsedKey == Guid.Empty || suppliedKey != parsedKey.ToString("D") ||
                        suppliedKey[14] != '4' || !"89ab".Contains(suppliedKey[19]))
                        return Results.BadRequest(new {
                            code = "quote_request_key_required",
                            error = "La solicitud requiere una clave única válida; actualizá el formulario."
                        });
                    requestKey = parsedKey;
                    requestDigest = SubmissionDigest(input, user);
                    // Replays must survive a changed or temporarily unavailable
                    // catalogue after the original quote was already committed.
                    var prior = await db.OfficialQuoteClientSubmissions.AsNoTracking()
                        .FirstOrDefaultAsync(x => x.SubmissionKey == requestKey, ct);
                    if (prior is not null)
                    {
                        http.Response.Headers.CacheControl = "no-store";
                        return await RepeatReceiptAsync(prior, requestDigest, stageDirect, db, ct);
                    }
                }

                Validate(input, useDholeCatalogs: useDhole);
                string originName;
                string destinationName;
                DholeValidatedRoute? verifiedDholeRoute = null;
                if (useDhole)
                {
                    // A fresh server-side snapshot, never a browser-provided list
                    // or stale cache, is authoritative for every submitted field.
                    var catalog = await dholeLoader.LoadFreshAsync(
                        input.Mode!, input.ShipmentType!, ct);
                    var selected = DholeQuoteSelectionValidator.Validate(input, catalog);
                    verifiedDholeRoute = selected;
                    originName = selected.OriginName;
                    destinationName = selected.DestinationName;
                }
                else
                {
                    var kind = input.Mode switch { "Maritime" => "seaport", "Air" => "airport", _ => "inland" };
                    var ids = new[] { input.OriginLocationId!.Value, input.DestinationLocationId!.Value };
                    if (input.PodLocationId.HasValue) ids = [..ids, input.PodLocationId.Value];
                    var locations = await db.OfficialQuoteLocations.AsNoTracking()
                        .Where(x => ids.Contains(x.Id) && x.Active && (x.Kind == kind ||
                            input.PodLocationId == x.Id && x.Kind == "inland" && kind == "seaport"))
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
                    originName = locations[input.OriginLocationId!.Value].DisplayName;
                    destinationName = locations[input.DestinationLocationId!.Value].DisplayName;
                }
                var quote = new OfficialQuoteRequest
                {
                    Id = Guid.NewGuid(), ClienteId = user?.ClienteId, UsuarioId = user?.UsuarioId,
                    CustomerName = user is null ? Required(input.ContactName, "Cliente", 150)
                        : Required(user.NombreCliente, "Cliente", 200),
                    ContactName = input.ContactName!.Trim(), ContactEmail = input.ContactEmail!.Trim(),
                    ContactPhone = input.ContactPhone!.Trim(),
                    Mode = input.Mode!, ShipmentType = input.ShipmentType!,
                    OriginName = originName,
                    DestinationName = destinationName,
                    FormJson = JsonSerializer.Serialize(input, Json)
                };
                if (useDhole)
                {
                    // Map the REAL validated wizard/GIO request (not browser-mapped JSON).
                    // This first phase only validates a local unsendable draft.
                    // The original quote is saved in Administration as usual.
                    // NO API key, network call, approval gate or dispatch occurs here.
                    _ = DholeOfficialQuoteDraftBuilder.Project(
                        input, quote.Id, verifiedDholeRoute!);
                }
                // Persist only a job identity, not a second copy of personal data.
                // Nothing sends HTTP or constructs the external payload at this stage.
                if (stageDirect || deduplicateCreate)
                {
                    // A single transaction protects the official copy, optional
                    // creation-key uniqueness, and the Dhole outbox registration.
                    await using var transaction = await db.Database.BeginTransactionAsync(ct);
                    if (deduplicateCreate)
                    {
                        await LockCreationKeyAsync(db, requestKey!.Value, transaction, ct);
                        // The first request may have committed while this request
                        // waited for the lock. Never create another copy in that case.
                        var prior = await db.OfficialQuoteClientSubmissions.AsNoTracking()
                            .FirstOrDefaultAsync(x => x.SubmissionKey == requestKey, ct);
                        if (prior is not null)
                        {
                            http.Response.Headers.CacheControl = "no-store";
                            return await RepeatReceiptAsync(prior, requestDigest!, stageDirect, db, ct);
                        }
                    }
                    // Parent first for both FK-dependent child tables. Either
                    // all records commit or all are rolled back.
                    db.OfficialQuotes.Add(quote);
                    await db.SaveChangesAsync(ct);
                    if (deduplicateCreate)
                    {
                        db.OfficialQuoteClientSubmissions.Add(new OfficialQuoteClientSubmission
                        {
                            SubmissionKey = requestKey!.Value,
                            QuoteId = quote.Id,
                            RequestDigest = requestDigest!
                        });
                    }
                    if (stageDirect)
                    {
                        db.OfficialQuoteDholeCreationOutbox.Add(new OfficialQuoteDholeCreationOutbox
                        {
                            QuoteId = quote.Id,
                            IdempotencyKey = "cf-official-" + quote.Id.ToString("D"),
                            State = "PendingDispatch",
                            Priority = "Green"
                        });
                    }
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                }
                else
                {
                    // Legacy/local behavior is unchanged when flags are off.
                    db.OfficialQuotes.Add(quote);
                    await db.SaveChangesAsync(ct);
                }
                http.Response.Headers.CacheControl = "no-store";
                return Results.Created($"/api/quotes/official/{quote.Id}", new
                {
                    quote.Id, quote.Status, quote.Authorization, quote.CreatedAtUtc,
                    dholeDispatchState = stageDirect ? "PendingDispatch" : "Disabled"
                });
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
            catch (DholeCatalogUnavailableException)
            {
                return Results.Json(new { code = "dhole_catalog_unavailable", error = "No se pudo verificar el catálogo de Dhole." },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }).RequireRateLimiting("public-quote");

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
        }).RequireAuthorization("registered");

        var admin = app.MapGroup("/api/admin/quotes/official").RequireAuthorization("admin");
        admin.MapGet("/permissions/me", async (AppDbContext db, AuthService auth, IConfiguration config, HttpContext http,
            CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            var p = await Permission(db, actor, ct);
            return Results.Ok(new { canView = p?.CanView == true || p?.CanManage == true || p?.CanAuthorize == true,
                canManage = p?.CanManage == true, canAuthorize = p?.CanAuthorize == true,
                dholeApprovalQueueEnabled = config.GetValue<bool>("DholeSubmission:ApprovalQueueEnabled"),
                dholeDirectOutboxEnabled = config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled") });
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
            IConfiguration config, HttpContext http, CancellationToken ct) =>
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
            // Never query either optional outbox without its enabled flag.
            // Direct delivery is independent of historical admin authorization.
            var directEnabled = config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled");
            var approvalEnabled = config.GetValue<bool>("DholeSubmission:ApprovalQueueEnabled");
            var directOutbox = directEnabled
                ? await db.OfficialQuoteDholeCreationOutbox.AsNoTracking()
                    .Where(x => x.QuoteId == id)
                    .Select(x => new { x.State, x.Priority }).FirstOrDefaultAsync(ct)
                : null;
            var approvalOutbox = !directEnabled && approvalEnabled
                ? await db.OfficialQuoteDholeOutbox.AsNoTracking()
                    .Where(x => x.QuoteId == id)
                    .Select(x => new { x.State, x.Priority }).FirstOrDefaultAsync(ct)
                : null;
            var dispatchState = directEnabled ? (directOutbox?.State ?? "NotStaged") :
                approvalEnabled ? (approvalOutbox?.State ?? "NotStaged") : "Disabled";
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { q.Id, q.CustomerName, q.Mode, q.ShipmentType, q.Status,
                q.Authorization, q.AuthorizedAtUtc, q.CreatedAtUtc, dholeDispatchState = dispatchState,
                dholePriority = directEnabled ? directOutbox?.Priority : approvalOutbox?.Priority,
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

        admin.MapPut("/{id:guid}/authorization", async (Guid id, string decision, string? priority,
            AppDbContext db, AuthService auth, IConfiguration config, HttpContext http, CancellationToken ct) =>
        {
            var actor = await auth.GetIdentityAsync(http, ct);
            var p = await Permission(db, actor, ct);
            if (p?.CanAuthorize != true) return Results.Forbid();
            // Direct submissions are created independently of administrator
            // authorization. Do not permit an old API client to silently
            // mutate approval status after the direct rollout is enabled.
            if (config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled"))
                return Results.Conflict(new {
                    code = "direct_submission_no_approval",
                    error = "Las solicitudes directas a Dhole no requieren aprobación administrativa."
                });
            if (decision is not ("Authorized" or "Rejected"))
                return Results.BadRequest(new { error = "Decisión inválida." });
            var selectedPriority = priority ?? "Green";
            if (selectedPriority is not ("Green" or "Yellow" or "Red"))
                return Results.BadRequest(new { error = "Prioridad Dhole inválida." });
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // Lock this quote for the complete approval transaction, preventing
            // concurrent authorizers from creating duplicate outbox entries.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT 1 FROM public.official_quote_requests WHERE id = {id} FOR UPDATE", ct);
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
            // This is ONLY an approval outbox. There is no Dhole HTTP client,
            // sender, timer or external POST associated with this transition.
            // The table is optional and must be migrated before enabling the flag.
            var staged = decision == "Authorized" &&
                config.GetValue<bool>("DholeSubmission:ApprovalQueueEnabled") &&
                !config.GetValue<bool>("DholeSubmission:DirectOutboxEnabled");
            if (staged)
            {
                db.OfficialQuoteDholeOutbox.Add(new OfficialQuoteDholeOutbox {
                    QuoteId = id, ApprovedById = actor.UsuarioId,
                    State = "AwaitingConnector", Priority = selectedPriority
                });
                db.OfficialQuoteAudit.Add(new OfficialQuoteAudit {
                    QuoteId = id, ActorUserId = actor.UsuarioId, Action = "DholeStaged",
                    Comment = "Prioridad " + selectedPriority +
                        "; aprobada y registrada localmente; no enviada a Dhole."
                });
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(new { q.Id, q.Authorization, q.AuthorizedAtUtc,
                dholeDispatchState = staged ? "AwaitingConnector" : "Disabled",
                dholePriority = staged ? selectedPriority : null });
        }).RequireRateLimiting("auth");
        return app;
    }
}
