// Generate synthetic, contract-validated five-mode scenarios for the local
// C# fake HTTP harness. NEVER contacts Dhole or uses a real UUID/API Key.
// This is not a production payload builder or a permission to send.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { previewDholeRateRequest } from './dhole-rate-request-preview.mjs';
import {
  previewDholePublicRateRequest, validateDholePublicRateRequestShape
} from './dhole-public-rate-request-preview.mjs';

const target = process.argv[2];
if (!target) throw new Error('Provide local output path for fake CI fixtures.');
const IDs = Object.freeze({
  origin:'b1111111-1111-4111-8111-111111111111',
  poe:'c1111111-1111-4111-8111-111111111111',
  pod:'d1111111-1111-4111-8111-111111111111',
  incoterm:'e1111111-1111-4111-8111-111111111111',
  service:'a2222222-2222-4222-8222-222222222222',
  equipment:'b2222222-2222-4222-8222-222222222222',
});
const lookups = {
  priority:'Green', incotermIds:{CIF:IDs.incoterm},
  serviceIds:{'Transporte internacional':IDs.service},
  equipment:{
    'FCL:20 pies|Dry Van':{id:IDs.equipment,name:'Dry Van',code:'20DV'},
    'FTL:48 pies|Furgón seco':{id:IDs.equipment,name:'Furgón seco',code:'48_DRY_VAN'},
  },
  podName:'Puerto ficticio'
};
const cases = [
  ['Maritime','FCL','Fcl'],
  ['Maritime','LCL','Lcl'],
  ['Air','AIR_LCL','Air'],
  ['Land','FTL','Ftl'],
  ['Land','LTL','Ltl'],
];
const fixtures = cases.map(([mode,type,shipment],i)=>{
  const hasEquipment = type==='FCL'||type==='FTL';
  const quoteId = 'a1111111-1111-4111-8111-11111111111'+(i+1);
  const input = {
    id:quoteId, authorization:'Authorized', customerName:'Empresa ficticia no destinada a Dhole',
    contactName:'Persona ficticia', contactEmail:'prueba@example.invalid', contactPhone:'+506 0000-0000',
    originName:'Origen simulado', destinationName:'Destino simulado',
    form:{
      catalogSource:'dhole',mode,shipmentType:type,
      originLocationId:IDs.origin,destinationLocationId:IDs.poe,
      podLocationId:mode==='Maritime'?IDs.pod:null,
      cargoReadyDate:'2026-12-18',incoterm:'CIF',
      cargoDescription:'Repuestos automotrices simulados',
      services:['Transporte internacional'],
      equipment:hasEquipment?[{
        size:type==='FCL'?'20 pies':'48 pies',
        type:type==='FCL'?'Dry Van':'Furgón seco',
        quantity:2,unitWeightsKg:[1100,1300]
      }]:[],
      packages:hasEquipment?[]:[{
        description:'Caja ficticia',quantity:3,unitType:'Box',weight:10,
        length:20,width:12,height:8,stackability:'NonStackable'
      }],
      dimensionUnit:'in',weightUnit:'lb',
      observations:'Solo demostración de contrato, no enviar',
      // Currency/insurance terms are not resolved for automatic delivery;
      // these synthetic transport fixtures must not include insured value.
      cargoFlags:['Carga peligrosa']
    }
  };
  const internal = previewDholeRateRequest(input,lookups);
  if(!internal.readyForContractReview || internal.blocking.length)
    throw new Error('Internal fake quote validation failed for '+type);
  const result = previewDholePublicRateRequest(internal);
  if(!result.readyForContractReview || result.readyForSending ||
     !result.noTransport || !result.body || result.body.shipmentMode!==shipment ||
     result.idempotencyKey!=='cf-official-'+quoteId ||
     validateDholePublicRateRequestShape(result.body).length)
    throw new Error('Published fake contract validation failed for '+type);
  if (!result.body.form_cargoDescription.includes('Correo: prueba@example.invalid'))
    throw new Error('Synthetic applicant was not appended for '+type);
  return {
    scenario:type,
    quoteId,
    source:'synthetic-no-live-catalogs',
    transmissionPermitted:false,
    body:result.body
  };
});
mkdirSync(dirname(target), {recursive:true});
writeFileSync(target, JSON.stringify(fixtures,null,2), {mode:0o600, flag:'w'});
console.log('PASS: generated 5 wholly synthetic flat contract fixtures; no Dhole contact.');
