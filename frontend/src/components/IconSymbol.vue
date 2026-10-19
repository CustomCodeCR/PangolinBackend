<script setup lang="ts">
import type { Component } from 'vue'
import {
  ArrowDown, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight,
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
  '◎': CircleDot, '✦': Sparkles, ship: Ship, truck: Truck, user: UserRound, newspaper: Newspaper, image: Image, pencil: Pencil, trash: Trash2
}
</script>

<template>
  <span class="lucide-symbol" aria-hidden="true"><component :is="icons[glyph] ?? ArrowUpRight" :size="size" :stroke-width="2" /></span>
</template>

<style scoped>
.lucide-symbol{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:0}
.lucide-symbol :deep(svg){display:block;flex:none}
</style>
