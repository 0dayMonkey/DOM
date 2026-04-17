/**
 * skybox.js — Skybox (fond étoilé + horizon) en DOM pur.
 *
 * On n'utilise ni canvas ni WebGL : le ciel est un conteneur fixe avec :
 *  - un dégradé (déjà défini dans main.css sur .viewport)
 *  - une nappe d'étoiles générées en radial-gradients box-shadow
 *  - une silhouette lointaine (optionnelle) en pseudo-éléments CSS
 *
 * Le skybox suit la rotation de la caméra uniquement sur Y (pan horizontal),
 * jamais sur la translation : il doit rester "à l'infini". On réalise cela
 * en appliquant sur le host une contre-translation pour neutraliser
 * complètement la translation du world, et en ne gardant que la rotation.
 *
 * On écrit sur l'élément `host` (typiquement #skybox) une CSS variable
 * --sky-ry égale à la rotation Y courante de la caméra, et le CSS fait le
 * reste. Pour rester simple, on applique aussi directement un `transform`.
 */

/**
 * @typedef {Object} SkyboxOptions
 * @property {HTMLElement} host
 * @property {number} [starCount=140]   - Nombre d'étoiles synthétisées.
 * @property {number} [seed=1]          - Seed pour distribution reproductible.
 * @property {boolean} [showHorizon=true]
 */

/**
 * Crée un skybox.
 * @param {SkyboxOptions} options
 */
export function createSkybox(options) {
    const host = options.host;
    const starCount = options.starCount ?? 140;
    const seed = options.seed ?? 1;
    const showHorizon = options.showHorizon !== false;
  
    host.classList.add('skybox');
    host.innerHTML = '';
  
    // ---------------------------------------------------------------------
    // ÉTOILES
    // ---------------------------------------------------------------------
  
    const stars = document.createElement('div');
    stars.className = 'skybox__stars';
    stars.setAttribute('aria-hidden', 'true');
    host.appendChild(stars);
  
    // Génère un box-shadow composite : des dizaines de "pixels" étoiles.
    // Distribution pseudo-aléatoire déterministe à partir du seed.
    let rng = seed | 0 || 1;
    function rand() {
      // Mulberry32 compact
      rng = (rng + 0x6D2B79F5) >>> 0;
      let t = rng;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  
    const shadows = [];
    for (let i = 0; i < starCount; i++) {
      // Coordonnées en vw/vh (indépendant du container)
      const x = (rand() * 200 - 100).toFixed(2); // -100..+100 vw
      const y = (rand() * 200 - 100).toFixed(2);
      // Taille 1 ou 2 px (peu, gros = plus rare)
      const bright = rand();
      const color = bright > 0.92
        ? 'rgba(255, 245, 200, 1)'   // jaune pâle
        : bright > 0.7
          ? 'rgba(255, 255, 255, 0.95)'
          : 'rgba(255, 255, 255, 0.7)';
      shadows.push(`${x}vw ${y}vh 0 0 ${color}`);
    }
  
    // Un petit point en (0,0) sert de "pinceau" sur lequel box-shadow se propage.
    const starDot = document.createElement('div');
    starDot.className = 'skybox__star-dot';
    starDot.style.boxShadow = shadows.join(', ');
    stars.appendChild(starDot);
  
    // ---------------------------------------------------------------------
    // HORIZON (silhouette simple)
    // ---------------------------------------------------------------------
  
    /** @type {HTMLElement | null} */
    let horizon = null;
    if (showHorizon) {
      horizon = document.createElement('div');
      horizon.className = 'skybox__horizon';
      horizon.setAttribute('aria-hidden', 'true');
      host.appendChild(horizon);
    }
  
    // ---------------------------------------------------------------------
    // API
    // ---------------------------------------------------------------------
  
    /**
     * Met à jour la rotation Y apparente du skybox en fonction de la caméra.
     * On ne propage que la rotation Y (pan horizontal) pour l'immersion,
     * et on annule tout le reste pour que le ciel semble "à l'infini".
     *
     * @param {import('../utils/math3d.js').Transform3D} cameraTransform
     */
    function syncToCamera(cameraTransform) {
      const ry = cameraTransform.ry ?? 0;
      host.style.setProperty('--sky-ry', `${ry}deg`);
      // On applique aussi directement pour ne pas dépendre du CSS.
      host.style.transform = `rotateY(${ry}deg)`;
    }
  
    /**
     * Fondu d'entrée / sortie du ciel.
     * @param {number} opacity  - 0..1
     * @param {number} [ms=400]
     */
    function fade(opacity, ms = 400) {
      host.style.transition = `opacity ${ms}ms ease-out`;
      host.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    }
  
    /**
     * Remplace la palette du skybox via CSS vars locales (override les
     * tokens globaux pour ce host uniquement). Utile pour une scène spéciale.
     *
     * @param {{top?:string, mid?:string, bot?:string}} palette
     */
    function setPalette(palette) {
      if (palette.top) host.style.setProperty('--sky-top-local', palette.top);
      if (palette.mid) host.style.setProperty('--sky-mid-local', palette.mid);
      if (palette.bot) host.style.setProperty('--sky-bot-local', palette.bot);
    }
  
    /**
     * Réinitialise palette et opacité.
     */
    function reset() {
      host.style.removeProperty('--sky-top-local');
      host.style.removeProperty('--sky-mid-local');
      host.style.removeProperty('--sky-bot-local');
      host.style.opacity = '';
      host.style.transition = '';
    }
  
    /**
     * Détruit le skybox : nettoie le DOM.
     */
    function destroy() {
      host.innerHTML = '';
      host.style.transform = '';
      host.style.transition = '';
      host.style.opacity = '';
      host.classList.remove('skybox');
    }
  
    return Object.freeze({
      syncToCamera,
      fade,
      setPalette,
      reset,
      destroy,
    });
  }