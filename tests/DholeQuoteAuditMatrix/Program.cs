// Offline audit: no database, environment secrets, real catalogs or network.
// All UUIDs and applicants are synthetic. The only HttpClient has a fake handler.
using System.Net;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services;
using Microsoft.Extensions.Configuration;

static void Check(bool ok, string context)
{
    if (!ok) throw new InvalidOperationException("Matrix failed: " + context);
}
static Guid Id(int n) => Guid.Parse($"f9000000-0000-4000-8000-{n:D12}");

var serviceContract = new (string Name, string Code)[]
{
    ("Transporte internacional", "INT_TRANSPORT"),
    ("Agencia de Aduanas CR", "CUSTOMS_CR"),
    ("Agencia de Aduanas Exterior", "CUSTOMS_FOREIGN"),
    ("Almacenamiento", "STORAGE"),
    ("Control de inventario", "INVENTORY_CONTROL"),
    ("Embalaje", "PACKING"),
    ("Exoneración", "EXONERATION"),
    ("Picking Carga", "PICKING"),
    ("Recepción de carga", "RECEPTION"),
    ("Seguro de carga", "CARGO_INSURANCE"),
    ("Transporte entrega", "DELIVERY"),
    ("Transporte recolección", "PICKUP")
};
var modes = new (string Mode, string Shipment, string Wire)[]
{
    ("Maritime", "FCL", "Fcl"), ("Maritime", "LCL", "Lcl"),
    ("Air", "AIR_LCL", "Air"), ("Land", "FTL", "Ftl"), ("Land", "LTL", "Ltl")
};
string[] incoterms = ["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"];
string[] currencies = ["USD", "CRC", "EUR"];
string[] unitTypes = ["Box", "Pallet", "Loose", "Other"];
string[] weights = ["kg", "lb"];
string[] dimensions = ["cm", "m", "in"];
var now = new DateTime(2026, 11, 25, 18, 0, 0, DateTimeKind.Utc);
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
int count = 0;
JsonElement sample = default;

