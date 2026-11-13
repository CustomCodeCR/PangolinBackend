// Regression guards for the 2026-10-19 frontend integration.
// Run: node frontend/scripts/test-frontend-merge.cjs (or from frontend: node scripts/test-frontend-merge.cjs)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
function source(relative) {
  const filename = path.join(root, relative)
  assert.ok(fs.existsSync(filename), 'Falta archivo requerido: ' + relative)
  return fs.readFileSync(filename, 'utf8')
}
// Google lee el favicon desde la raíz del host. Nuxt y Vue deben publicar
// los mismos bytes PNG, no un icono transparente ni un 404 en la ruta SSR.
const vueFavicon = fs.readFileSync(path.join(root, 'public/favicon.png'))
const nuxtFaviconPath = path.join(root, 'nuxt/public/favicon.png')
assert.ok(fs.existsSync(nuxtFaviconPath), 'Nuxt debe publicar /favicon.png en su directorio public')
const nuxtFavicon = fs.readFileSync(nuxtFaviconPath)
assert.ok(vueFavicon.equals(nuxtFavicon), 'Nuxt y Vue deben publicar exactamente el mismo favicon corporativo')
assert.equal(nuxtFavicon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'El favicon debe ser un PNG válido')
const faviconWidth = nuxtFavicon.readUInt32BE(16)
const faviconHeight = nuxtFavicon.readUInt32BE(20)
assert.ok(faviconWidth >= 48 && faviconWidth === faviconHeight,
  'Google necesita un favicon cuadrado de al menos 48 px para calidad óptima')
assert.match(source('nuxt/nuxt.config.ts'), /href: '\/favicon\.png'/,
  'El head SSR debe anunciar el PNG publicado')
assert.match(source('index.html'), /rel="icon"[^>]*href="\/favicon\.png"/,
  'La aplicación Vue debe anunciar el mismo PNG')

const main = source('src/main.ts')
// Session-required screens (quote v1/v2 and tracking) must translate without changing the login redirect.
const authRoot = source('src/Root.vue')
const authEs = JSON.parse(source('src/locales/es.json'))
const authEn = JSON.parse(source('src/locales/en.json'))
for (const [key, esText, enText] of [
  ['sessionRequiredTitle', 'Se requiere una sesión activa', 'An active session is required'],
  ['quoteSessionRequiredHelp', 'Iniciá sesión para enviar una solicitud.', 'Sign in to submit a request.'],
  ['trackingSessionRequiredHelp', 'Iniciá sesión con una cuenta autorizada para rastrear tus embarques.', 'Sign in with an authorized account to track your shipments.'],
  ['sessionRequiredAction', 'Iniciar sesión', 'Sign in']
]) {
  assert.equal(authEs.custom.quote[key], esText, 'Texto español del aviso: ' + key)
  assert.equal(authEn.custom.quote[key], enText, 'Texto inglés del aviso: ' + key)
}
for (const [key, count] of [['sessionRequiredTitle', 3], ['quoteSessionRequiredHelp', 2], ['trackingSessionRequiredHelp', 1], ['sessionRequiredAction', 3]]) {
  assert.equal(authRoot.split(`t('custom.quote.${key}')`).length - 1, count, 'Avisos de cotizaciones y tracking traducidos: ' + key)
}
assert.match(authRoot, /const loginNextHref = '\/bienvenidos\?next=' \+ encodeURIComponent/, 'Se conserva el destino de inicio de sesión')
assert.doesNotMatch(authRoot, /<h1>Se requiere una sesión activa<\/h1>/, 'No deben quedar avisos de sesión en español fijo')

assert.match(main, /connectSignalR\(\)/, 'SignalR no debe ser sustituido por WebSocket legado')
source('src/services/signalr.ts')
source('src/services/realtime.ts')
source('src/components/SiteMedia.vue')

// GIO mantiene la mascota accesible, mientras su aviso se muestra solo tras scroll.
const gioAssistant = source('src/components/AssistantBot.vue')
assert.match(gioAssistant, /const hasPageScrolled = ref\(false\)/,
  'El aviso de GIO inicia oculto en la parte superior de cualquier página')
assert.match(gioAssistant, /window\.scrollY,[\s\S]*?document\.documentElement\.scrollTop,[\s\S]*?document\.body\.scrollTop[\s\S]*?\) > 0/,
  'El aviso se activa solo cuando el scroll real de la página supera cero')
assert.match(gioAssistant, /window\.addEventListener\('scroll', syncPageScroll, \{ passive: true \}\)/,
  'El listener de scroll de GIO es pasivo')
assert.match(gioAssistant, /window\.removeEventListener\('scroll', syncPageScroll\)/,
  'El listener se retira al desmontar GIO')
assert.match(gioAssistant, /window\.addEventListener\('pageshow', syncPageScroll\)/,
  'Se sincroniza la visibilidad al restaurar una página')
assert.match(gioAssistant, /:class="\{ 'site-assistant__hint--visible': hasPageScrolled \}"/,
  'Solo la nube del comentario cambia con el scroll')
