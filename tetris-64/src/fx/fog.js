/**
 * fog.js — Brouillard périphérique N64 (overlay radial).
 *
 * Donne au jeu cette impression très typée "fog of doom" des jeux N64 :
 *   - un halo blanc qui bouffe les bords
 *   - une densité variable selon la scène (hub = léger, game over = dense)
 *   - un pulse subtil en danger (stack haute)
 *
 * On utilise un élément 2D fixé en overlay (`#fog`) et un `radial-gradient`
 * CSS piloté par des variables. Pas de canvas, pas de WebGL.
 *
 * Les réglages principaux sont :
 *   - density   : 0..1, contrôle l'opacité du halo
 *   - radius    : 30..80 (%), rayon où le fog commence à apparaître
 *   - color     : couleur du halo
 *   - pulse     : active/désactive une oscillation
 */

/**
 * @typedef {Object} FogOptions
 * @property {HTMLElement} host
 * @property {number} [density=0.25]
 * @property {number} [radius=55]
 * @property {string} [color='255, 255, 255']  - RGB sans l'alpha.
 */

/**
 * Crée un gestionnaire de fog.
 * @param {FogOptions} options
 */
export function createFog(options) {
    const host = options.host;
    host.classList.add('fog');
  
    let density = options.density ?? 0.25;
    let radius = options.radius ?? 55;
    let color = options.color ?? '255, 255, 255';
  
    // Pulse
    /** @type {null | { t: number, period: number, amplitude: number, baseDensity: number }} */
    let pulse = null;
  
    // Animation de transition entre deux densités
    /** @type {null | { from: number, to: number, t: number, dur: number }} */
    let fadeAnim = null;
  
    // ---------------------------------------------------------------------
    // RENDU
    // ---------------------------------------------------------------------
  
    function paint() {
      // Le gradient part de transparent au centre → color à density à la périphérie.
      const inner = Math.max(0, Math.min(100, radius));
      const effective = Math.max(0, Math.min(1, density));
      host.style.background = `radial-gradient(
        ellipse at center,
        rgba(${color}, 0) 0%,
        rgba(${color}, 0) ${inner}%,
        rgba(${color}, ${effective * 0.75}) ${Math.min(100, inner + 25)}%,
        rgba(${color}, ${effective}) 100%
      )`;
    }
  
    paint();
  
    // ---------------------------------------------------------------------
    // API
    // ---------------------------------------------------------------------
  
    /**
     * Change la densité instantanément.
     * @param {number} d - 0..1
     */
    function setDensity(d) {
      density = Math.max(0, Math.min(1, d));
      paint();
    }
  
    /**
     * Interpole la densité vers `target` sur `ms`.
     * @param {number} target
     * @param {number} ms
     */
    function fadeTo(target, ms = 600) {
      if (ms <= 0) return setDensity(target);
      fadeAnim = {
        from: density,
        to: Math.max(0, Math.min(1, target)),
        t: 0,
        dur: ms,
      };
    }
  
    /**
     * Change le rayon intérieur (pourcentage) où le fog commence à apparaître.
     * @param {number} r - 0..100
     */
    function setRadius(r) {
      radius = Math.max(0, Math.min(100, r));
      paint();
    }
  
    /**
     * Change la couleur (RGB string sans alpha : "255, 255, 255").
     * @param {string} rgb
     */
    function setColor(rgb) {
      color = rgb;
      paint();
    }
  
    /**
     * Active un pulse périodique d'amplitude ±amp autour de la densité courante.
     * @param {number} [periodMs=1400]
     * @param {number} [amplitude=0.1]
     */
    function startPulse(periodMs = 1400, amplitude = 0.1) {
      pulse = {
        t: 0,
        period: Math.max(100, periodMs),
        amplitude: Math.max(0, amplitude),
        baseDensity: density,
      };
    }
  
    /**
     * Arrête le pulse et restaure la densité de base.
     */
    function stopPulse() {
      if (pulse) {
        density = pulse.baseDensity;
        paint();
      }
      pulse = null;
    }
  
    /**
     * Presets nommés pour scènes typiques.
     * @param {'title'|'hub'|'game'|'gameover'|'danger'|'off'} name
     */
    function applyPreset(name) {
      switch (name) {
        case 'title':
          setRadius(45); fadeTo(0.30, 500); setColor('255, 255, 255'); stopPulse(); break;
        case 'hub':
          setRadius(40); fadeTo(0.22, 500); setColor('255, 248, 224'); stopPulse(); break;
        case 'game':
          setRadius(60); fadeTo(0.20, 400); setColor('255, 255, 255'); stopPulse(); break;
        case 'gameover':
          setRadius(30); fadeTo(0.55, 700); setColor('230, 0, 18'); stopPulse(); break;
        case 'danger':
          setRadius(45); fadeTo(0.30, 400); setColor('230, 0, 18'); startPulse(900, 0.12); break;
        case 'off':
          fadeTo(0, 400); stopPulse(); break;
        default:
          break;
      }
    }
  
    // ---------------------------------------------------------------------
    // BOUCLE
    // ---------------------------------------------------------------------
  
    /**
     * Mise à jour par frame.
     * @param {number} dtMs
     */
    function update(dtMs) {
      let dirty = false;
  
      if (fadeAnim) {
        fadeAnim.t += dtMs;
        const p = Math.min(1, fadeAnim.t / fadeAnim.dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        density = fadeAnim.from + (fadeAnim.to - fadeAnim.from) * e;
        if (pulse) pulse.baseDensity = density;
        if (p >= 1) fadeAnim = null;
        dirty = true;
      }
  
      if (pulse) {
        pulse.t += dtMs;
        const phase = (pulse.t / pulse.period) * Math.PI * 2;
        const effective = pulse.baseDensity + Math.sin(phase) * pulse.amplitude;
        density = Math.max(0, Math.min(1, effective));
        dirty = true;
      }
  
      if (dirty) paint();
    }
  
    /**
     * Reset complet.
     */
    function reset() {
      density = options.density ?? 0.25;
      radius = options.radius ?? 55;
      color = options.color ?? '255, 255, 255';
      pulse = null;
      fadeAnim = null;
      paint();
    }
  
    /**
     * Destruction : nettoie le style inline.
     */
    function destroy() {
      pulse = null;
      fadeAnim = null;
      host.style.background = '';
      host.classList.remove('fog');
    }
  
    return Object.freeze({
      setDensity,
      fadeTo,
      setRadius,
      setColor,
      startPulse,
      stopPulse,
      applyPreset,
      update,
      reset,
      destroy,
    });
  }