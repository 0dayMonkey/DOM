/**
 * actionMap.js — Mapping centralisé touches ↔ actions abstraites.
 *
 * Le jeu raisonne en termes d'actions (MOVE_LEFT, HARD_DROP, INTERACT...).
 * Chaque source d'input (keyboard, touch, gamepad) convertit ses événements
 * bruts en actions via ce module, et les publie à tous les listeners
 * intéressés. Les scènes s'abonnent aux actions qui les concernent.
 *
 * Avantages :
 *  - Une seule source de vérité pour les bindings.
 *  - Facile à re-binder (paramètres utilisateur futurs).
 *  - Permet d'empiler des "contexts" (title, hub, game, menu) pour que les
 *    mêmes touches signifient différentes choses selon la scène.
 *
 * Module purement logique : aucun addEventListener ici, c'est keyboard.js /
 * touch.js qui appellent `trigger(action, phase)`.
 */

import { DEFAULT_KEYMAP, ACTIONS } from '../core/constants.js';

/**
 * @typedef {'down' | 'up' | 'repeat'} InputPhase
 */

/**
 * @typedef {Object} ActionEvent
 * @property {string} action
 * @property {InputPhase} phase
 * @property {any} [source]
 */

/**
 * @param {{keymap?: Record<string, string>}} [options]
 */
export function createActionMap(options = {}) {
  /** @type {Record<string, string>} */
  let keymap = { ...(options.keymap ?? DEFAULT_KEYMAP) };

  /** @type {Map<string, Set<(e: ActionEvent) => void>>} */
  const listeners = new Map();

  /** @type {string[]} Stack de contextes actifs (top = courant). */
  const contextStack = ['global'];

  /** @type {Map<string, Set<string>>} Contexte → set d'actions autorisées. */
  const contextActions = new Map();

  // Par défaut : global autorise toutes les actions connues.
  contextActions.set('global', new Set(Object.values(ACTIONS)));

  // -----------------------------------------------------------------------
  // KEYMAP
  // -----------------------------------------------------------------------

  /**
   * @param {string} code
   * @returns {string | null}
   */
  function resolveKey(code) {
    return keymap[code] ?? null;
  }

  /**
   * @param {Record<string, string>} newMap
   */
  function setKeymap(newMap) {
    keymap = { ...newMap };
  }

  /**
   * @param {string} code
   * @param {string} action
   */
  function bind(code, action) {
    keymap[code] = action;
  }

  /**
   * @param {string} code
   */
  function unbind(code) {
    delete keymap[code];
  }

  function getKeymap() {
    return { ...keymap };
  }

  // -----------------------------------------------------------------------
  // LISTENERS
  // -----------------------------------------------------------------------

  /**
   * @param {string} action
   * @param {(e: ActionEvent) => void} handler
   * @returns {() => void}
   */
  function on(action, handler) {
    let set = listeners.get(action);
    if (!set) {
      set = new Set();
      listeners.set(action, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  /**
   * @param {string} action
   * @param {(e: ActionEvent) => void} handler
   */
  function off(action, handler) {
    const set = listeners.get(action);
    if (set) set.delete(handler);
  }

  /**
   * @param {string} action
   * @param {InputPhase} [phase='down']
   * @param {any} [source]
   */
  function trigger(action, phase = 'down', source) {
    if (!isActionAllowedInCurrentContext(action)) return;
    const set = listeners.get(action);
    if (!set || set.size === 0) return;
    const evt = { action, phase, source };
    set.forEach((fn) => {
      try { fn(evt); } catch (e) { console.error('[actionMap] handler error', e); }
    });
  }

  // -----------------------------------------------------------------------
  // CONTEXTES
  // -----------------------------------------------------------------------

  /**
   * @param {string} name
   * @param {string[]} actions
   */
  function defineContext(name, actions) {
    contextActions.set(name, new Set(actions));
  }

  /**
   * @param {string} name
   */
  function pushContext(name) {
    contextStack.push(name);
  }

  /**
   * @returns {string | null}
   */
  function popContext() {
    if (contextStack.length <= 1) return null;
    return contextStack.pop() ?? null;
  }

  /**
   * @param {string} name
   */
  function replaceContext(name) {
    contextStack[contextStack.length - 1] = name;
  }

  function getContext() {
    return contextStack[contextStack.length - 1];
  }

  /**
   * @param {string} action
   * @returns {boolean}
   */
  function isActionAllowedInCurrentContext(action) {
    const ctx = getContext();
    const allowed = contextActions.get(ctx);
    if (!allowed) return true;
    return allowed.has(action);
  }

  // -----------------------------------------------------------------------
  // DÉFINITIONS PAR DÉFAUT DES CONTEXTES
  // -----------------------------------------------------------------------
  // Règle : on autorise dans chaque contexte les actions qui ont un sens
  // pour ce contexte.

  defineContext('title', [
    ACTIONS.INTERACT, ACTIONS.START, ACTIONS.BACK,
    ACTIONS.MOVE_UP, ACTIONS.MOVE_DOWN, ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT,
    ACTIONS.HARD_DROP,
    ACTIONS.MUTE, ACTIONS.PAUSE,
  ]);

  // Hub : les flèches ↑/↓ du keymap par défaut sont mappées sur ROTATE_CW
  // et SOFT_DROP (pour Tetris). On les autorise donc dans le contexte hub
  // pour qu'elles atteignent player.js qui les interprète comme MOVE_UP /
  // MOVE_DOWN.
  defineContext('hub', [
    ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT, ACTIONS.MOVE_UP, ACTIONS.MOVE_DOWN,
    ACTIONS.INTERACT, ACTIONS.BACK, ACTIONS.START, ACTIONS.PAUSE, ACTIONS.MUTE,
    ACTIONS.HARD_DROP,
    // Fallback flèches Haut/Bas : elles arrivent comme ROTATE_CW/SOFT_DROP
    // dans le keymap par défaut. player.js les écoute aussi.
    ACTIONS.ROTATE_CW, ACTIONS.SOFT_DROP,
  ]);

  defineContext('game', [
    ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT,
    ACTIONS.SOFT_DROP, ACTIONS.HARD_DROP,
    ACTIONS.ROTATE_CW, ACTIONS.ROTATE_CCW, ACTIONS.ROTATE_180,
    ACTIONS.HOLD, ACTIONS.PAUSE, ACTIONS.MUTE, ACTIONS.BACK,
  ]);

  defineContext('menu', [
    ACTIONS.MOVE_UP, ACTIONS.MOVE_DOWN, ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT,
    ACTIONS.INTERACT, ACTIONS.BACK, ACTIONS.PAUSE, ACTIONS.MUTE,
    ACTIONS.START,
  ]);

  // -----------------------------------------------------------------------
  // DIVERS
  // -----------------------------------------------------------------------

  function clearListeners() {
    listeners.clear();
  }

  return Object.freeze({
    resolveKey, setKeymap, bind, unbind, getKeymap,
    on, off, trigger, clearListeners,
    defineContext, pushContext, popContext, replaceContext, getContext,
  });
}