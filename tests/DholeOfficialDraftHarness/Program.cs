using System.Globalization;
using System.Text.Json;
using CastroFallas.MiniQuote.Api.Models;
using CastroFallas.MiniQuote.Api.Services;

static void Assert(bool value, string message)
{
    if (!value) throw new Exception("FAIL: " + message);
}
static void Block(Action action, string message)
{
    try { action(); throw new Exception("FAIL: not rejected: " + message); }
    catch (ArgumentException) { }
}
var pol = Guid.Parse("f3333333-3333-4333-8333-333333333333");
var poe = Guid.Parse("f4444444-4444-4444-8444-444444444444");
var pod = Guid.Parse("f5555555-5555-4555-8555-555555555555");
var quoteId = Guid.Parse("e1111111-1111-4111-8111-111111111111");
var maritime = new DholeValidatedRoute(
    "Shanghai, China", "Limón/Moin, Costa Rica", "Moin, Costa Rica");
var land = new DholeValidatedRoute("Origen CI", "Destino CI", null);
var lcl = new OfficialQuoteSubmit(
    Mode:"Maritime", ShipmentType:"LCL",
    OriginLocationId:pol, DestinationLocationId:poe, PodLocationId:pod,
    ContactName:"Persona de Prueba", ContactEmail:"prueba@example.invalid",
    ContactPhone:"+506 0000-0000", Incoterm:"CIF",
    CargoReadyDate:new DateOnly(2026,12,18),
    Services:["Transporte internacional"],
    Equipment:[],
    Packages:[new OfficialPackageInput(
        "Caja de repuestos simulada", 3, 10, 20, 12, 8, "NonStackable", "Box")],
    DimensionUnit:"cm", WeightUnit:"kg",
    ExwCargoStatus:null, ExwPickupAddress:null,
    CargoDescription:"Repuestos automotrices de prueba (sin carga real)",
    CabysCode:null, CargoValue:null, DeclaredWeight:null,
    DeclaredPackages:null, Observations:"PRUEBA CONTROLADA AUTORIZADA. DATOS FICTICIOS.",
    CargoFlags:[], DestinationHandling:null,
    CatalogSource:"dhole");
var preview = DholeOfficialQuoteDraftBuilder.Project(lcl,quoteId,maritime);
Assert(!preview.RemoteSubmissionPermitted,"preview cannot send HTTP");
Assert(preview.OfficialQuoteId==quoteId,"identity preserved for idempotency");
Assert(preview.ShipmentMode=="Lcl" && preview.Mode=="Maritime","maritime LCL");
Assert(preview.OriginId==pol && preview.PoeId==poe && preview.PodId==pod,"distinct routing IDs");
Assert(preview.PoeName==maritime.DestinationName && preview.PodName==maritime.PodName,"verified catalog labels");
Assert(preview.Services.SequenceEqual(new[]{"Transporte internacional"}),"web services retained");
Assert(preview.CargoUnits.Count==1 && preview.EquipmentUnits.Count==0,"one consolidated line");
var line=preview.CargoUnits[0];
Assert(line.Quantity==3 && line.UnitType=="Box" && !line.IsStackable,"3 explicit nonstackable boxes");
Assert(line.LengthCm==20 && line.WidthCm==12 && line.HeightCm==8,"dimension values for real Pricing handoff");
Assert(Math.Abs(line.WeightKgPerUnit*3-10)<0.00000001m,"10 kg total divided among three packages");
Assert(preview.TotalWeightKg==10 && preview.TotalPackages==3,"no multiplication of total line kg");
Assert(preview.CargoDescriptionWithApplicant.Contains("Nombre: Persona de Prueba") &&
    preview.CargoDescriptionWithApplicant.Contains("Correo: prueba@example.invalid") &&
    preview.CargoDescriptionWithApplicant.Contains("Teléfono: +506 0000-0000"),"contact appended only to description");
Assert(preview.PendingCatalogResolutions.Any(x=>x.StartsWith("incotermId:")) &&
    preview.PendingCatalogResolutions.Any(x=>x.StartsWith("serviceIds:")),"no fake catalog IDs");
Console.WriteLine("PASS: official web LCL quote maps 3 typed boxes, 10 kg total and contact; zero HTTP.");

var air=DholeOfficialQuoteDraftBuilder.Project(lcl with {
    Mode="Air",ShipmentType="AIR_LCL",PodLocationId=null
},quoteId,land);
Assert(air.ShipmentMode=="Air" && air.PodId==null,"Air mode");
var ltl=DholeOfficialQuoteDraftBuilder.Project(lcl with {
    Mode="Land",ShipmentType="LTL",PodLocationId=null,
    WeightUnit="lb",DimensionUnit="in"
},quoteId,land);
Assert(ltl.ShipmentMode=="Ltl" &&
    Math.Abs(ltl.TotalWeightKg-4.5359237m)<0.00000001m &&
    ltl.CargoUnits[0].LengthCm==50.8m,"LTL unit conversion");
