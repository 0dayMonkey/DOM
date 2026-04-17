/**
 * scoring.test.js — Tests du système de scoring Tetris Guideline.
 *
 * Couverture :
 *  - Points de base × niveau
 *  - Back-to-Back (×1.5) sur clears éligibles consécutifs
 *  - Combo (+50 × niveau × compteur, cumulé)
 *  - Soft drop (+1/cellule) et hard drop (+2/cellule)
 *  - Perfect Clear bonus
 *  - Montée de niveau tous les 10 lignes
 *  - Reset du combo sur un tour sans lignes
 */

import { describe, it, expect } from 'vitest';
import {
  createScoreState,
  applyClearEvent,
  addDropPoints,
  levelForLines,
  previewClearPoints,
} from '../src/core/scoring.js';
import { SCORE_BASE, B2B_MULTIPLIER } from '../src/core/constants.js';

describe('createScoreState', () => {
  it('état initial cohérent (niveau 1 par défaut)', () => {
    const s = createScoreState();
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.lines).toBe(0);
    expect(s.combo).toBe(-1);
    expect(s.b2b).toBe(0);
    expect(s.startLevel).toBe(1);
  });

  it('accepte un niveau de départ', () => {
    const s = createScoreState(5);
    expect(s.level).toBe(5);
    expect(s.startLevel).toBe(5);
  });

  it('clamp le niveau de départ à MAX_LEVEL', () => {
    const s = createScoreState(999);
    expect(s.level).toBeLessThanOrEqual(20);
    expect(s.level).toBeGreaterThanOrEqual(1);
  });
});

describe('applyClearEvent — clears standards', () => {
  it('SINGLE donne 100 × niveau', () => {
    const s = createScoreState(1);
    const { state, delta } = applyClearEvent(s, {
      clearId: 'SINGLE', linesCleared: 1, perfectClear: false,
    });
    expect(delta.linePoints).toBe(SCORE_BASE.SINGLE * 1);
    expect(state.score).toBe(SCORE_BASE.SINGLE);
    expect(state.lines).toBe(1);
  });

  it('TETRIS donne 800 × niveau', () => {
    const s = createScoreState(3);
    const { state } = applyClearEvent(s, {
      clearId: 'TETRIS', linesCleared: 4, perfectClear: false,
    });
    expect(state.score).toBe(SCORE_BASE.TETRIS * 3);
    expect(state.lines).toBe(4);
  });

  it('un clear de 0 ligne ne crédite rien (sauf T-Spin)', () => {
    const s = createScoreState(1);
    const { state } = applyClearEvent(s, {
      clearId: 'NONE', linesCleared: 0, perfectClear: false,
    });
    expect(state.score).toBe(0);
  });
});

describe('applyClearEvent — Back-to-Back', () => {
  it('deux TETRIS consécutifs : le 2e est multiplié par B2B', () => {
    let s = createScoreState(1);

    // 1er TETRIS : pas de bonus B2B
    let r = applyClearEvent(s, { clearId: 'TETRIS', linesCleared: 4, perfectClear: false });
    expect(r.delta.b2bMultiplier).toBe(1);
    s = r.state;
    expect(s.b2b).toBe(1);

    // 2e TETRIS : B2B appliqué
    r = applyClearEvent(s, { clearId: 'TETRIS', linesCleared: 4, perfectClear: false });
    expect(r.delta.b2bMultiplier).toBe(B2B_MULTIPLIER);
    expect(r.delta.linePoints).toBe(Math.round(SCORE_BASE.TETRIS * 1 * B2B_MULTIPLIER));
    expect(r.state.b2b).toBe(2);
  });

  it('un SINGLE entre deux TETRIS casse le B2B', () => {
    let s = createScoreState(1);
    s = applyClearEvent(s, { clearId: 'TETRIS', linesCleared: 4, perfectClear: false }).state;
    expect(s.b2b).toBe(1);
    s = applyClearEvent(s, { clearId: 'SINGLE', linesCleared: 1, perfectClear: false }).state;
    expect(s.b2b).toBe(0);
    // Le TETRIS suivant démarre à nouveau un B2B (compteur = 1)
    const r = applyClearEvent(s, { clearId: 'TETRIS', linesCleared: 4, perfectClear: false });
    expect(r.delta.b2bMultiplier).toBe(1);
    expect(r.state.b2b).toBe(1);
  });

  it('T-Spin no lines NE casse PAS le B2B', () => {
    let s = createScoreState(1);
    s = applyClearEvent(s, { clearId: 'TETRIS', linesCleared: 4, perfectClear: false }).state;
    const before = s.b2b;
    s = applyClearEvent(s, { clearId: 'TSPIN_NO_LINES', linesCleared: 0, perfectClear: false }).state;
    expect(s.b2b).toBe(before);
  });
});

