using System.IO;
using System.Net;
using CastroFallas.MiniQuote.Api.Models;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using CastroFallas.MiniQuote.Api.Services;

static void Check(bool condition, string name)
{
    if (!condition) throw new Exception("FAILED: " + name);
}

static void MustFail(string input, string name)
{
    try
    {
        DholeCatalogNormalizer.Parse(input);
    }
    catch (InvalidDataException)
    {
        return;
    }

    throw new Exception("FAILED (expected InvalidDataException): " + name);
}

const string input = """
[
  {
    "id": "d3a43858-7ade-419c-a108-af5203bf0f2e",
    "name": "San José, Costa Rica",
    "value": "San José, Costa Rica",
    "code": "POL-2026-117",
    "isActive": true,
    "sortOrder": 12,
    "routeRole": "pol",
    "transportMode": null,
    "terminalType": null,
    "metadata": {
      "routeRole": "pol",
      "TransportMode": "Maritime",
      "TerminalType": "CY",
      "CountryCode": "SV"
    }
  },
  {
    "id": "8ebb78e5-6a9c-47c0-9a31-ddbb057540c6",
    "name": "Moin, Costa Rica",
    "value": "Moin, Costa Rica",
    "isActive": true,
    "sortOrder": 7,
    "transportMode": "Maritime",
    "terminalType": "SD",
    "routeRole": "POL",
    "metadata": { "terminalType": "SD", "transportMode": "Maritime", "routeRole": "POL" }
  },
  {
    "id": "c1100000-0000-4000-8000-000000000040",
    "code": "40",
    "name": "40 pies",
    "value": "40",
    "isActive": false
  },
  {
    "id": "c1300000-0000-4000-8000-000000000003",
    "code": "40HC",
    "name": "40 High Cube",
    "value": "40HC",
    "sortOrder": 20,
    "metadataJson": "{\"kind\":\"high-cube\",\"size\":\"40\",\"modalities\":[\"Maritime\",\"Multimodal\"],\"shipmentModes\":[\"FCL\"]}"
  }
]
""";

var values = DholeCatalogNormalizer.Parse(input);
Check(values.Length == 3, "Exclude only isActive false");
Check(values[0].Name == "Moin, Costa Rica", "Sort by sortOrder");
Check(values[0].TerminalType == "SD" && values[0].TransportMode == "Maritime",
    "Do not reject genuine Maritime/SD variant");
Check(values[1].RouteRole == "POL" && values[1].TransportMode == "Maritime" &&
      values[1].TerminalType == "CY" && values[1].CountryCode == "SV",
    "Normalize mixed metadata casing without guessing country");
Check(values[2].Size == "40" && values[2].Kind == "high-cube" &&
      values[2].Modalities.SequenceEqual(["Maritime", "Multimodal"]) &&
      values[2].ShipmentModes.SequenceEqual(["FCL"]),
    "Parse metadataJson fallback and preserve equipment compatibility");
Check(values[2].IsActive is null, "Missing isActive is not automatically inactive");

var wrapped = DholeCatalogNormalizer.Parse("""
{ "value": [
  { "id": "c2150000-0000-4000-8000-000000000001",
    "name": "24 pies / 5 TON", "value": "24", "metadata": {
      "feet": 24, "capacityTons": 5, "modality": "Land"
    }}
]}
""");
Check(wrapped.Length == 1 && wrapped[0].Feet == 24 &&
      wrapped[0].CapacityTons == 5, "Object envelope and truck metadata");

MustFail("{}", "Reject missing array");
MustFail("""
[{ "id": "not-a-uuid", "name": "Bogus", "value": "Bogus" }]
""", "Reject invalid UUID");
MustFail("""
[
 { "id": "c2150000-0000-4000-8000-000000000001", "name": "First", "value": "A" },
 { "id": "c2150000-0000-4000-8000-000000000001", "name": "Second", "value": "B" }
]
""", "Reject duplicate UUID");
MustFail("""
[
 { "id": "c2150000-0000-4000-8000-000000000001", "name": "Mismatch", "value": "Mismatch",
   "routeRole": "POL", "metadata": { "routeRole": "POD" } }
]
""", "Reject contradictory direct and nested metadata");

