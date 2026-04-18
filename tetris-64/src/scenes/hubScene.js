/**
 * hubScene.js — Scène hub (château/galerie).
 *
 * Charge optionnellement une map JSON générée par /mapcreator/ depuis
 *   /public/maps/hub-default.json
 * Le format est documenté dans hubMap.js (MapData).
 *
 * CONVENTION
 *   Le joueur spawn à l'endroit et avec l'angle définis dans la map
 *   (par défaut z = +400, angle = 180°, regard vers -Z).
 *
 * DEBUG
 *   Pendant la scène hub, la follow camera est exposée sur
 *   `window.__TETRIS64__.hub`. Voir le bas du fichier pour l'API.
 */

import { SCENES, ACTIONS, GAME_MODES } from '../core/constants.js';
import { createHubMap } from '../hub/hubMap.js';
import { createHubPlayer } from '../hub/player.js';
import { createPaintings } from '../hub/paintings.js';
import { createFollowCamera } from '../hub/followCamera.js';
import { el } from '../utils/helpers.js';

/**
 * Chemins où on tente de charger la map, dans l'ordre. Le premier qui
 * répond 200 est utilisé. Ajoute/retire selon ta structure de déploiement.
 */
const MAP_URLS = [
  '/public/maps/hub-default.json',
  './public/maps/hub-default.json',
  'public/maps/hub-default.json',
];

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

    ctx.effects.resetTilt(0);
    ctx.fog.applyPreset('hub');
    ctx.skybox.fade(0.8, 400);

    root = el('div', { class: 'hub-scene' });
    ctx.root.appendChild(root);

    // ---------------------------------------------------------------
    // 1) CHARGEMENT DE LA MAP
    // ---------------------------------------------------------------
    const mapData = await loadMapData();

    // ---------------------------------------------------------------
    // 2) CONSTRUCTION DE LA SALLE
    // ---------------------------------------------------------------
    map = createHubMap({ host: root, mapData });
    const bounds = map.getBounds();

    // ---------------------------------------------------------------
    // 3) JOUEUR (spawn depuis la map)
    // ---------------------------------------------------------------
    const spawnData = mapData?.spawn ?? { x: 0, z: 400, angle: 180 };
    const initialAngleRad = ((spawnData.angle ?? 180) * Math.PI) / 180;

    player = createHubPlayer({
      host: root,
      actionMap: ctx.input.actionMap,
      audio: ctx.audio,
      particles: ctx.particles,
      spawn: { x: spawnData.x ?? 0, y: 0, z: spawnData.z ?? 400 },
      initialAngle: initialAngleRad,
      bounds,
    });

    // ---------------------------------------------------------------
    // 4) TABLEAUX (depuis la map, ou défauts si aucun)
    // ---------------------------------------------------------------
    const paintingDefs = buildPaintingDefs(mapData);
    paintings = createPaintings({
      host: root,
      audio: ctx.audio,
      definitions: paintingDefs,
    });

    // ---------------------------------------------------------------
    // 5) CAMÉRA — followCamera Mario-64 style
    // ---------------------------------------------------------------
    const camBounds = {
      minX: bounds.minX + 60,
      maxX: bounds.maxX - 60,
      minZ: bounds.minZ + 60,
      maxZ: bounds.maxZ - 60,
    };
    follow = createFollowCamera({
      camera: ctx.camera,
      target: player,
      baseDistance: 480,
      baseHeight: -240,
      lookAheadDistance: 120,
      deadzoneRadius: 0,
      lerpPosXZ: 0.22,
      lerpPosY: 0.25,
      lerpRot: 0.25,
      tiltDeg: 18,
      speedDistanceFactor: 0,
      speedHeightFactor: 0,
      maxSpeedExtraDist: 0,
      bounds: camBounds,
      maxYawOffsetDeg: 45,
    });
    follow.enable();

    // ---------------------------------------------------------------
    // 6) PROMPT D'INTERACTION
    // ---------------------------------------------------------------
    interactPromptEl = el(
      'div',
      { class: 'hub__interact-prompt is-hidden' },
      'APPUYEZ SUR ENTRÉE',
    );
    ctx.hud.appendChild(interactPromptEl);
    ctx.hud.classList.remove('hidden');

    ctx.audio.playMusic(ctx.audio.MUSIC.HUB, { fadeInMs: 800 });

    // ---------------------------------------------------------------
    // 7) INPUTS
    // ---------------------------------------------------------------
    unsubs.push(
      ctx.input.actionMap.on(ACTIONS.INTERACT,  (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.START,     (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.HARD_DROP, (e) => { if (e.phase === 'down') tryEnterPainting(); }),
      ctx.input.actionMap.on(ACTIONS.BACK,      (e) => { if (e.phase === 'down') goBackToTitle(); }),
    );

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
  // DEBUG — exposé sur window.__TETRIS64__.hub
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

      // Raccourcis tweaking
      dist: (d) => follow && follow.setBaseDistance(d),
      height: (h) => follow && follow.setBaseHeight(h),
      lookAhead: (d) => follow && follow.setLookAhead(d),
      deadzone: (r) => follow && follow.setDeadzone(r),
      tilt: (deg) => follow && follow.setTilt(deg),
      lerp: (posXZ, posY, rot) => follow && follow.setLerp({ posXZ, posY, rot }),
      speed: (dist, height, max) => follow && follow.setSpeedEffect({
        distFactor: dist, heightFactor: height, maxExtraDist: max,
      }),
      yawLimit: (deg) => follow && follow.setYawLimit && follow.setYawLimit(deg),

      // Téléport du joueur
      tpPlayer: (x, y, z) => player && player.setPosition({ x, y, z }),

      // Status complet
      status: () => ({
        camera: follow?.getStatus(),
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

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tente de charger le JSON de map depuis plusieurs chemins candidats.
 * Retourne null si aucun ne répond : on bascule sur la salle par défaut.
 *
 * @returns {Promise<import('../hub/hubMap.js').MapData | null>}
 */
async function loadMapData() {
  if (typeof fetch === 'undefined') return null;
  for (const url of MAP_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') return data;
      }
    } catch (_) {
      /* on essaie le suivant */
    }
  }
  return null;
}

/**
 * Construit la liste de tableaux pour createPaintings() depuis la mapData.
 * Si la map n'a aucun tableau, on retourne les 3 tableaux par défaut.
 *
 * @param {import('../hub/hubMap.js').MapData | null} mapData
 */
function buildPaintingDefs(mapData) {
  const raw = mapData?.paintings;
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultPaintingDefs();
  }
  return raw.map((p) => ({
    id: String(p.id ?? 'painting'),
    label: String(p.label ?? p.id ?? 'MODE'),
    mode: String(p.mode ?? GAME_MODES.MARATHON),
    position: { x: p.x ?? 0, y: p.y ?? -280, z: p.z ?? 0 },
    rotation: p.rotationY ?? 0,
  }));
}

function defaultPaintingDefs() {
  return [
    { id: 'marathon', label: 'MARATHON',   mode: GAME_MODES.MARATHON,   position: { x: -400, y: -280, z: -950 }, rotation: 0 },
    { id: 'sprint40', label: 'SPRINT 40L', mode: GAME_MODES.SPRINT_40L, position: { x:    0, y: -280, z: -950 }, rotation: 0 },
    { id: 'zen',      label: 'ZEN',        mode: GAME_MODES.ZEN,        position: { x:  400, y: -280, z: -950 }, rotation: 0 },
  ];
}