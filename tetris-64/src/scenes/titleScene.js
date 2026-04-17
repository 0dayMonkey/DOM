/**
 * titleScene.js — Écran titre.
 *
 * Le titre est notre "cold open" Nintendo 64 : le logo TETRIS 64 flotte
 * lentement dans un ciel violet/orange, quelques cubes Tetris orbitent
 * autour, et un prompt clignote pour inviter à appuyer sur START.
 *
 * Sur interact/START, on enchaîne sur la scène HUB (si tu veux la version
 * complète à la Mario 64) ou directement sur le main menu.
 *
 * Pour limiter la complexité, titleScene gère elle-même :
 *   - son layout 3D (logo + cubes d'ambiance)
 *   - la caméra (preset TITLE_ORBIT → TITLE_CLOSE)
 *   - son fond (skybox + fog preset 'title')
 *   - ses inputs (INTERACT / START → mainMenu)
 *
 * Elle ne gère pas :
 *   - le mute (géré globalement dans main.js)
 *   - la musique (juste un playMusic au mount)
 */

import { ACTIONS, SCENES } from '../core/constants.js';
import { createPieceRenderer } from '../render/pieceRenderer.js';
import { runSequence, SEQUENCE_TITLE_INTRO } from '../camera/presets.js';
import { el, delay } from '../utils/helpers.js';

/**
 * Crée une scène titre. L'objet retourné respecte le contrat sceneManager.
 */
