using System.Net;
using System.Security.Claims;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

static string Key(string peer, string? xff = null, params (string Name, string Value)[] settings)
{
    var context = new DefaultHttpContext();
    context.Connection.RemoteIpAddress = IPAddress.Parse(peer);
    if (xff is not null) context.Request.Headers["X-Forwarded-For"] = xff;
    var values = settings.ToDictionary(x => x.Name, x => (string?)x.Value);
    var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
    return RateLimitClientKey.PerAddress(context, configuration);
}
static void Expect(string actual, string expected, string reason)
{
    if (actual != expected)
        throw new Exception($"{reason}: expected {expected}, got {actual}");
}
var frontend = ("RateLimiting:TrustedProxyIps:0", "172.18.0.40");
var gateway = ("RateLimiting:TrustedProxyIps:1", "172.18.0.41");

// A client-supplied XFF must never select a rate-limit partition.
Expect(Key("172.18.0.40", "198.51.100.1"), "ip:172.18.0.40", "No implicit trust");
Expect(Key("172.18.0.39", "198.51.100.1", frontend), "ip:172.18.0.39", "Untrusted peer cannot spoof");
Expect(Key("172.18.0.40", "198.51.100.1", frontend), "ip:198.51.100.1", "Exact immediate trusted hop");
if (Key("172.18.0.40", "198.51.100.11", frontend) ==
    Key("172.18.0.40", "198.51.100.12", frontend))
    throw new Exception("Distinct verified visitors must not share the same public-read partition");
Expect(Key("172.18.0.40", "192.0.2.200, 198.51.100.22", frontend),
       "ip:198.51.100.22", "Ignore client-spoofed left prefix");
Expect(Key("172.18.0.40", "192.0.2.200, 198.51.100.22, 172.18.0.41", frontend, gateway),
       "ip:198.51.100.22", "Trusted multi-hop; stop at untrusted edge");
Expect(Key("172.18.0.40", "not-an-ip", frontend),
       "ip:172.18.0.40", "Malformed XFF fails closed");
Expect(Key("172.18.0.40", string.Join(',', Enumerable.Repeat("198.51.100.1", 17)), frontend),
       "ip:172.18.0.40", "Oversized XFF fails closed");
Expect(Key("172.18.0.40", "198.51.100.1",
           ("RateLimiting:TrustedProxyHostnames:0", "frontend.example.com")),
       "ip:172.18.0.40", "External DNS names cannot be trusted");
Expect(Key("172.18.0.40", "198.51.100.1",
           ("RateLimiting:TrustedProxyHostnames:0", "localhost")),
       "ip:172.18.0.40", "Loopback is not a Docker private proxy address");

var authenticated = new DefaultHttpContext();
authenticated.Connection.RemoteIpAddress = IPAddress.Parse("172.18.0.40");
authenticated.User = new ClaimsPrincipal(new ClaimsIdentity(
    new[] { new Claim("sub", "test-user-123") }, authenticationType: "validated-test"));
Expect(RateLimitClientKey.PublicRead(authenticated, new ConfigurationBuilder().Build()),
       "user:test-user-123", "Authenticated read has independent quota");

Console.WriteLine("OK: trusted proxy identity, spoofed XFF, DNS restrictions, user partition.");
