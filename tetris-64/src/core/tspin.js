/**
 * tspin.js — Détection des T-Spins (standard + Mini).
 *
 * Règles Tetris Guideline pour T-Spin :
 *  - La pièce verrouillée doit être un T.
 *  - Le dernier mouvement ayant abouti au lock doit être une ROTATION
 *    (pas un move, pas un drop). On se fie à un flag `lastMoveWasRotation`.
 *  - On regarde les 4 "coins" de la boîte 3x3 du T. Un coin est "occupé"
 *    si la cellule correspondante est solide (bloc ou mur).
 *
 *  Classification :
 *  - Si ≥ 3 coins sont occupés :
 *      * Si les 2 "coins avant" (ceux vers lesquels pointe le T) sont
 *        occupés → T-Spin standard ("Proper").
 *      * Sinon → T-Spin Mini.
 *      * Cas spécial : si le kick utilisé est le dernier de la table
 *        (index 4), on force T-Spin standard (règle "TST kick").
 *  - Si < 3 coins occupés → pas de T-Spin.
 *
 * Les "coins avant" dépendent de l'orientation du T :
 *   rotation 0 : pointe vers le HAUT  → coins avant = haut-gauche, haut-droite
 *   rotation 1 : pointe vers la DROITE → coins avant = haut-droite, bas-droite
 *   rotation 2 : pointe vers le BAS   → coins avant = bas-gauche, bas-droite
 *   rotation 3 : pointe vers la GAUCHE → coins avant = haut-gauche, bas-gauche
 *
 * Module pur, sans DOM.
 */

import { isCellBlocked } from './board.js';

/**
 * Coins d'une boîte 3x3 du T en coordonnées locales :
 *   TL = (0, 0)   TR = (2, 0)
 *   BL = (0, 2)   BR = (2, 2)
 */
const CORNERS_LOCAL = Object.freeze([
  { key: 'TL', x: 0, y: 0 },
  { key: 'TR', x: 2, y: 0 },
  { key: 'BL', x: 0, y: 2 },
  { key: 'BR', x: 2, y: 2 },
]);

/**
 * Pour chaque rotation du T, quelles sont les clés des 2 coins "avant" ?
 * @type {Readonly<Record<number, string[]>>}
 */
const FRONT_CORNERS = Object.freeze({
  0: ['TL', 'TR'], // pointe en haut
  1: ['TR', 'BR'], // pointe à droite
  2: ['BL', 'BR'], // pointe en bas
  3: ['TL', 'BL'], // pointe à gauche
});

/**
 * @typedef {Object} TSpinResult
 * @property {'none' | 'mini' | 'proper'} kind
 * @property {number} cornersFilled - Nombre total de coins occupés (0..4).
 * @property {boolean} frontFilled  - Les 2 coins avant sont-ils occupés ?
 */

/**
 * Détecte si un lock correspond à un T-Spin, et de quel type.
 *
 * @param {import('./piece.js').ActivePiece} piece - La pièce T qui vient d'être lockée.
 * @param {import('./board.js').Grid} grid         - La grille AVANT le merge de la pièce.
 * @param {Object} context
 * @param {boolean} context.lastMoveWasRotation    - Dernier coup = rotation réussie ?
 * @param {number}  [context.lastKickIndex=0]      - Index du dernier kick (0..4).
 * @returns {TSpinResult}
 */
export function detectTSpin(piece, grid, context) {
  if (piece.type !== 'T') {
    return { kind: 'none', cornersFilled: 0, frontFilled: false };
  }
  if (!context.lastMoveWasRotation) {
    return { kind: 'none', cornersFilled: 0, frontFilled: false };
  }

  // Compte les coins occupés
  let filled = 0;
  /** @type {Record<string, boolean>} */
  const cornerState = {};
  for (let i = 0; i < CORNERS_LOCAL.length; i++) {
    const c = CORNERS_LOCAL[i];
    const ax = piece.x + c.x;
    const ay = piece.y + c.y;
    const blocked = isCellBlocked(grid, ax, ay);
    cornerState[c.key] = blocked;
    if (blocked) filled++;
  }

  if (filled < 3) {
    return { kind: 'none', cornersFilled: filled, frontFilled: false };
  }

  const frontKeys = FRONT_CORNERS[piece.rotation] || [];
  const frontFilled =
    frontKeys.length === 2 &&
    cornerState[frontKeys[0]] === true &&
    cornerState[frontKeys[1]] === true;

  // Règle TST kick : si dernier kick est l'index 4 (le "long" kick),
  // on promeut un Mini en T-Spin standard.
  const isTSTKick = context.lastKickIndex === 4;

  if (frontFilled || isTSTKick) {
    return { kind: 'proper', cornersFilled: filled, frontFilled: true };
  }
  return { kind: 'mini', cornersFilled: filled, frontFilled: false };
}

/**
 * Classifie un clear en fonction d'un T-Spin éventuel et du nombre de lignes.
 * Retourne un identifiant compatible avec SCORE_BASE de constants.js.
 *
 * @param {TSpinResult} tspin
 * @param {number} linesCleared - 0..4
 * @returns {string} Identifiant de scoring ('SINGLE', 'TETRIS', 'TSPIN_DOUBLE', ...).
 */
export function classifyClear(tspin, linesCleared) {
  if (tspin.kind === 'proper') {
    if (linesCleared === 0) return 'TSPIN_NO_LINES';
    if (linesCleared === 1) return 'TSPIN_SINGLE';
    if (linesCleared === 2) return 'TSPIN_DOUBLE';
    if (linesCleared === 3) return 'TSPIN_TRIPLE';
  }
  if (tspin.kind === 'mini') {
    if (linesCleared === 0) return 'TSPIN_MINI_NO_LINES';
    if (linesCleared === 1) return 'TSPIN_MINI_SINGLE';
    // Un Mini ne peut pratiquement pas faire plus qu'une ligne ; on retombe sur standards.
    if (linesCleared === 2) return 'DOUBLE';
    if (linesCleared === 3) return 'TRIPLE';
  }
  // Clears standards
  if (linesCleared === 1) return 'SINGLE';
  if (linesCleared === 2) return 'DOUBLE';
  if (linesCleared === 3) return 'TRIPLE';
  if (linesCleared === 4) return 'TETRIS';
  return 'NONE';
}

/**
 * Helper : un clear est-il éligible au Back-to-Back ?
 * Délégué à la Set exportée par constants.js côté scoring.
 * Ici on fournit juste un helper interne utilisé par les tests.
 *
 * @param {string} clearId
 * @returns {boolean}
 */
export function isB2BEligibleClear(clearId) {
  return (
    clearId === 'TETRIS' ||
    clearId === 'TSPIN_SINGLE' ||
    clearId === 'TSPIN_DOUBLE' ||
    clearId === 'TSPIN_TRIPLE' ||
    clearId === 'TSPIN_MINI_SINGLE'
  );
}