var full=lcl with {
    Packages = [],
    Equipment = [new OfficialContainerInput(
        "40 pies","Dry Van",2,[1100m,1300m])],
    ShipmentType = "FCL"
};
var fcl=DholeOfficialQuoteDraftBuilder.Project(full,quoteId,maritime);
Assert(fcl.ShipmentMode=="Fcl" && fcl.CargoUnits.Count==0 &&
    fcl.EquipmentUnits.Count==1 && fcl.TotalWeightKg==2400,"FCL preserves equipment and kg per unit");
Assert(fcl.PendingCatalogResolutions.Any(x=>x.StartsWith("equipmentIds:")),
    "FCL equipment IDs not invented");
var ftl=DholeOfficialQuoteDraftBuilder.Project(full with {
    Mode="Land", ShipmentType="FTL", PodLocationId=null,
    Equipment=[new OfficialContainerInput(
        "48 pies","Furgón seco",2,[1100m,1300m])]
},quoteId,land);
Assert(ftl.ShipmentMode=="Ftl" && ftl.TotalWeightKg==2400,"FTL preserves equipment");
Console.WriteLine("PASS: LCL, AIR_LCL, LTL, FCL and FTL mapped with verified route labels.");

Block(()=>DholeOfficialQuoteDraftBuilder.Project(lcl with {
    Packages = [lcl.Packages![0] with {UnitType=null}]
},quoteId,maritime),"missing unit type");
Block(()=>DholeOfficialQuoteDraftBuilder.Project(lcl with {
    Packages = [lcl.Packages![0] with {UnitType="Inventado"}]
},quoteId,maritime),"invented unit type");
Block(()=>DholeOfficialQuoteDraftBuilder.Project(lcl with {
    Packages = [lcl.Packages![0] with {Stackability=null}]
},quoteId,maritime),"unknown stackability");
Block(()=>DholeOfficialQuoteDraftBuilder.Project(lcl with {
    CatalogSource="local"
},quoteId,maritime),"legacy source cannot be mistaken for Dhole IDs");
Block(()=>DholeOfficialQuoteDraftBuilder.Project(lcl with {
    ContactName="Inyección\nCorreo: atacante"
},quoteId,maritime),"newline injection");
Block(()=>DholeOfficialQuoteDraftBuilder.Project(lcl with {
    CargoDescription=new string('x',3999)
},quoteId,maritime),"description overflow");
Block(()=>DholeOfficialQuoteDraftBuilder.Project(lcl with {
    PodLocationId=null
},quoteId,maritime),"maritime requires POD");
Console.WriteLine("PASS: invalid or unverified inputs rejected before Admin persistence. Zero HTTP.");

// The second stage deliberately builds a contract REVIEW, not a request to send.
// Resolutions are wholly fictional and fresh relative to a deterministic CI clock.
var verifiedAt = new DateTime(2026, 11, 23, 16, 0, 0, DateTimeKind.Utc);
var reviewAt = verifiedAt.AddMinutes(3);
var catalog = new DholeOfficialCatalogResolution(
    verifiedAt,
    Guid.Parse("a1000000-0000-4000-8000-000000000001"), "CIF",
    [new DholeOfficialServiceResolution(
        "Transporte internacional", "INT_TRANSPORT",
        Guid.Parse("c2300000-0000-4000-8000-000000000001"), true)],
    []);
var flat = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(preview, catalog, reviewAt);
Assert(flat.ReadyForContractReview && !flat.RemoteSubmissionPermitted,
    "review is deliberately not authorized for remote submission");
Assert(flat.IdempotencyKey == "cf-official-" + quoteId.ToString("D"),
    "flat review matches creation outbox idempotency key");
var body = flat.Body;
Assert(body.GetProperty("shipmentMode").GetString() == "Lcl" &&
    body.GetProperty("form_modality").GetString() == "Maritime" &&
    body.GetProperty("form_rateType").GetString() == "Spot" &&
    body.GetProperty("priority").GetString() == "Green",
    "LCL published top-level fields, Spot and fixed Green priority");
Assert(body.GetProperty("form_originId").GetString() == pol.ToString("D") &&
    body.GetProperty("poeId").GetString() == poe.ToString("D") &&
    body.GetProperty("form_destinationId").GetString() == poe.ToString("D") &&
    body.GetProperty("podId").GetString() == pod.ToString("D") &&
    body.GetProperty("requestContext_podId").GetString() == pod.ToString("D"),
    "POL, POE and POD keep distinct verified identifiers");