Console.WriteLine("OK: Dhole catalogue normalization, metadata casing, inactive filtering, compatibility, IDs and conflicts.");

// Phase 2: projection is read-only, and Dhole external IDs are deliberately
// kept distinct from the existing OfficialQuoteLocation.Id in PostgreSQL.
var poeItems = DholeCatalogNormalizer.Parse("""
[
 { "id": "25882b97-8df9-407f-8300-8994184dfad1", "name": "Acajutla", "value": "Acajutla", "transportMode": "Maritime", "terminalType": "CY", "routeRole": "POE" },
 { "id": "ba756355-c729-4414-9ddc-c9b7bf1e34b8", "name": "Abidjan", "value": "Abidjan", "transportMode": "Air", "terminalType": "APT", "routeRole": "POE" },
 { "id": "c2610000-0000-4000-8000-000000000003", "name": "Guatemala", "value": "Guatemala", "transportMode": "Land", "terminalType": "SD", "routeRole": "POE" },
 { "id": "13d76d33-1d5d-4bba-a95f-0845aa7cab70", "name": "Puerto Cortes", "value": "Puerto Cortes", "transportMode": "Maritime", "terminalType": "CY" },
 { "id": "27eb3622-4725-4705-a76f-8f4a8fa934ad", "name": "Contradictory", "value": "Contradictory", "transportMode": "Maritime", "terminalType": "CY", "routeRole": "POL" },
 { "id": "d43f9a0e-3fed-449d-bea0-067c9a2c30c4", "name": "Missing classification", "value": "Missing classification" },
 { "id": "150b6051-b099-4211-a2c8-b7ad85b51898", "name": "Unsupported maritime airport", "value": "Unsupported maritime airport", "transportMode": "Maritime", "terminalType": "APT" }
]
""");
var maritimeDest = DholeQuoteLocationProjector.Project("destination", "Maritime", poeItems);
Check(maritimeDest.Options.Length == 2 &&
      maritimeDest.Options.Any(x => x.Name == "Puerto Cortes") &&
      maritimeDest.Options.All(x => x.Catalog == "poe" && x.Role == "destination"),
    "POE maritime includes correctly typed entries even when routeRole is absent");
Check(maritimeDest.Issues.Select(x => x.Reason).OrderBy(x => x).SequenceEqual(
    new[] { "conflicting_route_role", "missing_mode_or_terminal", "unreviewed_mode_terminal_combination" }),
    "POE leaves unknown and contradictory records for review without guessing");
Check(DholeQuoteLocationProjector.Project("destination", "Air", poeItems).Options.Single().Name == "Abidjan",
    "POE aerial accepts only Air/APT");
Check(DholeQuoteLocationProjector.Project("destination", "Land", poeItems).Options.Single().Name == "Guatemala",
    "POE ground accepts only Land/SD");

var polItems = DholeCatalogNormalizer.Parse("""
[
 { "id": "19a5ce22-340d-579f-ad27-f6517a2dde27", "name": "Acajutla", "value": "Acajutla", "transportMode": "Maritime", "terminalType": "CY", "routeRole": "POL" },
 { "id": "8ebb78e5-6a9c-47c0-9a31-ddbb057540c6", "name": "Moin", "value": "Moin", "transportMode": "Maritime", "terminalType": "SD", "routeRole": "POL" },
 { "id": "d3a43858-7ade-419c-a108-af5203bf0f2e", "name": "San José", "value": "San José", "routeRole": "pol", "metadata": { "TransportMode": "Maritime", "TerminalType": "CY", "CountryCode": "SV" } },
 { "id": "24a938cf-7fe9-4e34-a774-d26475760270", "name": "San José", "value": "San José", "transportMode": "Maritime", "terminalType": "CY", "routeRole": "POL" }
]
""");
var origins = DholeQuoteLocationProjector.Project("origin", "Maritime", polItems);
Check(origins.Options.Length == 4 && origins.Options.Select(x => x.ExternalId).Distinct().Count() == 4,
    "Identical display names do not merge external UUID identities");
