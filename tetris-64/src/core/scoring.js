/**
 * scoring.js — Calcul de score, niveau, combos, Back-to-Back.
 *
 * Applique le scoring Tetris Guideline standard :
 *  - Base points dépendant du type de clear (SINGLE, TETRIS, TSPIN_*, etc.).
 *  - Multiplicateur de niveau (base × niveau).
 *  - Multiplicateur Back-to-Back (×1.5) pour clears éligibles consécutifs.
 *  - Combo : +50 × niveau × compteur, accumulé sur clears consécutifs.
 *  - Soft drop : +1 par cellule parcourue.
 *  - Hard drop : +2 par cellule parcourue.
 *  - Perfect Clear : bonus additionnel selon nombre de lignes.
 *
 * Le niveau augmente tous les LINES_PER_LEVEL (10) lignes effacées.
 *
 * Module pur : aucune dépendance DOM, aucun effet de bord.
 * Les fonctions retournent toujours un nouvel objet d'état.
 */

import {
    SCORE_BASE,
    B2B_MULTIPLIER,
    B2B_ELIGIBLE_CLEARS,
    LINES_PER_LEVEL,
    MAX_LEVEL,
  } from './constants.js';
  
  // ============================================================================
  // TYPES
  // ============================================================================
  
  /**
   * @typedef {Object} ScoreState
   * @property {number} score       - Score total.
   * @property {number} level       - Niveau courant (1+).
   * @property {number} lines       - Lignes totales effacées.
   * @property {number} combo       - Compteur de combo (-1 = pas de combo actif).
   * @property {number} b2b         - Compteur de Back-to-Back (0 = pas de B2B).
   * @property {number} startLevel  - Niveau de départ (pour reset).
   */
  
  /**
   * @typedef {Object} ClearEvent
   * @property {string} clearId          - 'SINGLE' | 'TETRIS' | 'TSPIN_DOUBLE' | ... | 'NONE'
   * @property {number} linesCleared     - 0..4.
   * @property {boolean} perfectClear    - Board entièrement vide après clear.
   * @property {number} [softDropCells]  - Cellules de soft drop cumulées pour cette pièce.
   * @property {number} [hardDropCells]  - Cellules de hard drop pour cette pièce.
   */
  
  /**
   * @typedef {Object} ScoreDelta
   * @property {number} points         - Points gagnés ce tour.
   * @property {number} linePoints     - Sous-total des points de ligne.
   * @property {number} comboPoints    - Points de combo gagnés.
   * @property {number} dropPoints     - Points de soft + hard drop.
   * @property {number} perfectPoints  - Bonus Perfect Clear.
   * @property {number} b2bMultiplier  - 1 ou 1.5.
   * @property {number} comboLength    - Longueur du combo APRÈS cet event.
   * @property {number} b2bLength      - Longueur du B2B APRÈS cet event.
   * @property {boolean} levelUp       - Niveau monté ce tour ?
   * @property {number} newLevel       - Niveau APRÈS cet event.
   */
  
  // ============================================================================
  // CRÉATION / RESET
  // ============================================================================
  
  /**
   * Crée un état de score frais pour un niveau de départ donné.
   * @param {number} [startLevel=1]
   * @returns {ScoreState}
   */
  export function createScoreState(startLevel = 1) {
    const level = Math.max(1, Math.min(MAX_LEVEL, startLevel | 0));
    return {
      score: 0,
      level,
      lines: 0,
      combo: -1,
      b2b: 0,
      startLevel: level,
    };
  }
  
  // ============================================================================
  // HELPERS INTERNES
  // ============================================================================
  
  /**
   * Retourne le niveau correspondant à un nombre total de lignes effacées,
   * borné par MAX_LEVEL et en partant d'un niveau de départ.
   *
   * @param {number} totalLines
   * @param {number} startLevel
   * @returns {number}
   */
  function computeLevel(totalLines, startLevel) {
    const levelFromLines = 1 + Math.floor(totalLines / LINES_PER_LEVEL);
    return Math.min(MAX_LEVEL, Math.max(startLevel, levelFromLines));
  }
  
  /**
   * Retourne le score de base pour un clearId donné (hors multiplicateurs).
   * @param {string} clearId
   * @returns {number}
   */
  function baseForClear(clearId) {
    const v = /** @type {Record<string, number>} */ (SCORE_BASE)[clearId];
    return typeof v === 'number' ? v : 0;
  }
  
  /**
   * Retourne le bonus Perfect Clear pour un nombre de lignes donné.
   * @param {number} lines
   * @returns {number}
   */
  function perfectClearBonus(lines) {
    if (lines === 1) return SCORE_BASE.PERFECT_CLEAR_SINGLE;
    if (lines === 2) return SCORE_BASE.PERFECT_CLEAR_DOUBLE;
    if (lines === 3) return SCORE_BASE.PERFECT_CLEAR_TRIPLE;
    if (lines === 4) return SCORE_BASE.PERFECT_CLEAR_TETRIS;
    return 0;
  }
  
  /**
   * Un clear "maintient" le combo dès qu'il efface au moins une ligne.
   * @param {number} linesCleared
   * @returns {boolean}
   */
  function maintainsCombo(linesCleared) {
    return linesCleared > 0;
  }
  
  // ============================================================================
  // API PUBLIQUE
  // ============================================================================
  
  /**
   * Applique un événement de clear à l'état de score.
   *
   * @param {ScoreState} state
   * @param {ClearEvent} event
   * @returns {{ state: ScoreState, delta: ScoreDelta }}
   */
  export function applyClearEvent(state, event) {
    const prevLevel = state.level;
    const { clearId, linesCleared, perfectClear } = event;
    const softDropCells = event.softDropCells ?? 0;
    const hardDropCells = event.hardDropCells ?? 0;
  
    // 1) Points de drop (toujours crédités, niveau-indépendants dans la guideline standard).
    const dropPoints =
      softDropCells * SCORE_BASE.SOFT_DROP_PER_CELL +
      hardDropCells * SCORE_BASE.HARD_DROP_PER_CELL;
  
    // 2) Points de ligne + B2B
    let linePoints = 0;
    let b2bMultiplier = 1;
    let b2b = state.b2b;
  
    if (clearId !== 'NONE' && baseForClear(clearId) > 0) {
      const isEligible = B2B_ELIGIBLE_CLEARS.has(clearId);
      const base = baseForClear(clearId);
  
      if (linesCleared > 0 && isEligible && state.b2b > 0) {
        // B2B maintenu sur un clear éligible qui fait des lignes
        b2bMultiplier = B2B_MULTIPLIER;
        b2b = state.b2b + 1;
      } else if (linesCleared > 0 && isEligible) {
        // Démarre un B2B
        b2b = 1;
      } else if (linesCleared > 0 && !isEligible) {
        // Clear non-éligible avec lignes → casse le B2B
        b2b = 0;
      }
      // Si 0 lignes (T-spin no lines / mini no lines) → B2B inchangé.
  
      linePoints = Math.round(base * state.level * b2bMultiplier);
    }
  
    // 3) Combo
    let combo = state.combo;
    let comboPoints = 0;
    if (maintainsCombo(linesCleared)) {
      combo = state.combo + 1; // -1 -> 0 -> 1 -> ...
      if (combo > 0) {
        comboPoints = SCORE_BASE.COMBO_PER_STEP * combo * state.level;
      }
    } else {
      combo = -1;
    }
  
    // 4) Perfect Clear
    const perfectPoints = perfectClear && linesCleared > 0
      ? perfectClearBonus(linesCleared) * state.level
      : 0;
  
    // 5) Total
    const points = linePoints + comboPoints + dropPoints + perfectPoints;
  
    // 6) Progression niveau
    const newLines = state.lines + linesCleared;
    const newLevel = computeLevel(newLines, state.startLevel);
  
    const nextState = {
      ...state,
      score: state.score + points,
      level: newLevel,
      lines: newLines,
      combo,
      b2b,
    };
  
    const delta = {
      points,
      linePoints,
      comboPoints,
      dropPoints,
      perfectPoints,
      b2bMultiplier,
      comboLength: Math.max(0, combo),
      b2bLength: b2b,
      levelUp: newLevel > prevLevel,
      newLevel,
    };
  
    return { state: nextState, delta };
  }
  
  /**
   * Ajoute uniquement des points de drop (sans toucher au combo ni au B2B).
   * Utilisé pendant la chute pour créditer soft drop progressivement si désiré.
   *
   * @param {ScoreState} state
   * @param {number} softDropCells
   * @param {number} hardDropCells
   * @returns {{ state: ScoreState, points: number }}
   */
  export function addDropPoints(state, softDropCells, hardDropCells) {
    const points =
      softDropCells * SCORE_BASE.SOFT_DROP_PER_CELL +
      hardDropCells * SCORE_BASE.HARD_DROP_PER_CELL;
    return {
      state: { ...state, score: state.score + points },
      points,
    };
  }
  
  /**
   * Calcule le niveau courant à partir d'un total de lignes (helper pur).
   * @param {number} totalLines
   * @param {number} [startLevel=1]
   * @returns {number}
   */
  export function levelForLines(totalLines, startLevel = 1) {
    return computeLevel(totalLines, startLevel);
  }
  
  /**
   * Helper : retourne les points "bruts" que vaudrait un clear donné au
   * niveau fourni, sans combo ni B2B. Utile pour l'UI de prévisualisation.
   *
   * @param {string} clearId
   * @param {number} level
   * @returns {number}
   */
  export function previewClearPoints(clearId, level) {
    return baseForClear(clearId) * Math.max(1, level);
  }