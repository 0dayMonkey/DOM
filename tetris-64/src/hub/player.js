/**
 * player.js — Personnage contrôlable dans le hub.
 *
 * Un "mascotte-cube" composé de :
 *   - un corps (cube rouge)
 *   - une tête (cube crème avec yeux)
 *   - des CHEVEUX (4 mèches animées physiquement)
 *   - une ombre plate au sol
 *
 * CONTRÔLES
 *   ← / → : rotation gauche / droite
 *   ↑ / ↓ : avancer / reculer selon le forward courant
 *
 * PHYSIQUE DES CHEVEUX
 *   Les cheveux simulent une inertie : quand le personnage accélère dans
 *   une direction, les mèches "traînent" dans la direction opposée. Cela
 *   se fait en calculant une vitesse lissée puis en l'appliquant comme
 *   offset sur les variables CSS --hair-lag-x / --hair-lag-z / --hair-sway
 *   lues par character.css.
 *
 *   - Translation : --hair-lag-x, --hair-lag-z en px, opposé à la vitesse
 *   - Rotation (sway) : basée sur la vitesse angulaire, force de swing
 *     quand on tourne rapidement
 *   - Bounce vertical : modulé par la phase de marche (--hair-bounce)
 *
 * Convention d'angle :
 *   forward_player(a) = (sin a, 0, cos a)
 *   angle = π → regarde vers -Z (fond de la salle, tableaux)
 */

import { ACTIONS } from '../core/constants.js';
import { el } from '../utils/helpers.js';

/**
 * @typedef {Object} HubPlayerOptions
 * @property {HTMLElement} host
 * @property {ReturnType<import('../input/actionMap.js').createActionMap>} actionMap
 * @property {ReturnType<import('../audio/soundManager.js').createSoundManager>} audio
 * @property {ReturnType<import('../fx/particles.js').createParticles>} particles
 * @property {{x:number, y:number, z:number}} [spawn]
 * @property {number} [initialAngle]
 * @property {import('./hubMap.js').HubBounds} [bounds]
 * @property {number} [speed=280]
 * @property {number} [turnSpeed=3.5]
 */

/**
 * @param {HubPlayerOptions} options
 */
