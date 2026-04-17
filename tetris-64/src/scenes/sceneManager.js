/**
 * sceneManager.js — Orchestre les scènes (title, hub, game, gameover).
 *
 * Responsabilités :
 *  - Charger / décharger les scènes avec transitions.
 *  - Maintenir un registre des scènes actives et précédente.
 *  - Relayer update() à la scène courante chaque frame.
 *  - Exposer un bus d'événements simple pour passer du contexte entre scènes
 *    (ex : hub → game avec choix de mode).
 *  - Gérer les événements globaux : visibility, resize, pause.
 *
 * Chaque scène suit un contrat minimal :
 *   { mount(ctx, params), update(dt), destroy(), onPause(), onResume() }
 *
 * Le sceneManager ne connaît pas le détail des scènes : il leur passe un
 * "context" partagé (camera, audio, fx, input, etc.) et les laisse faire.
 */

import { createTitleScene } from './titleScene.js';
import { createHubScene } from './hubScene.js';
import { createGameScene } from './gameScene.js';
import { SCENES } from '../core/constants.js';
import { createEventBus } from '../utils/helpers.js';

/**
 * @typedef {Object} SceneContext
 * @property {HTMLElement} root
 * @property {HTMLElement} hud
 * @property {ReturnType<import('../ui/screens.js').createScreens>} screens
 * @property {ReturnType<import('../camera/camera.js').createCamera>} camera
 * @property {ReturnType<import('../camera/effects.js').createEffects>} effects
 * @property {ReturnType<import('../fx/skybox.js').createSkybox>} skybox
 * @property {ReturnType<import('../fx/fog.js').createFog>} fog
 * @property {ReturnType<import('../fx/particles.js').createParticles>} particles
 * @property {ReturnType<import('../fx/textPop.js').createTextPop>} textPop
 * @property {ReturnType<import('./transitions.js').createTransitions>} transitions
 * @property {ReturnType<import('../audio/soundManager.js').createSoundManager>} audio
 * @property {Object} input
 * @property {Object} storage
 * @property {Object} bus
 * @property {(name:string, params?:any)=>Promise<void>} switchTo
 */

/**
 * @typedef {Object} Scene
 * @property {(ctx: SceneContext, params?: any) => void | Promise<void>} mount
 * @property {(dt: number) => void} update
 * @property {() => void} destroy
 * @property {() => void} [onPause]
 * @property {() => void} [onResume]
 * @property {() => void} [onResize]
 */

/**
 * @param {Object} deps
 */
export function createSceneManager(deps) {
  const bus = createEventBus();

  /** @type {Scene | null} */
  let current = null;
  /** @type {string | null} */
  let currentName = null;
  /** @type {string | null} */
  let previousName = null;
  let switching = false;
  let paused = false;

  // Factory registry : nom → function () => Scene
  const factories = {
    [SCENES.TITLE]: createTitleScene,
    [SCENES.HUB]: createHubScene,
    [SCENES.GAME]: createGameScene,
  };

  /** @type {SceneContext} */
  const context = {
    root: deps.root,
    hud: deps.hud,
    screens: deps.screens,
    camera: deps.camera,
    effects: deps.effects,
    skybox: deps.skybox,
    fog: deps.fog,
    particles: deps.particles,
    textPop: deps.textPop,
    transitions: deps.transitions,
    audio: deps.audio,
    input: deps.input,
    storage: deps.storage,
    bus,
    switchTo,
  };

  /**
   * Change de scène.
   * @param {string} name
   * @param {Object} [options]
   * @param {boolean} [options.immediate=false]
   * @param {string} [options.transition='fade']  - 'fade' | 'iris' | 'flash'
   * @param {any} [options.params]
   */
  async function switchTo(name, options = {}) {
    if (switching) {
      console.warn(`[sceneManager] switch en cours, ignoré : ${name}`);
      return;
    }
    const factory = factories[name];
    if (!factory) {
      console.error(`[sceneManager] scène inconnue : ${name}`);
      return;
    }
    switching = true;

    const immediate = options.immediate === true;
    const transitionKind = options.transition ?? 'fade';
    const params = options.params;

    try {
      // Transition out
      if (!immediate && current) {
        await deps.transitions.out(transitionKind);
      }

      // Destroy current
      if (current) {
        try { current.destroy(); } catch (e) { console.error(e); }
      }
      // Clean root & hud
      deps.root.innerHTML = '';
      if (deps.hud) deps.hud.innerHTML = '';
      deps.screens.clearAll();
      deps.particles.clear();
      deps.textPop.clear();

      previousName = currentName;
      currentName = name;
      current = factory();

      // Mount
      await Promise.resolve(current.mount(context, params));

      // Transition in
      if (!immediate) {
        await deps.transitions.in(transitionKind);
      } else {
        deps.transitions.reset();
      }

      bus.emit('sceneChanged', { name, previous: previousName });
    } finally {
      switching = false;
    }
  }

  /**
   * Appelée chaque frame par la boucle principale.
   * @param {number} dt
   */
  function update(dt) {
    if (!current || paused) return;
    try {
      current.update(dt);
    } catch (e) {
      console.error('[sceneManager] erreur update scène :', e);
    }
  }

  function onVisibilityLost() {
    paused = true;
    if (current && current.onPause) current.onPause();
  }

  function onVisibilityRegained() {
    paused = false;
    if (current && current.onResume) current.onResume();
  }

  function onResize() {
    if (current && current.onResize) current.onResize();
  }

  function getCurrentName() {
    return currentName;
  }

  function getPreviousName() {
    return previousName;
  }

  return Object.freeze({
    switchTo,
    update,
    onVisibilityLost,
    onVisibilityRegained,
    onResize,
    getCurrentName,
    getPreviousName,
    on: bus.on,
    emit: bus.emit,
  });
}