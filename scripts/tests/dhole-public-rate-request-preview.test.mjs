import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewDholeRateRequest } from '../dhole-rate-request-preview.mjs';
import {
  previewDholePublicRateRequest, validateDholePublicRateRequestShape,
  dholePublicRateRequestContractReview
} from '../dhole-public-rate-request-preview.mjs';

const contract = JSON.parse(readFileSync(
  new URL('../contracts/dhole-solicitar-tarifa-published-20261120.json',import.meta.url),'utf8'));
const IDs = {
  quote:'a1111111-1111-4111-8111-111111111111',
  origin:'b1111111-1111-4111-8111-111111111111',
  poe:'c1111111-1111-4111-8111-111111111111',
  pod:'d1111111-1111-4111-8111-111111111111',
  incoterm:'e1111111-1111-4111-8111-111111111111',
  service:'a2222222-2222-4222-8222-222222222222',
  equipment:'b2222222-2222-4222-8222-222222222222',
};
const lookups = {
  priority:'Green', incotermIds:{ CIF:IDs.incoterm },
  serviceIds:{'Transporte internacional':IDs.service},
  equipment:{
    'FCL:20 pies|Dry Van':{id:IDs.equipment,name:'Dry Van',code:'20DV'},
    'FTL:48 pies|Furgón seco':{id:IDs.equipment,name:'Furgón seco',code:'48_DRY_VAN'},
  },
  podName:'POD simulado',
};
function quote(mode='Maritime',shipmentType='FCL') {
  const full=['FCL','FTL'].includes(shipmentType);
  return {
    id:IDs.quote, authorization:'Authorized', customerName:'Nombre comercial privado ficticio',
    contactEmail:'privado@example.invalid', contactPhone:'00000000', contactName:'Contacto CI',
    originName:'Origen de prueba', destinationName:'Destino de prueba',
    form:{
      catalogSource:'dhole',mode,shipmentType,
      originLocationId:IDs.origin,destinationLocationId:IDs.poe,
      podLocationId:mode==='Maritime'?IDs.pod:null,
      cargoReadyDate:'2026-12-18',incoterm:'CIF',
      cargoDescription:'Mercancía CI',services:['Transporte internacional'],
      equipment:full?[{
        size:shipmentType==='FCL'?'20 pies':'48 pies',
        type:shipmentType==='FCL'?'Dry Van':'Furgón seco',
        quantity:2,unitWeightsKg:[1100,1300],
      }]:[],
      packages:full?[]:[{description:'Caja de prueba',quantity:3,weight:10,
        length:20,width:12,height:8,stackability:'NonStackable'}],
      weightUnit:'lb',dimensionUnit:'in', observations:'Solo prueba',
      cargoFlags:['Carga peligrosa'], cargoValue:1600,
      deliveryAddress:'Lugar ficticio'
    }
  };
}
function prepared(mode,type) {
  const internal=previewDholeRateRequest(quote(mode,type),lookups);
  assert.equal(internal.readyForContractReview,true,internal.blocking.join(' | '));
  return previewDholePublicRateRequest(internal);
}
test('official snapshot contains exactly 103 published fields, one required, and locked defaults', () => {
  const meta=dholePublicRateRequestContractReview();
  assert.equal(meta.publishedInputCount,103);
  assert.deepEqual(meta.required,['priority']);
  assert.deepEqual(meta.fixedDefaults,{clientName:'CLIENTE GENERICO',executiveName:'Castro Fallas'});
  assert.deepEqual(meta.outputFields,['value']);
  assert.equal(meta.slug,'solicitar-tarifa-wjicua4');
  assert.equal(meta.noTransport,true);
  assert.equal(new Set(contract.inputs.map(x=>x.public)).size,103);
  assert.ok(!contract.inputs.some(x=>x.internal==='sellerUserId'));
});
const MODES=[
  ['Maritime','FCL','Fcl','Maritime','form_fclContainers'],
  ['Maritime','LCL','Lcl','Maritime','sellerContext_consolidatedCargoLines'],
  ['Air','AIR_LCL','Air','Air','sellerContext_consolidatedCargoLines'],
  ['Land','FTL','Ftl','Land','form_landContainers'],
  ['Land','LTL','Ltl','Land','sellerContext_consolidatedCargoLines']
];
for(const [mode,type,shipment,modality,field] of MODES) {
  test(mode+'/'+type+': flat public mapping is contract-allowlisted, offline and faithful',()=>{
    const result=prepared(mode,type);
    assert.equal(result.readyForContractReview,true);
    assert.equal(result.readyForSending,false,'Business, credentials, runtime GET and real response remain blocked');
    assert.ok(result.blockers.length>=4);
    assert.equal(result.noTransport,true);
    assert.equal(result.contractSlug,contract.slug);
    assert.equal(result.idempotencyKey,'cf-official-'+IDs.quote);
    assert.ok(result.body);
    const b=result.body;
    assert.equal(b.priority,'Green');
    assert.equal(b.shipmentMode,shipment);
    assert.equal(b.form_rateType,'Spot');
    assert.equal(b.form_modality,modality);
    assert.equal(b.form_shipmentMode,shipment);
    assert.equal(b.poeId,IDs.poe);
    assert.equal(b.form_destinationId,IDs.poe);
    assert.equal(b.form_originId,IDs.origin);
    assert.equal(b.form_incotermId,IDs.incoterm);
    assert.deepEqual(b.form_serviceIds,[IDs.service]);
    assert.ok(b.form_cargoDescription.startsWith('Mercancía CI\n\nSolicitante desde la web de Castro Fallas:'));
    assert.ok(b.form_cargoDescription.includes('Nombre: Contacto CI'));
    assert.ok(b.form_cargoDescription.includes('Correo: privado@example.invalid'));
    assert.ok(b.form_cargoDescription.includes('Teléfono: 00000000'));
    assert.equal(b.form_cargoValue,1600);
    assert.equal(b.sellerContext_cargoReadyDate,'2026-12-18');
    assert.equal(b.requestContext_incotermName,'CIF');
    assert.deepEqual(validateDholePublicRateRequestShape(b),[]);
    assert.ok(Object.keys(b).every(key=>contract.inputs.some(x=>x.public===key)));
    for(const forbidden of ['payload','clientName','executiveName','sellerUserId',
      'form_clientName','form_executiveName','form_otherReferences',
      'contactName','contactEmail','contactPhone','apiKey','url','headers']) {
      assert.equal(forbidden in b,false,forbidden+' must not be transmitted');
      assert.equal(forbidden in result,false,forbidden+' must not leak at top level');
    }
    if(mode==='Maritime'){
      assert.equal(b.podId,IDs.pod);
      assert.equal(b.podName,'POD simulado');
      assert.equal(b.form_podId,IDs.pod);
    }else {
      assert.equal('podId' in b,false);
      assert.equal('form_podId' in b,false);
    }
    if(type==='FCL'||type==='FTL'){
      const items=b[field];
      assert.equal(items.length,1);
      assert.equal(items[0].containerTypeId,IDs.equipment);
      assert.equal(items[0].quantity,2);
      assert.deepEqual(items[0].unitWeightsKg,[1100,1300]);
      assert.equal(b.form_cargoWeightKg,2400);
      assert.equal('sellerContext_consolidatedCargoLines' in b,false);
      assert.equal(type==='FCL'?'form_landContainers' in b:'form_fclContainers' in b,false);
    }else{
      assert.equal(b[field].length,1);
      assert.equal(b[field][0].packages,3);
      assert.ok(Math.abs(b[field][0].weightKg-4.5359237)<1e-8);
      assert.equal(b[field][0].lengthCm,50.8);
      assert.equal(b.form_cargoPackages,3);
      assert.ok(Math.abs(b.form_cargoWeightKg-4.5359237)<1e-8);
      assert.equal('form_fclContainers' in b,false);
      assert.equal('form_landContainers' in b,false);
    }
  });
}
test('web applicant contact is placed only in the published cargo description',()=>{
  const guest=quote();
  guest.customerName='CONTACTO-VISITANTE-CONFUNDIBLE';
  guest.contactName='CONTACTO-VISITANTE-CONFUNDIBLE';
  guest.contactEmail='visitante-privado@example.invalid';
  guest.contactPhone='+506 0000-0000';

  const registered=quote();
  registered.customerName='EMPRESA-REGISTRADA-PRIVADA';
  registered.contactName='CONTACTO-REGISTRADO-PRIVADO';
  registered.contactEmail='registrado-privado@example.invalid';
  registered.contactPhone='+506 1111-1111';

  const baseline=prepared('Maritime','FCL').body;
  for(const item of [guest,registered]) {
    const originalDescription=item.form.cargoDescription;
    const internal=previewDholeRateRequest(item,lookups);
    const result=previewDholePublicRateRequest(internal);
    assert.equal(result.readyForSending,false);
    assert.ok(result.blockers.some(reason=>reason.startsWith('commercialIdentity:')));
    assert.ok(result.body.form_cargoDescription.startsWith(
      originalDescription+'\n\nSolicitante desde la web de Castro Fallas:'));
    for(const [label,value] of [
      ['Nombre',item.contactName], ['Correo',item.contactEmail],
      ['Teléfono',item.contactPhone]
    ]) assert.ok(result.body.form_cargoDescription.includes(label+': '+value));
    assert.equal(item.form.cargoDescription,originalDescription,'Original quote must not be mutated');

    // No company registration is guessed from a visitor's name. The
    // registered company's identity is NOT injected into the locked Dhole client.
    if(item===registered)
      assert.ok(!JSON.stringify(result.body).includes(item.customerName));
    for(const key of ['clientName','executiveName','sellerUserId',
      'form_clientName','form_executiveName','form_clientId',
      'form_executiveId','requestContext_executiveName']) {
      assert.equal(Object.hasOwn(result.body,key),false,key+' must remain untouched');
    }
    const nonDescription=structuredClone(result.body);
    const baselineNonDescription=structuredClone(baseline);
    delete nonDescription.form_cargoDescription;
    delete baselineNonDescription.form_cargoDescription;
    assert.deepEqual(nonDescription,baselineNonDescription,
      'Contact updates must not alter any other Pricing field');
    for(const privateValue of [item.contactEmail,item.contactPhone]) {
      assert.ok(!JSON.stringify(nonDescription).includes(privateValue),
        'Applicant data may only appear inside the approved description field');
    }
  }
  assert.deepEqual(contract.defaults,{
    clientName:'CLIENTE GENERICO',executiveName:'Castro Fallas'
  });
});
test('missing, multiline or overly long applicant data fails closed',()=>{
  const missing=quote(); delete missing.contactEmail;
  assert.throws(()=>previewDholeRateRequest(missing,lookups),/Datos del solicitante inválidos/);
  const unsafe=quote(); unsafe.contactName='Ana\nPrioridad: Red';
  assert.throws(()=>previewDholeRateRequest(unsafe,lookups),/Datos del solicitante inválidos/);
  const overflow=quote(); overflow.form.cargoDescription='x'.repeat(3999);
  assert.throws(()=>previewDholeRateRequest(overflow,lookups),/excede 4000/);
});

