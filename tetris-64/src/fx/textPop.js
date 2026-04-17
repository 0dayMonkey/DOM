/**
 * textPop.js — Textes animés qui "popent" à l'écran.
 *
 * Usage : afficher brièvement "TETRIS!", "COMBO x3", "T-SPIN DOUBLE",
 * "+ 2400", "LEVEL UP", "PERFECT CLEAR", etc.
 *
 * Chaque pop est un élément DOM auto-détruit après son animation CSS.
 * Le module expose une API de haut niveau (show, combo, tspin, score)
 * qui mappe sur des presets visuels.
 *
 * Positionnement :
 *  - par défaut au centre du host
 *  - possibilité de fournir (x, y) en px relatifs au host
 *  - possibilité de fournir 'above-board' / 'center' comme ancrage
 */

import { TEXT_POP_DURATION_MS } from '../core/constants.js';

/**
 * @typedef {'default'|'tetris'|'tspin'|'combo'|'b2b'|'perfect'|'levelup'|'score'|'danger'} PopVariant
 */

/**
 * @typedef {Object} PopConfig
 * @property {string} text
 * @property {PopVariant} [variant='default']
 * @property {number} [x]
 * @property {number} [y]
 * @property {'center'|'above-board'|'top'} [anchor='center']
 * @property {number} [duration]
 * @property {number} [scale=1]
 * @property {string} [color]
 */

/**
 * @typedef {Object} TextPopOptions
 * @property {HTMLElement} host
 */

const VARIANT_STYLES = Object.freeze({
    default: { color: '#FFF8E0',  big: false },
    tetris:  { color: '#F0C040',  big: true  },
    tspin:   { color: '#B048E0',  big: true  },
    combo:   { color: '#FFCC00',  big: false },
    b2b:     { color: '#00E5E5',  big: false },
    perfect: { color: '#2DB92D',  big: true  },
    levelup: { color: '#FF8800',  big: true  },
    score:   { color: '#FFF8E0',  big: false },
    danger:  { color: '#E60012',  big: false },
  });
  
  /**
   * Crée un gestionnaire de text pops.
   * @param {TextPopOptions} options
   */
  export function createTextPop(options) {
    const host = options.host;
    host.classList.add('text-pop-layer');
  
    /** @type {Set<HTMLElement>} */
    const active = new Set();
  
    /**
     * Affiche un pop générique.
     * @param {PopConfig} cfg
     * @returns {HTMLElement}
     */
    function show(cfg) {
      const variant = cfg.variant ?? 'default';
      const style = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;
      const dur = cfg.duration ?? TEXT_POP_DURATION_MS;
      const scale = cfg.scale ?? 1;
      const anchor = cfg.anchor ?? 'center';
  
      const el = document.createElement('div');
      el.className = `text-pop text-pop--${variant}`;
      el.textContent = cfg.text;
      el.style.color = cfg.color ?? style.color;
      el.style.setProperty('--pop-scale', String(scale));
      el.style.setProperty('--pop-duration', `${dur}ms`);
  
      if (style.big) el.classList.add('text-pop--big');
  
      // Positionnement
      if (typeof cfg.x === 'number' && typeof cfg.y === 'number') {
        el.style.left = `${cfg.x}px`;
        el.style.top = `${cfg.y}px`;
        el.style.transform = 'translate(-50%, -50%)';
      } else {
        // Utilise les classes d'ancrage
        el.classList.add(`text-pop--anchor-${anchor}`);
      }
  
      host.appendChild(el);
      active.add(el);
  
      // Auto-cleanup en fin d'animation
      const cleanup = () => {
        if (!active.has(el)) return;
        active.delete(el);
        if (el.parentNode) el.parentNode.removeChild(el);
      };
      el.addEventListener('animationend', cleanup, { once: true });
      setTimeout(cleanup, dur + 200); // filet de sécurité
  
      return el;
    }
  
    // ---------------------------------------------------------------------
    // PRESETS SÉMANTIQUES
    // ---------------------------------------------------------------------
  
    /**
     * Affiche le nom d'un clear (SINGLE, DOUBLE, TETRIS, ...).
     * @param {number} lines
     */
    function clearName(lines) {
      if (lines === 1) return show({ text: 'SINGLE', variant: 'default' });
      if (lines === 2) return show({ text: 'DOUBLE', variant: 'default', scale: 1.1 });
      if (lines === 3) return show({ text: 'TRIPLE', variant: 'default', scale: 1.2 });
      if (lines === 4) return show({ text: 'TETRIS!', variant: 'tetris', scale: 1.4 });
      return null;
    }
  
    /**
     * Affiche "T-SPIN", "T-SPIN DOUBLE", "T-SPIN MINI", etc.
     * @param {'mini'|'proper'} kind
     * @param {number} lines
     */
    function tspin(kind, lines) {
      const prefix = kind === 'mini' ? 'T-SPIN MINI' : 'T-SPIN';
      let text = prefix;
      if (lines === 1) text += ' SINGLE';
      else if (lines === 2) text += ' DOUBLE';
      else if (lines === 3) text += ' TRIPLE';
      return show({ text, variant: 'tspin', scale: 1.3 });
    }
  
    /**
     * Affiche "COMBO xN" (n > 0 requis pour affichage).
     * @param {number} n
     */
    function combo(n) {
      if (n <= 0) return null;
      return show({ text: `COMBO x${n}`, variant: 'combo', anchor: 'above-board' });
    }
  
    /**
     * Back-to-Back indicator.
     * @param {number} n
     */
    function b2b(n) {
      if (n <= 1) return null;
      return show({ text: `B2B x${n}`, variant: 'b2b', anchor: 'above-board', scale: 0.9 });
    }
  
    /**
     * Perfect clear.
     */
    function perfectClear() {
      return show({ text: 'PERFECT CLEAR!', variant: 'perfect', scale: 1.5 });
    }
  
    /**
     * Level up.
     * @param {number} level
     */
    function levelUp(level) {
      return show({ text: `LEVEL ${level}`, variant: 'levelup', scale: 1.3 });
    }
  
    /**
     * Points flottants (+1200).
     * @param {number} points
     * @param {number} [x]
     * @param {number} [y]
     */
    function score(points, x, y) {
      const text = `+${Math.round(points).toLocaleString('fr-FR')}`;
      /** @type {PopConfig} */
      const cfg = { text, variant: 'score', anchor: 'above-board' };
      if (typeof x === 'number' && typeof y === 'number') {
        cfg.x = x; cfg.y = y; cfg.anchor = undefined;
      }
      return show(cfg);
    }
  
    /**
     * Danger (stack trop haute).
     */
    function danger(text = 'DANGER!') {
      return show({ text, variant: 'danger', scale: 1.2 });
    }
  
    // ---------------------------------------------------------------------
    // GESTION
    // ---------------------------------------------------------------------
  
    function clear() {
      active.forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      active.clear();
    }
  
    function destroy() {
      clear();
      host.classList.remove('text-pop-layer');
    }
  
    function getActiveCount() {
      return active.size;
    }
  
    return Object.freeze({
      show,
      clearName,
      tspin,
      combo,
      b2b,
      perfectClear,
      levelUp,
      score,
      danger,
      clear,
      destroy,
      getActiveCount,
    });
  }