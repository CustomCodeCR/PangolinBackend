// Offline parity contract for wizard, conversational GIO and the Dhole API
// snapshot. No requests, credentials, browser automation or POST.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const contract = JSON.parse(read('scripts/contracts/dhole-solicitar-tarifa-published-20261120.json'));
const wizard = read('frontend/src/pages/OfficialQuoteWizard.vue');
const admin = read('frontend/src/pages/OfficialQuoteAdmin.vue');
const gio = read('frontend/src/components/GioOperations.vue');
const options = read('frontend/src/lib/officialQuoteOptions.ts');
const backend = read('backend/Endpoints/OfficialQuoteEndpoints.cs');
const model = read('backend/Models/OfficialQuoteModels.cs');
const draft = read('backend/Services/DholeOfficialQuoteDraftBuilder.cs');
const flat = read('backend/Services/DholeOfficialQuoteFlatPreviewBuilder.cs');
const retry = read('frontend/src/lib/officialQuoteSubmissionAttempt.ts');
const optionsType = read('frontend/src/lib/dholeQuoteForm.ts');
const catalogEndpoint = read('backend/Endpoints/DholeCatalogEndpoints.cs');
const schema = read('backend/Database/OfficialQuotesSchema.sql');
const context = read('backend/Data/AppDbContext.cs');
const httpHarness = read('tests/DholeQuoteHttpHarness/Program.cs');

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
const uncertaintyNote = 'La peligrosidad de la carga está pendiente de confirmar.';
assert.ok(gio.includes(uncertaintyNote) && backend.includes(uncertaintyNote),
  'Fixed GIO uncertainty note must match the backend observation-budget exception');
// Stackability is a per-line fact in BOTH interfaces. The wizard must not
// offer an independent "No estibable" checkbox: it can contradict the lines.
// Both clients must derive the aggregate flag from any non-stackable line.
assert.match(wizard,/const cargoFlagOptions = \['Carga peligrosa','Sobrepeso'\]/,
  'Wizard must not render a redundant global non-stackable option');
assert.doesNotMatch(wizard,/const cargoFlagOptions = \[[^\]]*'No estibable'/,
  'Non-stackability must not be a separately selectable cargo flag');
assert.match(wizard,
  /form\.packages\.some\(line => line\.stackability === 'NonStackable'\)[\s\S]*?cargoFlags\.push\('No estibable'\)/,
  'Wizard must derive aggregate non-stackability from per-line answers');
assert.match(gio,/extra\.lines as GioExtraPackage\[\]\)\.some\(line => line\.stackability === 'NonStackable'\)/,
  'GIO must derive aggregate non-stackability from all lines');
has(gio,['advancedDetails','cabysCode','cargoValue','cargoCurrencyCode',
  'declaredWeight','declaredPackages','destinationHandling','overweight',
  'observations'], 'GIO optional advanced data parity');
// A resumed conversational draft must not treat restored values as validated.
// Both the sequential flow and edit->review shortcut must re-check answers.
assert.match(gio, /function advanceFrom\([\s\S]*?const issue = validation\(item\.key, value\)/,
  'GIO must revalidate restored quote answers before review');
assert.match(gio, /const missing = steps\.value\.findIndex\([\s\S]*?validation\(step\.key, existing\)/,
  'GIO edit shortcut must refuse malformed restored quote answers');
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

// Client creation keys are independent from future Dhole delivery keys.
// The backend feature is deliberately OFF by default; schema is additive.
has(backend,['ClientCreateIdempotencyEnabled','X-CF-Quote-Request-Key',
  'pg_advisory_xact_lock','OfficialQuoteClientSubmissions','idempotentReplay'],
  'Server creation dedup');
has(schema,['CREATE TABLE IF NOT EXISTS public.official_quote_client_submissions',
  'submission_key UUID PRIMARY KEY', 'request_digest VARCHAR(64)',
  "request_digest ~ '^[0-9a-f]{64}$'",
  'REFERENCES public.official_quote_requests(id)'], 'Separate opt-in dedup table');
// The disposable PostgreSQL C# harness must also retain its full raw SQL.
const rawDelimiters = httpHarness.split('"""').length - 1;
assert.ok(rawDelimiters >= 20 && rawDelimiters % 2 === 0,
  'PostgreSQL harness C# raw SQL delimiters must be balanced');
assert.equal(httpHarness.split('internal static class DholeQuoteHttpTest').length - 1, 1,
  'Only one HTTP harness class may be present');
assert.equal(httpHarness.split('sealed class FakeDholeHttpClientFactory').length - 1, 1,
  'Only one fake Dhole HTTP factory may be present');
const harnessKeyStart = httpHarness.indexOf('CREATE TABLE IF NOT EXISTS public.official_quote_client_submissions');
const harnessKeyEnd = httpHarness.indexOf('""", db);', harnessKeyStart);
assert.ok(harnessKeyStart >= 0 && harnessKeyEnd > harnessKeyStart,
  'Client-key table DDL must have a closing C# raw string');
const harnessKeySql = httpHarness.slice(harnessKeyStart, harnessKeyEnd);
assert.ok(harnessKeySql.includes("CHECK (request_digest ~ '^[0-9a-f]{64}$'),") &&
  harnessKeySql.includes('created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()') &&
  harnessKeySql.trim().endsWith(')'),
  'Client-key test DDL must contain complete CHECK and closing parenthesis');

// Schema previously suffered a truncated CHECK followed by duplicated SQL.
// Reject both regressions before the expensive disposable-Postgres CI job.
const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)]
  .map(x => x[1]);