test('Gateway-style reconstruction from flat fields restores only documented nested paths',()=>{
  const flat=prepared('Land','FTL').body;
  const rebuilt=structuredClone(contract.defaults);
  for(const [key,value] of Object.entries(flat)){
    const mapping=contract.inputs.find(x=>x.public===key);
    assert.ok(mapping,'Public field must be published');
    const path=mapping.internal.split('.');
    let obj=rebuilt;
    for(const step of path.slice(0,-1))obj=obj[step]??={};
    obj[path.at(-1)]=structuredClone(value);
  }
  assert.equal(rebuilt.clientName,'CLIENTE GENERICO');
  assert.equal(rebuilt.executiveName,'Castro Fallas');
  assert.equal(rebuilt.payload.form.rateType,'Spot');
  assert.equal(rebuilt.payload.form.modality,'Land');
  assert.equal(rebuilt.payload.form.landContainers[0].containerTypeId,IDs.equipment);
  assert.deepEqual(rebuilt.payload.form.serviceIds,[IDs.service]);
  assert.equal(rebuilt.payload.requestContext.incotermName,'CIF');
  assert.equal(rebuilt.payload.sellerContext.cargoReadyDate,'2026-12-18');
  assert.equal('contactEmail' in rebuilt,false);
});
test('idempotency key is stable for the same quote and changes for a different quote',()=>{
  const internal=previewDholeRateRequest(quote(),lookups);
  const a=previewDholePublicRateRequest(internal);
  const b=previewDholePublicRateRequest(internal);
  assert.equal(a.idempotencyKey,b.idempotencyKey);
  assert.deepEqual(a.body,b.body);
  const altered=quote();
  altered.id='ffffffff-ffff-4fff-8fff-ffffffffffff';
  const c=previewDholePublicRateRequest(previewDholeRateRequest(altered,lookups));
  assert.notEqual(a.idempotencyKey,c.idempotencyKey);
  assert.ok(a.idempotencyKey.length>=8&&a.idempotencyKey.length<=128);
});
test('unapproved, unmapped, local or missing fields never produce a public body',()=>{
  const pending=quote();pending.authorization='Pending';
  assert.throws(()=>previewDholeRateRequest(pending,lookups),/autorización/);
  const unmapped=previewDholeRateRequest(quote(),{...lookups,serviceIds:{}});
  const result=previewDholePublicRateRequest(unmapped);
  assert.equal(result.body,null);
  assert.equal(result.readyForSending,false);
  assert.ok(result.blockers.some(x=>x.startsWith('serviceId:')));
  const national=quote();national.form.services=['Transporte nacional'];
  const unresolved=previewDholeRateRequest(national,lookups);
  assert.equal(previewDholePublicRateRequest(unresolved).body,null);
  const local=quote();local.form.catalogSource='local';
  assert.throws(()=>previewDholeRateRequest(local,lookups),/catálogos Dhole/);
});
test('unknown public fields, locked values, arbitrary nested payloads and PII are rejected',()=>{
  const good=prepared('Air','AIR_LCL').body;
  const injections=[
    {...good,clientName:'Sustitución prohibida'},
    {...good,executiveName:'Otro'},
    {...good,sellerUserId:IDs.quote},
    {...good,form_clientName:'Cliente sin autorización comercial'},
    {...good,contactEmail:'personal@example.invalid'},
    {...good,payload:{form:{clientId:IDs.quote}}},
    {...good,unknownField:'x'},
    {...good,priority:'Critical'},
    {...good,form_serviceIds:['mal-uuid']},
    {...good,sellerContext_consolidatedCargoLines:[{...good.sellerContext_consolidatedCargoLines[0],contactPhone:'injected'}]},
  ];
  for(const injection of injections){
    const errors=validateDholePublicRateRequestShape(injection);
    assert.ok(errors.length,'invalid input must be rejected: '+JSON.stringify(injection).slice(-120));
  }
});
test('every published field outside Castro Fallas outbound allowlist is rejected',()=>{
  const meta=dholePublicRateRequestContractReview();
  const allowed=new Set(meta.fieldsEmitted);
  const valid=prepared('Land','FTL').body;
  const excluded=contract.inputs.filter(field=>!allowed.has(field.public));
  assert.ok(excluded.length>0,'Published fields should be narrower than outbound fields');
  for(const field of excluded){
    const candidate={...valid,[field.public]:'synthetic-test-value'};
    const problems=validateDholePublicRateRequestShape(candidate);
    assert.ok(problems.includes('not-allowlisted:'+field.public),
      'Unexpected published field was accepted: '+field.public);
  }
  for(const field of ['form_clientId','form_executiveId','requestContext_executiveName',
    'supportDocuments','sellerContext_chargeableVolumeCbm']){
    assert.ok(excluded.some(x=>x.public===field),
      'Sensitive or unconfirmed field must stay excluded: '+field);
  }
  assert.deepEqual(validateDholePublicRateRequestShape(valid),[]);
});

