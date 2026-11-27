import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPricingServicesExport} from '../review-dhole-pricing-services-export.mjs';

const codes = [
 'CUSTOMS_CR','CUSTOMS_FOREIGN','STORAGE','INVENTORY_CONTROL','PACKING',
 'EXONERATION','PICKING','RECEPTION','CARGO_INSURANCE','DELIVERY',
 'INT_TRANSPORT','PICKUP'
];
const fixture = () => ({
 success:true, data:codes.map((code,i)=>({
  id:'d3300000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  catalogGroupSlug:'pricing-services',catalogGroupCode:'PRICING_SERVICES',
  code,name:'Nombre de prueba '+i,isActive:true,
  metadataJson:JSON.stringify({
   rateTermItemIds:['f1111111-1111-4111-8111-'+String(i+1).padStart(12,'0')]
  })
 }))
});
test('12 active unique Pricing services map to their own ID, never rateTermItemIds',()=>{
 const sample=fixture();
 const out=reviewPricingServicesExport(sample);
 assert.equal(out.reviewedCodes,12);
 assert.equal(out.readyForRemotePost,false);
 assert.equal(out.source,'manual-browser-export-not-live-api');
 assert.equal(out.codeToId.INT_TRANSPORT,sample.data[10].id);
 assert.notEqual(out.codeToId.INT_TRANSPORT,
  JSON.parse(sample.data[10].metadataJson).rateTermItemIds[0]);
 assert.deepEqual(Object.keys(out.codeToId).sort(),[...codes].sort());
 assert.equal(Object.keys(out).includes('apiKey'),false);
});
test('network export with missing, duplicate, inactive, or unrecognized entries is rejected',()=>{
 const absent=fixture();absent.data.pop();
 assert.throws(()=>reviewPricingServicesExport(absent),/Faltan códigos/);
 const repeated=fixture();repeated.data.push({...repeated.data[0],
  id:'e1111111-1111-4111-8111-111111111111'});
 assert.throws(()=>reviewPricingServicesExport(repeated),/duplicado/);
 const inactive=fixture();inactive.data[0].isActive=false;
 assert.throws(()=>reviewPricingServicesExport(inactive),/inactivo/);
 const noActive=fixture();delete noActive.data[0].isActive;
 assert.throws(()=>reviewPricingServicesExport(noActive),/sin estado/);
 const unknown=fixture();unknown.data[0].code='NATIONAL_TRANSPORT';
 assert.throws(()=>reviewPricingServicesExport(unknown),/inesperado/);
});
test('malformed, duplicate and rate-term-item UUID substitution fail closed',()=>{
 const malformed=fixture();malformed.data[0].id='not-uuid';
 assert.throws(()=>reviewPricingServicesExport(malformed),/UUID inválido/);
 const identical=fixture();identical.data[0].id=identical.data[1].id;
 assert.throws(()=>reviewPricingServicesExport(identical),/repetido/);
 const swapped=fixture();
 swapped.data[10].id=JSON.parse(swapped.data[10].metadataJson).rateTermItemIds[0];
 assert.throws(()=>reviewPricingServicesExport(swapped),/término confundida/);
 const wrongGroup=fixture();wrongGroup.data[0].catalogGroupSlug='land-equipment-types';
 assert.throws(()=>reviewPricingServicesExport(wrongGroup),/inesperado/);
 const malformedMetadata=fixture();malformedMetadata.data[0].metadataJson='{';
 assert.throws(()=>reviewPricingServicesExport(malformedMetadata),/Metadata malformada/);
 const notResponse={data:fixture().data};
 assert.throws(()=>reviewPricingServicesExport(notResponse),/respuesta exitosa/);
});
