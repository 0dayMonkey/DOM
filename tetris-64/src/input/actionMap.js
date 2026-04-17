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
   * Retourne l'action associée à un code de touche, ou null.
   * @param {string} code
   * @returns {string | null}
   */
  function resolveKey(code) {
    return keymap[code] ?? null;
  }

  /**
   * Remplace complètement le keymap.
   * @param {Record<string, string>} newMap
   */
  function setKeymap(newMap) {
    keymap = { ...newMap };
  }

  /**
   * Ajoute un binding individuel.
   * @param {string} code
   * @param {string} action
   */
  function bind(code, action) {
    keymap[code] = action;
  }

  /**
   * Retire un binding.
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
   * S'abonne à une action. Retourne une fonction d'unsub.
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
   * Retire un listener.
   * @param {string} action
   * @param {(e: ActionEvent) => void} handler
   */
  function off(action, handler) {
    const set = listeners.get(action);
    if (set) set.delete(handler);
  }

  /**
   * Déclenche une action (appelé par keyboard.js, touch.js, etc.).
   * Filtre par contexte courant.
   *
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
   * Définit les actions autorisées pour un contexte donné.
   * @param {string} name
   * @param {string[]} actions
   */
  function defineContext(name, actions) {
    contextActions.set(name, new Set(actions));
  }

  /**
   * Empile un contexte (devient actif).
   * @param {string} name
   */
  function pushContext(name) {
    contextStack.push(name);
  }

  /**
   * Dépile le contexte (retour au précédent).
   * @returns {string | null}
   */
  function popContext() {
    if (contextStack.length <= 1) return null;
    return contextStack.pop() ?? null;
  }

  /**
   * Remplace le haut de pile.
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
    if (!allowed) return true; // contexte non défini → on autorise tout
    return allowed.has(action);
  }

  // -----------------------------------------------------------------------
  // DÉFINITIONS PAR DÉFAUT DES CONTEXTES
  // -----------------------------------------------------------------------

  defineContext('title', [
    ACTIONS.INTERACT, ACTIONS.START, ACTIONS.BACK,
    ACTIONS.MOVE_UP, ACTIONS.MOVE_DOWN, ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT,
    ACTIONS.MUTE, ACTIONS.PAUSE,
  ]);

  defineContext('hub', [
    ACTIONS.MOVE_LEFT, ACTIONS.MOVE_RIGHT, ACTIONS.MOVE_UP, ACTIONS.MOVE_DOWN,
    ACTIONS.INTERACT, ACTIONS.BACK, ACTIONS.START, ACTIONS.PAUSE, ACTIONS.MUTE,
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
  ]);

  // -----------------------------------------------------------------------
  // DIVERS
  // -----------------------------------------------------------------------

  /**
   * Retire tous les listeners (utilisé au teardown d'une scène).
   */
  function clearListeners() {
    listeners.clear();
  }

  return Object.freeze({
    // keymap
    resolveKey, setKeymap, bind, unbind, getKeymap,
    // listeners
    on, off, trigger, clearListeners,
    // contexts
    defineContext, pushContext, popContext, replaceContext, getContext,
  });
}