Assert(body.GetProperty("form_incotermId").GetString() == catalog.IncotermId.ToString("D") &&
    body.GetProperty("form_serviceIds")[0].GetString() == catalog.Services[0].Id.ToString("D"),
    "Incoterm and services from explicitly validated resolutions");
Assert(body.GetProperty("form_cargoPackages").GetInt32() == 3 &&
    body.GetProperty("form_cargoWeightKg").GetDecimal() == 10 &&
    body.GetProperty("form_nonStackable").GetBoolean(),
    "total packages and total kg preserved");
var box = body.GetProperty("sellerContext_consolidatedCargoLines")[0];
Assert(box.GetProperty("quantity").GetInt32() == 3 &&
    box.GetProperty("unitType").GetString() == "Box" &&
    Math.Abs(box.GetProperty("weightKg").GetDecimal() * 3m - 10m) < 0.00001m &&
    box.GetProperty("length").GetDecimal() == 20 &&
    box.GetProperty("width").GetDecimal() == 12 &&
    box.GetProperty("height").GetDecimal() == 8 &&
    !box.GetProperty("isStackable").GetBoolean(),
    "seller preview will receive 3 correctly typed and measured boxes");
Assert(!body.TryGetProperty("clientName", out _) &&
    !body.TryGetProperty("form_clientName", out _) &&
    !body.TryGetProperty("sellerUserId", out _) &&
    !body.TryGetProperty("form_cargoValue", out _) &&
    !body.TryGetProperty("form_currencyId", out _) &&
    !body.TryGetProperty("form_fclContainers", out _),
    "never invent fixed identities, seller, currency, cargo amount or FCL equipment");

foreach (var consolidation in new[]{air,ltl})
{
    var shape = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(consolidation, catalog, reviewAt).Body;
    Assert(shape.GetProperty("shipmentMode").GetString() == consolidation.ShipmentMode &&
        !shape.TryGetProperty("podId", out _) &&
        shape.GetProperty("sellerContext_consolidatedCargoLines")[0]
            .GetProperty("unitType").GetString() == "Box",
        "Air and LTL use consolidated lines, no maritime POD");
}
var fullCatalog = catalog with
{
    Equipment =
    [
        new DholeOfficialEquipmentResolution(
            "Fcl", "40 pies", "Dry Van",
            Guid.Parse("f6000000-0000-4000-8000-000000000001"),
            "40 Dry Van", "FCL-40-DRY", true)
    ]
};
var fclFlat = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(fcl, fullCatalog, reviewAt).Body;
Assert(fclFlat.GetProperty("form_fclContainers")[0].GetProperty("quantity").GetInt32() == 2 &&
    fclFlat.GetProperty("form_fclContainers")[0].GetProperty("unitWeightsKg")[0].GetDecimal() == 1100 &&
    fclFlat.GetProperty("form_cargoWeightKg").GetDecimal() == 2400 &&
    !fclFlat.TryGetProperty("sellerContext_consolidatedCargoLines", out _),
    "FCL equipment preserves individual weights and correct total");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    fcl, fullCatalog with { Equipment = [
        fullCatalog.Equipment[0] with { IsActive = false }] }, reviewAt),
    "inactive equipment type may not be resolved even if UUID is present");

// Two distinct sizes must never alias the same Catalog item UUID.
var fclTwoTypes = fcl with {
    EquipmentUnits = [
        fcl.EquipmentUnits[0],
        new DholeOfficialEquipmentUnit("20 pies", "High Cube", 1, [500m])
    ],
    TotalWeightKg = fcl.TotalWeightKg + 500m
};
var twoTypeCatalog = fullCatalog with {
    Equipment = [
        fullCatalog.Equipment[0],
        new DholeOfficialEquipmentResolution(
            "Fcl", "20 pies", "High Cube",
            Guid.Parse("f6000000-0000-4000-8000-000000000003"),
            "20 High Cube", "FCL-20-HC", true)
    ]
};
var verifiedTwoTypes = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    fclTwoTypes, twoTypeCatalog, reviewAt);
Assert(verifiedTwoTypes.Body.GetProperty("form_fclContainers").GetArrayLength() == 2 &&
    !verifiedTwoTypes.RemoteSubmissionPermitted,
    "different active FCL types with distinct UUIDs may be reviewed, never sent");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    fclTwoTypes, twoTypeCatalog with { Equipment = [
        twoTypeCatalog.Equipment[0],
        twoTypeCatalog.Equipment[1] with {
            TypeId = twoTypeCatalog.Equipment[0].TypeId }
    ] }, reviewAt),
    "different equipment combinations cannot share one Pricing type UUID");
