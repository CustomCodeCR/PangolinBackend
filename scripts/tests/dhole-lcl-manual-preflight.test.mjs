import test from 'node:test';
import assert from 'node:assert/strict';
import {previewObservedLclRoute} from '../dhole-lcl-manual-preflight.mjs';
import {validateDholePublicRateRequestShape}
  from '../dhole-public-rate-request-preview.mjs';

// All IDs in tests are synthetic. Production IDs exist ONLY in the external
// locally supplied evidence JSON; tests do not call Dhole or require secrets.
const ids={
  service:'f1111111-1111-4111-8111-111111111111',
  incoterm:'f2222222-2222-4222-8222-222222222222',
  pol:'f3333333-3333-4333-8333-333333333333',
  poe:'f4444444-4444-4444-8444-444444444444',
  pod:'f5555555-5555-4555-8555-555555555555',
};
function fixture(){
  const location=(key,group,code,name,role,country,terminal)=>({
    id:ids[key],catalogGroupSlug:group,code,name,value:name,isActive:true,
    metadataJson:JSON.stringify({
      routeRole:role,countryCode:country,terminalType:terminal,
      transportMode:'Maritime',pricingWorkflow:true
    })
  });
  return {
    service:{
      id:ids.service,catalogGroupSlug:'pricing-services',code:'INT_TRANSPORT',
      name:'Transporte Internacional',value:'Transporte Internacional',isActive:true,
      metadataJson:JSON.stringify({rateTermItemIds:['e1111111-1111-4111-8111-111111111111']})
    },
    incoterm:{
      id:ids.incoterm,catalogGroupSlug:'incoterms',code:'INC-2026-006',slug:'cfi',
      name:'CIF',value:'CIF',isActive:true
    },
    pol:location('pol','pol','POL-2026-074','Shanghai, China','POL','CN','CY'),
    poe:location('poe','poe','POE-2026-002','Limón/Moin, Costa Rica','POE','CR','CY'),
    pod:location('pod','pod','POD-2026-020','Moin, Costa Rica','POD','CR','SD')
  };
}

test('five manual catalogue rows build complete LCL published flat body but NEVER send',()=>{
  const data=fixture();
  const review=previewObservedLclRoute(data);
  assert.equal(review.remoteSubmissionPermitted,false);
  assert.equal(review.readyForSending,false);
  assert.equal(review.noTransport,true);
  assert.equal(review.authorization,'SIMULATED_FOR_OFFLINE_REVIEW');
  assert.equal(review.provenance,'MANUAL_CONFIG_SNAPSHOT_NOT_RUNTIME_VERIFIED');
  assert.equal(review.idempotencyKey,'cf-official-a1111111-1111-4111-8111-111111111112');
  assert.equal(review.blockers.length,4);
  const b=review.publishedFlatBody;
  assert.deepEqual(validateDholePublicRateRequestShape(b),[]);
  assert.equal(b.shipmentMode,'Lcl');
  assert.equal(b.priority,'Green');
  assert.equal(b.form_rateType,'Spot');
  assert.equal(b.form_modality,'Maritime');
  assert.equal(b.form_originId,data.pol.id);
  assert.equal(b.form_destinationId,data.poe.id);
  assert.equal(b.form_podId,data.pod.id);
  assert.equal(b.poeId,data.poe.id);
  assert.equal(b.podId,data.pod.id);
  assert.equal(b.poeName,'Limón/Moin, Costa Rica');
  assert.equal(b.podName,'Moin, Costa Rica');
  assert.deepEqual(b.form_serviceIds,[data.service.id]);
  assert.equal(b.form_incotermId,data.incoterm.id);
  assert.equal(b.requestContext_poeId,data.poe.id);
  assert.equal(b.requestContext_podId,data.pod.id);
  assert.equal(b.form_cargoPackages,3);
  assert.equal(b.form_cargoWeightKg,10);
  assert.equal(b.sellerContext_consolidatedCargoLines[0].packages,3);
  assert.equal(b.sellerContext_consolidatedCargoLines[0].weightKg,10);
  assert.ok(b.form_cargoDescription.includes(
    'Repuestos automotrices de prueba (sin carga real)\n\nSolicitante desde la web de Castro Fallas:'));
  for(const label of ['Nombre: Persona de Prueba','Correo: prueba@example.invalid',
    'Teléfono: +506 0000-0000'])
    assert.ok(b.form_cargoDescription.includes(label));
  for(const forbidden of ['clientName','executiveName','sellerUserId',
    'form_clientName','form_executiveName','form_otherReferences',
    'form_fclContainers','form_landContainers','contactName','contactEmail','contactPhone'])
    assert.equal(Object.hasOwn(b,forbidden),false,forbidden);
  assert.equal(Object.hasOwn(review,'apiKey'),false);
  assert.equal(Object.hasOwn(review,'httpUrl'),false);
  assert.notEqual(data.poe.id,data.pod.id);
});
test('misclassified POE airport or POL/POE/POD role changes fail closed',()=>{
  for(const [key,metadata] of [
    ['poe',{transportMode:'Air',terminalType:'APT'}],
    ['poe',{routeRole:'POL'}],
    ['pol',{routeRole:'POE'}],
    ['pod',{routeRole:'POE'}],
    ['pod',{terminalType:'CY'}],
    ['pol',{countryCode:'CR'}]
  ]){
    const data=fixture();
    data[key].metadataJson=JSON.stringify({
      ...JSON.parse(data[key].metadataJson),...metadata
    });
    assert.throws(()=>previewObservedLclRoute(data),/rol\/modalidad\/terminal\/país no coinciden/);
  }
});
test('missing, inactive, duplicate and wrong catalog IDs cannot become preview',()=>{
  const inactive=fixture();inactive.service.isActive=false;
  assert.throws(()=>previewObservedLclRoute(inactive),/no activo/);
  const duplicated=fixture();duplicated.pod.id=duplicated.poe.id;
  assert.throws(()=>previewObservedLclRoute(duplicated),/repetido/);
  const missing=fixture();delete missing.incoterm;
  assert.throws(()=>previewObservedLclRoute(missing),/requieren exactamente/);
  const swapped=fixture();swapped.service.id=JSON.parse(swapped.service.metadataJson).rateTermItemIds[0];
  assert.throws(()=>previewObservedLclRoute(swapped),/rateTermItemIds/);
  const wrongCif=fixture();wrongCif.incoterm.value='CFR';
  assert.throws(()=>previewObservedLclRoute(wrongCif),/valor de negocio inesperado/);
  const wrongPoe=fixture();wrongPoe.poe.catalogGroupSlug='pod';
  assert.throws(()=>previewObservedLclRoute(wrongPoe),/grupo equivocado/);
  const invalid=fixture();invalid.pol.id='not-uuid';
  assert.throws(()=>previewObservedLclRoute(invalid),/UUID/);
});
test('API keys cannot be smuggled into the evidence envelope',()=>{
  const key=fixture();key['X-Api-Key']='DO_NOT_ACCEPT';
  assert.throws(()=>previewObservedLclRoute(key),/requieren exactamente/);
});
