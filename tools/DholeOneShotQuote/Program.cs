// Standalone manual CLI. No ASP.NET endpoint, scheduler or Docker integration.
// The reviewed artifact is NEVER sendable without an independent future approval.
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.Extensions.Configuration;

static bool TextIs(JsonElement obj, string key, string value) =>
    obj.TryGetProperty(key, out var x) && x.ValueKind == JsonValueKind.String &&
    x.GetString() == value;
static bool BooleanIs(JsonElement obj, string key, bool value) =>
    obj.TryGetProperty(key, out var x) && (x.ValueKind is JsonValueKind.True or JsonValueKind.False) &&
    x.GetBoolean() == value;
static Guid Id(JsonElement obj, string key) =>
    obj.TryGetProperty(key, out var x) && x.ValueKind == JsonValueKind.String &&
    Guid.TryParse(x.GetString(), out var id) && id != Guid.Empty
        ? id : throw new InvalidDataException("Invalid ID");
static byte[] LocalFile(string path)
{
    using var f = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
    if (f.Length < 1 || f.Length > 160_000) throw new InvalidDataException("Invalid file size");
    using var mem = new MemoryStream();
    f.CopyTo(mem);
    return mem.ToArray();
}
static bool Fresh(JsonElement obj, string field, DateTimeOffset now)
{
    if (!obj.TryGetProperty(field, out var x) || x.ValueKind != JsonValueKind.String ||
        !DateTimeOffset.TryParse(x.GetString(), out var date) || date.Offset != TimeSpan.Zero)
        return false;
    var age = now - date;
    return age >= TimeSpan.Zero && age <= TimeSpan.FromMinutes(5);
}
static bool IsReviewedLcl(JsonElement root, out JsonElement body)
{
    body = default;
    if (!TextIs(root, "provenance", "MANUAL_CONFIG_SNAPSHOT_NOT_RUNTIME_VERIFIED") ||
        !TextIs(root, "applicant", "ENTIRELY_FICTIONAL") ||
        !TextIs(root, "authorization", "SIMULATED_FOR_OFFLINE_REVIEW") ||
        !BooleanIs(root, "remoteSubmissionPermitted", false) ||
        !BooleanIs(root, "readyForSending", false) ||
        !BooleanIs(root, "noTransport", true) ||
        !root.TryGetProperty("publishedFlatBody", out body) ||
        body.ValueKind != JsonValueKind.Object ||
        !TextIs(body, "shipmentMode", "Lcl") ||
        !TextIs(body, "form_shipmentMode", "Lcl") ||
        !TextIs(body, "form_modality", "Maritime") ||
        !TextIs(body, "form_rateType", "Spot") ||
        !TextIs(body, "priority", "Green") ||
        !TextIs(body, "originName", "Shanghai, China") ||
        !TextIs(body, "destinationName", "Limón/Moin, Costa Rica") ||
        !TextIs(body, "poeName", "Limón/Moin, Costa Rica") ||
        !TextIs(body, "podName", "Moin, Costa Rica") ||
        !TextIs(body, "requestContext_incotermName", "CIF"))
        return false;
    var pol = Id(body, "form_originId");
    var poe = Id(body, "form_destinationId");
    var pod = Id(body, "form_podId");
    var cif = Id(body, "form_incotermId");
    if (Id(body, "poeId") != poe || Id(body, "podId") != pod ||
        Id(body, "requestContext_poeId") != poe ||
        Id(body, "requestContext_podId") != pod ||
        !body.TryGetProperty("form_serviceIds", out var services) ||
        services.ValueKind != JsonValueKind.Array || services.GetArrayLength() != 1 ||
        services[0].ValueKind != JsonValueKind.String ||
        !Guid.TryParse(services[0].GetString(), out var service) || service == Guid.Empty ||
        new HashSet<Guid> { pol, poe, pod, cif, service }.Count != 5)
        return false;
    if (!body.TryGetProperty("form_cargoDescription", out var desc) ||
        desc.ValueKind != JsonValueKind.String ||
        !desc.GetString()!.Contains("Nombre: Persona de Prueba", StringComparison.Ordinal) ||
        !desc.GetString()!.Contains("Correo: prueba@example.invalid", StringComparison.Ordinal) ||
        !desc.GetString()!.Contains("Teléfono: +506 0000-0000", StringComparison.Ordinal) ||
        !body.TryGetProperty("form_cargoPackages", out var packages) ||
        packages.ValueKind != JsonValueKind.Number || packages.GetInt32() != 3 ||
        !body.TryGetProperty("form_cargoWeightKg", out var weight) ||
        weight.ValueKind != JsonValueKind.Number || weight.GetDecimal() != 10 ||
        // Do not permit unqualified commercial value/currency in this manual scenario.
        body.TryGetProperty("form_cargoValue", out _) ||
        body.TryGetProperty("form_currencyId", out _) ||
        body.TryGetProperty("form_fclContainers", out _) ||
        body.TryGetProperty("form_landContainers", out _))
        return false;
    foreach (var key in new[] { "clientName", "executiveName", "sellerUserId",
        "contactName", "contactEmail", "contactPhone", "payload" })
        if (body.TryGetProperty(key, out _)) return false;
    return true;
}
try
{
    if (!((args.Length == 2 && args[0] == "preview") ||
          (args.Length == 3 && args[0] == "send")))
    {
        Console.Error.WriteLine("Usage: preview <local-review.json> | send <local-review.json> <local-approval.json>");
        return 64;
    }
    using var review = JsonDocument.Parse(LocalFile(args[1]));
    if (!IsReviewedLcl(review.RootElement, out var body))
    {
        Console.Error.WriteLine("BLOCKED: invalid or non-fictional LCL review.");
        return 65;
    }
    var digest = Convert.ToHexStringLower(SHA256.HashData(
        Encoding.UTF8.GetBytes(body.GetRawText())));
    if (args[0] == "preview")
    {
        Console.WriteLine("PASS: LCL reviewed locally. Zero HTTP. Review only.");
        Console.WriteLine("Payload SHA-256: " + digest);
        return 0;
    }
    // The original dry-run payload literally says NO ENVIAR. Never promote
    // that artifact into a live request by just adding a key or CLI argument.
    if (!TextIs(body, "form_cargoObservations",
        "PRUEBA CONTROLADA AUTORIZADA. DATOS FICTICIOS."))
    {
        Console.Error.WriteLine("BLOCKED: current preview is marked NO ENVIAR.");
        return 65;
    }
    using var approval = JsonDocument.Parse(LocalFile(args[2]));
    var auth = approval.RootElement;
    var now = DateTimeOffset.UtcNow;
    if (!TextIs(auth, "scope", "PR274_ONE_QUOTE_LCL_OFFICIAL_DHOLE") ||
        !TextIs(auth, "purpose", "CONTROLLED_TEST_WITH_FICTIONAL_CONTACT") ||
        !TextIs(auth, "payloadSha256", digest) ||
        !BooleanIs(auth, "operatorApproved", true) ||
        !Fresh(auth, "catalogsVerifiedAtUtc", now) ||
        !Fresh(auth, "approvedAtUtc", now))
    {
        Console.Error.WriteLine("BLOCKED: recent, scoped and payload-bound authorization required.");
        return 65;
    }
    var quoteId = Id(auth, "quoteId");
    // A future live approval MUST use the same new quote ID as the payload's
    // idempotency identity; never reuse the fixed offline test quote reference.
    // This prevents accidentally sending a reviewed body under a different ID.
    if (quoteId == Guid.Parse("a1111111-1111-4111-8111-111111111112") ||
        !TextIs(review.RootElement, "idempotencyKey", "cf-official-" + quoteId.ToString("D")))
    {
        Console.Error.WriteLine("BLOCKED: approval and payload idempotency identities do not match.");
        return 65;
    }
    if (Console.IsInputRedirected)
    {
        Console.Error.WriteLine("BLOCKED: interactive operator console required.");
        return 65;
    }
    var secret = Environment.GetEnvironmentVariable("DHOLE_ONE_SHOT_API_KEY");
    if (string.IsNullOrWhiteSpace(secret))
    {
        Console.Error.WriteLine("BLOCKED: private one-shot API key missing.");
        return 65;
    }
    Console.WriteLine("WARNING: one REAL POST can create a fictitious quote in OFFICIAL Dhole.");
    Console.Write("Type exactly CONFIRMO UN POST REAL A DHOLE : ");
    if (Console.ReadLine() != "CONFIRMO UN POST REAL A DHOLE")
    {
        Console.Error.WriteLine("BLOCKED: operator declined.");
        return 65;
    }
    // Single-attempt record per QUOTE ID within this local approval directory,
    // not merely per approval filename (which can be copied under a new name).
    // Never auto-retry after timeout, 429 or 5xx: creation can be unconfirmed.
    var approvalDirectory = Path.GetDirectoryName(Path.GetFullPath(args[2]))!;
    var marker = Path.Combine(approvalDirectory, ".dhole-one-shot-" +
        quoteId.ToString("N") + ".attempted");
    using (var once = new FileStream(marker, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        once.Write(Encoding.UTF8.GetBytes("ONE_ATTEMPT_RESERVED\n"));

    var settings = new ConfigurationBuilder().AddInMemoryCollection(
        new Dictionary<string, string?>
        {
            ["DholeSubmission:PostEnabled"] = "true",
            ["DholeSubmission:ApiKey"] = secret
        }).Build();
    using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false };
    using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(12) };
    var transport = new DholeQuotePostTransport(settings, new OneShotClientFactory(http));
    var result = await transport.PostValidatedAsync(quoteId, body, CancellationToken.None);
    Console.WriteLine("One attempt result: " + result);
    Console.WriteLine("Check manually in Pricing. Never retry using this approval.");
    return result == DholeQuotePostOutcome.HttpAcceptedUnverified ? 0 : 75;
}
catch (Exception ex) when (ex is IOException or InvalidDataException or
    JsonException or ArgumentException or InvalidOperationException or
    UnauthorizedAccessException or FormatException)
{
    Console.Error.WriteLine("BLOCKED: invalid, inaccessible or already attempted input.");
    return 65;
}

sealed class OneShotClientFactory(HttpClient client) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) =>
        name == "DholeQuotePost" ? client : throw new InvalidOperationException();
}
