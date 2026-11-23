import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareOneShotLcl} from '../dhole-one-shot-prepare.mjs';
import {validateDholePublicRateRequestShape}
  from '../dhole-public-rate-request-preview.mjs';

const id={
  service:'f1111111-1111-4111-8111-111111111111',
  incoterm:'f2222222-2222-4222-8222-222222222222',
  pol:'f3333333-3333-4333-8333-333333333333',
  poe:'f4444444-4444-4444-8444-444444444444',
  pod:'f5555555-5555-4555-8555-555555555555',
};
const quoteId='e1111111-1111-4111-8111-111111111111';
function localFixture(){
  const port=(key,code,name,role,country,terminal)=>({
    id:id[key],catalogGroupSlug:key,code,name,value:name,isActive:true,
    metadataJson:JSON.stringify({
      routeRole:role,countryCode:country,terminalType:terminal,transportMode:'Maritime'
    })
  });
  return {
    service:{
      id:id.service,catalogGroupSlug:'pricing-services',code:'INT_TRANSPORT',
      name:'Transporte Internacional',value:'Transporte Internacional',isActive:true,
      metadataJson:'{"rateTermItemIds":["d1111111-1111-4111-8111-111111111111"]}'
    },
    incoterm:{id:id.incoterm,catalogGroupSlug:'incoterms',code:'INC-2026-006',
      name:'CIF',value:'CIF',isActive:true},
    pol:port('pol','POL-2026-074','Shanghai, China','POL','CN','CY'),
    poe:port('poe','POE-2026-002','Limón/Moin, Costa Rica','POE','CR','CY'),
    pod:port('pod','POD-2026-020','Moin, Costa Rica','POD','CR','SD')
  };
}
const now='2026-11-23T14:00:00.000Z';
test('authorized package is scoped to new UUID, exact compact JSON and digest',()=>{
  const packageOut=prepareOneShotLcl(localFixture(),{
    quoteId,verifiedAt:now,approvedAt:now
  });
  const review=JSON.parse(packageOut.reviewJson);
  const approval=JSON.parse(packageOut.approvalJson);
  const b=review.publishedFlatBody;
  assert.equal(review.idempotencyKey,'cf-official-'+quoteId);
  assert.equal(review.readyForSending,false);
  assert.equal(review.remoteSubmissionPermitted,false);
  assert.equal(review.noTransport,true);
  assert.equal(review.applicant,'ENTIRELY_FICTIONAL');
  assert.equal(b.form_cargoObservations,'PRUEBA CONTROLADA AUTORIZADA. DATOS FICTICIOS.');
  assert.deepEqual(validateDholePublicRateRequestShape(b),[]);
  assert.equal(b.form_cargoValue,undefined);
  assert.equal(b.form_currencyId,undefined);
  assert.deepEqual(b.form_serviceIds,[id.service]);
  assert.equal(b.form_originId,id.pol);
  assert.equal(b.form_destinationId,id.poe);
  assert.equal(b.form_podId,id.pod);
  assert.equal(b.form_cargoPackages,3);
  assert.equal(b.form_cargoWeightKg,10);
  assert.ok(b.form_cargoDescription.includes('prueba@example.invalid'));
  assert.equal(approval.quoteId,quoteId);
  assert.equal(approval.scope,'PR274_ONE_QUOTE_LCL_OFFICIAL_DHOLE');
  assert.equal(approval.operatorApproved,true);
  assert.equal(approval.approvedAtUtc,now);
  assert.equal(approval.catalogsVerifiedAtUtc,now);
  const rawBody=packageOut.reviewJson.match(/"publishedFlatBody":(\{.*\})\}$/s)?.[1];
  assert.ok(rawBody);
  const sha=createHash('sha256').update(rawBody,'utf8').digest('hex');
  assert.equal(approval.payloadSha256,sha);
  assert.equal(packageOut.digest,sha);
});
test('no synthetic/fake/malformed quote ID and no inactive catalog is accepted',()=>{
  assert.throws(()=>prepareOneShotLcl(localFixture(),{
    quoteId:'a1111111-1111-4111-8111-111111111112',verifiedAt:now,approvedAt:now
  }),/UUID nuevo/);
  assert.throws(()=>prepareOneShotLcl(localFixture(),{
    quoteId:'not-uuid',verifiedAt:now,approvedAt:now
  }),/UUID nuevo/);
  const bad=localFixture();bad.pod.isActive=false;
  assert.throws(()=>prepareOneShotLcl(bad,{
    quoteId,verifiedAt:now,approvedAt:now
  }),/no activo/);
});
test('reject non-UTC timestamps and divergent verification dates',()=>{
  assert.throws(()=>prepareOneShotLcl(localFixture(),{
    quoteId,verifiedAt:'2026-11-23T08:00:00-06:00',approvedAt:now
  }),/Fechas/);
  assert.throws(()=>prepareOneShotLcl(localFixture(),{
    quoteId,verifiedAt:now,approvedAt:'2026-11-23T14:06:00.000Z'
  }),/Fechas/);
});
