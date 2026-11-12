using System.Net;
using System.IdentityModel.Tokens.Jwt;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Rate-limit identity. Only honor X-Forwarded-For after verifying the immediate
/// peer is an explicitly configured reverse proxy. Untrusted clients must never
/// select their own partition by submitting a header.
/// </summary>
public static class RateLimitClientKey
{
    public static string PerAddress(HttpContext context, IConfiguration config) =>
        "ip:" + ResolveAddress(context, config);

    public static string PublicRead(HttpContext context, IConfiguration config)
    {
        // The authentication middleware has already validated the JWT and session.
        var subject = context.User.Identity?.IsAuthenticated == true
            ? context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value : null;
        return !string.IsNullOrWhiteSpace(subject)
            ? "user:" + subject
            : PerAddress(context, config);
    }

    private static string ResolveAddress(HttpContext context, IConfiguration config)
    {
        static IPAddress Normalize(IPAddress ip) => ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip;

        var peer = context.Connection.RemoteIpAddress;
        if (peer is null) return "unknown";
        var current = Normalize(peer);
        var trusted = new HashSet<IPAddress>();
        foreach (var item in config.GetSection("RateLimiting:TrustedProxyIps").GetChildren())
        {
            if (IPAddress.TryParse(item.Value, out var address))
                trusted.Add(Normalize(address));
        }

        // Nginx appends the address of its immediate client to XFF. Walk from
        // right to left, stopping at the first untrusted hop. This rejects
        // spoofed leading values even when the browser supplies its own XFF.
        if (!trusted.Contains(current)) return current.ToString();
        var forwarded = context.Request.Headers["X-Forwarded-For"].ToString();
        if (string.IsNullOrWhiteSpace(forwarded) || forwarded.Length > 1024)
            return current.ToString();
        var hops = forwarded.Split(',', StringSplitOptions.TrimEntries);
        if (hops.Length > 16) return current.ToString();
        for (var i = hops.Length - 1; i >= 0 && trusted.Contains(current); i--)
        {
            if (!IPAddress.TryParse(hops[i], out var address))
                break;
            current = Normalize(address);
        }
        return current.ToString();
    }
}
