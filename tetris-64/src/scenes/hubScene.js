/**
 * hubScene.js — Scène hub (château/galerie).
 *
 * Espace 3D central façon Mario 64 :
 *  - Salle avec sol, tapis, murs, plafond, ambiance pastel.
 *  - 3 tableaux sur le mur arrière : MARATHON, SPRINT 40L, ZEN.
 *  - Un personnage déplaçable au clavier.
 *  - Une caméra tierce personne qui suit le joueur.
 *
 * CONVENTION
 *   Le joueur spawn à z = +400 et regarde vers -Z (vers le mur arrière
 *   où sont les tableaux). Le player a donc angle = π au spawn.
 *   Les tableaux sont placés au fond (z ≈ -950) SANS ROTATION :
 *   leur face naturelle pointe vers +Z, donc face au joueur qui vient de +Z.
 *
 * DEBUG
 *   Pendant la scène hub, la follow camera est exposée sur
 *   `window.__TETRIS64__.hub` pour permettre de la tweaker en live depuis
 *   la console. Voir le bas du fichier pour l'API.
 */

import { SCENES, ACTIONS, GAME_MODES } from '../core/constants.js';
import { createHubMap } from '../hub/hubMap.js';
import { createHubPlayer } from '../hub/player.js';
import { createPaintings } from '../hub/paintings.js';
import { createFollowCamera } from '../hub/followCamera.js';
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
  /** @type {HTMLElement | null} */
  let interactPromptEl = null;
  /** @type {string | null} */
  let currentPaintingId = null;
  let entering = false;

  /**
   * @param {import('./sceneManager.js').SceneContext} context
   */
  async function mount(context) {
    ctx = context;
    ctx.input.actionMap.pushContext('hub');

    // Ambiance
    ctx.effects.resetTilt(0);
    ctx.fog.applyPreset('hub');
    ctx.skybox.fade(0.8, 400);

    // Construction DOM
    root = el('div', { class: 'hub-scene' });
    ctx.root.appendChild(root);

    // La salle
    map = createHubMap({ host: root });
    const bounds = map.getBounds();

    // Le personnage — spawn au centre-avant, regardant vers le fond (angle=π).
    player = createHubPlayer({
      host: root,
      actionMap: ctx.input.actionMap,
      audio: ctx.audio,
      particles: ctx.particles,
      spawn: { x: 0, y: 0, z: 400 },
      bounds,
    });

    // Les tableaux — au fond, face au joueur (pas de rotation).
    paintings = createPaintings({
      host: root,
      audio: ctx.audio,
      definitions: [
        { id: 'marathon', label: 'MARATHON',   mode: GAME_MODES.MARATHON,   position: { x: -400, y: -280, z: -950 } },
        { id: 'sprint40', label: 'SPRINT 40L', mode: GAME_MODES.SPRINT_40L, position: { x:    0, y: -280, z: -950 } },
        { id: 'zen',      label: 'ZEN',        mode: GAME_MODES.ZEN,        position: { x:  400, y: -280, z: -950 } },
      ],
    });

    // Caméra tierce personne — LERPS SÉPARÉS
    // - lerpPos (0.18) : lissage doux de la position
    // - lerpRot (0.35) : lissage agressif de l'angle, pour rester dans le dos
    follow = createFollowCamera({
      camera: ctx.camera,
      target: player,
      offset: { x: 0, y: -240, z: 480 },
      lerpPos: 0.18,
      lerpRot: 0.35,
      tiltDeg: 20,
    });

    follow.snapToTarget();
    follow.enable();

    // Prompt "APPUYEZ SUR ENTRÉE" contextuel
    interactPromptEl = el(
      'div',
      { class: 'hub__interact-prompt is-hidden' },
      'APPUYEZ SUR ENTRÉE',
    );
    ctx.hud.appendChild(interactPromptEl);
    ctx.hud.classList.remove('hidden');

    ctx.audio.playMusic(ctx.audio.MUSIC.HUB, { fadeInMs: 800 });

    // Interactions
    unsubs.push(
      ctx.input.actionMap.on(ACTIONS.INTERACT,  (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.START,     (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.HARD_DROP, (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.BACK,      (e) => { if (e.phase === 'down') goBackToTitle(); }),
    );

    // Expose pour le debug console
    exposeDebug();
  }

  /**
   * @param {number} dt
   */
  function update(dt) {
    if (!ctx) return;
    if (player) player.update(dt);

    if (paintings && player) {
      const p = player.getPosition();
      const nearby = paintings.getNearest({ x: p.x, z: p.z }, 280);
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

    if (paintings) paintings.update(dt);
    if (follow) follow.update(dt);
  }

  function tryEnterPainting() {
    if (!ctx || !paintings || entering) return;
    if (!currentPaintingId) return;
    const painting = paintings.get(currentPaintingId);
    if (!painting) return;
    entering = true;

    ctx.audio.playSfx(ctx.audio.SFX.HUB_DOOR);
    if (follow) follow.disable();

    ctx.effects.flash('rgba(255,255,255,0.75)', 220);
    ctx.camera.moveTo(
      {
        x: painting.position.x,
        y: painting.position.y + 30,
        z: painting.position.z + 200,
        rx: -4, ry: 0, rz: 0,
      },
      700,
      'easeIn',
      async () => {
        if (!ctx) return;
        await ctx.switchTo(SCENES.GAME, {
          transition: 'flash',
          params: { mode: painting.mode },
        });
      },
    );
  }

  async function goBackToTitle() {
    if (!ctx || entering) return;
    entering = true;
    if (follow) follow.disable();
    await ctx.switchTo(SCENES.TITLE, { transition: 'fade' });
  }

  /**
   * @param {string} text
   */
  function showInteractPrompt(text) {
    if (!interactPromptEl) return;
    interactPromptEl.textContent = text;
    interactPromptEl.classList.remove('is-hidden');
  }

  function hideInteractPrompt() {
    if (!interactPromptEl) return;
    interactPromptEl.classList.add('is-hidden');
  }

  // ---------------------------------------------------------------------
  // DEBUG — expose les objets de la scène sur window pour tweaking live
  // ---------------------------------------------------------------------

  function exposeDebug() {
    if (typeof window === 'undefined') return;
    const w = /** @type {any} */ (window);
    w.__TETRIS64__ = w.__TETRIS64__ || {};
    w.__TETRIS64__.hub = {
      follow,
      player,
      paintings,
      map,
      // Helpers raccourcis
      camPos: (y, z) => follow && follow.setOffset({ y, z }),
      camTilt: (deg) => follow && follow.setTilt(deg),
      camLerp: (pos, rot) => follow && follow.setLerp({ pos, rot }),
      tpPlayer: (x, y, z) => player && player.setPosition({ x, y, z }),
      status: () => ({
        offset: follow?.getOffset(),
        tilt:   follow?.getTilt(),
        lerp:   follow?.getLerp(),
        player: player?.getPosition(),
        angle:  player?.getAngle(),
      }),
    };
  }

  function clearDebug() {
    if (typeof window === 'undefined') return;
    const w = /** @type {any} */ (window);
    if (w.__TETRIS64__) delete w.__TETRIS64__.hub;
  }

  function destroy() {
    unsubs.forEach((u) => { try { u(); } catch (_) {} });
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
    clearDebug();
    if (ctx) {
      ctx.input.actionMap.popContext();
      ctx.audio.stopMusic(400);
      ctx.hud.classList.add('hidden');
      ctx.camera.setOffset({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
    }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    ctx = null;
  }

  function onPause()  { if (ctx) ctx.audio.stopMusic(200); }
  function onResume() { if (ctx) ctx.audio.playMusic(ctx.audio.MUSIC.HUB, { fadeInMs: 400, restart: false }); }

  return Object.freeze({ mount, update, destroy, onPause, onResume });
}