// Generate a disposable fictional LCL review for the isolated CLI CI test.
// No real UUIDs, no credentials and no network requests.
import {writeFileSync} from 'node:fs';
import {previewObservedLclRoute} from './dhole-lcl-manual-preflight.mjs';

const out=process.argv[2];
if(!out)throw new Error('Expected CI fixture output path');
const ids={
  service:'f1111111-1111-4111-8111-111111111111',
  incoterm:'f2222222-2222-4222-8222-222222222222',
  pol:'f3333333-3333-4333-8333-333333333333',
  poe:'f4444444-4444-4444-8444-444444444444',
  pod:'f5555555-5555-4555-8555-555555555555',
};
const loc=(key,code,name,role,country,terminal)=>({
 id:ids[key],catalogGroupSlug:key,code,name,value:name,isActive:true,
 metadataJson:JSON.stringify({
   routeRole:role,countryCode:country,terminalType:terminal,transportMode:'Maritime'
 })
});
const result=previewObservedLclRoute({
 service:{
   id:ids.service,catalogGroupSlug:'pricing-services',code:'INT_TRANSPORT',
   name:'Transporte Internacional',value:'Transporte Internacional',isActive:true,
   metadataJson:'{"rateTermItemIds":["e1111111-1111-4111-8111-111111111111"]}'
 },
 incoterm:{
   id:ids.incoterm,catalogGroupSlug:'incoterms',code:'INC-2026-006',
   name:'CIF',value:'CIF',isActive:true
 },
 pol:loc('pol','POL-2026-074','Shanghai, China','POL','CN','CY'),
 poe:loc('poe','POE-2026-002','Limón/Moin, Costa Rica','POE','CR','CY'),
 pod:loc('pod','POD-2026-020','Moin, Costa Rica','POD','CR','SD'),
});
if(result.readyForSending!==false||result.remoteSubmissionPermitted!==false)
 throw new Error('Review could wrongly be promoted to a live request');
writeFileSync(out,JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
console.log('PASS: fictional local review created; never sends to Dhole');
