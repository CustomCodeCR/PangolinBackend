import { createApp } from 'vue'
import App from './Root.vue'
import './style.css'
import './styles/frontend6-refinements.css'
import i18n from './i18n'
import { initializeRealtime } from './services/realtime'
import { connectSignalR } from './services/signalr'

createApp(App).use(i18n).mount('#app')

initializeRealtime()
connectSignalR()
