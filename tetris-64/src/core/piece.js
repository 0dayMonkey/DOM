/**
 * pieces.js — Définition des 7 tétrominos et de leurs 4 rotations.
 *
 * Chaque pièce est représentée par ses 4 états de rotation (0, R, 2, L)
 * sous forme de listes de cellules occupées `{x, y}` dans une boîte locale.
 *
 * Conventions :
 *  - Boîte I : 4x4 (rotations autour du centre 1.5, 1.5)
 *  - Boîte O : 2x2 (pas de rotation effective)
 *  - Boîte J/L/S/T/Z : 3x3 (rotations autour du centre 1, 1)
 *  - (x, y) = (colonne, ligne) dans la boîte locale ; y croît vers le bas
 *  - L'état 0 est l'état de spawn "standard" Tetris Guideline
 *
 * Ce module est pur : pas d'import, pas d'effet de bord.
 * Toutes les structures sont figées avec Object.freeze.
 */

import { PIECE_TYPES, PIECE_ID } from './constants.js';

// ============================================================================
// DÉFINITION DES SHAPES — 4 rotations × 7 pièces
// ============================================================================

/**
 * Les shapes sont définies en "matrice binaire" (tableau 2D de 0/1), ce qui
 * est lisible et facile à éditer. Une fonction dérive ensuite la liste des
 * cellules occupées `{x, y}` utilisée par le moteur.
 *
 * @typedef {Array<Array<0|1>>} ShapeMatrix
 */

/** @type {Record<string, ShapeMatrix[]>} */
const SHAPE_MATRICES = {
  I: [
    // 0 : horizontale, ligne 1
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    // R : verticale, colonne 2
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
    // 2 : horizontale, ligne 2
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
    ],
    // L : verticale, colonne 1
    [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],

  O: [
    // O n'a qu'une seule forme, dupliquée pour rester compatible avec le
    // pipeline de rotation.
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  ],

  T: [
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],

  S: [
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 0, 0],
      [0, 1, 1],
      [1, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],

  Z: [
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  ],

  J: [
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  ],

  L: [
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ],
  ],
};

// ============================================================================
// DÉRIVATION : matrices → listes de cellules
// ============================================================================

/**
 * Convertit une matrice binaire en liste d'offsets `{x, y}`.
 * @param {ShapeMatrix} matrix
 * @returns {Array<{x: number, y: number}>}
 */
function matrixToCells(matrix) {
  const cells = [];
  for (let y = 0; y < matrix.length; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 1) cells.push(Object.freeze({ x, y }));
    }
  }
  return Object.freeze(cells);
}

/**
 * Taille de la boîte de rotation de chaque type.
 * @type {Readonly<Record<string, number>>}
 */
export const PIECE_BOX_SIZE = Object.freeze({
  I: 4,
  O: 4,
  T: 3,
  S: 3,
  Z: 3,
  J: 3,
  L: 3,
});

/**
 * Table finale : type → 4 rotations → cellules.
 * Gelée en profondeur.
 *
 * @type {Readonly<Record<string, ReadonlyArray<ReadonlyArray<{x:number,y:number}>>>>}
 */
export const PIECES = Object.freeze(
  PIECE_TYPES.reduce((acc, type) => {
    const matrices = SHAPE_MATRICES[type];
    const rotations = matrices.map(matrixToCells);
    acc[type] = Object.freeze(rotations);
    return acc;
  }, /** @type {Record<string, unknown>} */ ({}))
);

/**
 * Table alternative : type → 4 rotations → matrice binaire brute (utile
 * pour le rendering ou le debug).
 */
export const PIECE_MATRICES = Object.freeze(
  PIECE_TYPES.reduce((acc, type) => {
    acc[type] = Object.freeze(
      SHAPE_MATRICES[type].map((m) => Object.freeze(m.map((row) => Object.freeze([...row]))))
    );
    return acc;
  }, /** @type {Record<string, unknown>} */ ({}))
);

// ============================================================================
// API PUBLIQUE
// ============================================================================

/**
 * Retourne les cellules occupées par une pièce dans une rotation donnée,
 * exprimées en coordonnées de la boîte locale (non translatées).
 *
 * @param {string} type - 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
 * @param {number} rotation - 0..3
 * @returns {ReadonlyArray<{x:number, y:number}>}
 */
export function getPieceCells(type, rotation) {
  const rotations = PIECES[type];
  if (!rotations) {
    throw new Error(`pieces.getPieceCells: type inconnu "${type}"`);
  }
  const r = ((rotation % 4) + 4) % 4;
  return rotations[r];
}

/**
 * Retourne les cellules absolues d'une pièce posée en (x, y) avec rotation r.
 *
 * @param {string} type
 * @param {number} rotation
 * @param {number} x - colonne du coin haut-gauche de la boîte
 * @param {number} y - ligne du coin haut-gauche de la boîte
 * @returns {Array<{x:number, y:number}>}
 */
export function getAbsoluteCells(type, rotation, x, y) {
  const local = getPieceCells(type, rotation);
  const out = new Array(local.length);
  for (let i = 0; i < local.length; i++) {
    const c = local[i];
    out[i] = { x: c.x + x, y: c.y + y };
  }
  return out;
}

/**
 * Retourne l'ID numérique stocké dans la grille pour un type de pièce.
 * @param {string} type
 * @returns {number}
 */
export function getPieceId(type) {
  const id = PIECE_ID[type];
  if (id === undefined) {
    throw new Error(`pieces.getPieceId: type inconnu "${type}"`);
  }
  return id;
}

/**
 * Retourne la taille de la boîte de rotation d'une pièce (3 ou 4).
 * @param {string} type
 * @returns {number}
 */
export function getBoxSize(type) {
  const size = PIECE_BOX_SIZE[type];
  if (size === undefined) {
    throw new Error(`pieces.getBoxSize: type inconnu "${type}"`);
  }
  return size;
}