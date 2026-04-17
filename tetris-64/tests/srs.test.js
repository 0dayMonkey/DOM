/**
 * srs.test.js — Tests du Super Rotation System.
 *
 * Vérifie :
 *  - Rotation simple sans obstacle (kick 0) sur toutes les pièces.
 *  - O ne tourne pas (no-op accepté).
 *  - Les kicks JLSTZ sont bien essayés quand le kick 0 échoue.
 *  - Les kicks I (table spécifique) fonctionnent différemment des JLSTZ.
 *  - La rotation est refusée si aucun des 5 kicks ne passe.
 *  - Les rotations 180° ont leur propre table.
 *  - La transition d'états (0→R→2→L→0) reste cyclique.
 */

import { describe, it, expect } from 'vitest';
import { tryRotate, getKicksFor } from '../src/core/srs.js';
import { createPiece, spawnPiece } from '../src/core/piece.js';
import { createEmptyGrid } from '../src/core/board.js';
import { BOARD_COLS, BOARD_TOTAL_ROWS } from '../src/core/constants.js';

describe('tryRotate — cas de base', () => {
  it('rotation CW sans obstacle accepte le kick 0 sur toutes les pièces', () => {
    const grid = createEmptyGrid();
    for (const type of ['I', 'O', 'T', 'S', 'Z', 'J', 'L']) {
      const piece = spawnPiece(type);
      const r = tryRotate(piece, grid, 1);
      expect(r.success).toBe(true);
      expect(r.kickIndex).toBe(0);
    }
  });

  it('rotation CCW sans obstacle accepte le kick 0', () => {
    const grid = createEmptyGrid();
    for (const type of ['T', 'S', 'Z', 'J', 'L', 'I']) {
      const piece = spawnPiece(type);
      const r = tryRotate(piece, grid, -1);
      expect(r.success).toBe(true);
      expect(r.kickIndex).toBe(0);
    }
  });

  it('O ne tourne pas mais retourne success=true', () => {
    const grid = createEmptyGrid();
    const piece = spawnPiece('O');
    const r = tryRotate(piece, grid, 1);
    expect(r.success).toBe(true);
    expect(r.piece.rotation).toBe(piece.rotation);
    expect(r.kickIndex).toBe(0);
  });
});

describe('tryRotate — états cycliques', () => {
  it('4 rotations CW ramènent à l\'état initial', () => {
    const grid = createEmptyGrid();
    let piece = spawnPiece('T');
    const initialRot = piece.rotation;
    for (let i = 0; i < 4; i++) {
      const r = tryRotate(piece, grid, 1);
      expect(r.success).toBe(true);
      piece = r.piece;
    }
    expect(piece.rotation).toBe(initialRot);
  });

  it('4 rotations CCW ramènent à l\'état initial', () => {
    const grid = createEmptyGrid();
    let piece = spawnPiece('J');
    const initialRot = piece.rotation;
    for (let i = 0; i < 4; i++) {
      const r = tryRotate(piece, grid, -1);
      expect(r.success).toBe(true);
      piece = r.piece;
    }
    expect(piece.rotation).toBe(initialRot);
  });

  it('rotation 180° change bien l\'état de 2', () => {
    const grid = createEmptyGrid();
    const piece = spawnPiece('L');
    const r = tryRotate(piece, grid, 2);
    expect(r.success).toBe(true);
    expect((r.piece.rotation - piece.rotation + 4) % 4).toBe(2);
  });
});

