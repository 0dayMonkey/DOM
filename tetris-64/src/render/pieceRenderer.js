/**
 * pieceRenderer.js — Rend une pièce Tetris (active, fantôme ou prévisualisation).
 *
 * Chaque cube d'une pièce est un conteneur DOM avec 5 faces (top, front,
 * back, left, right, bottom) composant un vrai cube 3D CSS. Les couleurs
 * et l'éclairage viennent de variables CSS définies dans tokens.css /
 * pieces.css ; ce module n'écrit que des positions et un data-attribute
 * pour le type.
 *
 * Deux modes :
 *  - "full"  : 5 faces (utilisé en jeu pour l'active piece + grid)
 *  - "flat"  : top seulement (utilisé par le HUD next/hold, plus rapide)
 *
 * API :
 *   renderer.renderPiece(type, rotation, host, options)
 *     - reconstruit le DOM du host avec les cubes en position locale.
 *   renderer.updatePiece(host, { x, y, rotation, type })
 *     - met à jour la transform du host (déplacement rapide, 60 FPS safe).
 *   renderer.createCube(type)
 *     - retourne un cube DOM prêt à être ajouté à un conteneur custom.
 *
 * Le renderer NE connaît PAS le board : il ne gère que la forme de la pièce
 * elle-même. Les positions absolues dans la grille sont gérées par
 * boardRenderer.js ou directement par gameScene.js.
 */

import { getPieceCells, getBoxSize, getPieceId } from '../core/pieces.js';
import { getCssVar, el } from '../utils/helpers.js';

/**
 * @typedef {'full' | 'flat'} CubeMode
 */

/**
 * @typedef {Object} PieceRendererOptions
 * @property {HTMLElement} [cubeSizeHost=document.documentElement]
 *   Élément sur lequel lire --cube-size (différencier game vs hud).
 * @property {CubeMode} [mode='full']
 * @property {boolean} [ghost=false]
 * @property {number} [scale=1]
 */

/**
 * Crée un renderer de pièce.
 * @param {PieceRendererOptions} [options]
 */