Check(origins.Options.Any(x => x.Name == "Moin" && x.TerminalType == "SD"),
    "Previously verified Maritime/SD POL remains eligible");
Check(origins.Options.Any(x => x.ExternalId == "d3a43858-7ade-419c-a108-af5203bf0f2e"),
    "PascalCase metadata and lower-case POL role can be projected");
Check(origins.Options.Any(x => x.ExternalId == "19a5ce22-340d-579f-ad27-f6517a2dde27") &&
      maritimeDest.Options.Any(x => x.ExternalId == "25882b97-8df9-407f-8300-8994184dfad1"),
    "Same city can have different Dhole POL vs POE IDs, never map by name");

var podItems = DholeCatalogNormalizer.Parse("""
[
 { "id": "d43f9a0e-3fed-449d-bea0-067c9a2c30c4", "name": "Legacy POD", "value": "Legacy POD" },
 { "id": "c2610000-0000-4000-8000-000000000003", "name": "Land POD", "value": "Land POD", "transportMode": "Land", "terminalType": "SD", "routeRole": "POD" },
 { "id": "24a938cf-7fe9-4e34-a774-d26475760270", "name": "Invalid role", "value": "Invalid role", "routeRole": "POL" }
]
""");
var pods = DholeQuoteLocationProjector.Project("pod", "Maritime", podItems);
Check(pods.Options.Length == 3 && pods.Options.Any(x => x.Name == "Legacy POD") &&
      pods.Options.Any(x => x.Name == "Land POD") &&
      pods.Options.Any(x => x.Name == "Invalid role") &&
      pods.Issues.Single().Reason == "conflicting_route_role",
    "All active POD entries stay selectable regardless of modality or role anomalies");

try
{
    DholeQuoteLocationProjector.Project("pod", "Air", podItems);
    throw new Exception("FAILED: Non-maritime POD must be invalid");
}
catch (ArgumentException) { /* expected */ }

Console.WriteLine("OK: Dhole role projection, 3 modes, real POL exceptions, POD rule and identity isolation.");