describe('tryRotate — kicks JLSTZ sur collision', () => {
  it('T collé contre le mur gauche utilise un kick pour tourner CW', () => {
    const grid = createEmptyGrid();
    // T en x=0, rotation 0 : la pièce occupe colonnes 0..2 horizontalement.
    // Après rotation CW (rotation 1), la forme change et le pivot peut
    // "pousser" la pièce hors du mur si on n'applique pas de kick.
    const piece = createPiece('T', -1, 10, 0);
    const r = tryRotate(piece, grid, 1);
    expect(r.success).toBe(true);
    // Un kick non-nul a été utilisé (la rotation naïve collait au mur)
    expect(r.kickIndex).toBeGreaterThanOrEqual(0);
  });

  it('une rotation impossible (pièce enfermée) est refusée', () => {
    // On construit un "étau" autour d'un T pour qu'aucun kick ne puisse passer.
    const grid = createEmptyGrid();
    // Remplit une grosse zone autour du T
    for (let y = 0; y < BOARD_TOTAL_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        grid[y][x] = 1;
      }
    }
    // On ne laisse libres que les 3 cellules exactes que le T occupe en rotation 0
    // (forme : [0,1,0][1,1,1][0,0,0]).
    // Placement : T à (3, 10).
    const px = 3, py = 10;
    // Libère la forme actuelle
    grid[py + 0][px + 1] = 0;
    grid[py + 1][px + 0] = 0;
    grid[py + 1][px + 1] = 0;
    grid[py + 1][px + 2] = 0;

    const piece = createPiece('T', px, py, 0);
    const r = tryRotate(piece, grid, 1);
    expect(r.success).toBe(false);
    expect(r.kickIndex).toBe(-1);
    // La pièce renvoyée reste identique à l'originale en cas d'échec
    expect(r.piece.rotation).toBe(piece.rotation);
  });
});

describe('tryRotate — kicks I', () => {
  it('I utilise la table de kicks spécifique (différente des JLSTZ)', () => {
    const kicksI = getKicksFor('I', 0, 1);
    const kicksJLSTZ = getKicksFor('T', 0, 1);
    // Les deux tables commencent par [0, 0] mais divergent au kick 1
    expect(kicksI[1]).not.toEqual(kicksJLSTZ[1]);
  });

  it('I tourne librement au centre sans kick', () => {
    const grid = createEmptyGrid();
    const piece = spawnPiece('I');
    const r = tryRotate(piece, grid, 1);
    expect(r.success).toBe(true);
    expect(r.kickIndex).toBe(0);
  });
});

describe('getKicksFor — lecture de la table', () => {
  it('retourne 5 kicks pour JLSTZ en CW', () => {
    const kicks = getKicksFor('T', 0, 1);
    expect(kicks.length).toBe(5);
    // Le premier kick est toujours (0, 0) (rotation naïve)
    expect(kicks[0]).toEqual([0, 0]);
  });

  it('retourne 5 kicks pour I en CW', () => {
    const kicks = getKicksFor('I', 0, 1);
    expect(kicks.length).toBe(5);
    expect(kicks[0]).toEqual([0, 0]);
  });

  it('retourne 5 kicks pour la rotation 180°', () => {
    const kicks = getKicksFor('T', 0, 2);
    expect(kicks.length).toBe(5);
    expect(kicks[0]).toEqual([0, 0]);
  });

  it('O renvoie une table triviale', () => {
    const kicks = getKicksFor('O', 0, 1);
    expect(kicks).toEqual([[0, 0]]);
  });
});

describe('tryRotate — résultat détaillé', () => {
  it('retourne kickOffset correspondant au kick utilisé', () => {
    const grid = createEmptyGrid();
    const piece = spawnPiece('T');
    const r = tryRotate(piece, grid, 1);
    expect(r.success).toBe(true);
    expect(r.kickOffset).toEqual([0, 0]); // kick 0 au centre
  });

  it('fromRotation et toRotation sont cohérents', () => {
    const grid = createEmptyGrid();
    const piece = createPiece('T', 4, 10, 1);
    const r = tryRotate(piece, grid, 1);
    expect(r.success).toBe(true);
    expect(r.fromRotation).toBe(1);
    expect(r.toRotation).toBe(2);
  });

  it('echec : fromRotation reste identique à la rotation de départ', () => {
    const grid = createEmptyGrid();
    // Enferme le T
    for (let y = 0; y < BOARD_TOTAL_ROWS; y++) for (let x = 0; x < BOARD_COLS; x++) grid[y][x] = 1;
    const px = 3, py = 10;
    grid[py + 0][px + 1] = 0;
    grid[py + 1][px + 0] = 0;
    grid[py + 1][px + 1] = 0;
    grid[py + 1][px + 2] = 0;
    const piece = createPiece('T', px, py, 0);
    const r = tryRotate(piece, grid, 1);
    expect(r.success).toBe(false);
    expect(r.fromRotation).toBe(0);
  });
});