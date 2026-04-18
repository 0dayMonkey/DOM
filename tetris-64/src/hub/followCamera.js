/**
 * followCamera.js — Caméra "tierce personne" qui suit le joueur dans le hub.
 *
 * LERPS SÉPARÉS (fix clé)
 *   Le player peut pivoter très vite (appuyer sur ArrowRight alors qu'on
 *   marchait vers le fond = ~90° de rotation quasi-instantanée côté input).
 *   Si on utilise le même facteur d'interpolation pour la position ET la
 *   rotation, on voit la caméra "glisser" sur le côté pendant que sa
 *   rotation rattrape. Pour éviter ça :
 *     - lerpPos   : lissage de la position (bas = plus fluide)
 *     - lerpRot   : lissage de l'angle (haut = caméra toujours dans le dos)
 *   Par défaut lerpRot = 0.35, très agressif, pour que la caméra colle à
 *   l'orientation du joueur.
 *
 * CONVENTIONS (vérifiées par test unitaire)
 *   forward_player(a) = (sin a, 0, cos a)
 *   ry_deg = 180 - angle_deg
 *   pos_cam = pos_player − forward_player × distance
 */

import { lerp, lerpAngle } from '../utils/math3d.js';

/**
 * @typedef {Object} FollowCameraOptions
 * @property {ReturnType<import('../camera/camera.js').createCamera>} camera
 * @property {{getPosition: () => {x:number,y:number,z:number}, getAngle?: () => number}} target
 * @property {{x:number, y:number, z:number}} [offset]
 * @property {number} [lerpPos=0.18]
 * @property {number} [lerpRot=0.35]
 * @property {number} [tiltDeg=-14]
 */

/**
 * @param {FollowCameraOptions} options
 */
export function createFollowCamera(options) {
  const camera = options.camera;
  const target = options.target;
  const offset = {
    x: options.offset?.x ?? 0,
    y: options.offset?.y ?? -240,
    z: options.offset?.z ?? 480,
  };
  let lerpPos = options.lerpPos ?? 0.18;
  let lerpRot = options.lerpRot ?? 0.35;
  let tiltDeg = options.tiltDeg ?? -14;

  let curX = 0, curY = offset.y, curZ = offset.z, curRy = 0;
  let tgtX = 0, tgtY = offset.y, tgtZ = offset.z, tgtRy = 0;
  let enabled = false;

  snapToTarget();

  function enable() {
    enabled = true;
    snapToTarget();
    apply();
  }

  function disable() {
    enabled = false;
  }

  /**
   * @param {number} _dtMs
   */
  function update(_dtMs) {
    if (!enabled) return;
    computeTarget();
    curX = lerp(curX, tgtX, lerpPos);
    curY = lerp(curY, tgtY, lerpPos);
    curZ = lerp(curZ, tgtZ, lerpPos);
    curRy = lerpAngle(curRy, tgtRy, lerpRot);
    apply();
  }

  function snapToTarget() {
    computeTarget();
    curX = tgtX; curY = tgtY; curZ = tgtZ; curRy = tgtRy;
  }

  function computeTarget() {
    const p = target.getPosition();
    const angle = target.getAngle ? target.getAngle() : 0;

    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);

    tgtX = p.x - fwdX * offset.z;
    tgtZ = p.z - fwdZ * offset.z;
    tgtY = p.y + offset.y;
    tgtRy = 180 - (angle * 180) / Math.PI;
  }

  function apply() {
    camera.set({
      x: curX,
      y: curY,
      z: curZ,
      rx: tiltDeg,
      ry: curRy,
      rz: 0,
    });
  }

  // ---------------------------------------------------------------------
  // TWEAKING — API exposée pour ajuster en live depuis la console
  // ---------------------------------------------------------------------

  /**
   * @param {{x?:number, y?:number, z?:number}} newOffset
   */
  function setOffset(newOffset) {
    if (typeof newOffset.x === 'number') offset.x = newOffset.x;
    if (typeof newOffset.y === 'number') offset.y = newOffset.y;
    if (typeof newOffset.z === 'number') offset.z = newOffset.z;
  }

  function getOffset() { return { ...offset }; }

  /**
   * Inclinaison verticale. Négatif = regard vers le bas.
   * @param {number} deg
   */
  function setTilt(deg) { tiltDeg = deg; }
  function getTilt() { return tiltDeg; }

  /**
   * @param {{pos?:number, rot?:number}} cfg
   */
  function setLerp(cfg) {
    if (typeof cfg.pos === 'number') lerpPos = cfg.pos;
    if (typeof cfg.rot === 'number') lerpRot = cfg.rot;
  }
  function getLerp() { return { pos: lerpPos, rot: lerpRot }; }

  function destroy() { disable(); }

  return Object.freeze({
    enable,
    disable,
    update,
    setOffset,
    getOffset,
    setTilt,
    getTilt,
    setLerp,
    getLerp,
    snapToTarget,
    destroy,
    isEnabled: () => enabled,
  });
}