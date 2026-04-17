/**
 * paintings.js — Tableaux interactifs du hub (style Mario 64).
 *
 * Chaque painting est un panneau 3D accroché au mur, qui affiche :
 *   - un cadre doré
 *   - un titre (nom du mode)
 *   - une mini-preview animée (quelques cubes Tetris qui tournent doucement)
 *
 * Quand le joueur approche d'un painting, celui-ci se met à "pulser" et
 * devient cliquable via INTERACT. Le sceneManager observe cet état via
 * getNearest() et lance le mode associé.
 *
 * Ce module ne gère PAS :
 *   - le déclenchement réel du changement de scène (c'est hubScene.js)
 *   - le mouvement du joueur (c'est player.js)
 *   - la caméra d'entrée (c'est gérée par hubScene.js + camera.js)
 *
 * Il expose seulement :
 *   - get(id)       : retourne un painting par id
 *   - getAll()      : tous
 *   - getNearest(pos, radius) : le painting le plus proche dans un rayon
 *   - highlight(id) : met en surbrillance un painting (null = aucun)
 *   - destroy()     : cleanup
 */

import { el } from '../utils/helpers.js';
import { createPieceRenderer } from '../render/pieceRenderer.js';

/**
 * @typedef {Object} PaintingDef
 * @property {string} id
 * @property {string} label          - titre affiché
 * @property {string} mode           - GAME_MODES.*
 * @property {{x:number, y:number, z:number}} position  - centre du painting
 * @property {number} [rotation=0]   - rotation Y en degrés du mur où il est accroché
 * @property {string[]} [previewPieces]
 */

/**
 * @typedef {Object} PaintingsOptions
 * @property {HTMLElement} host
 * @property {ReturnType<import('../audio/soundManager.js').createSoundManager>} audio
 * @property {PaintingDef[]} definitions
 * @property {{width:number, height:number}} [frameSize]
 */

/**
 * @param {PaintingsOptions} options
 */
