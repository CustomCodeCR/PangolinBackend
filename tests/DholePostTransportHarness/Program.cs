// Isolated tests: the only HTTP client uses a fake in-memory HttpMessageHandler.
// NEVER uses secrets, live catalogs, or the real Dhole endpoint.
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.Extensions.Configuration;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
static IConfiguration Settings(bool enabled = false, string? key = null)
{
    var settings = new Dictionary<string, string?>
    {
        ["DholeSubmission:PostEnabled"] = enabled ? "true" : "false",
        ["DholeSubmission:ApiKey"] = key
    };
    return new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
}
static JsonDocument Body(string? replacement = null) => JsonDocument.Parse(replacement ?? """
{
  "priority": "Green",
  "shipmentMode": "Fcl",
  "form_serviceIds": ["11111111-1111-4111-8111-111111111111"],
  "form_cargoDescription": "Repuestos automotrices\n\nSolicitante desde la web de Castro Fallas:\nNombre: Persona simulada\nCorreo: prueba@example.invalid\nTeléfono: +506 0000-0000"
}
""");

var secret = "dh_ext_" + new string('a', 64); // synthetic key, NOT an actual Dhole secret
var quoteId = Guid.Parse("a1111111-1111-4111-8111-111111111111");
var fake = new FakePostHandler();
using var fakeHttp = new HttpClient(fake);
var factory = new FakePostFactory(fakeHttp);
using var valid = Body();

// Key present but feature absent: zero HTTP requests.
var disabled = new DholeQuotePostTransport(Settings(key: secret), factory);
Check(!disabled.Enabled, "POST must default to disabled");
Check(await disabled.PostValidatedAsync(quoteId, valid.RootElement, CancellationToken.None)
    == DholeQuotePostOutcome.Disabled, "Feature disabled");
Check(fake.Calls == 0, "Disabled may not contact Dhole");

// Feature enabled with no correctly-scoped key still has zero HTTP requests.
var withoutKey = new DholeQuotePostTransport(Settings(enabled: true), factory);
Check(await withoutKey.PostValidatedAsync(quoteId, valid.RootElement, CancellationToken.None)
    == DholeQuotePostOutcome.NotConfigured, "Missing secret blocks dispatch");
var invalidKey = new DholeQuotePostTransport(Settings(enabled: true, key: "not-a-dhole-key"), factory);
Check(await invalidKey.PostValidatedAsync(quoteId, valid.RootElement, CancellationToken.None)
    == DholeQuotePostOutcome.NotConfigured, "Malformed secret blocks dispatch");
Check(fake.Calls == 0, "Missing or invalid secret may not contact Dhole");

var prepared = new DholeQuotePostTransport(Settings(enabled: true, key: secret), factory);
using (var forged = Body("""
{"priority":"Green","shipmentMode":"Fcl","clientName":"Fake override",
"form_cargoDescription":"Repuestos\n\nSolicitante desde la web de Castro Fallas:\nNombre: Ficticio",
"form_serviceIds":["11111111-1111-4111-8111-111111111111"]}
"""))
{
    Check(await prepared.PostValidatedAsync(quoteId, forged.RootElement, CancellationToken.None)
        == DholeQuotePostOutcome.InvalidPayload, "Cannot override locked Dhole client");
}
using (var missing = Body("""{"priority":"Green","shipmentMode":"Fcl"}"""))
{
    Check(await prepared.PostValidatedAsync(quoteId, missing.RootElement, CancellationToken.None)
        == DholeQuotePostOutcome.InvalidPayload, "Applicant description cannot be omitted");
}
using (var other = Body("""
{"priority":"Green","shipmentMode":"Fcl",
"form_cargoDescription":"Repuestos\n\nSolicitante desde la web de Castro Fallas:\nNombre: Ficticio",
"form_serviceIds":["not-uuid"]}
"""))
{
    Check(await prepared.PostValidatedAsync(quoteId, other.RootElement, CancellationToken.None)
        == DholeQuotePostOutcome.InvalidPayload, "Service IDs must be UUIDs");
}
Check(await prepared.PostValidatedAsync(Guid.Empty, valid.RootElement, CancellationToken.None)
    == DholeQuotePostOutcome.InvalidPayload, "Quote UUID is mandatory");
Check(fake.Calls == 0, "Invalid payload must not contact Dhole");

fake.NextStatus = HttpStatusCode.OK;
Check(await prepared.PostValidatedAsync(quoteId, valid.RootElement, CancellationToken.None)
    == DholeQuotePostOutcome.HttpAcceptedUnverified, "HTTP 2xx is NOT verified creation");
Check(fake.Calls == 1, "Exactly one POST, no implicit retries");
Check(fake.LastMethod == HttpMethod.Post, "POST only");
Check(fake.LastUrl == "https://api.logisticacastrofallas.com/api/external/v1/solicitar-tarifa-wjicua4",
    "Host and path are fixed");
Check(fake.LastKey == secret, "Private header forwarded in fake handler");
Check(fake.LastIdempotency == "cf-official-" + quoteId.ToString("D"),
    "Idempotency key deterministic per quote");
Check(fake.LastContentType?.StartsWith("application/json", StringComparison.Ordinal) == true,
    "JSON content type");
Check(fake.LastBody is not null && fake.LastBody.Contains("prueba@example.invalid", StringComparison.Ordinal),
    "Contact travels only in fake body description");

