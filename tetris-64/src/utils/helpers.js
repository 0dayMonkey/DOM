/**
 * helpers.js — Utilitaires généraux partagés dans tout le projet.
 *
 * Ce module ne dépend que du DOM standard et ne connaît rien du moteur
 * de jeu. Toutes les fonctions sont pures ou purement utilitaires.
 */

// ============================================================================
// MATHÉMATIQUES
// ============================================================================

/**
 * Limite une valeur entre min et max.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }
  
  /**
   * Interpolation linéaire.
   * @param {number} a
   * @param {number} b
   * @param {number} t - 0..1
   * @returns {number}
   */
  export function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  /**
   * Remappe une valeur d'un intervalle à un autre.
   * @param {number} v
   * @param {number} inMin
   * @param {number} inMax
   * @param {number} outMin
   * @param {number} outMax
   * @returns {number}
   */
  export function mapRange(v, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMin;
    const t = (v - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
  }
  
  /**
   * Easing : ease out cubic.
   * @param {number} t - 0..1
   * @returns {number}
   */
  export function easeOutCubic(t) {
    const x = 1 - t;
    return 1 - x * x * x;
  }
  
  /**
   * Easing : ease in out quad.
   * @param {number} t - 0..1
   * @returns {number}
   */
  export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  
  // ============================================================================
  // TIMING
  // ============================================================================
  
  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  /**
   * Attend la fin d'une animation CSS sur un élément.
   * Timeout de sécurité pour éviter les promesses "orphelines".
   *
   * @param {HTMLElement} el
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<void>}
   */
  export function waitForAnimation(el, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener('animationend', finish);
        el.removeEventListener('transitionend', finish);
        resolve();
      };
      el.addEventListener('animationend', finish, { once: true });
      el.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
  }
  
  /**
   * Throttle simple : appelle fn au plus 1 fois tous les `intervalMs` ms.
   *
   * @template T
   * @param {(...args: any[]) => T} fn
   * @param {number} intervalMs
   * @returns {(...args: any[]) => void}
   */
  export function throttle(fn, intervalMs) {
    let last = 0;
    /** @type {any} */
    let lastArgs = null;
    let pending = /** @type {any} */ (null);
    return function throttled(...args) {
      const now = performance.now();
      lastArgs = args;
      if (now - last >= intervalMs) {
        last = now;
        fn(...args);
      } else if (pending == null) {
        const remain = intervalMs - (now - last);
        pending = setTimeout(() => {
          pending = null;
          last = performance.now();
          fn(...lastArgs);
        }, remain);
      }
    };
  }
  
  /**
   * Debounce : appelle fn après `ms` sans appels supplémentaires.
   *
   * @template T
   * @param {(...args: any[]) => T} fn
   * @param {number} ms
   * @returns {(...args: any[]) => void}
   */
  export function debounce(fn, ms) {
    /** @type {any} */
    let t = null;
    return function debounced(...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn(...args);
      }, ms);
    };
  }
  
  // ============================================================================
  // DOM
  // ============================================================================
  
  /**
   * $ : raccourci querySelector avec typage amélioré.
   * @template {HTMLElement} T
   * @param {string} selector
   * @param {ParentNode} [root=document]
   * @returns {T | null}
   */
  export function $(selector, root = document) {
    return /** @type {T | null} */ (root.querySelector(selector));
  }
  
  /**
   * $$ : raccourci querySelectorAll en tableau.
   * @template {HTMLElement} T
   * @param {string} selector
   * @param {ParentNode} [root=document]
   * @returns {T[]}
   */
  export function $$(selector, root = document) {
    return /** @type {T[]} */ (Array.from(root.querySelectorAll(selector)));
  }
  
  /**
   * Crée un élément avec attributs et enfants optionnels.
   *
   * @param {string} tag
   * @param {Record<string, any>} [attrs]
   * @param {Array<Node | string> | string} [children]
   * @returns {HTMLElement}
   */
  export function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') {
          e.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
        } else if (k === 'style' && typeof v === 'object') {
          Object.assign(e.style, v);
        } else if (k === 'dataset' && typeof v === 'object') {
          for (const dk in v) e.dataset[dk] = String(v[dk]);
        } else if (k.startsWith('on') && typeof v === 'function') {
          e.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'text' || k === 'textContent') {
          e.textContent = String(v);
        } else if (k === 'html' || k === 'innerHTML') {
          e.innerHTML = String(v);
        } else if (v === true) {
          e.setAttribute(k, '');
        } else {
          e.setAttribute(k, String(v));
        }
      }
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c == null) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return e;
  }
  
  /**
   * Supprime tous les enfants d'un élément.
   * @param {Element} element
   */
  export function clearChildren(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }
  
  /**
   * Set a CSS variable on an element.
   * @param {HTMLElement} element
   * @param {string} name - sans le '--'
   * @param {string | number} value
   */
  export function setCssVar(element, name, value) {
    const v = typeof value === 'number' ? String(value) : value;
    const key = name.startsWith('--') ? name : `--${name}`;
    element.style.setProperty(key, v);
  }
  
  /**
   * Lit une variable CSS sur un élément (fallback getComputedStyle).
   * @param {HTMLElement} element
   * @param {string} name
   * @returns {string}
   */
  export function getCssVar(element, name) {
    const key = name.startsWith('--') ? name : `--${name}`;
    return getComputedStyle(element).getPropertyValue(key).trim();
  }
  
  // ============================================================================
  // FORMATAGE
  // ============================================================================
  
  /**
   * Formate un nombre avec espaces tous les 3 chiffres (ex : 1 234 567).
   * @param {number} n
   * @returns {string}
   */
  export function formatNumber(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  
  /**
   * Formate une durée ms en "MM:SS.ms".
   * @param {number} ms
   * @returns {string}
   */
  export function formatTime(ms) {
    const totalSec = ms / 1000;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.floor(totalSec % 60);
    const millis = Math.floor(ms % 1000);
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const mmm = String(millis).padStart(3, '0');
    return `${mm}:${ss}.${mmm}`;
  }
  
  /**
   * Pad d'un score avec zéros à gauche.
   * @param {number} n
   * @param {number} width
   * @returns {string}
   */
  export function padScore(n, width = 8) {
    return String(Math.max(0, Math.floor(n))).padStart(width, '0');
  }
  
  // ============================================================================
  // SYSTÈME
  // ============================================================================
  
  /**
   * Détecte si l'utilisateur est sur un appareil tactile.
   * @returns {boolean}
   */
  export function isTouchDevice() {
    return (
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0))
    );
  }
  
  /**
   * Détecte la préférence utilisateur pour les animations réduites.
   * @returns {boolean}
   */
  export function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  
  /**
   * Bus d'événements minimaliste (publish/subscribe).
   * Utile pour scenes ↔ UI ↔ FX sans couplage direct.
   *
   * @returns {{
   *   on: (event: string, handler: Function) => () => void,
   *   off: (event: string, handler: Function) => void,
   *   emit: (event: string, payload?: any) => void,
   *   clear: () => void
   * }}
   */
  export function createEventBus() {
    /** @type {Map<string, Set<Function>>} */
    const map = new Map();
    return {
      on(event, handler) {
        let s = map.get(event);
        if (!s) { s = new Set(); map.set(event, s); }
        s.add(handler);
        return () => s.delete(handler);
      },
      off(event, handler) {
        const s = map.get(event);
        if (s) s.delete(handler);
      },
      emit(event, payload) {
        const s = map.get(event);
        if (!s) return;
        s.forEach((fn) => {
          try { fn(payload); } catch (_) { /* isolé */ }
        });
      },
      clear() {
        map.clear();
      },
    };
  }
  
  /**
   * UID monotone (compteur en mémoire).
   * @returns {() => string}
   */
  export function createUid(prefix = 'id') {
    let n = 0;
    return () => `${prefix}_${++n}`;
  }
  
  /**
   * No-op : utile comme défaut pour des callbacks optionnels.
   */
  export function noop() {}