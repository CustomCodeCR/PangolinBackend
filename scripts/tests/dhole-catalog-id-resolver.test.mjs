import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDholeQuoteCatalogIds } from '../dhole-catalog-id-resolver.mjs';
import { previewDholeRateRequest } from '../dhole-rate-request-preview.mjs';

const ids = {
  origin: '11111111-1111-4111-8111-111111111111',
  poe: '22222222-2222-4222-8222-222222222222',
  pod: '33333333-3333-4333-8333-333333333333',
  incoterm: 'a1000000-0000-4000-8000-000000000001',
  size: '44444444-4444-4444-8444-444444444444',
  fcl: '55555555-5555-4555-8555-555555555555',
  truckSize: '66666666-6666-4666-8666-666666666666',
  service: '77777777-7777-4777-8777-777777777777',
  quote: '88888888-8888-4888-8888-888888888888',
};
function fixture(now = Date.now()) {
  const snapshot = (catalog, items) => ({
    catalog, fetchedAtUtc: new Date(now).toISOString(), stale: false, items,
  });
  return {
    incoterms: snapshot('incoterms', [
      { id: ids.incoterm, value: 'CIF', name: 'CIF', code: 'CIF', isActive: true },
      { id: 'a1000000-0000-4000-8000-000000000002', value: 'EXW', name: 'EXW', isActive: false },
    ]),
    pod: snapshot('pod', [{ id: ids.pod, name: 'Destino final simulado', value: 'POD', isActive: true }]),
    'container-sizes': snapshot('container-sizes', [
      { id: ids.size, value: '20', name: '20 pies', isActive: true },
    ]),
    'container-types': snapshot('container-types', [
      { id: ids.fcl, code: '20DV', name: '20 Dry Van', value: '20DV',
        size: '20', kind: 'dry-van', shipmentModes: ['FCL'], modalities: ['Maritime'],
        isActive: true },
      { id: '55555555-5555-4555-8555-555555555599',
        code: '20HC', name: 'High Cube retired', size: '20', kind: 'high-cube',
        shipmentModes: ['FCL'], modalities: ['Maritime'], isActive: false },
    ]),
    'truck-sizes': snapshot('truck-sizes', [
      { id: ids.truckSize, value: '48', name: '48 pies', isActive: true },
    ]),
  };
}
function request(mode = 'Maritime', shipmentType = 'FCL') {
  return { id: ids.quote, authorization: 'Authorized', customerName: 'Empresa ficticia',
    originName: 'POL ficticio', destinationName: 'POE ficticio',
    form: {
      catalogSource: 'dhole', mode, shipmentType,
      originLocationId: ids.origin, destinationLocationId: ids.poe,
      podLocationId: mode === 'Maritime' ? ids.pod : null,
      cargoReadyDate: '2026-12-18', incoterm: 'CIF',
      cargoDescription: 'Carga simulada', services: ['Transporte internacional'],
      equipment: shipmentType === 'FCL' || shipmentType === 'FTL' ? [{
        size: shipmentType === 'FCL' ? '20 pies' : '48 pies',
        type: shipmentType === 'FCL' ? 'Dry Van' : 'Furgón',
        quantity: 1, unitWeightsKg: [1500],
      }] : [],
      packages: shipmentType === 'FCL' || shipmentType === 'FTL' ? [] : [{
        description: 'Caja', quantity: 2, weight: 100,
        length: 25, width: 20, height: 10,
      }],
      weightUnit: 'kg', dimensionUnit: 'cm',
    },
  };
}
test('CIF, FCL size/type combination and maritime POD resolve from mock GET snapshots', () => {
  const quote = request();
  const { lookup, blockers } = resolveDholeQuoteCatalogIds(quote, fixture());
  assert.equal(lookup.incotermIds.CIF, ids.incoterm);
  assert.equal(lookup.equipment['FCL:20 pies|Dry Van'].id, ids.fcl);
  assert.equal(lookup.equipment['FCL:20 pies|Dry Van'].code, '20DV');
  assert.equal(lookup.podName, 'Destino final simulado');
  assert.ok(blockers.some(v => v.startsWith('serviceId:')));
  assert.ok(blockers.some(v => v.startsWith('priority:')));
  assert.ok(blockers.some(v => v.startsWith('externalContract:')));
  const draft = previewDholeRateRequest(quote, {
    ...lookup,
    // Explicit, fictional manual mapping for the test only.
    priority: 'Green',
    serviceIds: { 'Transporte internacional': ids.service },
  });
  assert.equal(draft.readyForContractReview, true);
  assert.equal(draft.internalPricingRequest.payload.form.incotermId, ids.incoterm);
  assert.equal(draft.internalPricingRequest.payload.form.fclContainers[0].containerTypeId, ids.fcl);
  assert.equal(draft.internalPricingRequest.podName, 'Destino final simulado');
});
test('inactive Incoterm is never selected, even when code matches', () => {
  const q = request(); q.form.incoterm = 'EXW';
  const r = resolveDholeQuoteCatalogIds(q, fixture());
  assert.ok(r.blockers.some(v => v.startsWith('incotermId:')));
  assert.equal('EXW' in r.lookup.incotermIds, false);
});
test('duplicate incoterm value and duplicate FCL equipment combination are ambiguous', () => {
  const feed = fixture();
  feed.incoterms.items.push({ id: 'a1000000-0000-4000-8000-000000000003',
    value: 'CIF', name: 'CIF-duplicate', isActive: true });
  feed['container-types'].items.push({ id: '55555555-5555-4555-8555-555555555598',
    code: '20DV2', name: '20 Dry Van #2', size: '20', kind: 'dry-van',
    shipmentModes: ['FCL'], modalities: ['Multimodal'], isActive: true });
  const r = resolveDholeQuoteCatalogIds(request(), feed);
  assert.ok(r.blockers.some(v => v.startsWith('incotermId:')));
  assert.ok(r.blockers.some(v => v.startsWith('equipment:FCL:')));
  assert.equal(Object.keys(r.lookup.equipment).length, 0);
});
test('stale, missing or future snapshots do not resolve IDs', () => {
  const feed = fixture();
  feed.incoterms.stale = true;
  feed['container-types'].fetchedAtUtc = new Date(Date.now() - 10 * 60_000).toISOString();
  feed.pod.fetchedAtUtc = 'not-a-date';
  const r = resolveDholeQuoteCatalogIds(request(), feed);
  assert.ok(r.blockers.some(v => v.startsWith('snapshot:incoterms')));
  assert.ok(r.blockers.some(v => v.startsWith('snapshot:container-types')));
  assert.ok(r.blockers.some(v => v.startsWith('snapshot:pod')));
  assert.deepEqual(r.lookup.incotermIds, {});
  assert.deepEqual(r.lookup.equipment, {});
  assert.equal(r.lookup.podName, undefined);
});
test('trailer size UUID cannot be silently used as Pricing FTL containerTypeId', () => {
  const r = resolveDholeQuoteCatalogIds(request('Land', 'FTL'), fixture());
  assert.ok(r.blockers.some(v => v.includes('falta verificar ID de tipo de furgón')));
  assert.equal(Object.keys(r.lookup.equipment).length, 0);
  const draft = previewDholeRateRequest(request('Land', 'FTL'), {
    ...r.lookup, priority: 'Green',
    serviceIds: { 'Transporte internacional': ids.service },
  });
  assert.equal(draft.readyForContractReview, false);
  assert.ok(draft.blocking.some(v => v.startsWith('equipment:')));
});
test('LCL, AIR_LCL, LTL do not invent equipment IDs and still need service mappings', () => {
  for (const [mode, type] of [
    ['Maritime','LCL'], ['Air','AIR_LCL'], ['Land','LTL'],
  ]) {
    const r = resolveDholeQuoteCatalogIds(request(mode, type), fixture());
    assert.deepEqual(r.lookup.equipment, {});
    assert.equal(r.lookup.incotermIds.CIF, ids.incoterm);
    assert.ok(r.blockers.some(v => v.startsWith('serviceId:')));
  }
});
test('unknown container kinds and fake UUIDs never become equipment references', () => {
  const feed = fixture();
  feed['container-types'].items[0].kind = 'experimental-new-container';
  let r = resolveDholeQuoteCatalogIds(request(), feed);
  assert.ok(r.blockers.some(v => v.startsWith('equipment:')));
  feed['container-types'].items[0].kind = 'dry-van';
  feed['container-types'].items[0].id = 'not-uuid';
  r = resolveDholeQuoteCatalogIds(request(), feed);
  assert.ok(r.blockers.some(v => v.startsWith('equipment:')));
});
test('no API calls are available from the read-only mapping output', () => {
  const r = resolveDholeQuoteCatalogIds(request(), fixture());
  assert.deepEqual(Object.keys(r).sort(), ['blockers','lookup']);
  assert.equal('apiKey' in r, false);
  assert.equal('url' in r, false);
});


