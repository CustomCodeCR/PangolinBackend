using System.Threading.RateLimiting;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services;
using CastroFallas.MiniQuote.Api.Services.Auth;
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
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<QuoteService>();
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
});

var app = builder.Build();

// Desarrollo local: comprueba / aplica SQL idempotente sin borrar tablas ni datos.
// Docker espera al healthcheck de PostgreSQL; estos reintentos adicionales cubren
// cortes breves de red y arranques lentos sin confundirlos con errores de esquema.
// Fuera de Development nunca se autoejecuta.
if (app.Environment.IsDevelopment() && builder.Configuration.GetValue<bool>("Development:ApplySchema"))
{
    const int maxAttempts = 15;
    var scriptPath = Path.Combine(app.Environment.ContentRootPath, "Database", "AuthSchema.sql");
    var sql = await File.ReadAllTextAsync(scriptPath);
    for (var attempt = 1; attempt <= maxAttempts; attempt++)
    {
        try
        {
            await using var scope = app.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.ExecuteSqlRawAsync(sql);
            app.Logger.LogInformation("PostgreSQL conectado y esquema comprobado en {Database} (intento {Attempt}).",
                new NpgsqlConnectionStringBuilder(postgres).Database, attempt);
            break;
        }
        catch (Exception ex) when (attempt < maxAttempts &&
            (ex is NpgsqlException { IsTransient: true } || ex is TimeoutException))
        {
            app.Logger.LogWarning(ex, "PostgreSQL aún no está disponible ({Attempt}/{MaxAttempts}); se reintentará.",
                attempt, maxAttempts);
            await Task.Delay(TimeSpan.FromSeconds(3), app.Lifetime.ApplicationStopping);
        }
        catch (Exception ex)
        {
            app.Logger.LogCritical(ex, "No se pudo conectar o aplicar AuthSchema.sql. Revisá credenciales y logs; nunca borres los volúmenes para intentar arreglarlo.");
            throw;
        }
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
        ctx.Request.Headers.TryGetValue("Origin", out var origins) &&
        Uri.TryCreate(origins.ToString(), UriKind.Absolute, out var origin))
    {
        bool sameOrigin = string.Equals(origin.Authority, ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase)
            && string.Equals(origin.Scheme, ctx.Request.Scheme, StringComparison.OrdinalIgnoreCase);
        bool localVite = app.Environment.IsDevelopment() && origin.Scheme == "http" && origin.Port == 5173 &&
            (origin.Host == "localhost" || origin.Host == "127.0.0.1") &&
            (ctx.Request.Host.Host == "localhost" || ctx.Request.Host.Host == "127.0.0.1");
        if (!sameOrigin && !localVite)
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
    }
    await next(ctx);
});

app.UseRouting();
app.UseRateLimiter();

app.MapGet("/api/health", () => Results.Ok(new
{
    service = "CastroFallas.MiniQuote.Api", status = "ok", version = "rediseno-auth-otp-v1", utc = DateTime.UtcNow
}));

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
        var (result, limited) = await auth.RequestOtpAsync(input, ct);
        if (limited) return Results.Json(new { error = "Demasiados intentos. Esperá antes de solicitar otro código." }, statusCode: 429);
        if (result is null) return Results.BadRequest(new { error = "Revisá el correo, tipo de acceso y código Dynamics." });
        http.Response.Headers.CacheControl = "no-store";
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
});

app.MapPost("/api/auth/logout", async (AuthService auth, HttpContext http, CancellationToken ct) =>
{
    await auth.LogoutAsync(http, ct);
    return Results.NoContent();
});

app.MapPost("/api/quotes", async (
    CreateQuoteRequest input, QuoteService service, AuthService auth, HttpContext http, CancellationToken ct) =>
{
    var user = await auth.GetIdentityAsync(http, ct);
    if (user is null) return Results.Unauthorized();
    try
    {
        var quote = await service.CreateAsync(input, user.ClienteId, user.UsuarioId, ct);
        return Results.Created($"/api/quotes/{quote.Id}", quote);
    }
    catch (ArgumentException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapGet("/api/quotes/{id:guid}", async (
    Guid id, QuoteService service, AuthService auth, HttpContext http, CancellationToken ct) =>
{
    var user = await auth.GetIdentityAsync(http, ct);
    if (user is null) return Results.Unauthorized();
    var result = await service.GetAsync(id, ct);
    if (result.Quote is null || result.Quote.ClienteId != user.ClienteId)
        return Results.NotFound(new { error = "Cotización no encontrada." });
    http.Response.Headers["X-Data-Source"] = result.Source;
    return Results.Ok(result.Quote);
});

app.Run();
