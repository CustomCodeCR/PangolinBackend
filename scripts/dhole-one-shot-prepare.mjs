// Local-only preparation for ONE explicitly authorized fictional POST.
// This file has NO HTTP, does not load an API key and never sends requests.
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {previewObservedLclRoute} from './dhole-lcl-manual-preflight.mjs';
import {validateDholePublicRateRequestShape} from './dhole-public-rate-request-preview.mjs';

const OBS='PRUEBA CONTROLADA AUTORIZADA. DATOS FICTICIOS.';
const OFFLINE_ID='a1111111-1111-4111-8111-111111111112';
const CONFIRM='CINCO CATALOGOS ACTIVOS Y UNA SOLA PRUEBA';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function prepareOneShotLcl(evidence,{quoteId,verifiedAt,approvedAt}){
  if(!UUID.test(quoteId)||quoteId.toLowerCase()===OFFLINE_ID)
    throw new Error('Se requiere un UUID nuevo, no el identificador de simulación.');
  const c=new Date(verifiedAt),a=new Date(approvedAt);
  if(!Number.isFinite(c.valueOf())||!Number.isFinite(a.valueOf())||
     c.toISOString()!==verifiedAt||a.toISOString()!==approvedAt||
     Math.abs(c.valueOf()-a.valueOf())>5*60*1000)
    throw new Error('Fechas de aprobación y catálogo UTC no válidas.');
  const base=previewObservedLclRoute(evidence);
  if(base.readyForSending!==false||base.remoteSubmissionPermitted!==false||
     base.noTransport!==true||
     base.publishedFlatBody.form_cargoObservations!=='PRUEBA TECNICA FICTICIA. NO ENVIAR.')
    throw new Error('El borrador original no es un preflight bloqueado.');
  const review=structuredClone(base);
  review.idempotencyKey='cf-official-'+quoteId.toLowerCase();
  review.publishedFlatBody.form_cargoObservations=OBS;
  if(validateDholePublicRateRequestShape(review.publishedFlatBody).length||
     'form_cargoValue' in review.publishedFlatBody||
     'form_currencyId' in review.publishedFlatBody)
    throw new Error('Contrato plano rechazado: valor comercial o campos inesperados.');
  // Compact JSON preserves EXACT body bytes for C# JsonElement.GetRawText SHA256.
  const reviewJson=JSON.stringify(review);
  const bodyJson=JSON.stringify(review.publishedFlatBody);
  const digest=createHash('sha256').update(bodyJson,'utf8').digest('hex');
  const approval={
    scope:'PR274_ONE_QUOTE_LCL_OFFICIAL_DHOLE',
    purpose:'CONTROLLED_TEST_WITH_FICTIONAL_CONTACT',
    operatorApproved:true,
    payloadSha256:digest,
    quoteId:quoteId.toLowerCase(),
    catalogsVerifiedAtUtc:verifiedAt,
    approvedAtUtc:approvedAt
  };
  return Object.freeze({reviewJson,approvalJson:JSON.stringify(approval),digest,quoteId});
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==3||!process.stdin.isTTY)
    throw new Error('Uso: node scripts/dhole-one-shot-prepare.mjs /ruta/privada/cinco-registros.json (consola interactiva)');
  const evidence=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{
    console.log('Preparación LOCAL: no hay POST ni acceso a la API Key.');
    console.log('Revisá AHORA los cinco registros de Dhole: servicio, CIF, POL, POE y POD.');
    console.log('Usar solo si los 14 checks del PR están aprobados.');
    const answer=await rl.question('Escribí exactamente '+CONFIRM+' para continuar: ');
    if(answer!==CONFIRM)
      throw new Error('No se confirmaron los catálogos; no se creó el paquete.');
  }finally{rl.close();}
  const now=new Date().toISOString();
  const result=prepareOneShotLcl(evidence,{
    quoteId:randomUUID(),verifiedAt:now,approvedAt:now
  });
  const privateDir=mkdtempSync(join(tmpdir(),'castrofallas-dhole-once-'));
  const reviewPath=join(privateDir,'review.json');
  const approvalPath=join(privateDir,'approval.json');
  writeFileSync(reviewPath,result.reviewJson,{flag:'wx',mode:0o600});
  writeFileSync(approvalPath,result.approvalJson,{flag:'wx',mode:0o600});
  console.log('SIN POST. Archivos privados preparados:');
  console.log('review: '+reviewPath);
  console.log('approval: '+approvalPath);
  console.log('UUID ficticio: '+result.quoteId);
  console.log('SHA-256: '+result.digest);
  console.log('Aprobación local válida solo durante 5 minutos. No reintentar ante resultado incierto.');
}
