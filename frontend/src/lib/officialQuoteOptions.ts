// Shared, official quote form field options for both the wizard and GIO.
// Keep serialized values identical across both entry points.
export type QuoteChoice = { value: string; label: string }
export type QuoteTranslate = (es: string, en: string) => string
export const officialIncoterms = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'] as const

export function officialEquipmentSizeOptions(type: string, tr: QuoteTranslate): QuoteChoice[] {
  if (type === 'FCL') return ['20','40','45','48'].map(n => ({
    value: n + ' pies',
    label: n + ' ' + tr('pies','ft')
  }))
  if (type === 'FTL') return [
    {value:'24 pies / 5 TON',label:'24 ' + tr('pies','ft') + ' / 5 TON'},
    {value:'26 pies / 7 TON',label:'26 ' + tr('pies','ft') + ' / 7 TON'},
    {value:'40 pies',label:'40 ' + tr('pies','ft')},
    {value:'53 pies',label:'53 ' + tr('pies','ft')}
  ]
  return []
}

export function officialEquipmentTypeOptions(type: string, tr: QuoteTranslate): QuoteChoice[] {
  if (type === 'FCL') return ['Dry Van','High Cube','Open Top','Open Side','Tank','Flat Rack','NOR']
    .map(value => ({value,label:value}))
  if (type === 'FTL') return [{value:'Furgón',label:tr('Furgón','Truck')}]
  return []
}
