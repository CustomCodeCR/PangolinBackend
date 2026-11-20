// Pure offline adapter: INTERNAL Pricing preview -> published flat third-party POST.
// No HTTP, credentials, filesystem writes, environment flags or background worker.
// The snapshot comes from the official Dhole API Manager, supplied 2026-11-20.
// A valid flat body is NOT an authorization to send it.
import { readFileSync } from 'node:fs';

const contract = JSON.parse(readFileSync(
  new URL('./contracts/dhole-solicitar-tarifa-published-20261120.json', import.meta.url), 'utf8'));
const publicInputs = new Map(contract.inputs.map(x => [x.public, x]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = value => typeof value === 'string' && UUID.test(value) &&
  value !== '00000000-0000-0000-0000-000000000000';
const present = value => value !== undefined && value !== null;
const number = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => number(value) && value > 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const calendarDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(value + 'T00:00:00Z');
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0, 10) === value;
};
const hasOwn = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const allowedModes = Object.freeze({
  Fcl:'Maritime', Lcl:'Maritime', Air:'Air', Ftl:'Land', Ltl:'Land',
});

// Every explicitly emitted field must match the exact public-to-internal mapping.
// Do NOT project the preview's locked clientName or executiveName fields.
const EMIT = Object.freeze([
  'priority','shipmentMode','originName','destinationName','poeId','poeName',
  'podId','podName',
  'form_rateType','form_modality','form_shipmentMode',
  'form_originId','form_destinationId','form_podId',
  'form_incotermId','form_serviceIds','form_loadDate',
  'form_cargoDescription','form_cargoObservations','form_cargoValue',
  'form_cargoWeightKg','form_cargoPackages','form_storageDays',
  'form_cabysCode','form_pickupAddress',
  'form_dangerousCargo','form_nonStackable','form_overweight',
  'form_fclContainers','form_landContainers','form_inlandDeliveryLocation_address',
  'requestContext_incotermName','requestContext_poeId','requestContext_podId',
  'sellerContext_cargoReadyDate','sellerContext_consolidatedCargoLines',
]);
const emitSet = new Set(EMIT);

function getPath(root, internalPath) {
  return internalPath.split('.').reduce(
    (value,segment) => value && typeof value === 'object' ? value[segment] : undefined, root);
}
function setChecked(target,key,value) {
  if (!present(value)) return;
  const mapping = publicInputs.get(key);
  if (!mapping || typeof mapping.internal !== 'string')
    throw new Error('El campo no pertenece al contrato oficial: ' + key);
  if (hasOwn(contract.defaults,key) || hasOwn(contract.defaults,mapping.internal))
    throw new Error('Intento de sobrescribir valor fijo de Dhole: ' + key);
  target[key] = structuredClone(value);
}
function assertSnapshot() {
  if (contract.slug !== 'solicitar-tarifa-wjicua4' || contract.target !== 'pricing-rate-request-create' ||
      contract.method !== 'POST' || !contract.enabled ||
      contract.inputs.length !== 103 || publicInputs.size !== 103 ||
      contract.inputs.filter(x=>x.required).map(x=>x.public).join(',') !== 'priority' ||
      contract.defaults?.clientName !== 'CLIENTE GENERICO' ||
      contract.defaults?.executiveName !== 'Castro Fallas' ||
      contract.outputs.length !== 1 || contract.outputs[0].public !== 'value' ||
      contract.responseRoot !== null)
    throw new Error('Contrato publicado cambió o instantánea no coincide.');
  for (const key of EMIT) if (!publicInputs.has(key))
    throw new Error('Campo emitido no publicado: ' + key);
  if (new Set(EMIT).size !== EMIT.length)
    throw new Error('Campo emitido duplicado.');
  for (const field of contract.inputs) {
    if (field.public === 'sellerUserId' || field.internal === 'sellerUserId' ||
        field.public === 'clientName' || field.internal === 'clientName' ||
        field.public === 'executiveName' || field.internal === 'executiveName')
      throw new Error('Campo fijo o técnico expuesto por error.');
  }
}
assertSnapshot();
export function dholePublicRateRequestContractReview() {
  return Object.freeze({
    slug:contract.slug, target:contract.target, method:contract.method,
    publishedInputCount:contract.inputs.length, required:['priority'],
    fixedDefaults:{...contract.defaults}, outputFields:contract.outputs.map(x=>x.public),
    fieldsEmitted:[...EMIT], noTransport:true
  });
}

