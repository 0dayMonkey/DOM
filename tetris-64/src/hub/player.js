/**
 * player.js — Personnage contrôlable dans le hub.
 *
 * Un petit "mascotte-cube" composé de plusieurs éléments DOM :
 *   - un corps (cube principal)
 *   - une tête (cube plus petit au-dessus, avec yeux)
 *   - une ombre plate au sol
 *
 * Contrôles :
 *   ← / → (hub) : tourner et avancer sur l'axe X
 *   ↑ / ↓ (hub) : avancer / reculer sur l'axe Z
 *
 * Le personnage a une vitesse, une direction (angle en radians), et une
 * physique minimale (pas de saut, pas de gravité — il est toujours au sol).
 *
 * Il émet une particule de poussière à intervalles réguliers quand il marche,
 * et joue le SFX footstep à chaque pas complet.
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
 * @property {import('./hubMap.js').HubBounds} [bounds]
 * @property {number} [speed=280]
 * @property {number} [turnSpeed=6]
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
  const turnSpeed = options.turnSpeed ?? 6;
  let bounds = options.bounds ?? null;

  /** Position au sol (y=0). */
  let x = options.spawn?.x ?? 0;
  let y = options.spawn?.y ?? 0;
  let z = options.spawn?.z ?? 400;

  /** Orientation en radians (0 = regarde vers -Z, le fond). */
  let angle = Math.PI; // regarde vers +Z par défaut (vers la caméra)

  /** Animation de pas : cumul distance parcourue. */
  let walkAccum = 0;
  let bobPhase = 0;

  /** État des entrées (pressées ou non). */
  const input = { up: 0, down: 0, left: 0, right: 0 };
  /** @type {Array<() => void>} */
  const unsubs = [];

  // ---------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------

  const root = el('div', { class: 'hub-player' });
  const shadow = el('div', { class: 'hub-player__shadow' });
  const bodyWrap = el('div', { class: 'hub-player__body-wrap' });
  const body = el('div', { class: 'hub-player__body' });
  // 6 faces du corps pour un vrai cube
  ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach((f) => {
    body.appendChild(el('div', { class: `hub-player__face hub-player__face--${f}` }));
  });
  const head = el('div', { class: 'hub-player__head' });
  ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach((f) => {
    head.appendChild(el('div', { class: `hub-player__face hub-player__face--${f}` }));
  });
  const eyes = el('div', { class: 'hub-player__eyes' }, [
    el('div', { class: 'hub-player__eye hub-player__eye--left' }),
    el('div', { class: 'hub-player__eye hub-player__eye--right' }),
  ]);
  head.appendChild(eyes);

  bodyWrap.appendChild(body);
  bodyWrap.appendChild(head);
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
  bindInputAction(ACTIONS.MOVE_LEFT, 'left');
  bindInputAction(ACTIONS.MOVE_RIGHT, 'right');

  // ---------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------

  /**
   * @param {number} dtMs
   */
  function update(dtMs) {
    const dt = dtMs / 1000;

    // Input direction : tank controls relaxés (orient = direction de marche)
    const dx = input.right - input.left;
    const dz = input.down - input.up;
    const moving = dx !== 0 || dz !== 0;

    if (moving) {
      const targetAngle = Math.atan2(dx, dz); // orient vers le vecteur désiré
      angle = lerpAngle(angle, targetAngle, Math.min(1, turnSpeed * dt));
      const len = Math.hypot(dx, dz) || 1;
      const nx = dx / len;
      const nz = dz / len;
      x += nx * speed * dt;
      z += nz * speed * dt;

      // Clamp aux bornes
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
        audio.playSfx(audio.SFX.HUB_FOOTSTEP, { volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
        // Petite poussière sous les pieds
        particles.dust(x, -30, { count: 3 });
      }
    } else {
      bobPhase += dt * 3;
      walkAccum = 0;
    }

    applyTransform();
  }

  function applyTransform() {
    const bob = Math.sin(bobPhase) * 4;
    const deg = (angle * 180) / Math.PI;
    root.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
    bodyWrap.style.transform = `translate3d(0px, ${bob}px, 0px) rotateY(${deg}deg)`;
  }

  // ---------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------

  function getPosition() {
    return { x, y, z };
  }

  /**
   * @returns {number} angle radians
   */
  function getAngle() {
    return angle;
  }

  /**
   * @param {{x:number, y:number, z:number}} pos
   */
  function setPosition(pos) {
    x = pos.x; y = pos.y; z = pos.z;
    applyTransform();
  }

  /**
   * @param {import('./hubMap.js').HubBounds} b
   */
  function setBounds(b) {
    bounds = b;
  }

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

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

/**
 * Interpolation d'angles : prend le chemin court.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}