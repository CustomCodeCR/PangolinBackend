// Temporary, OFFLINE adapter for authenticated Dhole Config responses exported
// manually by an operator while external GETs are not published. Does not fetch,
// send, authorize or build an executable Dhole POST. No API keys or production
// UUIDs are committed. Use only for a short-lived local mapping REVIEW.
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewPricingServicesExport } from './review-dhole-pricing-services-export.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 5 * 60_000;
const sizes = ['24', '26', '48', '53'];
const kinds = Object.freeze({
  DRY_VAN: 'dry-van',
  PLATFORM: 'platform',
  REEFER: 'reefer',
  CURTAIN_SIDE: 'curtain-side'
});
const expectedLand = new Map(sizes.flatMap(size =>
  Object.entries(kinds).map(([suffix,kind]) => [size+'_'+suffix, {size,kind}])));
const isUuid = id => typeof id === 'string' && UUID.test(id) &&
  id !== '00000000-0000-0000-0000-000000000000';

function metadata(item) {
  let parsed = {};
  if (item?.metadataJson !== undefined && item.metadataJson !== null) {
    if (typeof item.metadataJson !== 'string') throw Error('Metadata JSON de equipo inválida.');
    try { parsed = JSON.parse(item.metadataJson); }
    catch { throw Error('Metadata JSON de equipo malformada.'); }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      throw Error('Metadata JSON no es objeto.');
  } else if (item?.metadata !== undefined) {
    parsed = item.metadata;
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw Error('Metadata de tipo de furgón inválida.');
  if (item.size !== undefined && item.size !== parsed.size ||
      item.kind !== undefined && item.kind !== parsed.kind)
    throw Error('Datos de tipo de furgón contradictorios.');
  return parsed;
}

// A manual response alone cannot demonstrate future availability. The operator
// attests these exports were just reviewed; no expiry is extended on re-open.
export function reviewTemporaryManualCatalogs(pricing, land, reviewedAtUtc, now = Date.now()) {
  const reviewed = Date.parse(reviewedAtUtc);
  if (typeof reviewedAtUtc !== 'string' || !Number.isFinite(reviewed) ||
      !Number.isFinite(now) || now < reviewed || now - reviewed > MAX_AGE_MS)
    throw Error('Exportación manual vencida o sin fecha UTC válida (máximo 5 minutos).');

  const verifiedPricing = reviewPricingServicesExport(pricing);
  if (land?.success !== true || !Array.isArray(land.data) ||
      land.data.length !== expectedLand.size)
    throw Error('Se requieren las 16 combinaciones FTL de Config/land-equipment-types.');
  const ids = new Set();
  const codes = new Set();
  const ftl = [];
  for (const item of land.data) {
    if (item?.catalogGroupSlug !== 'land-equipment-types' ||
        !expectedLand.has(item.code) || item.isActive !== true ||
        !isUuid(item.id) || ids.has(item.id.toLowerCase()) ||
        codes.has(item.code) ||
        typeof item.name !== 'string' || !item.name.trim() ||
        typeof item.value !== 'string' || !item.value.trim())
      throw Error('Tipo de furgón ausente, inactivo, duplicado o sin UUID válido.');
    const m = metadata(item);
    const expected = expectedLand.get(item.code);
    if (m.size !== expected.size || m.kind !== expected.kind)
      throw Error('El código del furgón contradice su tamaño/tipo en metadata.');
    codes.add(item.code);
    ids.add(item.id.toLowerCase());
    ftl.push({
      id:item.id, code:item.code, name:item.name.trim(),
      value:item.value.trim(), size:expected.size, kind:expected.kind,
      isActive:true
    });
  }
  if (codes.size !== expectedLand.size)
    throw Error('Hay combinaciones FTL incompletas o repetidas.');
  const pricingItems = pricing.data.map(item=>({
    id:item.id, code:item.code,
    name:item.name, value:item.value, isActive:true
  }));
  const stamp = new Date(reviewed).toISOString();
  const snapshot = (catalog, items) => ({
    catalog, fetchedAtUtc:stamp, stale:false, items,
    provenance:'manually-reviewed-internal-config-export-not-live-get'
  });
  return {
    source:'temporary-internal-config-browser-export',
    reviewedAtUtc:stamp,
    expiresAtUtc:new Date(reviewed+MAX_AGE_MS).toISOString(),
    reviewedServiceCount:verifiedPricing.reviewedCodes,
    reviewedFtlCombinationCount:codes.size,
    readyForRemotePost:false,
    noTransport:true,
    snapshots:{
      'pricing-services':snapshot('pricing-services',pricingItems),
      'land-equipment-types':snapshot('land-equipment-types',ftl)
    }
  };
}

const invoked = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const [servicesPath, equipmentPath, outputPath, attestation] = process.argv.slice(2);
  if (!servicesPath || !equipmentPath || !outputPath ||
      attestation !== '--reviewed-just-now')
    throw Error('Uso: node scripts/dhole-temporary-manual-catalog-import.mjs <pricing.json> <land-types.json> <salida-privada.json> --reviewed-just-now');
  const repoRoot = resolve(fileURLToPath(import.meta.url),'../..');
  const output = resolve(outputPath);
  const insideRepo = relative(repoRoot,output);
  if (!insideRepo || (!insideRepo.startsWith('..') && !isAbsolute(insideRepo)))
    throw Error('Guardá el archivo temporal FUERA del repositorio para evitar publicar UUIDs.');
  const parsed = reviewTemporaryManualCatalogs(
    JSON.parse(readFileSync(servicesPath,'utf8')),
    JSON.parse(readFileSync(equipmentPath,'utf8')),
    new Date().toISOString());
  writeFileSync(output,JSON.stringify(parsed,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
  console.log('PASS: 12 servicios y 16 tipos FTL revisados localmente; no se envió nada a Dhole.');
  console.log('Caduca: '+parsed.expiresAtUtc+'. Archivo privado: '+output);
  console.log('NO usar para POST remoto ni como prueba de vigencia automática.');
}
