/**
 * hubScene.js — Scène hub (château/galerie).
 *
 * Espace 3D central façon Mario 64 :
 *  - Une grande salle avec sol tapissé, murs, plafond, ambiance pastel.
 *  - 3 tableaux ("paintings") accrochés au mur, correspondant aux 3 modes
 *    de jeu : MARATHON, SPRINT 40L, ZEN. Marcher devant un tableau et
 *    appuyer sur INTERACT lance le mode correspondant.
 *  - Un personnage que le joueur déplace au clavier/tactile.
 *  - Une caméra qui suit le joueur (follow camera).
 *  - Deux portes / sorties supplémentaires optionnelles (scores, réglages).
 *
 * Cette scène utilise les modules dédiés du dossier /hub :
 *   - hubMap.js       → construit le sol + murs + décors
 *   - player.js       → personnage + input/déplacement
 *   - paintings.js    → tableaux interactifs + détection de proximité
 *   - followCamera.js → caméra qui suit le joueur
 *
 * Si ces modules ne sont pas disponibles / le dev ne veut pas du hub,
 * la scène peut simplement passer directement au menu — mais ici on
 * implémente la version complète.
 */

import { SCENES, ACTIONS, GAME_MODES } from '../core/constants.js';
import { createHubMap } from '../hub/hubMap.js';
import { createHubPlayer } from '../hub/player.js';
import { createPaintings } from '../hub/paintings.js';
import { createFollowCamera } from '../hub/followCamera.js';
import { runSequence, SEQUENCE_HUB_ENTER } from '../camera/presets.js';
import { el } from '../utils/helpers.js';

/**
 * @returns {import('./sceneManager.js').Scene}
 */
