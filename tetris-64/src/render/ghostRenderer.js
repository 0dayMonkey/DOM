/**
 * ghostRenderer.js — Affichage de la pièce fantôme (ghost piece).
 *
 * La ghost piece est une projection translucide de la pièce active à
 * l'endroit où elle va atterrir si elle tombait tout de suite (hard drop
 * préview). Elle aide énormément à viser et elle est activée par défaut.
 *
 * Rendu :
 *  - On utilise pieceRenderer avec l'option ghost=true : les faces ont
 *    une opacity réduite (via --ghost-alpha dans tokens.css) et une
 *    teinte désaturée.
 *  - On place le host du ghost dans le ghostLayer fourni (typiquement
 *    donné par boardRenderer.getGhostLayer()).
 *
 * Flux :
 *  1) update(piece, dropDistance) : reconstruit / repositionne le ghost.
 *  2) hide() / show() : bascule rapide (au lock ou au hold).
 *
 * Le moteur de jeu ne connaît pas le ghost : c'est gameScene qui calcule
 * la drop distance (via game.getGhostDistance()) et appelle update().
 */

import { createPieceRenderer } from './pieceRenderer.js';
import { getCssVar, el } from '../utils/helpers.js';
import { BOARD_HIDDEN_ROWS } from '../core/constants.js';

/**
 * @typedef {Object} GhostRendererOptions
 * @property {HTMLElement} host               - conteneur ghost (ex. board ghostLayer)
 * @property {HTMLElement} [cubeSizeHost=document.documentElement]
 * @property {boolean} [showHiddenRows=false] - même convention que le board
 */

/**
 * @param {GhostRendererOptions} options
 */
export function createGhostRenderer(options) {
  const host = options.host;
  const cubeSizeHost = options.cubeSizeHost ?? document.documentElement;
  const showHidden = options.showHiddenRows === true;

  const piecer = createPieceRenderer({ ghost: true, cubeSizeHost });

  /** Le conteneur réel de la pièce ghost (créé à la première update). */
  /** @type {HTMLElement | null} */
  let pieceEl = null;

  /** Dernier état rendu (pour éviter de reconstruire si rien n'a changé). */
  let lastType = '';
  let lastRotation = -1;
  let lastX = null;
  let lastY = null;
  let lastCubeSize = -1;

  let visible = true;

  host.classList.add('ghost');

  function readCubeSize() {
    const raw = getCssVar(cubeSizeHost, '--cube-size') || '32px';
    return parseFloat(raw) || 32;
  }

  /**
   * @param {number} y
   * @returns {number}
   */
  function screenY(y) {
    return showHidden ? y : y - BOARD_HIDDEN_ROWS;
  }

  function ensurePieceEl() {
    if (pieceEl) return pieceEl;
    pieceEl = el('div', { class: 'piece piece--ghost' });
    host.appendChild(pieceEl);
    return pieceEl;
  }

  // -------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------

  /**
   * Met à jour le ghost pour qu'il corresponde à la pièce active projetée.
   *
   * @param {Object} piece
   * @param {string} piece.type
   * @param {number} piece.rotation
   * @param {number} piece.x      - coord grille X de la pièce active
   * @param {number} piece.y      - coord grille Y de la pièce active
   * @param {number} dropDistance - cellules parcourues en hard drop
   */
  function update(piece, dropDistance) {
    if (!visible) return;
    const cs = readCubeSize();
    const projX = piece.x;
    const projY = piece.y + (dropDistance | 0);
    const host$ = ensurePieceEl();

    // Si le ghost chevauche la pièce active (drop distance 0), on le cache
    // visuellement : redondant et visuellement encombrant.
    const overlap = dropDistance <= 0;
    host$.classList.toggle('is-hidden', overlap);

    const rotChanged = piece.rotation !== lastRotation;
    const typeChanged = piece.type !== lastType;
    const sizeChanged = cs !== lastCubeSize;

    if (typeChanged || rotChanged || sizeChanged) {
      piecer.renderPiece(piece.type, piece.rotation, host$, {
        mode: 'full',
        clear: true,
        cubeSize: cs,
      });
      lastType = piece.type;
      lastRotation = piece.rotation;
      lastCubeSize = cs;
    }

    if (projX !== lastX || projY !== lastY || sizeChanged) {
      host$.style.transform =
        `translate3d(${projX * cs}px, ${screenY(projY) * cs}px, 0)`;
      lastX = projX;
      lastY = projY;
    }
  }

  /**
   * Cache le ghost (lock, hold, game over).
   */
  function hide() {
    visible = false;
    if (pieceEl) pieceEl.classList.add('is-hidden');
  }

  /**
   * Affiche le ghost.
   */
  function show() {
    visible = true;
    if (pieceEl) pieceEl.classList.remove('is-hidden');
  }

  /**
   * Active/désactive.
   * @param {boolean} on
   */
  function setEnabled(on) {
    if (on) show(); else hide();
  }

  /**
   * Reset complet (ex : changement de pièce forcé).
   */
  function reset() {
    if (pieceEl && pieceEl.parentNode) pieceEl.parentNode.removeChild(pieceEl);
    pieceEl = null;
    lastType = '';
    lastRotation = -1;
    lastX = null;
    lastY = null;
    lastCubeSize = -1;
  }

  /**
   * Destruction.
   */
  function destroy() {
    reset();
    host.classList.remove('ghost');
  }

  return Object.freeze({
    update,
    show,
    hide,
    setEnabled,
    reset,
    destroy,
  });
}