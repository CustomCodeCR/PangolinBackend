// Manual, OFFLINE review of the authenticated Config/pricing-services JSON
// exported from the Dhole browser's Network -> Response tab.
// This is NOT a new Dhole API, a source of automatically refreshed data, or a
// mapping to persist in the backend. No HTTP, credentials, or POST.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const EXPECTED_CODES = Object.freeze([
  'INT_TRANSPORT','CUSTOMS_CR','CUSTOMS_FOREIGN','STORAGE',
  'INVENTORY_CONTROL','PACKING','EXONERATION','PICKING',
  'RECEPTION','CARGO_INSURANCE','DELIVERY','PICKUP'
]);
const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function reviewPricingServicesExport(response) {
  if (response?.success !== true || !Array.isArray(response?.data))
    throw new Error('El JSON debe ser una respuesta exitosa de Config/pricing-services con data[].');
  const codeToId = Object.create(null);
  const ids = new Set();
  for (const item of response.data) {
    if (item?.catalogGroupSlug !== 'pricing-services' ||
        item?.catalogGroupCode !== 'PRICING_SERVICES' ||
        typeof item?.code !== 'string' || !EXPECTED_CODES.includes(item.code))
      throw new Error('Código o grupo inesperado en el catálogo Pricing.');
    if (item.isActive !== true)
      throw new Error('Servicio inactivo o sin estado confirmado: ' + item.code);
    if (Object.hasOwn(codeToId,item.code))
      throw new Error('Código duplicado en Pricing: ' + item.code);
    if (typeof item.id !== 'string' || !VALID_UUID.test(item.id) ||
        item.id === '00000000-0000-0000-0000-000000000000' ||
        ids.has(item.id.toLowerCase()))
      throw new Error('UUID inválido o repetido para servicio: ' + item.code);
    // Metadata rateTermItemIds belong to a DIFFERENT resource. Never use as
    // form_serviceIds; only the catalogue item's own "id" is eligible.
    if (typeof item.metadataJson === 'string' && item.metadataJson.trim()) {
      let metadata;
      try { metadata = JSON.parse(item.metadataJson); }
      catch { throw new Error('Metadata malformada para: ' + item.code); }
      if (metadata?.rateTermItemIds != null &&
          (!Array.isArray(metadata.rateTermItemIds) ||
           metadata.rateTermItemIds.includes(item.id)))
        throw new Error('Referencia de término confundida con ID de servicio: ' + item.code);
    }
    ids.add(item.id.toLowerCase());
    codeToId[item.code] = item.id;
  }
  const absent = EXPECTED_CODES.filter(code => !Object.hasOwn(codeToId,code));
  if (absent.length)
    throw new Error('Faltan códigos en el export: ' + absent.join(', '));
  return Object.freeze({
    catalog:'pricing-services',
    reviewedCodes:EXPECTED_CODES.length,
    source:'manual-browser-export-not-live-api',
    readyForRemotePost:false,
    codeToId:Object.freeze(codeToId),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error('Uso: node scripts/review-dhole-pricing-services-export.mjs <export.json>');
  const reviewed = reviewPricingServicesExport(JSON.parse(readFileSync(path,'utf8')));
  // Prints only catalog code/ID pairs; no credentials or full source metadata.
  console.log(JSON.stringify(reviewed,null,2));
  console.log('REVISIÓN LOCAL ÚNICAMENTE: NO enviar ni tratar estos UUID como catálogo vigente permanente.');
}
