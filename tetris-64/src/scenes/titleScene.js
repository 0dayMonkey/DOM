/**
 * titleScene.js — Écran titre.
 *
 * Le titre est notre "cold open" Nintendo 64 : le logo TETRIS 64 flotte
 * lentement dans un ciel violet/orange, quelques cubes Tetris orbitent
 * autour, et un prompt clignote pour inviter à appuyer sur ENTRÉE.
 *
 * Sur interact/START, on enchaîne directement sur la scène HUB (Mario 64
 * style) : le joueur choisira son mode via les tableaux interactifs du
 * hub. L'ancien main menu flottant reste disponible dans screens.js pour
 * un usage futur mais n'est plus utilisé ici.
 *
 * Pour limiter la complexité, titleScene gère elle-même :
 *   - son layout 3D (logo + cubes d'ambiance)
 *   - la caméra (preset TITLE_ORBIT → TITLE_CLOSE)
 *   - son fond (skybox + fog preset 'title')
 *   - ses inputs (INTERACT / START → hub)
 *
 * Elle ne gère pas :
 *   - le mute (géré globalement dans main.js)
 *   - la musique (juste un playMusic au mount)
 *
 * TRANSITION VERS LE HUB :
 *   On utilise la transition signature 'tetris' — une cascade de blocs
 *   tétrominos qui recouvre l'écran puis disparaît en line clear,
 *   révélant le hub. Cohérent avec l'ADN du jeu.
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
  // Garde-fou anti double-trigger pendant la transition vers le hub.
  let entering = false;

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

    // Inputs : tout press = aller au hub
    unsubs.push(
      ctx.input.actionMap.on(ACTIONS.INTERACT, (e) => { if (e.phase === 'down') goToHub(); }),
      ctx.input.actionMap.on(ACTIONS.START, (e) => { if (e.phase === 'down') goToHub(); }),
      ctx.input.actionMap.on(ACTIONS.HARD_DROP, (e) => { if (e.phase === 'down') goToHub(); }),
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
   * Transition vers le hub. Remplace l'ancien openMenu() : appuyer sur
   * Entrée sur l'écran titre emmène directement le joueur dans le hub
   * Mario 64-style où il choisira un mode via les tableaux. Un drapeau
   * empêche les double-déclenchements si on martèle Entrée pendant la
   * transition.
   *
   * On utilise la transition 'tetris' — signature du jeu (cascade de
   * tétrominos puis line clear).
   */
  async function goToHub() {
    if (!ctx || entering) return;
    entering = true;
    ctx.audio.playSfx(ctx.audio.SFX.MENU_SELECT);
    await ctx.switchTo(SCENES.HUB, { transition: 'tetris' });
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
    entering = false;
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