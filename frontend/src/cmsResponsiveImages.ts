// The media endpoint verifies publication before every request and falls
// back to original bytes when a requested WebP derivative does not exist.
// Only its canonical, relative CMS image URLs are eligible for srcset.
const canonicalCmsMedia = /^\/api\/content\/media\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/file$/i
const widths = [360, 720, 1080, 1600] as const

export function cmsResponsiveSrcset(src: string, enabled: boolean): string | undefined {
  // Never append width parameters to external links, data URIs, static
  // assets, URLs with pre-existing queries, or admin-only endpoints.
  if (!enabled || !canonicalCmsMedia.test(src)) return undefined
  return widths.map(width => `${src}?width=${width} ${width}w`).join(', ')
}