var ftlCatalog = catalog with
{
    Equipment =
    [
        new DholeOfficialEquipmentResolution(
            "Ftl", "48 pies", "Furgón seco",
            Guid.Parse("f6000000-0000-4000-8000-000000000002"),
            "48 Furgón seco", "FTL-48-DRY", true)
    ]
};
var ftlFlat = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(ftl, ftlCatalog, reviewAt).Body;
Assert(ftlFlat.GetProperty("form_landContainers")[0].GetProperty("containerTypeCode").GetString() == "FTL-48-DRY" &&
    !ftlFlat.TryGetProperty("podId", out _),
    "FTL equipment uses resolved type and forbids maritime POD");

// Reject incomplete, stale, swapped and forged resolver snapshots before any HTTP.
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    preview, catalog with { VerifiedAtUtc = reviewAt.AddMinutes(-20) }, reviewAt),
    "expired catalog");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    preview, catalog with { IncotermValue = "FOB" }, reviewAt),
    "incorrect incoterm value");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    preview, catalog with { IncotermId = Guid.Empty }, reviewAt),
    "missing incoterm id");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    preview, catalog with { Services = [] }, reviewAt),
    "missing service IDs");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    preview, catalog with { Services = [catalog.Services[0] with { Name = "Agencia de Aduanas CR" }] }, reviewAt),
    "wrong service name resolution");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    preview, catalog with { Services = [catalog.Services[0] with { Code = "CUSTOMS_CR" }] }, reviewAt),
    "wrong Pricing service code");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    preview, catalog with { Services = [catalog.Services[0] with { IsActive = false }] }, reviewAt),
    "inactive Pricing service");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    fcl, catalog, reviewAt),
    "equipment UUID missing");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    fcl, fullCatalog with { Equipment = [fullCatalog.Equipment[0] with { Type = "High Cube" }] }, reviewAt),
    "equipment type mismatch");
Block(() => DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
    ftl, fullCatalog, reviewAt), "FCL type cannot be used for FTL");
Assert(!flat.RemoteSubmissionPermitted, "no send gate is exposed even for passing review");

var extendedLcl = lcl with
{
    Packages = [
        lcl.Packages![0],
        new OfficialPackageInput("Segunda línea de repuestos", 2, 12, 15, 10, 6, "Stackable", "Pallet")
    ],
    Services = ["Transporte internacional", "Almacenamiento", "Transporte entrega", "Transporte recolección"],
    CargoFlags = ["Carga peligrosa", "No estibable", "Sobrepeso"],
    CabysCode = "1234567890000",
    Observations = "Mercancía frágil: coordinar equipo de seguridad.",
    FiscalStorageDays = 5,
    PickupAddress = "Bodega origen de prueba, China",
    DeliveryAddress = "Almacén destino de prueba, Costa Rica",
    CargoValue = 1500,
    DeclaredWeight = 22,
    DeclaredPackages = 5,
    DestinationHandling = "Gestión especial"
};
var extended = DholeOfficialQuoteDraftBuilder.Project(extendedLcl, quoteId, maritime);
Assert(extended.CargoUnits.Count == 2 &&
    extended.TotalPackages == 5 &&
    extended.TotalWeightKg == 22 &&
    extended.CabysCode == "1234567890000" &&
    extended.FiscalStorageDays == 5 &&
    extended.DangerousCargo && extended.OverweightCargo &&
    extended.PendingCatalogResolutions.Any(b => b.StartsWith("cargoValue:")) &&
    extended.PendingCatalogResolutions.Any(b => b.StartsWith("destinationHandling:")),
    "Two cargo lines and all extra user fields must survive the local quote projection");
var extendedCatalog = catalog with
{
    Services = [
        catalog.Services[0],
        new DholeOfficialServiceResolution("Almacenamiento", "STORAGE",
            Guid.Parse("c2300000-0000-4000-8000-000000000002"), true),
        new DholeOfficialServiceResolution("Transporte entrega", "DELIVERY",
            Guid.Parse("c2300000-0000-4000-8000-000000000003"), true),
        new DholeOfficialServiceResolution("Transporte recolección", "PICKUP",
            Guid.Parse("c2300000-0000-4000-8000-000000000004"), true)
    ]
};
var extendedReview = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(extended, extendedCatalog, reviewAt);
Assert(!extendedReview.ReadyForContractReview && !extendedReview.RemoteSubmissionPermitted &&
    extendedReview.BlockingIssues.Count == 3 &&
    extendedReview.BlockingIssues.Any(x => x.StartsWith("cargoValue:")) &&
    extendedReview.BlockingIssues.Any(x => x.StartsWith("destinationHandling:")) &&
    extendedReview.BlockingIssues.Any(x => x.StartsWith("declaredFigures:")),
    "Unmapped commercial values must block remote-ready status and remain visible for review");
