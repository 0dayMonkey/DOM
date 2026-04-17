/**
 * effects.js — Effets de caméra haut niveau (shake, tilt, punch, flash).
 *
 * Wrapper au-dessus de `camera.js` qui expose un vocabulaire sémantique :
 *
 *   - punch(intensity)        : léger rebond avant/arrière (hard drop, lock)
 *   - shake(intensity, durMs) : secousse (tetris, game over)
 *   - tilt(direction)          : inclinaison directionnelle (combo, danger)
 *   - resetTilt()              : retour à 0
 *   - flash(color, durMs)     : flash plein écran temporaire
 *
 * Les intensités sont nommées : 'soft' | 'medium' | 'hard' | 'extreme',
 * ce qui évite de répartir des magic numbers dans tout le code de jeu.
 *
 * Ce module manipule :
 *  - une instance de caméra (obligatoire) pour shake et offset
 *  - un overlay DOM optionnel pour le flash
 */

// Shake table : amplitude en px + durée en ms
const SHAKE_TABLE = Object.freeze({
    soft:    { amplitude: 3,  duration: 120 },
    medium:  { amplitude: 6,  duration: 200 },
    hard:    { amplitude: 12, duration: 320 },
    extreme: { amplitude: 22, duration: 500 },
  });
  
  // Punch : léger pulse en Z + rx, sur une animation très courte.
  const PUNCH_TABLE = Object.freeze({
    soft:    { z: 12, rx: 1, duration: 140 },
    medium:  { z: 22, rx: 2, duration: 180 },
    hard:    { z: 36, rx: 3, duration: 240 },
    extreme: { z: 60, rx: 5, duration: 320 },
  });
  
  // Tilt : inclinaison directionnelle (combo qui monte, par exemple)
  const TILT_TABLE = Object.freeze({
    none:  { rx: 0, ry: 0, rz: 0 },
    left:  { rx: 0, ry: 4,  rz: 0 },
    right: { rx: 0, ry: -4, rz: 0 },
    up:    { rx: -3, ry: 0, rz: 0 },
    down:  { rx: 3,  ry: 0, rz: 0 },
    combo1: { rx: -1, ry: 0,  rz: 0 },
    combo2: { rx: -2, ry: 1,  rz: 0 },
    combo3: { rx: -3, ry: -1, rz: 0 },
    danger: { rx: 2,  ry: 0,  rz: 2 },
  });
  
  /**
   * @typedef {'soft'|'medium'|'hard'|'extreme'} ShakeLevel
   * @typedef {'soft'|'medium'|'hard'|'extreme'} PunchLevel
   * @typedef {'none'|'left'|'right'|'up'|'down'|'combo1'|'combo2'|'combo3'|'danger'} TiltDirection
   */
  
  /**
   * @typedef {Object} EffectsOptions
   * @property {import('./camera.js').createCamera extends (...a:any)=>infer R ? R : never} camera
   *   (renvoie la valeur retournée par createCamera)
   * @property {HTMLElement} [flashHost] - Élément utilisé pour le flash (typiquement #transition-overlay).
   * @property {HTMLElement} [cameraHost] - Élément sur lequel appliquer les anims de punch (typiquement #world).
   */
  
  /**
   * Crée le gestionnaire d'effets.
   * @param {EffectsOptions} options
   */
  export function createEffects(options) {
    const { camera, flashHost, cameraHost } = options;
  
    /** Tilt courant (offset persistant appliqué à la caméra). */
    /** @type {{rx:number, ry:number, rz:number}} */
    let currentTilt = { rx: 0, ry: 0, rz: 0 };
  
    /** Anim de tilt en cours (pour interpoler vers cible). */
    /** @type {null | {from:{rx:number,ry:number,rz:number}, to:{rx:number,ry:number,rz:number}, t:number, dur:number}} */
    let tiltAnim = null;
  
    /** Anim de punch active (z/rx temporaires). */
    /** @type {null | {t:number, dur:number, z:number, rx:number}} */
    let punchAnim = null;
  
    /** Timer du flash courant (pour ne pas empiler). */
    /** @type {ReturnType<typeof setTimeout> | null} */
    let flashTimer = null;
  
    // ---------------------------------------------------------------------
    // SHAKE
    // ---------------------------------------------------------------------
  
    /**
     * Déclenche un shake.
     * @param {ShakeLevel} [level='medium']
     * @param {number} [durationOverride]
     */
    function shake(level = 'medium', durationOverride) {
      const cfg = SHAKE_TABLE[level] ?? SHAKE_TABLE.medium;
      const dur = durationOverride ?? cfg.duration;
      camera.applyShake(cfg.amplitude, dur);
    }
  
    // ---------------------------------------------------------------------
    // PUNCH
    // ---------------------------------------------------------------------
  
    /**
     * Déclenche un punch (z+rx temporaires, décroissance rapide).
     * @param {PunchLevel} [level='medium']
     */
    function punch(level = 'medium') {
      const cfg = PUNCH_TABLE[level] ?? PUNCH_TABLE.medium;
      punchAnim = {
        t: 0,
        dur: cfg.duration,
        z: cfg.z,
        rx: cfg.rx,
      };
    }
  
    // ---------------------------------------------------------------------
    // TILT
    // ---------------------------------------------------------------------
  
    /**
     * Incline la caméra vers une direction nommée.
     * @param {TiltDirection} direction
     * @param {number} [ms=400]
     */
    function tilt(direction, ms = 400) {
      const target = TILT_TABLE[direction] ?? TILT_TABLE.none;
      tiltAnim = {
        from: { ...currentTilt },
        to: { rx: target.rx, ry: target.ry, rz: target.rz },
        t: 0,
        dur: Math.max(0, ms),
      };
      if (tiltAnim.dur === 0) {
        currentTilt = { ...tiltAnim.to };
        tiltAnim = null;
        camera.setOffset(currentTilt);
      }
    }
  
    /**
     * Retour au tilt neutre.
     * @param {number} [ms=400]
     */
    function resetTilt(ms = 400) {
      tilt('none', ms);
    }
  
    /**
     * Tilt adaptatif au nombre de combo : 0 → none, 1-2 → combo1, 3-5 → combo2, 6+ → combo3.
     * @param {number} comboLength
     */
    function tiltForCombo(comboLength) {
      if (comboLength <= 0) return tilt('none', 350);
      if (comboLength <= 2) return tilt('combo1', 280);
      if (comboLength <= 5) return tilt('combo2', 280);
      return tilt('combo3', 280);
    }
  
    // ---------------------------------------------------------------------
    // FLASH
    // ---------------------------------------------------------------------
  
    /**
     * Flash plein écran temporaire.
     * @param {string} [color='rgba(255,255,255,0.55)']
     * @param {number} [durationMs=140]
     */
    function flash(color = 'rgba(255,255,255,0.55)', durationMs = 140) {
      if (!flashHost) return;
      if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
      }
      // Mise en place
      flashHost.style.transition = 'none';
      flashHost.style.background = color;
      flashHost.style.opacity = '1';
      flashHost.classList.add('is-active', 'flash-white');
      // Force un reflow pour relancer la transition sur opacity.
      // eslint-disable-next-line no-unused-expressions
      flashHost.offsetHeight;
      flashHost.style.transition = `opacity ${durationMs}ms ease-out`;
      flashHost.style.opacity = '0';
      flashTimer = setTimeout(() => {
        flashHost.classList.remove('is-active', 'flash-white');
        flashHost.style.transition = '';
        flashHost.style.background = '';
        flashHost.style.opacity = '';
        flashTimer = null;
      }, durationMs + 40);
    }
  
    // ---------------------------------------------------------------------
    // BOUCLE
    // ---------------------------------------------------------------------
  
    /**
     * Mise à jour par frame : interpole tilt, applique decay du punch.
     * @param {number} dtMs
     */
    function update(dtMs) {
      // Tilt
      if (tiltAnim) {
        tiltAnim.t += dtMs;
        const tProgress = Math.min(1, tiltAnim.t / tiltAnim.dur);
        const e = 1 - Math.pow(1 - tProgress, 3); // easeOutCubic
        currentTilt = {
          rx: tiltAnim.from.rx + (tiltAnim.to.rx - tiltAnim.from.rx) * e,
          ry: tiltAnim.from.ry + (tiltAnim.to.ry - tiltAnim.from.ry) * e,
          rz: tiltAnim.from.rz + (tiltAnim.to.rz - tiltAnim.from.rz) * e,
        };
        if (tProgress >= 1) {
          currentTilt = { ...tiltAnim.to };
          tiltAnim = null;
        }
      }
  
      // Punch : une sinusoïde pondérée qui revient à 0 en fin d'anim.
      let punchZ = 0;
      let punchRx = 0;
      if (punchAnim) {
        punchAnim.t += dtMs;
        const pT = Math.min(1, punchAnim.t / punchAnim.dur);
        // Pulse : sin(pi*t) → monte puis redescend à 0.
        const pulse = Math.sin(Math.PI * pT);
        punchZ = punchAnim.z * pulse;
        punchRx = punchAnim.rx * pulse;
        if (pT >= 1) punchAnim = null;
      }
  
      // Applique l'offset combiné tilt + punch
      camera.setOffset({
        x: 0,
        y: 0,
        z: punchZ,
        rx: currentTilt.rx + punchRx,
        ry: currentTilt.ry,
        rz: currentTilt.rz,
      });
    }
  
    // ---------------------------------------------------------------------
    // DESTROY
    // ---------------------------------------------------------------------
  
    function destroy() {
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = null;
      tiltAnim = null;
      punchAnim = null;
      camera.setOffset({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
    }
  
    return Object.freeze({
      shake,
      punch,
      tilt,
      resetTilt,
      tiltForCombo,
      flash,
      update,
      destroy,
    });
  }
  
  // Export des tables pour usages externes (UI debug, tests)
  export const _internal = Object.freeze({ SHAKE_TABLE, PUNCH_TABLE, TILT_TABLE });