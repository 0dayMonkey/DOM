/**
 * gameScene.js — Scène de jeu principale.
 *
 * Orchestre tout ce qui se passe pendant une partie de Tetris :
 *   - Instancie le moteur (core/game.js) + les renderers (board, ghost, piece, hud).
 *   - Branche les inputs (actionMap) aux actions du moteur.
 *   - Traduit les événements du moteur en effets visuels/sonores :
 *       LOCK           → punch cam + SFX + particules
 *       LINES_CLEARED  → flash + shake + text pop + confetti (si Tetris/Perfect)
 *       TSPIN          → text pop coloré
 *       LEVEL_UP       → pulse HUD + fanfare
 *       GAME_OVER      → fog rouge + shake + écran game over
 *       WIN            → fanfare + écran sprint result
 *   - Gère la pause (ESC / P), l'écran game over, la victoire sprint.
 *
 * Les écrans de fin (game over, sprint result) exposent trois choix :
 *   REJOUER  → relance la même scène avec le même mode
 *   HUB      → retour au hub (choisir un autre mode)
 *   QUITTER  → retour au titre
 *
 * Ce fichier est le plus gros du projet : c'est le "glue code" entre
 * le moteur pur et l'expérience utilisateur.
 */

import {
    ACTIONS,
    SCENES,
    GAME_MODES,
    GAME_PHASES,
    BOARD_COLS,
    GAME_OVER_DELAY_MS,
  } from '../core/constants.js';
  import { createGame, GAME_EVENTS } from '../core/game.js';
  import { createBoardRenderer } from '../render/boardRenderer.js';
  import { createGhostRenderer } from '../render/ghostRenderer.js';
  import { createPieceRenderer } from '../render/pieceRenderer.js';
  import { createHudRenderer } from '../render/hudRenderer.js';
  import { el } from '../utils/helpers.js';
  
  /**
   * @returns {import('./sceneManager.js').Scene}
   */
  export function createGameScene() {
    /** @type {import('./sceneManager.js').SceneContext | null} */
    let ctx = null;
    /** @type {HTMLElement | null} */
    let root = null;
    /** @type {HTMLElement | null} */
    let boardHost = null;
  
    /** @type {ReturnType<typeof createGame> | null} */
    let engine = null;
    /** @type {ReturnType<typeof createBoardRenderer> | null} */
    let board = null;
    /** @type {ReturnType<typeof createGhostRenderer> | null} */
    let ghost = null;
    /** @type {ReturnType<typeof createPieceRenderer> | null} */
    let piecer = null;
    /** @type {HTMLElement | null} */
    let activePieceEl = null;
    /** @type {ReturnType<typeof createHudRenderer> | null} */
    let hud = null;
  
    /** @type {Array<() => void>} */
    const unsubs = [];
    let mode = GAME_MODES.MARATHON;
    let startLevel = 1;
    let ghostEnabled = true;
    let shakeEnabled = true;
  
    /** @type {any} */
    let pauseHandle = null;
    /** @type {any} */
    let resultHandle = null;
    let gameOverShown = false;
    let winShown = false;
  
    // ==================================================================
    // MOUNT
    // ==================================================================
  
    /**
     * @param {import('./sceneManager.js').SceneContext} context
     * @param {Object} [params]
     * @param {string} [params.mode]
     * @param {number} [params.level]
     */
    async function mount(context, params = {}) {
      ctx = context;
      mode = params.mode ?? GAME_MODES.MARATHON;
  
      const prefs = ctx.storage.getPreferences();
      startLevel = params.level ?? prefs.startLevel ?? 1;
      ghostEnabled = prefs.ghostEnabled !== false;
      shakeEnabled = prefs.shakeEnabled !== false;
  
      ctx.input.actionMap.pushContext('game');
      ctx.fog.applyPreset('game');
      ctx.skybox.fade(0.5, 300);
      ctx.camera.set('GAME_DEFAULT');
  
      // Construction DOM : la scène racine contient le board centré.
      root = el('div', { class: 'game-scene' });
      boardHost = el('div', { class: 'game-scene__board-host' });
      root.appendChild(boardHost);
      ctx.root.appendChild(root);
  
      // Moteur
      engine = createGame({ mode, level: startLevel });
  
      // Renderers
      board = createBoardRenderer({ host: boardHost });
      ghost = createGhostRenderer({ host: board.getGhostLayer() });
      ghost.setEnabled(ghostEnabled);
      piecer = createPieceRenderer();
      activePieceEl = el('div', { class: 'piece piece--active' });
      board.getPieceLayer().appendChild(activePieceEl);
  
      hud = createHudRenderer({ host: ctx.hud, mode });
      ctx.hud.classList.remove('hidden');
  
      wireEngineEvents();
      wireInputs();
  
      // Musique
      ctx.audio.playMusic(ctx.audio.MUSIC.GAME, { fadeInMs: 600 });
  
      // Premier step pour forcer le spawn de la première pièce
      engine.step(0);
      syncAll();
    }
  
    // ==================================================================
    // EVENTS MOTEUR → FX
    // ==================================================================
  
    function wireEngineEvents() {
      if (!engine || !ctx) return;
      const e = engine;
      const c = ctx;
  
      unsubs.push(
        e.on(GAME_EVENTS.SPAWN, () => {
          rebuildActivePiece();
          if (hud) hud.onNewPiece();
        }),
  
        e.on(GAME_EVENTS.MOVE, () => {
          c.audio.playSfx(c.audio.SFX.MOVE, { volume: 0.6 });
        }),
  
        e.on(GAME_EVENTS.ROTATE, () => {
          c.audio.playSfx(c.audio.SFX.ROTATE);
        }),
  
        e.on(GAME_EVENTS.SOFT_DROP, () => { /* discret, pas de sfx répété */ }),
  
        e.on(GAME_EVENTS.HARD_DROP, (p) => {
          c.audio.playSfx(c.audio.SFX.HARD_DROP);
          if (shakeEnabled) c.effects.punch('medium');
          spawnBurstAtPiece(p.piece, 14);
        }),
  
        e.on(GAME_EVENTS.HOLD, () => {
          c.audio.playSfx(c.audio.SFX.HOLD);
          if (hud) hud.celebrateHold();
        }),
  
        e.on(GAME_EVENTS.LOCK, (p) => {
          c.audio.playSfx(c.audio.SFX.LOCK);
          if (shakeEnabled) c.effects.punch('soft');
          spawnBurstAtPiece(p.piece, 6);
        }),
  
        e.on(GAME_EVENTS.LINES_CLEARED, async (p) => {
          const count = p.count | 0;
          // Son
          if (count === 4) c.audio.playSfx(c.audio.SFX.TETRIS);
          else c.audio.playSfx(c.audio.SFX.CLEAR);
  
          // Text pop + flash par type
          if (String(p.clearId || '').startsWith('TSPIN')) {
            // Géré par l'event TSPIN
          } else if (c.textPop) {
            c.textPop.clearName(count);
          }
  
          // Shake / caméra
          if (shakeEnabled) {
            if (count === 4) c.effects.shake('hard');
            else if (count >= 2) c.effects.shake('medium');
            else c.effects.shake('soft');
          }
          if (count === 4) c.effects.flash('rgba(255,255,255,0.35)', 180);
  
          // Particules sur chaque ligne
          if (board) {
            for (const y of p.lines) {
              for (let x = 0; x < BOARD_COLS; x++) {
                const pos = board.cellToPixel(x, y);
                const pieceId = engine?.getState().board.grid[y][x] ?? 0;
                const color = colorForPieceId(pieceId);
                c.particles.shard(pos.x, pos.y, color);
              }
            }
          }
  
          // Text pop score flottant
          if (p.delta?.points) c.textPop.score(p.delta.points);
  
          // Animation de line clear dans le board
          if (board) await board.animateLineClear(p.lines);
          syncAll();
        }),
  
        e.on(GAME_EVENTS.TSPIN, (p) => {
          c.audio.playSfx(c.audio.SFX.TSPIN);
          c.textPop.tspin(p.kind, p.lines);
          if (shakeEnabled) c.effects.shake('medium');
        }),
  
        e.on(GAME_EVENTS.COMBO, (p) => {
          if (p.combo > 0) c.textPop.combo(p.combo);
          if (shakeEnabled) c.effects.tiltForCombo(p.combo);
        }),
  
        e.on(GAME_EVENTS.B2B, (p) => {
          c.textPop.b2b(p.b2b);
        }),
  
        e.on(GAME_EVENTS.PERFECT_CLEAR, () => {
          c.textPop.perfectClear();
          c.particles.confetti(0, -100, { count: 40 });
          c.effects.flash('rgba(255,255,180,0.65)', 260);
          if (shakeEnabled) c.effects.shake('extreme', 400);
        }),
  
        e.on(GAME_EVENTS.LEVEL_UP, (p) => {
          c.audio.playSfx(c.audio.SFX.LEVEL_UP);
          c.textPop.levelUp(p.level);
          if (hud) hud.celebrateLevelUp();
          c.fog.fadeTo(0.15 + Math.min(0.4, p.level * 0.02), 600);
        }),
  
        e.on(GAME_EVENTS.GAME_OVER, (p) => {
          handleGameOver(p.reason);
        }),
  
        e.on(GAME_EVENTS.WIN, (p) => {
          handleWin(p);
        }),
      );
    }
  
    // ==================================================================
    // INPUTS
    // ==================================================================
  
    function wireInputs() {
      if (!engine || !ctx) return;
      const am = ctx.input.actionMap;
  
      const downOrRepeat = (fn) => (evt) => {
        if (evt.phase === 'down' || evt.phase === 'repeat') fn();
      };
      const downOnly = (fn) => (evt) => {
        if (evt.phase === 'down') fn();
      };
  
      unsubs.push(
        am.on(ACTIONS.MOVE_LEFT, downOrRepeat(() => engine.moveLeft())),
        am.on(ACTIONS.MOVE_RIGHT, downOrRepeat(() => engine.moveRight())),
        am.on(ACTIONS.SOFT_DROP, downOrRepeat(() => engine.softDrop())),
        am.on(ACTIONS.HARD_DROP, downOnly(() => engine.hardDrop())),
        am.on(ACTIONS.ROTATE_CW, downOnly(() => engine.rotateCW())),
        am.on(ACTIONS.ROTATE_CCW, downOnly(() => engine.rotateCCW())),
        am.on(ACTIONS.ROTATE_180, downOnly(() => engine.rotate180())),
        am.on(ACTIONS.HOLD, downOnly(() => engine.hold())),
        am.on(ACTIONS.PAUSE, downOnly(() => togglePause())),
        am.on(ACTIONS.BACK, downOnly(() => togglePause())),
      );
    }
  
    // ==================================================================
    // UPDATE (par frame)
    // ==================================================================
  
    /**
     * @param {number} dt
     */
    function update(dt) {
      if (!engine || !ctx) return;
      // Pause
      const state = engine.getState();
      if (state.phase === GAME_PHASES.PAUSED) return;
  
      engine.step(dt);
      syncAll();
  
      // Danger : quand la stack est haute, on flag le board + HUD + fog.
      const danger = detectDanger(state);
      if (board) board.setDanger(danger);
      if (hud) hud.update({ danger });
      if (danger) ctx.fog.applyPreset('danger');
      else if (state.phase !== GAME_PHASES.GAME_OVER) ctx.fog.applyPreset('game');
    }
  
    // ==================================================================
    // SYNC — applique l'état du moteur aux renderers
    // ==================================================================
  
    function syncAll() {
      if (!engine) return;
      const s = engine.getState();
      if (board) board.renderLocked(s.board.grid);
      renderActivePiece();
      renderGhost();
      if (hud) {
        hud.update({
          score: s.score.score,
          level: s.score.level,
          lines: s.score.lines,
          hold: s.hold,
          holdUsed: s.holdUsedThisTurn,
          next: s.nextQueue,
          timeMs: s.elapsedMs,
          combo: Math.max(0, s.score.combo),
          b2b: s.score.b2b,
        });
      }
    }
  
    function renderActivePiece() {
      if (!engine || !board || !piecer || !activePieceEl) return;
      const s = engine.getState();
      const p = s.active;
      if (!p) {
        activePieceEl.style.visibility = 'hidden';
        return;
      }
      activePieceEl.style.visibility = '';
  
      // Si la rotation ou le type a changé, on reconstruit le DOM interne.
      const prevRot = activePieceEl.getAttribute('data-rotation');
      const prevType = activePieceEl.getAttribute('data-type');
      if (prevType !== p.type || prevRot !== String(p.rotation)) {
        piecer.renderPiece(p.type, p.rotation, activePieceEl, { clear: true });
      }
  
      // Position
      const cs = board.getCubeSize();
      const yScreen = p.y - 2; // BOARD_HIDDEN_ROWS = 2
      activePieceEl.style.transform =
        `translate3d(${p.x * cs}px, ${yScreen * cs}px, 0)`;
  
      // Phase locking → pulse
      activePieceEl.classList.toggle(
        'piece--locking',
        s.phase === GAME_PHASES.LOCKING,
      );
    }
  
    function rebuildActivePiece() {
      if (!engine || !piecer || !activePieceEl) return;
      const p = engine.getState().active;
      if (!p) return;
      piecer.renderPiece(p.type, p.rotation, activePieceEl, { clear: true });
      // Position appliquée dans renderActivePiece au sync suivant.
    }
  
    function renderGhost() {
      if (!engine || !ghost) return;
      const s = engine.getState();
      if (!s.active || !ghostEnabled) {
        ghost.hide();
        return;
      }
      ghost.show();
      ghost.update(s.active, engine.getGhostDistance());
    }
  
    // ==================================================================
    // FX HELPERS
    // ==================================================================
  
    /**
     * Émet un burst de particules au centre de la pièce donnée.
     * @param {any} piece
     * @param {number} count
     */
    function spawnBurstAtPiece(piece, count) {
      if (!ctx || !board || !piece) return;
      // centre approx = position + 1.5 cubes
      const cx = (piece.x + 1.5) * board.getCubeSize();
      const cy = (piece.y - 2 + 1.5) * board.getCubeSize();
      ctx.particles.burst(cx, cy, { count });
    }
  
    /**
     * Détecte si la stack est dangereusement haute (≥ 85% de la zone visible).
     * @param {any} state
     */
    function detectDanger(state) {
      const grid = state.board.grid;
      // On cherche la première ligne non vide dans la zone visible.
      const HIDDEN = 2;
      for (let y = HIDDEN; y < HIDDEN + 3; y++) {
        const row = grid[y];
        for (let x = 0; x < BOARD_COLS; x++) {
          if (row[x] !== 0) return true;
        }
      }
      return false;
    }
  
    /**
     * @param {number} id
     * @returns {string}
     */
    function colorForPieceId(id) {
      switch (id) {
        case 1: return 'var(--piece-i)';
        case 2: return 'var(--piece-o)';
        case 3: return 'var(--piece-t)';
        case 4: return 'var(--piece-s)';
        case 5: return 'var(--piece-z)';
        case 6: return 'var(--piece-j)';
        case 7: return 'var(--piece-l)';
        default: return '#FFFFFF';
      }
    }
  
    // ==================================================================
    // PAUSE
    // ==================================================================
  
    function togglePause() {
      if (!engine || !ctx) return;
      const s = engine.getState();
      if (s.phase === GAME_PHASES.GAME_OVER) return;
  
      if (s.phase === GAME_PHASES.PAUSED) {
        engine.pause();
        closePauseMenu();
        ctx.audio.playMusic(ctx.audio.MUSIC.GAME, { fadeInMs: 250, restart: false });
      } else {
        engine.pause();
        ctx.audio.stopMusic(250);
        openPauseMenu();
      }
    }
  
    function openPauseMenu() {
      if (!ctx) return;
      if (pauseHandle) return;
      pauseHandle = ctx.screens.openPauseMenu({ actionMap: ctx.input.actionMap });
      pauseHandle.on('select', (c) => {
        const label = String(c.label || '').toUpperCase();
        if (label.includes('REPRENDRE')) {
          togglePause();
        } else if (label.includes('RECOMMENCER')) {
          restart();
        } else if (label.includes('QUITTER')) {
          quit();
        }
      });
    }
  
    function closePauseMenu() {
      if (pauseHandle) {
        try { pauseHandle.close(); } catch (_) {}
        pauseHandle = null;
      }
    }
  
    // ==================================================================
    // GAME OVER / WIN
    // ==================================================================
  
    /**
     * @param {string} reason
     */
    async function handleGameOver(_reason) {
      if (!engine || !ctx || gameOverShown) return;
      gameOverShown = true;
      ctx.audio.stopMusic(400);
      ctx.audio.playMusic(ctx.audio.MUSIC.GAME_OVER, { fadeInMs: 300 });
      ctx.fog.applyPreset('gameover');
      if (shakeEnabled) ctx.effects.shake('hard', 500);
  
      // Attendre une petite pause dramatique avant d'ouvrir l'écran
      await new Promise((r) => setTimeout(r, GAME_OVER_DELAY_MS));
  
      const s = engine.getState();
      const rank = ctx.storage.addHighScore(
        {
          score: s.score.score,
          level: s.score.level,
          lines: s.score.lines,
          timeMs: s.elapsedMs,
        },
        mode,
      );
  
      resultHandle = ctx.screens.openGameOver({
        actionMap: ctx.input.actionMap,
        score: s.score.score,
        level: s.score.level,
        lines: s.score.lines,
        timeMs: s.elapsedMs,
        rank,
      });
      resultHandle.on('select', (choice) => handleResultChoice(choice));
    }
  
    /**
     * @param {{lines:number, timeMs:number}} p
     */
    async function handleWin(p) {
      if (!engine || !ctx || winShown) return;
      winShown = true;
      ctx.audio.stopMusic(300);
      ctx.effects.flash('rgba(255,255,200,0.7)', 280);
      ctx.particles.confetti(0, -80, { count: 50 });
      if (shakeEnabled) ctx.effects.shake('medium', 300);
  
      await new Promise((r) => setTimeout(r, 600));
  
      const prev = ctx.storage.getBestSprint();
      const newRecord = ctx.storage.setBestSprint({
        timeMs: p.timeMs,
        piecesPlaced: engine.getState().piecesPlaced,
        score: engine.getState().score.score,
      });
  
      resultHandle = ctx.screens.openSprintResult({
        actionMap: ctx.input.actionMap,
        timeMs: p.timeMs,
        piecesPlaced: engine.getState().piecesPlaced,
        newRecord,
        previousBestMs: prev?.timeMs,
      });
      resultHandle.on('select', (choice) => handleResultChoice(choice));
    }
  
    /**
     * Route le choix de l'écran de fin (game over / sprint result) vers
     * la transition correspondante. Les labels possibles sont :
     *   REJOUER  → relancer la même scène avec le même mode
     *   HUB      → retour au hub Mario 64-style
     *   QUITTER  → retour à l'écran titre
     *
     * Factorisation DRY pour éviter de dupliquer le routage entre
     * handleGameOver et handleWin.
     * @param {{label:string, index:number}} choice
     */
    function handleResultChoice(choice) {
      const label = String(choice.label || '').toUpperCase();
      if (label.includes('REJOUER')) restart();
      else if (label.includes('HUB')) returnToHub();
      else quit();
    }
  
    // ==================================================================
    // CONTROL FLOW
    // ==================================================================
  
    async function restart() {
      if (!ctx) return;
      if (resultHandle) { try { resultHandle.close(); } catch (_) {} resultHandle = null; }
      closePauseMenu();
      await ctx.switchTo(SCENES.GAME, { transition: 'fade', params: { mode } });
    }
  
    /**
     * Retour au hub Mario 64-style. Même pattern que restart()/quit() :
     * on ferme proprement les handles d'UI puis on switche de scène.
     */
    async function returnToHub() {
      if (!ctx) return;
      if (resultHandle) { try { resultHandle.close(); } catch (_) {} resultHandle = null; }
      closePauseMenu();
      await ctx.switchTo(SCENES.HUB, { transition: 'fade' });
    }
  
    async function quit() {
      if (!ctx) return;
      if (resultHandle) { try { resultHandle.close(); } catch (_) {} resultHandle = null; }
      closePauseMenu();
      await ctx.switchTo(SCENES.TITLE, { transition: 'fade' });
    }
  
    // ==================================================================
    // LIFECYCLE
    // ==================================================================
  
    function destroy() {
      unsubs.forEach((u) => { try { u(); } catch (_) {} });
      unsubs.length = 0;
      closePauseMenu();
      if (resultHandle) { try { resultHandle.close(); } catch (_) {} resultHandle = null; }
      if (hud) { hud.destroy(); hud = null; }
      if (ghost) { ghost.destroy(); ghost = null; }
      if (board) { board.destroy(); board = null; }
      if (activePieceEl && activePieceEl.parentNode) activePieceEl.parentNode.removeChild(activePieceEl);
      activePieceEl = null;
      piecer = null;
      engine = null;
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      gameOverShown = false;
      winShown = false;
      if (ctx) {
        ctx.input.actionMap.popContext();
        ctx.audio.stopMusic(300);
        ctx.hud.classList.add('hidden');
      }
      ctx = null;
    }
  
    function onPause() {
      if (!engine || !ctx) return;
      const s = engine.getState();
      if (s.phase !== GAME_PHASES.PAUSED) engine.pause();
      ctx.audio.stopMusic(200);
    }
    function onResume() {
      // On ne re-lance pas automatiquement : laisse le user lever la pause.
    }
  
    function onResize() {
      if (board) board.refreshDimensions();
    }
  
    return Object.freeze({
      mount,
      update,
      destroy,
      onPause,
      onResume,
      onResize,
    });
  }