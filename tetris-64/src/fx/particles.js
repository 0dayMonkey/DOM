/**
 * particles.js — Système de particules DOM (zéro canvas).
 *
 * Chaque particule est un élément DOM absolu animé via transform + opacity,
 * avec un pool réutilisable pour éviter la création/destruction constante.
 *
 * Types de particules fournis :
 *   - burst      : explosion radiale (lock, hard drop)
 *   - sparkle    : étincelles dorées (combo, tetris, perfect clear)
 *   - confetti   : confettis colorés (victoire)
 *   - dust       : poussière au sol (footstep hub)
 *   - shard      : éclats colorés (line clear)
 *
 * Le module limite le nombre total de particules simultanées à MAX_PARTICLES
 * (défini dans constants.js) pour préserver les performances.
 */

import { MAX_PARTICLES } from '../core/constants.js';

/**
 * @typedef {Object} Particle
 * @property {HTMLElement} el
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} gravity
 * @property {number} drag
 * @property {number} life          - durée totale (ms)
 * @property {number} age           - âge courant (ms)
 * @property {number} rotation      - deg courant
 * @property {number} rotationSpeed - deg/s
 * @property {number} scaleStart
 * @property {number} scaleEnd
 * @property {number} fadeStart     - opacity au début
 * @property {number} fadeEnd       - opacity en fin
 * @property {boolean} active
 */

/**
 * @typedef {Object} ParticleEmitConfig
 * @property {number} x               - position d'origine (px, relatif au host)
 * @property {number} y
 * @property {number} [count=12]
 * @property {number} [speedMin=100]
 * @property {number} [speedMax=300]
 * @property {number} [angleMin=0]    - radians
 * @property {number} [angleMax=6.283]
 * @property {number} [gravity=0]     - px/s²
 * @property {number} [drag=0.9]      - coefficient de décélération (0..1)
 * @property {number} [lifeMin=400]
 * @property {number} [lifeMax=900]
 * @property {number} [size=6]        - px
 * @property {string[]} [colors=['#FFF']]
 * @property {number} [rotationMin=-180]
 * @property {number} [rotationMax=180]
 * @property {number} [scaleStart=1]
 * @property {number} [scaleEnd=0]
 * @property {number} [fadeStart=1]
 * @property {number} [fadeEnd=0]
 * @property {'square' | 'circle' | 'bar' | 'star'} [shape='square']
 * @property {string} [className]     - classe CSS additionnelle
 */

/**
 * @typedef {Object} ParticlesOptions
 * @property {HTMLElement} host - conteneur DOM (ex: #fx-layer)
 * @property {number} [max=MAX_PARTICLES]
 */

/**
 * Crée le système de particules.
 * @param {ParticlesOptions} options
 */
