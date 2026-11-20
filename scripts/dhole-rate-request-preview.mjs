// Dry-run ONLY: no network clients, credentials, databases, or file writes.
// Models the INTERNAL Pricing request, NOT the published flat third-party POST.
// The official slug is solicitar-tarifa-wjicua4. It exists in production, but
// field allowlisting/defaults and the provider response are not proven by this
// pure local simulator. No write capability is present.
import { createHash } from 'node:crypto';

const MODES = Object.freeze({
  'Maritime/FCL': 'Fcl',
  'Maritime/LCL': 'Lcl',
  'Air/AIR_LCL': 'Air',
  'Land/FTL': 'Ftl',
  'Land/LTL': 'Ltl',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIORITIES = new Set(['Green', 'Yellow', 'Red']);

const validId = (value) => typeof value === 'string' && UUID.test(value) &&
  value !== '00000000-0000-0000-0000-000000000000';
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isPositive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const idKey = (type, key) => type + ':' + key;
// Dhole owner decision (2026-11-20): preserve Gateway's locked commercial
// client/executive defaults, and place the web applicant contact in the
// published cargo *description* field, after the actual goods description.
// This is a dry-run artifact ONLY; no remote sender exists in this module.
// Avoid control-character/newline injection into the labelled contact block.
function contactValue(value, label, limit) {
  if (!isText(value) || value.trim().length > limit ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(value))
    throw new Error('Datos del solicitante inválidos: ' + label);
  return value.trim();
}
function cargoDescriptionWithApplicant(source, original) {
  const name = contactValue(source.contactName, 'nombre', 150);
  const email = contactValue(source.contactEmail, 'correo', 255);
  const phone = contactValue(source.contactPhone, 'teléfono', 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[+0-9 ()-]{7,40}$/.test(phone))
    throw new Error('Datos de contacto del solicitante inválidos.');
  const addition = [
    '',
    '',
    'Solicitante desde la web de Castro Fallas:',
    'Nombre: ' + name,
    'Correo: ' + email,
    'Teléfono: ' + phone,
  ].join('\n');
  const description = original.trimEnd() + addition;
  // The official web form's description is capped at 4000 characters.
  // Never silently truncate goods or personal contact details to make space.
  if (description.length > 4000)
    throw new Error('Descripción para Dhole excede 4000 caracteres al añadir el contacto.');
  return description;
}
function weightKg(value, unit) {
  if (!isPositive(value)) throw new Error('Peso inválido.');
  if (unit === 'kg') return value;
  if (unit === 'lb') return value * 0.45359237;
  throw new Error('Unidad de peso sin equivalencia comprobada.');
}
function lengthCm(value, unit) {
  if (!isPositive(value)) throw new Error('Dimensión inválida.');
  if (unit === 'cm') return value;
  if (unit === 'm') return value * 100;
  if (unit === 'in') return value * 2.54;
  throw new Error('Unidad de longitud sin equivalencia comprobada.');
}
function requireUUID(value, what) {
  if (!validId(value)) throw new Error(what + ': UUID de catálogo Dhole inválido.');
}
function assertDate(value) {
  if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)
    throw new Error('Fecha de carga inválida.');
}

// No defaults for priority, client identity, service IDs, Incoterm IDs, or
// equipment type IDs. Return blockers rather than manufacturing Dhole data.
// The source is a saved official quote, not arbitrary browser JSON.
export function previewDholeRateRequest(source, lookups = {}) {
  if (source?.authorization !== 'Authorized')
    throw new Error('Una solicitud sin autorización no puede mapearse para envío.');
  if (!validId(source.id)) throw new Error('Referencia de cotización inválida.');
  const form = source.form;
  if (!form || form.catalogSource !== 'dhole')
    throw new Error('Solo se admite una solicitud validada con catálogos Dhole.');
  const key = String(form.mode) + '/' + String(form.shipmentType);
  const shipmentMode = MODES[key];
  if (!shipmentMode) throw new Error('Combinación de modalidad y tipo de embarque inválida.');
  requireUUID(form.originLocationId, 'Origen');
  requireUUID(form.destinationLocationId, 'POE');
  if (form.originLocationId === form.destinationLocationId)
    throw new Error('Origen y POE no pueden ser iguales.');
  if (form.mode === 'Maritime') requireUUID(form.podLocationId, 'POD');
  else if (form.podLocationId != null)
    throw new Error('POD no corresponde a esta modalidad.');
  assertDate(form.cargoReadyDate);
  if (!isText(form.cargoDescription)) throw new Error('Falta descripción de carga.');
  const blocking = [];
  const pending = (name) => { if (!blocking.includes(name)) blocking.push(name); };
  const priority = lookups.priority;
  if (!PRIORITIES.has(priority)) pending('priority: seleccionar Green, Yellow o Red');
  if (!isText(source.customerName)) pending('clientName: confirmar cliente comercial (no confundir con contacto)');
  if (!isText(source.originName) || !isText(source.destinationName))
    pending('routeNames: resolver nombres desde catálogo Dhole');
  const incotermId = lookups.incotermIds?.[form.incoterm];
  if (!validId(incotermId)) pending('incotermId: ' + String(form.incoterm));
  const services = Array.isArray(form.services) ? form.services : [];
  if (!services.length) throw new Error('La solicitud no tiene servicios.');
  const serviceIds = services.map(name => {
    const id = lookups.serviceIds?.[name];
    if (!validId(id)) pending('serviceId: ' + String(name));
    return id;
  }).filter(validId);
  const formOutput = {
    // Rate type is intentionally omitted: its allowed values are not yet verified.
    shipmentMode,
    originId: form.originLocationId,
    destinationId: form.destinationLocationId,
    ...(form.podLocationId ? { podId: form.podLocationId } : {}),
    ...(validId(incotermId) ? { incotermId } : {}),
    ...(serviceIds.length === services.length ? { serviceIds } : {}),
    loadDate: form.cargoReadyDate,
    cargoDescription: cargoDescriptionWithApplicant(source, form.cargoDescription),
    ...(isText(form.observations) ? { cargoObservations: form.observations } : {}),
    ...(typeof form.cargoValue === 'number' && form.cargoValue >= 0 ?
      { cargoValue: form.cargoValue } : {}),
    ...(isText(form.cabysCode) ? { cabysCode: form.cabysCode } : {}),
    ...(isText(form.pickupAddress) ? { pickupAddress: form.pickupAddress } : {}),
    ...(Number.isInteger(form.fiscalStorageDays) && form.fiscalStorageDays > 0 ?
      { storageDays: form.fiscalStorageDays } : {}),
    dangerousCargo: form.cargoFlags?.includes('Carga peligrosa') === true,
    nonStackable: form.cargoFlags?.includes('No estibable') === true,
    overweight: form.cargoFlags?.includes('Sobrepeso') === true,
  };
  if (form.deliveryAddress) {
    formOutput.inlandDeliveryLocation = { address: form.deliveryAddress };
  }
  if (form.shipmentType === 'FCL' || form.shipmentType === 'FTL') {
    if (!Array.isArray(form.equipment) || !form.equipment.length)
      throw new Error('Faltan equipos.');
    const items = form.equipment.map((line, index) => {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 ||
        !Array.isArray(line.unitWeightsKg) || line.unitWeightsKg.length !== line.quantity ||
        !line.unitWeightsKg.every(isPositive))
        throw new Error('Equipo ' + index + ': cantidad y pesos inconsistentes.');
      const catalogKey = idKey(form.shipmentType, String(line.size) + '|' + String(line.type));
      const equipment = lookups.equipment?.[catalogKey];
      if (!validId(equipment?.id) || !isText(equipment?.name) || !isText(equipment?.code))
        pending('equipment: ' + catalogKey);
      return {
        ...(validId(equipment?.id) ? { containerTypeId: equipment.id } : {}),
        containerTypeName: equipment?.name || String(line.type),
        ...(isText(equipment?.code) ? { containerTypeCode: equipment.code } : {}),
        quantity: line.quantity,
        unitWeightsKg: line.unitWeightsKg,
      };
    });
    formOutput[form.shipmentType === 'FCL' ? 'fclContainers' : 'landContainers'] = items;
    formOutput.cargoWeightKg = items.reduce(
      (sum, line) => sum + line.unitWeightsKg.reduce((a, b) => a + b, 0), 0);
  } else {
    if (!Array.isArray(form.packages) || !form.packages.length)
      throw new Error('Faltan bultos.');
    const lines = form.packages.map((line, index) => {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || !isText(line.description))
        throw new Error('Bulto ' + index + ': datos básicos inválidos.');
      return {
        description: line.description,
        packages: line.quantity,
        weightKg: weightKg(line.weight, form.weightUnit),
        lengthCm: lengthCm(line.length, form.dimensionUnit),
        widthCm: lengthCm(line.width, form.dimensionUnit),
        heightCm: lengthCm(line.height, form.dimensionUnit),
      };
    });
    formOutput.cargoPackages = lines.reduce((sum, item) => sum + item.packages, 0);
    formOutput.cargoWeightKg = lines.reduce((sum, item) => sum + item.weightKg, 0);
    formOutput.nonStackable ||= form.packages.some(x => x.stackability === 'NonStackable');
    formOutput.cargoDescription = form.cargoDescription;
    formOutput.cargoLines = lines;
  }
  // The Pricing catalog documents sellerContext as distinct from form; we
  // keep consolidated lines in sellerContext, NOT arbitrary form keys.
  const cargoLines = formOutput.cargoLines;
  delete formOutput.cargoLines;
  const request = {
    ...(PRIORITIES.has(priority) ? { priority } : {}),
    ...(isText(source.customerName) ? { clientName: source.customerName } : {}),
    shipmentMode,
    ...(isText(source.originName) ? { originName: source.originName } : {}),
    ...(isText(source.destinationName) ? { destinationName: source.destinationName } : {}),
    poeId: form.destinationLocationId,
    ...(isText(source.destinationName) ? { poeName: source.destinationName } : {}),
    ...(form.podLocationId ? { podId: form.podLocationId } : {}),
    ...(isText(lookups.podName) && form.podLocationId ? { podName: lookups.podName } : {}),
    payload: {
      form: formOutput,
      requestContext: {
        incotermName: form.incoterm || null,
        poeId: form.destinationLocationId,
        ...(form.podLocationId ? { podId: form.podLocationId } : {}),
      },
      sellerContext: {
        cargoReadyDate: form.cargoReadyDate,
        ...(cargoLines ? { consolidatedCargoLines: cargoLines } : {}),
      },
    },
  };
  if (form.podLocationId && !isText(lookups.podName))
    pending('podName: resolver nombre final de Dhole');
  // Contact name/email/phone appear ONLY within cargoDescription as agreed
  // with Dhole's owner; no separate contact fields or sellerUserId are emitted.
  // No price/cost is fabricated.
  return Object.freeze({
    readyForContractReview: blocking.length === 0,
    blocking,
    idempotencyKey: 'cf-official-' + source.id.toLowerCase(),
    internalPricingRequest: request,
    warnings: [
      'POST público Dhole existente; esta vista previa interna NO representa los campos planos form_*, requestContext_* y sellerContext_* autorizados.',
      'Sin envío, ni clave API, ni escritura en Dhole. Verificar campos y valores fijos del Gateway oficial antes de conectar el POST.',
      'Nombre, correo y teléfono del solicitante incorporados únicamente en la descripción de carga del preview; requieren acceso restringido y validación con Dhole antes de un POST real.',
    ],
  });
}

// Entirely in-memory fake provider. It is not a network simulator and cannot
// contact Dhole. A retry with the same key/body replays the original reference.
export function simulatePricingCreate(preview, store = new Map()) {
  if (!preview.readyForContractReview)
    return { status: 422, code: 'Local.MappingIncomplete', missing: preview.blocking };
  const hash = createHash('sha256').update(JSON.stringify(preview.internalPricingRequest)).digest('hex');
  const old = store.get(preview.idempotencyKey);
  if (old) return old.hash === hash
    ? { status: 200, id: old.id, replayed: true }
    : { status: 409, code: 'Local.IdempotencyKeyReuse' };
  const id = 'sim-' + hash.slice(0, 24); // clearly NOT a Dhole UUID
  store.set(preview.idempotencyKey, { hash, id });
  return { status: 200, id, replayed: false };
}
