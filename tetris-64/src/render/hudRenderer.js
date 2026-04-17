/**
 * hudRenderer.js — Head-Up Display du jeu.
 *
 * Compose et met à jour tous les éléments d'UI affichés en surimpression
 * pendant une partie :
 *
 *   [HOLD] | [BOARD] | [NEXT]
 *                    [SCORE]
 *                    [LEVEL]
 *                    [LINES]
 *                    [TIME]
 *                    [COMBO / B2B indicator]
 *
 * Le HUD est purement 2D : il se monte dans #hud (hors du world 3D) pour
 * rester lisible quelle que soit la rotation de la caméra.
 *
 * API principale :
 *   const hud = createHudRenderer({ host })
 *   hud.update({ score, level, lines, hold, holdUsed, next, timeMs, combo, b2b, mode })
 *   hud.flash('level')  // petit flash sur un widget donné
 *   hud.setSprintTarget(40) // mode sprint
 *   hud.destroy()
 */

import { createNextPreview, createHoldPreview } from './previewRenderer.js';
import {
    formatNumber,
    formatTime,
    padScore,
    el,
  } from '../utils/helpers.js';
  import { GAME_MODES } from '../core/constants.js';
  
  /**
   * @typedef {Object} HudRendererOptions
   * @property {HTMLElement} host               - #hud
   * @property {number} [nextCount=5]
   * @property {string} [mode='marathon']
   * @property {number} [slotSize=96]
   */
  
  /**
   * @typedef {Object} HudState
   * @property {number} score
   * @property {number} level
   * @property {number} lines
   * @property {string | null} hold
   * @property {boolean} holdUsed
   * @property {string[]} next
   * @property {number} timeMs
   * @property {number} [combo]
   * @property {number} [b2b]
   * @property {boolean} [danger]
   */
  
  /**
   * @param {HudRendererOptions} options
   */
  export function createHudRenderer(options) {
    const host = options.host;
    const mode = options.mode ?? GAME_MODES.MARATHON;
    const slotSize = options.slotSize ?? 96;
  
    host.classList.add('hud', `hud--${mode}`);
    host.classList.remove('hidden');
    host.innerHTML = '';
  
    // ---------------------------------------------------------------------
    // DOM
    // ---------------------------------------------------------------------
  
    const leftPanel = el('div', { class: 'hud__panel hud__panel--left' });
    const rightPanel = el('div', { class: 'hud__panel hud__panel--right' });
    const topPanel = el('div', { class: 'hud__panel hud__panel--top' });
  
    const holdHost = el('div', { class: 'hud__hold' });
    const nextHost = el('div', { class: 'hud__next' });
  
    const scoreBlock = statBlock('SCORE', '00000000', 'hud__score');
    const levelBlock = statBlock('LV', '01', 'hud__level');
    const linesBlock = statBlock('LIGNES', '0', 'hud__lines');
    const timeBlock = statBlock('TEMPS', '00:00.000', 'hud__time');
  
    // Indicateurs contextuels (combo/B2B)
    const indicators = el('div', { class: 'hud__indicators' });
    const comboEl = el('div', { class: 'hud__indicator hud__indicator--combo' }, 'COMBO x0');
    const b2bEl = el('div', { class: 'hud__indicator hud__indicator--b2b' }, 'B2B');
    indicators.appendChild(comboEl);
    indicators.appendChild(b2bEl);
  
    // Barre de progression sprint (uniquement en mode sprint)
    /** @type {HTMLElement | null} */
    let sprintProgress = null;
    /** @type {HTMLElement | null} */
    let sprintFill = null;
    /** @type {HTMLElement | null} */
    let sprintLabel = null;
    let sprintTarget = 40;
  
    if (mode === GAME_MODES.SPRINT_40L) {
      sprintProgress = el('div', { class: 'hud__sprint' });
      sprintFill = el('div', { class: 'hud__sprint-fill' });
      sprintLabel = el('div', { class: 'hud__sprint-label' }, '0 / 40');
      sprintProgress.appendChild(sprintFill);
      sprintProgress.appendChild(sprintLabel);
    }
  
    // Composition
    leftPanel.appendChild(holdHost);
    leftPanel.appendChild(indicators);
    if (sprintProgress) leftPanel.appendChild(sprintProgress);
  
    rightPanel.appendChild(nextHost);
    rightPanel.appendChild(scoreBlock.root);
    rightPanel.appendChild(levelBlock.root);
    rightPanel.appendChild(linesBlock.root);
    rightPanel.appendChild(timeBlock.root);
  
    // Mode display (discret en haut)
    const modeLabel = el('div', { class: 'hud__mode-label' }, labelForMode(mode));
    topPanel.appendChild(modeLabel);
  
    host.appendChild(topPanel);
    host.appendChild(leftPanel);
    host.appendChild(rightPanel);
  
    // ---------------------------------------------------------------------
    // SOUS-RENDERERS
    // ---------------------------------------------------------------------
  
    const nextPreview = createNextPreview({
      host: nextHost,
      size: options.nextCount ?? 5,
      slotSize,
    });
    const holdPreview = createHoldPreview({
      host: holdHost,
      slotSize,
    });
  
    // ---------------------------------------------------------------------
    // STATE
    // ---------------------------------------------------------------------
  
    /** @type {HudState} */
    let last = {
      score: -1,
      level: -1,
      lines: -1,
      hold: undefined,
      holdUsed: false,
      next: [],
      timeMs: -1,
      combo: -1,
      b2b: -1,
      danger: false,
    };
  
    // Animation hooks (flash)
    /** @type {Map<string, HTMLElement>} */
    const flashTargets = new Map([
      ['score', scoreBlock.value],
      ['level', levelBlock.value],
      ['lines', linesBlock.value],
      ['time', timeBlock.value],
      ['hold', holdHost],
      ['next', nextHost],
      ['combo', comboEl],
      ['b2b', b2bEl],
      ['sprint', sprintProgress ?? scoreBlock.root],
    ]);
  
    // ---------------------------------------------------------------------
    // UPDATE
    // ---------------------------------------------------------------------
  
    /**
     * Met à jour tout le HUD. Ne re-render que ce qui a changé.
     * @param {Partial<HudState>} state
     */
    function update(state) {
      if (state.score != null && state.score !== last.score) {
        scoreBlock.value.textContent = padScore(state.score, 8);
        if (state.score > last.score && last.score !== -1) {
          scoreBlock.value.classList.remove('is-bumped');
          // eslint-disable-next-line no-unused-expressions
          scoreBlock.value.offsetHeight;
          scoreBlock.value.classList.add('is-bumped');
        }
        last.score = state.score;
      }
  
      if (state.level != null && state.level !== last.level) {
        levelBlock.value.textContent = String(state.level).padStart(2, '0');
        last.level = state.level;
      }
  
      if (state.lines != null && state.lines !== last.lines) {
        linesBlock.value.textContent = formatNumber(state.lines);
        last.lines = state.lines;
        if (sprintProgress && sprintFill && sprintLabel) {
          const p = Math.min(1, state.lines / sprintTarget);
          sprintFill.style.transform = `scaleX(${p})`;
          sprintLabel.textContent = `${Math.min(state.lines, sprintTarget)} / ${sprintTarget}`;
        }
      }
  
      if (state.timeMs != null && Math.floor(state.timeMs / 50) !== Math.floor(last.timeMs / 50)) {
        timeBlock.value.textContent = formatTime(state.timeMs);
        last.timeMs = state.timeMs;
      }
  
      if ('hold' in state && state.hold !== last.hold) {
        holdPreview.update(state.hold ?? null);
        last.hold = state.hold;
      }
      if ('holdUsed' in state && state.holdUsed !== last.holdUsed) {
        holdPreview.setDisabled(!!state.holdUsed);
        last.holdUsed = !!state.holdUsed;
      }
  
      if (state.next && !arraysEqual(state.next, last.next)) {
        nextPreview.update(state.next);
        last.next = [...state.next];
      }
  
      if (state.combo != null && state.combo !== last.combo) {
        last.combo = state.combo;
        if (state.combo > 0) {
          comboEl.textContent = `COMBO x${state.combo}`;
          comboEl.classList.add('is-visible');
        } else {
          comboEl.classList.remove('is-visible');
        }
      }
  
      if (state.b2b != null && state.b2b !== last.b2b) {
        last.b2b = state.b2b;
        if (state.b2b > 1) {
          b2bEl.textContent = state.b2b > 1 ? `B2B x${state.b2b - 1}` : 'B2B';
          b2bEl.classList.add('is-visible');
        } else {
          b2bEl.classList.remove('is-visible');
        }
      }
  
      if (state.danger != null && state.danger !== last.danger) {
        host.classList.toggle('hud--danger', !!state.danger);
        last.danger = !!state.danger;
      }
    }
  
    // ---------------------------------------------------------------------
    // ANIMATIONS
    // ---------------------------------------------------------------------
  
    /**
     * @param {'score'|'level'|'lines'|'time'|'hold'|'next'|'combo'|'b2b'|'sprint'} what
     * @param {string} [animClass='is-flashing']
     * @param {number} [durMs=400]
     */
    function flash(what, animClass = 'is-flashing', durMs = 400) {
      const target = flashTargets.get(what);
      if (!target) return;
      target.classList.remove(animClass);
      // eslint-disable-next-line no-unused-expressions
      target.offsetHeight;
      target.classList.add(animClass);
      setTimeout(() => target.classList.remove(animClass), durMs);
    }
  
    /**
     * Trigger dédié au level up : flash renforcé + pulse.
     */
    function celebrateLevelUp() {
      flash('level', 'is-flashing-strong', 700);
    }
  
    /**
     * Flash spécifique pour le hold (au moment où on swap).
     */
    function celebrateHold() {
      holdPreview.flash();
    }
  
    /**
     * Appelé quand une nouvelle pièce apparaît : shift visuel de la file.
     */
    function onNewPiece() {
      nextPreview.animateShift();
    }
  
    // ---------------------------------------------------------------------
    // MODE
    // ---------------------------------------------------------------------
  
    /**
     * @param {number} target
     */
    function setSprintTarget(target) {
      sprintTarget = Math.max(1, target | 0);
      if (sprintLabel) sprintLabel.textContent = `0 / ${sprintTarget}`;
    }
  
    // ---------------------------------------------------------------------
    // LIFECYCLE
    // ---------------------------------------------------------------------
  
    function hide() {
      host.classList.add('hidden');
    }
    function show() {
      host.classList.remove('hidden');
    }
  
    function destroy() {
      nextPreview.destroy();
      holdPreview.destroy();
      host.innerHTML = '';
      host.classList.remove('hud', `hud--${mode}`, 'hud--danger');
    }
  
    return Object.freeze({
      update,
      flash,
      celebrateLevelUp,
      celebrateHold,
      onNewPiece,
      setSprintTarget,
      hide,
      show,
      destroy,
    });
  }
  
  // ---------------------------------------------------------------------
  // HELPERS LOCAUX
  // ---------------------------------------------------------------------
  
  /**
   * Crée un bloc label + valeur stylé.
   * @param {string} label
   * @param {string} initialValue
   * @param {string} cssClass
   */
  function statBlock(label, initialValue, cssClass) {
    const labelEl = el('div', { class: 'hud__stat-label' }, label);
    const valueEl = el('div', { class: 'hud__stat-value' }, initialValue);
    const root = el('div', { class: `hud__stat ${cssClass}` }, [labelEl, valueEl]);
    return { root, label: labelEl, value: valueEl };
  }
  
  /**
   * Retourne un label utilisateur pour un mode.
   * @param {string} mode
   */
  function labelForMode(mode) {
    if (mode === GAME_MODES.SPRINT_40L) return 'SPRINT 40L';
    if (mode === GAME_MODES.ZEN) return 'ZEN';
    return 'MARATHON';
  }
  
  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }