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
assert.match(homeNewsLayout, /home-news-sidebar--single': homeNews\\.length === 1/, 'La noticia única se identifica reactivamente')
assert.match(homeNewsLayout, /homeNews\\.length > 1 \\? 2 : 1/, 'Varias noticias conservan el carrusel duplicado')
assert.match(mainStyles, /\\.home-news-sidebar--single \\.home-news-sidebar__track\\s*\\{\\s*animation: none !important;\\s*transform: none !important;/, 'Una noticia se mantiene fija arriba sin bucle')
assert.match(mainStyles, /\\.home-news-sidebar--single \\.home-news-sidebar__group:first-child\\s*\\{\\s*justify-content: flex-start;/, 'La noticia vertical queda anclada en el inicio')
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
assert.match(officialQuote, /equipmentSizeOptions = computed<EquipmentOption\[\]>/, 'FCL and FTL retain separate equipment size options')
assert.match(officialQuote, /\['20', '40', '45', '48'\]\.map\(n => \(\{ value: n \+ ' pies'/, 'FCL retains all four sizes')
for (const item of ['24 pies / 5 TON', '26 pies / 7 TON', '53 pies', 'Dry Van', 'High Cube', 'Open Top', 'Open Side', 'Tank', 'Flat Rack', 'NOR', 'Furgón']) {
  assert.ok(officialQuote.includes(item), 'Retain equipment option: ' + item)
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
assert.match(news, /<div class="news-article-page__body">\s*<p v-for="\(paragraph, index\) in activeArticleParagraphs" :key="index">\{\{ paragraph \}\}<\/p>\s*<\/div>/, 'Se muestra íntegro el cuerpo del CMS como párrafos')
assert.match(news, /<SiteHeader v-if="isArticlePage" active="noticias" overlay\s*\/>/, 'La ruta legible y la anterior mantienen el encabezado superpuesto sobre la imagen')
assert.doesNotMatch(news, /news-article-modal|aria-modal="true"/, 'Noticias no abre un modal')
assert.match(news, /href="\/noticias"/, 'El usuario puede volver a la lista de noticias')
const home = source('src/Home.vue')
assert.match(home, /encodeURIComponent\(item\.id\)/, 'Home debe enlazar la noticia específica')
const itinerary = source('src/pages/Itinerary.vue')
assert.match(itinerary, /closing/, 'Conservar Closing, ETD y ETA')
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
assert.match(login, /if \(!response\.ok\) throw new Error\(await parseError\(response\)\)/, 'Error de correo debe detener el paso OTP')
assert.match(login, /step\.value = 'otp'/, 'Conservar flujo OTP cuando el correo está habilitado')
assert.equal(esLogin.intro, 'Ingresa tu dirección de correo electrónico para recibir un código de un solo uso.')
assert.equal(enLogin.intro, 'Enter your email address to receive a one-time code.')
assert.ok(esLogin.accountUnavailable && enLogin.accountUnavailable, 'Aviso traducido en ambos idiomas')
assert.equal(esLogin.footer, undefined, 'Quitar aviso de pruebas en español')
assert.equal(enLogin.footer, undefined, 'Quitar aviso de pruebas en inglés')
assert.doesNotMatch(esLogin.emailPlaceholder, /gmail\.com/i, 'No restringir dominio de correo a Gmail')
assert.match(authService, /if \(user is null\)\s*return \(null, false, true\);/, 'No generar OTP ficticio para cuenta desconocida')
assert.match(backendProgram, /code = "account_unavailable"/, 'API debe distinguir la cuenta no habilitada')
assert.match(backendProgram, /StatusCodes\.Status404NotFound/, 'Devolver 404 antes del formulario OTP')

const tracking = source('src/pages/Tracking.vue')
const dholeTracking = source('../backend/Endpoints/DholeTrackingEndpoints.cs')
assert.match(dholeTracking, /RequireAuthorization\("registered"\)/, 'Dynamics exige una cuenta cliente o administradora autenticada')
assert.match(dholeTracking, /RequireRateLimiting\("tracking"\)/, 'Dynamics limita las consultas por referencia')
assert.doesNotMatch(dholeTracking, /MapPost\("\/api\/tracking\/search"/, 'No reintroducir consultas anónimas alternativas')
assert.match(authRoot, /trackingAccess\.value = user && \(role === 'cliente' \|\| role === 'administrador'\)/, 'La página de rastreo requiere sesión real')
assert.match(tracking, /<WorldGlobe :shipment="globeRoute" :initial-zoom="0\.8"\s*\/>/, 'El globo conserva el zoom inicial y utiliza rutas ilustrativas')
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
// Detalles de seguimiento: seis filas glass no interactivas, parejas y ambos temas.
assert.match(tracking, /class="tracking-demo-result__grid">\s*<div class="tracking-demo-result__pair">/, 'El resumen usa filas glass')
assert.equal((tracking.match(/<div class="tracking-demo-result__pair">/g) ?? []).length, 6, 'Seis parejas de resumen en orden')
assert.match(tracking, /<dt>\{\{ copy.origin \}\}<\/dt><dd>\{\{ shipment.origin/, 'Origen se conserva')
assert.match(tracking, /<dt>\{\{ copy.destination \}\}<\/dt><dd>\{\{ shipment.destination/, 'Destino va junto a origen')
assert.match(tracking, /<dt>\{\{ en \? 'Transport' : 'Transporte' \}\}/, 'Transporte se conserva')
assert.match(tracking, /<dt>\{\{ copy.status \}\}/, 'Estado se conserva')
assert.match(tracking, /\.tracking-demo-result__pair \{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'Cada fila contiene dos datos')
assert.match(tracking, /align-items:center; column-gap:0; min-width:0;/, 'La línea divisoria se coloca exactamente al centro (sin gap de columnas)')
assert.match(tracking, /\.tracking-demo-result__field:first-child:not\(:only-child\) \{\s*padding-right:var\(--tracking-pair-spacing\);/, 'Espaciado simétrico a la izquierda del divisor')
assert.match(tracking, /\.tracking-demo-result__field \+ \.tracking-demo-result__field \{[\s\S]*?padding-left:var\(--tracking-pair-spacing\);/, 'Espaciado simétrico a la derecha del divisor')
assert.match(tracking, /\.tracking-demo-result__pair \{ --tracking-pair-spacing:12px; column-gap:0; padding:13px 14px;/, 'El divisor permanece centrado en móvil')
assert.match(tracking, /-webkit-backdrop-filter:blur\(12px\); backdrop-filter:blur\(12px\)/, 'Glass blur de 12px igual a otras secciones con soporte Safari')
assert.match(tracking, /background:rgba\(255,255,255,\.18\)/, 'Glass claro conserva transparencia de Noticias')
// Dark mode must have one shared row for both fields, just like light.
const darkPairStart = tracking.indexOf(':global(html.theme-dark .app-site.tracking-site .tracking-demo-result__pair) {')
assert.ok(darkPairStart >= 0, 'El resumen oscuro conserva las franjas completas')
const darkPairCSS = tracking.slice(darkPairStart, tracking.indexOf('</style>', darkPairStart))
assert.match(darkPairCSS, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'Dos columnas en una sola franja')
assert.match(darkPairCSS, /border:1px solid #4f5365 !important;/, 'Un solo borde exterior gris azulado, igual al selector cerrado')
assert.match(darkPairCSS, /background:#060f21 !important;/, 'Fondo marino a todo lo ancho de la franja')
assert.match(darkPairCSS, /-webkit-backdrop-filter:none !important;\s*backdrop-filter:none !important;\s*box-shadow:none !important;/, 'Sin desenfoque ni sombras: superficie mate completamente opaca')
assert.match(darkPairCSS, /background:#060f21 !important;\s*background-image:none !important;/, 'Fondo sólido azul sin transparencia ni degradado')
assert.match(darkPairCSS, /tracking-demo-result__pair\) \{[\s\S]*?border:1px solid #4f5365 !important;/, 'Borde único mate sin efecto Glass')
const darkContainerStart = tracking.indexOf(':global(html.theme-dark .app-site.tracking-site .tracking-demo-result) {')
assert.ok(darkContainerStart >= 0, 'Contenedor exterior del resumen en modo oscuro')
const darkContainerCSS = tracking.slice(darkContainerStart, darkPairStart)
assert.match(darkContainerCSS, /box-shadow:none !important;/, 'Contenedor exterior sin sombra Glass')
assert.match(darkPairCSS, /tracking-demo-result__field\) \{[\s\S]*?border:0 !important;/, 'No hay borde en cada campo')
assert.match(darkPairCSS, /tracking-demo-result__field \+ \.tracking-demo-result__field\) \{[\s\S]*?border-left:1px solid var\(--tracking-glass-divider\) !important;/, 'Una sola línea divisoria centrada')
assert.match(darkPairCSS, /tracking-demo-result__field dd\) \{[\s\S]*?background:transparent !important;/, 'No hay caja independiente para cada valor')
assert.match(darkPairCSS, /tracking-demo-result__field dd\) \{[\s\S]*?border:0 !important;/, 'Los valores no tienen segundo borde')
assert.match(darkPairCSS, /content:none !important;/, 'Sin reflejos ni líneas extra')
const finalDarkCardCSS = tracking.slice(tracking.lastIndexOf('/* Tracking dark cards: unscoped override')) 
assert.match(finalDarkCardCSS, /html\.theme-dark \.app-site\.tracking-site \.tracking-demo-result__pair \{[\s\S]*?background: #060f21 !important;[\s\S]*?border: 1px solid #4f5365 !important;/, 'El override final iguala el acabado del selector cerrado')
assert.match(finalDarkCardCSS, /\.tracking-demo-result__pair::before,[\s\S]*?\.tracking-demo-result__pair::after \{[\s\S]*?display: none !important;/, 'Los reflejos decorativos no se dibujan en modo oscuro')
assert.doesNotMatch(darkPairCSS, /border:1px solid #b50928 !important;/, 'No hay borde rojo')
assert.match(tracking, /background:rgba\(255,255,255,\.18\)/, 'Glass claro intacto')
assert.match(tracking, /border:1px solid rgba\(255,255,255,\.6\)/, 'Bordes del Glass claro intactos')
assert.match(tracking, /cursor:default;/, 'Las filas informativas no simulan un enlace')
assert.match(tracking, /shipmentExtrasPairs = computed<ShipmentExtraField\[\]\[\]>/, 'Los campos adicionales se agrupan en pares')
assert.match(tracking, /v-for="\(pair, index\) in shipmentExtrasPairs"/, 'Los pares extra se muestran con el mismo glass')
assert.match(tracking, /@media\(max-width:580px\) \{\s*\.tracking-demo-result__grid \{ gap:10px; \}/, 'Ajuste móvil sin separar parejas')
assert.match(tracking, /:global\(html.theme-dark \.app-site\.tracking-site \.tracking-demo-result__pair\) \{/, 'El modo oscuro conserva las franjas de dos campos')
assert.match(tracking, /shipment\.customerStatus/, 'Conservar la actualización para el cliente')
assert.match(tracking, /shipmentExtras/, 'Conservar los campos adicionales de rastreo')

// Dynamics mode/status are controlled display values; all other content remains unchanged.
const trackingLocalizationSource = source('src/lib/trackingDisplay.ts')
const tsCompiler = require('typescript')
const { runInNewContext } = require('node:vm')
const compiledLocalization = tsCompiler.transpileModule(trackingLocalizationSource, {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 }
})
const trackingLocalizationExports = {}
runInNewContext(compiledLocalization.outputText, { exports: trackingLocalizationExports }, { timeout: 1000 })
const { formatTrackingEquipmentCount, localizeTrackingMode, localizeTrackingStatus } = trackingLocalizationExports
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
assert.match(tracking, /value: formatTrackingEquipmentCount\(data\.equipmentCount\)/, 'La cantidad visible se normaliza sin modificar Dynamics')
assert.match(tracking, /value: data\.equipmentSize/, 'Conservar tamaño y configuración original de equipo')
assert.match(tracking, /const displayMode = \(value: string \| null\) => localizeTrackingMode\(value, en\.value \? 'en' : 'es'\)/, 'La modalidad reacciona al idioma seleccionado')
assert.match(tracking, /const displayStatus = \(value: string \| null\) => localizeTrackingStatus\(value, en\.value \? 'en' : 'es'\)/, 'El estado reacciona al idioma seleccionado')
assert.match(tracking, /<strong class="tracking-demo-result__status">\{\{ displayStatus\(shipment\.status\) \}\}<\/strong>/, 'Insignia del estado traducida')
assert.match(tracking, /<dd>\{\{ displayMode\(shipment\.mode\) \}\}<\/dd>/, 'Modalidad del resumen traducida')
assert.match(tracking, /<dd>\{\{ displayStatus\(shipment\.status\) \}\}<\/dd>/, 'Estado del resumen traducido')
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
assert.equal((tracking.match(/displayStatus\(shipment\.status\)/g) ?? []).length, 2, 'Translate header and summary using one catalog')
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

console.log('OK: SignalR, CMS, MinIO, news, itinerary and tracking contracts.')