export function createParticles(options) {
    const host = options.host;
    const max = options.max ?? MAX_PARTICLES;
  
    host.classList.add('particles-host');
  
    /** @type {Particle[]} */
    const pool = [];
    /** @type {Particle[]} */
    const active = [];
  
    // ---------------------------------------------------------------------
    // POOL
    // ---------------------------------------------------------------------
  
    function createParticle() {
      const el = document.createElement('div');
      el.className = 'particle';
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.pointerEvents = 'none';
      el.style.willChange = 'transform, opacity';
      el.style.display = 'none';
      host.appendChild(el);
      return /** @type {Particle} */ ({
        el,
        x: 0, y: 0, vx: 0, vy: 0,
        gravity: 0, drag: 1,
        life: 0, age: 0,
        rotation: 0, rotationSpeed: 0,
        scaleStart: 1, scaleEnd: 0,
        fadeStart: 1, fadeEnd: 0,
        active: false,
      });
    }
  
    /** @returns {Particle | null} */
    function getFromPool() {
      if (active.length >= max) return null;
      const recycled = pool.pop();
      if (recycled) return recycled;
      return createParticle();
    }
  
    /** @param {Particle} p */
    function recycle(p) {
      p.active = false;
      p.el.style.display = 'none';
      p.el.style.opacity = '0';
      p.el.style.background = '';
      p.el.className = 'particle';
      pool.push(p);
    }
  
    // ---------------------------------------------------------------------
    // EMIT
    // ---------------------------------------------------------------------
  
    /**
     * Émet un groupe de particules selon la config.
     * @param {ParticleEmitConfig} cfg
     */
    function emit(cfg) {
      const count = cfg.count ?? 12;
      const speedMin = cfg.speedMin ?? 100;
      const speedMax = cfg.speedMax ?? 300;
      const angleMin = cfg.angleMin ?? 0;
      const angleMax = cfg.angleMax ?? Math.PI * 2;
      const gravity = cfg.gravity ?? 0;
      const drag = cfg.drag ?? 0.92;
      const lifeMin = cfg.lifeMin ?? 400;
      const lifeMax = cfg.lifeMax ?? 900;
      const size = cfg.size ?? 6;
      const colors = cfg.colors ?? ['#FFFFFF'];
      const rotMin = cfg.rotationMin ?? -180;
      const rotMax = cfg.rotationMax ?? 180;
      const scaleStart = cfg.scaleStart ?? 1;
      const scaleEnd = cfg.scaleEnd ?? 0;
      const fadeStart = cfg.fadeStart ?? 1;
      const fadeEnd = cfg.fadeEnd ?? 0;
      const shape = cfg.shape ?? 'square';
      const extraClass = cfg.className;
  
      for (let i = 0; i < count; i++) {
        const p = getFromPool();
        if (!p) return; // saturation
  
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        const angle = angleMin + Math.random() * (angleMax - angleMin);
        const life = lifeMin + Math.random() * (lifeMax - lifeMin);
        const color = colors[(Math.random() * colors.length) | 0];
  
        p.x = cfg.x;
        p.y = cfg.y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.gravity = gravity;
        p.drag = drag;
        p.life = life;
        p.age = 0;
        p.rotation = rotMin + Math.random() * (rotMax - rotMin);
        p.rotationSpeed = (Math.random() * 720 - 360);
        p.scaleStart = scaleStart;
        p.scaleEnd = scaleEnd;
        p.fadeStart = fadeStart;
        p.fadeEnd = fadeEnd;
        p.active = true;
  
        // Applique l'apparence selon la shape
        const el = p.el;
        el.className = 'particle particle--' + shape + (extraClass ? ' ' + extraClass : '');
        el.style.width = `${size}px`;
        el.style.height = shape === 'bar' ? `${size * 0.4}px` : `${size}px`;
        el.style.background = color;
        el.style.borderRadius = shape === 'circle' ? '50%' : '2px';
        el.style.display = 'block';
        el.style.opacity = String(fadeStart);
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rotation}deg) scale(${scaleStart})`;
  
        active.push(p);
      }
    }
  
    // ---------------------------------------------------------------------
    // PRESETS SÉMANTIQUES
    // ---------------------------------------------------------------------
  
    /**
     * Explosion radiale (lock, hard drop).
     * @param {number} x
     * @param {number} y
     * @param {Partial<ParticleEmitConfig>} [over]
     */
    function burst(x, y, over) {
      emit({
        x, y,
        count: 10,
        speedMin: 120, speedMax: 260,
        gravity: 400,
        lifeMin: 320, lifeMax: 500,
        size: 5,
        colors: ['#FFF8E0', '#F0C040', '#FFFFFF'],
        shape: 'square',
        ...over,
      });
    }
  
    /**
     * Étincelles dorées (combo, tetris).
     * @param {number} x
     * @param {number} y
     * @param {Partial<ParticleEmitConfig>} [over]
     */
    function sparkle(x, y, over) {
      emit({
        x, y,
        count: 14,
        speedMin: 60, speedMax: 200,
        gravity: 80,
        lifeMin: 500, lifeMax: 900,
        size: 4,
        colors: ['#FFE67A', '#F0C040', '#FFF8E0', '#FFFFFF'],
        shape: 'star',
        className: 'particle--sparkle',
        ...over,
      });
    }
  
    /**
     * Confettis colorés (perfect clear, victoire).
     * @param {number} x
     * @param {number} y
     * @param {Partial<ParticleEmitConfig>} [over]
     */
    function confetti(x, y, over) {
      emit({
        x, y,
        count: 30,
        speedMin: 200, speedMax: 450,
        angleMin: -Math.PI * 0.75,
        angleMax: -Math.PI * 0.25,
        gravity: 700,
        drag: 0.96,
        lifeMin: 900, lifeMax: 1500,
        size: 8,
        colors: [
          '#E60012', '#0066CC', '#FFCC00', '#2DB92D',
          '#B048E0', '#FF8800', '#00E5E5',
        ],
        shape: 'bar',
        ...over,
      });
    }
  
    /**
     * Poussière au sol (footstep hub).
     * @param {number} x
     * @param {number} y
     * @param {Partial<ParticleEmitConfig>} [over]
     */
    function dust(x, y, over) {
      emit({
        x, y,
        count: 4,
        speedMin: 40, speedMax: 100,
        angleMin: -Math.PI,
        angleMax: 0,
        gravity: -50,
        drag: 0.85,
        lifeMin: 400, lifeMax: 700,
        size: 10,
        colors: ['rgba(200,180,140,0.55)', 'rgba(220,200,160,0.4)'],
        shape: 'circle',
        scaleStart: 0.8,
        scaleEnd: 1.8,
        fadeStart: 0.8,
        fadeEnd: 0,
        ...over,
      });
    }
  
    /**
     * Éclats d'une ligne effacée.
     * @param {number} x
     * @param {number} y
     * @param {string} color
     * @param {Partial<ParticleEmitConfig>} [over]
     */
    function shard(x, y, color, over) {
      emit({
        x, y,
        count: 6,
        speedMin: 150, speedMax: 350,
        gravity: 600,
        lifeMin: 500, lifeMax: 900,
        size: 7,
        colors: [color, '#FFFFFF'],
        shape: 'square',
        ...over,
      });
    }
  
    // ---------------------------------------------------------------------
    // BOUCLE
    // ---------------------------------------------------------------------
  
    /**
     * Met à jour les particules actives.
     * @param {number} dtMs
     */
    function update(dtMs) {
      if (active.length === 0) return;
      const dt = dtMs / 1000;
      for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i];
        p.age += dtMs;
        const t = Math.min(1, p.age / p.life);
  
        if (p.age >= p.life) {
          recycle(p);
          active.splice(i, 1);
          continue;
        }
  
        // Physique
        p.vy += p.gravity * dt;
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy *= Math.pow(p.drag, dt * 60);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotationSpeed * dt;
  
        // Interpolation visuelle
        const scale = p.scaleStart + (p.scaleEnd - p.scaleStart) * t;
        const opacity = p.fadeStart + (p.fadeEnd - p.fadeStart) * t;
        p.el.style.opacity = String(Math.max(0, opacity));
        p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rotation}deg) scale(${scale})`;
      }
    }
  
    /**
     * Recycle toutes les particules actives immédiatement.
     */
    function clear() {
      for (let i = active.length - 1; i >= 0; i--) {
        recycle(active[i]);
      }
      active.length = 0;
    }
  
    /**
     * Nettoie le DOM et détruit le pool.
     */
    function destroy() {
      clear();
      for (const p of pool) {
        if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
      }
      pool.length = 0;
      host.classList.remove('particles-host');
    }
  
    function getActiveCount() {
      return active.length;
    }
  
    return Object.freeze({
      emit,
      burst,
      sparkle,
      confetti,
      dust,
      shard,
      update,
      clear,
      destroy,
      getActiveCount,
    });
  }