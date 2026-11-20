// Local, read-only resolution against DholeCatalogNormalizer snapshots.
// No fetch, HTTP client, credentials or persistence. A mapping is not permission
// to transmit: the official external POST contract is published, but not enabled here.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIND_NAMES = new Map([
  ['dry-van', 'Dry Van'], ['high-cube', 'High Cube'],
  ['open-top', 'Open Top'], ['open-side', 'Open Side'],
  ['tank', 'Tank'], ['flat-rack', 'Flat Rack'], ['nor', 'NOR'],
]);
const FTL_KINDS = new Map([
  ['Furgón seco', { kind: 'dry-van', code: 'DRY_VAN' }],
  ['Plataforma / Carreta', { kind: 'platform', code: 'PLATFORM' }],
  ['Refrigerado', { kind: 'reefer', code: 'REEFER' }],
  ['Furgón con cortina', { kind: 'curtain-side', code: 'CURTAIN_SIDE' }],
]);
const FTL_SIZES = new Set(['24', '26', '48', '53']);
const FRESH_FOR_MS = 5 * 60 * 1000;
const idValid = (id) => typeof id === 'string' &&
  UUID.test(id) && id !== '00000000-0000-0000-0000-000000000000';
const active = (x) => x?.isActive !== false;
const contains = (list, value) => Array.isArray(list) &&
  list.some(x => typeof x === 'string' && x.toLowerCase() === value.toLowerCase());

// A real DholeCatalogService snapshot has {catalog, fetchedAtUtc, stale, items};
// the mapping rejects stale/missing catalogues instead of using legacy defaults.
function freshItems(snapshots, key, now, errors) {
  const snapshot = snapshots?.[key];
  const ms = Date.parse(snapshot?.fetchedAtUtc);
  if (snapshot?.catalog !== key || snapshot.stale !== false ||
      !Array.isArray(snapshot.items) || !Number.isFinite(ms) ||
      now - ms > FRESH_FOR_MS || ms - now > 30_000) {
    errors.push('snapshot:' + key + ': ausente, obsoleto o no verificado');
    return null;
  }
  return snapshot.items.filter(active);
}
const unique = (items, predicate) => items.filter(predicate);
const missing = (errors, key) => {
  if (!errors.includes(key)) errors.push(key);
};

// Resolves names saved by the official wizard against fresh, *catalog-backed*
// IDs. Pricing service and FTL type lookups are optional and only available
// AFTER separately approved/publicly published read-only GET APIs exist.
// Priority, CRM identity and the external POST contract are never invented.
export function resolveDholeQuoteCatalogIds(source, snapshots, now = Date.now()) {
  const f = source?.form ?? source;
  if (!f || f.catalogSource !== 'dhole') throw new Error('Fuente Dhole no validada.');
  const blockers = [];
  const lookup = { incotermIds: {}, serviceIds: {}, equipment: {} };
  const termItems = freshItems(snapshots, 'incoterms', now, blockers);
  if (termItems) {
    const terms = unique(termItems, item => item?.value === f.incoterm);
    if (terms.length !== 1 || !idValid(terms[0]?.id))
      missing(blockers, 'incotermId: inexistente, duplicado o UUID inválido');
    else lookup.incotermIds[f.incoterm] = terms[0].id;
  }
  if (f.mode === 'Maritime') {
    const podItems = freshItems(snapshots, 'pod', now, blockers);
    if (podItems) {
      const matches = unique(podItems, item => item?.id === f.podLocationId);
      if (matches.length !== 1 || !idValid(matches[0].id) || !matches[0].name)
        missing(blockers, 'podName: identificador POD no vigente');
      else lookup.podName = matches[0].name;
    }
  }
  if (f.shipmentType === 'FCL') {
    const sizes = freshItems(snapshots, 'container-sizes', now, blockers);
    const types = freshItems(snapshots, 'container-types', now, blockers);
    if (sizes && types) for (const line of f.equipment ?? []) {
      const key = 'FCL:' + String(line.size) + '|' + String(line.type);
      const sizesWithName = unique(sizes,
        x => x?.name === line.size && idValid(x?.id));
      if (sizesWithName.length !== 1) {
        missing(blockers, 'equipment:' + key + ': tamaño ambiguo o ausente');
        continue;
      }
      const sizeCode = sizesWithName[0].value;
      const matches = unique(types, item =>
        idValid(item?.id) && item?.size === sizeCode &&
        KIND_NAMES.get(String(item?.kind).toLowerCase()) === line.type &&
        contains(item?.shipmentModes, 'FCL') &&
        (contains(item?.modalities, 'Maritime') ||
         contains(item?.modalities, 'Multimodal')) &&
        typeof item?.code === 'string' && item.code.length > 0);
      if (matches.length !== 1) {
        missing(blockers, 'equipment:' + key + ': tipo ausente o ambiguo');
        continue;
      }
      const type = matches[0];
      lookup.equipment[key] = {
        id: type.id, name: line.type, code: type.code,
      };
    }
  }
  if (f.shipmentType === 'FTL') {
    const trucks = freshItems(snapshots, 'truck-sizes', now, blockers);
    const types = freshItems(snapshots, 'land-equipment-types', now, blockers);
    for (const line of f.equipment ?? []) {
      const key = 'FTL:' + String(line.size) + '|' + String(line.type);
      const candidates = unique(trucks ?? [],
        x => x?.name === line.size && idValid(x?.id));
      if (candidates.length !== 1) {
        missing(blockers, 'equipment:' + key + ': tamaño de furgón ambiguo o ausente');
        continue;
      }
      // Resolve a TYPE UUID, never the size UUID. Require the exact official
      // size + kind + code triple; a generic "Furgón" cannot resolve.
      const kind = FTL_KINDS.get(line.type);
      const sizeCode = String(candidates[0].feet ?? candidates[0].value ?? '').trim();
      const matches = kind && FTL_SIZES.has(sizeCode) ? unique(types ?? [], item =>
        idValid(item?.id) && item.size === sizeCode &&
        item.kind === kind.kind && item.code === sizeCode + '_' + kind.code) : [];      if (matches.length !== 1) {
        missing(blockers, 'equipment:' + key + ': falta verificar ID de tipo de furgón en Pricing');
        continue;
      }
      lookup.equipment[key] = {
        id: matches[0].id, name: line.type, code: matches[0].code,
      };
    }
  }
  if (!Array.isArray(f.services) || f.services.length === 0) {
    missing(blockers, 'serviceIds: no hay servicios para mapear');
  } else {
    const services = freshItems(snapshots, 'pricing-services', now, blockers);
    for (const name of f.services) {
      const matches = unique(services ?? [], x =>
        idValid(x?.id) && (x.name === name || x.value === name));
      if (matches.length !== 1) {
        missing(blockers, 'serviceId:' + name + ': sin UUID inequívoco autorizado');
      } else lookup.serviceIds[name] = matches[0].id;
    }
  }
  missing(blockers, 'priority: debe elegirla un administrador autorizado');
  missing(blockers, 'externalContract: POST público y sus campos todavía no publicados');

  return { lookup, blockers };
}