export function createHubPlayer(options) {
  const host = options.host;
  const audio = options.audio;
  const particles = options.particles;
  const actionMap = options.actionMap;
  const speed = options.speed ?? 280;
  const turnSpeed = options.turnSpeed ?? 3.5;
  let bounds = options.bounds ?? null;

  /** Position au sol (y=0). */
  let x = options.spawn?.x ?? 0;
  let y = options.spawn?.y ?? 0;
  let z = options.spawn?.z ?? 400;

  /** Orientation en radians. angle = π → regarde vers -Z. */
  let angle = options.initialAngle ?? Math.PI;

  /** Animations de pas. */
  let walkAccum = 0;
  let bobPhase = 0;

  /** État des entrées (pressées ou non). */
  const input = { up: 0, down: 0, left: 0, right: 0 };
  /** @type {Array<() => void>} */
  const unsubs = [];

  // ---------------------------------------------------------------------
  // ÉTAT PHYSIQUE — cheveux
  // ---------------------------------------------------------------------

  /** Vitesse lissée (px/s) pour l'inertie des cheveux. */
  let hairVelX = 0;
  let hairVelZ = 0;
  /** Vitesse angulaire lissée (rad/s) pour le sway. */
  let hairAngVel = 0;
  /** Position précédente pour calculer la vitesse instantanée. */
  let prevX = x;
  let prevZ = z;
  let prevAngle = angle;

  // ---------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------

  const root = el('div', { class: 'hub-player' });
  const shadow = el('div', { class: 'hub-player__shadow' });
  const bodyWrap = el('div', { class: 'hub-player__body-wrap' });

  // Corps
  const body = el('div', { class: 'hub-player__body' });
  ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach((f) => {
    body.appendChild(el('div', { class: `hub-player__face hub-player__face--${f}` }));
  });

  // Tête
  const head = el('div', { class: 'hub-player__head' });
  ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach((f) => {
    head.appendChild(el('div', { class: `hub-player__face hub-player__face--${f}` }));
  });

  // Yeux
  const eyes = el('div', { class: 'hub-player__eyes' }, [
    el('div', { class: 'hub-player__eye hub-player__eye--left' }),
    el('div', { class: 'hub-player__eye hub-player__eye--right' }),
  ]);
  head.appendChild(eyes);

  // CHEVEUX — 4 mèches
  const hair = el('div', { class: 'hub-player__hair' });
  ['front', 'left', 'right', 'back'].forEach((side) => {
    const strand = el('div', { class: `hub-player__hair-strand hub-player__hair-strand--${side}` });
    strand.appendChild(el('div', { class: 'hub-player__hair-strand-inner' }));
    hair.appendChild(strand);
  });

  bodyWrap.appendChild(body);
  bodyWrap.appendChild(head);
  // Les cheveux sont solidaires du bodyWrap (tournent avec la tête/corps)
  bodyWrap.appendChild(hair);
  root.appendChild(shadow);
  root.appendChild(bodyWrap);
  host.appendChild(root);

  applyTransform();

  // ---------------------------------------------------------------------
  // INPUTS
  // ---------------------------------------------------------------------

  function bindInputAction(action, key) {
    unsubs.push(actionMap.on(action, (e) => {
      if (e.phase === 'up') input[key] = 0;
      else input[key] = 1;
    }));
  }

  bindInputAction(ACTIONS.MOVE_UP, 'up');
  bindInputAction(ACTIONS.MOVE_DOWN, 'down');
  bindInputAction(ACTIONS.MOVE_LEFT, 'right');
  bindInputAction(ACTIONS.MOVE_RIGHT, 'left');
  bindInputAction(ACTIONS.ROTATE_CW, 'up');
  bindInputAction(ACTIONS.SOFT_DROP, 'down');

  // ---------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------

  /**
   * @param {number} dtMs
   */
  function update(dtMs) {
    const dt = dtMs / 1000;

    const dx = input.right - input.left;
    const dz = input.down - input.up;
    const turnInput = dx;
    const forwardInput = dz;
    const moving = turnInput !== 0 || forwardInput !== 0;

    if (moving) {
      if (turnInput !== 0) {
        angle += turnInput * turnSpeed * dt;
        if (angle > Math.PI) angle -= Math.PI * 2;
        if (angle < -Math.PI) angle += Math.PI * 2;
      }

      if (forwardInput !== 0) {
        const fwdX = Math.sin(angle);
        const fwdZ = Math.cos(angle);
        x += fwdX * speed * forwardInput * dt;
        z += fwdZ * speed * forwardInput * dt;

        if (bounds) {
          if (x < bounds.minX) x = bounds.minX;
          if (x > bounds.maxX) x = bounds.maxX;
          if (z < bounds.minZ) z = bounds.minZ;
          if (z > bounds.maxZ) z = bounds.maxZ;
        }

        walkAccum += speed * dt;
        bobPhase += dt * 10;
        if (walkAccum > 180) {
          walkAccum = 0;
          audio.playSfx(audio.SFX.HUB_FOOTSTEP, {
            volume: 0.5,
            rate: 0.9 + Math.random() * 0.2,
          });
          particles.dust(x, -30, { count: 3 });
        }
      } else {
        bobPhase += dt * 6;
      }
    } else {
      bobPhase += dt * 3;
      walkAccum = 0;
    }

    updateHairPhysics(dt);
    applyTransform();
  }

  /**
   * Simule l'inertie des cheveux.
   *
   * Principe : on calcule la vitesse instantanée (Δposition / dt) à partir
   * de la position précédente, on la lisse exponentiellement pour éviter
   * les saccades, puis on la transforme en offset CSS "lag" sur les mèches.
   *
   * Pour que le lag soit dans le repère LOCAL du personnage (les cheveux
   * traînent derrière sa tête, pas dans l'absolu du monde), on projette
   * la vitesse mondiale (vx, vz) sur les axes forward/side du joueur.
   *
   * @param {number} dt - delta en secondes
   */
  function updateHairPhysics(dt) {
    if (dt <= 0) {
      hair.style.setProperty('--hair-lag-x', '0px');
      hair.style.setProperty('--hair-lag-z', '0px');
      hair.style.setProperty('--hair-sway', '0deg');
      hair.style.setProperty('--hair-bounce', '0px');
      return;
    }

    // 1) Vitesse instantanée dans le monde
    const worldVX = (x - prevX) / dt;
    const worldVZ = (z - prevZ) / dt;

    // 2) Projection dans le repère local du personnage
    //    forward = (sin a, 0, cos a)
    //    right   = (cos a, 0, -sin a)
    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);
    const localVForward = worldVX * fwdX + worldVZ * fwdZ;
    const localVSide = worldVX * rightX + worldVZ * rightZ;

    // 3) Vitesse angulaire (signée, chemin le plus court)
    let dAngle = angle - prevAngle;
    if (dAngle > Math.PI) dAngle -= Math.PI * 2;
    if (dAngle < -Math.PI) dAngle += Math.PI * 2;
    const instAngVel = dAngle / dt;

    // 4) Lissage exponentiel (spring-damper simplifié) — les cheveux
    //    rattrapent la vitesse instantanée avec une latence perceptible.
    const smooth = 1 - Math.exp(-dt * 7);
    hairVelX = hairVelX + (localVSide - hairVelX) * smooth;
    hairVelZ = hairVelZ + (localVForward - hairVelZ) * smooth;
    hairAngVel = hairAngVel + (instAngVel - hairAngVel) * smooth;

    // 5) Conversion en offsets CSS. Les cheveux traînent à l'OPPOSÉ de
    //    la vitesse (inertie). Clampé pour éviter des exagérations.
    const DIV = 28;
    const MAX_LAG = 24;
    let lagX = -hairVelX / DIV;
    let lagZ = -hairVelZ / DIV;
    if (lagX >  MAX_LAG) lagX =  MAX_LAG;
    if (lagX < -MAX_LAG) lagX = -MAX_LAG;
    if (lagZ >  MAX_LAG) lagZ =  MAX_LAG;
    if (lagZ < -MAX_LAG) lagZ = -MAX_LAG;

    let sway = -hairAngVel * 6;
    if (sway >  18) sway =  18;
    if (sway < -18) sway = -18;

    const bounce = (input.up + input.down + input.left + input.right) > 0
      ? Math.sin(bobPhase * 2) * 2.5
      : 0;

    hair.style.setProperty('--hair-lag-x', `${lagX.toFixed(2)}px`);
    hair.style.setProperty('--hair-lag-z', `${lagZ.toFixed(2)}px`);
    hair.style.setProperty('--hair-sway', `${sway.toFixed(2)}deg`);
    hair.style.setProperty('--hair-bounce', `${bounce.toFixed(2)}px`);

    prevX = x;
    prevZ = z;
    prevAngle = angle;
  }

  function applyTransform() {
    const isMoving =
      (input.up + input.down + input.left + input.right) > 0;
    root.classList.toggle('is-walking', isMoving);

    const bob = isMoving ? Math.sin(bobPhase) * 6 : 0;
    const sway = isMoving ? Math.sin(bobPhase * 0.5) * 3 : 0;
    const deg = (angle * 180) / Math.PI;

    root.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
    bodyWrap.style.transform =
      `translate3d(0px, ${bob}px, 0px) rotateY(${deg}deg) rotateZ(${sway}deg)`;
  }

  // ---------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------

  function getPosition() { return { x, y, z }; }
  function getAngle()    { return angle; }
  function setPosition(pos) {
    x = pos.x; y = pos.y; z = pos.z;
    prevX = x; prevZ = z; // reset pour éviter un flash de vitesse
    applyTransform();
  }
  function setBounds(b) { bounds = b; }

  function destroy() {
    unsubs.forEach((u) => u());
    unsubs.length = 0;
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return Object.freeze({
    update,
    getPosition,
    getAngle,
    setPosition,
    setBounds,
    destroy,
  });
}