describe('applyClearEvent — Combo', () => {
  it('deux clears consécutifs incrémentent le combo et ajoutent des points', () => {
    let s = createScoreState(2);
    let r = applyClearEvent(s, { clearId: 'SINGLE', linesCleared: 1, perfectClear: false });
    expect(r.state.combo).toBe(0);
    expect(r.delta.comboPoints).toBe(0);
    s = r.state;

    r = applyClearEvent(s, { clearId: 'SINGLE', linesCleared: 1, perfectClear: false });
    expect(r.state.combo).toBe(1);
    // comboPoints = 50 × combo × niveau = 50 × 1 × 2 = 100
    expect(r.delta.comboPoints).toBe(100);

    s = r.state;
    r = applyClearEvent(s, { clearId: 'DOUBLE', linesCleared: 2, perfectClear: false });
    expect(r.state.combo).toBe(2);
    // comboPoints = 50 × 2 × 2 = 200
    expect(r.delta.comboPoints).toBe(200);
  });

  it('un tour sans lignes reset le combo à -1', () => {
    let s = createScoreState(1);
    s = applyClearEvent(s, { clearId: 'SINGLE', linesCleared: 1, perfectClear: false }).state;
    s = applyClearEvent(s, { clearId: 'SINGLE', linesCleared: 1, perfectClear: false }).state;
    expect(s.combo).toBe(1);
    s = applyClearEvent(s, { clearId: 'NONE', linesCleared: 0, perfectClear: false }).state;
    expect(s.combo).toBe(-1);
  });
});

describe('applyClearEvent — drops', () => {
  it('soft drop : +1 point par cellule', () => {
    const s = createScoreState(1);
    const r = applyClearEvent(s, {
      clearId: 'NONE', linesCleared: 0, perfectClear: false,
      softDropCells: 7, hardDropCells: 0,
    });
    expect(r.delta.dropPoints).toBe(7);
    expect(r.state.score).toBe(7);
  });

  it('hard drop : +2 points par cellule', () => {
    const s = createScoreState(1);
    const r = applyClearEvent(s, {
      clearId: 'NONE', linesCleared: 0, perfectClear: false,
      softDropCells: 0, hardDropCells: 10,
    });
    expect(r.delta.dropPoints).toBe(20);
    expect(r.state.score).toBe(20);
  });

  it('soft + hard drop cumulés', () => {
    const s = createScoreState(5);
    const r = applyClearEvent(s, {
      clearId: 'SINGLE', linesCleared: 1, perfectClear: false,
      softDropCells: 3, hardDropCells: 4,
    });
    // linePoints = 100 × 5 = 500
    // dropPoints = 3 × 1 + 4 × 2 = 11
    expect(r.delta.linePoints).toBe(500);
    expect(r.delta.dropPoints).toBe(11);
    expect(r.state.score).toBe(511);
  });
});

describe('addDropPoints (crédit pendant la chute)', () => {
  it('ajoute les points de drop sans toucher le combo ni le B2B', () => {
    const s = createScoreState(3);
    const r = addDropPoints(s, 5, 0);
    expect(r.points).toBe(5);
    expect(r.state.score).toBe(5);
    expect(r.state.combo).toBe(-1);
    expect(r.state.b2b).toBe(0);
  });
});

describe('applyClearEvent — Perfect Clear', () => {
  it('un perfect clear avec SINGLE ajoute un bonus × niveau', () => {
    const s = createScoreState(2);
    const r = applyClearEvent(s, {
      clearId: 'SINGLE', linesCleared: 1, perfectClear: true,
    });
    // linePoints = 100 × 2 = 200
    // perfectPoints = 800 × 2 = 1600
    expect(r.delta.linePoints).toBe(200);
    expect(r.delta.perfectPoints).toBe(1600);
    expect(r.state.score).toBe(1800);
  });

  it('perfect clear TETRIS : bonus 2000 × niveau', () => {
    const s = createScoreState(1);
    const r = applyClearEvent(s, {
      clearId: 'TETRIS', linesCleared: 4, perfectClear: true,
    });
    expect(r.delta.perfectPoints).toBe(2000);
  });

  it('perfect clear sans lignes ne crédite pas de bonus', () => {
    const s = createScoreState(1);
    const r = applyClearEvent(s, {
      clearId: 'NONE', linesCleared: 0, perfectClear: true,
    });
    expect(r.delta.perfectPoints).toBe(0);
  });
});

describe('Progression de niveau', () => {
  it('monte de niveau tous les 10 lignes', () => {
    let s = createScoreState(1);
    // On efface 10 SINGLE (1 ligne chacun)
    for (let i = 0; i < 9; i++) {
      s = applyClearEvent(s, { clearId: 'SINGLE', linesCleared: 1, perfectClear: false }).state;
    }
    expect(s.level).toBe(1);
    const r = applyClearEvent(s, { clearId: 'SINGLE', linesCleared: 1, perfectClear: false });
    expect(r.state.level).toBe(2);
    expect(r.delta.levelUp).toBe(true);
    expect(r.delta.newLevel).toBe(2);
  });

  it('ne descend jamais en dessous du niveau de départ', () => {
    const s = createScoreState(5);
    expect(s.level).toBe(5);
    expect(levelForLines(0, 5)).toBe(5);
    expect(levelForLines(5, 5)).toBe(5);
    expect(levelForLines(10, 5)).toBe(5);
  });

  it('level max est borné à 20', () => {
    expect(levelForLines(9999, 1)).toBe(20);
  });
});

describe('previewClearPoints', () => {
  it('retourne base × niveau sans multiplicateurs', () => {
    expect(previewClearPoints('SINGLE', 1)).toBe(100);
    expect(previewClearPoints('TETRIS', 5)).toBe(4000);
    expect(previewClearPoints('TSPIN_DOUBLE', 3)).toBe(3600);
  });

  it('retourne 0 pour un clearId inconnu', () => {
    expect(previewClearPoints('NONEXISTENT', 10)).toBe(0);
  });
});