/**
 * soundManager.js — Gestion SFX + musique (Web Audio API).
 *
 * Stratégie :
 *  - On charge les samples à la demande (lazy) pour ne pas bloquer le boot.
 *  - SFX : décodés une fois en AudioBuffer, joués via AudioBufferSourceNode.
 *  - Musique : jouée via <audio> HTML (loop, volume smooth) pour économiser
 *    la mémoire et permettre le streaming.
 *  - Trois bus de volume : master, sfx, music.
 *  - Auto-unlock : sur certains navigateurs, l'audio ne peut démarrer qu'après
 *    une interaction utilisateur. On écoute les premiers clics/touches pour
 *    resume l'AudioContext.
 *
 * Les identifiants de samples sont définis dans constants.js (SFX_IDS, MUSIC_IDS).
 * Ce manager accepte un mapping optionnel id → URL ; si aucune URL n'est fournie,
 * le son est simplement silencieux (no-op) pour permettre un dev sans assets.
 */

import {
    SFX_IDS,
    MUSIC_IDS,
    DEFAULT_VOLUMES,
    STORAGE_KEYS,
  } from '../core/constants.js';
  
  /**
   * @typedef {Object} SoundManifest
   * @property {Record<string, string>} [sfx]    - Map id → URL (fichiers courts).
   * @property {Record<string, string>} [music]  - Map id → URL (fichiers longs, streamés).
   */
  
  /**
   * @typedef {Object} SoundManagerOptions
   * @property {SoundManifest} [manifest]
   * @property {boolean} [persistSettings=true]
   */
  
  /**
   * Crée le sound manager.
   * @param {SoundManagerOptions} [options]
   */
  export function createSoundManager(options = {}) {
    const manifest = options.manifest ?? {};
    const persistSettings = options.persistSettings !== false;
  
    // ---------------------------------------------------------------------
    // ÉTAT
    // ---------------------------------------------------------------------
  
    /** @type {AudioContext | null} */
    let ctx = null;
    /** @type {GainNode | null} */
    let masterGain = null;
    /** @type {GainNode | null} */
    let sfxGain = null;
    /** @type {GainNode | null} */
    let musicGain = null; // pour futurs SFX de musique ; l'HTMLAudio gère son propre volume
  
    /** @type {Map<string, AudioBuffer | null>} id → buffer (null = pending) */
    const sfxBuffers = new Map();
    /** @type {Map<string, Promise<AudioBuffer>>} in-flight loads */
    const sfxLoading = new Map();
  
    /** @type {Map<string, HTMLAudioElement>} id → element */
    const musicElements = new Map();
    /** @type {string | null} */
    let currentMusic = null;
  
    let muted = false;
    let volumes = loadVolumes();
  
    // ---------------------------------------------------------------------
    // SETTINGS PERSISTÉS
    // ---------------------------------------------------------------------
  
    function loadVolumes() {
      const fallback = {
        master: DEFAULT_VOLUMES.MASTER,
        sfx: DEFAULT_VOLUMES.SFX,
        music: DEFAULT_VOLUMES.MUSIC,
        muted: false,
      };
      if (!persistSettings || typeof localStorage === 'undefined') return fallback;
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return {
          master: typeof parsed.master === 'number' ? parsed.master : fallback.master,
          sfx: typeof parsed.sfx === 'number' ? parsed.sfx : fallback.sfx,
          music: typeof parsed.music === 'number' ? parsed.music : fallback.music,
          muted: !!parsed.muted,
        };
      } catch (_) {
        return fallback;
      }
    }
  
    function saveVolumes() {
      if (!persistSettings || typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(
          STORAGE_KEYS.SETTINGS,
          JSON.stringify({
            master: volumes.master,
            sfx: volumes.sfx,
            music: volumes.music,
            muted,
          })
        );
      } catch (_) {
        /* ignore */
      }
    }
  
    muted = volumes.muted;
  
    // ---------------------------------------------------------------------
    // INIT / UNLOCK
    // ---------------------------------------------------------------------
  
    /**
     * Initialise l'AudioContext et les GainNodes si ce n'est pas déjà fait.
     * No-op si déjà initialisé.
     */
    function ensureContext() {
      if (ctx) return ctx;
      const AC = /** @type {typeof AudioContext} */ (
        window.AudioContext || (/** @type {any} */ (window)).webkitAudioContext
      );
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain = ctx.createGain();
      sfxGain.connect(masterGain);
      musicGain.connect(masterGain);
      masterGain.connect(ctx.destination);
      applyVolumes();
      return ctx;
    }
  
    /**
     * Certaines plateformes nécessitent un geste utilisateur avant que
     * l'AudioContext démarre. On s'abonne une fois et on nettoie après.
     */
    function setupAutoUnlock() {
      if (typeof window === 'undefined') return;
      const handler = () => {
        ensureContext();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        window.removeEventListener('pointerdown', handler);
        window.removeEventListener('keydown', handler);
        window.removeEventListener('touchstart', handler);
      };
      window.addEventListener('pointerdown', handler, { once: true });
      window.addEventListener('keydown', handler, { once: true });
      window.addEventListener('touchstart', handler, { once: true });
    }
  
    setupAutoUnlock();
  
    // ---------------------------------------------------------------------
    // VOLUMES
    // ---------------------------------------------------------------------
  
    function applyVolumes() {
      if (!ctx || !masterGain || !sfxGain || !musicGain) {
        // Applique au moins aux <audio> existants
        musicElements.forEach((el) => {
          el.volume = effectiveMusicVolume();
          el.muted = muted;
        });
        return;
      }
      const mMaster = muted ? 0 : volumes.master;
      masterGain.gain.setTargetAtTime(mMaster, ctx.currentTime, 0.02);
      sfxGain.gain.setTargetAtTime(volumes.sfx, ctx.currentTime, 0.02);
      musicGain.gain.setTargetAtTime(volumes.music, ctx.currentTime, 0.02);
      // L'audio HTML n'est pas routé via WebAudio, on applique manuellement
      musicElements.forEach((el) => {
        el.volume = effectiveMusicVolume();
        el.muted = muted;
      });
    }
  
    function effectiveMusicVolume() {
      return muted ? 0 : volumes.master * volumes.music;
    }
  
    /**
     * @param {{master?:number, sfx?:number, music?:number}} v
     */
    function setVolumes(v) {
      if (typeof v.master === 'number') volumes.master = clamp01(v.master);
      if (typeof v.sfx === 'number') volumes.sfx = clamp01(v.sfx);
      if (typeof v.music === 'number') volumes.music = clamp01(v.music);
      applyVolumes();
      saveVolumes();
    }
  
    function getVolumes() {
      return { ...volumes, muted };
    }
  
    /**
     * Coupe/rétablit le son.
     * @param {boolean} [value] - force une valeur ; par défaut toggle.
     */
    function setMuted(value) {
      muted = typeof value === 'boolean' ? value : !muted;
      applyVolumes();
      saveVolumes();
      return muted;
    }
  
    function isMuted() {
      return muted;
    }
  
    // ---------------------------------------------------------------------
    // SFX (WebAudio)
    // ---------------------------------------------------------------------
  
    /**
     * Préchage optionnel d'un ou plusieurs SFX.
     * @param {string[]} ids
     */
    function preload(ids) {
      ids.forEach((id) => {
        const url = manifest.sfx?.[id];
        if (!url) return;
        loadSfx(id, url).catch(() => {});
      });
    }
  
    /**
     * @param {string} id
     * @param {string} url
     * @returns {Promise<AudioBuffer>}
     */
    function loadSfx(id, url) {
      if (sfxBuffers.has(id)) {
        const buf = sfxBuffers.get(id);
        if (buf) return Promise.resolve(buf);
      }
      const inflight = sfxLoading.get(id);
      if (inflight) return inflight;
  
      const ac = ensureContext();
      if (!ac) return Promise.reject(new Error('no audio context'));
  
      const p = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((ab) => ac.decodeAudioData(ab))
        .then((buf) => {
          sfxBuffers.set(id, buf);
          sfxLoading.delete(id);
          return buf;
        })
        .catch((e) => {
          sfxLoading.delete(id);
          sfxBuffers.set(id, null);
          throw e;
        });
      sfxLoading.set(id, p);
      return p;
    }
  
    /**
     * Joue un SFX par ID. Silencieux si URL non fournie ou chargement en cours.
     *
     * @param {string} id
     * @param {{volume?:number, rate?:number, detune?:number}} [opts]
     */
    function playSfx(id, opts = {}) {
      if (muted) return;
      const url = manifest.sfx?.[id];
      if (!url) return;
      const ac = ensureContext();
      if (!ac || !sfxGain) return;
      if (ac.state === 'suspended') ac.resume().catch(() => {});
  
      const existing = sfxBuffers.get(id);
      if (existing) {
        triggerBuffer(existing, opts);
        return;
      }
      loadSfx(id, url).then((buf) => triggerBuffer(buf, opts)).catch(() => {});
    }
  
    /**
     * @param {AudioBuffer} buf
     * @param {{volume?:number, rate?:number, detune?:number}} opts
     */
    function triggerBuffer(buf, opts) {
      if (!ctx || !sfxGain) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (typeof opts.rate === 'number') src.playbackRate.value = opts.rate;
      if (typeof opts.detune === 'number' && src.detune) src.detune.value = opts.detune;
  
      const g = ctx.createGain();
      g.gain.value = typeof opts.volume === 'number' ? clamp01(opts.volume) : 1;
      src.connect(g).connect(sfxGain);
      src.start(0);
    }
  
    // ---------------------------------------------------------------------
    // MUSIC (HTMLAudio)
    // ---------------------------------------------------------------------
  
    /**
     * Récupère (ou crée) l'élément audio associé à une musique.
     * @param {string} id
     * @returns {HTMLAudioElement | null}
     */
    function getMusicElement(id) {
      if (musicElements.has(id)) return musicElements.get(id);
      const url = manifest.music?.[id];
      if (!url) return null;
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      el.volume = effectiveMusicVolume();
      el.muted = muted;
      musicElements.set(id, el);
      return el;
    }
  
    /**
     * Joue une musique (fade out de la précédente).
     *
     * @param {string} id
     * @param {{fadeInMs?:number, fadeOutMs?:number, restart?:boolean}} [opts]
     */
    function playMusic(id, opts = {}) {
      const fadeIn = opts.fadeInMs ?? 400;
      const fadeOut = opts.fadeOutMs ?? 400;
      const restart = opts.restart !== false;
  
      if (currentMusic === id) {
        const el = musicElements.get(id);
        if (el && restart) { el.currentTime = 0; }
        if (el) { el.play().catch(() => {}); }
        return;
      }
  
      // Fade out courant
      if (currentMusic) {
        const prev = musicElements.get(currentMusic);
        if (prev) fadeAudio(prev, prev.volume, 0, fadeOut, () => prev.pause());
      }
  
      // Démarre nouveau
      const el = getMusicElement(id);
      if (!el) {
        currentMusic = null;
        return;
      }
      currentMusic = id;
      const targetVol = effectiveMusicVolume();
      el.volume = 0;
      el.muted = muted;
      if (restart) el.currentTime = 0;
      el.play().catch(() => {});
      fadeAudio(el, 0, targetVol, fadeIn);
    }
  
    /**
     * Stoppe la musique courante avec fade.
     * @param {number} [fadeOutMs=500]
     */
    function stopMusic(fadeOutMs = 500) {
      if (!currentMusic) return;
      const el = musicElements.get(currentMusic);
      currentMusic = null;
      if (!el) return;
      fadeAudio(el, el.volume, 0, fadeOutMs, () => el.pause());
    }
  
    /**
     * @param {HTMLAudioElement} el
     * @param {number} from
     * @param {number} to
     * @param {number} ms
     * @param {() => void} [onDone]
     */
    function fadeAudio(el, from, to, ms, onDone) {
      if (ms <= 0) {
        el.volume = to;
        onDone && onDone();
        return;
      }
      const start = performance.now();
      const step = () => {
        const now = performance.now();
        const t = Math.min(1, (now - start) / ms);
        el.volume = from + (to - from) * t;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          el.volume = to;
          onDone && onDone();
        }
      };
      requestAnimationFrame(step);
    }
  
    function getCurrentMusic() {
      return currentMusic;
    }
  
    // ---------------------------------------------------------------------
    // DESTROY
    // ---------------------------------------------------------------------
  
    function destroy() {
      musicElements.forEach((el) => {
        el.pause();
        el.src = '';
      });
      musicElements.clear();
      sfxBuffers.clear();
      sfxLoading.clear();
      if (ctx) {
        ctx.close().catch(() => {});
      }
      ctx = null;
      masterGain = null;
      sfxGain = null;
      musicGain = null;
      currentMusic = null;
    }
  
    // ---------------------------------------------------------------------
    // UTILS
    // ---------------------------------------------------------------------
  
    function clamp01(v) {
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }
  
    return Object.freeze({
      // settings
      setVolumes,
      getVolumes,
      setMuted,
      isMuted,
      // sfx
      preload,
      playSfx,
      // music
      playMusic,
      stopMusic,
      getCurrentMusic,
      // lifecycle
      destroy,
      // exposed ids for convenience
      SFX: SFX_IDS,
      MUSIC: MUSIC_IDS,
    });
  }