const expectedTables = [
  'official_quote_locations','official_quote_requests','official_quote_purge_audit',
  'official_quote_client_submissions','official_quote_permissions',
  'official_quote_audit','official_quote_location_usage',
  'official_quote_dhole_outbox','official_quote_dhole_creation_outbox'
];
assert.deepEqual(tables,expectedTables,
  'OfficialQuote SQL must declare each of nine tables exactly once');
const indexes = [...schema.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ([a-z_]+)/g)]
  .map(x => x[1]);
assert.equal(indexes.length,new Set(indexes).size,
  'OfficialQuote SQL must not repeat indexes after a truncated table');
assert.doesNotMatch(schema,/\n\),\s*\n\s*created_at_utc\s+TIMESTAMPTZ/,
  'OfficialQuote SQL must not contain orphaned CREATE TABLE fragments');
assert.match(schema,/request_digest[\s\S]*?created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now\(\)\s*\);/,
  'Client submission table must close before the next index declaration');
has(context,['OfficialQuoteClientSubmissions','request_digest','submission_key'],'EF mapping');
has(retry,['crypto.subtle.digest','availableCrypto.randomUUID',
  'availableCrypto.getRandomValues','sessionStorage',
  'previous.digest !== digest'], 'Per-tab duplicate protection');
for (const frontend of [wizard,gio])
  has(frontend,['prepareQuoteSubmissionAttempt','clearQuoteSubmissionAttempt',
    'X-CF-Quote-Request-Key'],'Quote UI retry protection');
assert.ok(!retry.includes('JSON.stringify({body'), 'Do not persist raw quote bodies in retry state');
// The independent administrative archive feature uses two additive columns
// on the existing quote table; idempotency must still be isolated in its own
// optional key table and must not require changes to historic quote payloads.
const quoteColumnAdditions = [...schema.matchAll(
  /ALTER TABLE public\.official_quote_requests\s+ADD COLUMN[\s\S]*?;/g
)].map(match => match[0]);
assert.equal(quoteColumnAdditions.length, 1,
  'Only the reviewed additive archive migration may extend official quote rows');
assert.match(quoteColumnAdditions[0], /ADD COLUMN IF NOT EXISTS archived_at_utc TIMESTAMPTZ NULL/);
assert.match(quoteColumnAdditions[0], /ADD COLUMN IF NOT EXISTS archived_by_id UUID NULL/);
assert.doesNotMatch(quoteColumnAdditions[0], /submission_key|request_digest|idempotency/i,
  'Client duplicate protection must remain in the optional key table');
has(optionsType,['clientCreateIdempotencyEnabled','typeof v.clientCreateIdempotencyEnabled'],
  'Validated public Dhole capability');
has(catalogEndpoint,['ClientCreateIdempotencyEnabled','DholeSubmission:ClientCreateIdempotencyEnabled'],
  'Public read-only feature capability');
has(backend,['quote_idempotency_unavailable','http.Request.Headers.ContainsKey'],
  'Fail-closed keyed POST when feature toggled off');
for (const source of [wizard,gio])
  has(source,['legacyQuoteResultUncertain','setLegacyQuoteResultUncertain',
    'clientCreateIdempotencyEnabled','serverDedup',
    'if (serverDedup) headers[\'X-CF-Quote-Request-Key\']'],
    'Client must not assume server accepts deduplication');
has(retry,['legacyQuoteResultUncertain','setLegacyQuoteResultUncertain',
  'sessionStorage.setItem(storageKey + \':unverified\', \'1\')',
  'unresolvedKeyedQuoteAttempt'],
  'PII-free blocking marker and downgrade guard');
for (const source of [wizard,gio]) {
  has(source,['unresolvedKeyedQuoteAttempt(CREATE_ATTEMPT_KEY, activeCreateAttempt)',
    'legacyAttemptMayHaveSaved ||','legacyQuoteResultUncertain(CREATE_ATTEMPT_KEY)'],
    'No automatic cross-mode retry of an ambiguous quote');
}
console.log('PASS: browser trusts explicit server opt-in only; keyed POST fails closed if flag goes off.');

console.log('PASS: default-off server creation idempotency, add-only schema, stable client keys with no raw-body storage.');

// Delivery states must remain accurate both before and after the separately
// authorized rollout. Never tell administrators to retry an uncertain POST.
has(admin,[
  "PendingDispatch: 'Guardada; pendiente de procesamiento de envío'",
  "InFlight: 'Intento de envío iniciado; recepción aún no verificada'",
  "HttpAcceptedUnverified: 'HTTP aceptado; pendiente de comprobar en Pricing'",
  "Unconfirmed: 'Resultado de entrega incierto; requiere revisión'",
  "No lo reenvíes: si la respuesta se perdió",
  "no hay reintento automático"
], 'Safe delivery visibility in Administration');
assert.doesNotMatch(admin,/Todavía no existe un dispatcher activo/,
  'Pending state must remain accurate if a dispatcher is later enabled');

console.log('PASS: 103 published API inputs classified; 12 services share exact Pricing codes.');
console.log('PASS: wizard and GIO retain mandatory, conditional and optional user data.');
console.log('PASS: extra cargo lines and insurance currency captured; unverified money IDs omitted.');
console.log('PASS: no remote Dhole calls or API credentials used in parity audit.');
