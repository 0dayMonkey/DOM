/**
 * boardRenderer.js — Rendu de la grille de jeu (fond + cellules verrouillées).
 *
 * La grille est un conteneur DOM 3D avec :
 *   - un "plancher" (arrière-plan quadrillé subtil)
 *   - un cadre en relief (bordures gauche/droite/haut/bas)
 *   - une couche de cellules verrouillées (un cube par cellule occupée)
 *   - une couche pour line clear animation (flash + disparition)
 *
 * Approche de rendu :
 *  - On ne reconstruit PAS tout le DOM à chaque frame. À la place, on
 *    maintient un "miroir" de la grille en mémoire (prevGrid) et on
 *    applique uniquement les différences via un set de DIVs recyclés.
 *  - Chaque cellule occupée a un DOM associé (Map<"y,x", HTMLElement>).
 *    Quand la grille change, on calcule les ajouts/suppressions.
 *
 * L'animation de line clear a 3 phases :
 *   1) flash : les lignes ciblées passent en blanc (CSS animation)
 *   2) shrink : elles se rétrécissent verticalement
 *   3) fall  : la grille au-dessus est repeinte après clearing
 *
 * Le renderer n'appelle PAS `game.clearLines()` : c'est le moteur qui
 * déclenche le clearing et émet LINES_CLEARED ; le renderer reçoit juste
 * une grille "avant" et une grille "après".
 */

