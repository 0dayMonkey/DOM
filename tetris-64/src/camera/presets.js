/**
 * presets.js — Presets de caméra nommés + helpers de transition.
 *
 * Ce module complète CAMERA_PRESETS de constants.js avec :
 *   - des presets dérivés (variations légères)
 *   - des séquences de caméra pré-composées (ex : intro title → hub)
 *   - des helpers de lecture (resolve par nom avec fallback)
 *
 * Aucune dépendance DOM : on manipule juste des objets Transform3D.
 */

import { CAMERA_PRESETS } from '../core/constants.js';
import { composeTransforms, identityTransform } from '../utils/math3d.js';

/**
 * @typedef {import('../utils/math3d.js').Transform3D} Transform3D
 */

// ============================================================================
// PRESETS ÉTENDUS
// ============================================================================

/**
 * Presets additionnels utilisés par les scènes, au-delà des bases de
 * constants.js. Toutes les clés sont disponibles via `getPreset()`.
 *
 * @type {Readonly<Record<string, Transform3D>>}
 */
export const EXTRA_PRESETS = Object.freeze({
  // Title
  TITLE_CLOSE: { x: 0, y: 0, z: -200, rx: -3, ry: 0, rz: 0 },
  TITLE_WIDE: { x: 0, y: -40, z: -500, rx: -8, ry: 0, rz: 0 },

  // Hub
  HUB_INTRO: { x: 0, y: -300, z: -900, rx: -28, ry: 0, rz: 0 },
  HUB_DOOR_ZOOM: { x: 0, y: -80, z: 200, rx: -6, ry: 0, rz: 0 },
  HUB_PAINTING_ZOOM: { x: 0, y: -100, z: 400, rx: -2, ry: 0, rz: 0 },

  // Game — emphasis
  GAME_CLEAR_EMPHASIS: { x: 0, y: 0, z: 80, rx: -10, ry: 0, rz: 0 },
  GAME_TETRIS_EMPHASIS: { x: 0, y: 0, z: 140, rx: -12, ry: 0, rz: 0 },
  GAME_GAME_OVER: { x: 0, y: -30, z: -100, rx: -4, ry: 0, rz: 0 },

  // Shake root (utilisé par-dessus d'autres presets)
  NEUTRAL: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
});

/**
 * Fusion finale des presets : base + extra.
 * @type {Readonly<Record<string, Transform3D>>}
 */
export const ALL_PRESETS = Object.freeze({
  ...CAMERA_PRESETS,
  ...EXTRA_PRESETS,
});

// ============================================================================
// API
// ============================================================================

/**
 * Résout un nom de preset en Transform3D complète. Retourne identity si inconnu.
 *
 * @param {string} name
 * @returns {Transform3D}
 */
export function getPreset(name) {
  const p = /** @type {Record<string, Transform3D>} */ (ALL_PRESETS)[name];
  if (!p) {
    console.warn(`[presets] preset inconnu : ${name}`);
    return identityTransform();
  }
  return { ...identityTransform(), ...p };
}

/**
 * Retourne la liste des noms de presets disponibles.
 * @returns {string[]}
 */
export function listPresets() {
  return Object.keys(ALL_PRESETS);
}

/**
 * Combine un preset avec un offset additionnel (pour tilts dynamiques).
 * @param {string} name
 * @param {Partial<Transform3D>} delta
 * @returns {Transform3D}
 */
export function presetWithDelta(name, delta) {
  return composeTransforms(getPreset(name), {
    ...identityTransform(),
    ...delta,
  });
}

// ============================================================================
// SÉQUENCES
// ============================================================================

/**
 * Une séquence de caméra est une liste de keyframes utilisés par le
 * sceneManager ou les transitions pour chaîner des moveTo().
 *
 * @typedef {Object} CameraKeyframe
 * @property {string | Transform3D} target
 * @property {number} duration
 * @property {'linear' | 'easeOut' | 'easeIn' | 'easeInOut' | 'sharp'} [easing]
 * @property {number} [hold]  - ms à attendre après atteinte du keyframe.
 */

/**
 * Séquence intro title : zoom avant doux sur le logo.
 * @type {ReadonlyArray<CameraKeyframe>}
 */
export const SEQUENCE_TITLE_INTRO = Object.freeze([
  { target: 'TITLE_WIDE', duration: 0 },
  { target: 'TITLE_ORBIT', duration: 1200, easing: 'easeOut' },
  { target: 'TITLE_CLOSE', duration: 900, easing: 'easeInOut', hold: 200 },
]);

/**
 * Séquence entrée du hub : vue large → descente sur le joueur.
 * @type {ReadonlyArray<CameraKeyframe>}
 */
export const SEQUENCE_HUB_ENTER = Object.freeze([
  { target: 'HUB_INTRO', duration: 0 },
  { target: 'HUB_OVERVIEW', duration: 1200, easing: 'easeOut', hold: 300 },
  { target: 'HUB_FOLLOW', duration: 900, easing: 'easeInOut' },
]);

/**
 * Séquence fin de partie : léger zoom arrière + tilt.
 * @type {ReadonlyArray<CameraKeyframe>}
 */
export const SEQUENCE_GAME_OVER = Object.freeze([
  { target: 'GAME_GAME_OVER', duration: 800, easing: 'easeOut' },
]);

/**
 * Exécute une séquence sur une caméra donnée. Retourne une Promise qui
 * résout quand la séquence est terminée.
 *
 * @param {{ moveTo: (t: any, ms: number, ease?: any, cb?: () => void) => void }} camera
 * @param {ReadonlyArray<CameraKeyframe>} sequence
 * @returns {Promise<void>}
 */
export function runSequence(camera, sequence) {
  return new Promise((resolve) => {
    let i = 0;
    function next() {
      if (i >= sequence.length) {
        resolve();
        return;
      }
      const kf = sequence[i++];
      camera.moveTo(kf.target, kf.duration ?? 0, kf.easing ?? 'easeInOut', () => {
        if (kf.hold && kf.hold > 0) {
          setTimeout(next, kf.hold);
        } else {
          next();
        }
      });
    }
    next();
  });
}