// Exhaust each nonempty service subset for each mode. Rotate other factors;
// this is not the full Cartesian product, nor proof of live Pricing acceptance.
foreach (var (mode, shipment, wire) in modes)
{
    for (int mask = 1; mask < (1 << serviceContract.Length); mask++)
    {
        var selected = serviceContract.Select((s, i) => (s.Name, s.Code, Index: i))
            .Where(s => (mask & (1 << s.Index)) != 0).ToArray();
        var names = selected.Select(s => s.Name).ToList();
        bool maritime = mode == "Maritime";
        bool full = shipment is "FCL" or "FTL";
        bool insurance = names.Contains("Seguro de carga");
        string incoterm = incoterms[(mask - 1) % incoterms.Length];
        bool exw = incoterm == "EXW";
        string currency = currencies[(mask - 1) % currencies.Length];
        string unit = unitTypes[(mask - 1) % unitTypes.Length];
        string weightUnit = weights[(mask / 4) % weights.Length];
        string dimensionUnit = dimensions[(mask / 8) % dimensions.Length];
        bool stackable = mask % 2 == 0;
        bool dangerous = (mask & 4) != 0;
        bool overweight = (mask & 8) != 0;
        const decimal lineWeight = 123.456m;
        const int quantity = 3;
        decimal expectedKg = full ? 2400m : lineWeight * (weightUnit == "lb" ? 0.45359237m : 1m);
        decimal expectedCm = 12.5m * (dimensionUnit == "m" ? 100m : dimensionUnit == "in" ? 2.54m : 1m);
        var size = shipment == "FTL" ? "48 pies" : "40 pies";
        var type = shipment == "FTL" ? "Furgón seco" : "Dry Van";
        var flags = new List<string>();
        if (dangerous) flags.Add("Carga peligrosa");
        if (overweight) flags.Add("Sobrepeso");
        if (!full && !stackable) flags.Add("No estibable");
        var input = new OfficialQuoteSubmit(
            Mode: mode, ShipmentType: shipment, OriginLocationId: Id(1),
            DestinationLocationId: Id(2), PodLocationId: maritime ? Id(3) : null,
            ContactName: "Persona ficticia", ContactEmail: "audit@example.invalid",
            ContactPhone: "+506 0000-0000", Incoterm: incoterm,
            CargoReadyDate: new DateOnly(2026, 12, 18), Services: names,
            Equipment: full ? [new(size, type, 2, [1100m, 1300m])] : [],
            Packages: full ? [] : [new("Línea ficticia", quantity, lineWeight,
                12.5m, 12.5m, 12.5m, stackable ? "Stackable" : "NonStackable", unit)],
            DimensionUnit: full ? null : dimensionUnit, WeightUnit: full ? null : weightUnit,
            ExwCargoStatus: exw ? (stackable ? "fiscal" : "nationalized") : null,
            ExwPickupAddress: exw ? "Origen EXW ficticio" : null,
            CargoDescription: "Mercancía ficticia", CabysCode: "1234567890000",
            CargoValue: insurance ? 1500m : null, DeclaredWeight: 100m, DeclaredPackages: 4,
            Observations: "Observación original ficticia", CargoFlags: flags,
            DestinationHandling: "Manejo ficticio",
            DeliveryAddress: names.Contains("Transporte entrega") ? "Entrega ficticia" : null,
            PickupAddress: names.Contains("Transporte recolección") ? "Recolección ficticia" : null,
            FiscalStorageDays: names.Contains("Almacenamiento") ? 7 : null,
            CatalogSource: "dhole", CargoCurrencyCode: insurance ? currency : null);
        var route = new DholeValidatedRoute("Origen ficticio", "POE ficticio",
            maritime ? "POD ficticio" : null);
        var resolved = new DholeOfficialCatalogResolution(now, Id(200 + Array.IndexOf(incoterms, incoterm)),
            incoterm, selected.Select(s => new DholeOfficialServiceResolution(s.Name, s.Code,
                Id(100 + s.Index), true)).ToArray(),
            full ? [new(wire, size, type, Id(300), size + " " + type,
                shipment == "FTL" ? "48_DRY_VAN" : "40_DRY_VAN", true,
                shipment == "FTL" ? Id(301) : null)] : []);
        string context = shipment + "/mask=" + mask;
        // Round-trip the actual typed form, as the persisted JSON is later deserialized.
        var restored = JsonSerializer.Deserialize<OfficialQuoteSubmit>(
            JsonSerializer.Serialize(input, json), json)!;
        var draft = DholeOfficialQuoteDraftBuilder.Project(restored, Id(9), route);
        var review = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(draft, resolved, now,
            manualCommercialReview: true);
        var body = review.Body;
        Check(review.ReadyForContractReview && !review.RemoteSubmissionPermitted, context + "/review");
        Check(DholeQuotePostTransport.IsValidFlatBody(body), context + "/transport validation");
        Check(body.GetProperty("shipmentMode").GetString() == wire &&
            body.GetProperty("form_modality").GetString() == mode &&
            body.GetProperty("form_incotermId").GetString() == resolved.IncotermId.ToString("D") &&
            body.GetProperty("form_originId").GetString() == Id(1).ToString("D") &&
            body.GetProperty("poeId").GetString() == Id(2).ToString("D"), context + "/route and mode");
        Check(body.TryGetProperty("podId", out var pod) == maritime &&
            (!maritime || pod.GetString() == Id(3).ToString("D")), context + "/POD");
        Check(body.GetProperty("form_serviceIds").EnumerateArray().Select(x => x.GetString())
            .SequenceEqual(selected.Select(s => Id(100 + s.Index).ToString("D"))), context + "/services");
        Check(body.GetProperty("form_cargoWeightKg").GetDecimal() == expectedKg, context + "/total weight");
        Check(body.GetProperty("form_nonStackable").GetBoolean() == (!full && !stackable), context + "/stackability");
        Check(body.TryGetProperty("form_dangerousCargo", out var danger) == dangerous &&
            (!dangerous || danger.GetBoolean()), context + "/danger flag");
        Check(body.TryGetProperty("form_overweight", out var over) == overweight &&
            (!overweight || over.GetBoolean()), context + "/overweight flag");
        Check(body.TryGetProperty("form_storageDays", out var days) == names.Contains("Almacenamiento") &&
            (!names.Contains("Almacenamiento") || days.GetInt32() == 7), context + "/storage");
        Check(body.TryGetProperty("form_inlandDeliveryLocation_address", out var delivery) == names.Contains("Transporte entrega") &&
            (!names.Contains("Transporte entrega") || delivery.GetString() == "Entrega ficticia"), context + "/delivery");
        Check(body.TryGetProperty("form_pickupAddress", out var pickup) == (exw || names.Contains("Transporte recolección")) &&
            (!(exw || names.Contains("Transporte recolección")) ||
                pickup.GetString() == (names.Contains("Transporte recolección") ? "Recolección ficticia" : "Origen EXW ficticio")), context + "/pickup");
        Check(body.TryGetProperty("form_cargoCondition", out var condition) == exw &&
            (!exw || condition.GetString() == (stackable ? "FiscalCargo" : "NationalizedCargo")), context + "/EXW");
        var notes = body.GetProperty("form_cargoObservations").GetString()!;
        Check(notes.StartsWith("Observación original ficticia", StringComparison.Ordinal) &&
            notes.Contains("Manejo ficticio") && notes.Contains("Peso declarado adicional") &&
            notes.Contains("Bultos declarados adicionales") &&
            (!insurance || notes.Contains("1500 " + currency)) &&
            (!exw || !names.Contains("Transporte recolección") || notes.Contains("Origen EXW ficticio")) &&
            !body.TryGetProperty("form_currencyId", out _) && !body.TryGetProperty("form_cargoValue", out _),
            context + "/commercial facts without invented monetary mapping");
        Check(body.GetProperty("form_cargoDescription").GetString()!.Contains("audit@example.invalid") &&
            body.GetProperty("form_cabysCode").GetString() == "1234567890000", context + "/contact and CABYS");
        if (!full)
        {
            var line = body.GetProperty("sellerContext_consolidatedCargoLines")[0];
            Check(line.GetProperty("quantity").GetInt32() == quantity &&
                line.GetProperty("unitType").GetString() == unit &&
                line.GetProperty("isStackable").GetBoolean() == stackable &&
                Math.Abs(line.GetProperty("weightKg").GetDecimal() * quantity - expectedKg) <= 0.00001m &&
                line.GetProperty("length").GetDecimal() == expectedCm &&
                line.GetProperty("width").GetDecimal() == expectedCm &&
                line.GetProperty("height").GetDecimal() == expectedCm, context + "/cargo line");
        }
        else
        {
            var equipment = body.GetProperty(shipment == "FCL" ? "form_fclContainers" : "form_landContainers")[0];
            Check(equipment.GetProperty("containerTypeId").GetString() == Id(300).ToString("D") &&
                equipment.GetProperty("quantity").GetInt32() == 2 &&
                equipment.GetProperty("unitWeightsKg")[0].GetDecimal() == 1100m &&
                equipment.GetProperty("unitWeightsKg")[1].GetDecimal() == 1300m, context + "/equipment");
        }
        // Exercise the observation budget with all optional notes, distinct
        // EXW and ordinary pickup addresses, and non-ASCII applicant text.
        // All modes get the same stress case, with no additional network calls.
        if (mask == 4095)
        {
            const string prefix = "La peligrosidad de la carga está pendiente de confirmar.\n";
            var originalNotes = prefix + new string('á', 4000);
            var exwAddress = new string('é', 800);
            var pickupAddress = new string('ñ', 800);
            var handling = new string('ó', 100);
            var stressed = input with
            {
                Incoterm = "EXW", ExwCargoStatus = "nationalized", ExwPickupAddress = exwAddress,
                PickupAddress = pickupAddress, DeliveryAddress = new string('ú', 800),
                Observations = originalNotes, DestinationHandling = handling,
                CargoValue = 1000000000000m, CargoCurrencyCode = "EUR",
                DeclaredWeight = 1000000000m, DeclaredPackages = int.MaxValue,
                CargoDescription = new string('í', 3000)
            };
            var roundTrip = JsonSerializer.Deserialize<OfficialQuoteSubmit>(
                JsonSerializer.Serialize(stressed, json), json)!;
            var stressedDraft = DholeOfficialQuoteDraftBuilder.Project(roundTrip, Id(9), route);
            var stressedReview = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(stressedDraft,
                resolved with { IncotermValue = "EXW", IncotermId = Id(200) }, now,
                manualCommercialReview: true);
            var stressedBody = stressedReview.Body;
            var stressedNotes = stressedBody.GetProperty("form_cargoObservations").GetString()!;
            Check(stressedReview.ReadyForContractReview &&
                DholeQuotePostTransport.IsValidFlatBody(stressedBody),
                context + "/max observations valid at final transport");
            Check(stressedNotes.StartsWith(originalNotes, StringComparison.Ordinal) &&
                stressedNotes.Contains(exwAddress) && stressedNotes.Contains(handling) &&
                stressedNotes.Contains("1000000000000 EUR") &&
                stressedNotes.Contains("2147483647") && stressedNotes.Length <= 6000 &&
                stressedBody.GetProperty("form_pickupAddress").GetString() == pickupAddress &&
                stressedBody.GetProperty("form_cargoDescription").GetString()!.StartsWith(stressed.CargoDescription!, StringComparison.Ordinal),
                context + "/max observations and Unicode preserved without truncation");
            Check(System.Text.Encoding.UTF8.GetByteCount(stressedBody.GetRawText()) <= 128 * 1024,
                context + "/max notes fit local transport byte budget");
        }
        sample = body;
        count++;
    }
}
Check(count == 20475, "expected five modes x 4095 service subsets");
Console.WriteLine($"PASS: {count} synthetic service/mode projections, with rotated conditional fields, units and incoterms; no HTTP.");
Console.WriteLine("PASS: 5 maximum observation stress cases with Unicode, EXW and all commercial notes.");

