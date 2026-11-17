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
