/**
 * previewRenderer.js — Rendu de la file NEXT et du slot HOLD.
 *
 * Fournit deux widgets visuellement identiques, affichés dans le HUD :
 *
 *  - NEXT : liste verticale de N pièces, la plus haute en premier
 *  - HOLD : une seule pièce, ou case vide ("—") si aucune n'est en hold,
 *           et état "disabled" si le hold a déjà été utilisé pour le tour.
 *
 * Chaque slot est une "case" carrée centrée qui contient une pièce rendue
 * en mode "flat" (top-only) pour rester lisible dans le HUD.
 *
 * API :
 *  - createNextPreview({ host, size })
 *  - createHoldPreview({ host })
 *
 * Les deux objets exposent :
 *  - update(typesOrType)
 *  - setDisabled(bool)  (hold seulement)
 *  - destroy()
 */

import { createPieceRenderer } from './pieceRenderer.js';
import { el, clearChildren } from '../utils/helpers.js';
import { NEXT_QUEUE_SIZE } from '../core/constants.js';

/**
 * @typedef {Object} NextPreviewOptions
 * @property {HTMLElement} host
 * @property {number} [size=NEXT_QUEUE_SIZE]
 * @property {number} [slotSize=96]      - px
 * @property {HTMLElement} [cubeSizeHost]
 */

/**
 * Crée le widget NEXT.
 * @param {NextPreviewOptions} options
 */
export function createNextPreview(options) {
  const host = options.host;
  const size = options.size ?? NEXT_QUEUE_SIZE;
  const slotSize = options.slotSize ?? 96;
  const cubeSizeHost = options.cubeSizeHost ?? document.documentElement;

  const piecer = createPieceRenderer({ cubeSizeHost, mode: 'flat' });

  host.classList.add('next-preview');
  host.innerHTML = '';

  const title = el('div', { class: 'preview__title' }, 'NEXT');
  const list = el('div', { class: 'preview__list' });
  host.appendChild(title);
  host.appendChild(list);

  /** @type {HTMLElement[]} */
  const slots = [];
  /** @type {string[]} */
  let lastTypes = [];

  for (let i = 0; i < size; i++) {
    const slot = el('div', {
      class: `preview__slot preview__slot--${i === 0 ? 'primary' : 'secondary'}`,
      'data-index': i,
    });
    // Première slot plus grande que les suivantes (tradition Tetris)
    const scale = i === 0 ? 1 : 0.75;
    slot.style.width = `${slotSize * scale}px`;
    slot.style.height = `${slotSize * scale}px`;
    list.appendChild(slot);
    slots.push(slot);
  }

  /**
   * Met à jour la file : types[0] est la prochaine pièce, etc.
   * @param {string[]} types
   */
  function update(types) {
    // Diff léger : si la file est identique, on ne reconstruit pas.
    if (arraysEqual(lastTypes, types)) return;
    lastTypes = [...types];

    for (let i = 0; i < slots.length; i++) {
      const type = types[i] || '';
      const slot = slots[i];
      clearChildren(slot);
      if (!type) {
        slot.classList.add('is-empty');
        continue;
      }
      slot.classList.remove('is-empty');
      const scale = i === 0 ? 1 : 0.75;
      const innerSize = slotSize * scale;
      piecer.renderPieceCentered(type, 0, slot, {
        mode: 'flat',
        containerSize: innerSize,
        cubeSize: Math.floor(innerSize / 5),
      });
    }
  }

  /**
   * Petite animation de "shift" : pousse la file d'un cran. Utile quand une
   * pièce vient d'être spawnée (la première slot disparaît, les autres montent).
   */
  function animateShift() {
    slots.forEach((slot) => {
      slot.classList.remove('is-shifting');
      // force reflow
      // eslint-disable-next-line no-unused-expressions
      slot.offsetHeight;
      slot.classList.add('is-shifting');
    });
    setTimeout(() => {
      slots.forEach((s) => s.classList.remove('is-shifting'));
    }, 240);
  }

  function destroy() {
    host.innerHTML = '';
    host.classList.remove('next-preview');
    slots.length = 0;
    lastTypes = [];
  }

  return Object.freeze({
    update,
    animateShift,
    destroy,
  });
}

/**
 * @typedef {Object} HoldPreviewOptions
 * @property {HTMLElement} host
 * @property {number} [slotSize=96]
 * @property {HTMLElement} [cubeSizeHost]
 */

/**
 * Crée le widget HOLD.
 * @param {HoldPreviewOptions} options
 */
export function createHoldPreview(options) {
  const host = options.host;
  const slotSize = options.slotSize ?? 96;
  const cubeSizeHost = options.cubeSizeHost ?? document.documentElement;

  const piecer = createPieceRenderer({ cubeSizeHost, mode: 'flat' });

  host.classList.add('hold-preview');
  host.innerHTML = '';

  const title = el('div', { class: 'preview__title' }, 'HOLD');
  const slot = el('div', { class: 'preview__slot preview__slot--primary' });
  slot.style.width = `${slotSize}px`;
  slot.style.height = `${slotSize}px`;

  host.appendChild(title);
  host.appendChild(slot);

  let lastType = null;
  let disabled = false;

  /**
   * Met à jour la pièce affichée. null = vide.
   * @param {string | null} type
   */
  function update(type) {
    if (type === lastType) return;
    lastType = type;
    clearChildren(slot);
    if (!type) {
      slot.classList.add('is-empty');
      return;
    }
    slot.classList.remove('is-empty');
    piecer.renderPieceCentered(type, 0, slot, {
      mode: 'flat',
      containerSize: slotSize,
      cubeSize: Math.floor(slotSize / 5),
    });
  }

  /**
   * Si le hold a déjà été utilisé pour ce tour, on grise le slot.
   * @param {boolean} on
   */
  function setDisabled(on) {
    disabled = !!on;
    slot.classList.toggle('is-disabled', disabled);
    host.classList.toggle('is-disabled', disabled);
  }

  /**
   * Animation flash au moment où on hold une pièce.
   */
  function flash() {
    slot.classList.remove('is-flashing');
    // eslint-disable-next-line no-unused-expressions
    slot.offsetHeight;
    slot.classList.add('is-flashing');
    setTimeout(() => slot.classList.remove('is-flashing'), 320);
  }

  function destroy() {
    host.innerHTML = '';
    host.classList.remove('hold-preview', 'is-disabled');
    lastType = null;
    disabled = false;
  }

  return Object.freeze({
    update,
    setDisabled,
    flash,
    destroy,
  });
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

/**
 * @param {any[]} a
 * @param {any[]} b
 * @returns {boolean}
 */
function arraysEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}