const EQUIPMENT = new Set([
  'containerTypeId','containerTypeName','containerTypeCode','quantity','unitWeightsKg'
]);
const CARGO = new Set([
  'description','packages','weightKg','lengthCm','widthCm','heightCm'
]);
function checkedEquipment(items,label) {
  if (!Array.isArray(items) || !items.length) throw new Error(label+': faltan equipos.');
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(key=>!EQUIPMENT.has(key)) ||
        !validId(item.containerTypeId) ||
        !text(item.containerTypeName) || !text(item.containerTypeCode) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 ||
        !Array.isArray(item.unitWeightsKg) ||
        item.unitWeightsKg.length !== item.quantity ||
        !item.unitWeightsKg.every(positive))
      throw new Error(label+': tipo UUID, cantidad o pesos inválidos.');
  }
}
function checkedCargo(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Faltan líneas consolidadas.');
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(key=>!CARGO.has(key)) || !text(item.description) ||
        !Number.isInteger(item.packages) || item.packages < 1 ||
        !positive(item.weightKg) ||
        !['lengthCm','widthCm','heightCm'].every(key=>positive(item[key])))
      throw new Error('Línea consolidada inválida; peso en kg corresponde a toda la línea.');
  }
}
const REVIEW_BLOCKERS = Object.freeze([
  'commercialIdentity: validar en Dhole que el contacto se muestre en descripción y que CLIENTE GENERICO/Castro Fallas sigan fijos',
  'catalogFreshness: validar UUID en catálogos vigentes con lecturas autorizadas antes de cualquier POST',
  'apiPermission: clave separada autorizada para Solicitar tarifa todavía no disponible',
  'providerResponse: salida opcional value; no asumir identificador ni confirmación remota sin prueba controlada',
]);

// Input must be the approved, locally validated output of previewDholeRateRequest.
// The resulting body is a contract-level REVIEW ARTIFACT, never a sendable queue job.
export function previewDholePublicRateRequest(internalPreview) {
  const blockers = [...(Array.isArray(internalPreview?.blocking) ? internalPreview.blocking : [])];
  const request = internalPreview?.internalPricingRequest;
  if (!request || !internalPreview?.readyForContractReview || blockers.length)
    return Object.freeze({ body:null, readyForSending:false,
      blockers:[...blockers,'internalPreview: faltan datos locales completos'], noTransport:true });
  if (!allowedModes[request.shipmentMode] ||
      request?.payload?.form?.shipmentMode !== request.shipmentMode)
    throw new Error('Modalidad interna de Pricing incoherente.');
  if (!validId(request.poeId) || !validId(request.payload.form.originId) ||
      request.payload.form.destinationId !== request.poeId ||
      !text(request.originName) || !text(request.destinationName))
    throw new Error('Ruta no validada con identificadores Dhole.');
  const maritime = allowedModes[request.shipmentMode] === 'Maritime';
  if (maritime && (!validId(request.podId) || !text(request.podName) ||
      request.payload.form.podId !== request.podId))
    throw new Error('POD marítimo incompleto.');
  if (!maritime && (present(request.podId) || present(request.payload.form.podId)))
    throw new Error('POD prohibido para transporte no marítimo.');
  const f = request.payload.form;
  const rc = request.payload.requestContext ?? {};
  const seller = request.payload.sellerContext ?? {};
  // Public top-level and nested route references must describe the same shipment.
  if (rc.poeId !== request.poeId ||
      (maritime ? rc.podId !== request.podId : present(rc.podId)) ||
      (present(request.poeName) && request.poeName !== request.destinationName))
    throw new Error('Referencias POE/POD inconsistentes entre contextos.');
  if (!['Green','Yellow','Red'].includes(request.priority) ||
      !validId(f.incotermId) || !Array.isArray(f.serviceIds) ||
      !f.serviceIds.length || !f.serviceIds.every(validId) ||
      new Set(f.serviceIds).size !== f.serviceIds.length ||
      !text(f.cargoDescription) || !positive(f.cargoWeightKg) ||
      !calendarDate(f.loadDate) ||
      seller.cargoReadyDate !== f.loadDate)
    throw new Error('Datos críticos de Pricing no están validados.');
  if (request.shipmentMode === 'Fcl') checkedEquipment(f.fclContainers,'FCL');
  else if (present(f.fclContainers)) throw new Error('Contenedores FCL en modalidad incompatible.');
  if (request.shipmentMode === 'Ftl') checkedEquipment(f.landContainers,'FTL');
  else if (present(f.landContainers)) throw new Error('Equipos FTL en modalidad incompatible.');
  if (['Fcl','Ftl'].includes(request.shipmentMode)) {
    const equipment = request.shipmentMode === 'Fcl' ? f.fclContainers : f.landContainers;
    const totalKg = equipment.reduce((sum,line)=>
      sum + line.unitWeightsKg.reduce((partial,weight)=>partial + weight,0),0);
    if (!Number.isFinite(totalKg) || Math.abs(totalKg - f.cargoWeightKg) > 0.00001)
      throw new Error('Peso declarado no coincide con los pesos de los equipos.');
  }
  if (['Lcl','Air','Ltl'].includes(request.shipmentMode)) {
    checkedCargo(seller.consolidatedCargoLines);
    if (f.cargoPackages !== seller.consolidatedCargoLines.reduce((sum,line)=>sum+line.packages,0))
      throw new Error('Bultos consolidados no coinciden con el total declarado.');
    const sumWeight = seller.consolidatedCargoLines.reduce((sum,line)=>sum+line.weightKg,0);
    if (Math.abs(sumWeight-f.cargoWeightKg)>0.00001)
      throw new Error('Peso de carga consolidada no coincide con el peso total.');
  } else if (present(seller.consolidatedCargoLines))
    throw new Error('Líneas consolidadas en embarque con equipo completo.');

  // The real Dhole wizard starts a seller quote as Spot with the selected modality.
  // These are provisional domain choices; they still require end-to-end validation.
  const additions = { form_rateType:'Spot', form_modality:allowedModes[request.shipmentMode] };
  const body = {};
  for (const key of EMIT) {
    const field = publicInputs.get(key);
    setChecked(body,key,hasOwn(additions,key) ? additions[key] : getPath(request,field.internal));
  }
  const review = validateDholePublicRateRequestShape(body);
  if (review.length) throw new Error(review.join(' | '));
  if (typeof internalPreview.idempotencyKey !== 'string' ||
      !internalPreview.idempotencyKey.startsWith('cf-official-') ||
      !validId(internalPreview.idempotencyKey.slice('cf-official-'.length)) ||
      internalPreview.idempotencyKey.length > 128)
    throw new Error('Clave de idempotencia local inválida.');
  return Object.freeze({
    contractSlug:contract.slug,
    body:Object.freeze(body),
    idempotencyKey:internalPreview.idempotencyKey,
    readyForContractReview:true,
    readyForSending:false,
    blockers:[...REVIEW_BLOCKERS],
    noTransport:true,
  });
}

