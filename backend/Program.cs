using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Endpoints;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services;
using CastroFallas.MiniQuote.Api.Services.Auth;
using CastroFallas.MiniQuote.Api.Services.Realtime;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using MongoDB.Driver;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

var postgres = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:Postgres (configurá el backend, no DBeaver).");
var otpPepper = builder.Configuration["Auth:OtpPepper"] ?? "";
if (otpPepper.Length < 64 || otpPepper.Contains("REEMPLAZAR", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("Auth:OtpPepper debe configurarse con 64 caracteres aleatorios en dotnet user-secrets.");
if (builder.Configuration["Email:Mode"]?.Equals("LocalOutbox", StringComparison.OrdinalIgnoreCase) == true
    && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Email:Mode=LocalOutbox no está permitido fuera de Development.");

builder.Services.AddHttpClient<GraphEmailSender>(client => client.Timeout = TimeSpan.FromSeconds(20));
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(postgres));
// Redis y MongoDB se utilizan SOLO para cache/auditoría de cotizaciones.
// Si no se configuran, el login y las cotizaciones siguen usando PostgreSQL.
var redisUrl = builder.Configuration["Redis:ConnectionString"];
if (!string.IsNullOrWhiteSpace(redisUrl))
    builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
        ConnectionMultiplexer.Connect(ConfigurationOptions.Parse(redisUrl + ",abortConnect=false,connectRetry=1,connectTimeout=1500")));
var mongoUrl = builder.Configuration["Mongo:ConnectionString"];
if (!string.IsNullOrWhiteSpace(mongoUrl))
    builder.Services.AddSingleton<IMongoDatabase>(_ =>
        new MongoClient(mongoUrl).GetDatabase(builder.Configuration["Mongo:Database"] ?? "castrofallas_logs"));
// Cookie JWT firmada; sin token para visitantes anónimos. Todas las operaciones
// protegidas verifican además que la sesión PostgreSQL no haya sido revocada.
var jwtKey = JwtAuthOptions.GetSigningKey(builder.Configuration);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = JwtAuthOptions.Issuer(builder.Configuration),
            ValidateAudience = true,
            ValidAudience = JwtAuthOptions.Audience(builder.Configuration),
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtKey,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = JwtRegisteredClaimNames.Sub,
            RoleClaimType = JwtAuthOptions.RoleClaim
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.Request.Cookies.TryGetValue(JwtAuthOptions.CookieName, out var cookie))
                    context.Token = cookie;
                return Task.CompletedTask;
            },
            OnTokenValidated = async context =>
            {
                var authService = context.HttpContext.RequestServices.GetRequiredService<AuthService>();
                var token = context.HttpContext.Request.Cookies[JwtAuthOptions.CookieName];
                var identity = token is not null && context.Principal is not null
                    ? await authService.ValidateJwtSessionAsync(token, context.Principal, context.HttpContext.RequestAborted)
                    : null;
                if (identity is null)
                    context.Fail("Sesión inválida, revocada o cuenta deshabilitada.");
                else
                    context.HttpContext.Items["auth.identity"] = identity;
            }
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("client", policy => policy.RequireRole("client"));
    options.AddPolicy("admin", policy => policy.RequireRole("admin"));
    options.AddPolicy("registered", policy => policy.RequireRole("client", "admin"));
});
builder.Services.AddSignalR(options => { options.EnableDetailedErrors = false; options.MaximumReceiveMessageSize = 4 * 1024; });
builder.Services.AddSingleton<ContentUpdatesPublisher>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<QuoteService>();
builder.Services.AddScoped<AssistantService>();
builder.Services.AddSingleton<NewsTranslationService>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<AssistantFreeQuota>();
builder.Services.AddSingleton<ObjectStorageService>();
builder.Services.AddHttpClient("Groq", client =>
{
    client.BaseAddress = new Uri("https://api.groq.com/openai/v1/");
    client.Timeout = TimeSpan.FromSeconds(18);
});
builder.Services.AddHttpClient("GroqNews", client =>
{
    client.BaseAddress = new Uri("https://api.groq.com/openai/v1/");
    client.Timeout = TimeSpan.FromSeconds(75);
});
builder.Services.AddProblemDetails();

// Se utiliza la dirección real de la conexión local; NO se confía en headers
// X-Forwarded-For o X-Real-IP enviados por un navegador.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.AddPolicy("tracking", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.AddPolicy("news-translation", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 12,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.AddPolicy("assistant", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});