export function createPaintings(options) {
  const host = options.host;
  const audio = options.audio;
  const frameSize = options.frameSize ?? { width: 240, height: 320 };

  const root = el('div', { class: 'paintings' });
  host.appendChild(root);

  const piecer = createPieceRenderer();

  /** @type {Map<string, {def: PaintingDef, el: HTMLElement, previewCubes: HTMLElement[], phase: number, highlighted: boolean}>} */
  const byId = new Map();

  /** @type {string | null} */
  let currentHighlight = null;
  let hoveredOnce = new Set();
  let t = 0;

  // ---------------------------------------------------------------------
  // CONSTRUCTION
  // ---------------------------------------------------------------------

  options.definitions.forEach((def) => {
    const painting = buildPainting(def);
    root.appendChild(painting.el);
    byId.set(def.id, painting);
  });

  /**
   * @param {PaintingDef} def
   */
  function buildPainting(def) {
    const rotationY = def.rotation ?? 0;

    const container = el('div', { class: 'painting', 'data-id': def.id });
    container.style.width = `${frameSize.width}px`;
    container.style.height = `${frameSize.height}px`;
    container.style.transform =
      `translate3d(${def.position.x - frameSize.width / 2}px, ${def.position.y - frameSize.height / 2}px, ${def.position.z}px) rotateY(${rotationY}deg)`;

    // Cadre doré (extérieur)
    const frame = el('div', { class: 'painting__frame' });
    // Mat intérieur (fond coloré derrière la scène animée)
    const mat = el('div', { class: 'painting__mat', 'data-mode': def.mode });
    // Scène 3D miniature
    const stage = el('div', { class: 'painting__stage' });
    // Titre (plaque dorée en bas)
    const plate = el('div', { class: 'painting__plate' }, def.label);
    // Halo qui apparaît quand le joueur est proche
    const halo = el('div', { class: 'painting__halo' });

    container.appendChild(halo);
    container.appendChild(frame);
    container.appendChild(mat);
    container.appendChild(stage);
    container.appendChild(plate);

    // Preview : quelques tétrominos dans le mat qui tournent doucement
    const types = def.previewPieces ?? pickPreviewTypes(def.mode);
    const cubes = [];
    types.forEach((type, i) => {
      const slot = el('div', { class: 'painting__piece-slot' });
      slot.dataset.offsetX = String((i - (types.length - 1) / 2) * 56);
      slot.dataset.phase = String((i * Math.PI * 2) / types.length);
      piecer.renderPieceCentered(type, 0, slot, {
        mode: 'flat',
        containerSize: 50,
        cubeSize: 12,
      });
      stage.appendChild(slot);
      cubes.push(slot);
    });

    return {
      def,
      el: container,
      previewCubes: cubes,
      phase: Math.random() * Math.PI * 2,
      highlighted: false,
    };
  }

  // ---------------------------------------------------------------------
  // API D'INTERACTION
  // ---------------------------------------------------------------------

  /**
   * @param {string} id
   */
  function get(id) {
    const p = byId.get(id);
    return p ? p.def : null;
  }

  function getAll() {
    return Array.from(byId.values()).map((p) => p.def);
  }

  /**
   * Retourne le painting le plus proche de `pos` dans un rayon horizontal.
   * On ignore l'axe Y puisque tous les tableaux sont au même niveau mural.
   *
   * @param {{x:number, z:number}} pos
   * @param {number} [maxDistance=200]
   * @returns {PaintingDef | null}
   */
  function getNearest(pos, maxDistance = 200) {
    let best = null;
    let bestD = maxDistance;
    byId.forEach((p) => {
      const dx = p.def.position.x - pos.x;
      const dz = p.def.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        best = p.def;
        bestD = d;
      }
    });
    return best;
  }

  /**
   * Met en surbrillance un painting (ou null pour retirer la surbrillance).
   * Joue un SFX une seule fois par "entrée" dans la zone de proximité.
   *
   * @param {string | null} id
   */
  function highlight(id) {
    if (id === currentHighlight) return;
    // Retirer l'ancien highlight
    if (currentHighlight) {
      const prev = byId.get(currentHighlight);
      if (prev) {
        prev.highlighted = false;
        prev.el.classList.remove('is-highlighted');
      }
    }
    currentHighlight = id;
    if (id) {
      const next = byId.get(id);
      if (next) {
        next.highlighted = true;
        next.el.classList.add('is-highlighted');
        if (!hoveredOnce.has(id)) {
          hoveredOnce.add(id);
        }
        audio.playSfx(audio.SFX.MENU_MOVE, { volume: 0.4 });
      }
    }
  }

  // ---------------------------------------------------------------------
  // ANIMATION PAR FRAME
  // ---------------------------------------------------------------------

  /**
   * @param {number} dtMs
   */
  function update(dtMs) {
    t += dtMs / 1000;
    byId.forEach((p) => {
      p.phase += dtMs / 1000 * (p.highlighted ? 2.2 : 1.0);

      // Animation des pièces dans la preview
      p.previewCubes.forEach((slot, i) => {
        const baseOffset = parseFloat(slot.dataset.offsetX || '0');
        const phase = parseFloat(slot.dataset.phase || '0') + p.phase;
        const y = Math.sin(phase) * 10;
        const ry = Math.sin(phase * 0.5) * 25;
        const rx = Math.cos(phase * 0.7) * 15;
        slot.style.transform =
          `translate3d(${baseOffset}px, ${y}px, 0px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
    });
  }

  // ---------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------

  function destroy() {
    byId.clear();
    hoveredOnce.clear();
    currentHighlight = null;
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return Object.freeze({
    get,
    getAll,
    getNearest,
    highlight,
    update,
    destroy,
  });
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

/**
 * Choisit des pièces "préview" en fonction du mode. Purement cosmétique.
 * @param {string} mode
 * @returns {string[]}
 */
function pickPreviewTypes(mode) {
  switch (mode) {
    case 'marathon': return ['L', 'T', 'I'];
    case 'sprint40': return ['I', 'J', 'I'];
    case 'zen':      return ['O', 'S', 'Z'];
    default:         return ['T', 'I', 'L'];
  }
}