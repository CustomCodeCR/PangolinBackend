using System.IO;
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
Check(pods.Options.Length == 2 && pods.Options.Any(x => x.Name == "Legacy POD") &&
      pods.Options.Any(x => x.Name == "Land POD") &&
      pods.Issues.Single().Reason == "conflicting_route_role",
    "POD does not filter modality; explicit conflicting role still needs review");

try
{
    DholeQuoteLocationProjector.Project("pod", "Air", podItems);
    throw new Exception("FAILED: Non-maritime POD must be invalid");
}
catch (ArgumentException) { /* expected */ }

Console.WriteLine("OK: Dhole role projection, 3 modes, real POL exceptions, POD rule and identity isolation.");