var app = builder.Build();

// Desarrollo local: aplica SQL idempotente sobre la base 'login'.
// No borra tablas ni datos. Fuera de Development nunca se autoejecuta.
if (app.Environment.IsDevelopment() && builder.Configuration.GetValue<bool>("Development:ApplySchema"))
{
    try
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var scriptPath = Path.Combine(app.Environment.ContentRootPath, "Database", "AuthSchema.sql");
        var sql = await File.ReadAllTextAsync(scriptPath);
        await db.Database.ExecuteSqlRawAsync(sql);
        // Idempotent migration for existing CMS news; also install on production
        // before deploying the new API (see NewsPublicationMetadata.sql).
        var newsMetadataPath = Path.Combine(app.Environment.ContentRootPath, "Database", "NewsPublicationMetadata.sql");
        await db.Database.ExecuteSqlRawAsync(await File.ReadAllTextAsync(newsMetadataPath));
        var officialPath = Path.Combine(app.Environment.ContentRootPath, "Database", "OfficialQuotesSchema.sql");
        await db.Database.ExecuteSqlRawAsync(await File.ReadAllTextAsync(officialPath));
        // Ubicaciones ficticias e inequívocamente marcadas como PRUEBA.
        // Solo se cargan en el ambiente Development cuando se aplica el esquema local.
        // Nunca se cargan automáticamente en producción ni sustituyen el catálogo oficial.
        var testLocationsPath = Path.Combine(app.Environment.ContentRootPath, "Database", "OfficialQuotesDevelopmentLocations.sql");
        await db.Database.ExecuteSqlRawAsync(await File.ReadAllTextAsync(testLocationsPath));
        var verifiedLocationsPath = Path.Combine(app.Environment.ContentRootPath, "Database", "OfficialQuotesVerifiedLocations.sql");
        await db.Database.ExecuteSqlRawAsync(await File.ReadAllTextAsync(verifiedLocationsPath));
        var videoLocationsPath = Path.Combine(app.Environment.ContentRootPath, "Database", "OfficialQuotesVideoLocations.sql");
        await db.Database.ExecuteSqlRawAsync(await File.ReadAllTextAsync(videoLocationsPath));
        // Datos de rastreo ficticios: cargar exclusivamente en Development.
        var trackingDemoPath = Path.Combine(app.Environment.ContentRootPath, "Database", "TrackingDemoSchema.sql");
        await db.Database.ExecuteSqlRawAsync(await File.ReadAllTextAsync(trackingDemoPath));
        app.Logger.LogInformation("Esquema de login comprobado/aplicado en PostgreSQL ({Database}).",
            new NpgsqlConnectionStringBuilder(postgres).Database);
    }
    catch (Exception ex)
    {
        app.Logger.LogCritical(ex, "No se pudo aplicar AuthSchema.sql. Revisá que exista la base 'login', usuario y contraseña; respaldo antes de migrar.");
        throw;
    }
}

app.UseExceptionHandler(errorApp => errorApp.Run(async http =>
{
    var exception = http.Features.Get<IExceptionHandlerFeature>()?.Error;
    app.Logger.LogError(exception, "Error inesperado de API. TraceId={TraceId}", http.TraceIdentifier);
    http.Response.Headers.CacheControl = "no-store";
    await Results.Json(new
    {
        error = "Error interno del servidor. Consultá la terminal donde corre dotnet.",
        traceId = http.TraceIdentifier
    }, statusCode: StatusCodes.Status500InternalServerError).ExecuteAsync(http);
}));