var containerSizes = DholeCatalogNormalizer.Parse("""
[
 { "id": "c1100000-0000-4000-8000-000000000020", "name": "20 pies", "value": "20" },
 { "id": "c1100000-0000-4000-8000-000000000040", "name": "40 pies", "value": "40" },
 { "id": "c1100000-0000-4000-8000-000000000045", "name": "45 pies", "value": "45" },
 { "id": "c1100000-0000-4000-8000-000000000048", "name": "48 pies", "value": "48" }
]
""");
var containerTypes = DholeCatalogNormalizer.Parse("""
[
 { "id": "c1300000-0000-4000-8000-000000000003", "code": "40HC", "name": "40 High Cube", "value": "40HC",
   "metadata": { "size": "40", "kind": "high-cube", "modalities": ["Maritime", "Multimodal"], "shipmentModes": ["FCL"] } },
 { "id": "c1300000-0000-4000-8000-000000000004", "code": "45HC", "name": "45 High Cube", "value": "45HC",
   "metadata": { "size": "45", "kind": "high-cube", "modalities": ["Maritime", "Multimodal"], "shipmentModes": ["FCL"] } },
 { "id": "c1300000-0000-4000-8000-000000000005", "code": "48HC", "name": "48 High Cube", "value": "48HC",
   "metadata": { "size": "48", "kind": "high-cube", "modalities": ["Multimodal"], "shipmentModes": ["FCL"] } },
 { "id": "c1300000-0000-4000-8000-000000000006", "code": "45DV", "name": "45 Dry Van", "value": "45DV",
   "isActive": false, "metadata": { "size": "45", "kind": "dry-van", "modalities": ["Maritime"], "shipmentModes": ["FCL"] } },
 { "id": "c1300000-0000-4000-8000-000000000007", "code": "50HC", "name": "50 High Cube", "value": "50HC",
   "metadata": { "size": "50", "kind": "high-cube", "modalities": ["Maritime"], "shipmentModes": ["FCL"] } },
 { "id": "c2700000-0000-4000-8000-000000000006", "code": "LOOSE", "name": "Carga suelta", "value": "LOOSE",
   "metadata": { "modalities": ["Air"], "shipmentModes": ["LCL"] } }
]
""");
var truckSizes = DholeCatalogNormalizer.Parse("""
[
 { "id": "c2150000-0000-4000-8000-000000000001", "code": "24", "name": "24 pies / 5 TON", "value": "24", "metadata": { "feet": 24, "modality": "Land", "capacityTons": 5 } },
 { "id": "c2150000-0000-4000-8000-000000000002", "code": "26", "name": "26 pies / 7 TON", "value": "26", "metadata": { "feet": 26, "modality": "Land", "capacityTons": 7 } },
 { "id": "c2110000-0000-4000-8000-000000000048", "code": "48", "name": "48 pies", "value": "48", "metadata": { "feet": 48, "modality": "Land" } },
 { "id": "c2110000-0000-4000-8000-000000000053", "code": "53", "name": "53 pies", "value": "53", "metadata": { "feet": 53, "modality": "Land" } }
]
""");
var equipment = DholeEquipmentProjector.Project(containerSizes, containerTypes, truckSizes);
Check(equipment.FclCombinations.Length == 3 &&
      equipment.FclCombinations.Any(x => x.TypeCode == "45HC" && x.SizeName == "45 pies") &&
      !equipment.FclCombinations.Any(x => x.TypeCode == "45DV"),
      "Only valid, active FCL size/type combinations appear");
Check(equipment.FclCombinations.Any(x => x.TypeCode == "48HC" &&
      x.MultimodalOnly && x.TypeName == "High Cube"),
      "Multimodal-only 48HC remains selectable within Maritime FCL");
Check(equipment.RejectedTypeCodes.SequenceEqual(["50HC"]),
      "Orphan equipment sizes flagged instead of silently offered");
Check(equipment.FtlSizes.Select(x => x.Code).SequenceEqual(["24", "26", "48", "53"]) &&
      !equipment.FtlSizes.Any(x => x.Code == "40"),
      "Dhole dynamically replaces retired FTL 40 with active 48");
Check(equipment.FtlSizes[0].CapacityTons == 5 &&
      equipment.FtlSizes[2].CapacityTons is null,
      "Unknown truck tonnage must not be invented");

Console.WriteLine("OK: Dynamic FCL type/size validation, multimodal 48HC, ignored air LCL, current FTL sizes.");




// Offline security and availability simulation. The real Dhole API and actual
// API key are NEVER used here.
var fakeHandler = new FakeDholeHandler();
using var mockHttp = new HttpClient(fakeHandler)
{
    BaseAddress = new Uri("https://api.logisticacastrofallas.com/")
};
using var memory = new MemoryCache(new MemoryCacheOptions());
var mockConfig = new ConfigurationBuilder().AddInMemoryCollection(
    new Dictionary<string, string?>
    {
        ["DholeCatalogs:Enabled"] = "true",
        ["DholeCatalogs:ApiKey"] = "fictional-ci-only-key"
    }).Build();
var externalService = new DholeCatalogService(
    mockConfig, new FakeDholeHttpClientFactory(mockHttp), memory,
    NullLogger<DholeCatalogService>.Instance);

Check(externalService.IsConfigured, "Configured fake Dhole catalogue client enabled");
var original = await externalService.GetAsync("truck-sizes", CancellationToken.None);
Check(!original.Stale && original.Items.Length == 1 &&
      original.Items.Single().Name == "48 pies",
    "Successful GET parses fake Dhole data");