// Exercise actual transport on simulated replies, never a socket.
var fake = new AuditHandler();
using var http = new HttpClient(fake);
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>
{
    ["DholeSubmission:PostEnabled"] = "true",
    ["DholeSubmission:ApiKey"] = "dh_ext_" + new string('a', 64)
}).Build();
var transport = new DholeQuotePostTransport(config, new AuditFactory(http));
var receiptId = Id(99);
string validReceipt = JsonSerializer.Serialize(new { value = receiptId });
var replies = new (HttpStatusCode Status, string Body, DholeQuotePostOutcome Outcome, Guid? Reference)[]
{
    (HttpStatusCode.OK, validReceipt, DholeQuotePostOutcome.HttpAcceptedUnverified, receiptId),
    (HttpStatusCode.OK, "", DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.OK, "not-json", DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.OK, "{}", DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.OK, "{\"value\":\"bad\"}", DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.OK, "{\"value\":\"00000000-0000-0000-0000-000000000000\"}", DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.OK, JsonSerializer.Serialize(new {value = receiptId, unexpected = true}), DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.Created, validReceipt, DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.Accepted, validReceipt, DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.NoContent, "", DholeQuotePostOutcome.HttpAcceptedUnverified, null),
    (HttpStatusCode.OK, new string('x', 65537), DholeQuotePostOutcome.Unconfirmed, null),
    (HttpStatusCode.Conflict, "{}", DholeQuotePostOutcome.Unconfirmed, null),
    (HttpStatusCode.RequestTimeout, "{}", DholeQuotePostOutcome.Unconfirmed, null),
    (HttpStatusCode.TooManyRequests, "{}", DholeQuotePostOutcome.Unconfirmed, null),
    (HttpStatusCode.BadGateway, "{}", DholeQuotePostOutcome.Unconfirmed, null),
    (HttpStatusCode.BadRequest, "{}", DholeQuotePostOutcome.Rejected, null),
    (HttpStatusCode.Unauthorized, "{}", DholeQuotePostOutcome.Rejected, null),
    (HttpStatusCode.Forbidden, "{}", DholeQuotePostOutcome.Rejected, null)
};
foreach (var reply in replies)
{
    fake.Status = reply.Status;
    fake.Body = reply.Body;
    int before = fake.Calls;
    var actual = await transport.PostWithReceiptAsync(Id(9), sample, CancellationToken.None);
    Check(actual.Outcome == reply.Outcome && actual.ProviderReferenceCandidate == reply.Reference,
        "mock HTTP " + reply.Status);
    Check(fake.Calls == before + 1, "one simulated POST; no internal retry");
}
fake.Throw = true;
int previous = fake.Calls;
var unknown = await transport.PostWithReceiptAsync(Id(9), sample, CancellationToken.None);
Check(unknown.Outcome == DholeQuotePostOutcome.Unconfirmed &&
    unknown.ProviderReferenceCandidate == null && fake.Calls == previous + 1, "simulated disconnect");
Console.WriteLine($"PASS: {replies.Length + 1} simulated response cases, no real HTTP.");

sealed class AuditFactory(HttpClient http) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) =>
        name == "DholeQuotePost" ? http : throw new InvalidOperationException("Unexpected client");
}

sealed class AuditHandler : HttpMessageHandler
{
    public int Calls { get; private set; }
    public HttpStatusCode Status { get; set; }
    public string Body { get; set; } = "";
    public bool Throw { get; set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Calls++;
        if (Throw) throw new HttpRequestException("Synthetic disconnect");
        return Task.FromResult(new HttpResponseMessage(Status) { Content = new StringContent(Body) });
    }
}