import {
    BOARD_COLS,
    BOARD_TOTAL_ROWS,
    BOARD_HIDDEN_ROWS,
    BOARD_VISIBLE_ROWS,
    CELL_EMPTY,
    ID_TO_PIECE,
    LINE_CLEAR_ANIM_MS,
  } from '../core/constants.js';
  import { createPieceRenderer } from './pieceRenderer.js';
  import { el, getCssVar } from '../utils/helpers.js';
  
  /**
   * @typedef {Object} BoardRendererOptions
   * @property {HTMLElement} host              - conteneur où monter le board
   * @property {HTMLElement} [cubeSizeHost=document.documentElement]
   * @property {boolean} [showHiddenRows=false] - afficher la zone cachée (debug)
   */
  
  /**
   * @param {BoardRendererOptions} options
   */
  export function createBoardRenderer(options) {
    const host = options.host;
    const cubeSizeHost = options.cubeSizeHost ?? document.documentElement;
    const showHidden = options.showHiddenRows === true;
  
    const pieceRenderer = createPieceRenderer({ cubeSizeHost });
  
    // -------------------------------------------------------------------
    // STRUCTURE DOM
    // -------------------------------------------------------------------
  
    host.classList.add('board');
    host.innerHTML = '';
  
    /** Plancher (grille de fond). */
    const floor = el('div', { class: 'board__floor', 'aria-hidden': 'true' });
    /** Mur arrière (légère 3D). */
    const backWall = el('div', { class: 'board__back-wall', 'aria-hidden': 'true' });
    /** Cadre (bordures 3D). */
    const frame = el('div', { class: 'board__frame', 'aria-hidden': 'true' }, [
      el('div', { class: 'board__frame-left' }),
      el('div', { class: 'board__frame-right' }),
      el('div', { class: 'board__frame-bottom' }),
      el('div', { class: 'board__frame-top' }),
    ]);
    /** Couche des cellules verrouillées. */
    const locked = el('div', { class: 'board__locked' });
    /** Couche active piece (le moteur de rendu y insère la pièce courante). */
    const pieceLayer = el('div', { class: 'board__piece-layer' });
    /** Couche ghost. */
    const ghostLayer = el('div', { class: 'board__ghost-layer' });
    /** Couche FX (flash lignes, etc.). */
    const fxLayer = el('div', { class: 'board__fx-layer' });
  
    host.appendChild(backWall);
    host.appendChild(floor);
    host.appendChild(frame);
    host.appendChild(locked);
    host.appendChild(ghostLayer);
    host.appendChild(pieceLayer);
    host.appendChild(fxLayer);
  
    // -------------------------------------------------------------------
    // DIMENSIONS
    // -------------------------------------------------------------------
  
    let cubeSize = readCubeSize();
    applyDimensions();
  
    function readCubeSize() {
      const raw = getCssVar(cubeSizeHost, '--cube-size') || '32px';
      const px = parseFloat(raw);
      return Number.isFinite(px) ? px : 32;
    }
  
    function applyDimensions() {
      const rows = showHidden ? BOARD_TOTAL_ROWS : BOARD_VISIBLE_ROWS;
      const w = BOARD_COLS * cubeSize;
      const h = rows * cubeSize;
      host.style.setProperty('--board-cube-size', `${cubeSize}px`);
      host.style.width = `${w}px`;
      host.style.height = `${h}px`;
      // Le board est centré par transform sur .scene-root : on n'ajoute pas
      // de translate ici pour rester composable.
    }
  
    /**
     * À appeler après un resize ou un changement responsif.
     */
    function refreshDimensions() {
      cubeSize = readCubeSize();
      applyDimensions();
      // Reset des transforms des cubes existants (taille change)
      cellMap.forEach((cubeEl, key) => {
        const [y, x] = key.split(',').map(Number);
        positionCube(cubeEl, x, y);
      });
    }
  
    /**
     * Convertit une coord grille en coord écran (en tenant compte de la zone
     * cachée si `showHidden=false`).
     * @param {number} y
     * @returns {number} y rendu (peut être négatif si hors board)
     */
    function screenY(y) {
      return showHidden ? y : y - BOARD_HIDDEN_ROWS;
    }
  
    /**
     * Positionne un cube à (x, y) grille.
     * @param {HTMLElement} cubeEl
     * @param {number} x
     * @param {number} y
     */
    function positionCube(cubeEl, x, y) {
      const sy = screenY(y);
      cubeEl.style.transform = `translate3d(${x * cubeSize}px, ${sy * cubeSize}px, 0)`;
      cubeEl.style.setProperty('--cube-size', `${cubeSize}px`);
    }
  
    // -------------------------------------------------------------------
    // MIROIR DE GRILLE — diff rendering
    // -------------------------------------------------------------------
  
    /** @type {Map<string, HTMLElement>} key "y,x" → cube DOM */
    const cellMap = new Map();
  
    /** @type {number[][] | null} dernière grille rendue */
    let prevGrid = null;
  
    /**
     * Synchronise le rendu des cellules verrouillées avec une grille.
     * Applique seulement les diffs : création, suppression, changement de type.
     *
     * @param {number[][]} grid
     */
    function renderLocked(grid) {
      for (let y = 0; y < BOARD_TOTAL_ROWS; y++) {
        if (!showHidden && y < BOARD_HIDDEN_ROWS) continue;
        const row = grid[y];
        for (let x = 0; x < BOARD_COLS; x++) {
          const cell = row[x];
          const key = `${y},${x}`;
          const existing = cellMap.get(key);
  
          if (cell === CELL_EMPTY) {
            if (existing) {
              if (existing.parentNode) existing.parentNode.removeChild(existing);
              cellMap.delete(key);
            }
          } else {
            const type = ID_TO_PIECE[cell] || '';
            if (!existing) {
              const cube = pieceRenderer.createCube(type, 'full');
              cube.classList.add('board__cell');
              positionCube(cube, x, y);
              locked.appendChild(cube);
              cellMap.set(key, cube);
            } else {
              // Cube recyclé après line clear : une cellule occupée ne doit
              // jamais conserver l'anim --clearing (scale 0 / opacity 0),
              // sinon elle reste invisible alors que la grille la marque pleine.
              existing.classList.remove('board__cell--clearing');
              const existingType = existing.getAttribute('data-type');
              if (existingType !== type) {
                pieceRenderer.retypePiece(existing, type);
                existing.setAttribute('data-type', type);
              }
            }
          }
        }
      }
      prevGrid = grid;
    }
  
    // -------------------------------------------------------------------
    // LINE CLEAR — animation
    // -------------------------------------------------------------------
  
    /**
     * Joue l'animation d'effacement sur les lignes données.
     * Déclenche un flash puis une disparition. La grille "finale" est
     * ensuite rendue par un appel à renderLocked(newGrid) par l'appelant.
     *
     * @param {number[]} lineIndices
     * @param {number} [durationMs=LINE_CLEAR_ANIM_MS]
     * @returns {Promise<void>}
     */
    function animateLineClear(lineIndices, durationMs = LINE_CLEAR_ANIM_MS) {
      if (!lineIndices || lineIndices.length === 0) return Promise.resolve();
  
      // Phase 1 : marque les cubes concernés pour animation CSS
      const animated = [];
      for (const y of lineIndices) {
        for (let x = 0; x < BOARD_COLS; x++) {
          const cube = cellMap.get(`${y},${x}`);
          if (cube) {
            cube.classList.add('board__cell--clearing');
            animated.push(cube);
          }
        }
      }
  
      // Phase 2 : flash blanc en couche FX
      const flashes = lineIndices.map((y) => {
        const flash = el('div', { class: 'board__line-flash' });
        flash.style.top = `${screenY(y) * cubeSize}px`;
        flash.style.height = `${cubeSize}px`;
        flash.style.width = `${BOARD_COLS * cubeSize}px`;
        fxLayer.appendChild(flash);
        return flash;
      });
  
      return new Promise((resolve) => {
        setTimeout(() => {
          // Cleanup FX
          flashes.forEach((f) => f.parentNode && f.parentNode.removeChild(f));
          resolve();
        }, durationMs);
      });
    }
  
    // -------------------------------------------------------------------
    // ACCESSEURS DE COUCHES — pour pieceRenderer / ghostRenderer externes
    // -------------------------------------------------------------------
  
    /**
     * @returns {HTMLElement} conteneur où monter l'active piece
     */
    function getPieceLayer() {
      return pieceLayer;
    }
  
    /**
     * @returns {HTMLElement} conteneur où monter le ghost
     */
    function getGhostLayer() {
      return ghostLayer;
    }
  
    /**
     * @returns {HTMLElement} conteneur pour les effets (particules locales, flash)
     */
    function getFxLayer() {
      return fxLayer;
    }
  
    /**
     * Retourne la taille de cube courante.
     */
    function getCubeSize() {
      return cubeSize;
    }
  
    /**
     * Coord absolue en pixels d'une cellule (x, y) dans le board.
     * Utile pour positionner des particules ou des text pops sur un bloc donné.
     * @param {number} x
     * @param {number} y
     * @returns {{x:number, y:number}}
     */
    function cellToPixel(x, y) {
      return {
        x: x * cubeSize + cubeSize / 2,
        y: screenY(y) * cubeSize + cubeSize / 2,
      };
    }
  
    // -------------------------------------------------------------------
    // UI "TOP-OUT" — highlight de la zone de danger
    // -------------------------------------------------------------------
  
    /**
     * Ajoute/retire la classe visuelle "danger" quand la pile approche du sommet.
     * @param {boolean} on
     */
    function setDanger(on) {
      host.classList.toggle('board--danger', !!on);
    }
  
    // -------------------------------------------------------------------
    // CLEAR / RESET
    // -------------------------------------------------------------------
  
    /**
     * Vide tout le rendu (mais conserve la structure DOM).
     */
    function clear() {
      cellMap.forEach((cube) => {
        if (cube.parentNode) cube.parentNode.removeChild(cube);
      });
      cellMap.clear();
      fxLayer.innerHTML = '';
      pieceLayer.innerHTML = '';
      ghostLayer.innerHTML = '';
      prevGrid = null;
    }
  
    /**
     * Nettoyage complet : retire le board du DOM.
     */
    function destroy() {
      clear();
      host.classList.remove('board');
      host.innerHTML = '';
    }
  
    return Object.freeze({
      // rendu
      renderLocked,
      animateLineClear,
      refreshDimensions,
      // couches
      getPieceLayer,
      getGhostLayer,
      getFxLayer,
      // dim
      getCubeSize,
      cellToPixel,
      // ui
      setDanger,
      // cycle
      clear,
      destroy,
    });
  }