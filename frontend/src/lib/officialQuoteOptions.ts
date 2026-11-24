// Shared, official quote form field options for both the wizard and GIO.
// Keep serialized values identical across both entry points.
export type QuoteChoice = { value: string; label: string }
export type QuoteTranslate = (es: string, en: string) => string
// Temporary reviewed Dhole currency options, pending a published currency GET.
const officialCurrencyCodes = ['USD','CRC','EUR'] as const
export function isOfficialCurrency(value: string): boolean {
  return (officialCurrencyCodes as readonly string[]).includes(value)
}
export function officialCurrencyOptions(tr: QuoteTranslate): QuoteChoice[] {
  const names: Record<typeof officialCurrencyCodes[number], string> = {
    USD: tr('Dólar estadounidense','US dollar'),
    CRC: tr('Colón costarricense','Costa Rican colón'),
    EUR: tr('Euro','Euro')
  }
  return officialCurrencyCodes.map(value => ({value, label: value + ' — ' + names[value]}))
}

export const officialIncoterms = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'] as const

export const officialServiceOptions = [
  'Transporte internacional', 'Agencia de Aduanas CR', 'Agencia de Aduanas Exterior',
  'Almacenamiento', 'Control de inventario', 'Embalaje', 'Exoneración',
  'Picking Carga', 'Recepción de carga', 'Seguro de carga', 'Transporte entrega',
  'Transporte recolección'
] as const
const officialServiceNames: Readonly<Record<string, [string,string]>> = {
  'Transporte internacional':['Transporte internacional','International transportation'],
  'Agencia de Aduanas CR':['Agencia de Aduanas CR','Costa Rica customs brokerage'],
  'Agencia de Aduanas Exterior':['Agencia de Aduanas Exterior','Foreign customs brokerage'],
  'Almacenamiento':['Almacenamiento','Warehousing'],
  'Control de inventario':['Control de inventario','Inventory control'],
  'Embalaje':['Embalaje','Packing'],
  'Exoneración':['Exoneración','Duty exemption'],
  'Picking Carga':['Picking Carga','Cargo picking'],
  'Recepción de carga':['Recepción de carga','Cargo receiving'],
  'Seguro de carga':['Seguro de carga','Cargo insurance'],
  'Transporte entrega':['Transporte entrega','Delivery transportation'],
  'Transporte recolección':['Transporte recolección','Pickup transportation'],
  'Transporte nacional':['Transporte nacional','Domestic transportation']
}
export function officialServiceName(value: string, tr: QuoteTranslate): string {
  const names = officialServiceNames[value]
  return names ? tr(names[0], names[1]) : value
}


export function officialEquipmentTypeLabel(value: string, tr: QuoteTranslate): string {
  return officialEquipmentTypeOptions('FTL', tr).find(item => item.value === value)?.label ?? value
}

export function officialEquipmentSizeOptions(type: string, tr: QuoteTranslate): QuoteChoice[] {
  if (type === 'FCL') return ['20','40','45','48'].map(n => ({
    value: n + ' pies',
    label: n + ' ' + tr('pies','ft')
  }))
  if (type === 'FTL') return [
    {value:'24 pies / 5 TON',label:'24 ' + tr('pies','ft') + ' / 5 TON'},
    {value:'26 pies / 7 TON',label:'26 ' + tr('pies','ft') + ' / 7 TON'},
    {value:'48 pies',label:'48 ' + tr('pies','ft')},
    {value:'53 pies',label:'53 ' + tr('pies','ft')}
  ]
  return []
}

export function officialEquipmentTypeOptions(type: string, tr: QuoteTranslate): QuoteChoice[] {
  if (type === 'FCL') return ['Dry Van','High Cube','Open Top','Open Side','Tank','Flat Rack','NOR']
    .map(value => ({value,label:value}))
  if (type === 'FTL') return [
    {value:'Furgón seco',label:tr('Furgón seco','Dry van')},
    {value:'Plataforma / Carreta',label:tr('Plataforma / Carreta','Platform / Flatbed')},
    {value:'Refrigerado',label:tr('Refrigerado','Refrigerated')},
    {value:'Furgón con cortina',label:tr('Furgón con cortina','Curtainsider')}
  ]
  return []
}

// Compare only complete positive line weights; do not infer missing values.
export function totalCargoWeightKg(weights: unknown[], unit: string): number | null {
  if (!weights.length || !['kg','lb'].includes(unit) ||
      weights.some(v => v === '' || v === null || v === undefined)) return null
  const numbers = weights.map(Number)
  if (numbers.some(n => !Number.isFinite(n) || n <= 0)) return null
  const total = numbers.reduce((sum, n) => sum + n, 0) * (unit === 'lb' ? 0.45359237 : 1)
  return Number.isFinite(total) && total > 0 ? total : null
}
export function formatCargoWeightKg(weight: number, tr: QuoteTranslate): string {
  return weight.toLocaleString(tr('es-CR','en-US'), weight > 0 && weight < 0.001
    ? {maximumSignificantDigits: 3} : {maximumFractionDigits: 9})
}
export function declaredWeightAdvisory(declared: unknown, totalKg: number | null, tr: QuoteTranslate): string {
  if (declared === '' || declared === null || declared === undefined ||
      totalKg === null || !Number.isFinite(totalKg) || totalKg <= 0) return ''
  const weight = Number(declared)
  if (!Number.isFinite(weight) || weight < 0) return ''
  const delta = weight - totalKg
  // No business tolerance: flag every real difference in either direction.
  // Ignore only machine-level floating-point noise from sums/conversions.
  if (Math.abs(delta) <= Number.EPSILON * Math.max(Math.abs(weight), totalKg) * 4) return ''
  const calculated = formatCargoWeightKg(totalKg, tr)
  const stated = formatCargoWeightKg(weight, tr)
  const difference = formatCargoWeightKg(Math.abs(delta), tr)
  return tr(
    `El peso calculado es ${calculated} kg y declaraste ${stated} kg (${difference} kg ${delta > 0 ? 'menos' : 'más'} en las líneas). Revisá que ambos pesos tengan la misma base (por ejemplo, embalaje o tara). Si la diferencia es intencional, podés continuar.`,
    `The calculated weight is ${calculated} kg and you declared ${stated} kg (${difference} kg ${delta > 0 ? 'less' : 'more'} in the lines). Check that both weights use the same basis (e.g. packaging or tare). If the difference is intentional, you can continue.`
  )
}
