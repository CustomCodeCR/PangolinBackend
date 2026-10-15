using Microsoft.IdentityModel.Tokens;

namespace CastroFallas.MiniQuote.Api.Services.Auth;

// Contrato del JWT. Invitados no reciben token: solo las cuentas verificadas por OTP.
public static class JwtAuthOptions
{
    public const string CookieName = "cf_session";
    public const string RoleClaim = "role";
    public const string ClientIdClaim = "client_id";

    public static string Issuer(IConfiguration config) => config["Auth:JwtIssuer"] ?? "pangolin-backend";
    public static string Audience(IConfiguration config) => config["Auth:JwtAudience"] ?? "pangolin-api";

    public static SymmetricSecurityKey GetSigningKey(IConfiguration config)
    {
        var hex = config["Auth:JwtSigningKey"];
        if (hex is null || hex.Length != 64 || !hex.All(Uri.IsHexDigit))
            throw new InvalidOperationException("Auth:JwtSigningKey debe tener 64 caracteres hexadecimales aleatorios (32 bytes).");
        return new SymmetricSecurityKey(Convert.FromHexString(hex));
    }

    // Valores de la base histórica, sin modificar usuarios.tipo_acceso.
    public static string MapRole(string storedAccessType) => storedAccessType switch
    {
        "cliente" => "client",
        "usuario" => "admin",
        _ => throw new InvalidOperationException("Tipo de acceso no reconocido.")
    };
}
