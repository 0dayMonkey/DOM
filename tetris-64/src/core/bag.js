/**
 * bag.js — 7-bag randomizer (Random Generator) conforme aux guidelines.
 *
 * Garantit que toutes les 7 pièces apparaissent une fois avant qu'une seule
 * ne se répète. Implémenté comme un générateur stateful qui recharge un sac
 * mélangé à chaque fois qu'il est vide.
 *
 * Pour la testabilité, on accepte une fonction random injectable (par défaut
 * Math.random) permettant de fournir un RNG déterministe.
 *
 * Module pur, zéro DOM.
 */

import { PIECE_TYPES } from './constants.js';

/**
 * @typedef {() => number} RandomFn  Retourne un flottant dans [0, 1).
 */

/**
 * @typedef {Object} Bag
 * @property {() => string} next          Retourne le prochain type de pièce.
 * @property {(n: number) => string[]} peek Renvoie les n prochaines pièces sans consommer.
 * @property {() => Bag} clone            Copie indépendante du sac (pour simulation).
 * @property {() => string[]} currentBag  État interne du sac courant (debug).
 */

/**
 * Mélange un tableau via Fisher–Yates, en place.
 * @template T
 * @param {T[]} arr
 * @param {RandomFn} rng
 * @returns {T[]} Le même tableau, mélangé.
 */
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Crée un nouveau sac mélangé.
 * @param {RandomFn} rng
 * @returns {string[]}
 */
function makeShuffledBag(rng) {
  const fresh = [...PIECE_TYPES];
  return shuffleInPlace(fresh, rng);
}

/**
 * Crée un 7-bag randomizer.
 *
 * @param {Object} [options]
 * @param {RandomFn} [options.rng=Math.random] - RNG injectable (tests).
 * @param {string[]} [options.initialBag]      - Sac initial (tests).
 * @returns {Bag}
 */
export function createBag(options = {}) {
  const rng = options.rng ?? Math.random;

  /** @type {string[]} Sac courant ; les pièces sont tirées depuis la fin. */
  let bag = options.initialBag ? [...options.initialBag] : makeShuffledBag(rng);

  /**
   * S'assure que le sac a au moins `n` pièces disponibles en enchaînant
   * autant de sacs neufs que nécessaire.
   * @param {number} n
   */
  function ensureAtLeast(n) {
    while (bag.length < n) {
      // On préserve les pièces restantes en tête (ordre FIFO lors de .pop()
      // depuis la fin), puis on préfixe un sac frais devant.
      const freshBag = makeShuffledBag(rng);
      bag = freshBag.concat(bag);
    }
  }

  /**
   * Retourne et retire la prochaine pièce.
   * @returns {string}
   */
  function next() {
    ensureAtLeast(1);
    // On consomme depuis la fin (pop) : O(1) et ordre naturel
    // puisque on préfixe les nouveaux sacs.
    return /** @type {string} */ (bag.pop());
  }

  /**
   * Retourne les `n` prochaines pièces dans l'ordre de tirage, sans consommer.
   * @param {number} n
   * @returns {string[]}
   */
  function peek(n) {
    if (n <= 0) return [];
    ensureAtLeast(n);
    // bag = [future_n_pièces..., ..., next_pièce_at_end]
    // On veut retourner dans l'ordre de tirage : dernière pop = première renvoyée.
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = bag[bag.length - 1 - i];
    }
    return out;
  }

  /**
   * Clone immuable : utile pour simuler des coups sans altérer l'état.
   * @returns {Bag}
   */
  function clone() {
    return createBag({ rng, initialBag: [...bag] });
  }

  /**
   * Expose l'état courant du sac (copie défensive). Utilisé en tests et debug.
   * @returns {string[]}
   */
  function currentBag() {
    return [...bag];
  }

  return Object.freeze({ next, peek, clone, currentBag });
}

/**
 * Helper : crée un RNG déterministe (mulberry32) à partir d'une graine.
 * Pratique pour les tests et pour les seeds partagés.
 *
 * @param {number} seed - Entier 32-bit.
 * @returns {RandomFn}
 */
export function createSeededRng(seed) {
  let a = seed >>> 0;
  return function mulberry32() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}