export function createTitleScene() {
  /** @type {import('./sceneManager.js').SceneContext | null} */
  let ctx = null;
  /** @type {HTMLElement | null} */
  let root = null;
  /** @type {HTMLElement[]} */
  let orbitCubes = [];
  /** @type {number} */
  let t = 0;
  /** @type {Array<() => void>} */
  let unsubs = [];
  /** @type {any} */
  let menuHandle = null;
  let menuOpen = false;

  /**
   * @param {import('./sceneManager.js').SceneContext} context
   */
  async function mount(context) {
    ctx = context;
    ctx.input.actionMap.pushContext('title');

    // Ambiance globale
    ctx.skybox.fade(1, 300);
    ctx.fog.applyPreset('title');
    ctx.camera.set('TITLE_WIDE');

    // Layout 3D
    root = buildRoot();
    ctx.root.appendChild(root);

    // Cubes d'ambiance
    orbitCubes = spawnOrbitCubes(root);

    // Musique
    ctx.audio.playMusic(ctx.audio.MUSIC.TITLE, { fadeInMs: 700 });

    // Inputs : tout press = ouvrir le menu
    unsubs.push(
      ctx.input.actionMap.on(ACTIONS.INTERACT, (e) => { if (e.phase === 'down') openMenu(); }),
      ctx.input.actionMap.on(ACTIONS.START, (e) => { if (e.phase === 'down') openMenu(); }),
      ctx.input.actionMap.on(ACTIONS.HARD_DROP, (e) => { if (e.phase === 'down') openMenu(); }),
    );

    // Caméra intro : zoom arrière doux vers close-up
    runSequence(ctx.camera, SEQUENCE_TITLE_INTRO);

    // Prompt "PRESS START" clignote après 1s
    await delay(1200);
    const prompt = root.querySelector('.title__prompt');
    if (prompt) prompt.classList.add('is-visible');
  }

  /**
   * Construit la racine DOM 3D : logo + prompt + conteneur pour cubes.
   */
  function buildRoot() {
    const r = el('div', { class: 'title-scene' });

    // Logo
    const logoWrap = el('div', { class: 'title__logo-wrap' });
    const logo = el('h1', { class: 'title__logo' }, 'TETRIS 64');
    const sub = el('div', { class: 'title__subtitle' }, 'UN JEU N64 DE 1996');
    logoWrap.appendChild(logo);
    logoWrap.appendChild(sub);

    // Prompt
    const prompt = el('div', { class: 'title__prompt' }, 'APPUYEZ SUR ENTRÉE');

    // Conteneur cubes
    const cubesWrap = el('div', { class: 'title__cubes' });

    // Crédits discrets
    const credits = el('div', { class: 'title__credits' }, '© 2024 — HTML · CSS · JS');

    r.appendChild(cubesWrap);
    r.appendChild(logoWrap);
    r.appendChild(prompt);
    r.appendChild(credits);

    return r;
  }

  /**
   * Spawn une dizaine de tétrominos qui tournent lentement autour du logo.
   * @param {HTMLElement} rootEl
   */
  function spawnOrbitCubes(rootEl) {
    const host = /** @type {HTMLElement} */ (rootEl.querySelector('.title__cubes'));
    const piecer = createPieceRenderer();
    const types = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const items = [];
    const count = 9;
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      const slot = el('div', { class: 'title__cube-slot' });
      slot.dataset.angle = String((i / count) * Math.PI * 2);
      slot.dataset.radius = String(280 + (i % 3) * 60);
      slot.dataset.speed = String(0.18 + (i % 3) * 0.08);
      slot.dataset.height = String(-60 + (i % 4) * 40);
      piecer.renderPieceCentered(type, 0, slot, {
        mode: 'full',
        containerSize: 72,
        cubeSize: 16,
      });
      host.appendChild(slot);
      items.push(slot);
    }
    return items;
  }

  /**
   * Ouvre le main menu (mais reste dans la scène title : le menu flotte
   * au-dessus et on ne change pas de scène tant qu'un choix n'est pas fait).
   */
  function openMenu() {
    if (!ctx || menuOpen) return;
    menuOpen = true;
    ctx.audio.playSfx(ctx.audio.SFX.MENU_SELECT);

    menuHandle = ctx.screens.openMainMenu({ actionMap: ctx.input.actionMap });
    menuHandle.on('select', (choice) => {
      const label = String(choice.label || '').toUpperCase();
      if (label.includes('MARATHON')) {
        startGame('marathon');
      } else if (label.includes('SPRINT')) {
        startGame('sprint40');
      } else if (label.includes('ZEN')) {
        startGame('zen');
      } else if (label.includes('SCORE')) {
        const sc = ctx.screens.openHighScores({
          actionMap: ctx.input.actionMap,
          storage: ctx.storage,
        });
        sc.on('back', () => sc.close());
      } else if (label.includes('RÉGLAGES') || label.includes('REGLAGES')) {
        const st = ctx.screens.openSettings({
          actionMap: ctx.input.actionMap,
          storage: ctx.storage,
        });
        st.on('back', () => st.close());
      }
    });
    menuHandle.on('back', () => {
      menuHandle.close();
      menuOpen = false;
    });
  }

  /**
   * Lance une partie : transition flash → switch vers game scene avec le mode.
   * @param {string} mode
   */
  async function startGame(mode) {
    if (!ctx) return;
    if (menuHandle) { menuHandle.close(); menuHandle = null; }
    menuOpen = false;
    ctx.audio.playSfx(ctx.audio.SFX.MENU_SELECT);
    await ctx.switchTo(SCENES.GAME, { transition: 'iris', params: { mode } });
  }

  /**
   * @param {number} dt
   */
  function update(dt) {
    t += dt / 1000;
    // Orbite des cubes autour du logo
    for (let i = 0; i < orbitCubes.length; i++) {
      const s = orbitCubes[i];
      const a0 = parseFloat(s.dataset.angle || '0');
      const speed = parseFloat(s.dataset.speed || '0.2');
      const radius = parseFloat(s.dataset.radius || '280');
      const h = parseFloat(s.dataset.height || '0');
      const a = a0 + t * speed;
      const x = Math.cos(a) * radius;
      const y = h + Math.sin(t * 0.8 + i) * 10;
      const z = Math.sin(a) * radius;
      const ry = (a * 180) / Math.PI;
      s.style.transform =
        `translate3d(${x}px, ${y}px, ${z}px) rotateY(${ry}deg) rotateX(${Math.sin(t + i) * 8}deg)`;
    }
  }

  function destroy() {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (menuHandle) try { menuHandle.close(); } catch (_) {}
    menuHandle = null;
    menuOpen = false;
    if (ctx) ctx.input.actionMap.popContext();
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    orbitCubes = [];
    if (ctx) ctx.audio.stopMusic(500);
    ctx = null;
  }

  function onPause() {
    if (ctx) ctx.audio.stopMusic(200);
  }
  function onResume() {
    if (ctx) ctx.audio.playMusic(ctx.audio.MUSIC.TITLE, { fadeInMs: 400, restart: false });
  }

  return Object.freeze({ mount, update, destroy, onPause, onResume });
}