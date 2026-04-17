/**
 * srs.js — Super Rotation System (wall kicks)
 *
 * Implémente le SRS standard Tetris Guideline : lorsqu'une rotation naïve
 * produirait une collision, on teste une séquence de 5 offsets (kicks) et
 * on applique le premier qui passe. Si aucun ne passe, la rotation est
 * refusée.
 *
 * Deux tables de kicks distinctes :
 *  - JLSTZ : pièces "classiques" 3x3
 *  - I     : pièce 4x4 (kicks différents, plus spécifiques)
 *  - O     : pas de rotation effective (no-op)
 *
 * Les kicks sont définis pour les transitions CW (0→R, R→2, 2→L, L→0) et
 * CCW (0→L, L→2, 2→R, R→0). La rotation 180° n'est pas dans le guideline
 * original ; on fournit une table symétrique simple utilisée par plusieurs
 * implémentations modernes (TETR.IO-style) : [(0,0), (+1,0), (-1,0), (0,+1)].
 *
 * Module pur : aucune dépendance au DOM ni à un état global.
 */

import { collides } from './board.js';
import { getAbsoluteCells } from './pieces.js';
import { rotate } from './piece.js';

// ============================================================================
// TABLES DE KICKS SRS
// ============================================================================

/**
 * Les états de rotation : 0 (spawn), 1 = R (CW), 2 = 180°, 3 = L (CCW).
 * Les kicks sont exprimés en décalages (dx, dy) appliqués APRÈS la rotation
 * naïve. Convention : y croît vers le BAS, donc un "kick up" a dy = -1.
 */

/** Kicks pour J, L, S, T, Z (boîte 3x3). */
const KICKS_JLSTZ = Object.freeze({
  // CW (0->R, R->2, 2->L, L->0)
  '0->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3->0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  // CCW (0->L, L->2, 2->R, R->0)
  '0->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3->2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
});

/** Kicks pour I (boîte 4x4, table spécifique). */
const KICKS_I = Object.freeze({
  // CW
  '0->1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1->2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2->3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3->0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  // CCW
  '0->3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '3->2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '2->1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '1->0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
});

/**
 * Kicks 180° : table symétrique simple, inspirée des implémentations modernes.
 * Identique pour toutes les pièces (O exclue car no-op).
 */
const KICKS_180 = Object.freeze({
  '0->2': [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
  '1->3': [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]],
  '2->0': [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
  '3->1': [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]],
});

// ============================================================================
// API PRIVÉE
// ============================================================================

/**
 * Retourne la table de kicks appropriée pour un type de pièce.
 * @param {string} type
 * @returns {Record<string, number[][]> | null}  null si la pièce ne tourne pas (O).
 */
function getKickTable(type) {
  if (type === 'O') return null;
  if (type === 'I') return KICKS_I;
  return KICKS_JLSTZ;
}

/**
 * Construit la clé "from->to" à partir de deux états de rotation.
 * @param {number} from
 * @param {number} to
 * @returns {string}
 */
function kickKey(from, to) {
  return `${from}->${to}`;
}

/**
 * Détermine le type de rotation (CW=+1, CCW=-1, 180°=+2) à partir du delta.
 * @param {number} steps
 * @returns {1 | -1 | 2}
 */
function normalizeSteps(steps) {
  const s = ((steps % 4) + 4) % 4;
  if (s === 1) return 1;
  if (s === 3) return -1;
  if (s === 2) return 2;
  // 0 => no-op, traité en amont
  return 1;
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

/**
 * @typedef {Object} RotationResult
 * @property {boolean} success           - Rotation acceptée.
 * @property {import('./piece.js').ActivePiece} piece - Nouvelle pièce (ou inchangée si échec).
 * @property {number} kickIndex          - Index du kick utilisé (0 = rotation naïve).
 * @property {[number, number]} kickOffset - Offset (dx, dy) appliqué.
 * @property {number} fromRotation       - Rotation de départ.
 * @property {number} toRotation         - Rotation d'arrivée (si succès).
 */

/**
 * Tente une rotation avec SRS : essaie les 5 offsets en séquence et
 * retourne le premier qui évite la collision.
 *
 * @param {import('./piece.js').ActivePiece} piece
 * @param {import('./board.js').Grid} grid
 * @param {number} steps - +1 (CW), -1 (CCW), +2 (180°).
 * @returns {RotationResult}
 */
export function tryRotate(piece, grid, steps) {
  const normalized = normalizeSteps(steps);

  // O ne tourne pas : on accepte en no-op pour simplifier le flux appelant.
  if (piece.type === 'O') {
    return {
      success: true,
      piece,
      kickIndex: 0,
      kickOffset: [0, 0],
      fromRotation: piece.rotation,
      toRotation: piece.rotation,
    };
  }

  const fromRot = piece.rotation;
  const rotated = rotate(piece, normalized);
  const toRot = rotated.rotation;

  // Sélection de la table de kicks
  let table;
  if (normalized === 2) {
    table = KICKS_180;
  } else {
    table = getKickTable(piece.type);
  }

  const key = kickKey(fromRot, toRot);
  const kicks = table ? table[key] : null;

  // Fallback : pas de kicks définis → on teste uniquement (0,0).
  const candidates = kicks && kicks.length > 0 ? kicks : [[0, 0]];

  for (let i = 0; i < candidates.length; i++) {
    const [dx, dy] = candidates[i];
    const candidate = {
      ...rotated,
      x: rotated.x + dx,
      y: rotated.y + dy,
    };
    const cells = getAbsoluteCells(candidate.type, candidate.rotation, candidate.x, candidate.y);
    if (!collides(grid, cells)) {
      return {
        success: true,
        piece: candidate,
        kickIndex: i,
        kickOffset: [dx, dy],
        fromRotation: fromRot,
        toRotation: toRot,
      };
    }
  }

  // Aucun kick ne passe : rotation refusée.
  return {
    success: false,
    piece,
    kickIndex: -1,
    kickOffset: [0, 0],
    fromRotation: fromRot,
    toRotation: toRot,
  };
}

/**
 * Helper : retourne la liste brute des kicks pour une transition donnée.
 * Utile pour tests et debug.
 *
 * @param {string} type
 * @param {number} from
 * @param {number} to
 * @returns {ReadonlyArray<[number, number]>}
 */
export function getKicksFor(type, from, to) {
  if (type === 'O') return [[0, 0]];

  const delta = ((to - from) % 4 + 4) % 4;
  let table;
  if (delta === 2) {
    table = KICKS_180;
  } else {
    table = getKickTable(type);
  }

  const key = kickKey(from, to);
  const kicks = table ? table[key] : null;
  return kicks ? /** @type {ReadonlyArray<[number,number]>} */ (kicks) : [[0, 0]];
}

// Exports de tables pour tests
export const _internal = Object.freeze({
  KICKS_JLSTZ,
  KICKS_I,
  KICKS_180,
});