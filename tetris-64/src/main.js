/**
 * main.js — Point d'entrée du jeu Tetris 64.
 *
 * Responsabilités :
 *  - Récupérer les conteneurs DOM racine (#viewport, #world, #scene-root, etc.)
 *  - Instancier les systèmes globaux : caméra, effets, skybox, fog, particules,
 *    text pops, audio, input, stockage.
 *  - Créer et démarrer le sceneManager, qui orchestre title → hub → game.
 *  - Lancer la boucle d'animation principale (rAF) qui tick tous les systèmes.
 *  - Gérer le bouton mute, le boot-loader, le resize, la visibility.
 *
 * Ce fichier reste "mince" : il compose des modules auto-suffisants. Toute
 * logique métier doit rester dans son module respectif.
 */

import { createCamera } from './camera/camera.js';
import { createEffects } from './camera/effects.js';
import { createSkybox } from './fx/skybox.js';
import { createFog } from './fx/fog.js';
import { createParticles } from './fx/particles.js';
import { createTextPop } from './fx/textPop.js';
import { createSoundManager } from './audio/soundManager.js';
import { createKeyboard } from './input/keyboard.js';
import { createTouch } from './input/touch.js';
import { createActionMap } from './input/actionMap.js';
import { createStorage } from './ui/storage.js';
import { createScreens } from './ui/screens.js';
import { createSceneManager } from './scenes/sceneManager.js';
import { createTransitions } from './scenes/transitions.js';
import {
  MAX_FRAME_DT_MS,
  SCENES,
  DEFAULT_KEYMAP,
} from './core/constants.js';
import { $, prefersReducedMotion, isTouchDevice } from './utils/helpers.js';

// =========================================================================
// RÉCUPÉRATION DOM
// =========================================================================

const viewport = $('#viewport');
const world = $('#world');
const sceneRoot = $('#scene-root');
const skyboxEl = $('#skybox');
const fogEl = $('#fog');
const fxLayer = $('#fx-layer');
const uiOverlay = $('#ui-overlay');
const hudEl = $('#hud');
const screensEl = $('#screens');
const textPopLayer = $('#text-pop-layer');
const transitionOverlay = $('#transition-overlay');
const bootLoader = $('#boot-loader');
const muteBtn = $('#mute-btn');

if (!viewport || !world || !sceneRoot) {
  throw new Error('[main] DOM racine introuvable : vérifiez index.html');
}

// =========================================================================
// SYSTÈMES GLOBAUX
// =========================================================================

const storage = createStorage();

const audio = createSoundManager({
  manifest: {
    // Les URLs sont optionnelles : si non fournies, les sons sont muets.
    // À renseigner depuis /public/sounds/ quand les assets seront prêts.
    sfx: {},
    music: {},
  },
});

const camera = createCamera({
  host: world,
  useInverse: true,
});

const effects = createEffects({
  camera,
  flashHost: transitionOverlay,
  cameraHost: world,
});

const skybox = createSkybox({
  host: skyboxEl,
  starCount: 140,
  seed: 42,
  showHorizon: true,
});

const fog = createFog({
  host: fogEl,
  density: 0.25,
  radius: 55,
});

const particles = createParticles({
  host: fxLayer,
});

const textPop = createTextPop({
  host: textPopLayer,
});

const transitions = createTransitions({
  host: transitionOverlay,
});

const screens = createScreens({
  host: screensEl,
  audio,
});

// =========================================================================
// INPUT
// =========================================================================

const actionMap = createActionMap({
  keymap: { ...DEFAULT_KEYMAP },
});

const keyboard = createKeyboard({
  actionMap,
});

const touch = isTouchDevice()
  ? createTouch({
      host: viewport,
      actionMap,
    })
  : null;

// =========================================================================
// SCENE MANAGER
// =========================================================================

const sceneManager = createSceneManager({
  root: sceneRoot,
  hud: hudEl,
  screens,
  camera,
  effects,
  skybox,
  fog,
  particles,
  textPop,
  transitions,
  audio,
  input: { keyboard, touch, actionMap },
  storage,
});

// =========================================================================
// BOUCLE PRINCIPALE
// =========================================================================

let lastTime = performance.now();
let running = true;

function loop(now) {
  if (!running) return;
  let dt = now - lastTime;
  lastTime = now;
  if (dt > MAX_FRAME_DT_MS) dt = MAX_FRAME_DT_MS;

  // Ordre de mise à jour :
  // 1) Inputs (poll DAS/ARR)
  // 2) Scène active (logique game)
  // 3) Effets caméra (tilt, punch)
  // 4) Caméra (interpolations, shake)
  // 5) Skybox (sync rotation)
  // 6) Fog (pulse, fade)
  // 7) Particules + text pops
  keyboard.update(dt);
  if (touch) touch.update(dt);
  sceneManager.update(dt);
  effects.update(dt);
  camera.update(dt);
  skybox.syncToCamera(camera.getTransform());
  fog.update(dt);
  particles.update(dt);

  requestAnimationFrame(loop);
}

// =========================================================================
// BOUTON MUTE
// =========================================================================

function refreshMuteBtn() {
  if (!muteBtn) return;
  const muted = audio.isMuted();
  muteBtn.textContent = muted ? '🔇' : '♪';
  muteBtn.classList.toggle('is-muted', muted);
  muteBtn.setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
}

if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    audio.setMuted();
    refreshMuteBtn();
  });
  refreshMuteBtn();
}

// Raccourci M global
actionMap.on('mute', () => {
  audio.setMuted();
  refreshMuteBtn();
});

// =========================================================================
// LIFECYCLE
// =========================================================================

// Pause auto quand l'onglet est caché
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sceneManager.onVisibilityLost();
  } else {
    lastTime = performance.now();
    sceneManager.onVisibilityRegained();
  }
});

// Resize : on relaie au sceneManager si besoin de recalculer quelque chose.
window.addEventListener('resize', () => {
  sceneManager.onResize();
});

// Reduced motion : on informe les systèmes concernés
if (prefersReducedMotion()) {
  document.documentElement.classList.add('reduced-motion');
}

// =========================================================================
// DÉMARRAGE
// =========================================================================

async function start() {
  // Cache le boot-loader progressivement
  if (bootLoader) {
    await new Promise((r) => setTimeout(r, 200));
    bootLoader.classList.add('hidden');
    setTimeout(() => {
      if (bootLoader.parentNode) bootLoader.parentNode.removeChild(bootLoader);
    }, 700);
  }

  // Scène initiale : écran titre
  await sceneManager.switchTo(SCENES.TITLE, { immediate: true });

  // Lance la boucle
  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(loop);
  });
}

start().catch((err) => {
  console.error('[main] Erreur au démarrage :', err);
  if (bootLoader) {
    bootLoader.innerHTML = `
      <div class="boot-loader__text">ERREUR</div>
      <div class="boot-loader__sub">${String(err.message || err)}</div>
    `;
  }
});

// Expose pour debug en dev (DevTools)
if (import.meta.env?.DEV) {
  // eslint-disable-next-line no-undef
  window.__TETRIS64__ = {
    camera, effects, skybox, fog, particles, textPop,
    audio, sceneManager, storage, actionMap,
  };
}