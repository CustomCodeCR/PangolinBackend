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
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M10 7v3m3-3v3" />
      <path d="M2 11h20l-3 4H6z" />
      <path d="M3 16h9v2H3z" />
      <path d="M12 16h3l2 2v1h-1" />
      <circle cx="7" cy="20" r="1" />
      <circle cx="15" cy="20" r="1" />
    </svg>
    <component v-else :is="icons[glyph] ?? ArrowUpRight" :size="size" :stroke-width="2" />
  </span>
</template>

<style scoped>
.lucide-symbol{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:0}
.lucide-symbol :deep(svg){display:block;flex:none}
</style>