test('payload cannot carry malformed, obsolete or fabricated equipment UUID and quantities',()=>{
  const valid=prepared('Maritime','FCL').body;
  const changes=[
    x=>{x.form_fclContainers[0].containerTypeId='not-uuid'},
    x=>{x.form_fclContainers[0].unitWeightsKg=[100]},
    x=>{x.form_fclContainers[0].quantity=0},
    x=>{x.form_fclContainers[0].freightSaleAmount=1},
  ];
  for(const change of changes){
    const body=structuredClone(valid);change(body);
    assert.ok(validateDholePublicRateRequestShape(body).length>0);
  }
});
test('cross-context route IDs must agree before building a public request',()=>{
  const make=()=>structuredClone(previewDholeRateRequest(quote('Maritime','FCL'),lookups));
  for(const mismatch of [
    p=>{p.internalPricingRequest.payload.requestContext.poeId=IDs.origin;},
    p=>{p.internalPricingRequest.payload.requestContext.podId=IDs.poe;},
    p=>{p.internalPricingRequest.poeName='Nombre de destino diferente';},
  ]){
    const preview=make();
    mismatch(preview);
    assert.throws(()=>previewDholePublicRateRequest(preview),/Referencias POE\/POD inconsistentes/);
  }
  const land=structuredClone(previewDholeRateRequest(quote('Land','FTL'),lookups));
  land.internalPricingRequest.payload.requestContext.podId=IDs.pod;
  assert.throws(()=>previewDholePublicRateRequest(land),/Referencias POE\/POD inconsistentes/);
});
test('total equipment weights, strict calendar dates and quote IDs are rechecked',()=>{
  for(const [mode,type] of [['Maritime','FCL'],['Land','FTL']]){
    const preview=structuredClone(previewDholeRateRequest(quote(mode,type),lookups));
    preview.internalPricingRequest.payload.form.cargoWeightKg=9999;
    assert.throws(()=>previewDholePublicRateRequest(preview),/Peso declarado no coincide/);
  }
  const invalidDate=structuredClone(previewDholeRateRequest(quote(),lookups));
  invalidDate.internalPricingRequest.payload.form.loadDate='2026-02-30';
  invalidDate.internalPricingRequest.payload.sellerContext.cargoReadyDate='2026-02-30';
  assert.throws(()=>previewDholePublicRateRequest(invalidDate),/Datos críticos/);
  const invalidKey=structuredClone(previewDholeRateRequest(quote(),lookups));
  invalidKey.idempotencyKey='cf-official-zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz';
  assert.throws(()=>previewDholePublicRateRequest(invalidKey),/idempotencia local inválida/);
});

test('no transport function or private API key is exposed by this adapter',()=>{
  const meta=dholePublicRateRequestContractReview();
  assert.equal(meta.noTransport,true);
  const preview=prepared('Maritime','FCL');
  assert.equal(preview.noTransport,true);
  assert.equal(preview.readyForSending,false);
  assert.ok(preview.blockers.some(b=>b.startsWith('apiPermission:')));
  assert.equal('url' in preview,false);
  assert.equal('headers' in preview,false);
  assert.equal('apiKey' in preview,false);
});