var cachedRead = await externalService.GetAsync("truck-sizes", CancellationToken.None);
Check(!cachedRead.Stale && fakeHandler.Calls == 1,
    "Fresh cache prevents duplicate external GET");

memory.Remove("dhole-catalog:fresh:truck-sizes");
fakeHandler.Fail = true;
var fallback = await externalService.GetAsync("truck-sizes", CancellationToken.None);
Check(fallback.Stale && fallback.Items.Single().Name == "48 pies" &&
      fakeHandler.Calls == 2,
    "Upstream 503 uses the last valid cached response and sets stale flag");
var retryThrottled = await externalService.GetAsync("truck-sizes", CancellationToken.None);
Check(retryThrottled.Stale && fakeHandler.Calls == 2,
    "Backoff prevents bursts when the upstream keeps failing");

var notConfigured = new DholeCatalogService(
    new ConfigurationBuilder().Build(), new FakeDholeHttpClientFactory(mockHttp), memory,
    NullLogger<DholeCatalogService>.Instance);
Check(!notConfigured.IsConfigured, "Dhole GET disabled without explicit opt-in and key");

Console.WriteLine("OK: Fake upstream GET-only client, header, cache, upstream failure, stale fallback and throttle.");


// A new official quote may use only UUIDs from the expected Dhole role/mode,
// and its equipment must be one actually published combination.
var officialIncotermItems = DholeCatalogNormalizer.Parse("""
[
 { "id": "11111111-1111-4111-8111-111111111111", "name": "FOB", "value": "FOB" },
 { "id": "22222222-2222-4222-8222-222222222222", "name": "CIF", "value": "CIF" },
 { "id": "33333333-3333-4333-8333-333333333333", "name": "EXW", "value": "EXW", "isActive": false }
]
""");
var formCatalog = DholeQuoteFormCatalogBuilder.Build(
    "Maritime", "FCL", officialIncotermItems, polItems, poeItems, podItems,
    containerSizes, containerTypes, truckSizes);
Check(formCatalog.Incoterms.OrderBy(x => x, StringComparer.Ordinal).SequenceEqual(["CIF", "FOB"]), "Dynamic Incoterms exclude inactive entries regardless of sort order");
Check(formCatalog.EquipmentTypesBySize["45 pies"].SequenceEqual(["High Cube"]) &&
      formCatalog.EquipmentTypesBySize["48 pies"].SequenceEqual(["High Cube"]),
      "FCL 45/48 sizes offer only real high cube combinations");
Check(formCatalog.Pods.Any(x => x.DisplayName == "Land POD"), "POD allows Land metadata by business policy");

static OfficialQuoteSubmit ReadSubmission(string body) =>
    JsonSerializer.Deserialize<OfficialQuoteSubmit>(body, new JsonSerializerOptions(JsonSerializerDefaults.Web))
    ?? throw new Exception("Invalid fixture");

var goodQuote = ReadSubmission("""
{
    "mode": "Maritime", "shipmentType": "FCL", "catalogSource": "dhole",
    "originLocationId": "19a5ce22-340d-579f-ad27-f6517a2dde27",
    "destinationLocationId": "25882b97-8df9-407f-8300-8994184dfad1",
    "podLocationId": "c2610000-0000-4000-8000-000000000003",
    "incoterm": "CIF",
    "equipment": [{"size":"45 pies","type":"High Cube","quantity":1,"unitWeightsKg":[1000]}]
}
""");
var validRoute = DholeQuoteSelectionValidator.Validate(goodQuote, formCatalog);
Check(validRoute.OriginName == "Acajutla" && validRoute.DestinationName == "Acajutla" &&
      validRoute.PodName == "Land POD",
    "Server resolves role-specific external UUIDs even when names are identical");