fake.NextStatus = HttpStatusCode.TooManyRequests;
Check(await prepared.PostValidatedAsync(quoteId, valid.RootElement, CancellationToken.None)
    == DholeQuotePostOutcome.Unconfirmed, "Rate-limit is not a confirmed send");
Check(fake.Calls == 2, "No automatic retry after rate limiting");
fake.NextStatus = HttpStatusCode.Forbidden;
Check(await prepared.PostValidatedAsync(quoteId, valid.RootElement, CancellationToken.None)
    == DholeQuotePostOutcome.Rejected, "403 is rejected");
Check(fake.Calls == 3, "No automatic retry after rejected request");

// End-to-end mock handoff: real JS internal->public adapter generates 5 synthetic
// flat bodies, but only this injected fake handler receives them (NEVER Dhole).
Check(args.Length == 1, "A synthetic fixture JSON path is required for end-to-end verification");
using var fixtureDocument = JsonDocument.Parse(await File.ReadAllTextAsync(args[0]));
Check(fixtureDocument.RootElement.ValueKind == JsonValueKind.Array &&
      fixtureDocument.RootElement.GetArrayLength() == 5, "Five shipment scenarios required");
var scenariosSeen = new HashSet<string>(StringComparer.Ordinal);
foreach (var scenario in fixtureDocument.RootElement.EnumerateArray())
{
    Check(scenario.GetProperty("source").GetString() == "synthetic-no-live-catalogs" &&
          !scenario.GetProperty("transmissionPermitted").GetBoolean(),
        "Only fake test cases may be exercised");
    var scenarioName = scenario.GetProperty("scenario").GetString()!;
    Check(scenariosSeen.Add(scenarioName), "Each mode must be distinct");
    var id = Guid.Parse(scenario.GetProperty("quoteId").GetString()!);
    var body = scenario.GetProperty("body");
    Check(body.GetProperty("priority").GetString() == "Green", "Priority preserved");
    var description = body.GetProperty("form_cargoDescription").GetString()!;
    Check(description.StartsWith("Repuestos automotrices simulados\\n\\n", StringComparison.Ordinal) &&
          description.Contains("Nombre: Persona ficticia", StringComparison.Ordinal) &&
          description.Contains("Correo: prueba@example.invalid", StringComparison.Ordinal) &&
          description.Contains("Teléfono: +506 0000-0000", StringComparison.Ordinal),
        "Goods description and applicant details are preserved");
    foreach (var forbidden in new[] { "clientName", "executiveName", "sellerUserId",
        "form_clientId", "form_clientName", "form_executiveId", "form_executiveName" })
        Check(!body.TryGetProperty(forbidden, out _), "No company/executive override: " + forbidden);
    var mode = body.GetProperty("shipmentMode").GetString()!;
    Check(mode == scenarioName switch {
        "FCL" => "Fcl", "LCL" => "Lcl", "AIR_LCL" => "Air",
        "FTL" => "Ftl", "LTL" => "Ltl", _ => "not-a-mode"
    }, "Expected external shipment mode");
    Check((mode is "Fcl" or "Lcl") == body.TryGetProperty("form_podId", out _),
        "POD only when maritime");
    var equipmentField = mode == "Fcl" ? "form_fclContainers" : "form_landContainers";
    var consolidated = mode is "Lcl" or "Air" or "Ltl";
    Check(consolidated
        ? body.TryGetProperty("sellerContext_consolidatedCargoLines", out _)
        : body.TryGetProperty(equipmentField, out _),
        "Equipment or consolidated cargo must be preserved");
    var before = fake.Calls;
    fake.NextStatus = HttpStatusCode.OK;
    Check(await prepared.PostValidatedAsync(id, body, CancellationToken.None)
        == DholeQuotePostOutcome.HttpAcceptedUnverified, "Fake 2xx only");
    Check(fake.Calls == before + 1, "One fake POST per scenario, no automatic retries");
    Check(fake.LastIdempotency == "cf-official-" + id.ToString("D"),
        "Separate deterministic idempotency per synthetic quote");
    Check(fake.LastBody == body.GetRawText(),
        "Fake receiver gets precisely the flat published adapter body");
}
Check(scenariosSeen.SetEquals(new[] { "FCL", "LCL", "AIR_LCL", "FTL", "LTL" }),
    "All five distinct quote modes verified");
Console.WriteLine("PASS: default-off and 5-mode JS-to-C# fake POST, fixed host/idempotency, locked defaults, no live network.");


sealed class FakePostFactory(HttpClient fake) : IHttpClientFactory
{
    public HttpClient CreateClient(string name)
    {
        if (name != "DholeQuotePost") throw new InvalidOperationException("Unknown client.");
        return fake;
    }
}
sealed class FakePostHandler : HttpMessageHandler
{
    public int Calls { get; private set; }
    public HttpStatusCode NextStatus { get; set; } = HttpStatusCode.OK;
    public HttpMethod? LastMethod { get; private set; }
    public string? LastUrl { get; private set; }
    public string? LastKey { get; private set; }
    public string? LastIdempotency { get; private set; }
    public string? LastContentType { get; private set; }
    public string? LastBody { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
    {
        Calls++;
        LastMethod = request.Method;
        LastUrl = request.RequestUri?.ToString();
        LastKey = request.Headers.GetValues("X-Api-Key").Single();
        LastIdempotency = request.Headers.GetValues("Idempotency-Key").Single();
        LastContentType = request.Content?.Headers.ContentType?.ToString();
        LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
        return new HttpResponseMessage(NextStatus)
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
    }
}
