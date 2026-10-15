using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using CastroFallas.MiniQuote.Api.Data;
using CastroFallas.MiniQuote.Api.Models.Auth;
using SmtpClient = MailKit.Net.Smtp.SmtpClient;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace CastroFallas.MiniQuote.Api.Services.Auth;

public record RequestOtpDto(string? TipoAcceso, string? Correo, string? CodigoDynamics);
public record VerifyOtpDto(Guid ChallengeId, string? Codigo);
public record OtpStarted(Guid ChallengeId, string Message, int ExpiresInSeconds);
public record AuthIdentity(Guid UsuarioId, Guid ClienteId, string NombreCliente, string Correo, string TipoAcceso, string Role, string? AdminType);

public sealed class AuthService(
    AppDbContext db,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<AuthService> logger)
{
    private const int OtpTtlMinutes = 5;
    private const int MaxOtpAttempts = 5;
    private const string SessionCookie = JwtAuthOptions.CookieName;
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(8);
    private readonly SymmetricSecurityKey _jwtKey = JwtAuthOptions.GetSigningKey(configuration);
    private readonly string _pepper = configuration["Auth:OtpPepper"]
        ?? throw new InvalidOperationException("Falta Auth:OtpPepper");

    // Se mantiene una respuesta uniforme para no enumerar correos registrados.
    public async Task<(OtpStarted? Result, bool TooMany)> RequestOtpAsync(RequestOtpDto input, CancellationToken ct)
    {
        var suppliedRole = (input.TipoAcceso ?? "").Trim().ToLowerInvariant();
        var automaticRole = suppliedRole.Length == 0;
        var email = (input.Correo ?? "").Trim().ToLowerInvariant();
        var dynamics = (input.CodigoDynamics ?? "").Trim();
        // Contrato nuevo: solo correo. El rol se consulta exclusivamente en
        // PostgreSQL, sin confiar en una selección realizada por el navegador.
        // El contrato anterior con tipoAcceso/codigoDynamics sigue admitido.
        if ((!automaticRole && suppliedRole is not ("cliente" or "usuario")) ||
            email.Length > 255 ||
            !MailAddress.TryCreate(email, out var address) ||
            !string.Equals(address.Address, email, StringComparison.OrdinalIgnoreCase) ||
            (!automaticRole && suppliedRole == "cliente" && string.IsNullOrWhiteSpace(dynamics)) ||
            dynamics.Length > 200)
            return (null, false);

        // Límite por dirección incluso cuando no existe el usuario. El registro
        // es atómico en PostgreSQL: funciona sin Redis y entre varias instancias.
        // El límite por IP se aplica adicionalmente en Program.cs.
        var emailKey = Sha256(email);
        var allowed = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO otp_rate_limits (identifier_hash, window_start, request_count, last_requested_at)
            VALUES ({emailKey}, NOW(), 1, NOW())
            ON CONFLICT (identifier_hash) DO UPDATE SET
                window_start = CASE WHEN otp_rate_limits.window_start <= NOW() - INTERVAL '15 minutes'
                    THEN NOW() ELSE otp_rate_limits.window_start END,
                request_count = CASE WHEN otp_rate_limits.window_start <= NOW() - INTERVAL '15 minutes'
                    THEN 1 ELSE otp_rate_limits.request_count + 1 END,
                last_requested_at = NOW()
            WHERE otp_rate_limits.window_start <= NOW() - INTERVAL '15 minutes'
                OR (otp_rate_limits.request_count < 3
                    AND otp_rate_limits.last_requested_at <= NOW() - INTERVAL '60 seconds');
            """, ct);
        if (allowed == 0) return (null, true);

        var user = await db.Usuarios.Include(u => u.Cliente)
            .FirstOrDefaultAsync(u => u.Correo.ToLower() == email &&
                (automaticRole || u.TipoAcceso == suppliedRole) &&
                (u.TipoAcceso == "cliente" || u.TipoAcceso == "usuario") &&
                u.Status && u.DeletedAt == null && u.Cliente.Status && u.Cliente.DeletedAt == null &&
                (automaticRole || suppliedRole != "cliente" || u.Cliente.CodigoDynamics == dynamics), ct);

        // Una cuenta inexistente o deshabilitada recibe una respuesta uniforme,
        // sin correo ni OTP; nunca se revela su rol ni su existencia.
        if (user is null)
            return (new OtpStarted(Guid.NewGuid(), GenericMessage, 300), false);

        // El rol real de la cuenta determina el challenge, el JWT y los permisos.
        var role = user.TipoAcceso;

        var now = DateTime.UtcNow;
        var cooldown = await db.OtpChallenges.AsNoTracking()
            .AnyAsync(x => x.UsuarioId == user.Uuid && x.CreatedAt > now.AddSeconds(-60), ct);
        if (cooldown) return (null, true);

        var id = Guid.NewGuid();
        var otp = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var row = new OtpChallenge
        {
            Uuid = id, UsuarioId = user.Uuid, TipoAcceso = role,
            OtpHash = OtpHash(id, otp), CreatedAt = now,
            ExpiresAt = now.AddMinutes(OtpTtlMinutes)
        };
        // El último código invalida los anteriores.
        await db.OtpChallenges.Where(x => x.UsuarioId == user.Uuid && x.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct);
        db.OtpChallenges.Add(row);
        await db.SaveChangesAsync(ct);

        try
        {
            await SendMailAsync(email, otp, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Nunca registrar el OTP; permitir diagnosticar sin exponer secretos.
            logger.LogError(ex, "No se pudo entregar un OTP a la cuenta {UserId}", user.Uuid);
            row.UsedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            throw new EmailDeliveryException();
        }
        return (new OtpStarted(id, GenericMessage, 300), false);
    }

    public async Task<(string Token, AuthIdentity Identity)?> VerifyOtpAsync(VerifyOtpDto input, CancellationToken ct)
    {
        if (input.ChallengeId == Guid.Empty || input.Codigo is null ||
            input.Codigo.Length != 6 || input.Codigo.Any(c => c < '0' || c > '9'))
            return null;

        // Bloqueo transaccional: dos peticiones simultáneas no pueden gastar el mismo OTP.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // No componer LINQ encima de SELECT ... FOR UPDATE: algunas versiones
        // de EF Core generan SQL no componible y responden HTTP 500.
        OtpChallenge? challenge = null;
        await foreach (var row in db.OtpChallenges
            .FromSqlInterpolated($"SELECT * FROM otp_challenges WHERE uuid = {input.ChallengeId} FOR UPDATE")
            .AsAsyncEnumerable().WithCancellation(ct))
        {
            challenge = row;
            break;
        }
        if (challenge is null) return null;
        await db.Entry(challenge).Reference(x => x.Usuario)
            .Query().Include(x => x.Cliente).LoadAsync(ct);

        var now = DateTime.UtcNow;
        if (challenge.UsedAt != null || challenge.ExpiresAt <= now ||
            challenge.Attempts >= MaxOtpAttempts || !challenge.Usuario.Status ||
            challenge.Usuario.DeletedAt != null || !challenge.Usuario.Cliente.Status ||
            challenge.Usuario.Cliente.DeletedAt != null || challenge.Usuario.TipoAcceso != challenge.TipoAcceso)
            return null;

        challenge.Attempts++;
        var candidateHash = Convert.FromHexString(OtpHash(challenge.Uuid, input.Codigo));
        var actualHash = Convert.FromHexString(challenge.OtpHash);
        if (!CryptographicOperations.FixedTimeEquals(candidateHash, actualHash))
        {
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return null;
        }

        challenge.UsedAt = now;
        // DB existentes pueden tener last_login_at TIMESTAMP o TIMESTAMPTZ.
        // Usar NOW() del propio PostgreSQL evita errores 500 por DateTime.Kind.
        // Se actualiza dentro de la misma transacción que consume el OTP.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE usuarios SET last_login_at = NOW() WHERE uuid = {challenge.UsuarioId}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE clientes SET last_login_at = NOW() WHERE uuid = {challenge.Usuario.ClienteId}", ct);
        var sessionId = Guid.NewGuid();
        var jwtRole = JwtAuthOptions.MapRole(challenge.TipoAcceso);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, challenge.UsuarioId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, sessionId.ToString()),
            new Claim(JwtAuthOptions.ClientIdClaim, challenge.Usuario.ClienteId.ToString()),
            new Claim(JwtAuthOptions.RoleClaim, jwtRole)
        };
        var jwt = new JwtSecurityToken(
            issuer: JwtAuthOptions.Issuer(configuration),
            audience: JwtAuthOptions.Audience(configuration),
            claims: claims,
            notBefore: now,
            expires: now.Add(SessionLifetime),
            signingCredentials: new SigningCredentials(_jwtKey, SecurityAlgorithms.HmacSha256));
        var token = new JwtSecurityTokenHandler().WriteToken(jwt);
        db.AuthSessions.Add(new AuthSession
        {
            Uuid = sessionId, UsuarioId = challenge.UsuarioId, TipoAcceso = challenge.TipoAcceso,
            TokenHash = Sha256(token), CreatedAt = now, ExpiresAt = now.Add(SessionLifetime)
        });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return (token, ToIdentity(challenge.Usuario, challenge.TipoAcceso));
    }

    // El middleware valida firma, audiencia, emisor y expiración antes de llamar a este método.
    // PostgreSQL sigue siendo autoridad para revocación y desactivación de cuentas.
    public async Task<AuthIdentity?> ValidateJwtSessionAsync(
        string token, ClaimsPrincipal principal, CancellationToken ct)
    {
        var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var jti = principal.FindFirstValue(JwtRegisteredClaimNames.Jti);
        var clientId = principal.FindFirstValue(JwtAuthOptions.ClientIdClaim);
        var role = principal.FindFirstValue(JwtAuthOptions.RoleClaim)
            ?? principal.FindFirstValue(ClaimTypes.Role);
        if (!Guid.TryParse(sub, out var userId) || !Guid.TryParse(jti, out var sessionId) ||
            !Guid.TryParse(clientId, out var parsedClient) || role is not ("client" or "admin"))
            return null;

        var now = DateTime.UtcNow;
        var hash = Sha256(token);
        var session = await db.AuthSessions.AsNoTracking()
            .Include(s => s.Usuario).ThenInclude(u => u.Cliente)
            .FirstOrDefaultAsync(s => s.Uuid == sessionId && s.TokenHash == hash &&
                s.ExpiresAt > now && s.RevokedAt == null, ct);
        if (session is null || session.UsuarioId != userId ||
            session.Usuario.ClienteId != parsedClient || !session.Usuario.Status ||
            session.Usuario.DeletedAt != null || !session.Usuario.Cliente.Status ||
            session.Usuario.Cliente.DeletedAt != null ||
            session.Usuario.TipoAcceso != session.TipoAcceso ||
            JwtAuthOptions.MapRole(session.TipoAcceso) != role)
            return null;
        return ToIdentity(session.Usuario, session.TipoAcceso);
    }

    public Task<AuthIdentity?> GetIdentityAsync(HttpContext http, CancellationToken ct)
    {
        if (http.User.Identity?.IsAuthenticated != true ||
            http.Items["auth.identity"] is not AuthIdentity identity)
            return Task.FromResult<AuthIdentity?>(null);
        return Task.FromResult<AuthIdentity?>(identity);
    }

    public void WriteCookie(HttpContext http, string token)
    {
        http.Response.Cookies.Append(SessionCookie, token, new CookieOptions
        {
            HttpOnly = true, Secure = configuration.GetValue<bool>("Auth:SecureCookie"),
            SameSite = SameSiteMode.Strict, Path = "/", IsEssential = true,
            MaxAge = SessionLifetime
        });
        http.Response.Headers.CacheControl = "no-store";
    }

    public async Task LogoutAsync(HttpContext http, CancellationToken ct)
    {
        if (http.Request.Cookies.TryGetValue(SessionCookie, out var token) &&
            token.Length <= 4096 && token.Count(c => c == '.') == 2)
        {
            var hash = Sha256(token);
            await db.AuthSessions.Where(x => x.TokenHash == hash && x.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, DateTime.UtcNow), ct);
        }
        http.Response.Cookies.Delete(SessionCookie, new CookieOptions { Path = "/", SameSite = SameSiteMode.Strict, Secure = configuration.GetValue<bool>("Auth:SecureCookie") });
        http.Response.Headers.CacheControl = "no-store";
    }

    private string OtpHash(Guid id, string otp)
    {
        var key = Encoding.UTF8.GetBytes(_pepper);
        return Convert.ToHexString(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id:N}:{otp}")))
            .ToLowerInvariant();
    }
    private static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
    private static AuthIdentity ToIdentity(Usuario u, string role) =>
        new(u.Uuid, u.ClienteId, u.Cliente.Nombre, u.Correo, role, JwtAuthOptions.MapRole(role), null);
    private const string GenericMessage = "Si los datos corresponden a una cuenta habilitada, recibirás un código por correo.";

    private async Task SendMailAsync(string email, string otp, CancellationToken ct)
    {
        var mode = configuration["Email:Mode"] ?? "Smtp";
        string from = configuration["Smtp:From"] ?? "pruebas@castrofallas.local";
        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(from));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = "Código de acceso | Castro Fallas";
        message.Body = new TextPart("plain")
        {
            Text = $"Tu código temporal de Castro Fallas es: {otp}\n\nVálido durante 5 minutos y una sola vez. Si no lo solicitaste, ignorá este mensaje."
        };

        // Demostración LOCAL: se genera un archivo .eml en el backend.
        // No se entrega a Gmail; no existe ningún endpoint que exponga el OTP.
        // Este modo está prohibido fuera del entorno Development.
        if (mode.Equals("LocalOutbox", StringComparison.OrdinalIgnoreCase))
        {
            if (!environment.IsDevelopment())
                throw new InvalidOperationException("LocalOutbox solo se permite en Development.");
            string folder = Path.Combine(environment.ContentRootPath, "local-outbox");
            Directory.CreateDirectory(folder);
            var filename = $"otp-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}.eml";
            await using var stream = new FileStream(Path.Combine(folder, filename), FileMode.CreateNew, FileAccess.Write);
            await message.WriteToAsync(stream, ct);
            logger.LogInformation("Correo OTP de prueba escrito en backend/local-outbox/{File} (sin envío externo)", filename);
            return;
        }
        if (!mode.Equals("Smtp", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Email:Mode debe ser Smtp o LocalOutbox.");

        string host = configuration["Smtp:Host"] ?? throw new InvalidOperationException("SMTP sin configurar");
        int port = configuration.GetValue<int>("Smtp:Port");
        string tlsMode = configuration["Smtp:Tls"] ?? "StartTls";
        var tls = tlsMode switch
        {
            "StartTls" => SecureSocketOptions.StartTls,
            "SslOnConnect" => SecureSocketOptions.SslOnConnect,
            "None" when environment.IsDevelopment() &&
                (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                 host == "127.0.0.1" || host == "::1") => SecureSocketOptions.None,
            _ => throw new InvalidOperationException("TLS SMTP inválido. None solo en localhost con Development.")
        };
        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(host, port, tls, ct);
        string? user = configuration["Smtp:Username"];
        if (!string.IsNullOrWhiteSpace(user))
            await smtp.AuthenticateAsync(user, configuration["Smtp:Password"] ?? "", ct);
        await smtp.SendAsync(message, ct);
        await smtp.DisconnectAsync(true, ct);
    }
}

public sealed class EmailDeliveryException : Exception { }
