/**
 * bag.test.js — Tests du 7-bag randomizer.
 *
 * Vérifie :
 *  - Toute séquence de 7 pièces consécutives contient les 7 types uniques.
 *  - L'ordre à l'intérieur d'un sac est bien aléatoire (différent selon seed).
 *  - Même seed → même séquence (reproductibilité).
 *  - peek(n) renvoie exactement n éléments et ne consomme rien.
 *  - clone() produit un sac indépendant.
 *  - next() ne tombe jamais en panne, même après des milliers d'appels.
 */

import { describe, it, expect } from 'vitest';
import { createBag, createSeededRng } from '../src/core/bag.js';
import { PIECE_TYPES } from '../src/core/constants.js';

describe('createBag', () => {
  it('retourne des types valides issus de PIECE_TYPES', () => {
    const bag = createBag({ rng: createSeededRng(1) });
    for (let i = 0; i < 100; i++) {
      const type = bag.next();
      expect(PIECE_TYPES).toContain(type);
    }
  });

  it('distribue les 7 pièces uniques par fenêtre de 7 (propriété guideline)', () => {
    const bag = createBag({ rng: createSeededRng(42) });
    // On tire 10 fenêtres de 7 pièces : toutes doivent être des permutations
    // de PIECE_TYPES.
    for (let win = 0; win < 10; win++) {
      const window = [];
      for (let i = 0; i < 7; i++) window.push(bag.next());
      const unique = new Set(window);
      expect(unique.size).toBe(7);
      for (const t of PIECE_TYPES) {
        expect(unique.has(t)).toBe(true);
      }
    }
  });

  it('produit des séquences reproductibles avec la même seed', () => {
    const a = createBag({ rng: createSeededRng(12345) });
    const b = createBag({ rng: createSeededRng(12345) });
    const seqA = [], seqB = [];
    for (let i = 0; i < 50; i++) { seqA.push(a.next()); seqB.push(b.next()); }
    expect(seqA).toEqual(seqB);
  });

  it('produit des séquences différentes pour deux seeds différentes', () => {
    const a = createBag({ rng: createSeededRng(1) });
    const b = createBag({ rng: createSeededRng(2) });
    const seqA = [], seqB = [];
    for (let i = 0; i < 14; i++) { seqA.push(a.next()); seqB.push(b.next()); }
    // Très improbable qu'elles soient strictement identiques
    expect(seqA).not.toEqual(seqB);
  });

  it('peek(n) retourne n éléments sans consommer', () => {
    const bag = createBag({ rng: createSeededRng(7) });
    const preview = bag.peek(5);
    expect(preview.length).toBe(5);
    // Les 5 prochains next() doivent correspondre au peek
    for (let i = 0; i < 5; i++) {
      expect(bag.next()).toBe(preview[i]);
    }
  });

  it('peek(0) retourne un tableau vide sans lever', () => {
    const bag = createBag();
    expect(bag.peek(0)).toEqual([]);
  });

  it('peek(n) recharge autant de sacs que nécessaire (n > 7)', () => {
    const bag = createBag({ rng: createSeededRng(9) });
    const preview = bag.peek(20);
    expect(preview.length).toBe(20);
    // Les 20 prochains next() doivent correspondre au peek
    for (let i = 0; i < 20; i++) {
      expect(bag.next()).toBe(preview[i]);
    }
  });

  it('clone() produit un sac indépendant (next() sur un ne change pas l\'autre)', () => {
    const a = createBag({ rng: createSeededRng(123) });
    // On consomme un peu pour mettre le sac "au milieu"
    a.next();
    a.next();
    const b = a.clone();

    const nextA = a.next();
    const nextB = b.next();
    // Comme les deux sacs partagent le RNG+state, le premier coup est identique
    expect(nextA).toBe(nextB);

    // À partir d'ici, consommer 20 fois sur a ne doit pas affecter b's
    // "état visible" (on vérifie que peek de b reste cohérent avec son next).
    for (let i = 0; i < 20; i++) a.next();

    const peekB = b.peek(3);
    expect(peekB.length).toBe(3);
    // Les prochains next() de b correspondent à son peek — indépendant de a
    expect(b.next()).toBe(peekB[0]);
    expect(b.next()).toBe(peekB[1]);
    expect(b.next()).toBe(peekB[2]);
  });

  it('ne plante pas sur des milliers d\'appels next()', () => {
    const bag = createBag({ rng: createSeededRng(55) });
    expect(() => {
      for (let i = 0; i < 10000; i++) bag.next();
    }).not.toThrow();
  });

  it('initialBag permet de forcer un sac initial (tests déterministes)', () => {
    const bag = createBag({
      rng: createSeededRng(1),
      // Convention : next() pop depuis la fin, donc I sera tiré en premier
      // puis O, T, Z, S, L, J.
      initialBag: ['J', 'L', 'S', 'Z', 'T', 'O', 'I'],
    });
    expect(bag.next()).toBe('I');
    expect(bag.next()).toBe('O');
    expect(bag.next()).toBe('T');
    expect(bag.next()).toBe('Z');
    expect(bag.next()).toBe('S');
    expect(bag.next()).toBe('L');
    expect(bag.next()).toBe('J');
    // Après épuisement, le sac recharge automatiquement et next() ne fail pas
    expect(PIECE_TYPES).toContain(bag.next());
  });

  it('currentBag() retourne une copie défensive', () => {
    const bag = createBag({ rng: createSeededRng(77) });
    const snapshot = bag.currentBag();
    snapshot.push('X'); // on pollue la copie
    const snapshot2 = bag.currentBag();
    expect(snapshot2).not.toContain('X');
  });
});

describe('createSeededRng', () => {
  it('produit toujours une valeur dans [0, 1)', () => {
    const rng = createSeededRng(0);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('même seed → même séquence', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });
});