var extendedBody = extendedReview.Body;
Assert(extendedBody.GetProperty("sellerContext_consolidatedCargoLines").GetArrayLength() == 2 &&
    extendedBody.GetProperty("form_cargoPackages").GetInt32() == 5 &&
    extendedBody.GetProperty("form_cargoWeightKg").GetDecimal() == 22 &&
    extendedBody.GetProperty("form_storageDays").GetInt32() == 5 &&
    extendedBody.GetProperty("form_cabysCode").GetString() == "1234567890000" &&
    extendedBody.GetProperty("form_cargoObservations").GetString()?.StartsWith("Mercancía frágil") == true &&
    extendedBody.GetProperty("form_pickupAddress").GetString()?.Contains("Bodega origen") == true &&
    extendedBody.GetProperty("form_inlandDeliveryLocation_address").GetString()?.Contains("Almacén destino") == true &&
    extendedBody.GetProperty("form_dangerousCargo").GetBoolean() &&
    extendedBody.GetProperty("form_overweight").GetBoolean() &&
    extendedBody.GetProperty("sellerContext_consolidatedCargoLines")[1]
        .GetProperty("unitType").GetString() == "Pallet" &&
    !extendedBody.TryGetProperty("form_cargoValue", out _) &&
    !extendedBody.TryGetProperty("form_currencyId", out _),
    "Published flat review preserves safe details but never guesses commercial currency");
foreach (var iso in new[] { "USD", "CRC", "EUR" })
{
    var commercial = extended with { CargoCurrencyCode = iso };
    var manual = DholeOfficialQuoteFlatPreviewBuilder.BuildReview(
        commercial, extendedCatalog, reviewAt, manualCommercialReview:true);
    var notes = manual.Body.GetProperty("form_cargoObservations").GetString()!;
    Assert(manual.ReadyForContractReview && !manual.RemoteSubmissionPermitted &&
        notes.Contains("1500 " + iso) && notes.Contains("Gestión especial") &&
        notes.Contains("Peso declarado adicional") && notes.Contains("Bultos declarados adicionales") &&
        notes.StartsWith("Mercancía frágil") &&
        !manual.Body.TryGetProperty("form_cargoValue", out _) &&
        !manual.Body.TryGetProperty("form_currencyId", out _) &&
        manual.Body.GetProperty("form_cargoWeightKg").GetDecimal() == 22,
        "Manual review preserves original commercial inputs without invented conversions");
}
Console.WriteLine("PASS: extra lines, flags, storage, CABYS, notes and delivery fields retained; default currency blocks remain.");

Console.WriteLine("PASS: five modes project to flat Dhole review with real LCL cargo shape and resolved fake catalog UUIDs.");
Console.WriteLine("PASS: invalid/stale catalog snapshots blocked; no HTTP, dispatcher or secrets.");


// Browser-exported Config IDs are never hardcoded as production constants.
// All values below are fictional. Test the typed bridge which will eventually
// consume short-lived private exports and the existing seven external GETs.
var codeList = new[]
{
    "INT_TRANSPORT", "CUSTOMS_CR", "CUSTOMS_FOREIGN", "STORAGE",
    "INVENTORY_CONTROL", "PACKING", "EXONERATION", "PICKING",
    "RECEPTION", "CARGO_INSURANCE", "DELIVERY", "PICKUP"
};
var serviceRows = codeList.Select((code, i) => new
{
    id = $"b9000000-0000-4000-8000-{i + 1:D12}",
    code, name = code, value = code, isActive = true
}).ToArray();
var landKinds = new[] {
    (Suffix:"DRY_VAN", Kind:"dry-van"),
    (Suffix:"PLATFORM", Kind:"platform"),
    (Suffix:"REEFER", Kind:"reefer"),
    (Suffix:"CURTAIN_SIDE", Kind:"curtain-side")
};
var landRows = new[] { "24", "26", "48", "53" }
    .SelectMany((size, index) => landKinds.Select((kind, offset) => new
    {
        id = $"b8000000-0000-4000-8000-{index * 4 + offset + 1:D12}",
        code = size + "_" + kind.Suffix, size, kind = kind.Kind,
        name = size + " " + kind.Kind,
        value = size + "_" + kind.Suffix, isActive = true
    })).ToArray();
var manualStamp = verifiedAt.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
var expiresStamp = verifiedAt.AddMinutes(5)
    .ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
