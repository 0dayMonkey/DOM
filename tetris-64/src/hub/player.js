/**
 * player.js — Personnage contrôlable dans le hub.
 *
 * Un petit "mascotte-cube" composé de :
 *   - un corps (cube principal rouge)
 *   - une tête (cube crème avec yeux)
 *   - une ombre plate au sol
 *
 * CONTRÔLES
 *   ← / → : se déplacer gauche / droite (X)
 *   ↑ / ↓ : avancer / reculer (Z)
 *
 * IMPORTANT : dans le keymap par défaut (pensé pour le jeu Tetris), les
 * flèches ↑ et ↓ sont mappées à ACTIONS.ROTATE_CW et ACTIONS.SOFT_DROP.
 * Dans le hub, on veut qu'elles servent à MOVE_UP/MOVE_DOWN. Deux choix :
 *   1) Re-binder le keymap spécifiquement en contexte hub
 *   2) Écouter aussi ROTATE_CW et SOFT_DROP côté player du hub
 * On choisit (2) pour rester non-invasif sur le keymap global.
 *
 * Convention d'angle :
 *   - angle = 0 (pas de rotation) → le player "regarde" vers +Z
 *   - rotateY(180°) → regarde vers -Z (fond de la salle, mur arrière)
 *   - forward_player(a) = (sin a, 0, cos a)
 *
 * Le player spawn donc avec angle = π pour regarder vers le mur arrière
 * (où sont accrochés les tableaux) dès l'arrivée dans le hub.
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

  /** Orientation en radians.
   *  angle = π → rotateY(180) → regarde vers -Z (fond de la salle). */
  let angle = options.initialAngle ?? Math.PI;

  /** Animations de pas. */
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

  /**
   * Bind une action abstraite à une direction d'input.
   * @param {string} action
   * @param {'up'|'down'|'left'|'right'} key
   */
  function bindInputAction(action, key) {
    unsubs.push(actionMap.on(action, (e) => {
      if (e.phase === 'up') input[key] = 0;
      else input[key] = 1;
    }));
  }

  // Bindings explicites (WASD-style si re-mappé)
  bindInputAction(ACTIONS.MOVE_UP,    'up');
  bindInputAction(ACTIONS.MOVE_DOWN,  'down');
  bindInputAction(ACTIONS.MOVE_LEFT,  'right');
  bindInputAction(ACTIONS.MOVE_RIGHT, 'left');

  // Fallback pour les flèches ↑/↓ qui, dans le keymap par défaut, sont
  // mappées à ROTATE_CW et SOFT_DROP (pour le jeu Tetris). Dans le hub,
  // on les interprète comme MOVE_UP / MOVE_DOWN.
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

    // Direction désirée dans le plan XZ
    //   dx > 0 = vers +X (droite)
    //   dz > 0 = vers +Z (avant de la salle)
    //   dz < 0 = vers -Z (fond / mur des tableaux)
    const dx = input.right - input.left;
    const dz = input.down - input.up;  // ArrowDown → +Z, ArrowUp → -Z
    const turnInput = dx;       // -1 gauche, +1 droite
    const forwardInput = -dz;   // +1 avance (↑), -1 recule (↓)
    const moving = turnInput !== 0 || forwardInput !== 0;


    if (moving) {
      // 1) ROTATION : ← → tournent le joueur de ±turnSpeed rad/s
      //    indépendamment de la caméra, plus de feedback loop
      if (turnInput !== 0) {
        angle += turnInput * turnSpeed * dt;
        // normalise pour éviter l'accumulation infinie
        if (angle > Math.PI) angle -= Math.PI * 2;
        if (angle < -Math.PI) angle += Math.PI * 2;
      }
    
      // 2) TRANSLATION : on avance dans le forward actuel du joueur
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
        // Tourne sur place : toujours un peu d'anim de marche
        bobPhase += dt * 6;
      }
    } else {
      bobPhase += dt * 3;
      walkAccum = 0;
    }

    applyTransform();
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

  function getPosition() {
    return { x, y, z };
  }

  /**
   * @returns {number} angle en radians
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