// Guard that both social networks remain accessible, lazy and independently editable.
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const component = read('frontend/src/components/HomeInstagramReel.vue')
const editor = read('frontend/src/pages/SiteVisualEditor.vue')
const facebookGlyph = read('frontend/src/components/FacebookGlyph.vue')
const backend = read('backend/Endpoints/FacebookFeaturedVideoEndpoints.cs')
const routes = read('backend/Program.cs')

assert.match(component, /switchNetwork\(network: Network\)/, 'Both networks must be selectable')
assert.match(component, /aria-selected/, 'The selector must expose its active tab')
assert.match(component, /role="tab" aria-label="Instagram"/, 'Instagram tab must remain accessible without a visible caption')
assert.match(component, /role="tab" aria-label="Facebook"/, 'Facebook tab must remain accessible without a visible caption')
assert.doesNotMatch(component, /<span class="sr-only">(Instagram|Facebook)<\/span>/,
  'Icon tab captions must be removed from visible layout')
assert.match(facebookGlyph, /fill="currentColor"/, 'Facebook logo must have a solid fill')
assert.doesNotMatch(facebookGlyph, /stroke="currentColor"/, 'Facebook logo must not be outlined')
assert.match(component, /name="social-copy"/, 'Text must transition when a platform is swapped')
assert.match(component, /name="social-reel"/, 'Video must transition in its fixed frame')
assert.match(component, /\.home-instagram-section__reel-head\s*\{[^}]*color:\s*#fff;/s,
  'Reel header must remain legible in light mode')
assert.match(component, /\.home-instagram-section__reel-head strong\s*\{[^}]*color:\s*#fff;/s,
  'Reel account name must stay white')
assert.match(component, /\.home-instagram-section__reel-head small\s*\{[^}]*color:\s*#fff;/s,
  'Reel type label must stay white')
assert.match(component, /\.home-instagram-section__open\s*\{[^}]*color:\s*#fff;/s,
  'Reel open link must stay white')
assert.match(component, /8500/, 'Automated network rotation must remain delayed')
assert.match(component, /playingNative\.value \|\| facebookPlaying\.value/,
  'Playing a video must block automatic switching')
assert.match(component, /prefers-reduced-motion: reduce/, 'Reduced-motion preferences must be respected')
assert.doesNotMatch(component, /<iframe[^>]*home-instagram-section__embed(?![^>]*facebook)/,
  'Do not render a direct Instagram iframe; the official embed.js builds the embed')
assert.doesNotMatch(component, /\$\{reelUrl\.value\}embed\//,
  'Do not generate unsupported direct Instagram iframe URLs')
assert.match(component, /https:\/\/www\.instagram\.com\/embed\.js/,
  'Load the official Instagram embed SDK on user interaction')
assert.match(component, /<blockquote class="instagram-media" :data-instgrm-permalink="reelUrl"/,
  'Use the official Instagram post/Reel blockquote based on the sanitized URL')
assert.match(component, /playInstagramInsidePage/,
  'The visitor must be able to try playback inside the page from a link-only Reel')
assert.match(component, /<button class="home-instagram-section__play" type="button"[\s\S]*?@click="playInstagramInsidePage"/,
  'The play button must activate the official embed')
assert.match(component, /instagramEmbedState\.value = 'unavailable'/,
  'Script failure or embed timeout must provide a fallback')
assert.match(component, /:href="reelUrl" target="_blank" rel="noopener noreferrer"/,
  'Keep a safe external fallback if the Reel cannot be embedded')
assert.doesNotMatch(component, /onMounted\(\(\) => \{[\s\S]*?loadOfficialInstagramEmbed\(/,
  'The Instagram embed script must not load before the user clicks Play')
assert.match(component, /<video class="home-instagram-section__native-video" :key="videoSrc"/,
  'An authorized/uploaded Instagram video still plays natively in the card')
assert.match(component, /https:\/\/www\.facebook\.com\/plugins\/video\.php/,
  'The existing Facebook player must remain available')
assert.match(editor, /Solo enlace de Instagram \(abrir Reel en Instagram\)/,
  'The admin editor must explain the link-only behavior')
assert.match(component, /reelObserver = new IntersectionObserver/, 'Network requests should be lazy')
assert.match(component, /if \(!reelRequested\) return/, 'Realtime updates cannot trigger eager requests')
assert.match(component, /\/api\/social\/facebook\/featured-video/, 'Facebook video must come from the public API')
assert.match(component, /https:\/\/www\.facebook\.com\/grupocastrofallas1/, 'Use the official Facebook page')
assert.match(editor, /featuredFacebookMediaId/, 'Facebook must accept a selected original video')
assert.match(editor, /saveFacebookVideo/, 'Editor must publish Facebook separately')
assert.match(backend, /\.RequireAuthorization\("admin"\)/, 'Publishing requires admin authorization')
assert.match(backend, /m\.Kind == "Video"/, 'Only uploaded video media may be selected')
assert.match(backend, /uri\.Scheme != Uri\.UriSchemeHttps/, 'Only secure Facebook video links are accepted')
assert.match(routes, /app\.MapFacebookFeaturedVideo\(\)/, 'API route must be registered')
console.log('PASS: selector, motion, lazy requests, editors and admin protections')
