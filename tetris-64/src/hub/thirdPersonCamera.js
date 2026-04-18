/**
 * thirdPersonCamera.js — Caméra troisième personne fixe (non contrôlable).
 *
 * Remplace l'ancien followCamera.js. Cette caméra :
 *   - se place à une distance et une hauteur fixes DERRIÈRE le joueur
 *   - suit automatiquement sa position quand il se déplace
 *   - pivote naturellement pour rester derrière lui quand il tourne
 *   - n'est PAS contrôlable (pas de souris, pas de joystick, pas d'orbite)
 *   - interpole en douceur (lerp) position et rotation pour éviter les à-coups
 *
 * API publique (stable, utilisée par hubScene.js) :
 *   enable() / disable()           — active / désactive le suivi
 *   update(dtMs)                    — à appeler chaque frame
 *   snapToTarget()                  — repositionne instantanément derrière le joueur
 *   setDistance(px) / setHeight(px) — ajuste la position de base
 *   setTilt(deg)                    — inclinaison X de la caméra
 *   setLerp({ pos, rot })           — vitesse d'interpolation (0..1)
 *   getStatus()                     — introspection (debug)
 *   destroy()                       — arrête tout
 *
 * ========================================================================
 *  CONVENTIONS MATHÉMATIQUES
 * ========================================================================
 *
 *   forward_player(angle) = (sin(angle), 0, cos(angle))
 *
 *   La caméra se place à l'opposé du forward :
 *     camPos = playerPos - forward_player(angle) * distance
 *             + (0, height, 0)
 *
 *   Rotation Y de la caméra : elle regarde vers le joueur, donc
 *     ry_deg = atan2(dx, -dz) * RAD_TO_DEG
 *     avec (dx, dz) = direction caméra → joueur.
 */

import { lerp, lerpAngle } from '../utils/math3d.js';

/**
 * @typedef {Object} ThirdPersonCameraOptions
 * @property {ReturnType<import('../camera/camera.js').createCamera>} camera
 * @property {{ getPosition: () => {x:number,y:number,z:number}, getAngle?: () => number }} target
 * @property {number} [distance=420]      - Distance caméra ↔ joueur (px).
 * @property {number} [height=-220]       - Offset Y (négatif = au-dessus).
 * @property {number} [tiltDeg=16]        - Inclinaison X de la caméra.
 * @property {number} [lerpPos=0.12]      - Smoothing position (0..1).
 * @property {number} [lerpRot=0.10]      - Smoothing rotation (0..1).
 */

/**
 * @param {ThirdPersonCameraOptions} options
 */
export function createThirdPersonCamera(options) {
  const camera = options.camera;
  const target = options.target;

  let distance = options.distance ?? 420;
  let height = options.height ?? -220;
  let tiltDeg = options.tiltDeg ?? 16;
  let lerpPos = options.lerpPos ?? 0.12;
  let lerpRot = options.lerpRot ?? 0.10;

  // État courant interpolé (ce qu'on envoie réellement à la caméra).
  let curX = 0, curY = height, curZ = 0, curRy = 0;

  let enabled = false;
  let firstFrame = true;

  // ---------------------------------------------------------------------
  // CALCULS
  // ---------------------------------------------------------------------

  /**
   * Position idéale de la caméra : strictement derrière le joueur,
   * à `distance` unités en arrière de son forward, avec offset vertical.
   */
  function computeIdealPosition() {
    const p = target.getPosition();
    const angle = target.getAngle ? target.getAngle() : 0;
    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);
    return {
      x: p.x - fwdX * distance,
      y: p.y + height,
      z: p.z - fwdZ * distance,
    };
  }

  /**
   * Rotation Y idéale : la caméra regarde vers le joueur.
   * Avec la convention du moteur, si le joueur est devant la caméra
   * (dans l'axe forward_player), la rotation Y de la caméra doit être
   * égale à l'angle du joueur en degrés.
   */
  function computeIdealRotation() {
    const angle = target.getAngle ? target.getAngle() : 0;
    return (angle * 180) / Math.PI;
  }

  /**
   * Applique la position + rotation courantes à la caméra moteur.
   */
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
  // API
  // ---------------------------------------------------------------------

  function enable() {
    enabled = true;
    firstFrame = true;
  }

  function disable() {
    enabled = false;
  }

  /**
   * Place la caméra instantanément à sa position idéale (pas de lerp).
   * Utilisé à l'entrée dans le hub pour éviter un "glissement" initial.
   */
  function snapToTarget() {
    const ideal = computeIdealPosition();
    curX = ideal.x;
    curY = ideal.y;
    curZ = ideal.z;
    curRy = computeIdealRotation();
    apply();
  }

  /**
   * Boucle de suivi : à appeler chaque frame.
   * @param {number} _dtMs — non utilisé pour l'instant (lerp en fraction fixe)
   */
  function update(_dtMs) {
    if (!enabled) return;

    // Premier frame après enable() : on se place pile derrière le joueur
    // pour éviter une anim "caméra rattrape le joueur depuis l'origine".
    if (firstFrame) {
      snapToTarget();
      firstFrame = false;
      return;
    }

    const ideal = computeIdealPosition();
    const idealRy = computeIdealRotation();

    curX = lerp(curX, ideal.x, lerpPos);
    curY = lerp(curY, ideal.y, lerpPos);
    curZ = lerp(curZ, ideal.z, lerpPos);
    curRy = lerpAngle(curRy, idealRy, lerpRot);

    apply();
  }

  // ---------------------------------------------------------------------
  // TWEAKING
  // ---------------------------------------------------------------------

  function setDistance(d) { distance = d; }
  function setHeight(h)   { height = h; }
  function setTilt(deg)   { tiltDeg = deg; }
  function setLerp(cfg = {}) {
    if (typeof cfg.pos === 'number') lerpPos = cfg.pos;
    if (typeof cfg.rot === 'number') lerpRot = cfg.rot;
  }

  function getStatus() {
    return {
      enabled,
      distance,
      height,
      tiltDeg,
      lerpPos,
      lerpRot,
      position: { x: Math.round(curX), y: Math.round(curY), z: Math.round(curZ) },
      ry: Math.round(curRy),
    };
  }

  function destroy() {
    disable();
  }

  return Object.freeze({
    enable,
    disable,
    update,
    snapToTarget,
    setDistance,
    setHeight,
    setTilt,
    setLerp,
    getStatus,
    destroy,
    isEnabled: () => enabled,
  });
}