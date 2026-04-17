/**
 * followCamera.js — Caméra "tierce personne" qui suit le joueur dans le hub.
 *
 * Comportement :
 *   - La caméra se place derrière le joueur (axe Z positif, décalage Y en hauteur).
 *   - Elle interpole sa position vers une cible désirée à chaque frame (lerp).
 *   - Elle regarde légèrement vers l'avant du joueur (lookAhead) pour donner
 *     un sentiment de mouvement et anticiper la trajectoire.
 *
 * Ce module écrit directement via `camera.setOffset()` — il ne touche pas
 * à la "transform" principale de la caméra, ce qui permet à d'autres
 * systèmes (transitions, presets) de préempter la caméra sans se battre.
 * Le followCamera ne fait QUE écrire un offset additionnel.
 *
 * On peut l'activer/désactiver à la volée (enable/disable) : utile pour
 * les cinématiques d'intro où la caméra suit une séquence fixe avant de
 * reprendre le joueur.
 */

import { lerp, lerpAngle } from '../utils/math3d.js';

/**
 * @typedef {Object} FollowCameraOptions
 * @property {ReturnType<import('../camera/camera.js').createCamera>} camera
 * @property {{getPosition: () => {x:number,y:number,z:number}, getAngle?: () => number}} target
 * @property {{x:number, y:number, z:number}} [offset]
 * @property {number} [lerp=0.08]
 * @property {number} [lookAheadFactor=0.3]
 * @property {number} [tiltDeg=-12]
 */

/**
 * @param {FollowCameraOptions} options
 */
export function createFollowCamera(options) {
  const camera = options.camera;
  const target = options.target;
  const offset = {
    x: options.offset?.x ?? 0,
    y: options.offset?.y ?? -120,
    z: options.offset?.z ?? 360,
  };
  const smoothing = options.lerp ?? 0.08;
  const lookAhead = options.lookAheadFactor ?? 0.3;
  const tiltDeg = options.tiltDeg ?? -12;

  /** Position filtrée (interpolée) de la caméra en coordonnées hub. */
  let curX = 0;
  let curY = offset.y;
  let curZ = offset.z;
  let curRy = 0;

  /** Position cible calculée chaque frame. */
  let tgtX = 0;
  let tgtY = offset.y;
  let tgtZ = offset.z;
  let tgtRy = 0;

  let enabled = false;

  // Initialisation immédiate : snap à la cible sans lerp
  snapToTarget();

  // ---------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------

  function enable() {
    enabled = true;
    snapToTarget();
    apply();
  }

  function disable() {
    enabled = false;
    // On remet l'offset caméra à zéro pour ne pas laisser de résidu.
    camera.setOffset({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  }

  /**
   * @param {number} dtMs
   */
  function update(_dtMs) {
    if (!enabled) return;
    computeTarget();
    // Interpolation cadrée au framerate (on multiplie par un gain constant).
    curX = lerp(curX, tgtX, smoothing);
    curY = lerp(curY, tgtY, smoothing);
    curZ = lerp(curZ, tgtZ, smoothing);
    curRy = lerpAngle(curRy, tgtRy, smoothing);
    apply();
  }

  function snapToTarget() {
    computeTarget();
    curX = tgtX; curY = tgtY; curZ = tgtZ; curRy = tgtRy;
  }

  function computeTarget() {
    const p = target.getPosition();
    const angle = target.getAngle ? target.getAngle() : 0;

    // Vecteur "derrière le joueur" : le joueur regarde dans la direction angle,
    // on recule sur ce même axe de `offset.z` pour se placer derrière lui.
    // atan2(dx, dz) ↦ l'axe "forward" du joueur est (sin(a), _, cos(a)).
    const backDist = offset.z;
    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);

    tgtX = p.x - fwdX * backDist;
    tgtZ = p.z - fwdZ * backDist;
    tgtY = p.y + offset.y;

    // Rotation Y de la caméra : elle "pointe" vers le joueur (donc sa rotation
    // est l'opposée de l'angle de recul).
    // Convention CSS : rotateY positif tourne dans le sens horaire autour de Y.
    tgtRy = (angle * 180) / Math.PI;
  }

  function apply() {
    // On applique la position comme un OFFSET de caméra. La caméra courante
    // reste maîtresse de son "preset" (ex: HUB_FOLLOW) ; cet offset s'y ajoute.
    camera.setOffset({
      x: curX,
      y: curY,
      z: curZ,
      rx: tiltDeg,
      ry: curRy,
      rz: 0,
    });
  }

  /**
   * Modifie l'offset "derrière le joueur" à chaud.
   * @param {{x?:number, y?:number, z?:number}} newOffset
   */
  function setOffset(newOffset) {
    if (typeof newOffset.x === 'number') offset.x = newOffset.x;
    if (typeof newOffset.y === 'number') offset.y = newOffset.y;
    if (typeof newOffset.z === 'number') offset.z = newOffset.z;
  }

  function destroy() {
    disable();
  }

  return Object.freeze({
    enable,
    disable,
    update,
    setOffset,
    snapToTarget,
    destroy,
    isEnabled: () => enabled,
  });
}