// Vite recibe las solicitudes desde localhost:5173 y las reenvía a :5000.
// Permitir ese origen únicamente en Development; en otros entornos solo mismo origen.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") &&
        (HttpMethods.IsPost(ctx.Request.Method) || HttpMethods.IsPut(ctx.Request.Method) ||
         HttpMethods.IsDelete(ctx.Request.Method) || HttpMethods.IsPatch(ctx.Request.Method)) &&
        ctx.Request.Headers.TryGetValue("Origin", out var origins))
    {
        // Reject malformed/opaque Origin values rather than accidentally skipping the check.
        if (!Uri.TryCreate(origins.ToString(), UriKind.Absolute, out var origin) ||
            (origin.Scheme != Uri.UriSchemeHttp && origin.Scheme != Uri.UriSchemeHttps))
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        bool sameOrigin = string.Equals(origin.Authority, ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase)
            && string.Equals(origin.Scheme, ctx.Request.Scheme, StringComparison.OrdinalIgnoreCase);
        bool localVite = app.Environment.IsDevelopment() && origin.Scheme == "http" && origin.Port == 5173 &&
            (origin.Host == "localhost" || origin.Host == "127.0.0.1") &&
            (ctx.Request.Host.Host == "localhost" || ctx.Request.Host.Host == "127.0.0.1");
        // TLS terminates at a trusted reverse proxy. The ASP.NET hop is internal HTTP,
        // so validate the browser against an exact configured HTTPS origin rather than
        // trusting client-supplied X-Forwarded-Proto/X-Forwarded-Host headers.
        bool trustedPublicOrigin = !app.Environment.IsDevelopment() &&
            Uri.TryCreate(builder.Configuration["Security:PublicOrigin"], UriKind.Absolute, out var publicUri) &&
            publicUri.Scheme == Uri.UriSchemeHttps &&
            string.Equals(ctx.Request.Host.Host, publicUri.Host, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(origin.GetLeftPart(UriPartial.Authority),
                publicUri.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase);
        if (!sameOrigin && !localVite && !trustedPublicOrigin)
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }
    await next(ctx);
});

// Limit incoming public chatbot requests before JSON binding.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path == "/api/assistant/chat" && HttpMethods.IsPost(ctx.Request.Method))
    {
        const long maxBytes = 12 * 1024;
        var sizeFeature = ctx.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();
        if (sizeFeature is { IsReadOnly: false }) sizeFeature.MaxRequestBodySize = maxBytes;
        if (ctx.Request.ContentLength is > maxBytes)
        {
            ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            return;
        }
    }
    await next();
});

app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapTrackingDemo();
app.MapGet("/api/health", () => Results.Ok(new
{
    service = "CastroFallas.MiniQuote.Api", status = "ok", version = "rediseno-auth-otp-v1", utc = DateTime.UtcNow
}));


app.MapPost("/api/assistant/chat", async (
    AssistantChatRequest input, AssistantService assistant, AssistantFreeQuota budget, CancellationToken ct) =>
{
    var question = input.Question?.Trim();
    if (string.IsNullOrWhiteSpace(question))
        return Results.BadRequest(new { error = "Escribí una consulta." });
    if (question.Length > 800)
        return Results.BadRequest(new { error = "La consulta debe tener 800 caracteres o menos." });
    if (input.Language is not null && input.Language is not ("es" or "en"))
        return Results.BadRequest(new { error = "Idioma no soportado." });
    if (input.History is { Count: > 6 } || input.History?.Any(turn => turn is null ||
            turn.Role is null || turn.Content is null || turn.Content.Length > 500 ||
            !(turn.Role.Equals("visitor", StringComparison.OrdinalIgnoreCase) ||
              turn.Role.Equals("bot", StringComparison.OrdinalIgnoreCase) ||
              turn.Role.Equals("user", StringComparison.OrdinalIgnoreCase) ||
              turn.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase))) == true)
        return Results.BadRequest(new { error = "El historial supera el límite permitido." });
    if (!assistant.IsConfigured)
        return Results.Json(new { error = "La IA no está configurada; usá las respuestas locales de GIO.", code = "ai_not_configured" }, statusCode: 503);
    if (!budget.TryConsume())
        return Results.Json(new { error = "GIO alcanzó temporalmente su cupo de IA.", code = "ai_limited" }, statusCode: 429);

    try
    {
        var answer = await assistant.ReplyAsync(input with { Question = question }, ct);
        return Results.Ok(new { answer, source = "ai" });
    }
    catch (AssistantProviderException)
    {
        return Results.Json(new { error = "No se pudo generar la respuesta en este momento.", code = "ai_unavailable" }, statusCode: 502);
    }
    catch (HttpRequestException)
    {
        return Results.Json(new { error = "No se pudo conectar con el asistente de IA.", code = "ai_unavailable" }, statusCode: 502);
    }
    catch (TaskCanceledException) when (!ct.IsCancellationRequested)
    {
        return Results.Json(new { error = "El asistente tardó demasiado en responder.", code = "ai_timeout" }, statusCode: 504);
    }
}).RequireRateLimiting("assistant");

