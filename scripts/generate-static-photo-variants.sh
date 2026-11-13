#!/usr/bin/env bash
# CI-only generation of original-preserving WebP/AVIF static photo variants.
set -euo pipefail
if [[ "$(printenv STATIC_PHOTO_REVIEW_ONLY 2>/dev/null || true)" != "1" ]]; then
  echo "Abortado: script limitado a revisión en rama aislada." >&2
  exit 1
fi
cd "$(dirname "$0")/.."
out="frontend/public/images"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for item in about-operations-enhanced.jpg cover-logistics.jpeg; do
  src="$out/$item"
  stem="$(echo "$item" | sed 's/\.[^.]*$//')"
  [[ -f "$src" ]] || { echo "No existe original: $src" >&2; exit 1; }
  cwebp -quiet -q 82 -m 6 -alpha_q 100 -metadata none "$src" -o "$tmp/$stem.webp"
  avifenc -s 6 --min 24 --max 34 "$src" "$tmp/$stem.avif" >/dev/null
  dwebp "$tmp/$stem.webp" -o "$tmp/$stem-webp.png" >/dev/null 2>&1
  avifdec "$tmp/$stem.avif" "$tmp/$stem-avif.png" >/dev/null
  original_size="$(identify -ping -format '%wx%h' "$src")"
  original_alpha="$(identify -ping -format '%[opaque]' "$src" | tr '[:upper:]' '[:lower:]')"
  for format in webp avif; do
    decoded="$tmp/$stem-$format.png"
    [[ "$(identify -ping -format '%wx%h' "$decoded")" == "$original_size" ]] || {
      echo "Dimensiones distintas en $stem.$format" >&2; exit 1;
    }
    if [[ "$original_alpha" == "false" ]]; then
      [[ "$(identify -ping -format '%[opaque]' "$decoded" | tr '[:upper:]' '[:lower:]')" == "false" ]] || {
        echo "Transparencia perdida en $stem.$format" >&2; exit 1;
      }
    fi
    [[ -s "$tmp/$stem.$format" ]] || { echo "Variante vacía" >&2; exit 1; }
    [[ "$(stat -c %s "$tmp/$stem.$format")" -lt "$(stat -c %s "$src")" ]] || {
      echo "Variante sin ahorro" >&2; exit 1;
    }
  done
done

# Only create new derivatives; do not overwrite any JPEG original.
for stem in about-operations-enhanced cover-logistics; do
  for format in webp avif; do
    cp "$tmp/$stem.$format" "$out/$stem.$format"
    printf 'PASS static %s.%s (%s bytes)\n' "$stem" "$format" "$(stat -c %s "$out/$stem.$format")"
  done
done