export function createPieceRenderer(options = {}) {
    const defaultMode = options.mode ?? 'full';
    const ghost = options.ghost ?? false;
    const scale = options.scale ?? 1;
    const cubeSizeHost = options.cubeSizeHost ?? document.documentElement;
  
    /**
     * Lit dynamiquement --cube-size (pour s'adapter au média query mobile).
     * @returns {number}
     */
    function readCubeSize() {
      const raw = getCssVar(cubeSizeHost, '--cube-size') || '32px';
      const px = parseFloat(raw);
      return Number.isFinite(px) ? px * scale : 32 * scale;
    }
  
    // -------------------------------------------------------------------
    // CRÉATION D'UN CUBE
    // -------------------------------------------------------------------
  
    /**
     * @param {string} type  - 'I' | 'O' | ... ou '' pour neutre
     * @param {CubeMode} [mode=defaultMode]
     * @returns {HTMLElement}
     */
    function createCube(type, mode = defaultMode) {
      const cube = el('div', {
        class: ghost ? 'cube cube--ghost' : 'cube',
        'data-type': type || '',
      });
      if (mode === 'flat') {
        cube.classList.add('cube--flat');
        cube.appendChild(el('div', { class: 'cube__face cube__face--top' }));
      } else {
        cube.appendChild(el('div', { class: 'cube__face cube__face--front' }));
        cube.appendChild(el('div', { class: 'cube__face cube__face--back' }));
        cube.appendChild(el('div', { class: 'cube__face cube__face--left' }));
        cube.appendChild(el('div', { class: 'cube__face cube__face--right' }));
        cube.appendChild(el('div', { class: 'cube__face cube__face--top' }));
        cube.appendChild(el('div', { class: 'cube__face cube__face--bottom' }));
      }
      return cube;
    }
  
    // -------------------------------------------------------------------
    // RENDU D'UNE PIÈCE
    // -------------------------------------------------------------------
  
    /**
     * @param {string} type
     * @param {number} rotation
     * @param {HTMLElement} host
     * @param {Object} [opts]
     * @param {CubeMode} [opts.mode]
     * @param {boolean} [opts.clear=true]
     * @param {number} [opts.cubeSize]
     * @returns {HTMLElement[]} cubes créés
     */
    function renderPiece(type, rotation, host, opts = {}) {
      const mode = opts.mode ?? defaultMode;
      const clear = opts.clear !== false;
      const cubeSize = opts.cubeSize ?? readCubeSize();
      const cells = getPieceCells(type, rotation);
  
      if (clear) host.innerHTML = '';
      host.classList.add('piece');
      host.classList.toggle('piece--ghost', ghost);
      host.setAttribute('data-type', type);
      host.setAttribute('data-rotation', String(rotation));
      host.style.setProperty('--piece-cube-size', `${cubeSize}px`);
  
      const cubes = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const cube = createCube(type, mode);
        cube.style.setProperty('--cube-x', `${c.x * cubeSize}px`);
        cube.style.setProperty('--cube-y', `${c.y * cubeSize}px`);
        cube.style.setProperty('--cube-size', `${cubeSize}px`);
        cube.style.transform = `translate3d(${c.x * cubeSize}px, ${c.y * cubeSize}px, 0)`;
        host.appendChild(cube);
        cubes.push(cube);
      }
      return cubes;
    }
  
    /**
     * Rend la pièce centrée dans son host (utile pour le HUD next/hold où la
     * boîte de rotation 3x3 ou 4x4 doit être centrée dans une case fixe).
     *
     * @param {string} type
     * @param {number} rotation
     * @param {HTMLElement} host
     * @param {Object} [opts]
     * @param {number} [opts.cubeSize]
     * @param {CubeMode} [opts.mode]
     * @param {number} [opts.containerSize=128] taille en px du conteneur carré
     * @returns {HTMLElement[]}
     */
    function renderPieceCentered(type, rotation, host, opts = {}) {
      const mode = opts.mode ?? 'flat';
      const cubeSize = opts.cubeSize ?? Math.floor((opts.containerSize ?? 128) / 5);
      const containerSize = opts.containerSize ?? 128;
  
      host.innerHTML = '';
      host.classList.add('piece', 'piece--centered');
      host.style.width = `${containerSize}px`;
      host.style.height = `${containerSize}px`;
  
      // Bbox locale pour centrer
      const cells = getPieceCells(type, rotation);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      cells.forEach(({ x, y }) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
      const boxW = (maxX - minX + 1) * cubeSize;
      const boxH = (maxY - minY + 1) * cubeSize;
      const offsetX = (containerSize - boxW) / 2 - minX * cubeSize;
      const offsetY = (containerSize - boxH) / 2 - minY * cubeSize;
  
      const cubes = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const cube = createCube(type, mode);
        const px = c.x * cubeSize + offsetX;
        const py = c.y * cubeSize + offsetY;
        cube.style.setProperty('--cube-size', `${cubeSize}px`);
        cube.style.transform = `translate3d(${px}px, ${py}px, 0)`;
        host.appendChild(cube);
        cubes.push(cube);
      }
      return cubes;
    }
  
    // -------------------------------------------------------------------
    // MISE À JOUR — déplacement rapide du host
    // -------------------------------------------------------------------
  
    /**
     * Met à jour la position du host (translation + rotation) sans
     * reconstruire les cubes. À utiliser pour les mouvements L/R/down.
     *
     * @param {HTMLElement} host
     * @param {Object} t
     * @param {number} t.x - position absolue x (en cellules)
     * @param {number} t.y - position absolue y (en cellules)
     * @param {number} [t.cubeSize]
     */
    function setHostPosition(host, t) {
      const cs = t.cubeSize ?? readCubeSize();
      host.style.transform = `translate3d(${t.x * cs}px, ${t.y * cs}px, 0)`;
    }
  
    /**
     * Reconstruction après rotation : on invalide l'ancien DOM et on
     * regénère les cubes selon la nouvelle rotation.
     *
     * @param {HTMLElement} host
     * @param {string} type
     * @param {number} rotation
     */
    function updateRotation(host, type, rotation) {
      renderPiece(type, rotation, host, { clear: true });
    }
  
    /**
     * Change le type d'une pièce existante : on remet à jour les
     * data-attributes (les CSS variables piece-* s'adapteront).
     *
     * @param {HTMLElement} host
     * @param {string} newType
     */
    function retypePiece(host, newType) {
      host.setAttribute('data-type', newType);
      host.querySelectorAll('.cube').forEach((c) => c.setAttribute('data-type', newType));
    }
  
    // -------------------------------------------------------------------
    // ANIMATIONS FX
    // -------------------------------------------------------------------
  
    /**
     * Ajoute une classe d'animation courte à tous les cubes (lock pulse,
     * hard drop streak, rotate kick, etc.). La classe est retirée en fin
     * d'animation.
     *
     * @param {HTMLElement} host
     * @param {string} animClass
     * @param {number} [durationMs=220]
     */
    function animateOnce(host, animClass, durationMs = 220) {
      const cubes = host.querySelectorAll('.cube');
      cubes.forEach((c) => c.classList.add(animClass));
      setTimeout(() => {
        cubes.forEach((c) => c.classList.remove(animClass));
      }, durationMs + 20);
    }
  
    // -------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------
  
    /**
     * @param {string} type
     * @returns {number}
     */
    function getTypeId(type) {
      return getPieceId(type);
    }
  
    /**
     * @param {string} type
     * @returns {number}
     */
    function getPieceBoxSize(type) {
      return getBoxSize(type);
    }
  
    return Object.freeze({
      createCube,
      renderPiece,
      renderPieceCentered,
      setHostPosition,
      updateRotation,
      retypePiece,
      animateOnce,
      getTypeId,
      getPieceBoxSize,
      readCubeSize,
    });
  }