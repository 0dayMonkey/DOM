/**
 * game.js — Moteur de jeu Tetris (pur, sans DOM).
 *
 * Cœur de la logique : combine board, piece, srs, tspin, scoring et bag
 * pour produire un état de jeu cohérent. Ce module expose une API impérative
 * (step, actions) et émet des événements via un bus interne léger. Le
 * rendu et les inputs sont des consommateurs : game.js n'a AUCUNE dépendance
 * sur le DOM, ce qui permet de le tester intégralement.
 *
 * Phases (voir GAME_PHASES dans constants.js) :
 *   READY    : état initial, avant premier spawn
 *   SPAWNING : délai court avant d'apparaître la prochaine pièce
 *   PLAYING  : la pièce tombe, le joueur agit
 *   LOCKING  : la pièce est posée, attente du lock delay
 *   CLEARING : animation d'effacement en cours (le moteur n'avance pas)
 *   PAUSED   : pause utilisateur
 *   GAME_OVER: terminé
 *
 * Le moteur utilise des millisecondes pour tous ses timings. L'appelant
 * est responsable de fournir un dt par step() (via requestAnimationFrame).
 */

import {
    BOARD_COLS,
    BOARD_TOTAL_ROWS,
    LOCK_DELAY_MS,
    MAX_LOCK_RESETS,
    SPAWN_DELAY_MS,
    LINE_CLEAR_ANIM_MS,
    gravityMsForLevel,
    GAME_PHASES,
    GAME_MODES,
    SPRINT_TARGET_LINES,
    NEXT_QUEUE_SIZE,
  } from './constants.js';
  
  import {
    createBoard,
    collides,
    mergePiece,
    findFullLines,
    clearLines,
    isBoardEmpty,
    dropDistance,
  } from './board.js';
  
  import { createBag } from './bag.js';
  import { spawnPiece, getCells, translate, rotate as rotatePiece } from './piece.js';
  import { tryRotate } from './srs.js';
  import { detectTSpin, classifyClear } from './tspin.js';
  import {
    createScoreState,
    applyClearEvent,
    addDropPoints,
  } from './scoring.js';
  
  // ============================================================================
  // ÉVÉNEMENTS ÉMIS
  // ============================================================================
  
  export const GAME_EVENTS = Object.freeze({
    SPAWN: 'spawn',
    MOVE: 'move',
    ROTATE: 'rotate',
    ROTATE_FAIL: 'rotateFail',
    SOFT_DROP: 'softDrop',
    HARD_DROP: 'hardDrop',
    HOLD: 'hold',
    HOLD_FAIL: 'holdFail',
    LOCK: 'lock',
    LINES_CLEARED: 'linesCleared',
    TSPIN: 'tspin',
    LEVEL_UP: 'levelUp',
    COMBO: 'combo',
    B2B: 'b2b',
    PERFECT_CLEAR: 'perfectClear',
    GAME_OVER: 'gameOver',
    PAUSE: 'pause',
    RESUME: 'resume',
    WIN: 'win',
  });
  
  // ============================================================================
  // CRÉATION DU JEU
  // ============================================================================
  
  /**
   * @typedef {Object} GameOptions
   * @property {string} [mode]      - GAME_MODES.*
   * @property {number} [level]     - Niveau de départ (1+).
   * @property {() => number} [rng] - RNG injectable (tests).
   */
  
  /**
   * @typedef {Object} GameState
   * @property {string} mode
   * @property {string} phase
   * @property {import('./board.js').Board} board
   * @property {import('./piece.js').ActivePiece | null} active
   * @property {string[]} nextQueue           - Types des N prochaines pièces.
   * @property {string | null} hold
   * @property {boolean} holdUsedThisTurn
   * @property {import('./scoring.js').ScoreState} score
   * @property {number} gravityAccumMs
   * @property {number} lockTimerMs
   * @property {number} lockResets
   * @property {number} softDropCellsThisPiece
   * @property {number} hardDropCellsThisPiece
   * @property {boolean} lastMoveWasRotation
   * @property {number} lastKickIndex
   * @property {number} spawnDelayMs
   * @property {number} clearAnimMs
   * @property {number[]} pendingClearLines
   * @property {number} elapsedMs
   * @property {number} piecesPlaced
   * @property {boolean} won
   */
  
  /**
   * Crée un nouveau jeu.
   * @param {GameOptions} [options]
   */
  export function createGame(options = {}) {
    const mode = options.mode ?? GAME_MODES.MARATHON;
    const startLevel = options.level ?? 1;
    const rng = options.rng;
  
    const bag = createBag(rng ? { rng } : undefined);
    const listeners = /** @type {Map<string, Set<Function>>} */ (new Map());
  
    /** @type {GameState} */
    let state = {
      mode,
      phase: GAME_PHASES.READY,
      board: createBoard(),
      active: null,
      nextQueue: bag.peek(NEXT_QUEUE_SIZE).slice(),
      hold: null,
      holdUsedThisTurn: false,
      score: createScoreState(startLevel),
      gravityAccumMs: 0,
      lockTimerMs: 0,
      lockResets: 0,
      softDropCellsThisPiece: 0,
      hardDropCellsThisPiece: 0,
      lastMoveWasRotation: false,
      lastKickIndex: 0,
      spawnDelayMs: 0,
      clearAnimMs: 0,
      pendingClearLines: [],
      elapsedMs: 0,
      piecesPlaced: 0,
      won: false,
    };
  
    // ---------------------------------------------------------------------
    // BUS D'ÉVÉNEMENTS
    // ---------------------------------------------------------------------
  
    /**
     * @param {string} event
     * @param {(payload: any) => void} handler
     * @returns {() => void} unsub
     */
    function on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
      return () => set.delete(handler);
    }
  
    /** @param {string} event @param {any} [payload] */
    function emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      set.forEach((fn) => {
        try { fn(payload); } catch (_) { /* isolé */ }
      });
    }
  
    // ---------------------------------------------------------------------
    // HELPERS INTERNES
    // ---------------------------------------------------------------------
  
    function refillQueue() {
      while (state.nextQueue.length < NEXT_QUEUE_SIZE) {
        state.nextQueue.push(bag.next());
      }
    }
  
    /** Tire la prochaine pièce du bag et la met en nextQueue. */
    function advanceQueue() {
      const head = state.nextQueue.shift();
      refillQueue();
      return head;
    }
  
    /** Met à jour les flags post-mouvement : déplacement horizontal/chute. */
    function clearRotationFlag() {
      state.lastMoveWasRotation = false;
    }
  
    /** Réinitialise le lock timer (anti-stall via MAX_LOCK_RESETS). */
    function tryResetLockTimer() {
      if (state.phase !== GAME_PHASES.LOCKING) return;
      if (state.lockResets >= MAX_LOCK_RESETS) return;
      state.lockResets++;
      state.lockTimerMs = 0;
    }
  
    /**
     * Déclenche le spawn de la pièce de tête de la queue.
     * Si la pièce spawnée collide immédiatement → game over (top-out).
     * @param {string} [forcedType]
     */
    function spawnNext(forcedType) {
      const type = forcedType ?? advanceQueue();
      const piece = spawnPiece(type);
      const cells = getCells(piece);
      if (collides(state.board.grid, cells)) {
        state.active = piece;
        state.phase = GAME_PHASES.GAME_OVER;
        emit(GAME_EVENTS.GAME_OVER, { reason: 'topout' });
        return;
      }
      state.active = piece;
      state.holdUsedThisTurn = false;
      state.gravityAccumMs = 0;
      state.lockTimerMs = 0;
      state.lockResets = 0;
      state.softDropCellsThisPiece = 0;
      state.hardDropCellsThisPiece = 0;
      state.lastMoveWasRotation = false;
      state.lastKickIndex = 0;
      state.phase = GAME_PHASES.PLAYING;
      emit(GAME_EVENTS.SPAWN, { type, piece });
    }
  
    /** Si la pièce ne peut plus descendre → on bascule en LOCKING. */
    function maybeEnterLocking() {
      if (!state.active || state.phase !== GAME_PHASES.PLAYING) return;
      const belowCells = getCells(translate(state.active, 0, 1));
      if (collides(state.board.grid, belowCells)) {
        state.phase = GAME_PHASES.LOCKING;
        state.lockTimerMs = 0;
      }
    }
  
    /** Si la pièce peut à nouveau descendre → on retourne en PLAYING. */
    function maybeLeaveLocking() {
      if (!state.active || state.phase !== GAME_PHASES.LOCKING) return;
      const belowCells = getCells(translate(state.active, 0, 1));
      if (!collides(state.board.grid, belowCells)) {
        state.phase = GAME_PHASES.PLAYING;
        state.lockTimerMs = 0;
      }
    }
  
    // ---------------------------------------------------------------------
    // LOCK + CLEAR
    // ---------------------------------------------------------------------
  
    function lockActive() {
      if (!state.active) return;
  
      const piece = state.active;
  
      // Détection T-Spin avant merge (sur la grille pré-lock).
      const tspin = detectTSpin(piece, state.board.grid, {
        lastMoveWasRotation: state.lastMoveWasRotation,
        lastKickIndex: state.lastKickIndex,
      });
  
      // Merge
      const cells = getCells(piece);
      const merged = mergePiece(state.board.grid, cells, piece.id);
      state.board = { ...state.board, grid: merged };
  
      // Cellules entièrement sous la ligne du haut visible ? Sinon top-out lock.
      const anyVisible = cells.some((c) => c.y >= state.board.hiddenRows);
      if (!anyVisible) {
        state.active = null;
        state.phase = GAME_PHASES.GAME_OVER;
        emit(GAME_EVENTS.LOCK, { piece, lines: [] });
        emit(GAME_EVENTS.GAME_OVER, { reason: 'lockout' });
        return;
      }
  
      state.piecesPlaced++;
      emit(GAME_EVENTS.LOCK, { piece, lines: [] });
  
      // Détection des lignes pleines
      const full = findFullLines(state.board.grid);
      state.pendingClearLines = full;
  
      const clearId = classifyClear(tspin, full.length);
  
      if (tspin.kind !== 'none') {
        emit(GAME_EVENTS.TSPIN, { kind: tspin.kind, lines: full.length });
      }
  
      if (full.length > 0) {
        // On lance l'animation : la grille sera réellement vidée à la fin.
        state.phase = GAME_PHASES.CLEARING;
        state.clearAnimMs = 0;
        // Point: le scoring est appliqué immédiatement (simplifie l'UI).
        applyScoring(clearId, full.length, tspin);
      } else {
        // Pas de clear : on applique le scoring (pour les T-spin no lines + drop points).
        applyScoring(clearId, 0, tspin);
        state.phase = GAME_PHASES.SPAWNING;
        state.spawnDelayMs = 0;
        state.active = null;
      }
    }
  
    /**
     * Applique le scoring et émet les events associés.
     * @param {string} clearId
     * @param {number} linesCleared
     * @param {import('./tspin.js').TSpinResult} tspin
     */
    function applyScoring(clearId, linesCleared, tspin) {
      // Pre-compute si perfect clear : simule l'effacement des lignes pleines
      const provisional = linesCleared > 0
        ? clearLines(state.board.grid, state.pendingClearLines)
        : state.board.grid;
      const perfect = linesCleared > 0 && isBoardEmpty(provisional);
  
      const { state: nextScore, delta } = applyClearEvent(state.score, {
        clearId,
        linesCleared,
        perfectClear: perfect,
        softDropCells: state.softDropCellsThisPiece,
        hardDropCells: state.hardDropCellsThisPiece,
      });
      state.score = nextScore;
  
      if (linesCleared > 0) {
        emit(GAME_EVENTS.LINES_CLEARED, {
          count: linesCleared,
          clearId,
          lines: [...state.pendingClearLines],
          delta,
        });
      }
      if (delta.comboLength > 0) {
        emit(GAME_EVENTS.COMBO, { combo: delta.comboLength });
      }
      if (delta.b2bMultiplier > 1) {
        emit(GAME_EVENTS.B2B, { b2b: delta.b2bLength });
      }
      if (perfect) {
        emit(GAME_EVENTS.PERFECT_CLEAR, { lines: linesCleared });
      }
      if (delta.levelUp) {
        emit(GAME_EVENTS.LEVEL_UP, { level: delta.newLevel });
      }
  
      // Mode sprint : victoire ?
      if (state.mode === GAME_MODES.SPRINT_40L && state.score.lines >= SPRINT_TARGET_LINES) {
        state.won = true;
      }
    }
  
    /** Fin de l'animation de clear : on efface réellement et on enchaîne. */
    function finalizeClear() {
      if (state.pendingClearLines.length > 0) {
        state.board = {
          ...state.board,
          grid: clearLines(state.board.grid, state.pendingClearLines),
        };
        state.pendingClearLines = [];
      }
      if (state.won) {
        state.phase = GAME_PHASES.GAME_OVER;
        emit(GAME_EVENTS.WIN, { lines: state.score.lines, timeMs: state.elapsedMs });
        return;
      }
      state.phase = GAME_PHASES.SPAWNING;
      state.spawnDelayMs = 0;
      state.active = null;
    }
  
    // ---------------------------------------------------------------------
    // ACTIONS — commandes joueur
    // ---------------------------------------------------------------------
  
    /** @param {number} dx */
    function move(dx) {
      if (!state.active) return false;
      if (state.phase !== GAME_PHASES.PLAYING && state.phase !== GAME_PHASES.LOCKING) return false;
      const moved = translate(state.active, dx, 0);
      const cells = getCells(moved);
      if (collides(state.board.grid, cells)) return false;
      state.active = moved;
      state.lastMoveWasRotation = false;
      tryResetLockTimer();
      maybeLeaveLocking();
      maybeEnterLocking();
      emit(GAME_EVENTS.MOVE, { dx, piece: state.active });
      return true;
    }
  
    function moveLeft() { return move(-1); }
    function moveRight() { return move(1); }
  
    /** @param {number} steps */
    function rotateBy(steps) {
      if (!state.active) return false;
      if (state.phase !== GAME_PHASES.PLAYING && state.phase !== GAME_PHASES.LOCKING) return false;
      const result = tryRotate(state.active, state.board.grid, steps);
      if (!result.success) {
        emit(GAME_EVENTS.ROTATE_FAIL, { steps });
        return false;
      }
      state.active = result.piece;
      state.lastMoveWasRotation = true;
      state.lastKickIndex = result.kickIndex;
      tryResetLockTimer();
      maybeLeaveLocking();
      maybeEnterLocking();
      emit(GAME_EVENTS.ROTATE, { steps, kickIndex: result.kickIndex, piece: state.active });
      return true;
    }
  
    function rotateCW() { return rotateBy(1); }
    function rotateCCW() { return rotateBy(-1); }
    function rotate180() { return rotateBy(2); }
  
    function softDrop() {
      if (!state.active) return false;
      if (state.phase !== GAME_PHASES.PLAYING && state.phase !== GAME_PHASES.LOCKING) return false;
      const down = translate(state.active, 0, 1);
      const cells = getCells(down);
      if (collides(state.board.grid, cells)) {
        // Déjà au fond : on passe simplement en LOCKING (ou on y reste).
        maybeEnterLocking();
        return false;
      }
      state.active = down;
      state.softDropCellsThisPiece++;
      const { points } = addDropPoints(state.score, 1, 0);
      state.score = { ...state.score, score: state.score.score + points };
      state.lastMoveWasRotation = false;
      maybeEnterLocking();
      emit(GAME_EVENTS.SOFT_DROP, { piece: state.active });
      return true;
    }
  
    function hardDrop() {
      if (!state.active) return false;
      if (state.phase !== GAME_PHASES.PLAYING && state.phase !== GAME_PHASES.LOCKING) return false;
      const dist = dropDistance(state.board.grid, getCells(state.active));
      if (dist > 0) {
        state.active = translate(state.active, 0, dist);
        state.hardDropCellsThisPiece += dist;
      }
      state.lastMoveWasRotation = false;
      emit(GAME_EVENTS.HARD_DROP, { distance: dist, piece: state.active });
      // Lock immédiat
      lockActive();
      return true;
    }
  
    function hold() {
      if (!state.active) return false;
      if (state.phase !== GAME_PHASES.PLAYING && state.phase !== GAME_PHASES.LOCKING) return false;
      if (state.holdUsedThisTurn) {
        emit(GAME_EVENTS.HOLD_FAIL, {});
        return false;
      }
      const currentType = state.active.type;
      if (state.hold) {
        const swapped = state.hold;
        state.hold = currentType;
        spawnNext(swapped);
      } else {
        state.hold = currentType;
        spawnNext();
      }
      state.holdUsedThisTurn = true;
      emit(GAME_EVENTS.HOLD, { hold: state.hold });
      return true;
    }
  
    function pause() {
      if (state.phase === GAME_PHASES.GAME_OVER) return;
      if (state.phase === GAME_PHASES.PAUSED) {
        state.phase = state.active ? GAME_PHASES.PLAYING : GAME_PHASES.SPAWNING;
        emit(GAME_EVENTS.RESUME, {});
      } else {
        state.phase = GAME_PHASES.PAUSED;
        emit(GAME_EVENTS.PAUSE, {});
      }
    }
  
    // ---------------------------------------------------------------------
    // BOUCLE
    // ---------------------------------------------------------------------
  
    /**
     * Avance le moteur de dt millisecondes.
     * @param {number} dt
     */
    function step(dt) {
      if (state.phase === GAME_PHASES.PAUSED || state.phase === GAME_PHASES.GAME_OVER) return;
      state.elapsedMs += dt;
  
      switch (state.phase) {
        case GAME_PHASES.READY: {
          // Premier spawn
          spawnNext();
          break;
        }
        case GAME_PHASES.SPAWNING: {
          state.spawnDelayMs += dt;
          if (state.spawnDelayMs >= SPAWN_DELAY_MS) {
            spawnNext();
          }
          break;
        }
        case GAME_PHASES.CLEARING: {
          state.clearAnimMs += dt;
          if (state.clearAnimMs >= LINE_CLEAR_ANIM_MS) {
            finalizeClear();
          }
          break;
        }
        case GAME_PHASES.PLAYING: {
          if (!state.active) break;
          const gms = gravityMsForLevel(state.score.level);
          state.gravityAccumMs += dt;
          while (state.gravityAccumMs >= gms) {
            state.gravityAccumMs -= gms;
            const down = translate(state.active, 0, 1);
            const cells = getCells(down);
            if (collides(state.board.grid, cells)) {
              // On ne peut plus descendre : LOCKING
              state.phase = GAME_PHASES.LOCKING;
              state.lockTimerMs = 0;
              break;
            } else {
              state.active = down;
              state.lastMoveWasRotation = false;
            }
          }
          break;
        }
        case GAME_PHASES.LOCKING: {
          if (!state.active) break;
          // Vérifie que la pièce ne peut toujours pas descendre (sinon retour PLAYING)
          const belowCells = getCells(translate(state.active, 0, 1));
          if (!collides(state.board.grid, belowCells)) {
            state.phase = GAME_PHASES.PLAYING;
            state.lockTimerMs = 0;
            break;
          }
          state.lockTimerMs += dt;
          if (state.lockTimerMs >= LOCK_DELAY_MS) {
            lockActive();
          }
          break;
        }
        default:
          break;
      }
    }
  
    // ---------------------------------------------------------------------
    // GETTERS
    // ---------------------------------------------------------------------
  
    function getState() {
      return state;
    }
  
    /** Calcule la distance fantôme de la pièce active (0 si pas de pièce). */
    function getGhostDistance() {
      if (!state.active) return 0;
      return dropDistance(state.board.grid, getCells(state.active));
    }
  
    /**
     * Retourne les cellules absolues de la pièce fantôme (si active existe).
     * @returns {Array<{x:number, y:number}>}
     */
    function getGhostCells() {
      if (!state.active) return [];
      const d = getGhostDistance();
      return getCells(translate(state.active, 0, d));
    }
  
    function reset() {
      state.board = createBoard();
      state.active = null;
      state.nextQueue = bag.peek(NEXT_QUEUE_SIZE).slice();
      state.hold = null;
      state.holdUsedThisTurn = false;
      state.score = createScoreState(state.score.startLevel);
      state.gravityAccumMs = 0;
      state.lockTimerMs = 0;
      state.lockResets = 0;
      state.softDropCellsThisPiece = 0;
      state.hardDropCellsThisPiece = 0;
      state.lastMoveWasRotation = false;
      state.lastKickIndex = 0;
      state.spawnDelayMs = 0;
      state.clearAnimMs = 0;
      state.pendingClearLines = [];
      state.elapsedMs = 0;
      state.piecesPlaced = 0;
      state.won = false;
      state.phase = GAME_PHASES.READY;
    }
  
    return Object.freeze({
      // state
      getState,
      getGhostDistance,
      getGhostCells,
      // events
      on,
      // loop
      step,
      reset,
      // actions
      moveLeft,
      moveRight,
      rotateCW,
      rotateCCW,
      rotate180,
      softDrop,
      hardDrop,
      hold,
      pause,
    });
  }
  
  // Constantes réexportées pour confort des consommateurs
  export { BOARD_COLS, BOARD_TOTAL_ROWS };