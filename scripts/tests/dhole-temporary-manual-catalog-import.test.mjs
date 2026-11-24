import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewTemporaryManualCatalogs } from '../dhole-temporary-manual-catalog-import.mjs';
import { resolveDholeQuoteCatalogIds } from '../dhole-catalog-id-resolver.mjs';

const codes = [
  'INT_TRANSPORT','CUSTOMS_CR','CUSTOMS_FOREIGN','STORAGE',
  'INVENTORY_CONTROL','PACKING','EXONERATION','PICKING',
  'RECEPTION','CARGO_INSURANCE','DELIVERY','PICKUP'
];
const kinds = {
  DRY_VAN:'dry-van', PLATFORM:'platform',
  REEFER:'reefer', CURTAIN_SIDE:'curtain-side'
};
const id = n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const reviewedAt = '2026-11-23T17:00:00.000Z';
const now = Date.parse(reviewedAt);
function fixtures() {
  let n = 1;
  return {
    pricing:{success:true,data:codes.map(code=>({
      id:id(n++), code, name:'Nombre '+code, value:'Valor '+code,
      isActive:true, catalogGroupSlug:'pricing-services',
      catalogGroupCode:'PRICING_SERVICES'
    }))},
    land:{success:true,data:['24','26','48','53'].flatMap(size=>
      Object.entries(kinds).map(([suffix,kind])=>({
        id:id(n++),code:size+'_'+suffix,
        name:size+' '+kind,value:size+' '+kind,isActive:true,
        catalogGroupSlug:'land-equipment-types',
        metadataJson:JSON.stringify({size,kind})
      })))}
  };
}
const review = (f=fixtures(),stamp=reviewedAt,time=now)=>
  reviewTemporaryManualCatalogs(f.pricing,f.land,stamp,time);
const snap = (catalog,items)=>({
  catalog,items,fetchedAtUtc:reviewedAt,stale:false
});

test('manual internal Config export resolves all 12 and 16 with fictional UUIDs only',()=>{
  const result=review();
  assert.equal(result.readyForRemotePost,false);
  assert.equal(result.noTransport,true);
  assert.equal(result.reviewedServiceCount,12);
  assert.equal(result.reviewedFtlCombinationCount,16);
  assert.equal(result.expiresAtUtc,'2026-11-23T17:05:00.000Z');
  assert.equal(result.snapshots['pricing-services'].items.length,12);
  assert.equal(result.snapshots['land-equipment-types'].items.length,16);
  assert.deepEqual(Object.keys(result).includes('apiKey'),false);
  assert.equal(JSON.stringify(result).includes('metadataJson'),false,
    'Raw metadata must not leak into reviewed output');
  assert.equal(JSON.stringify(result).includes('rateTermItemIds'),false,
    'Internal pricing term IDs must not be mistaken for service IDs');
});

test('existing code resolver maps selected service and exact FTL equipment pair',()=>{
  const f=fixtures(),manual=review(f);
  const sources={
    ...manual.snapshots,
    'incoterms':snap('incoterms',[{id:id(45),value:'CIF',isActive:true}]),
    'truck-sizes':snap('truck-sizes',[{id:id(46),name:'48 pies',value:'48',isActive:true}])
  };
  const quote={form:{catalogSource:'dhole',mode:'Land',shipmentType:'FTL',
    incoterm:'CIF',services:['Transporte internacional'],
    equipment:[{size:'48 pies',type:'Furgón seco'}]}};
  const result=resolveDholeQuoteCatalogIds(quote,sources,now);
  assert.equal(result.lookup.serviceIds['Transporte internacional'],
    f.pricing.data.find(x=>x.code==='INT_TRANSPORT').id);
  assert.equal(result.lookup.equipment['FTL:48 pies|Furgón seco'].id,
    f.land.data.find(x=>x.code==='48_DRY_VAN').id);
  assert.equal(result.lookup.incotermIds.CIF,id(45));
  assert.ok(result.blockers.includes('priority: debe elegirla un administrador autorizado'));
  assert.ok(result.blockers.some(x=>x.startsWith('externalContract:')),
    'Manual mapping never grants remote dispatch authorization');
});

test('reject missing, unknown, inactive, duplicated or invalid Pricing rows',()=>{
  for(const alter of [
    f=>f.pricing.data.pop(),
    f=>f.pricing.data[0].isActive=false,
    f=>f.pricing.data[1].id=f.pricing.data[0].id,
    f=>f.pricing.data[0].code=f.pricing.data[1].code,
    f=>f.pricing.data[0].catalogGroupSlug='not-pricing',
    f=>f.pricing.data[0].id='not-uuid',
    f=>f.pricing.data[0].metadataJson='{invalid-json'
  ]){
    const f=fixtures();alter(f);
    assert.throws(()=>review(f));
  }
});

test('reject wrong group, inactive, incomplete, duplicate or mismatched FTL catalog',()=>{
  for(const alter of [
    f=>f.land.data.pop(),
    f=>f.land.data[0].catalogGroupSlug='wrong',
    f=>f.land.data[0].isActive=false,
    f=>f.land.data[0].id='00000000-0000-0000-0000-000000000000',
    f=>f.land.data[1].id=f.land.data[0].id,
    f=>f.land.data[0].code=f.land.data[1].code,
    f=>f.land.data[0].metadataJson=JSON.stringify({size:'53',kind:'dry-van'}),
    f=>f.land.data[0].metadataJson=JSON.stringify({size:'24',kind:'experimental'}),
    f=>f.land.data[0].metadataJson='{invalid',
    f=>{f.land.data[0].size='53';}
  ]){
    const f=fixtures();alter(f);
    assert.throws(()=>review(f));
  }
});

test('manual review expiry is five minutes, never indefinite',()=>{
  const f=fixtures();
  assert.throws(()=>review(f,'2026-11-23T16:54:59.999Z',now));
  assert.throws(()=>review(f,'2026-11-23T17:00:01.000Z',now));
  assert.throws(()=>review(f,'invalid UTC',now));
  assert.throws(()=>review(f,reviewedAt,NaN));
});