export function createHubScene() {
  /** @type {import('./sceneManager.js').SceneContext | null} */
  let ctx = null;
  /** @type {HTMLElement | null} */
  let root = null;

  /** @type {ReturnType<typeof createHubMap> | null} */
  let map = null;
  /** @type {ReturnType<typeof createHubPlayer> | null} */
  let player = null;
  /** @type {ReturnType<typeof createPaintings> | null} */
  let paintings = null;
  /** @type {ReturnType<typeof createFollowCamera> | null} */
  let follow = null;

  /** @type {Array<() => void>} */
  let unsubs = [];
  let interactPromptEl = null;
  let currentPaintingId = null;
  let entering = false;

  /**
   * @param {import('./sceneManager.js').SceneContext} context
   */
  async function mount(context) {
    ctx = context;
    ctx.input.actionMap.pushContext('hub');

    // Ambiance
    ctx.fog.applyPreset('hub');
    ctx.skybox.fade(0.8, 400);
    ctx.camera.set('HUB_INTRO');

    // Construction DOM
    root = el('div', { class: 'hub-scene' });
    ctx.root.appendChild(root);

    map = createHubMap({ host: root });
    player = createHubPlayer({
      host: root,
      actionMap: ctx.input.actionMap,
      audio: ctx.audio,
      particles: ctx.particles,
      spawn: { x: 0, y: 0, z: 400 },
      bounds: map.getBounds(),
    });
    paintings = createPaintings({
      host: root,
      audio: ctx.audio,
      definitions: [
        { id: 'marathon',  label: 'MARATHON',  mode: GAME_MODES.MARATHON,   position: { x: -400, y: -280, z: -800 } },
        { id: 'sprint40',  label: 'SPRINT 40L', mode: GAME_MODES.SPRINT_40L, position: { x:    0, y: -280, z: -900 } },
        { id: 'zen',       label: 'ZEN',       mode: GAME_MODES.ZEN,         position: { x:  400, y: -280, z: -800 } },
      ],
    });
    follow = createFollowCamera({
      camera: ctx.camera,
      target: player,
      offset: { x: 0, y: -120, z: 350 },
      lerp: 0.08,
      lookAheadFactor: 0.4,
    });

    // Prompt "APPUYEZ SUR ENTRÉE" contextuel
    interactPromptEl = el('div', {
      class: 'hub__interact-prompt is-hidden',
    }, 'APPUYEZ SUR ENTRÉE');
    // Le prompt est en UI 2D, on le glisse dans le HUD overlay
    ctx.hud.appendChild(interactPromptEl);
    ctx.hud.classList.remove('hidden');

    // Musique
    ctx.audio.playMusic(ctx.audio.MUSIC.HUB, { fadeInMs: 800 });

    // Interactions
    unsubs.push(
      ctx.input.actionMap.on(ACTIONS.INTERACT, (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.START, (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.BACK, (e) => { if (e.phase === 'down') goBackToTitle(); }),
    );

    // Séquence caméra d'intro
    runSequence(ctx.camera, SEQUENCE_HUB_ENTER).then(() => {
      // À la fin, la follow camera prend le relais
      if (follow) follow.enable();
    });
  }

  /**
   * @param {number} dt
   */
  function update(dt) {
    if (!ctx) return;
    if (player) player.update(dt);
    if (paintings && player) {
      const p = player.getPosition();
      const nearby = paintings.getNearest(p, 180);
      if (nearby) {
        if (currentPaintingId !== nearby.id) {
          currentPaintingId = nearby.id;
          paintings.highlight(nearby.id);
          showInteractPrompt(`ENTRER DANS : ${nearby.label}`);
        }
      } else if (currentPaintingId) {
        paintings.highlight(null);
        currentPaintingId = null;
        hideInteractPrompt();
      }
    }
    if (follow) follow.update(dt);
  }

  function tryEnterPainting() {
    if (!ctx || !paintings || entering) return;
    if (!currentPaintingId) return;
    const painting = paintings.get(currentPaintingId);
    if (!painting) return;
    entering = true;
    ctx.audio.playSfx(ctx.audio.SFX.HUB_DOOR);

    // Effet "zoom dans le tableau" : caméra accélère vers le painting, flash
    ctx.effects.flash('rgba(255,255,255,0.75)', 220);
    ctx.camera.moveTo({
      x: painting.position.x,
      y: painting.position.y + 30,
      z: painting.position.z + 200,
      rx: -4, ry: 0, rz: 0,
    }, 700, 'easeIn', async () => {
      if (!ctx) return;
      await ctx.switchTo(SCENES.GAME, {
        transition: 'flash',
        params: { mode: painting.mode },
      });
    });
  }

  async function goBackToTitle() {
    if (!ctx || entering) return;
    entering = true;
    await ctx.switchTo(SCENES.TITLE, { transition: 'fade' });
  }

  function showInteractPrompt(text) {
    if (!interactPromptEl) return;
    interactPromptEl.textContent = text;
    interactPromptEl.classList.remove('is-hidden');
  }
  function hideInteractPrompt() {
    if (!interactPromptEl) return;
    interactPromptEl.classList.add('is-hidden');
  }

  function destroy() {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (paintings) paintings.destroy();
    if (player) player.destroy();
    if (map) map.destroy();
    if (follow) follow.destroy();
    paintings = null; player = null; map = null; follow = null;
    if (interactPromptEl && interactPromptEl.parentNode) {
      interactPromptEl.parentNode.removeChild(interactPromptEl);
    }
    interactPromptEl = null;
    currentPaintingId = null;
    entering = false;
    if (ctx) {
      ctx.input.actionMap.popContext();
      ctx.audio.stopMusic(400);
      ctx.hud.classList.add('hidden');
    }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    ctx = null;
  }

  function onPause() {
    if (ctx) ctx.audio.stopMusic(200);
  }
  function onResume() {
    if (ctx) ctx.audio.playMusic(ctx.audio.MUSIC.HUB, { fadeInMs: 400, restart: false });
  }

  return Object.freeze({ mount, update, destroy, onPause, onResume });
}