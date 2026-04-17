/**
 * board.js — Grille de jeu et opérations associées.
 *
 * La grille est un tableau 2D d'entiers :
 *   0 = vide
 *   1..7 = id d'une pièce verrouillée (voir PIECE_ID dans constants.js)
 *
 * Dimensions :
 *   - 10 colonnes
 *   - 22 lignes (2 cachées en haut + 20 visibles)
 *   - y = 0 tout en haut, y croît vers le bas
 *
 * Ce module est pur : aucune dépendance au DOM, aucun effet de bord global.
 * Toutes les fonctions qui modifient la grille retournent une nouvelle
 * structure immuable (on ne mute jamais les grilles passées en paramètre),
 * à l'exception de createBoard qui alloue la structure mutable initiale.
 */

import {
    BOARD_COLS,
    BOARD_TOTAL_ROWS,
    BOARD_VISIBLE_ROWS,
    BOARD_HIDDEN_ROWS,
    CELL_EMPTY,
  } from './constants.js';
  
  // ============================================================================
  // TYPES
  // ============================================================================
  
  /**
   * @typedef {number[][]} Grid
   * Grille rectangulaire grid[y][x], avec y ∈ [0, BOARD_TOTAL_ROWS[,
   * x ∈ [0, BOARD_COLS[. Une ligne = un tableau de BOARD_COLS entiers.
   */
  
  /**
   * @typedef {Object} Board
   * @property {Grid} grid
   * @property {number} cols
   * @property {number} rows
   * @property {number} visibleRows
   * @property {number} hiddenRows
   */
  
  // ============================================================================
  // CRÉATION / CLONE
  // ============================================================================
  
  /**
   * Crée une grille vide 22×10.
   * @returns {Grid}
   */
  export function createEmptyGrid() {
    const grid = new Array(BOARD_TOTAL_ROWS);
    for (let y = 0; y < BOARD_TOTAL_ROWS; y++) {
      grid[y] = new Array(BOARD_COLS).fill(CELL_EMPTY);
    }
    return grid;
  }
  
  /**
   * Crée un nouveau board frais.
   * @returns {Board}
   */
  export function createBoard() {
    return {
      grid: createEmptyGrid(),
      cols: BOARD_COLS,
      rows: BOARD_TOTAL_ROWS,
      visibleRows: BOARD_VISIBLE_ROWS,
      hiddenRows: BOARD_HIDDEN_ROWS,
    };
  }
  
  /**
   * Clone profond d'une grille (utile pour simulations et tests).
   * @param {Grid} grid
   * @returns {Grid}
   */
  export function cloneGrid(grid) {
    const out = new Array(grid.length);
    for (let y = 0; y < grid.length; y++) {
      out[y] = [...grid[y]];
    }
    return out;
  }
  
  // ============================================================================
  // ACCÈS / VALIDATION
  // ============================================================================
  
  /**
   * Vérifie si une position (x, y) est dans les bornes de la grille.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  export function inBounds(x, y) {
    return x >= 0 && x < BOARD_COLS && y >= 0 && y < BOARD_TOTAL_ROWS;
  }
  
  /**
   * Retourne la valeur d'une cellule, ou CELL_EMPTY si hors grille haute,
   * ou une valeur "mur" (1) pour toute position horizontalement hors grille
   * ou sous le fond. Utilisé pour la détection de collision.
   *
   * @param {Grid} grid
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  export function getCell(grid, x, y) {
    if (x < 0 || x >= BOARD_COLS) return 1; // hors latéral → solide
    if (y >= BOARD_TOTAL_ROWS) return 1;    // sous le fond → solide
    if (y < 0) return CELL_EMPTY;           // au-dessus du haut → vide (permet spawn)
    return grid[y][x];
  }
  
  /**
   * Vrai si la cellule est occupée (id pièce > 0). Considère hors-grille
   * comme occupé sur les côtés et sous le fond (murs implicites).
   *
   * @param {Grid} grid
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  export function isCellBlocked(grid, x, y) {
    return getCell(grid, x, y) !== CELL_EMPTY;
  }
  
  // ============================================================================
  // COLLISION
  // ============================================================================
  
  /**
   * Teste si un ensemble de cellules absolues `{x,y}` entre en collision avec
   * la grille ou sort des bornes latérales/inférieures.
   *
   * @param {Grid} grid
   * @param {Array<{x:number,y:number}>} cells
   * @returns {boolean}
   */
  export function collides(grid, cells) {
    for (let i = 0; i < cells.length; i++) {
      const { x, y } = cells[i];
      if (isCellBlocked(grid, x, y)) return true;
    }
    return false;
  }
  
  // ============================================================================
  // MERGE (lock-in)
  // ============================================================================
  
  /**
   * Fusionne des cellules occupées par une pièce verrouillée dans la grille.
   * Retourne une NOUVELLE grille (les grilles passées ne sont jamais mutées).
   *
   * Les cellules hors-grille (y < 0 par exemple) sont simplement ignorées ;
   * c'est la détection de game over qui traite le cas "spawn bloqué".
   *
   * @param {Grid} grid
   * @param {Array<{x:number,y:number}>} cells
   * @param {number} pieceId - 1..7
   * @returns {Grid}
   */
  export function mergePiece(grid, cells, pieceId) {
    const out = cloneGrid(grid);
    for (let i = 0; i < cells.length; i++) {
      const { x, y } = cells[i];
      if (y < 0 || y >= BOARD_TOTAL_ROWS) continue;
      if (x < 0 || x >= BOARD_COLS) continue;
      out[y][x] = pieceId;
    }
    return out;
  }
  
  // ============================================================================
  // LINE CLEAR
  // ============================================================================
  
  /**
   * Détecte les indices de lignes pleines.
   * @param {Grid} grid
   * @returns {number[]} Indices y triés par ordre croissant.
   */
  export function findFullLines(grid) {
    const lines = [];
    for (let y = 0; y < BOARD_TOTAL_ROWS; y++) {
      const row = grid[y];
      let full = true;
      for (let x = 0; x < BOARD_COLS; x++) {
        if (row[x] === CELL_EMPTY) {
          full = false;
          break;
        }
      }
      if (full) lines.push(y);
    }
    return lines;
  }
  
  /**
   * Retire des lignes de la grille et fait "tomber" le reste de la grille
   * de la bonne quantité. Retourne une nouvelle grille.
   *
   * @param {Grid} grid
   * @param {number[]} lineIndices
   * @returns {Grid}
   */
  export function clearLines(grid, lineIndices) {
    if (lineIndices.length === 0) return cloneGrid(grid);
  
    // Ensemble pour recherche O(1)
    const toRemove = new Set(lineIndices);
  
    // On conserve les lignes non-clearées dans leur ordre vertical.
    const kept = [];
    for (let y = 0; y < BOARD_TOTAL_ROWS; y++) {
      if (!toRemove.has(y)) kept.push([...grid[y]]);
    }
  
    // On préfixe des lignes vides en haut pour recompléter la hauteur.
    const missing = BOARD_TOTAL_ROWS - kept.length;
    const out = new Array(BOARD_TOTAL_ROWS);
    for (let y = 0; y < missing; y++) {
      out[y] = new Array(BOARD_COLS).fill(CELL_EMPTY);
    }
    for (let i = 0; i < kept.length; i++) {
      out[missing + i] = kept[i];
    }
    return out;
  }
  
  // ============================================================================
  // UTILITAIRES
  // ============================================================================
  
  /**
   * Vrai si la grille est complètement vide (perfect clear check).
   * @param {Grid} grid
   * @returns {boolean}
   */
  export function isBoardEmpty(grid) {
    for (let y = 0; y < BOARD_TOTAL_ROWS; y++) {
      const row = grid[y];
      for (let x = 0; x < BOARD_COLS; x++) {
        if (row[x] !== CELL_EMPTY) return false;
      }
    }
    return true;
  }
  
  /**
   * Calcule la distance "fantôme" : de combien de cellules une pièce peut
   * tomber avant collision. Retourne 0 si elle ne peut pas tomber du tout.
   *
   * @param {Grid} grid
   * @param {Array<{x:number,y:number}>} cells - Cellules absolues actuelles.
   * @returns {number}
   */
  export function dropDistance(grid, cells) {
    let dist = 0;
    // Tant que le shift de (dist+1) ne produit pas collision, on continue.
    // Limite supérieure sécurisée pour éviter tout risque de boucle infinie.
    while (dist < BOARD_TOTAL_ROWS) {
      let blocked = false;
      const d = dist + 1;
      for (let i = 0; i < cells.length; i++) {
        const { x, y } = cells[i];
        if (isCellBlocked(grid, x, y + d)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      dist = d;
    }
    return dist;
  }
  
  /**
   * Retourne la hauteur max atteinte par la pile (0 = vide, BOARD_TOTAL_ROWS = plein).
   * Utilisé pour debug et certains effets.
   *
   * @param {Grid} grid
   * @returns {number}
   */
  export function stackHeight(grid) {
    for (let y = 0; y < BOARD_TOTAL_ROWS; y++) {
      const row = grid[y];
      for (let x = 0; x < BOARD_COLS; x++) {
        if (row[x] !== CELL_EMPTY) {
          return BOARD_TOTAL_ROWS - y;
        }
      }
    }
    return 0;
  }
  
  /**
   * Représentation debug lisible (useful pour tests et console).
   * @param {Grid} grid
   * @returns {string}
   */
  export function debugGrid(grid) {
    return grid
      .map((row) => row.map((c) => (c === CELL_EMPTY ? '.' : String(c))).join(''))
      .join('\n');
  }