var provenance = "manually-reviewed-internal-config-export-not-live-get";
var manualJson = JsonSerializer.Serialize(new Dictionary<string, object>
{
    ["source"] = "temporary-internal-config-browser-export",
    ["reviewedAtUtc"] = manualStamp,
    ["expiresAtUtc"] = expiresStamp,
    ["readyForRemotePost"] = false,
    ["noTransport"] = true,
    ["snapshots"] = new Dictionary<string, object>
    {
        ["pricing-services"] = new {
            catalog = "pricing-services", fetchedAtUtc = manualStamp,
            stale = false, provenance, items = serviceRows },
        ["land-equipment-types"] = new {
            catalog = "land-equipment-types", fetchedAtUtc = manualStamp,
            stale = false, provenance, items = landRows }
    }
});
DholeCatalogItem FakeItem(
    string externalId, string code, string name, string value,
    string? size = null, string? kind = null,
    string[]? modalities = null, string[]? shipmentModes = null) =>
    new(externalId, code, name, value, true, 1, null, null, null, null,
        size, kind, null, null, modalities ?? [], shipmentModes ?? []);
var live = new Dictionary<string, DholeOfficialExistingCatalogSnapshot>(StringComparer.Ordinal)
{
    ["incoterms"] = new("incoterms", new DateTimeOffset(verifiedAt), false,
        [FakeItem("b1000000-0000-4000-8000-000000000001", "INC-CIF",
            "CIF", "CIF")]),
    ["truck-sizes"] = new("truck-sizes", new DateTimeOffset(verifiedAt), false,
        [FakeItem("b1000000-0000-4000-8000-000000000002", "48", "48 pies", "48")]),
    ["container-sizes"] = new("container-sizes", new DateTimeOffset(verifiedAt), false,
        [FakeItem("b1000000-0000-4000-8000-000000000003", "40", "40 pies", "40")]),
    ["container-types"] = new("container-types", new DateTimeOffset(verifiedAt), false,
        [FakeItem("b1000000-0000-4000-8000-000000000004", "40_DRY_VAN",
            "40 Dry Van", "40_DRY_VAN", "40", "dry-van", ["Maritime"], ["FCL"])])
};
using (var manualDocument = JsonDocument.Parse(manualJson))
{
    var manualLcl = DholeOfficialManualCatalogResolution.Review(
        preview, manualDocument.RootElement, live, reviewAt);
    var manualLclBody = DholeOfficialQuoteFlatPreviewBuilder
        .BuildReview(preview, manualLcl, reviewAt);
    var published = new Dictionary<string, DholeOfficialExistingCatalogSnapshot>(live)
    {
        ["pricing-services"] = new("pricing-services", new DateTimeOffset(verifiedAt), false,
            serviceRows.Select(x => FakeItem(x.id, x.code, x.name, x.value)).ToArray()),
        ["land-equipment-types"] = new("land-equipment-types", new DateTimeOffset(verifiedAt), false,
            landRows.Select(x => FakeItem(x.id, x.code, x.name, x.value, x.size, x.kind)).ToArray())
    };
    foreach (var draft in new[] { preview, fcl, ftl })
    {
        var manualIds = DholeOfficialManualCatalogResolution.Review(
            draft, manualDocument.RootElement, live, reviewAt);
        var publishedIds = DholeOfficialManualCatalogResolution.ReviewPublished(draft, published, reviewAt);
        Assert(DholeOfficialQuoteFlatPreviewBuilder.BuildReview(draft, manualIds, reviewAt).Body.GetRawText() ==
            DholeOfficialQuoteFlatPreviewBuilder.BuildReview(draft, publishedIds, reviewAt).Body.GetRawText(),
            "Published lookup and manual review resolve the same fictional IDs");
    }
    Block(() => DholeOfficialManualCatalogResolution.ReviewPublished(
        preview, published, verifiedAt.AddMinutes(6)), "Published lookup cannot use expired data");
    published["pricing-services"] = published["pricing-services"] with { Stale = true };
    Block(() => DholeOfficialManualCatalogResolution.ReviewPublished(
        preview, published, reviewAt), "Published lookup cannot use stale data");
    Assert(manualLclBody.ReadyForContractReview &&
        !manualLclBody.RemoteSubmissionPermitted &&
        manualLclBody.Body.GetProperty("form_serviceIds")[0].GetString() ==
            serviceRows[0].id,
        "Manual Config 12-service mapping enables local flat review but never sending");

    // Prove the future dispatch path reconstructs from the ADMIN copy,
    // never from browser-supplied IDs or an invented payload.
    var storedOfficial = new OfficialQuoteRequest
    {
        Id = quoteId,
        Mode = lcl.Mode!,
        ShipmentType = lcl.ShipmentType!,
        ContactName = lcl.ContactName!,
        ContactEmail = lcl.ContactEmail!,
        ContactPhone = lcl.ContactPhone!,
        OriginName = maritime.OriginName,
        DestinationName = maritime.DestinationName,
        FormJson = JsonSerializer.Serialize(lcl,
            new JsonSerializerOptions(JsonSerializerDefaults.Web))
    };
    var fromAdmin = DholeOfficialDispatchPreflight.ReviewSavedQuote(
        storedOfficial, maritime, manualDocument.RootElement, live, reviewAt);
    Assert(fromAdmin.OfficialQuoteId == quoteId &&
        fromAdmin.IdempotencyKey == manualLclBody.IdempotencyKey &&
        fromAdmin.Body.GetProperty("form_serviceIds")[0].GetString() ==
            serviceRows[0].id &&
        !fromAdmin.RemoteSubmissionPermitted,
        "Persisted Admin quote is the source for a verified, unsendable dispatch preview");
    Block(() => DholeOfficialDispatchPreflight.ReviewSavedQuote(
        storedOfficial, new DholeValidatedRoute("forged", maritime.DestinationName, maritime.PodName),
        manualDocument.RootElement, live, reviewAt),
        "Reject mismatched route label before building quote POST");
    Block(() => DholeOfficialDispatchPreflight.ReviewSavedQuote(
        new OfficialQuoteRequest
        {
            Id = quoteId, Mode = storedOfficial.Mode,
            ShipmentType = storedOfficial.ShipmentType,
            ContactName = storedOfficial.ContactName,
            ContactEmail = "tampered@example.invalid",
            ContactPhone = storedOfficial.ContactPhone,
            OriginName = storedOfficial.OriginName,
            DestinationName = storedOfficial.DestinationName,
            FormJson = storedOfficial.FormJson
        },
        maritime, manualDocument.RootElement, live, reviewAt),
        "Reject mismatched contact between saved Admin columns and form JSON");
    Block(() => DholeOfficialDispatchPreflight.ReviewSavedQuote(
        storedOfficial, maritime, manualDocument.RootElement,
        live, verifiedAt.AddMinutes(6)),
        "Reject expired temporary IDs in Admin quote preflight");
    Console.WriteLine("PASS: Admin persisted quote -> typed short-lived catalogue -> offline flat review, no HTTP.");

    var manualFcl = DholeOfficialManualCatalogResolution.Review(
        fcl, manualDocument.RootElement, live, reviewAt);
    var manualFclBody = DholeOfficialQuoteFlatPreviewBuilder
        .BuildReview(fcl, manualFcl, reviewAt);
    Assert(manualFclBody.Body.GetProperty("form_fclContainers")[0]
        .GetProperty("containerTypeId").GetString() ==
        "b1000000-0000-4000-8000-000000000004",
        "FCL equipment UUID comes from existing active GET, not manual size");

    var manualFtl = DholeOfficialManualCatalogResolution.Review(
        ftl, manualDocument.RootElement, live, reviewAt);
    var manualFtlBody = DholeOfficialQuoteFlatPreviewBuilder
        .BuildReview(ftl, manualFtl, reviewAt);
    Assert(manualFtlBody.Body.GetProperty("form_landContainers")[0]
        .GetProperty("containerTypeId").GetString() ==
        landRows.Single(x => x.code == "48_DRY_VAN").id,
        "FTL resolves catalog TYPE UUID by unique code/size/kind, never size UUID");

    Block(() => DholeOfficialManualCatalogResolution.Review(
        preview, manualDocument.RootElement, live, verifiedAt.AddMinutes(6)),
        "Manual Config mapping expires after five minutes");
    var staleLive = new Dictionary<string, DholeOfficialExistingCatalogSnapshot>(live)
    {
        ["incoterms"] = live["incoterms"] with { Stale = true }
    };
    Block(() => DholeOfficialManualCatalogResolution.Review(
        preview, manualDocument.RootElement, staleLive, reviewAt),
        "Manual service IDs cannot bypass stale or unverified existing GETs");
    var forgedManual = manualJson.Replace(
        "manually-reviewed-internal-config-export-not-live-get",
        "unverified-json-from-client", StringComparison.Ordinal);
    using var forged = JsonDocument.Parse(forgedManual);
    Block(() => DholeOfficialManualCatalogResolution.Review(
        preview, forged.RootElement, live, reviewAt),
        "Browser-forged catalog snapshot provenance must be refused");
}
// Temporary snapshot uses owner-provided IDs; never sends anything in CI.
var tempNow = new DateTime(2026, 11, 24, 12, 0, 0, DateTimeKind.Utc);
var tempExpiry = new DateTimeOffset(tempNow.AddDays(2));
var tempLive = live.ToDictionary(x => x.Key, x => x.Value with
    { FetchedAtUtc = new DateTimeOffset(tempNow) }, StringComparer.Ordinal);
