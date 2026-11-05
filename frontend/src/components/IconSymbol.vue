<script setup lang="ts">
import type { Component } from 'vue'
import {
  Anchor, ArrowDown, ArrowDownRight, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpRight,
  Check, CircleDot, Clock3, Container, List, Mail, MapPin, Menu, MessageCircle, Minus,
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
  ship: Ship, anchor: Anchor, truck: Truck, container: Container, multimodal: ArrowLeftRight, user: UserRound, newspaper: Newspaper, image: Image, 'message-circle': MessageCircle, pencil: Pencil, trash: Trash2
}
</script>

<template>
  <span class="lucide-symbol" aria-hidden="true">
    <!-- Open freight container: double outward-opening doors and stacked cargo.
         Uses Lucide's currentColor / round caps / outline geometry so it
         inherits the same color, dimensions and visual style as nearby icons. -->
    <svg v-if="glyph === 'container-open'" :width="size" :height="size" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 5.5h12v14.5H6z" />
      <path d="M6 6 1 3.5V20l5-2.5M18 6l5-2.5V20l-5-2.5" />
      <path d="M3 8v9m18-9v9" />
      <path d="M8 15h4v5H8zM12 12h4v8h-4zM10 9h3v3h-3z" />
    </svg>
    <component v-else :is="icons[glyph] ?? ArrowUpRight" :size="size" :stroke-width="2" />
  </span>
</template>

<style scoped>
.lucide-symbol{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:0}
.lucide-symbol :deep(svg){display:block;flex:none}
</style>
