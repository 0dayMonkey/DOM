/**
 * transitions.js — Transitions plein écran entre scènes.
 *
 * Fournit trois transitions au-dessus de #transition-overlay :
 *  - fade  : fondu noir classique (passe-partout)
 *  - iris  : cercle qui se ferme puis s'ouvre (style N64/Mario)
 *  - flash : flash blanc bref (enchaînements toniques, pas un vrai fondu)
 *
 * Chaque transition expose deux phases :
 *  - `out(kind)` : avant destruction de la scène courante (retourne Promise)
 *  - `in(kind)`  : après mount de la nouvelle scène, s'efface
 *
 * L'overlay passe de pointer-events:none à auto pendant l'animation pour
 * bloquer les clics qui passeraient au travers.
 */

/**
 * @typedef {'fade' | 'iris' | 'flash'} TransitionKind
 */

/**
 * @typedef {Object} TransitionsOptions
 * @property {HTMLElement} host
 * @property {number} [fadeMs=500]
 * @property {number} [irisMs=700]
 * @property {number} [flashMs=180]
 */

/**
 * @param {TransitionsOptions} options
 */
export function createTransitions(options) {
    const host = options.host;
    const fadeMs = options.fadeMs ?? 500;
    const irisMs = options.irisMs ?? 700;
    const flashMs = options.flashMs ?? 180;
  
    host.classList.add('transition-overlay');
  
    function reset() {
      host.className = 'transition-overlay';
      host.style.cssText = '';
      host.style.opacity = '0';
      host.style.pointerEvents = 'none';
    }
  
    /**
     * @param {TransitionKind} [kind='fade']
     * @returns {Promise<void>}
     */
    async function out(kind = 'fade') {
      host.classList.add('is-active');
      host.style.pointerEvents = 'auto';
  
      if (kind === 'flash') {
        return runFlash();
      }
      if (kind === 'iris') {
        return runIrisClose();
      }
      return runFadeOut();
    }
  
    /**
     * @param {TransitionKind} [kind='fade']
     * @returns {Promise<void>}
     */
    async function in_(kind = 'fade') {
      if (kind === 'flash') {
        // le flash est déjà "sorti" pendant out(); on nettoie
        reset();
        return;
      }
      if (kind === 'iris') {
        return runIrisOpen();
      }
      return runFadeIn();
    }
  
    // ---------------------------------------------------------------------
    // FADE
    // ---------------------------------------------------------------------
  
    function runFadeOut() {
      return new Promise((resolve) => {
        host.style.transition = `opacity ${fadeMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
        host.style.background = 'var(--outline-dark, #1A1A2E)';
        host.style.opacity = '0';
        // force reflow
        // eslint-disable-next-line no-unused-expressions
        host.offsetHeight;
        host.style.opacity = '1';
        setTimeout(() => resolve(), fadeMs + 20);
      });
    }
  
    function runFadeIn() {
      return new Promise((resolve) => {
        host.style.transition = `opacity ${fadeMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
        host.style.opacity = '0';
        setTimeout(() => {
          reset();
          resolve();
        }, fadeMs + 20);
      });
    }
  
    // ---------------------------------------------------------------------
    // IRIS
    // ---------------------------------------------------------------------
  
    function runIrisClose() {
      return new Promise((resolve) => {
        host.classList.add('iris');
        host.style.background = 'var(--outline-dark, #1A1A2E)';
        host.style.opacity = '1';
        host.style.clipPath = 'circle(100% at 50% 50%)';
        host.style.transition = `clip-path ${irisMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
        // eslint-disable-next-line no-unused-expressions
        host.offsetHeight;
        host.style.clipPath = 'circle(0% at 50% 50%)';
        setTimeout(() => resolve(), irisMs + 20);
      });
    }
  
    function runIrisOpen() {
      return new Promise((resolve) => {
        host.classList.add('iris');
        host.style.background = 'var(--outline-dark, #1A1A2E)';
        host.style.opacity = '1';
        host.style.clipPath = 'circle(0% at 50% 50%)';
        host.style.transition = `clip-path ${irisMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
        // eslint-disable-next-line no-unused-expressions
        host.offsetHeight;
        host.style.clipPath = 'circle(100% at 50% 50%)';
        setTimeout(() => {
          reset();
          resolve();
        }, irisMs + 20);
      });
    }
  
    // ---------------------------------------------------------------------
    // FLASH
    // ---------------------------------------------------------------------
  
    function runFlash() {
      return new Promise((resolve) => {
        host.style.transition = 'none';
        host.style.background = '#FFFFFF';
        host.style.opacity = '1';
        host.classList.add('flash-white');
        // eslint-disable-next-line no-unused-expressions
        host.offsetHeight;
        host.style.transition = `opacity ${flashMs}ms ease-out`;
        host.style.opacity = '0';
        setTimeout(() => {
          reset();
          resolve();
        }, flashMs + 20);
      });
    }
  
    // ---------------------------------------------------------------------
    // AVANCÉ — transitions enchaînées
    // ---------------------------------------------------------------------
  
    /**
     * Enchaîne out → action → in comme une "pipeline" simple.
     * @param {TransitionKind} kind
     * @param {() => Promise<void> | void} action
     */
    async function wrap(kind, action) {
      await out(kind);
      await Promise.resolve(action());
      await in_(kind);
    }
  
    reset();
  
    return Object.freeze({
      out,
      in: in_,
      reset,
      wrap,
    });
  }