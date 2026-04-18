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
 * CAMÉRA
 *   Cette scène utilise la nouvelle caméra troisième personne fixe
 *   (src/hub/thirdPersonCamera.js). La caméra reste toujours derrière
 *   le joueur, suit automatiquement sa position et sa rotation, et
 *   n'est pas contrôlable par le joueur (pas de souris, pas de joystick).
 *
 * DEBUG
 *   Pendant la scène hub, la caméra est exposée sur
 *   `window.__TETRIS64__.hub`. Voir le bas du fichier pour l'API.
 */

import { SCENES, ACTIONS, GAME_MODES } from '../core/constants.js';
import { createHubMap } from '../hub/hubMap.js';
import { createHubPlayer } from '../hub/player.js';
import { createPaintings } from '../hub/paintings.js';
import { createThirdPersonCamera } from '../hub/thirdPersonCamera.js';
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
  /** @type {ReturnType<typeof createThirdPersonCamera> | null} */
  let camera = null;

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
    // 5) CAMÉRA TROISIÈME PERSONNE (fixe derrière le joueur)
    // ---------------------------------------------------------------
    camera = createThirdPersonCamera({
      camera: ctx.camera,
      target: player,
      distance: 420,
      height: -220,
      tiltDeg: 16,
      lerpPos: 0.12,
      lerpRot: 0.10,
    });
    camera.enable();
    // Placement instantané pour éviter un glissement à l'entrée
    camera.snapToTarget();

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
    if (camera) camera.update(dt);
  }

  function tryEnterPainting() {
    if (!ctx || !paintings || entering) return;
    if (!currentPaintingId) return;
    const painting = paintings.get(currentPaintingId);
    if (!painting) return;
    entering = true;

    ctx.audio.playSfx(ctx.audio.SFX.HUB_DOOR);
    if (camera) camera.disable();

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
    if (camera) camera.disable();
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
      camera,
      player,
      paintings,
      map,

      // Raccourcis tweaking caméra
      dist:   (d)   => camera && camera.setDistance(d),
      height: (h)   => camera && camera.setHeight(h),
      tilt:   (deg) => camera && camera.setTilt(deg),
      lerp:   (pos, rot) => camera && camera.setLerp({ pos, rot }),

      // Téléport du joueur
      tpPlayer: (x, y, z) => player && player.setPosition({ x, y, z }),

      // Status complet
      status: () => ({
        camera: camera?.getStatus(),
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
    if (camera) camera.destroy();
    paintings = null; player = null; map = null; camera = null;
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
 * Charge la map : priorité à localStorage (éditée par /mapcreator/),
 * puis fetch du fichier JSON statique, puis null (→ défauts).
 *
 * @returns {Promise<import('../hub/hubMap.js').MapData | null>}
 */
async function loadMapData() {
  // 1) localStorage (source live depuis l'éditeur)
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('tetris64.hubMap');
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          console.log('[hubScene] Map chargée depuis localStorage');
          return data;
        }
      }
    } catch (_) { /* ignore, on essaie le fetch */ }
  }

  // 2) Fallback : fichier JSON statique
  if (typeof fetch === 'undefined') return null;
  for (const url of MAP_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          console.log('[hubScene] Map chargée depuis', url);
          return data;
        }
      }
    } catch (_) { /* on essaie le suivant */ }
  }

  console.log('[hubScene] Aucune map trouvée, utilisation des défauts');
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