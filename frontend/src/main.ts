import { initializeRealtime } from './services/realtime'
import { connectWebSocket } from './services/websocket'
import { createApp } from 'vue'
import App from './Root.vue'
import './style.css'
import i18n from './i18n'

createApp(App).use(i18n).mount('#app')

initializeRealtime()
connectWebSocket()