static void ExpectSelectionReject(OfficialQuoteSubmit input, DholeQuoteFormCatalog catalog, string why)
{
    try
    {
        DholeQuoteSelectionValidator.Validate(input, catalog);
    }
    catch (ArgumentException)
    {
        return;
    }
    throw new Exception("FAILED: submission must reject " + why);
}
ExpectSelectionReject(goodQuote with { Incoterm = "EXW" }, formCatalog, "retired Incoterm");
ExpectSelectionReject(goodQuote with {
    Equipment = [new OfficialContainerInput("45 pies", "Dry Van", 1, [1000])]
}, formCatalog, "FCL 45-foot Dry Van absent in Dhole");
ExpectSelectionReject(goodQuote with { OriginLocationId = goodQuote.DestinationLocationId },
    formCatalog, "POE UUID used as POL despite matching name");
ExpectSelectionReject(goodQuote with { PodLocationId = Guid.NewGuid() },
    formCatalog, "unknown POD UUID");
ExpectSelectionReject(goodQuote with { CatalogSource = null },
    formCatalog, "missing source discriminator");
ExpectSelectionReject(goodQuote with { Mode = "Air" },
    formCatalog, "wrong transport modality");

var landPolItems = DholeCatalogNormalizer.Parse("""
[
  { "id": "99999999-9999-4999-8999-999999999999", "name": "Land Origin", "value": "Land Origin",
    "transportMode":"Land", "terminalType":"SD", "routeRole":"POL" }
]
""");
var ftlCatalog = DholeQuoteFormCatalogBuilder.Build(
    "Land", "FTL", officialIncotermItems, landPolItems, poeItems, [],
    [], [], truckSizes);
Check(ftlCatalog.EquipmentSizes.Select(x => x.Value).SequenceEqual(
    ["24 pies / 5 TON", "26 pies / 7 TON", "48 pies", "53 pies"]),
    "Dhole FTL 48 replaces old static 40 without hardcoding a replacement");
var ftlQuote = ReadSubmission("""
{
    "mode":"Land", "shipmentType":"FTL", "catalogSource":"dhole",
    "originLocationId":"99999999-9999-4999-8999-999999999999",
    "destinationLocationId":"c2610000-0000-4000-8000-000000000003",
    "incoterm":"FOB", "equipment":[{"size":"48 pies","type":"Furgón"}]
}
""");
Check(DholeQuoteSelectionValidator.Validate(ftlQuote, ftlCatalog).OriginName == "Land Origin",
    "Active Dhole 48 FTL accepted");
ExpectSelectionReject(ftlQuote with {
    Equipment = [new OfficialContainerInput("40 pies", "Furgón", 1, [1000])]
}, ftlCatalog, "retired 40-foot FTL");
Console.WriteLine("OK: Quote submit contract validates external roles, FCL pairs, FTL live sizes and Incoterms.");

ExpectSelectionReject(goodQuote with { Incoterm = null }, formCatalog, "omitted Dhole Incoterm");
var overlongName = formCatalog with {
    Origins = formCatalog.Origins.Select(x => x with { DisplayName = new string('X', 181) }).ToArray()
};
ExpectSelectionReject(goodQuote, overlongName, "origin longer than persisted column capacity");

var airPolItems = DholeCatalogNormalizer.Parse("""
[
  { "id":"aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "name":"Air Origin", "value":"Air Origin",
    "transportMode":"Air", "terminalType":"APT", "routeRole":"POL" }
]
""");
var airCatalog = DholeQuoteFormCatalogBuilder.Build(
    "Air", "AIR_LCL", officialIncotermItems, airPolItems, poeItems, [],
    containerSizes, containerTypes, truckSizes);
Check(airCatalog.Origins.Length == 1 && airCatalog.Destinations.Length == 1 &&
      airCatalog.Pods.Length == 0 && airCatalog.EquipmentSizes.Length == 0,
    "Air LCL offers only Air/APT locations and no unapproved equipment fields");

