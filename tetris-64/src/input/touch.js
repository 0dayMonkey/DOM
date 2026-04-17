/**
 * touch.js — Inputs tactiles : gestes + bouton virtuel.
 *
 * Implémente les gestes suivants sur mobile :
 *  - tap court       → ROTATE_CW
 *  - tap long (hold) → HOLD
 *  - swipe ← / →     → MOVE_LEFT / MOVE_RIGHT (avec DAS côté actionMap)
 *  - swipe ↓ court   → SOFT_DROP
 *  - swipe ↓ long    → HARD_DROP
 *  - swipe ↑         → ROTATE_180
 *
 * Seuils réglables. Les gestes sont émis comme des actions 'down' (one-shot).
 * Pour le MOVE répété, on émet des triggers 'repeat' tant que le doigt reste
 * en dehors d'une zone morte, mesurée en "cells" depuis le point d'ancrage.
 *
 * Ce module active ses listeners uniquement sur les environnements tactiles
 * (détecté côté main.js). Il désactive aussi le pinch/zoom via touch-action
 * appliqué en CSS sur body.
 */

import { ACTIONS } from '../core/constants.js';

/**
 * @typedef {Object} TouchOptions
 * @property {HTMLElement} host
 * @property {ReturnType<import('./actionMap.js').createActionMap>} actionMap
 * @property {number} [tapMaxDurationMs=220]
 * @property {number} [tapMaxDistancePx=12]
 * @property {number} [longPressMs=450]
 * @property {number} [swipeThresholdPx=28]
 * @property {number} [horizontalStepPx=32]
 * @property {number} [hardDropThresholdPx=140]
 * @property {number} [softDropIntervalMs=45]
 */

/**
 * @param {TouchOptions} options
 */
