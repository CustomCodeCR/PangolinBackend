import { createApp } from 'vue'
import App from './Root.vue'
import './style.css'
// Correcciones aisladas de responsividad, cargadas después del diseño general.
import './responsive-regressions.css'
import i18n from './i18n'
import { initializeRealtime } from './services/realtime'
import { connectWebSocket } from './services/websocket'

createApp(App).use(i18n).mount('#app')

initializeRealtime()
connectWebSocket()