var tempLcl = DholeOfficialManualCatalogResolution.ReviewTemporary(preview, tempLive, tempNow, tempExpiry);
Assert(tempLcl.Services.Any(x => x.Id == Guid.Parse("c2300000-0000-4000-8000-000000000001")),
    "Temporary services use supplied real identifiers");
var tempFtl = DholeOfficialManualCatalogResolution.ReviewTemporary(ftl, tempLive, tempNow, tempExpiry);
Assert(tempFtl.Equipment.Single().TypeId == Guid.Parse("c2130000-0000-4000-8000-000000000001"),
    "48-foot dry van resolves to type UUID, not size UUID");
Assert(DholeTemporaryDispatchCatalog.CurrencyId("USD", new DateTimeOffset(tempNow), tempExpiry) ==
    Guid.Parse("873e26af-62a3-4e8d-83ba-0aaca1470ac0") &&
    DholeTemporaryDispatchCatalog.CurrencyId("JPY", new DateTimeOffset(tempNow), tempExpiry) is null,
    "Known temporary currency UUID only");
Block(() => DholeOfficialManualCatalogResolution.ReviewTemporary(preview, tempLive, tempNow,
    new DateTimeOffset(tempNow)), "Temporary expiry cannot be bypassed");
Block(() => DholeOfficialManualCatalogResolution.ReviewTemporary(preview, tempLive, tempNow,
    DholeTemporaryDispatchCatalog.HardCutoffUtc.AddDays(1)), "Temporary expiry is bounded");
