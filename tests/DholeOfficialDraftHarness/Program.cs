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
    Mode="Land",ShipmentType="FTL",PodLocationId=null
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