// Conservative preflight for the published input allowlist. Mirrors the
// Gateway's published field selection AND our narrower outbound allowlist;
// this is a local preflight, not a validation of internal business rules.
export function validateDholePublicRateRequestShape(body) {
  const problems=[];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['body: objeto JSON requerido'];
  for (const key of Object.keys(body)) {
    if (!publicInputs.has(key)) problems.push('unpublished:'+key);
    else if (!emitSet.has(key)) problems.push('not-allowlisted:'+key);
    if (hasOwn(contract.defaults,key)) problems.push('locked:'+key);
  }
  if (!['Green','Yellow','Red'].includes(body.priority)) problems.push('priority: inválida');
  for (const name of ['clientName','executiveName','sellerUserId','form_clientName',
    'form_executiveName','form_otherReferences','contactEmail','contactPhone','payload'])
    if (hasOwn(body,name)) problems.push('privacy-or-locked:'+name);
  if (body.form_serviceIds && (!Array.isArray(body.form_serviceIds) ||
      !body.form_serviceIds.every(validId))) problems.push('form_serviceIds: UUID');
  for (const name of ['form_originId','form_destinationId','form_incotermId',
    'poeId','form_podId','podId','requestContext_poeId','requestContext_podId']) {
    if (present(body[name]) && !validId(body[name])) problems.push(name+': UUID');
  }
  if (present(body.form_fclContainers)) {
    try { checkedEquipment(body.form_fclContainers,'FCL') } catch (e) { problems.push(e.message) }
  }
  if (present(body.form_landContainers)) {
    try { checkedEquipment(body.form_landContainers,'FTL') } catch (e) { problems.push(e.message) }
  }
  if (present(body.sellerContext_consolidatedCargoLines)) {
    try { checkedCargo(body.sellerContext_consolidatedCargoLines) } catch (e) { problems.push(e.message) }
  }
  return problems;
}
