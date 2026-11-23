// Offline parity contract for wizard, conversational GIO and the Dhole API
// snapshot. No requests, credentials, browser automation or POST.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const contract = JSON.parse(read('scripts/contracts/dhole-solicitar-tarifa-published-20261120.json'));
const wizard = read('frontend/src/pages/OfficialQuoteWizard.vue');
const gio = read('frontend/src/components/GioOperations.vue');
const options = read('frontend/src/lib/officialQuoteOptions.ts');
const backend = read('backend/Endpoints/OfficialQuoteEndpoints.cs');
const model = read('backend/Models/OfficialQuoteModels.cs');
const draft = read('backend/Services/DholeOfficialQuoteDraftBuilder.cs');
const flat = read('backend/Services/DholeOfficialQuoteFlatPreviewBuilder.cs');

const has = (src,fields,label) => {
  for (const field of fields) assert.ok(src.includes(field), label+': missing '+field);
};
assert.equal(contract.inputs.length,103,'Dhole published contract input count must be re-reviewed on change');
assert.deepEqual(contract.inputs.filter(x=>x.required).map(x=>x.public),['priority']);
assert.equal(contract.defaults.clientName,'CLIENTE GENERICO');
assert.equal(contract.defaults.executiveName,'Castro Fallas');
assert.equal(new Set(contract.inputs.map(x=>x.public)).size,103);

const quoteFields = ['mode','shipmentType','catalogSource','originLocationId',
  'destinationLocationId','podLocationId','contactName','contactEmail','contactPhone',
  'incoterm','cargoReadyDate','services','equipment','packages',
  'exwCargoStatus','exwPickupAddress','cargoDescription','cabysCode',
  'cargoValue','cargoCurrencyCode','declaredWeight','declaredPackages',
  'observations','cargoFlags','destinationHandling','deliveryAddress',
  'pickupAddress','fiscalStorageDays'];
has(wizard,quoteFields,'Official wizard');
has(gio,quoteFields.filter(x=>!['originLocationId','destinationLocationId','podLocationId'].includes(x))
  .concat(['selectedLocations.origin','selectedLocations.destination','selectedLocations.pod']),
  'GIO');
has(model,['CargoCurrencyCode','OfficialContainerInput','OfficialPackageInput','OfficialQuoteSubmit'],
  'Backend DTO');
has(backend,['CargoCurrencyCode','Seguro de carga',
  'Seleccioná el POD','DholeQuoteSelectionValidator','AllowedServices'],
  'Backend authoritative validator');
has(gio,['additionalLines','extraEquipmentLines','extraPackageLines','extraEquipmentTypes',
  'packageUnitType','parseExtraLines','Seguro de carga','cargoCurrencyCode'],
  'GIO additional lines');
has(wizard,['addPackage','addEquipment','equipmentTypeOptionsFor',
  'equipmentTypesBySize','form.cargoCurrencyCode'],'Wizard conditional fields');
has(draft,['CargoCurrencyCode','CargoUnits','EquipmentUnits','FiscalStorageDays',
  'DangerousCargo','OverweightCargo','DestinationHandling'],'Local draft');

const expectedCodes = {
  'Transporte internacional':'INT_TRANSPORT','Agencia de Aduanas CR':'CUSTOMS_CR',
  'Agencia de Aduanas Exterior':'CUSTOMS_FOREIGN','Almacenamiento':'STORAGE',
  'Control de inventario':'INVENTORY_CONTROL','Embalaje':'PACKING',
  'Exoneración':'EXONERATION','Picking Carga':'PICKING',
  'Recepción de carga':'RECEPTION','Seguro de carga':'CARGO_INSURANCE',
  'Transporte entrega':'DELIVERY','Transporte recolección':'PICKUP'
};
const match = options.match(/export const officialServiceOptions = \[([\s\S]*?)\] as const/);
assert.ok(match,'Shared public service choices unavailable');
const publicServices = [...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
assert.equal(publicServices.length,12,'Exactly 12 public Pricing services expected');
assert.equal(new Set(publicServices).size,12);
assert.deepEqual(new Set(publicServices),new Set(Object.keys(expectedCodes)));
for (const [name,code] of Object.entries(expectedCodes)) {
  assert.ok(backend.includes('"'+name+'"'),'Backend must accept '+name);
  assert.ok(flat.includes('["'+name+'"] = "'+code+'"'),'Pricing service code missing '+name);
}
assert.ok(!publicServices.includes('Transporte nacional'),'Retired service must never be selectable');

// These are the *deliberately* emitted flat contract inputs, not all 103.
// Do not expose internal Pricing IDs or unreviewed commercial fields.
const emitted = [...flat.matchAll(/\["([A-Za-z][A-Za-z_]+)"\]\s*=/g)].map(x=>x[1]);
const allowed = new Set(contract.inputs.map(x=>x.public));
const projected = new Set(emitted.filter(x=>x.startsWith('form_') ||
  x.startsWith('requestContext_') || x.startsWith('sellerContext_') ||
  ['priority','shipmentMode','originName','destinationName','poeId','poeName','podId','podName'].includes(x)));
// Equipment choice is dynamic: its public key depends on the reviewed mode.
for (const key of ['form_fclContainers','form_landContainers']) {
  assert.ok(flat.includes('"'+key+'"'),'Dynamic equipment key missing: '+key);
  projected.add(key);
}
for (const key of projected) assert.ok(allowed.has(key),'Unpublished flat field '+key);
for (const key of ['form_cargoDescription','form_cargoWeightKg','form_fclContainers',
  'form_landContainers','form_cargoPackages','sellerContext_consolidatedCargoLines',
  'form_cabysCode','form_cargoObservations','form_storageDays',
  'form_dangerousCargo','form_overweight','form_pickupAddress',
  'form_inlandDeliveryLocation_address']) assert.ok(projected.has(key),'Missing projected safe field '+key);
for (const forbidden of ['form_currencyId','form_clientId','form_executiveId',
  'form_freightCost','form_freightSale','sellerUserId']) {
  assert.ok(!projected.has(forbidden),'Unverified business identity/money field '+forbidden);
}

console.log('PASS: 103 published API inputs classified; 12 services share exact Pricing codes.');
console.log('PASS: wizard and GIO retain mandatory, conditional and optional user data.');
console.log('PASS: extra cargo lines and insurance currency captured; unverified money IDs omitted.');
console.log('PASS: no remote Dhole calls or API credentials used in parity audit.');
