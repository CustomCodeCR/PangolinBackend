import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDholeRateRequest, simulatePricingCreate } from '../dhole-rate-request-preview.mjs';

// Pure fake data, never an API Key or a client record.
const ids = {
  quote: 'a1111111-1111-4111-8111-111111111111',
  origin: 'b1111111-1111-4111-8111-111111111111',
  poe: 'c1111111-1111-4111-8111-111111111111',
  pod: 'd1111111-1111-4111-8111-111111111111',
  incoterm: 'e1111111-1111-4111-8111-111111111111',
  service: 'a2222222-2222-4222-8222-222222222222',
  equipment: 'b2222222-2222-4222-8222-222222222222',
};
const lookup = {
  priority: 'Green',
  incotermIds: { CIF: ids.incoterm },
  serviceIds: { 'Transporte internacional': ids.service },
  equipment: {
    'FCL:20 pies|Dry Van': { id: ids.equipment, name: 'Dry Van', code: 'DRY' },
    'FTL:40 pies|Furgón': { id: ids.equipment, name: 'Furgón', code: 'FURGON' },
  },
  podName: 'Puerto final simulado',
};
function quote(mode = 'Maritime', shipmentType = 'FCL') {
  const hasEquipment = shipmentType === 'FCL' || shipmentType === 'FTL';
  return {
    id: ids.quote,
    authorization: 'Authorized',
    customerName: 'Cliente ficticio CI',
    originName: 'Origen ficticio',
    destinationName: 'Destino ficticio',
    form: {
      catalogSource: 'dhole', mode, shipmentType,
      originLocationId: ids.origin, destinationLocationId: ids.poe,
      podLocationId: mode === 'Maritime' ? ids.pod : null,
      incoterm: 'CIF', cargoReadyDate: '2026-12-01',
      services: ['Transporte internacional'],
      cargoDescription: 'Carga ficticia para pruebas',
      cargoFlags: ['Carga peligrosa'],
      equipment: hasEquipment ? [{
        size: shipmentType === 'FCL' ? '20 pies' : '40 pies',
        type: shipmentType === 'FCL' ? 'Dry Van' : 'Furgón',
        quantity: 2, unitWeightsKg: [1200, 1400],
      }] : [],
      packages: hasEquipment ? [] : [{
        description: 'Cajas simuladas', quantity: 3,
        weight: 10, length: 20, width: 12, height: 8,
        stackability: 'NonStackable',
      }],
      weightUnit: 'lb', dimensionUnit: 'in',
      observations: 'Sin datos reales',
    },
  };
}
const expected = [
  ['Maritime', 'FCL', 'Fcl', 'fclContainers'],
  ['Maritime', 'LCL', 'Lcl', 'consolidatedCargoLines'],
  ['Air', 'AIR_LCL', 'Air', 'consolidatedCargoLines'],
  ['Land', 'FTL', 'Ftl', 'landContainers'],
  ['Land', 'LTL', 'Ltl', 'consolidatedCargoLines'],
];
for (const [mode, type, expectedMode, field] of expected) {
  test(mode + '/' + type + ': preview with known catalog IDs, no remote calls', () => {
    const p = previewDholeRateRequest(quote(mode, type), lookup);
    assert.equal(p.readyForContractReview, true, p.blocking.join('; '));
    assert.equal(p.internalPricingRequest.shipmentMode, expectedMode);
    assert.equal(p.internalPricingRequest.payload.form.shipmentMode, expectedMode);
    assert.equal(p.internalPricingRequest.payload.form.incotermId, ids.incoterm);
    assert.deepEqual(p.internalPricingRequest.payload.form.serviceIds, [ids.service]);
    assert.equal(p.idempotencyKey, 'cf-official-' + ids.quote);
    assert.equal(p.internalPricingRequest.payload.form.dangerousCargo, true);
    if (type === 'FCL' || type === 'FTL') {
      const items = p.internalPricingRequest.payload.form[field];
      assert.equal(items.length, 1);
      assert.equal(items[0].containerTypeId, ids.equipment);
      assert.equal(items[0].quantity, 2);
      assert.deepEqual(items[0].unitWeightsKg, [1200, 1400]);
      assert.equal(p.internalPricingRequest.payload.form.cargoWeightKg, 2600);
    } else {
      const lines = p.internalPricingRequest.payload.sellerContext[field];
      assert.equal(lines.length, 1);
      assert.equal(lines[0].weightKg, 4.5359237);
      assert.equal(lines[0].lengthCm, 50.8);
      assert.equal(p.internalPricingRequest.payload.form.cargoPackages, 3);
      assert.equal(p.internalPricingRequest.payload.form.nonStackable, true);
    }
    assert.equal('sellerUserId' in p.internalPricingRequest, false);
    assert.equal('contactEmail' in p.internalPricingRequest.payload, false);
  });
}
test('unapproved quote is forbidden, even if payload is valid', () => {
  assert.throws(() => previewDholeRateRequest({ ...quote(), authorization: 'Pending' }, lookup), /autorización/);
  assert.throws(() => previewDholeRateRequest({ ...quote(), authorization: 'Rejected' }, lookup), /autorización/);
});
test('guest/local legacy source is not allowed into a Dhole submission preview', () => {
  const q = quote();
  q.form.catalogSource = 'local';
  assert.throws(() => previewDholeRateRequest(q, lookup), /catálogos Dhole/);
});
test('invalid mode and route UUID are rejected', () => {
  assert.throws(() => previewDholeRateRequest(quote('Air', 'FCL'), lookup), /Combinación/);
  const q = quote(); q.form.originLocationId = 'not-a-uuid';
  assert.throws(() => previewDholeRateRequest(q, lookup), /Origen/);
  const repeated = quote(); repeated.form.destinationLocationId = ids.origin;
  assert.throws(() => previewDholeRateRequest(repeated, lookup), /no pueden ser iguales/);
  const nonSea = quote('Land', 'FTL'); nonSea.form.podLocationId = ids.pod;
  assert.throws(() => previewDholeRateRequest(nonSea, lookup), /POD no corresponde/);
  const noPod = quote(); noPod.form.podLocationId = null;
  assert.throws(() => previewDholeRateRequest(noPod, lookup), /POD/);
});
test('missing priority or commercial identity is a blocker, never guessed', () => {
  const p = previewDholeRateRequest({ ...quote(), customerName: '' }, { ...lookup, priority: undefined });
  assert.equal(p.readyForContractReview, false);
  assert.ok(p.blocking.some(x => x.startsWith('priority:')));
  assert.ok(p.blocking.some(x => x.startsWith('clientName:')));
});
test('Incoterm, services and equipment without resolvable IDs block preview', () => {
  const p = previewDholeRateRequest(quote(), { priority: 'Green', podName: lookup.podName });
  assert.equal(p.readyForContractReview, false);
  assert.ok(p.blocking.some(x => x.startsWith('incotermId:')));
  assert.ok(p.blocking.some(x => x.startsWith('serviceId:')));
  assert.ok(p.blocking.some(x => x.startsWith('equipment:')));
  assert.equal('incotermId' in p.internalPricingRequest.payload.form, false);
  assert.equal('serviceIds' in p.internalPricingRequest.payload.form, false);
});
test('malformed weights, units, packages, dates, equipment quantity are rejected', () => {
  const wrongDate = quote(); wrongDate.form.cargoReadyDate = '2026-02-30';
  assert.throws(() => previewDholeRateRequest(wrongDate, lookup), /Fecha/);
  const wrongEquipment = quote(); wrongEquipment.form.equipment[0].unitWeightsKg = [12];
  assert.throws(() => previewDholeRateRequest(wrongEquipment, lookup), /cantidad y pesos/);
  const wrongUnits = quote('Air', 'AIR_LCL'); wrongUnits.form.weightUnit = 'stone';
  assert.throws(() => previewDholeRateRequest(wrongUnits, lookup), /Unidad de peso/);
  const wrongPackage = quote('Land', 'LTL'); wrongPackage.form.packages[0].quantity = 0;
  assert.throws(() => previewDholeRateRequest(wrongPackage, lookup), /Bulto/);
});
test('simulated fake provider enforces idempotent retry, conflict, incomplete mapping', () => {
  const store = new Map();
  const draft = previewDholeRateRequest(quote(), lookup);
  const first = simulatePricingCreate(draft, store);
  assert.equal(first.status, 200);
  assert.match(first.id, /^sim-/);
  assert.equal(first.replayed, false);
  const replay = simulatePricingCreate(draft, store);
  assert.deepEqual(replay, { status: 200, id: first.id, replayed: true });
  assert.equal(store.size, 1);
  const altered = structuredClone(draft);
  altered.internalPricingRequest.originName = 'Destino distinto';
  const conflict = simulatePricingCreate(altered, store);
  assert.equal(conflict.status, 409);
  assert.equal(store.size, 1);
  const invalid = previewDholeRateRequest(quote(), { ...lookup, priority: null });
  assert.equal(simulatePricingCreate(invalid, store).status, 422);
  assert.equal(store.size, 1);
});
test('preview has no HTTP transport or real external identifiers', () => {
  const p = previewDholeRateRequest(quote(), lookup);
  assert.ok(p.warnings.every(x => typeof x === 'string'));
  assert.equal('headers' in p, false);
  assert.equal('url' in p, false);
  assert.equal('apiKey' in p, false);
});
