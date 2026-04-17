/**
 * storage.js — Persistance (high scores, meilleur temps sprint, settings).
 *
 * Wrapper typé au-dessus de localStorage pour :
 *  - high scores marathon (liste triée)
 *  - meilleur temps sprint 40L
 *  - préférences utilisateur non audio (l'audio gère ses propres settings)
 *
 * L'API est défensive : toutes les opérations catch les erreurs (quota,
 * mode privé Safari, localStorage indisponible) et retournent des valeurs
 * par défaut. Aucune dépendance DOM : testable en Node avec un mock.
 */

import {
    STORAGE_KEYS,
    HIGH_SCORES_LIMIT,
    GAME_MODES,
  } from '../core/constants.js';
  
  /**
   * @typedef {Object} HighScoreEntry
   * @property {number} score
   * @property {number} level
   * @property {number} lines
   * @property {number} timeMs
   * @property {string} date        - ISO
   * @property {string} [mode]
   */
  
  /**
   * @typedef {Object} SprintRecord
   * @property {number} timeMs
   * @property {number} piecesPlaced
   * @property {string} date
   * @property {number} [score]
   */
  
  /**
   * @typedef {Object} Preferences
   * @property {boolean} [reducedMotion]
   * @property {boolean} [shakeEnabled]
   * @property {boolean} [ghostEnabled]
   * @property {'left'|'right'|'both'} [tSpinDetection]
   * @property {number} [startLevel]
   */
  
  /**
   * @param {Object} [options]
   * @param {Storage} [options.store]  - Custom store (tests / SSR).
   */
  export function createStorage(options = {}) {
    const store = options.store ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const available = !!store;
  
    // -------------------------------------------------------------------
    // HELPERS BAS NIVEAU
    // -------------------------------------------------------------------
  
    /**
     * @template T
     * @param {string} key
     * @param {T} fallback
     * @returns {T}
     */
    function readJSON(key, fallback) {
      if (!available) return fallback;
      try {
        const raw = store.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    }
  
    /**
     * @param {string} key
     * @param {any} value
     * @returns {boolean}
     */
    function writeJSON(key, value) {
      if (!available) return false;
      try {
        store.setItem(key, JSON.stringify(value));
        return true;
      } catch (_) {
        return false;
      }
    }
  
    /**
     * @param {string} key
     */
    function remove(key) {
      if (!available) return;
      try { store.removeItem(key); } catch (_) { /* ignore */ }
    }
  
    // -------------------------------------------------------------------
    // HIGH SCORES (par mode)
    // -------------------------------------------------------------------
  
    /**
     * @param {string} [mode=GAME_MODES.MARATHON]
     * @returns {HighScoreEntry[]}
     */
    function getHighScores(mode = GAME_MODES.MARATHON) {
      const all = readJSON(STORAGE_KEYS.HIGH_SCORES, {});
      const list = Array.isArray(all[mode]) ? all[mode] : [];
      // Copie défensive
      return list.map((e) => ({ ...e }));
    }
  
    /**
     * Ajoute un score s'il bat au moins l'un des existants (ou si la liste
     * a moins de HIGH_SCORES_LIMIT entrées). Retourne le rang (1-based) ou 0
     * si non inséré.
     *
     * @param {Omit<HighScoreEntry, 'date'> & { date?: string }} entry
     * @param {string} [mode=GAME_MODES.MARATHON]
     * @returns {number}
     */
    function addHighScore(entry, mode = GAME_MODES.MARATHON) {
      const all = readJSON(STORAGE_KEYS.HIGH_SCORES, {});
      const list = Array.isArray(all[mode]) ? [...all[mode]] : [];
      const full = {
        score: entry.score | 0,
        level: entry.level | 0,
        lines: entry.lines | 0,
        timeMs: entry.timeMs | 0,
        mode,
        date: entry.date ?? new Date().toISOString(),
      };
      list.push(full);
      list.sort((a, b) => b.score - a.score);
      const trimmed = list.slice(0, HIGH_SCORES_LIMIT);
      const rank = trimmed.indexOf(full) + 1;
      all[mode] = trimmed;
      writeJSON(STORAGE_KEYS.HIGH_SCORES, all);
      return rank; // 0 si éjecté au trim
    }
  
    /**
     * @param {number} score
     * @param {string} [mode]
     * @returns {boolean}
     */
    function isHighScore(score, mode = GAME_MODES.MARATHON) {
      const list = getHighScores(mode);
      if (list.length < HIGH_SCORES_LIMIT) return true;
      return score > list[list.length - 1].score;
    }
  
    /**
     * @param {string} [mode]
     */
    function resetHighScores(mode) {
      if (mode) {
        const all = readJSON(STORAGE_KEYS.HIGH_SCORES, {});
        delete all[mode];
        writeJSON(STORAGE_KEYS.HIGH_SCORES, all);
      } else {
        remove(STORAGE_KEYS.HIGH_SCORES);
      }
    }
  
    // -------------------------------------------------------------------
    // SPRINT — meilleur temps
    // -------------------------------------------------------------------
  
    /**
     * @returns {SprintRecord | null}
     */
    function getBestSprint() {
      return readJSON(STORAGE_KEYS.BEST_SPRINT, null);
    }
  
    /**
     * Enregistre un record sprint s'il est meilleur que l'existant.
     * @param {SprintRecord} record
     * @returns {boolean} true si le record a été battu
     */
    function setBestSprint(record) {
      const current = getBestSprint();
      if (current && current.timeMs <= record.timeMs) return false;
      const payload = {
        timeMs: record.timeMs | 0,
        piecesPlaced: record.piecesPlaced | 0,
        score: record.score | 0,
        date: record.date ?? new Date().toISOString(),
      };
      writeJSON(STORAGE_KEYS.BEST_SPRINT, payload);
      return true;
    }
  
    function resetBestSprint() {
      remove(STORAGE_KEYS.BEST_SPRINT);
    }
  
    // -------------------------------------------------------------------
    // PRÉFÉRENCES
    // -------------------------------------------------------------------
  
    const PREFS_KEY = 'tetris64.prefs';
  
    /**
     * @returns {Preferences}
     */
    function getPreferences() {
      return readJSON(PREFS_KEY, {
        reducedMotion: false,
        shakeEnabled: true,
        ghostEnabled: true,
        tSpinDetection: 'both',
        startLevel: 1,
      });
    }
  
    /**
     * Merge partiel avec les préférences existantes.
     * @param {Partial<Preferences>} patch
     */
    function setPreferences(patch) {
      const cur = getPreferences();
      const next = { ...cur, ...patch };
      writeJSON(PREFS_KEY, next);
      return next;
    }
  
    function resetPreferences() {
      remove(PREFS_KEY);
    }
  
    // -------------------------------------------------------------------
    // DIVERS
    // -------------------------------------------------------------------
  
    /**
     * Efface tout ce que tetris-64 a stocké. Ne touche pas aux autres keys.
     */
    function resetAll() {
      remove(STORAGE_KEYS.HIGH_SCORES);
      remove(STORAGE_KEYS.BEST_SPRINT);
      remove(STORAGE_KEYS.SETTINGS);
      remove(PREFS_KEY);
    }
  
    function isAvailable() {
      return available;
    }
  
    return Object.freeze({
      // high scores
      getHighScores,
      addHighScore,
      isHighScore,
      resetHighScores,
      // sprint
      getBestSprint,
      setBestSprint,
      resetBestSprint,
      // prefs
      getPreferences,
      setPreferences,
      resetPreferences,
      // divers
      resetAll,
      isAvailable,
    });
  }