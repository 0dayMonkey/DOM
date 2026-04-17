/**
 * keyboard.js — Capture clavier + gestion DAS/ARR.
 *
 * Convertit les KeyboardEvent en actions abstraites via actionMap, et
 * implémente la répétition automatique directionnelle pour le gameplay :
 *
 *  - DAS (Delayed Auto Shift) : délai entre le premier move et le début de
 *    la répétition automatique.
 *  - ARR (Auto Repeat Rate)   : intervalle entre deux répétitions.
 *
 * Seules MOVE_LEFT, MOVE_RIGHT et SOFT_DROP bénéficient de DAS/ARR ; les
 * autres actions (rotation, hard drop, hold, etc.) sont déclenchées une
 * fois par keydown, pas de répétition.
 *
 * Ce module appelle actionMap.trigger() avec les phases 'down', 'repeat',
 * 'up'. Il publie aussi un event 'keydown' / 'keyup' brut pour des usages
 * spéciaux (UI qui veut écouter n'importe quelle touche).
 */

import {
    DAS_MS,
    ARR_MS,
    SOFT_DROP_INTERVAL_MS,
    ACTIONS,
  } from '../core/constants.js';
  
  /**
   * @typedef {Object} KeyboardOptions
   * @property {ReturnType<import('./actionMap.js').createActionMap>} actionMap
   * @property {number} [das=DAS_MS]
   * @property {number} [arr=ARR_MS]
   * @property {number} [softDropInterval=SOFT_DROP_INTERVAL_MS]
   * @property {EventTarget} [target=window]
   */
  
  /** Actions qui profitent de la répétition automatique. */
  const REPEATABLE_ACTIONS = new Set([
    ACTIONS.MOVE_LEFT,
    ACTIONS.MOVE_RIGHT,
    ACTIONS.SOFT_DROP,
  ]);
  
  /**
   * Crée le gestionnaire clavier.
   * @param {KeyboardOptions} options
   */
  export function createKeyboard(options) {
    const actionMap = options.actionMap;
    const das = options.das ?? DAS_MS;
    const arr = options.arr ?? ARR_MS;
    const sdInterval = options.softDropInterval ?? SOFT_DROP_INTERVAL_MS;
    const target = options.target ?? window;
  
    /** Set de codes de touches physiques actuellement enfoncées. */
    /** @type {Set<string>} */
    const pressed = new Set();
  
    /**
     * État par action répétable : permet d'émettre les "repeat" à la bonne
     * cadence à partir de update().
     * @type {Map<string, { heldMs: number, lastRepeatMs: number, dasSatisfied: boolean }>}
     */
    const repeatState = new Map();
  
    /** Pour éviter les doublons : actions "down" déjà émises. */
    /** @type {Set<string>} */
    const downEmitted = new Set();
  
    // -------------------------------------------------------------------
    // HANDLERS DOM
    // -------------------------------------------------------------------
  
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      // Repeat natif du navigateur : on l'ignore, on fait notre propre DAS/ARR.
      if (e.repeat) return;
  
      const code = e.code;
      if (pressed.has(code)) return;
      pressed.add(code);
  
      const action = actionMap.resolveKey(code);
      if (!action) return;
  
      // Empêche le scroll / comportement par défaut sur certaines touches de jeu.
      if (isGameKey(code)) e.preventDefault();
  
      // Pour soft drop : gestion gauche/droite (MOVE_LEFT + MOVE_RIGHT pressés
      // simultanément) — on émet down normalement, la résolution est dans
      // les listeners (le moteur gère la collision).
      if (!downEmitted.has(action)) {
        actionMap.trigger(action, 'down', { code });
        downEmitted.add(action);
      }
  
      if (REPEATABLE_ACTIONS.has(action)) {
        // Pour MOVE_LEFT / MOVE_RIGHT : si l'autre sens est déjà enfoncé,
        // le nouveau prend priorité (comportement "last key wins").
        if (action === ACTIONS.MOVE_LEFT) {
          clearRepeat(ACTIONS.MOVE_RIGHT);
        } else if (action === ACTIONS.MOVE_RIGHT) {
          clearRepeat(ACTIONS.MOVE_LEFT);
        }
        repeatState.set(action, {
          heldMs: 0,
          lastRepeatMs: 0,
          dasSatisfied: false,
        });
      }
    }
  
    /** @param {KeyboardEvent} e */
    function onKeyUp(e) {
      const code = e.code;
      if (!pressed.has(code)) return;
      pressed.delete(code);
  
      const action = actionMap.resolveKey(code);
      if (!action) return;
  
      if (isGameKey(code)) e.preventDefault();
  
      // On ne relance 'up' que si aucune autre touche mappée sur la même action
      // n'est encore enfoncée (plusieurs touches peuvent mapper sur HOLD par ex.).
      if (!anyKeyStillDownForAction(action)) {
        actionMap.trigger(action, 'up', { code });
        downEmitted.delete(action);
        clearRepeat(action);
      }
    }
  
    /** Perte de focus : on relâche tout proprement. */
    function onBlur() {
      pressed.forEach((code) => {
        const action = actionMap.resolveKey(code);
        if (action && downEmitted.has(action)) {
          actionMap.trigger(action, 'up', { code });
          downEmitted.delete(action);
        }
      });
      pressed.clear();
      repeatState.clear();
    }
  
    /**
     * @param {string} action
     * @returns {boolean}
     */
    function anyKeyStillDownForAction(action) {
      for (const code of pressed) {
        if (actionMap.resolveKey(code) === action) return true;
      }
      return false;
    }
  
    /** @param {string} action */
    function clearRepeat(action) {
      repeatState.delete(action);
    }
  
    /** @param {string} code */
    function isGameKey(code) {
      // On empêche le default sur les touches les plus courantes.
      return (
        code === 'Space' ||
        code === 'ArrowUp' || code === 'ArrowDown' ||
        code === 'ArrowLeft' || code === 'ArrowRight' ||
        code === 'Tab'
      );
    }
  
    // -------------------------------------------------------------------
    // REPEAT (DAS/ARR) — appelé par main.js chaque frame
    // -------------------------------------------------------------------
  
    /**
     * @param {number} dtMs
     */
    function update(dtMs) {
      if (repeatState.size === 0) return;
  
      repeatState.forEach((st, action) => {
        st.heldMs += dtMs;
        if (!st.dasSatisfied) {
          if (st.heldMs >= das) {
            st.dasSatisfied = true;
            st.lastRepeatMs = 0;
            // Émet un premier repeat immédiat à l'expiration du DAS.
            actionMap.trigger(action, 'repeat', { das: true });
          }
          return;
        }
        // DAS satisfait : on émet un repeat tous les ARR ms
        // (ou sdInterval pour soft drop).
        const interval = action === ACTIONS.SOFT_DROP ? sdInterval : arr;
        st.lastRepeatMs += dtMs;
        while (st.lastRepeatMs >= interval) {
          st.lastRepeatMs -= interval;
          actionMap.trigger(action, 'repeat');
        }
      });
    }
  
    // -------------------------------------------------------------------
    // LIFECYCLE
    // -------------------------------------------------------------------
  
    /** @type {any} */ const tgt = target;
    tgt.addEventListener('keydown', onKeyDown, { passive: false });
    tgt.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', onBlur);
  
    function destroy() {
      tgt.removeEventListener('keydown', onKeyDown);
      tgt.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
      repeatState.clear();
      downEmitted.clear();
    }
  
    /**
     * Force un relâchement logique de toutes les touches (ex. sur changement
     * de scène, pour éviter un "repeat" qui traîne).
     */
    function releaseAll() {
      onBlur();
    }
  
    /**
     * @param {string} code
     * @returns {boolean}
     */
    function isPressed(code) {
      return pressed.has(code);
    }
  
    return Object.freeze({
      update,
      destroy,
      releaseAll,
      isPressed,
    });
  }