const allowed = new Set(['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SPAN', 'FONT', 'SUP', 'SUB'])
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isHtmlArticle = (value: string) => /^\s*<(?:p|div|h[1-3]|ul|ol|blockquote|br|strong|b|em|i|u|s|strike|span|font|sup|sub)\b/i.test(value)
const fonts = new Set(["Arial","Arial Black","Arial Narrow","Calibri","Cambria","Candara","Consolas","Constantia","Corbel","Georgia","Verdana","Tahoma","Times New Roman","Courier New","Trebuchet MS","Impact","Palatino Linotype","Book Antiqua","Garamond","Century Gothic","Franklin Gothic Medium","Lucida Sans Unicode","Lucida Console","Segoe UI","Helvetica","Helvetica Neue","Geneva","Optima","Gill Sans","Futura","Baskerville","Didot","Rockwell","Copperplate","Brush Script MT","Comic Sans MS","Monaco","Menlo","Andale Mono","Roboto","Open Sans","Lato","Montserrat","Poppins","Inter","Nunito","Raleway","Oswald","Merriweather","Playfair Display","Source Sans 3","PT Sans","PT Serif","Noto Sans","Noto Serif","Ubuntu","Rubik","Work Sans","DM Sans","Libre Baskerville"])
const fontSizes = new Set(['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'])
const colors = new Set(['#111827', '#374151', '#9f1239', '#b91c1c', '#1d4ed8', '#047857', '#a16207', '#ffffff', '#000000', '#fef08a', '#bbf7d0', '#bfdbfe', '#fecdd3'])
const alignments = new Set(['left', 'center', 'right', 'justify'])

function safeColor(value: string): string | undefined {
  const normalized = value.trim().toLowerCase()
  if (/^#[a-f0-9]{6}$/.test(normalized) && colors.has(normalized)) return normalized
  const match = normalized.match(/^rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)$/)
  if (!match) return undefined
  const rgb = match.slice(1).map(Number)
  if (rgb.some(n => n > 255)) return undefined
  const hex = '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('')
  return colors.has(hex) ? hex : undefined
}
const safeFont = (value: string) => fonts.has(value.replace(/['"]/g, '').trim()) ? value.replace(/['"]/g, '').trim() : undefined
function safeStyles(el: Element): string {
  const style = (el as HTMLElement).style
  const parts: string[] = []
  const fontFamily = safeFont(style.fontFamily || el.getAttribute('face') || '')
  if (fontFamily) parts.push(`font-family:${fontFamily}`)
  const size = style.fontSize.trim().toLowerCase()
  if (fontSizes.has(size)) parts.push(`font-size:${size}`)
  const color = safeColor(style.color || el.getAttribute('color') || '')
  if (color) parts.push(`color:${color}`)
  const background = safeColor(style.backgroundColor || '')
  if (background) parts.push(`background-color:${background}`)
  if (alignments.has(style.textAlign)) parts.push(`text-align:${style.textAlign}`)
  if (style.marginLeft === '24px' || style.marginLeft === '48px') parts.push(`margin-left:${style.marginLeft}`)
  return parts.length ? ` style="${parts.join(';')}"` : ''
}

export function sanitizeNewsHtml(value: string): string {
  if (!value.trim()) return ''
  if (!isHtmlArticle(value)) return value.split(/\n\s*\n/).filter(Boolean)
    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const children = Array.from(el.childNodes).map(clean).join('')
    if (!allowed.has(el.tagName)) return children
    const tag = el.tagName.toLowerCase() === 'div' ? 'p' : el.tagName.toLowerCase() === 'font' ? 'span' : el.tagName.toLowerCase()
    return tag === 'br' ? '<br>' : `<${tag}${safeStyles(el)}>${children}</${tag}>`
  }
  return Array.from(parsed.body.childNodes).map(clean).join('')
}
