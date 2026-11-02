<script setup lang="ts">
import type { Component } from 'vue'
import {
  Anchor, ArrowDown, ArrowDownRight, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpRight,
  Check, CircleDot, Clock3, List, Mail, MapPin, Menu, MessageCircle, Minus,
  Moon, Newspaper, Image, Package, Pencil, Phone, Plane, Plus, Search, Settings, Ship, Sparkles, Sun, Trash2, Truck, UserRound, X
} from '@lucide/vue'

const props = withDefaults(defineProps<{ glyph: string; size?: number }>(), { size: 18 })
const icons: Record<string, Component> = {
  '↗': ArrowUpRight, '↘': ArrowDownRight, '→': ArrowRight, '←': ArrowLeft,
  '↓': ArrowDown, '↑': ArrowUp, '✈': Plane, '➜': ArrowRight,
  '☎': Phone, '✉': Mail, '◉': MessageCircle, '⌖': MapPin, '◷': Clock3,
  '×': X, '✓': Check, '−': Minus, '+': Plus, '▰': Package, '▤': List,
  '⌕': Search, '⚙': Settings, '☀': Sun, '☾': Moon, '☰': Menu,
  '◎': CircleDot, '✦': Sparkles, '⚓': Ship, '⇄': ArrowLeftRight,
  ship: Ship, anchor: Anchor, truck: Truck, multimodal: ArrowLeftRight, user: UserRound, newspaper: Newspaper, image: Image, 'message-circle': MessageCircle, pencil: Pencil, trash: Trash2
}
</script>

<template>
  <span class="lucide-symbol" aria-hidden="true">
    <svg
      v-if="glyph === 'ship-truck'"
      :width="size + 4"
      :height="size + 4"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      <!-- Single ship on a truck silhouette, in the Lucide outline style. -->
      <!-- Ship mast and shipping container. -->
      <path d="M6.5 9v4m-1.5-2h3" />
      <path d="M11 5h13v8H11z" />
      <path d="M11 7.5h13m-9.5 2v2m3-2v2m3-2v2" />
      <!-- Container ship hull, joined to the truck chassis. -->
      <path d="M3.5 13h25l-4 7H7.5z" />
      <path d="M10 20v2" />
      <!-- Trailer, truck cabin and wheels: one vehicle. -->
      <path d="M5 22h13v4H5z" />
      <path d="M18 22h3l4 3v2h-1.5" />
      <path d="M5 27h3m4 0h8" />
      <circle cx="10" cy="27" r="1.5" />
      <circle cx="21.5" cy="27" r="1.5" />
    </svg>svg>
    <component v-else :is="icons[glyph] ?? ArrowUpRight" :size="size" :stroke-width="2" />
  </span>
</template>

<style scoped>
.lucide-symbol{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:0}
.lucide-symbol :deep(svg){display:block;flex:none}
</style>