app.MapGet("/api/health/ready", async (AppDbContext db, IConfiguration config, CancellationToken ct) =>
{
    try
    {
        // La conexión y las tablas/columnas imprescindibles se verifican juntas.
        await db.Database.ExecuteSqlRawAsync("SELECT uuid, nombre, status FROM clientes LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT uuid, correo, cliente_id, tipo_acceso, last_login_at FROM usuarios LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT uuid, otp_hash, expires_at FROM otp_challenges LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT uuid, token_hash, expires_at FROM auth_sessions LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT identifier_hash FROM otp_rate_limits LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT id, pol, pod, closing, etd, eta, status, transporte, modalidad, carrier, vessel, voyage, created_at FROM public.itinerarios LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT \"Id\", \"ClienteId\", \"UsuarioId\", \"WeightKg\", \"Pieces\" FROM quote_requests LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT quote_id, full_name FROM quote_contacts LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT quote_id, transport_kind FROM quote_land_details LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT quote_id, operation FROM quote_air_details LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT quote_id, shipping_type FROM quote_maritime_details LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT quote_id, entry_country FROM quote_multimodal_details LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT id FROM auth_admin_user_audit LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT id, published, author, publication_date FROM public.cms_news LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT id, published FROM public.cms_comments LIMIT 0", ct);
        await db.Database.ExecuteSqlRawAsync("SELECT id, src FROM public.cms_media LIMIT 0", ct);
        return Results.Ok(new
        {
            status = "ready", postgres = "ok", emailMode = config["Email:Mode"] ?? "Smtp"
        });
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "No se pudo verificar la base de datos del login.");
        return Results.Json(new { status = "not_ready", postgres = "error", hint = "Revisá la terminal de dotnet y AuthSchema.sql." },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapPost("/api/auth/request-otp", async (
    RequestOtpDto input, AuthService auth, HttpContext http, CancellationToken ct) =>
{
    try
    {
        var (result, limited, accountUnavailable) = await auth.RequestOtpAsync(input, ct);
        http.Response.Headers.CacheControl = "no-store";
        if (limited) return Results.Json(new { error = "Demasiados intentos. Esperá antes de solicitar otro código." }, statusCode: 429);
        if (accountUnavailable) return Results.Json(
            new { error = "No se pudo iniciar sesión con ese correo. Verificá que esté registrado y habilitado.", code = "account_unavailable" },
            statusCode: StatusCodes.Status404NotFound);
        if (result is null) return Results.BadRequest(new { error = "Revisá el correo, tipo de acceso y código Dynamics." });
        return Results.Ok(result);
    }
    catch (EmailDeliveryException ex)
    {
        app.Logger.LogError(ex, "Error al preparar/enviar email OTP. TraceId={TraceId}", http.TraceIdentifier);
        return Results.Json(new { error = "No se pudo entregar el código. Revisá la configuración de correo.", code = "email_unavailable", traceId = http.TraceIdentifier }, statusCode: 503);
    }
    catch (Exception ex) when (ex is NpgsqlException or DbUpdateException or TimeoutException)
    {
        app.Logger.LogError(ex, "Error de PostgreSQL en request-otp. TraceId={TraceId}", http.TraceIdentifier);
        return Results.Json(new { error = "La base de datos no está disponible o le faltan tablas.", code = "postgres_unavailable", traceId = http.TraceIdentifier }, statusCode: 503);
    }
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/verify-otp", async (
    VerifyOtpDto input, AuthService auth, HttpContext http, CancellationToken ct) =>
{
    try
    {
        var result = await auth.VerifyOtpAsync(input, ct);
        if (result is null) return Results.Unauthorized();
        auth.WriteCookie(http, result.Value.Token);
        return Results.Ok(new { user = result.Value.Identity });
    }
    catch (Exception ex) when (ex is NpgsqlException or DbUpdateException or TimeoutException)
    {
        app.Logger.LogError(ex, "Error de PostgreSQL en verify-otp. TraceId={TraceId}", http.TraceIdentifier);
        return Results.Json(new { error = "No se pudo validar el código en PostgreSQL.", code = "postgres_unavailable", traceId = http.TraceIdentifier }, statusCode: 503);
    }
}).RequireRateLimiting("auth");

app.MapGet("/api/auth/me", async (AuthService auth, HttpContext http, CancellationToken ct) =>
{
    http.Response.Headers.CacheControl = "no-store";
    var user = await auth.GetIdentityAsync(http, ct);
    return user is null ? Results.Unauthorized() : Results.Ok(user);
}).RequireAuthorization("registered");

app.MapPost("/api/auth/logout", async (AuthService auth, HttpContext http, CancellationToken ct) =>
{
    await auth.LogoutAsync(http, ct);
    return Results.NoContent();
});

app.MapPost("/api/quotes", async (
    CreateQuoteRequest input, QuoteService service, AuthService auth, ContentUpdatesPublisher updates, HttpContext http, CancellationToken ct) =>
{
    var user = await auth.GetIdentityAsync(http, ct);
    if (user is null) return Results.Unauthorized();
    try
    {
        var quote = await service.CreateAsync(input, user.ClienteId, user.UsuarioId, ct);
        await updates.QuoteAsync(user.UsuarioId, user.ClienteId, user.Role == "admin");
        return Results.Created($"/api/quotes/{quote.Id}", quote);
    }
    catch (ArgumentException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
}).RequireAuthorization("registered");

// En producción mantener deshabilitada la API nueva hasta que se aplique la
// migración y se verifique el catálogo. Desarrollo conserva las pruebas locales.
if (app.Environment.IsDevelopment() || builder.Configuration.GetValue<bool>("Features:OfficialQuotesEnabled"))
    app.MapOfficialQuotes();

// La empresa autenticada solo puede enumerar sus propias solicitudes.
// Límite de página explícito para no devolver registros de otros clientes.
app.MapGet("/api/quotes/mine", async (
    AppDbContext db, AuthService auth, HttpContext http,
    int? page, int? pageSize, CancellationToken ct) =>
{
    var user = await auth.GetIdentityAsync(http, ct);
    if (user is null) return Results.Unauthorized();
    var p = page ?? 1;
    var size = pageSize ?? 20;
    if (p < 1 || size < 1 || size > 100 || ((long)p - 1) * size > int.MaxValue)
        return Results.BadRequest(new { error = "page debe ser mayor que 0 y pageSize debe estar entre 1 y 100." });
    // Admin: solo sus solicitudes, nunca las cotizaciones de otros admins o clientes.
    // Cliente: solicitudes de su empresa, excluyendo las registradas por un administrador.
    var q = user.Role == "admin"
        ? db.QuoteRequests.AsNoTracking().Where(x => x.UsuarioId == user.UsuarioId)
        : db.QuoteRequests.AsNoTracking().Where(x => x.ClienteId == user.ClienteId &&
            !db.Usuarios.Any(owner => owner.Uuid == x.UsuarioId && owner.TipoAcceso == "usuario"));
    var total = await q.CountAsync(ct);
    var items = await q.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id)
        .Skip((p - 1) * size).Take(size)
        .Select(x => new { x.Id, x.ServiceType, x.Origin, x.Destination, x.Status, x.CreatedAtUtc })
        .ToListAsync(ct);
    return Results.Ok(new { items, total, page = p, pageSize = size, totalPages = (int)Math.Ceiling((double)total / size) });
}).RequireAuthorization("registered");

app.MapGet("/api/quotes/{id:guid}", async (
    Guid id, QuoteService service, AuthService auth, HttpContext http, CancellationToken ct) =>
{
    var user = await auth.GetIdentityAsync(http, ct);
    if (user is null) return Results.Unauthorized();
    var result = await service.GetAsync(id, ct);
    if (result.Quote is null) return Results.NotFound(new { error = "Cotización no encontrada." });
    if (user.Role == "admin")
    {
        if (result.Quote.UsuarioId != user.UsuarioId)
            return Results.NotFound(new { error = "Cotización no encontrada." });
    }
    else if (result.Quote.ClienteId != user.ClienteId ||
             await service.IsOwnedByAdminAsync(result.Quote.UsuarioId, ct))
    {
        return Results.NotFound(new { error = "Cotización no encontrada." });
    }
    http.Response.Headers["X-Data-Source"] = result.Source;
    return Results.Ok(result.Quote);
}).RequireAuthorization("registered");


app.MapGet("/api/itinerarios", async (
    AppDbContext db, AuthService auth, HttpContext http,
    string? pol, string? pod, string? status, string? transporte,
    string? modalidad, DateOnly? closing, DateOnly? etd, DateOnly? eta,
    DateOnly? closingDesde, DateOnly? closingHasta,
    DateOnly? etdDesde, DateOnly? etdHasta,
    DateOnly? etaDesde, DateOnly? etaHasta,
    int? page, int? pageSize, CancellationToken ct) =>
{
    if (await auth.GetIdentityAsync(http, ct) is null)
        return Results.Unauthorized();

    var currentPage = page ?? 1;
    var currentPageSize = pageSize ?? 20;
    // Límites explícitos: evitan desbordamientos en Skip y consultas excesivas.
    var offset = ((long)currentPage - 1) * currentPageSize;
    if (currentPage < 1 || currentPageSize < 1 || currentPageSize > 100 || offset > int.MaxValue)
        return Results.BadRequest(new { error = "La página debe ser mayor a cero y pageSize debe estar entre 1 y 100." });

    if ((closingDesde.HasValue && closingHasta.HasValue && closingDesde.Value > closingHasta.Value) ||
        (etdDesde.HasValue && etdHasta.HasValue && etdDesde.Value > etdHasta.Value) ||
        (etaDesde.HasValue && etaHasta.HasValue && etaDesde.Value > etaHasta.Value))
        return Results.BadRequest(new { error = "La fecha inicial no puede ser posterior a la fecha final." });

    var query = db.Itinerarios.AsNoTracking();
    if (!string.IsNullOrWhiteSpace(pol))
        query = query.Where(x => EF.Functions.ILike(x.Pol, $"%{pol.Trim()}%"));
    if (!string.IsNullOrWhiteSpace(pod))
        query = query.Where(x => EF.Functions.ILike(x.Pod, $"%{pod.Trim()}%"));
    if (!string.IsNullOrWhiteSpace(status))
        query = query.Where(x => x.Status == status);
    if (!string.IsNullOrWhiteSpace(transporte))
        query = query.Where(x => x.Transporte == transporte);
    if (!string.IsNullOrWhiteSpace(modalidad))
        query = query.Where(x => x.Modalidad == modalidad);

    // Los filtros exactos anteriores siguen disponibles para otros consumidores de la API.
    if (closing.HasValue) query = query.Where(x => x.Closing == closing.Value);
    if (etd.HasValue) query = query.Where(x => x.Etd == etd.Value);
    if (eta.HasValue) query = query.Where(x => x.Eta == eta.Value);

    // Los rangos son inclusivos y se pueden usar con solo uno de los extremos.
    if (closingDesde.HasValue) query = query.Where(x => x.Closing >= closingDesde.Value);
    if (closingHasta.HasValue) query = query.Where(x => x.Closing <= closingHasta.Value);
    if (etdDesde.HasValue) query = query.Where(x => x.Etd >= etdDesde.Value);
    if (etdHasta.HasValue) query = query.Where(x => x.Etd <= etdHasta.Value);
    if (etaDesde.HasValue) query = query.Where(x => x.Eta >= etaDesde.Value);
    if (etaHasta.HasValue) query = query.Where(x => x.Eta <= etaHasta.Value);

    var total = await query.CountAsync(ct);
    var data = await query.OrderBy(x => x.Etd).ThenBy(x => x.Id)
        .Skip((int)offset).Take(currentPageSize)
        .Select(x => new {
            x.Id, x.Pol, x.Pod, x.Closing, x.Status, x.Etd, x.Eta,
            Transport = x.Transporte, Modality = x.Modalidad
        }).ToListAsync(ct);
    http.Response.Headers.CacheControl = "no-store";
    return Results.Ok(new {
        items = data,
        total,
        page = currentPage,
        pageSize = currentPageSize,
        totalPages = (int)Math.Ceiling((double)total / currentPageSize)
    });
}).RequireAuthorization("registered");

// CRUD administrativo aislado del frontend: política admin en cada ruta de escritura.
app.MapItinerariosCrud();

// Directorio de usuarios y cambios de acceso auditados (JWT admin).
app.MapAdminUsers();

// Noticias públicas publicadas y mantenimiento de contenido reservado a admins.
app.MapManagedContent();
app.MapManagedMediaObjects();
app.MapSiteCms();
// Endpoint público de conexión. Los grupos privados se validan con la cookie JWT
// revocable al establecer conexión; el hub no permite que clientes emitan eventos.
app.MapHub<ContentUpdatesHub>(ContentUpdatesHub.Path);

app.Run();