var lclCatalog = DholeQuoteFormCatalogBuilder.Build(
    "Maritime", "LCL", officialIncotermItems, polItems, poeItems, podItems,
    containerSizes, containerTypes, truckSizes);
Check(lclCatalog.Pods.Length == 3 && lclCatalog.EquipmentSizes.Length == 0 &&
      lclCatalog.Incoterms.Length == 2,
    "Maritime LCL has all POD choices and no FCL equipment fields");

var ltlCatalog = DholeQuoteFormCatalogBuilder.Build(
    "Land", "LTL", officialIncotermItems, landPolItems, poeItems, [],
    containerSizes, containerTypes, truckSizes);
Check(ltlCatalog.Origins.Length == 1 && ltlCatalog.Destinations.Length == 1 &&
      ltlCatalog.EquipmentSizes.Length == 0 && ltlCatalog.Pods.Length == 0,
    "Land LTL remains package-based without full-truck equipment choices");

Console.WriteLine("OK: All five shipment mode/type combinations use the right Dhole fields.");

var itinerariesMaritimeOrigins = DholeItineraryLocationProjector.Project(
    "maritime", "origin", polItems, podItems);
Check(itinerariesMaritimeOrigins.Contains("San José") &&
      itinerariesMaritimeOrigins.Count(x => x == "San José") == 1 &&
      itinerariesMaritimeOrigins.Contains("Moin"),
    "Maritime itinerary POL preserves different Dhole entries but uses unique filter strings");

var itinerariesGroundOrigins = DholeItineraryLocationProjector.Project(
    "ground", "origin", landPolItems, podItems);
Check(itinerariesGroundOrigins.SequenceEqual(["Land Origin"]),
    "Ground itineraries receive only Land POL names");

var mixedPol = polItems.Concat(landPolItems).ToArray();
var allOrigins = DholeItineraryLocationProjector.Project(
    "all", "origin", mixedPol, podItems);
Check(allOrigins.Contains("Land Origin") && allOrigins.Contains("Moin"),
    "All itinerary modes include maritime and ground origin names");

var maritimePods = DholeItineraryLocationProjector.Project(
    "maritime", "destination", polItems, podItems);
var groundPods = DholeItineraryLocationProjector.Project(
    "ground", "destination", landPolItems, podItems);
Check(maritimePods.SequenceEqual(groundPods) &&
      maritimePods.Contains("Legacy POD") &&
      maritimePods.Contains("Land POD") &&
      maritimePods.Contains("Invalid role"),
    "Itinerary destination means POD, includes all active entries in every transport mode");

Console.WriteLine("OK: Itinerarios uses Dhole POL/POD, unique name filters and no UUID migration.");



sealed class FakeDholeHttpClientFactory(HttpClient client) : IHttpClientFactory
{
    public HttpClient CreateClient(string name)
    {
        if (name != "DholeCatalogs")
            throw new Exception("Unexpected HttpClient name.");
        return client;
    }
}

sealed class FakeDholeHandler : HttpMessageHandler
{
    public int Calls { get; private set; }
    public bool Fail { get; set; }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Calls++;
        if (request.Method != HttpMethod.Get ||
            request.RequestUri?.Scheme != "https" ||
            request.RequestUri.Host != "api.logisticacastrofallas.com" ||
            request.RequestUri.AbsolutePath != "/api/external/v1/tamano-de-furgon-wja6f0k" ||
            !request.Headers.TryGetValues("X-Api-Key", out var values) ||
            !values.SequenceEqual(["fictional-ci-only-key"]))
            throw new Exception("Invalid safe Dhole GET request or missing fake authentication header.");

        if (Fail)
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));

        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""
                [
                  {
                    "id": "c2110000-0000-4000-8000-000000000048",
                    "code": "48",
                    "name": "48 pies",
                    "value": "48",
                    "isActive": true,
                    "metadata": {"feet": 48, "modality": "Land"}
                  }
                ]
                """)
        });
    }
}
