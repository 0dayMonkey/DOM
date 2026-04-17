/**
 * tspin.test.js — Tests de détection des T-Spins.
 *
 * Vérifie :
 *  - Pas de T-Spin si la pièce n'est pas un T.
 *  - Pas de T-Spin si le dernier mouvement n'est pas une rotation.
 *  - T-Spin proper (3 coins dont les 2 avant).
 *  - T-Spin mini (3 coins mais pas les 2 avant).
 *  - TST kick (index 4) promeut un mini en proper.
 *  - classifyClear renvoie les bons identifiants de scoring.
 */

import { describe, it, expect } from 'vitest';
import { detectTSpin, classifyClear, isB2BEligibleClear } from '../src/core/tspin.js';
import { createPiece } from '../src/core/piece.js';
import { createEmptyGrid } from '../src/core/board.js';

/**
 * Crée une grille avec des cellules pré-remplies selon un set de points.
 * @param {Array<[number,number]>} filled
 */
function gridWith(filled) {
  const g = createEmptyGrid();
  for (const [x, y] of filled) g[y][x] = 1;
  return g;
}

describe('detectTSpin — conditions de base', () => {
  it('retourne kind="none" si la pièce n\'est pas un T', () => {
    const grid = gridWith([]);
    const piece = createPiece('L', 3, 18, 0);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('none');
  });

  it('retourne kind="none" si lastMoveWasRotation=false', () => {
    const grid = gridWith([]);
    const piece = createPiece('T', 3, 18, 0);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: false, lastKickIndex: 0 });
    expect(r.kind).toBe('none');
  });

  it('retourne kind="none" si moins de 3 coins sont occupés', () => {
    const grid = gridWith([]); // grille vide → 0 coin occupé
    const piece = createPiece('T', 3, 10, 0);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('none');
    expect(r.cornersFilled).toBe(0);
  });
});

describe('detectTSpin — proper vs mini', () => {
  /*
   * Rappel : pour un T en rotation 0 (pointe vers le haut), la boîte 3×3
   * a ses 4 coins aux positions locales :
   *   TL = (0, 0)   TR = (2, 0)    ← coins "avant" (pointe)
   *   BL = (0, 2)   BR = (2, 2)
   *
   * Placement utilisé : piece en (3, 10). Donc coins absolus :
   *   TL = (3, 10)   TR = (5, 10)
   *   BL = (3, 12)   BR = (5, 12)
   */

  it('T-Spin proper : 2 coins avant + 1 coin arrière remplis', () => {
    const grid = gridWith([
      [3, 10], // TL (avant)
      [5, 10], // TR (avant)
      [3, 12], // BL (arrière)
    ]);
    const piece = createPiece('T', 3, 10, 0);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('proper');
    expect(r.cornersFilled).toBe(3);
    expect(r.frontFilled).toBe(true);
  });

  it('T-Spin proper : 4 coins remplis', () => {
    const grid = gridWith([
      [3, 10], [5, 10],  // front
      [3, 12], [5, 12],  // back
    ]);
    const piece = createPiece('T', 3, 10, 0);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('proper');
    expect(r.cornersFilled).toBe(4);
  });

  it('T-Spin mini : 3 coins dont 1 seul coin avant', () => {
    const grid = gridWith([
      [3, 10], // TL (avant uniquement)
      [3, 12], // BL (arrière)
      [5, 12], // BR (arrière)
    ]);
    const piece = createPiece('T', 3, 10, 0);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('mini');
    expect(r.cornersFilled).toBe(3);
    expect(r.frontFilled).toBe(false);
  });

  it('TST kick (index 4) promeut un mini en proper', () => {
    const grid = gridWith([
      [3, 10], // TL (avant uniquement)
      [3, 12], // BL (arrière)
      [5, 12], // BR (arrière)
    ]);
    const piece = createPiece('T', 3, 10, 0);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 4 });
    expect(r.kind).toBe('proper');
  });
});

describe('detectTSpin — orientations du T', () => {
  it('rotation 1 (droite) : coins avant = TR, BR', () => {
    // Placement piece à (3, 10), rotation 1.
    // Coins absolus :
    //   TL=(3,10), TR=(5,10), BL=(3,12), BR=(5,12)
    // Coins avant en rotation 1 : TR et BR
    const grid = gridWith([
      [5, 10], // TR
      [5, 12], // BR
      [3, 12], // BL arrière
    ]);
    const piece = createPiece('T', 3, 10, 1);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('proper');
  });

  it('rotation 2 (bas) : coins avant = BL, BR', () => {
    const grid = gridWith([
      [3, 12], // BL
      [5, 12], // BR
      [3, 10], // TL arrière
    ]);
    const piece = createPiece('T', 3, 10, 2);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('proper');
  });

  it('rotation 3 (gauche) : coins avant = TL, BL', () => {
    const grid = gridWith([
      [3, 10], // TL
      [3, 12], // BL
      [5, 10], // TR arrière
    ]);
    const piece = createPiece('T', 3, 10, 3);
    const r = detectTSpin(piece, grid, { lastMoveWasRotation: true, lastKickIndex: 0 });
    expect(r.kind).toBe('proper');
  });
});

describe('classifyClear', () => {
  const noTSpin = { kind: 'none', cornersFilled: 0, frontFilled: false };
  const proper  = { kind: 'proper', cornersFilled: 3, frontFilled: true };
  const mini    = { kind: 'mini', cornersFilled: 3, frontFilled: false };

  it('clears standards', () => {
    expect(classifyClear(noTSpin, 0)).toBe('NONE');
    expect(classifyClear(noTSpin, 1)).toBe('SINGLE');
    expect(classifyClear(noTSpin, 2)).toBe('DOUBLE');
    expect(classifyClear(noTSpin, 3)).toBe('TRIPLE');
    expect(classifyClear(noTSpin, 4)).toBe('TETRIS');
  });

  it('T-Spin proper clears', () => {
    expect(classifyClear(proper, 0)).toBe('TSPIN_NO_LINES');
    expect(classifyClear(proper, 1)).toBe('TSPIN_SINGLE');
    expect(classifyClear(proper, 2)).toBe('TSPIN_DOUBLE');
    expect(classifyClear(proper, 3)).toBe('TSPIN_TRIPLE');
  });

  it('T-Spin mini clears', () => {
    expect(classifyClear(mini, 0)).toBe('TSPIN_MINI_NO_LINES');
    expect(classifyClear(mini, 1)).toBe('TSPIN_MINI_SINGLE');
  });
});

describe('isB2BEligibleClear', () => {
  it('TETRIS + TSPIN_* sont éligibles', () => {
    expect(isB2BEligibleClear('TETRIS')).toBe(true);
    expect(isB2BEligibleClear('TSPIN_SINGLE')).toBe(true);
    expect(isB2BEligibleClear('TSPIN_DOUBLE')).toBe(true);
    expect(isB2BEligibleClear('TSPIN_TRIPLE')).toBe(true);
    expect(isB2BEligibleClear('TSPIN_MINI_SINGLE')).toBe(true);
  });

  it('SINGLE / DOUBLE / TRIPLE ne sont PAS éligibles', () => {
    expect(isB2BEligibleClear('SINGLE')).toBe(false);
    expect(isB2BEligibleClear('DOUBLE')).toBe(false);
    expect(isB2BEligibleClear('TRIPLE')).toBe(false);
    expect(isB2BEligibleClear('NONE')).toBe(false);
  });
});