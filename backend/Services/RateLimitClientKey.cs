using System.Net;
using System.Net.Sockets;
using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;

namespace CastroFallas.MiniQuote.Api.Services;

/// <summary>
/// Rate-limit identity. Only honor X-Forwarded-For after verifying the immediate
/// peer is an explicitly configured reverse proxy. Untrusted clients must never
/// select their own partition by submitting a header.
/// </summary>
public static class RateLimitClientKey
{
    // Docker container addresses can change on recreation. Only explicitly
    // configured, exact single-label Docker DNS hostnames are permitted.
    // Re-resolve frequently; on DNS failure the request fails closed to peer IP.
    private static readonly ConcurrentDictionary<string, (DateTimeOffset Until, IPAddress[] Addresses)> ProxyDnsCache = new();

    private static bool IsDockerPrivateAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
            return bytes[0] == 10 || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
                   (bytes[0] == 192 && bytes[1] == 168);
        return address.AddressFamily == AddressFamily.InterNetworkV6 && (bytes[0] & 0xFE) == 0xFC;
    }

    private static bool IsSafeDockerHostname(string host) =>
        host.Length is >= 1 and <= 63 &&
        host[0] is >= 'a' and <= 'z' &&
        host.All(ch => (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-');

    private static IEnumerable<IPAddress> ResolveTrustedHost(string host)
    {
        if (!IsSafeDockerHostname(host)) return Array.Empty<IPAddress>();
        if (ProxyDnsCache.TryGetValue(host, out var cached) && cached.Until > DateTimeOffset.UtcNow)
            return cached.Addresses;
        try
        {
            var addresses = Dns.GetHostAddresses(host)
                .Select(ip => ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip)
                .Where(IsDockerPrivateAddress).ToArray();
            ProxyDnsCache[host] = (DateTimeOffset.UtcNow.AddSeconds(5), addresses);
            return addresses;
        }
        catch (SocketException)
        {
            // No stale trust when DNS is unavailable.
            ProxyDnsCache.TryRemove(host, out _);
            return Array.Empty<IPAddress>();
        }
    }

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

        // An optional set of stable Docker service names avoids hard-coding
        // per-container IPs. It is explicitly opted in only after verifying
        // every trusted hop and that the upstream strips spoofed headers.
        foreach (var item in config.GetSection("RateLimiting:TrustedProxyHostnames").GetChildren())
        {
            var host = item.Value?.Trim().ToLowerInvariant();
            if (host is null) continue;
            foreach (var address in ResolveTrustedHost(host))
                trusted.Add(address);
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
