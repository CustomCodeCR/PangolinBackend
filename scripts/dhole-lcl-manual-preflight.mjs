// One-off OFFLINE LCL contract review from five manually observed Config rows.
// This program CANNOT send HTTP. Production UUIDs are read from a local file,
// never embedded in GitHub, frontend, environment or deployed backend code.
// Re-check every referenced catalog ID immediately before any later real POST.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {previewDholeRateRequest} from './dhole-rate-request-preview.mjs';
import {previewDholePublicRateRequest,validateDholePublicRateRequestShape}
  from './dhole-public-rate-request-preview.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFIG=Object.freeze({
  service:{group:'pricing-services',code:'INT_TRANSPORT'},
  incoterm:{group:'incoterms',value:'CIF'},
  pol:{group:'pol',code:'POL-2026-074',role:'POL',mode:'Maritime',terminal:'CY',country:'CN'},
  poe:{group:'poe',code:'POE-2026-002',role:'POE',mode:'Maritime',terminal:'CY',country:'CR'},
  pod:{group:'pod',code:'POD-2026-020',role:'POD',mode:'Maritime',terminal:'SD',country:'CR'}
});
const QUOTE_ID='a1111111-1111-4111-8111-111111111112'; // fictional offline identity only

const text = x => typeof x === 'string' && !!x.trim();
function readMetadata(row){
  if(typeof row.metadataJson !== 'string'||!row.metadataJson.trim())
    throw new Error('Falta metadataJson para '+row.catalogGroupSlug);
  try{
    const obj=JSON.parse(row.metadataJson);
    if(!obj||typeof obj!=='object'||Array.isArray(obj))
      throw new Error('Metadata no es objeto');
    return obj;
  }catch{throw new Error('metadataJson inválido para '+row.catalogGroupSlug);}
}
function assertItem(row,key,ids){
  const exp=CONFIG[key];
  if(!row || typeof row!=='object' || Array.isArray(row)||
     row.catalogGroupSlug!==exp.group||row.isActive!==true)
    throw new Error(key+': grupo equivocado o registro no activo');
  if(typeof row.id!=='string'||!UUID.test(row.id)||ids.has(row.id.toLowerCase()))
    throw new Error(key+': UUID de catálogo inválido o repetido');
  if(!text(row.name)||!text(row.value))
    throw new Error(key+': falta nombre/valor del catálogo');
  if(exp.code && row.code!==exp.code)
    throw new Error(key+': código inesperado: '+row.code);
  if(exp.value && row.value!==exp.value)
    throw new Error(key+': valor de negocio inesperado');
  if(key==='service'){
    const meta=readMetadata(row);
    // Metadata term IDs belong to a different resource, never form_serviceIds.
    if(meta.rateTermItemIds!=null&&(!Array.isArray(meta.rateTermItemIds)||
      meta.rateTermItemIds.includes(row.id)))
      throw new Error('No confundir servicio con rateTermItemIds');
  }
  if(['pol','poe','pod'].includes(key)){
    const meta=readMetadata(row);
    if(meta.routeRole!==exp.role||meta.transportMode!==exp.mode||
      meta.terminalType!==exp.terminal||meta.countryCode!==exp.country)
      throw new Error(key+': rol/modalidad/terminal/país no coinciden');
  }
  ids.add(row.id.toLowerCase());
}
export function previewObservedLclRoute(evidence){
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)||
    Object.keys(evidence).sort().join(',')!==Object.keys(CONFIG).sort().join(','))
    throw new Error('Se requieren exactamente service, incoterm, pol, poe, pod.');
  const seen=new Set();
  for(const key of Object.keys(CONFIG))assertItem(evidence[key],key,seen);
  const source={
    id:QUOTE_ID,
    // Only a *simulated* authorization; not a real administrator decision.
    authorization:'Authorized',
    customerName:'Empresa ficticia de control',
    contactName:'Persona de Prueba',
    contactEmail:'prueba@example.invalid',
    contactPhone:'+506 0000-0000',
    originName:evidence.pol.name,
    destinationName:evidence.poe.name,
    form:{
      catalogSource:'dhole',mode:'Maritime',shipmentType:'LCL',
      originLocationId:evidence.pol.id,
      destinationLocationId:evidence.poe.id,
      podLocationId:evidence.pod.id,
      cargoReadyDate:'2026-12-18',
      incoterm:'CIF',
      services:['Transporte internacional'],
      cargoDescription:'Repuestos automotrices de prueba (sin carga real)',
      observations:'PRUEBA TECNICA FICTICIA. NO ENVIAR.',
      cargoValue:1600,
      packages:[{
        description:'Caja de repuestos simulada',quantity:3,weight:10,
        length:20,width:12,height:8,stackability:'NonStackable'
      }],
      weightUnit:'kg',dimensionUnit:'cm',
      cargoFlags:[],
    }
  };
  const lookups={
    priority:'Green',
    incotermIds:{CIF:evidence.incoterm.id},
    serviceIds:{'Transporte internacional':evidence.service.id},
    podName:evidence.pod.name
  };
  const internal=previewDholeRateRequest(source,lookups);
  if(!internal.readyForContractReview||internal.blocking.length)
    throw new Error('El mapeo interno no pasó: '+internal.blocking.join('; '));
  const publicReview=previewDholePublicRateRequest(internal);
  const body=publicReview.body;
  if(!body||!publicReview.readyForContractReview||
     publicReview.readyForSending!==false||publicReview.noTransport!==true||
     validateDholePublicRateRequestShape(body).length)
    throw new Error('No pasó la validación del contrato externo publicado');
  const exact={
    shipmentMode:'Lcl',
    form_originId:evidence.pol.id,form_destinationId:evidence.poe.id,
    poeId:evidence.poe.id,form_podId:evidence.pod.id,podId:evidence.pod.id,
    form_incotermId:evidence.incoterm.id
  };
  for(const [field,value] of Object.entries(exact))
    if(body[field]!==value)throw new Error('Campo incorrecto: '+field);
  if(JSON.stringify(body.form_serviceIds)!==JSON.stringify([evidence.service.id]))
    throw new Error('Se confundió el UUID del servicio');
  if(body.podName!==evidence.pod.name||
     body.poeName!==evidence.poe.name||
     body.originName!==evidence.pol.name)
    throw new Error('Nombres y roles de ruta incorrectos');
  const description=body.form_cargoDescription;
  if(!description.startsWith(source.form.cargoDescription+'\n\n')||
     !description.includes('Nombre: '+source.contactName)||
     !description.includes('Correo: '+source.contactEmail)||
     !description.includes('Teléfono: '+source.contactPhone))
    throw new Error('Datos ficticios no se preservaron en la descripción');
  for(const forbidden of ['clientName','executiveName','sellerUserId',
    'form_clientName','form_executiveName','form_clientId','form_executiveId',
    'contactEmail','contactPhone','contactName'])
    if(Object.hasOwn(body,forbidden))throw new Error('Campo prohibido '+forbidden);
  if(!Array.isArray(body.sellerContext_consolidatedCargoLines)||
     body.sellerContext_consolidatedCargoLines.length!==1||
     body.sellerContext_consolidatedCargoLines[0].packages!==3||
     body.form_cargoPackages!==3||body.form_cargoWeightKg!==10)
    throw new Error('LCL: pesos/paquetes consolidados inesperados');
  if(Object.hasOwn(body,'form_fclContainers')||
     Object.hasOwn(body,'form_landContainers'))
    throw new Error('LCL no debe incluir equipo completo');
  return {
    scenario:'LCL maritime — Shanghai to Limón/Moin; POD Moín',
    provenance:'MANUAL_CONFIG_SNAPSHOT_NOT_RUNTIME_VERIFIED',
    applicant:'ENTIRELY_FICTIONAL',
    authorization:'SIMULATED_FOR_OFFLINE_REVIEW',
    remoteSubmissionPermitted:false,
    readyForSending:false,
    noTransport:true,
    idempotencyKey:publicReview.idempotencyKey,
    blockers:[
      'Validar de nuevo los cinco UUID contra catálogos vigentes antes de un POST',
      'Confirmar que Pricing acepta la ruta, Spot y todos los campos',
      'Validar datos visibles y permisos del personal Dhole en prueba autorizada',
      'Se requiere autorización específica para un POST; esta revisión no envía nada'
    ],
    publishedFlatBody:body,
  };
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4)
    throw new Error('Uso: node scripts/dhole-lcl-manual-preflight.mjs <cinco-registros.json> <salida-privada.json>');
  const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const review=previewObservedLclRoute(input);
  writeFileSync(process.argv[3],JSON.stringify(review,null,2),{mode:0o600,flag:'wx'});
  console.log('PASS: contrato LCL preparado solo en disco; no HTTP, no clave, sin POST.');
}
