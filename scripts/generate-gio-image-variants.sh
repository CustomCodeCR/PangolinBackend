#!/usr/bin/env bash
# Prepara recursos nuevos para revisión. Conserva los PNG existentes intactos.
set -euo pipefail
if [[ "$(printenv GIO_IMAGE_REVIEW_ONLY 2>/dev/null || true)" != "1" ]]; then
  echo "Abortado: generador exclusivo para una rama aislada de revisión." >&2
  exit 1
fi
cd "$(dirname "$0")/.."
out="frontend/public/images"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for stem in gio-assistant-base gio-assistant-hand; do
  src="$out/$stem.png"
  [[ -f "$src" ]] || { echo "Falta original $src" >&2; exit 1; }
  cwebp -quiet -q 82 -m 6 -alpha_q 100 -metadata none "$src" -o "$tmp/$stem.webp"
  avifenc -s 6 --min 24 --max 34 "$src" "$tmp/$stem.avif" >/dev/null
  dwebp "$tmp/$stem.webp" -o "$tmp/$stem-webp-check.png" >/dev/null 2>&1
  avifdec "$tmp/$stem.avif" "$tmp/$stem-avif-check.png" >/dev/null
  original_dimensions="$(identify -ping -format '%wx%h' "$src")"
  original_alpha="$(identify -ping -format '%[opaque]' "$src")"
  for codec in webp avif; do
    decoded="$tmp/$stem-$codec-check.png"
    [[ "$(identify -ping -format '%wx%h' "$decoded")" == "$original_dimensions" ]] ||
      { echo "$stem $codec cambió dimensiones" >&2; exit 1; }
    if [[ "$original_alpha" == "False" ]]; then
      [[ "$(identify -ping -format '%[opaque]' "$decoded")" == "False" ]] ||
        { echo "$stem $codec perdió transparencia" >&2; exit 1; }
    fi
    [[ -s "$tmp/$stem.$codec" ]] ||
      { echo "$stem $codec vacío" >&2; exit 1; }
    [[ "$(stat -c %s "$tmp/$stem.$codec")" -lt "$(stat -c %s "$src")" ]] ||
      { echo "$stem $codec no reduce tamaño" >&2; exit 1; }
  done
done

# Nunca reemplazar los PNG del CMS o los originales estáticos.
for stem in gio-assistant-base gio-assistant-hand; do
  for codec in webp avif; do
    cp "$tmp/$stem.$codec" "$out/$stem.$codec"
    printf 'PASS GIO %s.%s (%s bytes)\n' "$stem" "$codec" "$(stat -c %s "$out/$stem.$codec")"
  done
done
