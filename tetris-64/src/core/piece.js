/**
 * piece.js — Représentation d'une pièce active en jeu.
 *
 * Une "active piece" est une pièce en cours de chute, avec :
 *  - un type (I, O, T, S, Z, J, L)
 *  - une position (x, y) du coin haut-gauche de sa boîte de rotation
 *  - un état de rotation (0..3)
 *
 * Ce module fournit un constructeur pur et des helpers pour dériver
 * les cellules absolues, la pièce translatée, la pièce tournée, etc.
 * Aucune collision n'est testée ici : c'est le rôle du moteur (game.js)
 * en utilisant board.collides() + srs.tryRotate().
 *
 * Module pur, immutable : chaque opération retourne une nouvelle pièce.
 */

import { getAbsoluteCells, getPieceCells, getPieceId, getBoxSize } from './pieces.js';
import { SPAWN_X, SPAWN_Y } from './constants.js';

/**
 * @typedef {Object} ActivePiece
 * @property {string} type        - 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
 * @property {number} x           - Colonne du coin haut-gauche de la boîte.
 * @property {number} y           - Ligne du coin haut-gauche de la boîte.
 * @property {number} rotation    - État de rotation (0..3).
 * @property {number} id          - ID numérique (1..7) pour la grille.
 */

/**
 * Crée une pièce active à sa position de spawn.
 *
 * Le spawn Tetris Guideline place les pièces horizontalement en haut du
 * champ, centrées sur les colonnes 3–6 (pour les pièces 3-wide) ou 3–6
 * (pour le I en 4-wide). Comme on utilise la même origine (coin haut-gauche
 * de la boîte) pour toutes les pièces, SPAWN_X = 3 fonctionne correctement.
 *
 * @param {string} type
 * @returns {ActivePiece}
 */
export function spawnPiece(type) {
  return {
    type,
    x: SPAWN_X,
    y: SPAWN_Y,
    rotation: 0,
    id: getPieceId(type),
  };
}

/**
 * Crée une pièce active à partir d'un état arbitraire.
 * @param {string} type
 * @param {number} x
 * @param {number} y
 * @param {number} rotation
 * @returns {ActivePiece}
 */
export function createPiece(type, x, y, rotation = 0) {
  return {
    type,
    x,
    y,
    rotation: ((rotation % 4) + 4) % 4,
    id: getPieceId(type),
  };
}

/**
 * Retourne les cellules absolues occupées par la pièce dans la grille.
 * @param {ActivePiece} piece
 * @returns {Array<{x:number, y:number}>}
 */
export function getCells(piece) {
  return getAbsoluteCells(piece.type, piece.rotation, piece.x, piece.y);
}

/**
 * Retourne les cellules locales (dans la boîte de rotation, non translatées).
 * @param {ActivePiece} piece
 * @returns {ReadonlyArray<{x:number, y:number}>}
 */
export function getLocalCells(piece) {
  return getPieceCells(piece.type, piece.rotation);
}

/**
 * Retourne la taille de la boîte de rotation (3 pour JLSTZ, 4 pour I/O).
 * @param {ActivePiece} piece
 * @returns {number}
 */
export function getPieceBoxSize(piece) {
  return getBoxSize(piece.type);
}

/**
 * Translation : déplace la pièce de (dx, dy) sans vérifier les collisions.
 * @param {ActivePiece} piece
 * @param {number} dx
 * @param {number} dy
 * @returns {ActivePiece}
 */
export function translate(piece, dx, dy) {
  return {
    ...piece,
    x: piece.x + dx,
    y: piece.y + dy,
  };
}

/**
 * Rotation : incrémente l'état de rotation de `steps` (±1 ou ±2).
 * N'applique PAS les kicks SRS : c'est le rôle de srs.tryRotate().
 * @param {ActivePiece} piece
 * @param {number} steps
 * @returns {ActivePiece}
 */
export function rotate(piece, steps) {
  const nextRot = ((piece.rotation + steps) % 4 + 4) % 4;
  return {
    ...piece,
    rotation: nextRot,
  };
}

/**
 * Retourne le rectangle englobant (en coordonnées absolues) des cellules
 * occupées par la pièce. Utile pour le rendu et le debug.
 * @param {ActivePiece} piece
 * @returns {{minX:number, maxX:number, minY:number, maxY:number}}
 */
export function getBounds(piece) {
  const cells = getCells(piece);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < cells.length; i++) {
    const { x, y } = cells[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Clone superficiel (utile pour simulations).
 * @param {ActivePiece} piece
 * @returns {ActivePiece}
 */
export function clonePiece(piece) {
  return { ...piece };
}

/**
 * Égalité structurelle entre deux pièces (pour tests et diffing).
 * @param {ActivePiece} a
 * @param {ActivePiece} b
 * @returns {boolean}
 */
export function piecesEqual(a, b) {
  return (
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.rotation === b.rotation
  );
}