function withApprovedReadOnlyLookups(feed, now = Date.now()) {
  const snapshot = (catalog, items) => ({
    catalog, fetchedAtUtc: new Date(now).toISOString(), stale: false, items,
  });
  feed['pricing-services'] = snapshot('pricing-services', [{
    id: ids.service, code: 'INTERNATIONAL', name: 'Transporte internacional',
    value: 'Transporte internacional',
  }]);
  feed['land-equipment-types'] = snapshot('land-equipment-types', [{
    id: '99999999-9999-4999-8999-999999999999',
    code: '48FTL', name: 'Furgón 48', value: '48FTL',
    size: '48', kind: 'furgon',
  }]);
  return feed;
}
test('read-only pricing-services resolves service UUID only for a unique exact name', () => {
  const feed = withApprovedReadOnlyLookups(fixture());
  const q = request();
  const r = resolveDholeQuoteCatalogIds(q, feed);
  assert.equal(r.lookup.serviceIds['Transporte internacional'], ids.service);
  assert.equal(r.blockers.some(x => x.startsWith('serviceId:')), false);
  assert.ok(r.blockers.some(x => x.startsWith('externalContract:')));
  assert.ok(r.blockers.some(x => x.startsWith('priority:')));
  const draft = previewDholeRateRequest(q, { ...r.lookup, priority: 'Green' });
  assert.equal(draft.readyForContractReview, true);
  assert.deepEqual(draft.internalPricingRequest.payload.form.serviceIds, [ids.service]);
});
test('duplicate, stale and unmatched Pricing service catalogues never yield a guessed UUID', () => {
  const dup = withApprovedReadOnlyLookups(fixture());
  dup['pricing-services'].items.push({
    id: '88888888-8888-4888-8888-888888888888', code: 'DUPLICATE',
    name: 'Transporte internacional', value: 'Transporte internacional',
  });
  let r = resolveDholeQuoteCatalogIds(request(), dup);
  assert.equal(r.lookup.serviceIds['Transporte internacional'], undefined);
  assert.ok(r.blockers.some(x => x.startsWith('serviceId:')));

  const stale = withApprovedReadOnlyLookups(fixture());
  stale['pricing-services'].stale = true;
  r = resolveDholeQuoteCatalogIds(request(), stale);
  assert.equal(r.lookup.serviceIds['Transporte internacional'], undefined);
  assert.ok(r.blockers.some(x => x.startsWith('snapshot:pricing-services')));

  const unmatched = withApprovedReadOnlyLookups(fixture());
  unmatched['pricing-services'].items[0].name = 'Transporte nacional';
  unmatched['pricing-services'].items[0].value = 'Transporte nacional';
  r = resolveDholeQuoteCatalogIds(request(), unmatched);
  assert.equal(r.lookup.serviceIds['Transporte internacional'], undefined);
  assert.ok(r.blockers.some(x => x.startsWith('serviceId:')));
});
test('land-equipment-types can supply FTL type UUID, never truck size UUID', () => {
  const q = request('Land', 'FTL');
  const r = resolveDholeQuoteCatalogIds(q, withApprovedReadOnlyLookups(fixture()));
  const type = r.lookup.equipment['FTL:48 pies|Furgón'];
  assert.equal(type.id, '99999999-9999-4999-8999-999999999999');
  assert.notEqual(type.id, ids.truckSize);
  assert.equal(type.code, '48FTL');
  assert.equal(r.blockers.some(x => x.startsWith('equipment:')), false);
  const draft = previewDholeRateRequest(q, { ...r.lookup, priority: 'Yellow' });
  assert.equal(draft.readyForContractReview, true);
  assert.equal(draft.internalPricingRequest.payload.form.landContainers[0].containerTypeId, type.id);
});
test('FTL type wrong size, stale data or ambiguous type never maps', () => {
  const q = request('Land', 'FTL');
  const wrong = withApprovedReadOnlyLookups(fixture());
  wrong['land-equipment-types'].items[0].size = '40';
  let r = resolveDholeQuoteCatalogIds(q, wrong);
  assert.deepEqual(r.lookup.equipment, {});
  assert.ok(r.blockers.some(x => x.startsWith('equipment:')));

  const stale = withApprovedReadOnlyLookups(fixture());
  stale['land-equipment-types'].fetchedAtUtc = new Date(Date.now() - 601000).toISOString();
  r = resolveDholeQuoteCatalogIds(q, stale);
  assert.deepEqual(r.lookup.equipment, {});
  assert.ok(r.blockers.some(x => x.startsWith('snapshot:land-equipment-types')));

  const duplicate = withApprovedReadOnlyLookups(fixture());
  duplicate['land-equipment-types'].items.push({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    code: '48FTL2', name: 'Furgón', value: 'FURGON',
    size: '48', kind: 'furgon',
  });
  r = resolveDholeQuoteCatalogIds(q, duplicate);
  assert.deepEqual(r.lookup.equipment, {});
  assert.ok(r.blockers.some(x => x.startsWith('equipment:')));
});