assert.match(gioAssistant, /\.site-assistant__mascot \.site-assistant__hint\{[\s\S]*?opacity:0;[\s\S]*?transition:opacity \.35s ease,transform \.35s ease;/,
  'La nube empieza invisible y aparece gradualmente')
assert.match(gioAssistant, /\.site-assistant__mascot \.site-assistant__hint--visible\{[\s\S]*?opacity:1;/,
  'La nube alcanza su opacidad original tras bajar')
assert.match(gioAssistant, /@media\(prefers-reduced-motion:reduce\)/,
  'La transición respeta movimiento reducido')
assert.match(gioAssistant, /background:rgba\(255,255,255,\.74\)/,
  'La nube de GIO tiene un fondo blanco translúcido')
assert.match(gioAssistant, /-webkit-backdrop-filter:blur\(2px\)/,
  'El desenfoque de fondo funciona también en Safari')
assert.match(gioAssistant, /backdrop-filter:blur\(2px\)/,
  'La nube tiene un efecto glass sutil sin desenfocar el texto')
assert.match(gioAssistant, /\.site-assistant__mascot \.site-assistant__hint::before\{/,
  'La nube conserva un reflejo superior discreto')
assert.match(gioAssistant, /\.site-assistant__mascot \.site-assistant__hint::after\{/,
  'La nube conserva un reflejo lateral discreto')
assert.match(gioAssistant, /:global\(html\.theme-dark\) \.site-assistant__mascot \.site-assistant__hint\{/,
  'El glass se adapta al tema oscuro')
assert.match(gioAssistant, /background:rgba\(18,27,44,\.68\)/,
  'La nube no pierde legibilidad en tema oscuro')
assert.match(gioAssistant, /box-shadow:0 3px 10px rgba\(0,0,0,\.07\)/,
  'La sombra clara del glass es más discreta')
assert.match(gioAssistant, /rgba\(255,255,255,\.38\),transparent/,
  'El reflejo superior del aviso es más suave')
assert.match(gioAssistant, /<button class="site-assistant__mascot" type="button"/,
  'El botón de GIO nunca se oculta')
const gioMascotButton = gioAssistant.split('<button class="site-assistant__mascot"')[1]?.split('</button>')[0] ?? ''
assert.match(gioMascotButton, /@click="togglePanel"/,
  'La mascota utiliza el controlador único para abrir o cerrar GIO')
assert.match(gioMascotButton, /<span class="site-assistant__hint"[^>]*>\{\{ isEnglish/,
  'La nube clicable es parte del mismo botón, sin botón anidado ni segundo evento')
assert.match(gioAssistant, /\.site-assistant__mascot \.site-assistant__hint--visible\{[\s\S]*?pointer-events:auto;[\s\S]*?cursor:pointer;/,
  'La nube visible recibe los clics y el botón padre abre el chat')
assert.match(gioAssistant, /\.site-assistant__mascot \.site-assistant__hint\{[\s\S]*?pointer-events:none;/,
  'La nube invisible no intercepta clics al estar arriba')

// The tracking globe uses one animated icon and an elevated trail, no fixed itinerary bar.
const trackingGlobe = source('src/components/WorldGlobe.vue')
// Los océanos azules y continentes verdes son permanentes en Inicio y Tracking.
// La estela y los marcadores de los embarques siguen siendo independientes.
const globePalette = trackingGlobe.split('function themePalette() {')[1]?.split('function animateZoom(')[0] ?? ''
assert.ok(globePalette.includes("ocean: ['#1e5f8f','#0f2f4f']") &&
  globePalette.includes("land:'#5e8d52'") &&
  globePalette.includes("border:'#83aa79'"),
  'Océanos azules y continentes verdes en todas las instancias del globo')
assert.ok(globePalette.includes("marker:'#a80e18', arc:'#a80e18'") &&
  globePalette.includes("shadeStrength:.52"),
  'Marcadores rojos y sombreado natural conservados')
assert.doesNotMatch(globePalette, /props\.realisticColors|theme-dark|#fffafa|#3d424b/,
  'La paleta no depende de embarques ni del tema claro/oscuro')
assert.doesNotMatch(trackingGlobe, /realisticColors|realistic-colors/,
  'El componente no expone una opción para desactivar la paleta natural')
assert.doesNotMatch(source('src/pages/Tracking.vue'), /realisticGlobeColors|realistic-colors/,
  'Tracking no condiciona los colores del globo al resultado de Dynamics')
assert.match(trackingGlobe, /MutationObserver\(\(\) => globe\?\.setTheme\(themePalette\(\)\)\)/,
  'El cambio de tema repinta los pines sin cambiar los tonos de mar y tierra')
assert.match(trackingGlobe, /const legs = routePoints\.value\.slice\(1\)\.map\(/, 'La ruta conserva cada tramo de todas las escalas')
assert.match(trackingGlobe, /for \(let index = 0; index < legs\.length; index\+\+\)/, 'El vehículo avanza por los tramos, en orden')
assert.match(trackingGlobe, /const demoArcs = \(\) => props\.shipment\s*\?\s*\[\]/, 'El tracking no dibuja la línea animada anterior')
assert.match(trackingGlobe, /<span v-if="routeVehicle"/, 'Un solo icono para el embarque')
assert.doesNotMatch(trackingGlobe, /v-for="vehicle|routeVehicleIcons/, 'No duplicar iconos por cada tramo')
assert.doesNotMatch(trackingGlobe, /world-globe__route-stops/, 'No mostrar el listado inferior de escalas')
assert.match(trackingGlobe, /cancelAnimationFrame\(vehicleFrame\)/, 'Se detiene la animación al desmontar')
assert.match(trackingGlobe, /motionMedia\?\.matches \? 0/, 'Respetar movimiento reducido')

assert.match(trackingGlobe, /const commands: string\[\] = \[\]/, 'La estela se construye con la trayectoria recorrida')
assert.match(trackingGlobe, /routeTrail\.value = commands\.join\(' '\)/, 'La estela sigue el recorrido del icono')
assert.match(trackingGlobe, /<svg class="world-globe__route-trail"/, 'Existe un SVG para la estela')
assert.match(trackingGlobe, /<TrackingTransportModel :glyph="routeVehicle\.glyph" \/>/, 'Cada ícono usa la miniatura con volumen')
const trackingModels = source('src/components/TrackingTransportModel.vue')
for (const variant of ["ship", "✈", "truck"]) {
  assert.ok(trackingModels.includes('glyph === ' + "'" + variant + "'"), 'Existe modelo isométrico de ' + variant)
}
assert.match(trackingModels, /linearGradient/, 'Las miniaturas tienen luces y sombras, sin WebGL ni assets externos')
assert.match(trackingModels, /tracking-model-highlight/, 'Las miniaturas heredan colores del tema')
assert.match(trackingModels, /tracking-plane-engine-3d/, 'Nuevo avión incluye motores con volumen')
assert.match(trackingModels, /Far wing: rearward tip \(x=31\) and forward root \(x=77\)/,
  'El ala superior está barrida hacia atrás, no hacia la nariz')
assert.match(trackingModels, /Near wing: tip x=32 is behind the leading root x=79/,
  'El ala inferior también está barrida hacia atrás')
assert.match(trackingModels, /M55 31 31 6 43 4 77 29Z/,
  'Silueta del ala superior con punta detrás de la raíz')
assert.match(trackingModels, /M55 36 32 57 46 60 79 39Z/,
  'Silueta del ala inferior con punta detrás de la raíz')
assert.match(trackingModels, /viewBox="0 0 120 64"/, 'El jet conserva una silueta horizontal sin iconografía externa')
assert.match(trackingModels, /tracking-transport-model--plane\{width:54px;height:32px\}/,
  'El avión reduce su tamaño en dispositivos pequeños')

assert.match(trackingGlobe, /const seaToRoad = legs\.length >= 2/, 'Marítimo con dos tramos activa el cambio de vehículo')
assert.match(trackingGlobe, /const elevatedPoint = /, 'Icono y estela comparten proyección elevada')
assert.match(trackingGlobe, /\.22 \* Math\.sin\(Math\.PI \* t\)/, 'Parábola con elevación máxima en mitad de cada tramo')
assert.match(trackingGlobe, /projectElevated\(coordinates\.lon, coordinates\.lat/, 'El recorrido se dibuja sobre la esfera')
assert.match(trackingGlobe, /const projected = elevatedPoint\(leg, activeProgress\)/, 'El icono se mueve sobre la curva')
assert.match(trackingGlobe, /const p = elevatedPoint\(segment, \(step \/ count\) \* fraction\)/, 'La estela sigue la misma curva')
assert.match(trackingGlobe, /--tracking-trail-gray:#fff; --tracking-trail-border:#741126/, 'La trayectoria clara es blanca con borde vino para contrastar')
assert.match(trackingGlobe, /--tracking-trail-halo:#67091e; --tracking-trail-halo-opacity:\.45/, 'La estela clara tiene un halo rojo vino tenue')
assert.match(trackingGlobe, /--tracking-trail-glow:rgba\(103,9,30,\.45\)/, 'El núcleo claro proyecta un brillo vino tenue')
assert.match(trackingGlobe, /--tracking-model-main:#fff; --tracking-model-shade:#8b96a5/, 'El vehículo en tema claro es blanco con volumen gris')
assert.match(trackingGlobe, /--tracking-model-outline:#606b78/, 'Los bordes del vehículo en tema claro son grises')
assert.match(trackingGlobe, /:global\(html\.theme-dark \.world-globe\)\s*\{[\s\S]*?--tracking-model-main:#fff; --tracking-model-shade:#8b96a5;[\s\S]*?--tracking-model-light:#e7ecf1; --tracking-model-highlight:#fff;[\s\S]*?--tracking-model-window:#8c939d; --tracking-model-outline:#606b78;/,
  'El barco en modo oscuro es idéntico al claro: blanco con caras y bordes grises')
assert.match(trackingModels, /stroke="var\(--tracking-model-outline, transparent\)"/, 'Los SVG isométricos preservan contorno dependiente del tema')
assert.match(trackingModels, /filter:none;/, 'El vehículo animado no genera sombras proyectadas fantasma')
assert.match(trackingGlobe, /\.world-globe__route-vehicle\{[^}]*filter:none\}/, 'El globo no proyecta una segunda sombra del vehículo')
assert.doesNotMatch(trackingModels, /<ellipse\b/, 'No dibujar óvalos de sombra debajo del barco ni el camión')
assert.match(trackingGlobe, /:global\(html\.theme-dark \.world-globe\)\s*\{[\s\S]*?--tracking-trail-gray:#fff7f8; --tracking-trail-border:#ca2948;/,
  'La ruta del modo oscuro usa núcleo cálido y borde rubí')
assert.match(trackingGlobe, /--tracking-trail-halo:#ea4664; --tracking-trail-halo-opacity:\.55/, 'La estela oscura tiene un halo rubí más visible')
assert.match(trackingGlobe, /--tracking-trail-glow:rgba\(234,70,100,\.55\)/, 'El núcleo oscuro proyecta un brillo rubí')
assert.match(trackingGlobe, /class="world-globe__route-trail-border" :d="routeTrail"/, 'La línea de recorrido incluye el borde independiente')
assert.match(trackingGlobe, /\.world-globe__route-trail-border\{stroke:var\(--tracking-trail-border\)!important;stroke-width:6\.2\}/, 'El borde de color es fino y no invade el núcleo blanco')
assert.match(trackingModels, /tracking-transport-model--truck\{[\s\S]*?--tracking-model-main:#fff;[\s\S]*?--tracking-model-window:#8c939d;[\s\S]*?--tracking-model-outline:#606b78;/,
  'Camión idéntico en claro y oscuro, con ventanas grises y contorno reforzado')
assert.match(trackingGlobe, /\.world-globe__route-trail-border\{stroke-width:5\}/, 'El contorno de color sigue visible en móvil')
assert.match(trackingModels, /tracking-ship-deck-3d/, 'El barco muestra cubierta iluminada con profundidad')
assert.match(trackingModels, /tracking-ship-side-3d/, 'El casco tiene caras laterales y sombra tridimensional')
assert.match(trackingModels, /tracking-transport-model--ship\{width:78px;height:51px\}/, 'El barco conserva dimensiones visibles en escritorio')
assert.match(trackingGlobe, /--tracking-trail-glow:/, 'Los dos temas conservan iluminación tenue')
assert.match(trackingGlobe, /\.world-globe__route-trail-halo\{stroke:var\(--tracking-trail-halo\)!important;stroke-width:9;opacity:var\(--tracking-trail-halo-opacity\);filter:blur\(2px\)\}/, 'La estela tiene halo difuminado configurable por tema')
assert.match(trackingGlobe, /world-globe__route-trail-core/, 'La estela tiene trazo definido')
assert.match(trackingGlobe, /segment\.glyph === 'truck' \? 0 : \.22 \* Math\.sin\(Math\.PI \* t\)/,
  'El camión viaja sobre la esfera sin parábola, barco y avión elevados')
assert.match(trackingGlobe, /projectElevated\(coordinates\.lon, coordinates\.lat, lift\)/,
  'Ícono y estela usan exactamente la elevación de su tramo')
const globeRenderer = source('src/lib/castroGlobe.js')
const globeTypes = source('src/lib/castroGlobe.d.ts')
assert.match(globeRenderer, /projectElevated\(lon, lat, lift = 0\)/, 'Motor permite dibujar por encima del globo')
assert.match(globeRenderer, /visible: dot >= 0 \|\| outside/, 'El arco respeta la cara oculta del globo')
assert.match(globeTypes, /projectElevated\(lon: number, lat: number, lift\?: number\)/, 'Tipado de la proyección elevada')

assert.match(trackingGlobe, /index === 0 \? 'ship' : 'truck'/, 'Rutas multimodales cambian al camión en la primera escala')
assert.match(trackingGlobe, /props\.shipment\?\.transport === 'sea' \|\| props\.shipment\?\.transport === 'multimodal'/, 'Dos tramos marítimos o multimodales cambian a camión')
assert.doesNotMatch(trackingGlobe, /\.world-globe__route-vehicle\{[^}]*border-radius:50%/, 'Ícono de transporte sin círculo')
assert.match(trackingGlobe, /cancelAnimationFrame\(vehicleFrame\)/, 'Se limpia la animación correctamente')
const trackingModeSource = source('src/pages/Tracking.vue')
assert.match(trackingModeSource, /multi\[\\s-\]\?modal\|intermodal/, 'Tracking reconoce el modo multimodal explícito')


source('src/siteCms.ts')
const mainStyles = source('src/style.css')
assert.match(mainStyles, /html\.theme-dark \.header-settings__panel\{--settings-surface:rgba\(10,18,40,\.96\)/, 'Configuración mantiene su fondo oscuro original')
assert.match(mainStyles, /html\.theme-dark \.site-header \.nav-dropdown__menu\s*\{[\s\S]*?background:rgba\(10,18,40,\.96\)!important;/, 'Carga internacional reutiliza exactamente el fondo de Configuración')
assert.match(mainStyles, /html\.theme-dark \.site-header \.nav-dropdown__menu::before\s*\{[\s\S]*?rgba\(214,14,52,\.46\)/, 'Carga internacional conserva el brillo rojo del panel de Configuración')
assert.match(mainStyles, /html\.theme-dark \.site-header \.nav-dropdown__menu a\s*\{[\s\S]*?color:#fff!important;/, 'Opciones blancas legibles sobre el menú oscuro')
assert.match(mainStyles, /html\.theme-dark \.site-header \.nav-dropdown__menu a:is\(:hover,:focus-visible\)/, 'Conservar interacción hover y teclado')
assert.match(mainStyles, /@media \(max-width:800px\)\s*\{\s*html\.theme-dark \.site-header\.site-header--menu-open \.main-nav\.main-nav--open \.nav-dropdown__menu\s*\{[\s\S]*?background:rgba\(10,18,40,\.96\)!important;/, 'El menú móvil usa también el fondo de Configuración')
assert.doesNotMatch(mainStyles, /html\.theme-dark \.nav-dropdown__menu\{background:#fff!important/, 'Nunca mostrar fondo blanco en modo oscuro')
// One published Home news card must not run a vertical looping animation.
const homeNewsLayout = source('src/Home.vue')
assert.match(homeNewsLayout, /home-news-sidebar--single': homeNews\.length === 1/, 'La noticia única se identifica reactivamente')
assert.match(homeNewsLayout, /homeNews\.length > 1 \? 4 : 1/, 'Varias noticias generan suficientes copias para un loop vertical sin huecos')
assert.match(homeNewsLayout, /:aria-hidden="copy > 1"/, 'Las copias del bucle no se anuncian repetidamente')
assert.match(homeNewsLayout, /:tabindex="copy > 1 \? -1 : 0"/, 'Las copias del bucle no duplican tabulaciones')
assert.match(mainStyles, /@keyframes home-news-up\{to\{transform:translateY\(-25%\)\}\}/, 'El bucle avanza exactamente una de cuatro copias')
assert.match(mainStyles, /\.home-news-sidebar__group:nth-child\(n\+2\)/, 'En pantallas intermedias no mostrar clones extra')
assert.match(mainStyles, /\.home-news-sidebar__group:nth-child\(n\+3\)/, 'En el carrusel móvil se muestran solo dos copias')
assert.match(mainStyles, /\.home-news-sidebar--single \.home-news-sidebar__track\s*\{\s*animation: none !important;\s*transform: none !important;/, 'Una noticia se mantiene fija arriba sin bucle')
assert.match(mainStyles, /\.home-news-sidebar--single \.home-news-sidebar__group:first-child\s*\{\s*justify-content: flex-start;/, 'La noticia vertical queda anclada en el inicio')
const siteHeader = source('src/components/SiteHeader.vue')
assert.match(siteHeader, /'site-header--quotes': props\.active === 'cotizaciones'/, 'Los colores de perfil solo deben ajustarse en Cotizaciones')
assert.match(siteHeader, /html:not\(\.theme-dark\) \.app-site\.official-page > \.site-header\.site-header--quotes \.header-account-tools \.nav-user-icon\.header-profile__trigger\s*\{[^}]*color: #20242b !important;[^}]*border: 1px solid rgba\(32, 36, 43, \.26\) !important;/, 'El botón de perfil en Cotizaciones debe tener trazo y borde oscuros en modo claro')
assert.match(siteHeader, /\.header-profile__trigger svg\s*\{[^}]*stroke: currentColor !important;/, 'El icono de usuario debe usar trazo visible')
assert.match(siteHeader, /html:not\(\.theme-dark\) \.app-site\.official-page > \.site-header\.site-header--quotes[\s\S]*?\.header-profile__trigger:is\(:hover, \[aria-expanded="true"\]\)/, 'El botón mantiene hover y estado abierto')
assert.doesNotMatch(siteHeader, /:global\(html:not\(\.theme-dark\)\) \.site-header--quotes/, 'No usar el selector scoped que no aplica correctamente al perfil')
const visualEditor = source('src/pages/SiteVisualEditor.vue')
const manager = source('src/pages/ContentManager.vue')
assert.match(manager, /SiteVisualEditor/, 'Conservar editor visual del CMS')
assert.match(manager, /manager-subtabs--with-quotes': officialQuotesEnabled/, 'El grid móvil debe distinguir si hay Cotizaciones')
assert.match(manager, /@media \(min-width:651px\)\s*\{[\s\S]*?\.content-manager\.is-embedded \.manager-tabs\.manager-subtabs\s*\{\s*display:grid;\s*grid-template-columns:repeat\(6,max-content\);\s*justify-content:space-between;/, 'Las seis pestañas deben tener separaciones iguales en escritorio')
assert.match(manager, /@media \(min-width:651px\) and \(max-width:1250px\)\s*\{[\s\S]*?grid-template-columns:repeat\(6,minmax\(0,1fr\)\);/, 'Pantallas intermedias mantienen seis columnas compactas')
assert.match(manager, /\.content-manager\.is-embedded \.manager-tabs\.manager-subtabs\s*\{[^}]*overflow-x:hidden;/, 'No debe existir desplazamiento horizontal en pestañas de escritorio')
assert.match(manager, /@media \(min-width:651px\) and \(max-width:1250px\)/, 'Pestañas compactas en pantallas intermedias')
assert.match(manager, /@media\(max-width:650px\)\s*\{/, 'Se conserva el diseño móvil de dos columnas')
assert.match(manager, /manager-tabs\.manager-subtabs:not\(\.manager-subtabs--with-quotes\) > button\.manager-editor-visual-tab/, 'Editor visual debe centrarse si no hay Cotizaciones')
assert.match(manager, /manager-tabs\.manager-subtabs > button\s*\{\s*display:grid;\s*grid-template-columns:clamp\(28px,8vw,34px\) minmax\(0,1fr\) auto;/, 'Las subpestañas móviles deben alinear icono, texto y contador en tres columnas')
assert.match(manager, /class="manager-tab-label">Editor visual<\/span> <span>0<\/span>/, 'El contador de Editor visual queda como tercera columna junto al texto')
const officialQuote = source('src/pages/OfficialQuoteWizard.vue')
// Bloquear fechas vencidas en ambos cotizadores y en la API, sin afectar filtros
// históricos de itinerarios. Toda la lógica usa el día local de Costa Rica.
const gioQuoteFlow = source('src/components/GioOperations.vue')
const officialQuoteEndpoint = source('../backend/Endpoints/OfficialQuoteEndpoints.cs')
assert.ok(officialQuote.includes(':min="earliestReadyDate"') &&
  officialQuote.includes('type="date"') &&
  officialQuote.includes('@focus="syncEarliestReadyDate"'),
  'El calendario de cotizaciones bloquea días previos al día actual en Costa Rica')
assert.ok(officialQuote.includes('window.setInterval(syncEarliestReadyDate, 60_000)') &&
  officialQuote.includes('window.clearInterval(earliestReadyTimer)'),
  'El límite del calendario se actualiza si el formulario permanece abierto')
assert.ok(officialQuote.includes('if (!isCargoReadyDateOnOrAfterToday(form.cargoReadyDate)) return cargoReadyDateError()') &&
  officialQuote.includes('step.value = 3\n    syncEarliestReadyDate()'),
  'El asistente normal valida la fecha al avanzar y nuevamente al enviar')
assert.ok(gioQuoteFlow.includes("if (key === 'cargoReadyDate' && !isCargoReadyDateOnOrAfterToday(value))") &&
  gioQuoteFlow.includes('const issue = validation(pending.key, pending.value)') &&
  gioQuoteFlow.includes('delete values[item.key]'),
  'GIO rechaza fechas vencidas incluso si provienen de un borrador o confirmación')
assert.ok(gioQuoteFlow.includes('if (day && isCargoReadyDateOnOrAfterToday(day[0])) values.cargoReadyDate = day[0]') &&
  gioQuoteFlow.includes('if (day && validDate(day[0])) values.departure = day[0]'),
  'GIO no precarga cotizaciones vencidas y mantiene filtros históricos de itinerarios')
assert.ok(officialQuoteEndpoint.includes('TimeZoneInfo.FindSystemTimeZoneById("America/Costa_Rica")') &&
  officialQuoteEndpoint.includes('TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, CostaRicaTimeZone)') &&
  officialQuoteEndpoint.includes('if (s.CargoReadyDate.Value < TodayInCostaRica())') &&
  officialQuoteEndpoint.includes('return Results.BadRequest(new { error = ex.Message });'),
  'El servidor compara el día real de Costa Rica y devuelve HTTP 400 ante fechas anteriores')

// Preserve the independent clear-in-place behavior merged in main-2 PR #78.
for (const [field, id] of [['origin', 'originLocationId'], ['destination', 'destinationLocationId'], ['pod', 'podLocationId']]) {
  assert.ok(officialQuote.includes(`'official-location-toggle--clear': !!form.${id}`), 'X reemplaza la flecha solo al seleccionar ' + field)
  assert.ok(officialQuote.includes(`@click="form.${id} ? clearLocation('${field}') : toggleLocation('${field}')"`), 'Alternar limpiar/abrir ubicaciones en ' + field)
  assert.ok(officialQuote.includes(`form.${id} ? q('Limpiar`), 'Etiqueta accesible al limpiar ' + field)
}
assert.match(officialQuote, /function clearLocation\(field: LocationField\) \{[\s\S]*?setLocationId\(field, ''\)[\s\S]*?locationSearch\[field\] = ''/, 'Limpiar borra identificador y texto')
assert.ok(officialQuote.includes('.official-location-toggle--clear::before'), 'Estilo de X visible en lugar de la flecha')
assert.ok(!officialQuote.includes('class="official-location-clear"'), 'No debe existir X separada de la flecha')
// Incoterm, FCL and FTL use the same solid, anchored popup as other fields.
assert.match(officialQuote, /<FieldDropdown id="quote-incoterm" v-model="form\.incoterm"/, 'Incoterm uses shared dropdown')
assert.match(officialQuote, /\.\.\.incoterms\.map\(value => \(\{value, label:value\}\)\)/, 'Incoterm retains all eleven official codes')
assert.match(officialQuote, /<FieldDropdown :id="'quote-equipment-size-' \+ i" v-model="line\.size"/, 'FCL container size and FTL truck size use the shared menu')
assert.match(officialQuote, /<FieldDropdown :id="'quote-equipment-type-' \+ i" v-model="line\.type"/, 'FCL and FTL equipment type use the shared menu')
const sharedEquipmentOptions = source('src/lib/officialQuoteOptions.ts')
assert.match(officialQuote, /officialEquipmentSizeOptions\(shipmentType\.value \|\| '', q\)/, 'The wizard uses the canonical equipment-size choices')
assert.match(officialQuote, /officialEquipmentTypeOptions\(shipmentType\.value \|\| '', q\)/, 'The wizard uses the canonical equipment-type choices')
assert.match(sharedEquipmentOptions, /\['20','40','45','48'\]\.map/, 'FCL retains all four sizes')
for (const item of ['24 pies / 5 TON', '26 pies / 7 TON', '53 pies', 'Dry Van', 'High Cube', 'Open Top', 'Open Side', 'Tank', 'Flat Rack', 'NOR', 'Furgón']) {
  assert.ok(sharedEquipmentOptions.includes(item), 'Retain equipment option: ' + item)
}
assert.match(officialQuote, /\{value:'', label:q\('Seleccionar Incoterm', 'Select Incoterm'\)\}/, 'Incoterm placeholder remains translated')
assert.match(officialQuote, /\{value:'', label:q\('Seleccionar','Select'\)\}/, 'Equipment placeholder remains translated')
assert.doesNotMatch(officialQuote, /class="official-incoterm-trigger"|class="official-incoterm-options|incotermMenuOpen|equipmentDropdown/, 'Remove old competing dropdown implementations')
assert.match(officialQuote, /const openLocation = ref<LocationField \| null>\(null\)/, 'Independent searchable location selectors remain available')
assert.doesNotMatch(officialQuote, /<select v-model="line\.(size|type)">/, 'No native equipment selectors')
const officialQuoteAdmin = source('src/pages/OfficialQuoteAdmin.vue')
assert.match(manager, /class="manager-tab-label">Cotizaciones<\/span> <span>\{\{ quotesTotal \}\}<\/span>/, 'Cotizaciones debe mostrar un contador a la derecha')
assert.match(manager, /loadQuotesTotal\(\)/, 'El contador de Cotizaciones se carga desde la API')
assert.match(manager, /@total-change="quotesTotal = \$event"/, 'El contador debe actualizarse al cargar el módulo de Cotizaciones')
assert.match(officialQuoteAdmin, /emit\('total-change',r\.total\)/, 'Las cotizaciones deben emitir el total real al panel')
assert.doesNotMatch(officialQuoteAdmin, /La autorización es interna\. La conexión y el envío a Dhole todavía no están disponibles\./, 'No mostrar el aviso introductorio de Dhole')
assert.match(officialQuoteAdmin, /Autorizar no envía la solicitud a Dhole\./, 'Conservar la advertencia contextual al autorizar')
assert.doesNotMatch(manager, /manager-tabs\.manager-subtabs--with-quotes > button\.manager-editor-visual-tab\s*\{[^}]*flex-wrap:wrap;/, 'Editor visual no debe envolver el contador hacia otra fila')
assert.match(manager, /api\/admin\/content\/news/, 'Conservar API de administración de noticias')
assert.match(manager, /api\/admin\/content\/media\/upload/, 'Conservar carga MinIO')
const news = source('src/pages/News.vue')
assert.match(news, /api\/content\/news/, 'Noticias públicas deben provenir de PostgreSQL')
assert.match(news, /subscribeToChanges\('news'/, 'Noticias deben reaccionar a SignalR')
assert.match(news, /news\.length/, 'Debe contemplar carrusel vacío')

assert.match(news, /const q = \(es: string, en: string\) => locale\.value === 'en' \? en : es/, 'La sección de noticias debe reaccionar al idioma')
for (const translation of [
  "q('CASTRO FALLAS · ACTUALIDAD', 'CASTRO FALLAS · LATEST UPDATES')",
  "q('Noticias', 'News')",
  "q('Cargando publicaciones…', 'Loading news…')",
  "q('No pudimos cargar las noticias en este momento. Inténtalo de nuevo más tarde.', 'We could not load the news right now. Please try again later.')",
  "q('Aún no hay noticias publicadas. Pronto compartiremos novedades.', 'No news has been published yet. We will share updates soon.')"
]) assert.ok(news.includes(translation), 'Todos los estados de noticias deben traducirse: ' + translation)


assert.match(news, /const articleSlug = \(article: \{ id: string; title: string; publishedAt\?: string \| null \}\) =>/, 'Cada noticia tiene un slug con fecha y título legibles')
assert.ok(news.includes("article.publishedAt?.slice(0,10)"), 'La URL empieza por fecha de publicación')
assert.match(news, /news-article-page__date/, 'La noticia muestra la fecha arriba a la derecha')
assert.match(news, /news-article-page__author/, 'La noticia muestra su autor al finalizar el texto')
assert.match(manager, /v-model.trim="newsForm.author"/, 'El editor permite añadir autor')
assert.match(manager, /v-model="newsForm.publishedAt"/, 'El editor permite añadir fecha de publicación')
assert.match(news, /const articleHref = \(id: string\) => \{[\s\S]*?return article \? articlePath\(article\) : '\/noticias'/, 'Las noticias enlazan a su ruta legible')
assert.match(news, /new URLSearchParams\(window\.location\.search\)\.get\('article'\)/, 'Los enlaces antiguos con article=ID siguen siendo compatibles')
assert.match(news, /const title = `Grupo Castro Fallas \| \$\{article\.title\}`/, 'El título SEO de cada noticia empieza con la marca')
assert.match(news, /<a class="news-editorial-hero__read" :href="articleHref\(leadStory\.id\)"/, 'La noticia destacada abre una página completa')
assert.match(news, /<a :href="articleHref\(article\.id\)"/, 'Las tarjetas de noticias también abren artículos completos')
assert.doesNotMatch(news, /news-editorial-hero__description|\{\{ article\.description \}\}/, 'La portada y las tarjetas no muestran resúmenes')
assert.match(news, /<main v-else id="noticia-completa" class="news-article-page"[^>]*>/, 'Artículo ocupa una sección completa del sitio')
assert.match(authRoot, /const seoPath = path\.startsWith\('\/noticias\/'\) \? '\/noticias' : path/, 'Las rutas de artículos reciben el SEO base de Noticias')
assert.match(authRoot, /if\(path==='\/noticias' \|\| path\.startsWith\('\/noticias\/'\)\) return 'news'/, 'Las rutas legibles se resuelven en la página existente de Noticias')
assert.ok(news.includes('<div class="news-article-page__formatted" v-html="activeArticleHtml"></div>'), 'El artículo muestra su contenido enriquecido')
assert.match(news, /const html = activeArticle\.value\?\.body \?\? ''[\s\S]*?sanitizeNewsHtml\(html\)/, 'El cuerpo enriquecido se sanitiza y conserva noticias antiguas')
assert.match(news, /<SiteHeader v-if="isArticlePage" active="noticias" overlay\s*\/>/, 'La ruta legible y la anterior mantienen el encabezado superpuesto sobre la imagen')
assert.doesNotMatch(news, /news-article-modal|aria-modal="true"/, 'Noticias no abre un modal')
assert.match(news, /href="\/noticias"/, 'El usuario puede volver a la lista de noticias')
const home = source('src/Home.vue')
assert.match(home, /encodeURIComponent\(item\.id\)/, 'Home debe enlazar la noticia específica')
// Regression: every FAQ card can close from its answer/blank area; question
// buttons keep native keyboard behavior without double-triggering the card.
const servicesPage = source('src/pages/Services.vue')
assert.match(home, /class="faq-item"[\s\S]*?@click="expandedFaq = expandedFaq === index \? null : index"/,
  'FAQ del inicio abre y cierra al pulsar cualquier parte de la tarjeta')
assert.match(home, /@click\.stop="expandedFaq = expandedFaq === index \? null : index"/,
  'El botón de inicio no cambia de estado dos veces por el evento del contenedor')
assert.match(home, /document\.addEventListener\('pointerdown', closeFaqOnOutsidePointer\)/,
  'Las FAQ del inicio siguen cerrándose al pulsar fuera')
assert.match(servicesPage, /<details v-for="faq in serviceFaqs"[\s\S]*?@click="toggleServiceFaqCard"/,
  'Las FAQ de la página de servicios cierran también al pulsar el contenido')
assert.match(servicesPage, /event\.target\.closest\('summary'\)/,
  'El resumen HTML nativo conserva un único cambio de estado')
assert.match(servicesPage, /document\.addEventListener\('pointerdown', closeOtherServiceFaqs\)/,
  'Los acordeones de servicios cierran al pulsar fuera o en otra tarjeta')
assert.match(servicesPage, /document\.removeEventListener\('pointerdown', closeOtherServiceFaqs\)/,
  'Los eventos globales de servicios se liberan al desmontar la página')
// Keep the step 02 copy its full width, with a modest vertical offset so
// the numeral is above the content and the image stays aligned with the video.
const serviceLanding = source('src/pages/ServiceLanding.vue')
const serviceStepsCss = source('src/styles/service-landing-experience.css')
assert.match(serviceLanding, /class="service-landing-faq__item"[\s\S]*?@click="openServiceFaq = openServiceFaq === index \? null : index"/,
  'Cada tarjeta FAQ individual se puede cerrar pulsando sobre su respuesta')
assert.match(serviceLanding, /@click\.stop="openServiceFaq = openServiceFaq === index \? null : index"/,
  'El botón FAQ de servicios no duplica el evento del contenedor')
assert.match(serviceLanding, /document\.addEventListener\('pointerdown', closeServiceFaqOutside\)/,
  'Las FAQ individuales cierran al pulsar fuera de su tarjeta')
assert.match(serviceLanding, /document\.removeEventListener\('pointerdown', closeServiceFaqOutside\)/,
  'No quedan eventos FAQ al salir de una página individual')
assert.match(serviceLanding, /:aria-expanded="openServiceFaq === index"/,
  'Los botones FAQ conservan su estado accesible para lectores de pantalla')
assert.match(serviceLanding, /class="service-landing-step service-landing-step--details" data-step="02"/,
  'La etapa 02 sigue siendo compartida por todos los servicios')
assert.match(serviceStepsCss, /\.service-landing-story \.service-landing-step--details \.service-landing-section-heading--text-only\s*\{\s*width:100%;\s*max-width:100%;/,
  'El texto del paso 02 conserva el ancho original completo')
assert.doesNotMatch(serviceStepsCss, /width:calc\(100% - clamp\(/,
  'El texto del paso 02 no debe quedar angosto por el número decorativo')
for (const padding of [
  'padding-top:clamp(100px,7.5vw,125px);',
  'padding-top:clamp(95px,13vw,120px);',
  'padding-top:clamp(85px,18vw,110px);'
]) {
  assert.ok(serviceStepsCss.includes(padding), 'Separación superior responsive para el número 02: ' + padding)
}
// Only the four long-form guide services need a more compact vertical
// arrangement; transport pages keep their already approved stage spacing.
const longGuideSlugs = Object.keys(JSON.parse(source('seo/service-landings.json')))
assert.deepEqual(longGuideSlugs.sort(), [
  '/servicios/agenciamiento-aduanal',
  '/servicios/almacenamiento-fiscal',
  '/servicios/bodegaje-general',
  '/servicios/consolidadora-de-carga'
], 'Solo los cuatro servicios de texto extendido reciben el ajuste')
assert.match(serviceLanding, /service-landing-page--long-guide': Boolean\(guides\[route\]\)/,
  'La clase de texto extendido se activa únicamente en las cuatro guías')
assert.match(serviceLanding, /service-landing-page--balanced-guide': Boolean\(guides\[route\]\) && route !== '\/servicios\/almacenamiento-fiscal'/,
  'Solo Bodegaje, Agenciamiento y Consolidadora reciben el ajuste; Fiscal permanece igual')
assert.match(serviceStepsCss, /\.service-landing-page--balanced-guide \.service-landing-story \.service-landing-step--details \.service-landing-detail-grid\s*\{\s*padding-top:clamp\(72px,calc\(5\.2vw \+ 14px\),92px\);\s*gap:clamp\(18px,1\.9vw,26px\);/,
  'Los tres servicios recuperan ligeramente la posición vertical anterior')
assert.match(serviceStepsCss, /\.service-landing-page--balanced-guide \.service-landing-story \.service-landing-step--details \.service-landing-detail-visual\s*\{\s*height:clamp\(210px,30svh,310px\);\s*max-height:100%;/,
  'Las fotografías de los tres servicios recuperan su tamaño, con altura adaptable')
assert.match(serviceStepsCss, /@media\(min-width:901px\)\s*\{\s*\.service-landing-page--long-guide \.service-landing-story \.service-landing-step--details \.service-landing-detail-grid\s*\{\s*padding-top:clamp\(42px,4vw,60px\);\s*gap:clamp\(14px,1\.5vw,22px\);/,
  'Las cuatro guías adelantan texto y foto sin afectar a transportes')
assert.match(serviceStepsCss, /\.service-landing-page--long-guide \.service-landing-story \.service-landing-step--details \.service-landing-section-heading>p:not\(\.section-tag\)\s*\{\s*font-size:clamp\(16px,1\.2vw,18px\);\s*line-height:1\.55;/,
  'Los párrafos largos conservan todo el contenido y utilizan un ritmo vertical compacto')
assert.match(serviceStepsCss, /\.service-landing-page--long-guide \.service-landing-story \.service-landing-step--details \.service-landing-detail-visual\s*\{\s*height:clamp\(210px,30svh,310px\);\s*max-height:100%;\s*min-height:0;/,
  'Las fotos de las cuatro guías recuperan su tamaño máximo anterior')
assert.match(serviceStepsCss, /grid-template-rows:max-content minmax\(0,1fr\);\s*max-height:calc\(min\(100svh - 48px,820px\) - clamp\(30px,4vw,58px\) - 14px\)/,
  'La imagen se adapta al espacio que queda debajo del texto y dentro del video')
// The light hero's transition is shorter/lower on desktop, while the dark
// transition and the rest of the service stages keep their original layout.
assert.match(serviceStepsCss, /html:not\(\.theme-dark\) \.service-landing-story\s*\{\s*--service-story-blend:clamp\(115px,15svh,170px\);/,
  'El difuminado de portada claro inicia más abajo en escritorio')
assert.match(serviceStepsCss, /html:not\(\.theme-dark\) \.service-landing-hero::after\s*\{\s*height:clamp\(130px,16svh,190px\);/,
  'La transición difuminada de portada ocupa menos altura')
// Long-form guides lower the visible fade without moving the following frame;
// the transport pages retain the shared baseline transition.
assert.match(serviceStepsCss, /html:not\(\.theme-dark\) \.service-landing-page--long-guide \.service-landing-hero::after\s*\{\s*height:clamp\(105px,13svh,155px\);/,
  'Las cuatro guías bajan el inicio visual del difuminado de portada')
assert.match(serviceStepsCss, /html:not\(\.theme-dark\) \.service-landing-page--long-guide \.service-landing-story::before\s*\{\s*backdrop-filter:blur\(10px\);/,
  'Las cuatro guías hacen coherente el difuminado entre ambas capas')
assert.match(serviceStepsCss, /html:not\(\.theme-dark\) \.service-landing-hero::after\s*\{\s*height:clamp\(130px,16svh,190px\);/,
  'El difuminado ya aprobado en transportes se conserva')
// Regression: top navigation underlines are hover/focus-only in both themes,
// while the existing active item stays a red pill.
const hoverOnlyNavCss = source('src/style.css')
assert.match(hoverOnlyNavCss, /\/\* Navigation hover-only underlines\./,
  'La navegación tiene una regla explícita de línea solo al interactuar')
assert.match(hoverOnlyNavCss, /\.site-header \.main-nav > a:not\(\.is-active\):not\(\.nav-login\)[\s\S]*?border-bottom: 2px solid transparent !important;/,
  'Los enlaces inactivos no muestran línea en reposo')
assert.match(hoverOnlyNavCss, /\.nav-dropdown:not\(\.nav-dropdown--active\) > \.nav-dropdown__trigger:is\(:hover, :focus-visible\)[\s\S]*?border-bottom-color: rgba\(255, 255, 255, \.82\) !important;/,
  'El subrayado sigue disponible con mouse y teclado')
// Step 02: the adaptive measurement must actually affect long-form image
// layout, rather than becoming an unused custom property in JavaScript.
assert.match(serviceStepsCss, /max-height: var\(--service-guide-photo-limit, 310px\);/,
  'La foto de guías extensas respeta el límite calculado')
assert.match(serviceLanding, /if \(availableHeight >= 100\)/,
  'La fotografía no desaparece por mediciones transitorias inválidas')

const itinerary = source('src/pages/Itinerary.vue')
assert.match(itinerary, /closing/, 'Conservar Closing, ETD y ETA')
// Regression contract for the result-card-only redesign: all itinerary fields,
// statuses and navigation remain available in ES/EN without touching API logic.
const itineraryResults = itinerary.slice(
  itinerary.indexOf('<article v-for="(item, index) in (!cargando && !errorBusqueda ? resultados : [])"'),
  itinerary.indexOf('<nav v-if="!cargando && !errorBusqueda && totalPages > 1"')
)
assert.match(itineraryResults, /class="itinerary-summary-card"/, 'Los resultados usan la nueva tarjeta de resumen')
for (const field of ['item.pol', 'item.pod', 'item.closing', 'item.etd', 'item.eta',
  'item.carrier', 'item.vessel', 'item.voyage', 'item.modality']) {
  assert.ok(itineraryResults.includes(field), 'La tarjeta conserva el campo ' + field)
}
assert.match(itineraryResults, /statusLabel\(item\.status\)/, 'La tarjeta conserva el estado de la API')
assert.match(itineraryResults, /en \? 'Carrier' : 'Transportista'/, 'Los detalles mantienen ES/EN')
assert.match(itineraryResults, /itinerary-summary-card__route/, 'Origen y destino mantienen jerarquía visual')
assert.match(itineraryResults, /itinerary-summary-card__information/, 'Fechas y detalles están separados del trayecto')
assert.match(itinerary, /:global\(html\.theme-dark \.app-site\.itinerary-page \.itinerary-summary-card\)\s*\{[^}]*background:#060f21 !important;/, 'El modo oscuro utiliza su propia superficie azul marino')
assert.match(itinerary, /@media\(max-width:550px\)/, 'La tarjeta se adapta a móviles')
assert.match(itinerary, /itinerary-pagination/, 'La paginación permanece intacta')
assert.doesNotMatch(itineraryResults, /class="itinerary-result-card"/, 'No debe permanecer la cuadrícula antigua')
assert.match(itinerary, /\.itinerary-search-results\s*\{[^}]*max-width:1180px/, 'Los resultados no deben expandirse indefinidamente en monitores grandes')
assert.match(itineraryResults, /class="itinerary-summary-card__route-arrow"><IconSymbol glyph="→" :size="18" \/>/, 'La flecha debe ser un SVG centrado, no un carácter tipográfico')
assert.match(itinerary, /\.itinerary-summary-card__route-line > \.itinerary-summary-card__route-arrow\s*\{[^}]*align-items:center;justify-content:center/, 'El círculo centra el icono real en ambos ejes')
const fieldDropdown = source('src/components/FieldDropdown.vue')
assert.match(fieldDropdown, /<Teleport to="body">/, 'Menus sobre las tarjetas sin ser recortados')
assert.match(fieldDropdown, /class="cf-dropdown__menu" role="listbox"/, 'Conservar semántica listbox del componente compartido')
assert.match(fieldDropdown, /background:#fff; color:#242630;/, 'Lista en modo claro es opaca')
assert.match(fieldDropdown, /background:#19191c; color:#fff;/, 'Lista oscura es opaca y legible')
assert.match(fieldDropdown, /html\.theme-dark \.app-site\.official-page \.cf-dropdown__trigger\s*\{\s*background:rgba\(255,255,255,\.035\);\s*border-color:rgba\(255,255,255,\.22\);\s*color:#fff;/, 'Incoterm, FCL y FTL no tienen fondo azul: igualan los campos glass en modo oscuro')
assert.match(fieldDropdown, /\.content-manager \.cf-dropdown__trigger\s*\{\s*background:var\(--admin-input,#f7f9fd\);\s*color:var\(--admin-text,#101b32\);\s*border-color:var\(--admin-border,#cfd3dd\);/, 'Selectores de Administración usan las mismas variables de los campos de texto')
assert.match(fieldDropdown, /\.content-manager\.is-embedded \.manager-form \.cf-dropdown__trigger,[\s\S]*?\.content-manager\.is-embedded \.manager-users-table \.cf-dropdown__trigger\s*\{\s*background-color:var\(--admin-input\) !important;/, 'Campos del administrador y gestión de usuarios comparten superficie gris claro')
assert.doesNotMatch(fieldDropdown, /var\(--manager-input|var\(--manager-ink|var\(--manager-input-line/, 'No utilizar variables inexistentes que vuelven blanco el dropdown')
assert.match(fieldDropdown, /html\.theme-dark \.content-manager \.cf-dropdown__trigger\s*\{\s*background:#121a30;\s*border-color:#3b465f;\s*color:#fff;/, 'El estilo de selectores de Administración en modo oscuro se conserva')
assert.match(fieldDropdown, /html\.theme-dark \.content-manager\.is-embedded \.manager-form \.cf-dropdown__trigger,[\s\S]*?html\.theme-dark \.content-manager\.is-embedded \.manager-users-table \.cf-dropdown__trigger\s*\{\s*background-color:#121a30 !important;\s*border-color:#3b465f !important;\s*color:#fff !important;/, 'Administración integrada conserva el contraste oscuro de los otros campos')
assert.match(fieldDropdown, /html\.theme-dark \.app-site\.official-page \.cf-dropdown__trigger:focus-visible\s*\{\s*border-color:#a80e18;/, 'Cotizaciones conserva el resaltado rojo al enfocar los selectores')
assert.match(fieldDropdown, /html\.theme-dark \.cf-dropdown__trigger\s*\{\s*border-color:#4f5365; background:#121a30; color:#fff;/, 'Mantener estilos ajenos a Cotizaciones intactos')
assert.match(fieldDropdown, /font-size:14px;/, 'Texto normal de los desplegables igual a las fechas')
assert.match(fieldDropdown, /if \(!placement\) placement = below < Math\.min\(300, naturalHeight\) && above > below \? 'above' : 'below'/, 'El menú conserva orientación estable con altura real')
assert.match(fieldDropdown, /const renderedHeight = list\.getBoundingClientRect\(\)\.height/, 'El menú mide la altura realmente visible antes de ubicarse')
assert.match(fieldDropdown, /const desiredTop = placement === 'above' \? rect\.top - renderedHeight - gap : rect\.bottom \+ gap/, 'El menú abre pegado al campo')
assert.match(fieldDropdown, /window\.requestAnimationFrame\(trackMenu\)/, 'El menú sigue al campo durante desplazamientos')
assert.match(fieldDropdown, /window\.cancelAnimationFrame\(trackingFrame\)/, 'No deja recursos de seguimiento abiertos')
assert.match(fieldDropdown, /if \(outsideViewport \|\| clipped\) \{ closeMenu\(\); return \}/, 'Cierra opciones que quedan fuera de la zona visible')
assert.doesNotMatch(fieldDropdown, /rect\.top - maxHeight/, 'No colocar el menú utilizando un máximo de altura diferente a su altura real')
assert.match(fieldDropdown, /isOpen\.value = true[\s\S]*?void nextTick\(\(\) => \{[\s\S]*?positionMenu\(\)/, 'Medir el menú tras montarlo en el DOM')
assert.match(fieldDropdown, /visibility: isPositioned \? 'visible' : 'hidden'/, 'Evitar salto visual antes de medir la lista')
assert.match(fieldDropdown, /disabled\?: boolean/, 'El dropdown compartido conserva estado deshabilitado del administrador')
assert.match(fieldDropdown, /:disabled="disabled"/, 'El boton respeta la deshabilitacion')
assert.match(fieldDropdown, /\.app-site\.itinerary-page \.itinerary-form-line > strong\s*\{\s*color:#242630;\s*font-size:13px;\s*font-weight:750;/, 'Itinerarios usa color y fuente de las etiquetas de Cotizaciones')
assert.match(fieldDropdown, /\.app-site\.itinerary-page \.itinerary-form-line input,[\s\S]*?background:#fff;\s*color:#242630;\s*font-size:14px;/, 'Campos de Itinerarios comparten color y tamaño de letra con Cotizaciones')
assert.match(fieldDropdown, /html\.theme-dark \.app-site\.itinerary-page \.itinerary-form-line input,[\s\S]*?background:#121a30;\s*color:#fff;/, 'Campos de Itinerarios mantienen contraste en modo oscuro')
assert.doesNotMatch(manager, /<select\b/, 'Administración de contenido y usuarios no utiliza selectores nativos')
assert.match(manager, /user\.activo = value === 'true'/, 'Activo se convierte a booleano sin alterar el backend')
assert.match(manager, /newsForm\.published = value === 'true'/, 'Publicación de noticias conserva booleanos')
assert.match(manager, /commentForm\.published = value === 'true'/, 'Publicación de comentarios conserva booleanos')
assert.match(manager, /selectAdminTransport/, 'Transporte conserva lógica de reajuste de modalidad')
const itineraryAdminForm = manager.match(/<form v-if="section === 'itineraries'"[\s\S]*?<\/form>/)?.[0] ?? ''
assert.ok(itineraryAdminForm, 'Falta el formulario de Itinerarios en Administración')
assert.ok(
  itineraryAdminForm.indexOf('itineraryForm.transport') < itineraryAdminForm.indexOf('itineraryForm.origin') &&
  itineraryAdminForm.indexOf('itineraryForm.origin') < itineraryAdminForm.indexOf('itineraryForm.destination') &&
  itineraryAdminForm.indexOf('itineraryForm.destination') < itineraryAdminForm.indexOf('itineraryForm.status'),
  'Orden restaurado de Itinerarios: Transporte, Origen, Destino, Estado'
)
for (const field of ['origin','destination','transport','status','departure','arrival','closing','modality','carrier','vessel','voyage']) {
  assert.match(itineraryAdminForm, new RegExp('itineraryForm\\.' + field + '\\b'), 'No perder campo de Itinerarios: ' + field)
}
assert.match(itineraryAdminForm, /:required="isLiveAdmin"/, 'Fechas siguen siendo obligatorias para el admin real')
assert.doesNotMatch(itineraryAdminForm, /<template v-if="isLiveAdmin">/, 'Vista de prueba presenta todos los campos de itinerario')
assert.doesNotMatch(officialQuoteAdmin, /<select\b/, 'La revisión administrativa de Cotizaciones usa el menú nuevo')
assert.match(officialQuoteAdmin, /v-model="state"/, 'La revisión sigue enviando los estados oficiales')
const adminUsers = source('src/pages/AdminUsers.vue')
assert.doesNotMatch(adminUsers, /<select\b/, 'El directorio administrativo independiente usa menú nuevo')
assert.match(adminUsers, /user\.activo = value === 'true'/, 'El directorio independiente mantiene bool para activar/desactivar')
assert.doesNotMatch(visualEditor, /<select\b/, 'El editor visual usa el selector nuevo')
assert.match(visualEditor, /v-model="mediaId"/, 'El editor visual conserva la selección de archivos MinIO')
assert.match(itinerary, /:model-value="item.status" :options="statusChoices"/, 'Estatus usa menú desplegable compartido')
assert.match(itinerary, /v-model="item.modality" :options="modalityChoices\(item\)"/, 'Modalidad usa menú desplegable compartido')
assert.doesNotMatch(itinerary, /<select/, 'Itinerarios no usa selectores nativos')
assert.match(officialQuote, /v-model="form.exwCargoStatus"/, 'Conservar tipo de carga EXW')
assert.match(officialQuote, /v-model="form.dimensionUnit"/, 'Conservar unidad de dimensiones')
assert.match(officialQuote, /v-model="form.weightUnit"/, 'Conservar unidad de peso')
assert.match(officialQuote, /:model-value="line.stackability"/, 'Conservar estibabilidad')
assert.doesNotMatch(officialQuote, /<select\b/, 'Los formularios públicos de cotizaciones no usan selectores nativos')
assert.match(officialQuote, /\.main-nav \.nav-dropdown--active \.nav-dropdown__trigger\s*\{\s*background:#ad0922 !important;\s*color:#fff !important;/, 'Menú Carga internacional coincide con Itinerarios en tema claro')
assert.match(fieldDropdown, /\.cf-dropdown__trigger[\s\S]*?font-size:14px;/, 'Incoterm and equipment fields share the 14px desktop typography')
assert.match(fieldDropdown, /\.cf-dropdown__menu[\s\S]*?background:#fff; color:#242630;/, 'Shared menu stays opaque in light mode')
assert.match(fieldDropdown, /html\.theme-dark \.cf-dropdown__menu\s*\{\s*background:#19191c; color:#fff;/, 'Shared menu stays opaque in dark mode')
const globe = source('src/components/WorldGlobe.vue')
assert.match(globe, /renderMarker\(/, 'Conservar los pines personalizados del ZIP')
assert.match(globe, /followSelectedPin\(/, 'El popup debe seguir la posición del marcador')
assert.match(globe, /world-globe__location-card--costa-rica/, 'Agrupar oficinas Costa Rica')
assert.match(globe, /animateZoom\(/, 'Conservar zoom animado')
assert.match(globe, /initialZoom\?: number/, 'El globo acepta una escala inicial por sección')
assert.match(globe, /zoom: props\.initialZoom \?\? 1,/, 'La escala inicial conserva el comportamiento de Home sin cambiarlo')
assert.match(globe, /animateZoom\(props\.initialZoom \?\? 1\)/, 'Volver a la escala elegida al retirar un embarque')
assert.match(home, /<WorldGlobe\s*\/>/, 'La página principal mantiene su globo original')

assert.match(globe, /<Teleport to="body" :disabled="!mobileLocationPopup">/, 'La ficha móvil puede salir del contenedor sin modificar el comportamiento de escritorio')
assert.match(globe, /const markerX = selectedCostaRica\.value \? rect\.left \+ rect\.width \/ 2 : rect\.left \+ point\.x/, 'Ubicar la ficha junto a la ubicación del marcador y el globo')
assert.match(globe, /const markerY = selectedCostaRica\.value \? rect\.top \+ 18 : rect\.top \+ point\.y/, 'Ubicar la ficha según la altura del marcador')
assert.match(globe, /mobilePopupPosition\.value = \{ left, top, below, visible: true \}/, 'Evitar superposición de secciones y conservar la posición del marcador')
assert.match(globe, /position:fixed;[\s\S]*?z-index:2147483001;[\s\S]*?width:min\(270px,calc\(100vw - 24px\)\)/, 'Mantener la tarjeta compacta al frente en móvil')
assert.match(globe, /const below = spaceAbove < height && spaceBelow > spaceAbove/, 'Abrir la ficha arriba o abajo según el espacio visible')
assert.match(globe, /max-height:min\(290px,calc\(100dvh - 24px\)\)/, 'La ficha no sobrepasa la pantalla móvil')
assert.match(globe, /role="region"/, 'La ficha mantiene su carácter de información contextual')
assert.doesNotMatch(globe, /world-globe__location-backdrop|mobileLocationDialog|aria-modal=/, 'No reinstalar el modal centrado ni su fondo oscurecido')
assert.match(globe, /locationMedia\?\.removeEventListener\('change', syncLocationLayout\)/, 'El listener responsive se limpia al destruir el globo')
const admin = source('src/pages/ContentManager.vue')
assert.match(admin, /--manager-bg:#fff;/, 'Conservar el fondo claro del administrador')
assert.match(admin, /--manager-accent:#ef233c;/, 'Usar rojo de marca en los acentos del administrador')
assert.match(visualEditor, /visual-editor__breadcrumb\{color:#a80e18!important/, 'La ruta del editor visual debe usar rojo de marca')
assert.match(admin, /--manager-card:#211b20/, 'Conservar paleta ciruela oscura de frontend')
assert.match(admin, /manager-editor--itineraries/, 'Conservar composición de 4 columnas')
assert.match(admin, /SiteVisualEditor/, 'El estilo no puede borrar el editor visual')
// Login: neutral email wording, no testing banner, and actionable validation before OTP.
const login = source('src/pages/Login.vue')
const esLogin = JSON.parse(source('src/locales/es.json')).custom.login
const enLogin = JSON.parse(source('src/locales/en.json')).custom.login
const authService = source('../backend/Services/Auth/AuthService.cs')
const backendProgram = source('../backend/Program.cs')
assert.match(login, /body\?\.code === 'account_unavailable'/, 'Login debe identificar correo no habilitado')
assert.match(login, /custom\.login\.accountUnavailable/, 'El aviso usa el idioma actual')
assert.doesNotMatch(login, /custom\.login\.footer/, 'No mostrar texto de acceso de prueba')
assert.match(login, /if \(!response\.ok\) \{\s*const issue = await parseError\(response\)[\s\S]*?throw new Error\(issue\.message\)/, 'Error de correo debe detener el paso OTP')
assert.match(login, /step\.value = 'otp'/, 'Conservar flujo OTP cuando el correo está habilitado')
assert.equal(esLogin.intro, 'Ingresa tu dirección de correo electrónico para recibir un código de un solo uso.')
assert.equal(enLogin.intro, 'Enter your email address to receive a one-time code.')
assert.ok(esLogin.accountUnavailable && enLogin.accountUnavailable, 'Aviso traducido en ambos idiomas')
assert.equal(esLogin.footer, undefined, 'Quitar aviso de pruebas en español')
assert.equal(enLogin.footer, undefined, 'Quitar aviso de pruebas en inglés')
assert.doesNotMatch(esLogin.emailPlaceholder, /gmail\.com/i, 'No restringir dominio de correo a Gmail')
assert.match(authService, /if \(user is null\)\s*return \(null, false, true, 0\);/, 'No generar OTP ficticio para cuenta desconocida')
assert.match(backendProgram, /code = "account_unavailable"/, 'API debe distinguir la cuenta no habilitada')
assert.match(backendProgram, /StatusCodes\.Status404NotFound/, 'Devolver 404 antes del formulario OTP')

const tracking = source('src/pages/Tracking.vue')
const dholeTracking = source('../backend/Endpoints/DholeTrackingEndpoints.cs')
assert.match(dholeTracking, /RequireAuthorization\("registered"\)/, 'Dynamics exige una cuenta cliente o administradora autenticada')
assert.match(dholeTracking, /RequireRateLimiting\("tracking"\)/, 'Dynamics limita las consultas por referencia')
assert.doesNotMatch(dholeTracking, /MapPost\("\/api\/tracking\/search"/, 'No reintroducir consultas anónimas alternativas')
assert.match(authRoot, /trackingAccess\.value = localTrackingVisualPreview \|\| !!user && \(role === 'cliente' \|\| role === 'administrador'\)/, 'La página de rastreo exige sesión real salvo preview local explícita')
assert.match(authRoot, /const localTrackingVisualPreview = import\.meta\.env\.DEV/, 'La preview de tracking solo existe en desarrollo')
assert.match(authRoot, /\['localhost', '127\.0\.0\.1'\]\.includes\(window\.location\.hostname\)/, 'La preview de tracking solo está disponible en localhost')
assert.match(tracking, /const localVisualPreview = import\.meta\.env\.DEV/, 'Los datos ficticios no se habilitan en producción')
assert.match(tracking, /<WorldGlobe :shipment="globeRoute" :initial-zoom="0\.8"\s*\/>/,
  'Tracking conserva el zoom inicial y la ruta con una sola paleta permanente')
assert.doesNotMatch(tracking, /realisticGlobeColors|realistic-colors/,
  'El color natural del globo no depende de haber encontrado un embarque')
assert.match(tracking, /if \(data\.source !== 'dynamics' \|\| !Array\.isArray\(data\.records\)\) throw new Error/,
  'La validación de las respuestas autenticadas de Dynamics sigue vigente')
assert.match(tracking, /shipment\.value = null\s*matches\.value = \[\]/,
  'Al iniciar una nueva búsqueda se limpian las referencias anteriores sin cambiar la paleta')
assert.match(tracking, /\/api\/tracking\/dynamics\/search/, 'Se consultan datos de Dynamics desde el backend')
assert.match(tracking, /credentials: 'same-origin'/, 'La consulta utiliza la sesión autenticada')
assert.match(tracking, /Illustrative route only, not a live GPS position/, 'El globo advierte que no es un GPS')
assert.doesNotMatch(tracking, /\/api\/tracking\/demo\?/, 'La interfaz pública ya no consulta embarques ficticios')
assert.match(tracking, /<label for="tracking-reference-kind">/, 'Tipo de referencia debe tener una etiqueta separada del select')
assert.match(tracking, /import FieldDropdown from '\.\.\/components\/FieldDropdown\.vue'/, 'Buscar embarque reutiliza el mismo componente de selección que Administración')
assert.match(tracking, /id="tracking-reference-kind"[\s\S]*?v-model="kind"[\s\S]*?:aria-label="copy\.type"/, 'Tipo de referencia mantiene etiqueta y selección accesibles')
assert.match(tracking, /types\.map\(item => \(\{ value: item\.id, label: item\.name \}\)\)/, 'Las cinco referencias mantienen sus valores originales')
assert.doesNotMatch(tracking, /tracking-reference-select|tracking-reference-options|referenceMenuOpen/, 'No duplicar componentes de dropdown con estilos propios')
assert.match(tracking, /\.tracking-fields :deep\(\.cf-dropdown__trigger\)\{min-height:54px;padding:13px 15px;font-size:16px\}/, 'Tipo de referencia conserva tamaño táctil y estilo del componente hijo en móvil')
assert.match(fieldDropdown, /html\.theme-dark \.cf-dropdown__menu\s*\{\s*background:#19191c; color:#fff;/, 'Menú de referencia respeta el modo oscuro compartido')
assert.match(tracking, /<label for="tracking-reference-input">/, 'Referencia debe conservar una etiqueta explícita')
assert.doesNotMatch(tracking, /setTimeout\(openGuide/, 'La guía no debe abrirse automáticamente sobre el selector táctil')
assert.match(tracking, /@click="openGuide"/, 'Conservar la guía a solicitud del usuario')
assert.match(tracking, /\.tracking-fields\{grid-template-columns:minmax\(0,1fr\);gap:20px;/, 'Separar los campos en móvil')
assert.match(tracking, /\.tracking-fields :is\(input,select\)\{min-height:54px;padding:13px 15px;font-size:16px;/, 'Controles táctiles con fuente legible en móvil')
const homeStyles = source('src/style.css')

const serviceOverlayCss = homeStyles.split('.service-modal-backdrop{')[1]?.split('}')[0] ?? ''
const serviceCardCss = homeStyles.split('.service-modal__sections section{')[1]?.split('}')[0] ?? ''
const serviceGlowCss = homeStyles.split('.service-modal::before{')[1]?.split('}')[0] ?? ''
assert.ok(serviceOverlayCss.includes('backdrop-filter:none'), 'El fondo del modal no debe desenfocarse')
assert.ok(!serviceOverlayCss.includes('blur('), 'La página detrás del modal permanece nítida')
assert.ok(serviceCardCss.includes('backdrop-filter:none'), 'Las tarjetas no difuminan la fotografía')
assert.ok(serviceCardCss.includes('-webkit-backdrop-filter:none'), 'Safari conserva la fotografía nítida')
assert.ok(!serviceCardCss.includes('filter:blur('), 'Las tarjetas no tienen efecto de desenfoque')
assert.ok(serviceGlowCss.includes('content:none'), 'No mostrar el resplandor rojo global del modal')
assert.ok(!serviceGlowCss.includes('animation:'), 'No animar todo el modal')
assert.ok(!homeStyles.includes('.service-modal__sections section::before{'), 'Los recuadros no tienen capa de luz roja difuminada')
assert.ok(!homeStyles.includes('service-modal-card-glow'), 'Eliminar el barrido rojo interno')
assert.ok(homeStyles.includes('html.theme-dark .service-modal__sections section{background:rgba(33,27,32,.78)!important'), 'Mantener fondos neutros sin tonos azules')

const trackingDesktopGlobe = homeStyles.slice(homeStyles.indexOf('/* Tracking hero on larger screens: keep floating captions'), homeStyles.indexOf('/* Mobile globe: the two captions'))
assert.match(trackingDesktopGlobe, /@media \(min-width: 801px\)/, 'Separación de rótulos limitada a escritorio')
assert.match(trackingDesktopGlobe, /\.app-site\.tracking-site \.tracking-intro \.world-globe \.globe-floating-tag\.tag-global\s*\{\s*top: 5%;/, 'Conexiones globales no queda pegada a la esfera')
assert.match(trackingDesktopGlobe, /\.app-site\.tracking-site \.tracking-intro \.world-globe \.globe-floating-tag\.tag-cr\s*\{\s*bottom: 7%;\s*left: 1%;/, 'Hub regional se separa un poco del globo')
const globeMobileLayout = homeStyles.slice(homeStyles.indexOf('/* Mobile globe: the two captions sit in dedicated rows'))
assert.match(globeMobileLayout, /\.globe-floating-tag\.tag-global[\s\S]*?order:1;/, 'Conexiones globales queda en una fila encima del globo')
assert.match(globeMobileLayout, /\.globe-floating-tag\.tag-cr[\s\S]*?order:3;/, 'Hub regional queda debajo del globo')
assert.match(globeMobileLayout, /\.world-globe__canvas[\s\S]*?order:2;/, 'El globo ocupa su propia fila sin pisar las etiquetas')
const homeTrackingMobile = homeStyles.slice(homeStyles.indexOf('/* Mobile home copy: centered headings'))
assert.match(homeTrackingMobile, /\.app-site\.home-page \.tracking-home-grid \{ row-gap:clamp\(28px,6vw,42px\); \}/, 'La sección de rastreo debe separar botón y globo en móvil')
assert.match(homeTrackingMobile, /\.app-site\.home-page \.tracking-home-copy \{ text-align:center; margin-bottom:0; \}/, 'El botón no debe superponerse al globo por margen negativo')
assert.match(home, /href="\/tracking"/, 'Rastrear ahora mantiene su destino')
assert.doesNotMatch(main, /connectWebSocket\(\)/, 'No activar broker local 8081')
// Tracking summary: the route and journey are separate from the five paired detail rows.
// Keep meaningful coverage of the redesigned layout, including dark mode and mobile.
assert.match(tracking, /class="tracking-demo-result__route"/, 'Origen y destino se presentan como ruta')
assert.match(tracking, /class="tracking-demo-result__route-content"/,
  'El contenido de la ruta usa una banda interna centrada')
assert.match(tracking, /\.tracking-demo-result__route-content \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;/,
  'El contenido de la ruta utiliza todo el ancho disponible en escritorio')
assert.match(tracking, /\.tracking-demo-result__route-stop--destination \{\s*justify-self: end;/,
  'Destino se alinea con el borde derecho de la tarjeta')
assert.match(tracking, /\.tracking-demo-result__route \{[\s\S]*?padding: 22px clamp\(18px, 2vw, 28px\);/,
  'Origen y destino mantienen exactamente el mismo margen exterior')
assert.match(tracking, /@media \(max-width: 580px\) \{[\s\S]*?\.tracking-demo-result__route-content \{\s*grid-template-columns: minmax\(0, 1fr\);/,
  'La ruta vuelve a una sola columna en móvil')
assert.match(tracking, /\.tracking-demo-result__route-stop--destination \{\s*justify-self: start;/,
  'Destino se devuelve a la alineación izquierda en celular')
assert.match(tracking, /<strong>\{\{ shipment\.origin \|\| '—' \}\}<\/strong>/, 'Origen se conserva')
assert.match(tracking, /<strong>\{\{ shipment\.destination \|\| '—' \}\}<\/strong>/, 'Destino se conserva')
assert.match(tracking, /v-if="journeyStage !== null"/, 'El recorrido solo aparece con un estado reconocido')
assert.match(tracking, /journeySteps\[journeyStage\]\.label/, 'El recorrido indica su etapa actual')
assert.match(tracking, /stageForKnownStatus\(shipment\.value\?\.status\)/, 'La etapa depende del estado real')
assert.equal((tracking.match(/<div class="tracking-demo-result__pair">/g) ?? []).length, 5,
  'Cinco parejas de datos principales, con ruta y equipo por separado')
assert.match(tracking, /class="tracking-demo-result__grid">\s*<div class="tracking-demo-result__pair">/,
  'El resumen mantiene las parejas de datos')
assert.match(tracking, /<dt>\{\{ en \? 'Transport' : 'Transporte' \}\}/, 'Transporte se conserva')
assert.match(tracking, /<dt>\{\{ en \? 'Equipment quantity x size' : 'Cantidad x tamaño de equipo' \}\}/,
  'Equipo se muestra como cantidad por tamaño')
assert.match(tracking, /<strong class="tracking-demo-result__status">\{\{ displayStatus\(shipment\.status\) \}\}<\/strong>/, 'Estado se conserva en la cabecera')
assert.match(tracking, /\.app-site\.tracking-site \.tracking-demo-result__route \{/,
  'La ruta tiene estilos dedicados')
assert.match(tracking, /\.app-site\.tracking-site \.tracking-demo-result__pair \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  'Dos datos por fila en escritorio')
assert.match(tracking, /html\.theme-dark \.app-site\.tracking-site \.tracking-demo-result__route \{/,
  'Ruta compatible con modo oscuro')
assert.match(tracking, /html\.theme-dark \.app-site\.tracking-site \.tracking-journey \{/,
  'Recorrido compatible con modo oscuro')
assert.match(tracking, /@media \(max-width: 580px\) \{[\s\S]*?\.app-site\.tracking-site \.tracking-demo-result__route \{/,
  'Ruta adaptable a móvil')
assert.match(tracking, /\.app-site\.tracking-site \.tracking-demo-result__field \+ \.tracking-demo-result__field \{[\s\S]*?border-left: 1px solid/,
  'Separación visible entre campos')
assert.match(tracking, /shipmentExtrasPairs = computed<ShipmentExtraField\[\]\[\]>/,
  'Los datos adicionales siguen agrupados en pares')
assert.match(tracking, /v-for="\(pair, index\) in shipmentExtrasPairs"/,
  'Los datos adicionales siguen presentes')
assert.match(tracking, /shipment\.customerStatus/, 'La actualización del cliente se conserva')

// The globe must reflect only supplied route points, not fictional intermediate stops.
const trackingRouteSource = source('src/lib/trackingRoute.ts')
const trackingGlobeSource = source('src/components/WorldGlobe.vue')
assert.match(trackingRouteSource, /export function illustrativeJourney\(/,
  'La ruta ilustrativa admite una secuencia de escalas')
assert.match(trackingRouteSource, /\.\.\.\(record\.routeStops \?\? \[\]\)/,
  'Las escalas explícitas quedan entre puertos y destino')
assert.match(tracking, /illustrativeJourney\(shipment\.value\)/, 'Tracking envía el recorrido al globo')
assert.match(tracking, /Referencia geográfica a nivel país:/,
  'El usuario recibe una advertencia visible sobre las referencias nacionales')
assert.match(trackingGlobeSource, /referencia aproximada del país/,
  'Los marcadores muestran la precisión aproximada en el globo')
assert.match(trackingGlobeSource, /routePoints\.value\.slice\(1\)\.map\(/,
  'El globo dibuja todos los tramos consecutivos')
assert.match(trackingGlobeSource, /transportGlyph/, 'El globo presenta el ícono del transporte')

// Dynamics mode/status are controlled display values; all other content remains unchanged.
const trackingLocalizationSource = source('src/lib/trackingDisplay.ts')
const tsCompiler = require('typescript')
const { runInNewContext } = require('node:vm')

// Run the actual TypeScript calendar helpers with fixed instants around the UTC
// midnight / Costa Rica midnight boundary, including a year transition.
const compiledQuoteDates = tsCompiler.transpileModule(source('src/lib/costaRicaDate.ts'), {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 }
})
const quoteDates = {}
runInNewContext(compiledQuoteDates.outputText, { exports: quoteDates, Intl, Date }, { timeout: 1000 })
const crToday = quoteDates.costaRicaToday
const validCargoDate = quoteDates.isCargoReadyDateOnOrAfterToday
const validCalendarDate = quoteDates.isCalendarDate
assert.equal(crToday(new Date('2026-11-06T05:59:59Z')), '2026-11-05', 'Antes de las 06 UTC aún es el día anterior en Costa Rica')
assert.equal(crToday(new Date('2026-11-06T06:00:00Z')), '2026-11-06', 'A las 06 UTC cambia el día en Costa Rica')
assert.equal(crToday(new Date('2027-01-01T05:59:59Z')), '2026-12-31', 'El cambio de año utiliza el calendario de Costa Rica')
assert.equal(crToday(new Date('2027-01-01T06:00:00Z')), '2027-01-01', 'Se actualiza el año al llegar medianoche en Costa Rica')
const nowCR = new Date('2026-11-06T12:00:00Z')
assert.equal(validCargoDate('2026-11-05', nowCR), false, 'La fecha pasada se rechaza')
assert.equal(validCargoDate('2026-11-06', nowCR), true, 'Se acepta la fecha de hoy')
assert.equal(validCargoDate('2026-11-07', nowCR), true, 'Se acepta una fecha futura')
assert.equal(validCargoDate('2026-11-31', nowCR), false, 'No se aceptan días inexistentes')
assert.equal(validCargoDate('2026-02-29', nowCR), false, 'No se acepta un 29 de febrero en año común')
assert.equal(validCalendarDate('2024-02-29'), true, 'El 29 de febrero bisiesto es válido')
assert.equal(validCargoDate('2026-11-06T00:00:00Z', nowCR), false, 'Las cotizaciones requieren fechas ISO sin hora')


// Tracking uses quote-backed canonical names plus explicit illustrative coordinates.
// Evaluate the real TypeScript route functions instead of duplicating their resolver.
const trackingPorts = JSON.parse(source('src/lib/trackingPorts.json'))
const trackingQuoteCoordinates = JSON.parse(source('src/lib/trackingQuoteCoordinates.json'))
const trackingCountries = JSON.parse(source('src/lib/trackingCountries.json'))
assert.equal(trackingCountries.length, 250, 'La referencia geográfica de países cubre 250 registros')
assert.ok(trackingCountries.some(c => c.iso2 === 'HN' && c.lat === 15 && c.lon === -86.5), 'Honduras tiene referencia geográfica')

const officialQuoteSql = source('../backend/Database/OfficialQuotesVideoLocations.sql')
const allOfficialLocationNames = new Set([...officialQuoteSql.matchAll(/'(?:seaport|airport|inland)','([^']+)'/g)]
  .map(([, name]) => name))
for (const location of trackingQuoteCoordinates) {
  assert.ok(allOfficialLocationNames.has(location.quoteCatalogName), 'Cotización registrada: ' + location.name)
  assert.ok(Number.isFinite(location.lat) && Math.abs(location.lat) <= 90, 'Latitud válida: ' + location.name)
  assert.ok(Number.isFinite(location.lon) && Math.abs(location.lon) <= 180, 'Longitud válida: ' + location.name)
  assert.ok(['city-centroid', 'regional-centroid', 'port-approximation'].includes(location.coordinatePrecision),
    'Tipo de aproximación geográfica válido: ' + location.name)
  if (location.coordinateSource) {
    assert.match(location.coordinateSource, /^https:\/\//, 'Origen verificable: ' + location.name)
  }
}
assert.ok(trackingQuoteCoordinates.length >= 208, 'Se preservan al menos 208 entradas geográficas de Cotizaciones')
const officialLocationRows = [...officialQuoteSql.matchAll(/'(seaport|airport|inland)','([^']+)'/g)]
  .map(([, kind, name]) => ({ kind, name }))
const normalizeQuoteName = name => name.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[.,\/()\-]/g, ' ').replace(/\s+/g, ' ').trim()
const coveredNames = new Set([...trackingPorts, ...trackingQuoteCoordinates]
  .flatMap(point => [point.name, point.quoteCatalogName, ...(point.aliases || [])])
  .filter(Boolean).map(normalizeQuoteName))
const uncoveredQuoteRows = officialLocationRows.filter(row => !coveredNames.has(normalizeQuoteName(row.name)))
assert.ok(officialLocationRows.length >= 217, 'No reducir el catálogo parcial de Cotizaciones')
assert.ok(officialLocationRows.length - uncoveredQuoteRows.length >= 213,
  'El globo reconoce al menos 213 registros del catálogo oficial')
const knownAmbiguousNames = new Set([
  'Dong Nai, Vietnam', 'Wilmington, Estados Unidos', 'Coyol, Costa Rica',
  'St. George, Antigua y Barbuda'
])
for (const missing of uncoveredQuoteRows) {
  assert.ok(knownAmbiguousNames.has(missing.name), 'Ubicación sin coordenadas revisadas: ' + missing.name)
}
assert.equal(uncoveredQuoteRows.length, 4,
  'Las cuatro ubicaciones ambiguas siguen excluidas hasta validación operativa')

const knownQuotePorts = new Set(
  [...source('../backend/Database/OfficialQuotesVideoLocations.sql').matchAll(/'seaport','([^']+)'/g)]
    .map(([, name]) => name)
)
for (const port of trackingPorts) {
  assert.ok(Number.isFinite(port.lat) && Math.abs(port.lat) <= 90, 'Latitud válida: ' + port.name)
  assert.ok(Number.isFinite(port.lon) && Math.abs(port.lon) <= 180, 'Longitud válida: ' + port.name)
  if (port.quoteCatalogName) {
    assert.ok(knownQuotePorts.has(port.quoteCatalogName), 'Puerto registrado en Cotizaciones: ' + port.quoteCatalogName)
  }
}
assert.match(trackingRouteSource, /import trackingPorts from '.\/trackingPorts\.json'/,
  'Tracking utiliza el catálogo geográfico basado en Cotizaciones')
assert.match(trackingRouteSource, /import trackingQuoteCoordinates from '.\/trackingQuoteCoordinates\.json'/,
  'El rastreo incorpora las coordenadas vinculadas a Cotizaciones')
assert.match(trackingRouteSource, /import trackingCountries from '.\/trackingCountries\.json'/,
  'El rastreo permite referencias geográficas a nivel país')
assert.match(trackingRouteSource, /export function resolveTrackingLocation\(/,
  'Las ubicaciones de Dynamics pasan por un resolvedor seguro')
assert.match(trackingRouteSource, /countriesWithSpecificPlaces\.has\(point\.countryIso\)/,
  'Países genéricos no duplican escalas si existe un puerto concreto')
const compiledTrackingRoute = tsCompiler.transpileModule(trackingRouteSource, {
  compilerOptions: {
    module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020,
    esModuleInterop: true
  }
})
const trackingRouteExports = {}
runInNewContext(compiledTrackingRoute.outputText, {
  exports: trackingRouteExports,
  require: name => {
    if (name === './trackingPorts.json') return trackingPorts
    if (name === './trackingQuoteCoordinates.json') return trackingQuoteCoordinates
    if (name === './trackingCountries.json') return trackingCountries
    assert.fail('Tracking no debe importar otra dependencia: ' + name)
  }
}, { timeout: 1000 })
const journeyFor = values => trackingRouteExports.illustrativeJourney({
  origin: values.origin ?? null,
  portOfLoading: values.portOfLoading ?? null,
  routeStops: values.routeStops ?? null,
  portOfEntry: values.portOfEntry ?? null,
  destination: values.destination ?? null
})
const idtra12753 = journeyFor({
  origin: 'China', portOfLoading: 'Shenzhen, China',
  portOfEntry: 'Pto. Balboa, Panamá', destination: 'Panamá'
})
assert.equal(idtra12753.map(point => point.name).join(' -> '),
  'Shenzhen, China -> Balboa, Panamá', 'IDTRA 12753 tiene sus dos puertos ilustrativos')
assert.equal(idtra12753.length, 2, 'China y Panamá genéricos no generan paradas multimodales ficticias')
assert.ok(idtra12753.every(point => point.precision !== 'country-centroid'),
  'Los puertos conocidos tienen prioridad sobre centroides nacionales')
const countriesOnly = journeyFor({ origin: 'China', destination: 'Panamá' })
assert.equal(countriesOnly.length, 2, 'Se muestra recorrido ilustrativo si sólo se conocen países')
assert.ok(countriesOnly.every(point => point.precision === 'country-centroid'),
  'Los puntos a nivel país nunca se presentan como puerto o aeropuerto identificado')
const honduras = trackingRouteExports.resolveTrackingLocation('Honduras')
assert.equal(honduras?.precision, 'country-centroid',
  'Honduras se identifica como país y no como aeropuerto')
assert.equal(honduras?.lat, 15, 'Referencia ilustrativa de Honduras comprobada')
assert.equal(honduras?.lon, -86.5, 'Longitud aproximada del país comprobada')
assert.equal(trackingRouteExports.resolveTrackingLocation('Puerto de entrada: Honduras')?.countryIso, 'HN',
  'Variantes de la etiqueta Dynamics reconocen Honduras')
assert.equal(trackingRouteExports.resolveTrackingLocation('Ubicación inventada en Atlantis'), null,
  'No se fabrican coordenadas si el país tampoco es reconocible')
const airToCountry = journeyFor({
  origin: 'Miami, Estados Unidos', portOfEntry: 'Honduras', destination: 'Honduras'
})
assert.equal(airToCountry.map(point => point.name).join(' -> '),
  'Miami, Estados Unidos -> Honduras',
  'Un embarque aéreo puede terminar en Honduras sin suponer un aeropuerto')
assert.equal(airToCountry[1].precision, 'country-centroid',
  'Destino aéreo sin aeropuerto debe anunciar referencia a nivel país')

assert.equal(journeyFor({ portOfLoading: 'Altamira, México', portOfEntry: 'Veracruz, México' })
  .map(point => point.name).join(' -> '), 'Altamira, México -> Veracruz, México',
  'Se reconoce la ruta entre dos puertos con ciudades estatales verificadas')
assert.equal(journeyFor({ portOfLoading: 'Shenzhen, China', portOfEntry: 'Miami, Estados Unidos' }).length, 2,
  'Se reconocen rutas entre diferentes continentes con el catálogo ampliado')
assert.equal(journeyFor({
  portOfLoading: 'Chongqing, China', portOfEntry: 'Puerto Moín, Costa Rica'
}).map(point => point.name).join(' -> '),
  'Chongqing, China -> Puerto Moín, Costa Rica',
  'Rutas con nuevas ubicaciones y puertos contrastados')
assert.equal(journeyFor({
  portOfLoading: 'Manzanillo, Panamá', portOfEntry: 'Puerto Quetzal, Guatemala'
}).length, 2, 'El catálogo incluye terminales específicas de Centroamérica')
assert.equal(journeyFor({
  portOfLoading: 'Qingdao, China', routeStops: ['Mundra, India', 'Cristóbal, Panamá'],
  portOfEntry: 'Puerto Caldera, Costa Rica', destination: 'San José, Costa Rica'
}).length, 5, 'Conservar todas las escalas conocidas en el orden recibido')
assert.equal(journeyFor({ portOfLoading: 'Puerto Balboa, Panama',
  portOfEntry: 'Callao, Perú' }).map(p => p.name).join(' -> '),
  'Balboa, Panamá -> Callao, Perú', 'Variantes de nombres funcionan sin tildes')
assert.equal(journeyFor({
  portOfLoading: 'Shenzhen, China', portOfEntry: 'Shenzhen, China'
}).length, 0, 'No dibujar recorridos cuando ambos puertos son idénticos')

const compiledLocalization = tsCompiler.transpileModule(trackingLocalizationSource, {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 }
})
const trackingLocalizationExports = {}
runInNewContext(compiledLocalization.outputText, { exports: trackingLocalizationExports }, { timeout: 1000 })
const { formatTrackingEquipmentCount, isTrackingConsolidatedEquipment, localizeTrackingMode, localizeTrackingStatus } = trackingLocalizationExports
assert.equal(typeof localizeTrackingMode, 'function')
assert.equal(typeof localizeTrackingStatus, 'function')
for (const [original, es, en] of [
  ['MARITIMO', 'Marítimo', 'Maritime'],
  ['Marítimo FCL', 'Marítimo FCL', 'Maritime FCL'],
  ['MARITIMO/LCL', 'Marítimo LCL', 'Maritime LCL'],
  ['AEREO', 'Aéreo', 'Air'],
  ['AIR', 'Aéreo', 'Air'],
  ['TERRESTRE', 'Terrestre', 'Road'],
  ['Road FTL', 'Terrestre FTL', 'Road FTL']
]) {
  assert.equal(localizeTrackingMode(original, 'es'), es, 'Transporte ES: ' + original)
  assert.equal(localizeTrackingMode(original, 'en'), en, 'Transport EN: ' + original)
}
for (const [original, es, en] of [
  ['Pre-Liquidacion', 'Preliquidación', 'Pre-liquidation'],
  ['Preliquidación', 'Preliquidación', 'Pre-liquidation'],
  ['Pre-liquidation', 'Preliquidación', 'Pre-liquidation'],
  ['En transito', 'En tránsito', 'In transit'],
  ['Programado', 'Programado', 'Scheduled'],
  ['Pending', 'Pendiente', 'Pending'],
  ['En aduana', 'En aduana', 'At customs'],
  ['Entregado', 'Entregado', 'Delivered'],
  ['Cancelado', 'Cancelado', 'Cancelled'],
  ['Booking listo', 'Booking listo', 'Booking ready'],
  ['BOOKING LISTO', 'Booking listo', 'Booking ready'],
  ['Booking ready', 'Booking listo', 'Booking ready'],
  ['booking-listo', 'Booking listo', 'Booking ready'],
  ['Demorado', 'Demorado', 'Delayed'],
  ['Delayed', 'Demorado', 'Delayed'],
  ['CARGA EN ALMACEN DESTINO CR', 'Carga en almacén de destino, Costa Rica', 'Cargo at destination warehouse, Costa Rica'],
  ['carga en almacén de destino CR', 'Carga en almacén de destino, Costa Rica', 'Cargo at destination warehouse, Costa Rica']
]) {
  assert.equal(localizeTrackingStatus(original, 'es'), es, 'Estado ES: ' + original)
  assert.equal(localizeTrackingStatus(original, 'en'), en, 'Status EN: ' + original)
}
for (const original of [
  'MARITIMO - operación especial',
  'Pre-Liquidacion pendiente de confirmar',
  'Maquinaria pesada CAT 1234',
  'MSC SAVANNAH',
  'Booking confirmado',
  'Booking pendiente de confirmar'
]) {
  assert.equal(localizeTrackingMode(original, 'en'), original, 'No alterar datos no catalogados')
  assert.equal(localizeTrackingStatus(original, 'es'), original, 'No traducir textos libres')
}
assert.equal(localizeTrackingMode(null, 'es'), '—')
assert.equal(localizeTrackingStatus('', 'en'), '—')
for (const [input, expected] of [
  ['1 contenedor', '1'],
  ['2 contenedores', '2'],
  ['3 containers', '3'],
  ['1 CONTAINER', '1'],
  [' 12 contenedores ', '12'],
  ['2 x 40 HC', '2 x 40 HC'],
  ['2 contenedores de 40 HC', '2 contenedores de 40 HC'],
  ['40 HC', '40 HC']
]) {
  assert.equal(formatTrackingEquipmentCount(input), expected, 'Cantidad de equipo: ' + input)
}
assert.equal(formatTrackingEquipmentCount(null), null, 'No generar una cantidad para datos ausentes')
for (const [mode, count, size, consolidated] of [
  ['Marítimo', 'LCL', 'LCL', true],
  ['Marítimo LCL', '1', '40 HC', true],
  ['Sea/LCL', null, null, true],
  ['Marítimo', '1', 'CONSOLIDADO', true],
  ['Terrestre LTL', '1', 'pallet', true],
  ['Marítimo FCL', 'LCL', 'LCL', false],
  ['Marítimo', '2 contenedores', '40 HC', false],
  ['Marítimo', '1', 'FCL', false],
  ['Terrestre FTL', '1', '40', false],
  ['Marítimo', null, null, false],
  [null, null, null, false]
]) {
  assert.equal(isTrackingConsolidatedEquipment(mode, count, size), consolidated,
    'Ícono según carga completa o consolidada: ' + [mode, count, size].join(' / '))
}
const iconSource = source('src/components/IconSymbol.vue')
assert.match(iconSource, /<svg v-if="glyph === 'container-open'"/, 'LCL utiliza un contenedor abierto, no una caja de paquetería')
assert.match(iconSource, /M6 6 1 3\.5V20l5-2\.5M18 6l5-2\.5V20l-5-2\.5/, 'El contenedor tiene dos puertas abiertas hacia afuera')
assert.match(iconSource, /M8 15h4v5H8zM12 12h4v8h-4zM10 9h3v3h-3z/, 'El contenedor abierto contiene carga visible')
assert.match(iconSource, /fill="none" stroke="currentColor" stroke-width="1\.8"/, 'El nuevo ícono mantiene el estilo de trazos de Lucide')
assert.match(iconSource, /container: Container/, 'FCL conserva el ícono cerrado de Lucide')
assert.doesNotMatch(iconSource, /PackageOpen/, 'El ícono no debe parecer un paquete abierto')
assert.match(tracking, /<IconSymbol :glyph="equipmentIcon" :size="17" \/>/, 'Solo el campo de equipo elige el ícono dinámicamente')
assert.match(tracking, /isTrackingConsolidatedEquipment\(data\.mode, data\.equipmentCount, data\.equipmentSize\)/,
  'La decisión del ícono depende de datos de modalidad y equipo')
assert.match(tracking, /<dd>\{\{ equipmentConfiguration \}\}<\/dd>/,
  'El texto de cantidad y tamaño se conserva sin modificaciones')
assert.match(tracking, /const quantity = formatTrackingEquipmentCount\(count\)/,
  'La cantidad visible se normaliza sin modificar Dynamics')
assert.match(tracking, /const equipmentSize = size\?\.trim\(\)/,
  'El tamaño de equipo se preserva en el formato combinado')
assert.match(tracking, /formatEquipmentConfiguration\(data\.equipmentCount, data\.equipmentSize\)/,
  'La presentación combina cantidad y tamaño sin modificar Dynamics')
assert.match(tracking, /const displayMode = \(value: string \| null\) => localizeTrackingMode\(value, en\.value \? 'en' : 'es'\)/, 'La modalidad reacciona al idioma seleccionado')
assert.match(tracking, /const displayStatus = \(value: string \| null\) => localizeTrackingStatus\(value, en\.value \? 'en' : 'es'\)/, 'El estado reacciona al idioma seleccionado')
assert.match(tracking, /<strong class="tracking-demo-result__status">\{\{ displayStatus\(shipment\.status\) \}\}<\/strong>/, 'Insignia del estado traducida')
assert.match(tracking, /<dd>\{\{ displayMode\(shipment\.mode\) \}\}<\/dd>/, 'Modalidad del resumen traducida')
assert.match(tracking, /<strong class="tracking-demo-result__status">\{\{ displayStatus\(shipment\.status\) \}\}<\/strong>/, 'El estado traducido permanece visible en la cabecera')
assert.match(tracking, /\{ es: 'Mercancía', en: 'Commodity', value: data\.commodity \}/, 'Commodity es etiqueta traducible pero no se modifica el valor de mercancía')
assert.match(tracking, /<span>\{\{ customerUpdateText \}\}<\/span>/, 'El texto del cliente usa la traducción reactiva por referencia')
assert.match(tracking, /<dd>\{\{ field\.value \}\}<\/dd>/, 'Descripciones y referencias de Dynamics quedan intactas')


// Ensure the same multilingual display policy is used in every shipment-related
// UI: header, summary, customer update, published itineraries, and admin lists.
// Free-form values remain untouched by localizeTrackingStatus's fallback.
assert.equal(localizeTrackingStatus('Booking listo', 'en'), 'Booking ready', 'Booking listo translates in English')
assert.equal(localizeTrackingStatus('Booking listo', 'es'), 'Booking listo', 'Booking is retained in Spanish logistics language')
assert.equal(localizeTrackingStatus('Booking confirmado', 'en'), 'Booking confirmado', 'Do not invent booking confirmation')
assert.equal(localizeTrackingStatus('Booking listo pendiente de confirmar', 'en'), 'Booking listo pendiente de confirmar', 'Never translate unrecognized free text')
assert.equal((tracking.match(/displayStatus\(shipment\.status\)/g) ?? []).length, 1, 'One translated status in the redesigned header; journey uses the original status')
assert.match(itinerary, /displayPublishedStatus\(item\.status\)/, 'Published itineraries translate status')
assert.match(itinerary, /displayPublishedTransport\(item\.transport\)/, 'Published itineraries translate transport')
assert.match(itinerary, /localizeTrackingMode, localizeTrackingStatus/, 'Published itineraries reuse the tracking dictionary')
assert.match(manager, /displayManagedStatus\(\(entry as ManagedItinerary\)\.status\)/, 'Admin itineraries display translated status')
assert.match(manager, /displayManagedMode\(\(entry as ManagedItinerary\)\.transport\)/, 'Admin itineraries display translated mode')
assert.match(manager, /\['Programado','En tránsito','Completado','Demorado'\]\.map\(value => \(\{value,label:displayManagedStatus\(value\)\}\)\)/, 'Admin options translate only their visible labels')
assert.match(manager, /\{value:'Marítimo',label:displayManagedMode\('Marítimo'\)\}/, 'Admin transport value stays the original code')
assert.match(itinerary, /const en = computed\(\(\) => locale\.value\.toLowerCase\(\)\.startsWith\('en'\)\)/, 'Published itineraries update reactively when language changes')
assert.match(manager, /const en = computed\(\(\) => locale\.value\.toLowerCase\(\)\.startsWith\('en'\)\)/, 'Admin lists update reactively when language changes')


// Dynamic customer-status localization must handle unseen Dynamics messages in
// any matching BL/HBL/BCF/IDTRA/CONTAINER/PO lookup, without altering records.
const trackingTranslationBackend = source('../backend/Services/TrackingStatusTranslationService.cs')
const trackingBackendProgram = source('../backend/Program.cs')
assert.match(dholeTracking, /MapPost\("\/api\/tracking\/dynamics\/customer-status\/translate"/, 'Endpoint dedicado a mensajes variables de Dynamics')
assert.match(dholeTracking, /RequireAuthorization\("registered"\)\.RequireRateLimiting\("tracking-translation"\)/, 'Las traducciones no deben estar disponibles sin autenticación y límite')
assert.match(dholeTracking, /message\.Length > 256/, 'Limitar el texto enviado a traducción')
assert.match(dholeTracking, /translator\.TranslateAsync\(message, language, ct\)/, 'Traducir solo el mensaje visible, no volver a consultar embarques')
assert.match(trackingBackendProgram, /AddSingleton<TrackingStatusTranslationService>\(\)/, 'Traductor compartido con caché')
assert.match(trackingBackendProgram, /AddPolicy\("tracking-translation"/, 'Límite de llamadas a IA separado de consultas a Dynamics')
assert.match(trackingTranslationBackend, /Ai:Groq:ApiKey/, 'Credencial de IA solo en backend')
assert.match(trackingTranslationBackend, /SHA256\.HashData/, 'Caché por texto e idioma sin registrar la referencia')
assert.match(trackingTranslationBackend, /max_completion_tokens = 500/, 'Límite de generación para mensajes breves')
assert.match(trackingTranslationBackend, /TimeSpan\.FromHours\(12\)/, 'La traducción se reutiliza entre búsquedas')
assert.match(tracking, /watch\(\[\(\) => shipment\.value\?\.customerStatus, en\]/, 'Al cambiar referencia o idioma se recalcula la traducción')
assert.match(tracking, /fetch\('\/api\/tracking\/dynamics\/customer-status\/translate'/, 'Los textos no catalogados se envían al backend protegido')
assert.match(tracking, /body: JSON\.stringify\(\{ text: source, language \}\)/, 'La llamada no debe enviar la referencia de cliente ni campos privados')
assert.match(tracking, /const controller = new AbortController\(\)/, 'Cancelar traducciones de referencias anteriores')
assert.match(tracking, /onCleanup\(\(\) => controller\.abort\(\)\)/, 'Cancelar traducción al cambiar idioma/referencia')
assert.match(tracking, /const customerUpdateText = computed\(\(\) =>/, 'El texto visible se actualiza en forma reactiva')
assert.match(tracking, /customerUpdateTranslations\.value\[language \+ ':' \+ source\] \?\? source/, 'Si el servicio falla se conserva el mensaje original')
assert.doesNotMatch(tracking, /shipment\.value\.customerStatus\s*=/, 'Nunca escribir una traducción en Dynamics o mutar el registro')
assert.doesNotMatch(trackingTranslationBackend, /logger\.Log(?:Warning|Error|Information)\([^\n]*(?:source|message)\b/, 'No registrar el mensaje privado en logs')

// OTP UX regression: never leak internal transport errors into the customer UI.
const otpLogin = source('src/pages/Login.vue')
const otpBackend = source('../backend/Program.cs')
const otpService = source('../backend/Services/Auth/AuthService.cs')
const otpEs = JSON.parse(source('src/locales/es.json')).custom.login
const otpEn = JSON.parse(source('src/locales/en.json')).custom.login
assert.match(otpService, /request_count < 4/, 'OTP mantiene máximo cuatro solicitudes por 15 minutos')
assert.match(otpService, /request_count % 2 = 1/, 'OTP permite un segundo intento antes de esperar 60 segundos')
assert.doesNotMatch(otpService, /AnyAsync\(x => x\.UsuarioId == user\.Uuid && x\.CreatedAt > now\.AddSeconds\(-60\)/, 'No bloquear el segundo intento con un límite de challenge obsoleto')
assert.match(otpService, /last_requested_at <= NOW\(\) - INTERVAL '60 seconds'/, 'OTP conserva espera mínima por correo')
assert.match(otpService, /GetOtpRetrySecondsAsync\(emailKey, ct\)/, 'Devuelve espera calculada desde PostgreSQL')
assert.match(otpService, /await SendMailAsync\(email, otp, ct\)/, 'OTP sigue enviándose por proveedor')
assert.match(otpService, /x\.Uuid != id && x\.CreatedAt < row\.CreatedAt && x\.UsedAt == null/, 'Solo se invalidan OTP anteriores después del envío, sin afectar desafíos nuevos simultáneos')
assert.match(otpBackend, /code = "otp_rate_limited"/, '429 por correo es distinguible')
assert.match(otpBackend, /Headers\.RetryAfter/, '429 y 503 exponen Retry-After')
assert.match(otpBackend, /code = "email_unavailable"/, '503 conserva código de diagnóstico')
assert.match(otpLogin, /body\?\.code === 'email_unavailable'/, 'La IU reconoce indisponibilidad del correo')
assert.match(otpLogin, /response\.status === 429/, 'La IU reconoce 429')
assert.match(otpLogin, /beginRetryCooldown\(response\)/, 'La IU usa Retry-After')
assert.match(otpLogin, /if \(response\.headers\.has\('Retry-After'\)\) beginRetryCooldown\(response\)/, 'La segunda solicitud exitosa también activa la pausa visual')
assert.match(otpService, /return \(new OtpStarted\(id, GenericMessage, 300\), false, false,[\s\S]*?await GetOtpRetrySecondsAsync\(emailKey, ct\)\)/, 'Respuesta OTP exitosa informa próxima oportunidad de reenvío')
assert.match(otpLogin, /issue\.kind === 'rate' \|\| \(issue\.kind === 'mail' && response\.headers\.has\('Retry-After'\)\)/, '503 sin espera permite un segundo clic')
assert.match(otpBackend, /if \(ex\.RetryAfterSeconds > 0\)/, 'El 503 no impone un minuto ficticio al primer error')
assert.match(otpLogin, /:disabled="loading \|\| retrySeconds > 0"/, 'El botón OTP respeta el contador')
assert.match(otpLogin, /watch\(email, \(\) => \{ error\.value = ''; errorKind\.value = ''; restoreRetryCooldown\(\) \}\)/, 'Cuenta regresiva asociada al correo activo, no a otros usuarios de la pestaña')
assert.match(otpLogin, /const normalized = email\.value\.trim\(\)\.toLowerCase\(\)/, 'Índice de espera normalizado por cuenta')
assert.match(otpLogin, /window\.crypto\.getRandomValues\(bytes\)/, 'Identificador opaco con sal aleatoria por pestaña')
assert.match(otpLogin, /sessionStorage\.setItem\(key, String\(retryUntil\)\)/, 'La espera persiste solo en la cuenta seleccionada')
assert.match(otpLogin, /role="alert"/, 'Mensajes accesibles')
assert.match(otpLogin, /class="login-auth-sending" role="status"/, 'La espera al proveedor de correo es visible y accesible')
assert.match(otpLogin, /class="login-auth-cooldown" role="status"/, 'Mostrar el contador restaurado cuando no haya tarjeta de error')
assert.match(otpLogin, /retrySeconds > 0 && !error/, 'Evitar mostrar el contador duplicado junto al error de correo')
assert.match(otpLogin, /retrySeconds > 0 \? \$t\('custom\.login\.rateTitle'\)/, 'Usar una etiqueta de espera sin contador duplicado en el botón')
const otpLoginStyles = source('src/style.css')
assert.match(otpLoginStyles, /html\.theme-dark \.login-screen \.login-auth-card \.login-auth-feedback \{[\s\S]*?background: #0b1428 !important;/, 'El aviso OTP en modo oscuro es azul marino en lugar de blanco')
assert.match(otpLoginStyles, /html\.theme-dark \.login-screen \.login-auth-card \.login-auth-feedback__copy > span \{[\s\S]*?color: #cbd2df !important;/, 'Descripción OTP legible en modo oscuro')
assert.match(otpLoginStyles, /html\.theme-dark \.login-screen \.login-auth-card \.login-auth-sending \{[\s\S]*?background: #101b32 !important;/, 'Estado de espera coherente en modo oscuro')
assert.match(otpLoginStyles, /\.login-visual:has\(>\.cms-background-video\)>\.login-guest-back\{position:absolute;z-index:3\}/, 'Volver no debe entrar en el flujo sobre el logo cuando hay video de portada')
assert.match(otpLoginStyles, /@media\(max-width:800px\)\{\.login-visual \.login-guest-back\{top:16px;left:auto;right:/, 'Volver se ubica lejos del logo en ancho móvil')
assert.doesNotMatch(otpLogin, /body\.traceId|\` \[\$\{body\.code\}\]/, 'La IU no expone traceId ni etiquetas internas')
for (const key of ['sendingDetail', 'mailUnavailableTitle', 'mailUnavailableDescription', 'mailImmediateRetryDescription', 'rateTitle', 'rateDescription', 'retryIn', 'retryButton', 'serviceError']) {
  assert.equal(typeof otpEs[key], 'string', 'OTP ES: ' + key)
  assert.equal(typeof otpEn[key], 'string', 'OTP EN: ' + key)
}

// Public itinerary 429 regression: isolate read quotas without weakening auth,
// protect X-Forwarded-For, cache public catalogues, and show a useful message.
const limitBackend = source('../backend/Program.cs')
const clientPartition = source('../backend/Services/RateLimitClientKey.cs')
const quoteEndpoints = source('../backend/Endpoints/OfficialQuoteEndpoints.cs')
const itineraryCrud = source('../backend/Services/ItinerariosCrudEndpoints.cs')
const itineraryCatalog = source('src/lib/itineraryLocations.ts')
assert.match(limitBackend, /AddPolicy\("public-read"/, 'Consultas públicas utilizan una cuota separada')
assert.match(limitBackend, /PermitLimit = 120/, 'Límite para lecturas públicas')
assert.match(limitBackend, /AddPolicy\("auth"[\s\S]*?PermitLimit = 20/, 'OTP conserva su cuota independiente')
assert.match(limitBackend, /HttpContext\.Response\.StatusCode = StatusCodes\.Status429TooManyRequests/, 'Rechazo conserva HTTP 429')
assert.match(limitBackend, /Response\.Headers\.RetryAfter/, 'Los clientes reciben Retry-After')
assert.match(limitBackend, /app\.UseAuthentication\(\);[\s\S]*?app\.UseRateLimiter\(\)/, 'La partición de usuarios se calcula con identidad validada')
assert.match(clientPartition, /trusted\.Contains\(current\)/, 'XFF solo tras verificar proxy inmediato')
assert.match(clientPartition, /GetSection\("RateLimiting:TrustedProxyIps"\)/, 'Lista explícita de proxies confiables')
const deployedCompose = source('../deploy/docker-compose.images.yml')
assert.ok(deployedCompose.includes('RateLimiting__TrustedProxyIps__0: "${PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_IP_0:-}"'), 'Compose real de Argos expone proxy 0 opcional')
assert.ok(deployedCompose.includes('RateLimiting__TrustedProxyIps__1: "${PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_IP_1:-}"'), 'Compose real de Argos expone proxy 1 opcional')
assert.ok(deployedCompose.includes('PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_IP_0:-') && deployedCompose.includes('PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_IP_1:-'), 'No fijar IPs de contenedores en Compose')
assert.match(clientPartition, /GetSection\("RateLimiting:TrustedProxyHostnames"\)/, 'Confianza por nombre de servicio Docker explícito')
assert.match(clientPartition, /IsSafeDockerHostname\(host\)/, 'No resolver dominios públicos ni patrones abiertos')
assert.match(clientPartition, /IsDockerPrivateAddress/, 'No confiar en destinos DNS públicos')
assert.match(clientPartition, /DateTimeOffset\.UtcNow\.AddSeconds\(5\)/, 'Revalidar IPs Docker tras recreación')
assert.match(clientPartition, /catch \(SocketException\)/, 'DNS caído no habilita confianza implícita')
assert.ok(deployedCompose.includes('RateLimiting__TrustedProxyHostnames__0: "${PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_HOST_0:-}"'), 'Proxy DNS 0 configurable y desactivado por defecto')
assert.ok(deployedCompose.includes('RateLimiting__TrustedProxyHostnames__1: "${PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_HOST_1:-}"'), 'Proxy DNS 1 configurable y desactivado por defecto')
assert.ok(deployedCompose.includes('RateLimiting__TrustedProxyHostnames__2: "${PANGOLIN_RATE_LIMIT_TRUSTED_PROXY_HOST_2:-}"'), 'Proxy DNS 2 configurable y desactivado por defecto')
assert.doesNotMatch(clientPartition, /Request\.Headers\["CF-Connecting-IP"\]/, 'No confiar en encabezados falsificables de Cloudflare')
assert.match(quoteEndpoints, /MapGet\("\/locations", GetPublicAssistantLocations\)[\s\S]*?RequireRateLimiting\("public-read"\)/, 'Catálogo oficial separado de auth')
assert.match(quoteEndpoints, /MapPost\(""/, 'Las escrituras de cotizaciones permanecen intactas')
assert.match(itineraryCrud, /MapGet\("\/api\/itinerarios\/\{id:guid\}"[\s\S]*?RequireRateLimiting\("public-read"\)/, 'Detalle público separado de auth')
assert.match(limitBackend, /MapGet\("\/api\/itinerarios"[\s\S]*?RequireRateLimiting\("public-read"\)/, 'Listado público separado de auth')
assert.match(limitBackend, /MapGet\("\/api\/itinerarios\/locations"[\s\S]*?RequireRateLimiting\("public-read"\)/, 'Un solo endpoint de catálogos combinados')
assert.match(itineraryCatalog, /fetch\('\/api\/itinerarios\/locations\?'/, 'La UI consulta el catálogo combinado')
assert.doesNotMatch(itineraryCatalog, /Promise\.all\(types\.map/, 'Sin ráfaga de ocho consultas individuales')
assert.match(itineraryCatalog, /const CACHE_MS = 5 \* 60 \* 1000/, 'Caché temporal del catálogo')
assert.match(itineraryCatalog, /sessionStorage\.getItem\(STORAGE_PREFIX \+ key\)/, 'Caché persiste tras recarga')
assert.match(itineraryCatalog, /if \(response\.status === 429\)/, 'Catálogo respeta 429')
assert.match(itineraryCatalog, /cooldownRemaining\(key\)/, 'Se evita insistir durante el enfriamiento')
assert.match(itinerary, /beginRetryCooldown\(response\)/, 'El 429 de resultados respeta Retry-After')
assert.match(itinerary, /sessionStorage\.setItem\(SEARCH_COOLDOWN_KEY/, 'El cooldown se conserva tras refrescar la pestaña')
assert.match(itinerary, /const remaining = savedRetrySeconds\(\)/, 'No se reintenta el listado al recargar durante 429')
assert.match(itinerary, /if \(retrySeconds\.value > 0\) return/, 'No se bombardea el API durante cooldown')
assert.match(itinerary, /class="itinerary-rate-limit" role="alert"/, 'Mensaje accesible dentro del resumen')
assert.match(itinerary, /'Demasiadas consultas por el momento'/, 'Mensaje comprensible en español')
assert.match(itinerary, /'Too many requests for now'/, 'Mensaje comprensible en inglés')
assert.match(itinerary, /:disabled="retrySeconds > 0 \|\| cargando"/, 'Reintento bloqueado hasta que expire Retry-After')

console.log('OK: SignalR, CMS, MinIO, news, itinerary and tracking contracts.')
