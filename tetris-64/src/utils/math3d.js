/**
 * math3d.js — Utilitaires mathématiques 3D pour le rendu CSS-transform.
 *
 * Le projet n'utilise PAS WebGL : toute la 3D est simulée par transform:
 * translate3d/rotate/scale sur des éléments DOM. Ces helpers servent à
 * composer les chaînes de transforms de manière cohérente, à gérer les
 * conversions degrés/radians, et à éviter d'avoir des string templates
 * éparpillés dans tout le code.
 *
 * Conventions :
 *  - Unités : pixels pour translations, degrés pour rotations (CSS-friendly).
 *  - Axe Y : positif vers le BAS (convention CSS), comme pour la grille.
 *  - Axe Z : positif vers le spectateur (convention CSS perspective).
 *
 * Module pur : aucune dépendance au DOM, aucun effet de bord.
 */

// ============================================================================
// CONSTANTES
// ============================================================================

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

// ============================================================================
// CONVERSIONS
// ============================================================================

/**
 * @param {number} deg
 * @returns {number}
 */
export function degToRad(deg) {
    return deg * DEG_TO_RAD;
  }
  
  /**
   * @param {number} rad
   * @returns {number}
   */
  export function radToDeg(rad) {
    return rad * RAD_TO_DEG;
  }
  
  /**
   * Normalise un angle en degrés dans [0, 360[.
   * @param {number} deg
   * @returns {number}
   */
  export function normalizeDeg(deg) {
    const v = deg % 360;
    return v < 0 ? v + 360 : v;
  }
  
  /**
   * Retourne le plus court écart angulaire (en degrés) entre deux angles.
   * Pratique pour interpoler une rotation sans faire le "tour long".
   * @param {number} fromDeg
   * @param {number} toDeg
   * @returns {number}
   */
  export function shortestDeltaDeg(fromDeg, toDeg) {
    let d = (toDeg - fromDeg) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }
  
  // ============================================================================
  // MATH UTILS
  // ============================================================================
  
  /**
   * Clamp sur un intervalle.
   * @param {number} v
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  export function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }
  
  /**
   * Interpolation linéaire scalaire.
   * @param {number} a
   * @param {number} b
   * @param {number} t
   * @returns {number}
   */
  export function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  /**
   * Interpolation angulaire : prend le chemin court.
   * @param {number} a
   * @param {number} b
   * @param {number} t
   * @returns {number}
   */
  export function lerpAngle(a, b, t) {
    return a + shortestDeltaDeg(a, b) * t;
  }
  
  /**
   * Saturation : clamp 0..1.
   * @param {number} t
   * @returns {number}
   */
  export function saturate(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  
  // ============================================================================
  // VECTEURS 3D (tuples [x, y, z])
  // ============================================================================
  
  /**
   * @typedef {[number, number, number]} Vec3
   */
  
  /**
   * Crée un Vec3.
   * @param {number} [x=0]
   * @param {number} [y=0]
   * @param {number} [z=0]
   * @returns {Vec3}
   */
  export function vec3(x = 0, y = 0, z = 0) {
    return [x, y, z];
  }
  
  /**
   * Addition de deux Vec3.
   * @param {Vec3} a
   * @param {Vec3} b
   * @returns {Vec3}
   */
  export function vec3Add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  
  /**
   * Soustraction a - b.
   * @param {Vec3} a
   * @param {Vec3} b
   * @returns {Vec3}
   */
  export function vec3Sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  
  /**
   * Multiplication par un scalaire.
   * @param {Vec3} v
   * @param {number} s
   * @returns {Vec3}
   */
  export function vec3Scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }
  
  /**
   * Distance euclidienne.
   * @param {Vec3} a
   * @param {Vec3} b
   * @returns {number}
   */
  export function vec3Distance(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  /**
   * Interpolation linéaire entre deux Vec3.
   * @param {Vec3} a
   * @param {Vec3} b
   * @param {number} t
   * @returns {Vec3}
   */
  export function vec3Lerp(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }
  
  // ============================================================================
  // TRANSFORMS CSS
  // ============================================================================
  
  /**
   * @typedef {Object} Transform3D
   * @property {number} [x=0]
   * @property {number} [y=0]
   * @property {number} [z=0]
   * @property {number} [rx=0]   Rotation X en degrés
   * @property {number} [ry=0]   Rotation Y en degrés
   * @property {number} [rz=0]   Rotation Z en degrés
   * @property {number} [sx=1]   Scale X
   * @property {number} [sy=1]   Scale Y
   * @property {number} [sz=1]   Scale Z
   */
  
  /**
   * Construit une string CSS `transform` à partir d'un Transform3D.
   * Ordre : translate → rotate Z → rotate Y → rotate X → scale.
   * Cet ordre fonctionne bien pour positionner des objets puis les orienter.
   *
   * @param {Transform3D} t
   * @returns {string}
   */
  export function toCssTransform(t = {}) {
    const x = t.x ?? 0;
    const y = t.y ?? 0;
    const z = t.z ?? 0;
    const rx = t.rx ?? 0;
    const ry = t.ry ?? 0;
    const rz = t.rz ?? 0;
    const sx = t.sx ?? 1;
    const sy = t.sy ?? 1;
    const sz = t.sz ?? 1;
  
    const parts = [];
    if (x !== 0 || y !== 0 || z !== 0) {
      parts.push(`translate3d(${x}px, ${y}px, ${z}px)`);
    }
    if (rz !== 0) parts.push(`rotateZ(${rz}deg)`);
    if (ry !== 0) parts.push(`rotateY(${ry}deg)`);
    if (rx !== 0) parts.push(`rotateX(${rx}deg)`);
    if (sx !== 1 || sy !== 1 || sz !== 1) {
      parts.push(`scale3d(${sx}, ${sy}, ${sz})`);
    }
    return parts.length > 0 ? parts.join(' ') : 'translate3d(0,0,0)';
  }
  
  /**
   * Construit la transform INVERSE pour simuler une caméra.
   * Si la "caméra" est à (x, y, z) avec rotations (rx, ry, rz), alors le
   * "world" doit être translaté/rotationné en sens opposé.
   *
   * Ordre inverse : rotate X (-) → rotate Y (-) → rotate Z (-) → translate (-).
   *
   * @param {Transform3D} cam
   * @returns {string}
   */
  export function toInverseCameraTransform(cam = {}) {
    const x = cam.x ?? 0;
    const y = cam.y ?? 0;
    const z = cam.z ?? 0;
    const rx = cam.rx ?? 0;
    const ry = cam.ry ?? 0;
    const rz = cam.rz ?? 0;
  
    const parts = [];
    if (rx !== 0) parts.push(`rotateX(${-rx}deg)`);
    if (ry !== 0) parts.push(`rotateY(${-ry}deg)`);
    if (rz !== 0) parts.push(`rotateZ(${-rz}deg)`);
    if (x !== 0 || y !== 0 || z !== 0) {
      parts.push(`translate3d(${-x}px, ${-y}px, ${-z}px)`);
    }
    return parts.length > 0 ? parts.join(' ') : 'translate3d(0,0,0)';
  }
  
  /**
   * Compose deux Transform3D : `b` appliqué après `a` (approximation par somme).
   * Pour les besoins CSS-transform du projet, on n'a pas besoin de vraie
   * multiplication matricielle : on additionne les composantes. Suffisant
   * pour combiner shake + preset + offsets manuels.
   *
   * @param {Transform3D} a
   * @param {Transform3D} b
   * @returns {Transform3D}
   */
  export function composeTransforms(a, b) {
    return {
      x: (a.x ?? 0) + (b.x ?? 0),
      y: (a.y ?? 0) + (b.y ?? 0),
      z: (a.z ?? 0) + (b.z ?? 0),
      rx: (a.rx ?? 0) + (b.rx ?? 0),
      ry: (a.ry ?? 0) + (b.ry ?? 0),
      rz: (a.rz ?? 0) + (b.rz ?? 0),
      sx: (a.sx ?? 1) * (b.sx ?? 1),
      sy: (a.sy ?? 1) * (b.sy ?? 1),
      sz: (a.sz ?? 1) * (b.sz ?? 1),
    };
  }
  
  /**
   * Interpolation entre deux Transform3D.
   * Les angles utilisent le chemin court ; les scales interpolent linéairement.
   *
   * @param {Transform3D} a
   * @param {Transform3D} b
   * @param {number} t - 0..1
   * @returns {Transform3D}
   */
  export function lerpTransform(a, b, t) {
    return {
      x: lerp(a.x ?? 0, b.x ?? 0, t),
      y: lerp(a.y ?? 0, b.y ?? 0, t),
      z: lerp(a.z ?? 0, b.z ?? 0, t),
      rx: lerpAngle(a.rx ?? 0, b.rx ?? 0, t),
      ry: lerpAngle(a.ry ?? 0, b.ry ?? 0, t),
      rz: lerpAngle(a.rz ?? 0, b.rz ?? 0, t),
      sx: lerp(a.sx ?? 1, b.sx ?? 1, t),
      sy: lerp(a.sy ?? 1, b.sy ?? 1, t),
      sz: lerp(a.sz ?? 1, b.sz ?? 1, t),
    };
  }
  
  /**
   * Renvoie un Transform3D identité.
   * @returns {Transform3D}
   */
  export function identityTransform() {
    return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  }
  
  // ============================================================================
  // BRUIT / ALÉATOIRE UTILITAIRE (shake / wobble)
  // ============================================================================
  
  /**
   * Bruit pseudo-aléatoire déterministe basé sur un entier.
   * Utile pour des shakes reproductibles.
   * @param {number} n
   * @returns {number} dans [-1, 1]
   */
  export function noise1(n) {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    const f = s - Math.floor(s);
    return f * 2 - 1;
  }
  
  /**
   * Génère un offset de shake décroissant dans le temps.
   *
   * @param {Object} params
   * @param {number} params.t          - Temps écoulé (ms) depuis le début du shake.
   * @param {number} params.duration   - Durée totale (ms).
   * @param {number} params.amplitude  - Amplitude max en px.
   * @param {number} [params.seed=0]   - Seed pour différencier plusieurs shakes.
   * @returns {{x: number, y: number}}
   */
  export function shakeOffset({ t, duration, amplitude, seed = 0 }) {
    if (t >= duration || duration <= 0) return { x: 0, y: 0 };
    const progress = t / duration;
    const decay = 1 - progress * progress; // attenuation quadratique
    const n = t * 0.06 + seed * 100;
    return {
      x: noise1(n) * amplitude * decay,
      y: noise1(n + 37) * amplitude * decay,
    };
  }
  
  // ============================================================================
  // GRILLE → 3D (utilitaires partagés par le rendu)
  // ============================================================================
  
  /**
   * Convertit des coordonnées de cellule (col, row) + taille de cube en
   * translation 3D (x, y, z). z = 0 par défaut.
   *
   * @param {number} col
   * @param {number} row
   * @param {number} cubeSize
   * @returns {Vec3}
   */
  export function cellToXYZ(col, row, cubeSize) {
    return [col * cubeSize, row * cubeSize, 0];
  }