Console.WriteLine("PASS: 12 services + 16 land types bridge into typed offline review, with existing GETs and no POST.");

static void ForbidState(Action action, string reason)
{
    try
    {
        action();
        throw new Exception("FAIL: unsafe delivery transition allowed: " + reason);
    }
    catch (InvalidOperationException) { }
}
var claimed = DholeOfficialDeliveryStateMachine.Advance(
    "PendingDispatch", DholeDeliveryEvent.ClaimForOneAttempt);
Assert(claimed.NextState == "InFlight" && !claimed.RemoteCreationConfirmed &&
    !claimed.AutomaticRetryAllowed, "claim creates one in-flight attempt, not a confirmation");
var accepted = DholeOfficialDeliveryStateMachine.Advance(
    "InFlight", DholeDeliveryEvent.HttpAcceptedButUnverified);
Assert(accepted.NextState == "HttpAcceptedUnverified" && !accepted.RemoteCreationConfirmed,
    "2xx only proves HTTP accepted");
var remoteTimeout = DholeOfficialDeliveryStateMachine.Advance(
    "InFlight", DholeDeliveryEvent.RemoteResultUnknown);
Assert(remoteTimeout.NextState == "Unconfirmed" && !remoteTimeout.AutomaticRetryAllowed,
    "timeout or lost response stops automatic retry");
var rejected = DholeOfficialDeliveryStateMachine.Advance(
    "InFlight", DholeDeliveryEvent.ProviderRejected);
Assert(rejected.NextState == "Rejected" && !rejected.AutomaticRetryAllowed,
    "provider rejection is never implicitly retried");
var localError = DholeOfficialDeliveryStateMachine.Advance(
    "InFlight", DholeDeliveryEvent.LocalValidationFailed);
Assert(localError.NextState == "Failed" && !localError.AutomaticRetryAllowed,
    "local validation failure cannot send again automatically");
var found = DholeOfficialDeliveryStateMachine.Advance(
    "Unconfirmed", DholeDeliveryEvent.ManualConfirmInPricing, "pricing-verified-ci");
Assert(found.NextState == "Confirmed" && found.RemoteCreationConfirmed &&
    !found.AutomaticRetryAllowed, "only verified Pricing evidence confirms remote creation");
ForbidState(() => DholeOfficialDeliveryStateMachine.Advance(
    "PendingDispatch", DholeDeliveryEvent.ManualConfirmInPricing, "fake"),
    "unattempted quote cannot be marked confirmed");
ForbidState(() => DholeOfficialDeliveryStateMachine.Advance(
    "InFlight", DholeDeliveryEvent.ManualConfirmInPricing, "fake"),
    "in-flight quote cannot be directly confirmed");
ForbidState(() => DholeOfficialDeliveryStateMachine.Advance(
    "Unconfirmed", DholeDeliveryEvent.ClaimForOneAttempt),
    "ambiguous remote outcome cannot auto retry");
ForbidState(() => DholeOfficialDeliveryStateMachine.Advance(
    "HttpAcceptedUnverified", DholeDeliveryEvent.ClaimForOneAttempt),
    "HTTP 2xx cannot auto retry");
ForbidState(() => DholeOfficialDeliveryStateMachine.Advance(
    "Unconfirmed", DholeDeliveryEvent.ManualConfirmInPricing, ""),
    "no external verification reference");
ForbidState(() => DholeOfficialDeliveryStateMachine.Advance(
    "Confirmed", DholeDeliveryEvent.ClaimForOneAttempt),
    "confirmed quote cannot auto send twice");
Console.WriteLine("PASS: delivery state machine rejects unsafe retries and false remote confirmations.");
