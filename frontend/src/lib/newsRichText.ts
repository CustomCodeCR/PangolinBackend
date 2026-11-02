const allowed = new Set(['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE'])
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const isHtmlArticle = (value: string) => /^\s*<(?:p|div|h[1-3]|ul|ol|blockquote|br|strong|b|em|i|u)\b/i.test(value)

export function sanitizeNewsHtml(value: string): string {
  if (!value.trim()) return ''
  if (!isHtmlArticle(value)) return value.split(/\n\s*\n/).filter(Boolean)
    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
  const document = new DOMParser().parseFromString(value, 'text/html')
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const children = Array.from(el.childNodes).map(clean).join('')
    if (!allowed.has(el.tagName)) return children
    const tag = el.tagName.toLowerCase() === 'div' ? 'p' : el.tagName.toLowerCase()
    return tag === 'br' ? '<br>' : `<${tag}>${children}</${tag}>`
  }
  return Array.from(document.body.childNodes).map(clean).join('')
}
