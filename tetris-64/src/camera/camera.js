/**
 * camera.js — Caméra virtuelle pour le monde 3D CSS.
 *
 * La caméra n'est pas un vrai objet 3D : c'est une *transform* appliquée à
 * l'envers sur le conteneur #world. Si on veut que la caméra avance vers
 * +Z, on translate le world vers -Z. Même principe pour les rotations.
 *
 * La caméra expose :
 *   - set(preset) / setTransform(t) : positionnement instantané
 *   - moveTo(preset, ms, easing)     : interpolation animée
 *   - applyShake(amplitude, durMs)   : secousse temporaire additionnelle
 *   - setOffset(t)                    : offset manuel (tilt gameplay, etc.)
 *   - update(dt)                      : appelée chaque frame par la boucle
 *
 * La caméra met à jour des CSS variables sur un élément "host" (typiquement
 * #world). Le CSS qui lit `--cam-*` applique effectivement la transformation.
 *
 * Ce module est principalement stateful, mais ne dépend pas d'un framework :
 * il agit sur un HTMLElement fourni à la création.
 */

import {
    identityTransform,
    lerpTransform,
    composeTransforms,
    shakeOffset,
    toInverseCameraTransform,
    saturate,
  } from '../utils/math3d.js';
  import { CAMERA_PRESETS } from '../core/constants.js';
  
  /**
   * @typedef {import('../utils/math3d.js').Transform3D} Transform3D
   */
  
  /**
   * @typedef {Object} Easing
   * @property {(t:number)=>number} fn
   */
  
  const EASINGS = Object.freeze({
    linear: (t) => t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeIn: (t) => t * t * t,
    easeInOut: (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    sharp: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  });
  
  /**
   * @typedef {Object} CameraOptions
   * @property {HTMLElement} host          - Élément sur lequel on écrit --cam-*.
   * @property {Transform3D} [initial]     - Transform initiale (défaut identity).
   * @property {boolean} [useInverse=true] - Appliquer aussi la transform CSS inverse directement
   *                                          via `host.style.transform` (utile si le CSS ne le fait pas).
   */
  
  /**
   * Crée une caméra.
   * @param {CameraOptions} options
   */
  export function createCamera(options) {
    const host = options.host;
    const useInverse = options.useInverse !== false;
  
    /** @type {Transform3D} */
    let current = { ...identityTransform(), ...(options.initial || {}) };
  
    /** Offset persistant (tilt gameplay, etc.) additionné chaque frame. */
    /** @type {Transform3D} */
    let offset = identityTransform();
  
    /** Animation courante (si en cours). */
    /** @type {null | { from: Transform3D, to: Transform3D, t: number, dur: number, ease: (t:number)=>number, onDone?: ()=>void }} */
    let anim = null;
  
    /** Shake courant. */
    /** @type {null | { t: number, duration: number, amplitude: number, seed: number }} */
    let shake = null;
  
    // ---------------------------------------------------------------------
    // APPLICATION
    // ---------------------------------------------------------------------
  
    function writeCssVars() {
      // Compose : current + offset + shake (x, y)
      const composed = composeTransforms(current, offset);
  
      let shakeX = 0;
      let shakeY = 0;
      if (shake) {
        const s = shakeOffset({
          t: shake.t,
          duration: shake.duration,
          amplitude: shake.amplitude,
          seed: shake.seed,
        });
        shakeX = s.x;
        shakeY = s.y;
      }
  
      host.style.setProperty('--cam-x', `${composed.x ?? 0}px`);
      host.style.setProperty('--cam-y', `${composed.y ?? 0}px`);
      host.style.setProperty('--cam-z', `${composed.z ?? 0}px`);
      host.style.setProperty('--cam-rx', `${composed.rx ?? 0}deg`);
      host.style.setProperty('--cam-ry', `${composed.ry ?? 0}deg`);
      host.style.setProperty('--cam-rz', `${composed.rz ?? 0}deg`);
      host.style.setProperty('--shake-x', `${shakeX}px`);
      host.style.setProperty('--shake-y', `${shakeY}px`);
  
      if (useInverse) {
        // On applique directement la transform inverse sur l'host.
        // Cela permet au CSS de ne pas avoir à composer lui-même les vars.
        const inverse = toInverseCameraTransform({
          x: (composed.x ?? 0) + shakeX,
          y: (composed.y ?? 0) + shakeY,
          z: composed.z,
          rx: composed.rx,
          ry: composed.ry,
          rz: composed.rz,
        });
        host.style.transform = inverse;
      }
    }
  
    // ---------------------------------------------------------------------
    // API
    // ---------------------------------------------------------------------
  
    /**
     * Positionne la caméra instantanément sur un preset ou une transform.
     * @param {string | Transform3D} target
     */
    function set(target) {
      anim = null;
      current = resolveTarget(target);
      writeCssVars();
    }
  
    /**
     * Interpole la caméra vers un preset/transform sur une durée donnée.
     * @param {string | Transform3D} target
     * @param {number} ms
     * @param {'linear' | 'easeOut' | 'easeIn' | 'easeInOut' | 'sharp'} [easing='easeInOut']
     * @param {() => void} [onDone]
     */
    function moveTo(target, ms, easing = 'easeInOut', onDone) {
      const to = resolveTarget(target);
      if (ms <= 0) {
        current = to;
        writeCssVars();
        if (onDone) onDone();
        return;
      }
      anim = {
        from: { ...current },
        to,
        t: 0,
        dur: ms,
        ease: EASINGS[easing] ?? EASINGS.easeInOut,
        onDone,
      };
    }
  
    /**
     * Ajuste l'offset persistant (appelé typiquement par gameScene lors d'un tilt).
     * @param {Partial<Transform3D>} o
     */
    function setOffset(o) {
      offset = { ...identityTransform(), ...o };
    }
  
    /**
     * Ajoute un shake visuel de `amplitude` pixels pendant `duration` ms.
     * Un shake existant est remplacé s'il a une amplitude plus faible ;
     * sinon on garde celui en cours (évite de "réduire" une grosse secousse).
     *
     * @param {number} amplitude
     * @param {number} durationMs
     */
    function applyShake(amplitude, durationMs) {
      if (amplitude <= 0 || durationMs <= 0) return;
      if (shake && shake.amplitude >= amplitude) {
        // on rafraîchit la durée restante pour qu'elle couvre au moins la nouvelle
        shake.duration = Math.max(shake.duration - shake.t, durationMs);
        shake.t = 0;
        return;
      }
      shake = {
        t: 0,
        duration: durationMs,
        amplitude,
        seed: (shake?.seed ?? 0) + 1,
      };
    }
  
    /**
     * Résout un nom de preset ou une Transform3D directe.
     * @param {string | Transform3D} target
     * @returns {Transform3D}
     */
    function resolveTarget(target) {
      if (typeof target === 'string') {
        const preset = /** @type {Record<string, Transform3D>} */ (CAMERA_PRESETS)[target];
        if (!preset) {
          console.warn(`[camera] preset inconnu : ${target}`);
          return { ...current };
        }
        return { ...identityTransform(), ...preset };
      }
      return { ...identityTransform(), ...target };
    }
  
    /**
     * Boucle : à appeler chaque frame avec le dt en ms.
     * @param {number} dtMs
     */
    function update(dtMs) {
      if (anim) {
        anim.t += dtMs;
        const rawT = saturate(anim.t / anim.dur);
        const e = anim.ease(rawT);
        current = lerpTransform(anim.from, anim.to, e);
        if (rawT >= 1) {
          current = { ...anim.to };
          const done = anim.onDone;
          anim = null;
          if (done) done();
        }
      }
  
      if (shake) {
        shake.t += dtMs;
        if (shake.t >= shake.duration) {
          shake = null;
        }
      }
  
      writeCssVars();
    }
  
    /**
     * Renvoie une copie de la transform courante (utile debug).
     * @returns {Transform3D}
     */
    function getTransform() {
      return { ...current };
    }
  
    /** Annule toute anim et shake en cours, en gardant la transform courante. */
    function stop() {
      anim = null;
      shake = null;
    }
  
    // Initial write
    writeCssVars();
  
    return Object.freeze({
      set,
      moveTo,
      setOffset,
      applyShake,
      update,
      getTransform,
      stop,
    });
  }