export function createTouch(options) {
  const host = options.host;
  const actionMap = options.actionMap;
  const tapMaxDuration = options.tapMaxDurationMs ?? 220;
  const tapMaxDistance = options.tapMaxDistancePx ?? 12;
  const longPress = options.longPressMs ?? 450;
  const swipeTh = options.swipeThresholdPx ?? 28;
  const hStep = options.horizontalStepPx ?? 32;
  const hardDropTh = options.hardDropThresholdPx ?? 140;
  const sdInterval = options.softDropIntervalMs ?? 45;

  /** Touch actif (un seul à la fois pour simplifier). */
  /** @type {null | {
   *    id: number,
   *    startX: number, startY: number,
   *    lastX: number, lastY: number,
   *    startT: number,
   *    cellsMoved: number,
   *    lockedHoriz: boolean,
   *    didSwipe: boolean,
   *    softDropAccMs: number,
   *    longPressTimer: any,
   *  }}
   */
  let t = null;

  // -------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------

  /** @param {TouchEvent} e */
  function onStart(e) {
    if (t) return; // un seul doigt suivi
    const p = e.changedTouches[0];
    if (!p) return;
    t = {
      id: p.identifier,
      startX: p.clientX,
      startY: p.clientY,
      lastX: p.clientX,
      lastY: p.clientY,
      startT: performance.now(),
      cellsMoved: 0,
      lockedHoriz: false,
      didSwipe: false,
      softDropAccMs: 0,
      longPressTimer: setTimeout(() => {
        if (!t) return;
        // long press = HOLD (seulement si on n'a pas encore swipe)
        if (!t.didSwipe) {
          actionMap.trigger(ACTIONS.HOLD, 'down', { source: 'touch' });
          t.didSwipe = true; // empêche un tap plus tard
        }
      }, longPress),
    };
  }

  /** @param {TouchEvent} e */
  function onMove(e) {
    if (!t) return;
    const p = findTouch(e, t.id);
    if (!p) return;

    const dx = p.clientX - t.startX;
    const dy = p.clientY - t.startY;

    t.lastX = p.clientX;
    t.lastY = p.clientY;

    // Détermine l'axe dominant une fois le seuil passé.
    if (!t.lockedHoriz && Math.hypot(dx, dy) > swipeTh) {
      t.lockedHoriz = Math.abs(dx) > Math.abs(dy);
      t.didSwipe = true;
      cancelLongPress();

      // Swipe haut initial → rotation 180
      if (!t.lockedHoriz && dy < -swipeTh) {
        actionMap.trigger(ACTIONS.ROTATE_180, 'down', { source: 'touch' });
      }
    }

    if (!t.lockedHoriz) return;

    // Axe horizontal : on émet un MOVE par "step" de hStep pixels.
    const targetCells = Math.trunc(dx / hStep);
    while (t.cellsMoved < targetCells) {
      t.cellsMoved++;
      actionMap.trigger(ACTIONS.MOVE_RIGHT, t.cellsMoved === 1 ? 'down' : 'repeat', { source: 'touch' });
    }
    while (t.cellsMoved > targetCells) {
      t.cellsMoved--;
      actionMap.trigger(ACTIONS.MOVE_LEFT, t.cellsMoved === -1 ? 'down' : 'repeat', { source: 'touch' });
    }
  }

  /** @param {TouchEvent} e */
  function onEnd(e) {
    if (!t) return;
    const p = findTouch(e, t.id);
    if (!p) return;

    cancelLongPress();

    const dx = p.clientX - t.startX;
    const dy = p.clientY - t.startY;
    const dur = performance.now() - t.startT;
    const dist = Math.hypot(dx, dy);

    // TAP court = ROTATE CW
    if (!t.didSwipe && dur < tapMaxDuration && dist < tapMaxDistance) {
      actionMap.trigger(ACTIONS.ROTATE_CW, 'down', { source: 'touch' });
    }
    // Swipe vertical down (pas horizontal) → hard / soft drop
    else if (!t.lockedHoriz && dy > swipeTh) {
      if (dy > hardDropTh) {
        actionMap.trigger(ACTIONS.HARD_DROP, 'down', { source: 'touch' });
      } else {
        actionMap.trigger(ACTIONS.SOFT_DROP, 'down', { source: 'touch' });
        actionMap.trigger(ACTIONS.SOFT_DROP, 'up', { source: 'touch' });
      }
    }

    t = null;
  }

  /** @param {TouchEvent} e */
  function onCancel(_e) {
    if (!t) return;
    cancelLongPress();
    t = null;
  }

  function cancelLongPress() {
    if (t && t.longPressTimer) {
      clearTimeout(t.longPressTimer);
      t.longPressTimer = null;
    }
  }

  /**
   * @param {TouchEvent} e
   * @param {number} id
   */
  function findTouch(e, id) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === id) return touch;
    }
    return null;
  }

  // -------------------------------------------------------------------
  // SOFT DROP TENU (quand le doigt reste en bas hors zone morte)
  // -------------------------------------------------------------------

  /**
   * @param {number} dtMs
   */
  function update(dtMs) {
    if (!t || t.lockedHoriz) return;
    const dy = t.lastY - t.startY;
    // Si le doigt est maintenu ~60px+ sous le point de départ, on "glisse"
    // vers le bas en continu (sans déclencher de hard drop).
    if (dy > 60 && dy < hardDropTh) {
      t.softDropAccMs += dtMs;
      while (t.softDropAccMs >= sdInterval) {
        t.softDropAccMs -= sdInterval;
        actionMap.trigger(ACTIONS.SOFT_DROP, 'repeat', { source: 'touch' });
      }
    } else {
      t.softDropAccMs = 0;
    }
  }

  // -------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------

  host.addEventListener('touchstart', onStart, { passive: true });
  host.addEventListener('touchmove', onMove, { passive: true });
  host.addEventListener('touchend', onEnd, { passive: true });
  host.addEventListener('touchcancel', onCancel, { passive: true });

  function destroy() {
    host.removeEventListener('touchstart', onStart);
    host.removeEventListener('touchmove', onMove);
    host.removeEventListener('touchend', onEnd);
    host.removeEventListener('touchcancel', onCancel);
    cancelLongPress();
    t = null;
  }

  function releaseAll() {
    cancelLongPress();
    t = null;
  }

  return Object.freeze({
    update,
    destroy,
    releaseAll,
  });
}