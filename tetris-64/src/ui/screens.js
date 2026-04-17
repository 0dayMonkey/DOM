/**
 * screens.js — Écrans 2D (menus, pause, game over, settings).
 *
 * Un "screen" est une superposition DOM 2D, hors du world 3D. Il est monté
 * dans le conteneur #screens et se détruit proprement au close. Ce module
 * centralise la création de tous les écrans standard du jeu :
 *
 *   - mainMenu       : choix du mode (Marathon / Sprint / Zen)
 *   - pauseMenu      : pendant game
 *   - gameOverScreen : score + bouton rejouer
 *   - sprintResult   : temps final
 *   - highScores     : tableau de scores
 *   - settings       : audio sliders + toggles
 *
 * Chaque écran retourne un handle avec `close()` et un event bus local
 * pour relayer les choix (onSelect, onClose, etc.).
 *
 * Le module gère le focus clavier : chaque menu écoute les flèches +
 * Enter/Escape via actionMap (contexte "menu"). Quand un menu est à l'écran,
 * le contexte "menu" est pushé ; au close il est dépilé.
 */

import {
    ACTIONS,
    GAME_MODES,
  } from '../core/constants.js';
  import { el, clearChildren, formatNumber, formatTime, padScore, createEventBus } from '../utils/helpers.js';
  
  /**
   * @typedef {Object} ScreensDeps
   * @property {HTMLElement} host                - #screens
   * @property {ReturnType<import('../audio/soundManager.js').createSoundManager>} audio
   */
  
  /**
   * @typedef {Object} ScreenHandle
   * @property {() => void} close
   * @property {HTMLElement} el
   * @property {(event:string, handler:Function)=>()=>void} on
   */
  
  /**
   * @param {ScreensDeps} deps
   */
  export function createScreens(deps) {
    const host = deps.host;
    const audio = deps.audio;
    host.classList.add('screens');
  
    /** @type {Set<ScreenHandle>} */
    const openScreens = new Set();
  
    // -------------------------------------------------------------------
    // HELPERS INTERNES
    // -------------------------------------------------------------------
  
    /**
     * Crée le squelette d'un écran.
     * @param {string} variant - css modifier ex: 'menu', 'pause', 'gameover'
     * @param {HTMLElement | HTMLElement[]} content
     * @returns {HTMLElement}
     */
    function createShell(variant, content) {
      const shell = el('div', {
        class: `screen screen--${variant}`,
        role: 'dialog',
        'aria-modal': 'true',
      }, [
        el('div', { class: 'screen__backdrop' }),
        el('div', { class: 'screen__panel' }, Array.isArray(content) ? content : [content]),
      ]);
      return shell;
    }
  
    /**
     * Gère la navigation ↑/↓ dans une liste d'options avec actionMap.
     * @param {Object} cfg
     * @param {HTMLElement[]} cfg.items
     * @param {ReturnType<import('../input/actionMap.js').createActionMap>} cfg.actionMap
     * @param {(index:number)=>void} [cfg.onSelect]
     * @param {()=>void} [cfg.onBack]
     */
    function wireMenuNavigation(cfg) {
      let index = 0;
      const highlight = () => {
        cfg.items.forEach((it, i) => it.classList.toggle('is-focused', i === index));
        cfg.items[index]?.focus?.({ preventScroll: true });
      };
      highlight();
  
      const unsubs = [];
      unsubs.push(cfg.actionMap.on(ACTIONS.MOVE_UP, (e) => {
        if (e.phase === 'up') return;
        index = (index - 1 + cfg.items.length) % cfg.items.length;
        audio.playSfx(audio.SFX.MENU_MOVE);
        highlight();
      }));
      unsubs.push(cfg.actionMap.on(ACTIONS.MOVE_DOWN, (e) => {
        if (e.phase === 'up') return;
        index = (index + 1) % cfg.items.length;
        audio.playSfx(audio.SFX.MENU_MOVE);
        highlight();
      }));
      unsubs.push(cfg.actionMap.on(ACTIONS.INTERACT, (e) => {
        if (e.phase !== 'down') return;
        audio.playSfx(audio.SFX.MENU_SELECT);
        cfg.onSelect?.(index);
      }));
      unsubs.push(cfg.actionMap.on(ACTIONS.START, (e) => {
        if (e.phase !== 'down') return;
        audio.playSfx(audio.SFX.MENU_SELECT);
        cfg.onSelect?.(index);
      }));
      unsubs.push(cfg.actionMap.on(ACTIONS.BACK, (e) => {
        if (e.phase !== 'down') return;
        audio.playSfx(audio.SFX.MENU_MOVE);
        cfg.onBack?.();
      }));
      unsubs.push(cfg.actionMap.on(ACTIONS.PAUSE, (e) => {
        if (e.phase !== 'down') return;
        cfg.onBack?.();
      }));
      return () => unsubs.forEach((u) => u());
    }
  
    /**
     * Monte un écran et retourne son handle.
     * @param {HTMLElement} rootEl
     * @param {(bus: ReturnType<typeof createEventBus>) => () => void} setup
     * @returns {ScreenHandle}
     */
    function mountScreen(rootEl, setup) {
      const bus = createEventBus();
      host.appendChild(rootEl);
      // trigger entrée animation par classe
      requestAnimationFrame(() => rootEl.classList.add('is-visible'));
  
      const teardown = setup(bus);
  
      const handle = {
        el: rootEl,
        on: bus.on,
        close: () => {
          if (!openScreens.has(handle)) return;
          openScreens.delete(handle);
          try { teardown?.(); } catch (_) {}
          rootEl.classList.remove('is-visible');
          rootEl.classList.add('is-closing');
          setTimeout(() => {
            if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
            bus.clear();
          }, 320);
        },
      };
      openScreens.add(handle);
      return handle;
    }
  
    // -------------------------------------------------------------------
    // MAIN MENU
    // -------------------------------------------------------------------
  
    /**
     * @param {Object} cfg
     * @param {ReturnType<import('../input/actionMap.js').createActionMap>} cfg.actionMap
     * @param {string[]} [cfg.items]
     * @returns {ScreenHandle}
     */
    function openMainMenu(cfg) {
      const labels = cfg.items ?? ['MARATHON', 'SPRINT 40L', 'ZEN', 'SCORES', 'RÉGLAGES'];
      /** @type {HTMLElement[]} */
      const buttons = labels.map((text, i) => el('button', {
        class: 'menu-item',
        type: 'button',
        'data-index': i,
        tabindex: '0',
      }, text));
  
      const panel = createShell('menu', [
        el('h1', { class: 'screen__title' }, 'TETRIS 64'),
        el('div', { class: 'menu-list' }, buttons),
        el('div', { class: 'screen__hint' }, '↑↓ pour choisir — Entrée pour valider'),
      ]);
  
      return mountScreen(panel, (bus) => {
        buttons.forEach((b, i) => {
          b.addEventListener('click', () => bus.emit('select', { index: i, label: labels[i] }));
        });
        cfg.actionMap.pushContext('menu');
        const unsub = wireMenuNavigation({
          items: buttons,
          actionMap: cfg.actionMap,
          onSelect: (idx) => bus.emit('select', { index: idx, label: labels[idx] }),
          onBack: () => bus.emit('back'),
        });
        return () => {
          unsub();
          cfg.actionMap.popContext();
        };
      });
    }
  
    // -------------------------------------------------------------------
    // PAUSE MENU
    // -------------------------------------------------------------------
  
    /**
     * @param {Object} cfg
     * @param {ReturnType<import('../input/actionMap.js').createActionMap>} cfg.actionMap
     * @returns {ScreenHandle}
     */
    function openPauseMenu(cfg) {
      const labels = ['REPRENDRE', 'RECOMMENCER', 'QUITTER'];
      const buttons = labels.map((t, i) => el('button', {
        class: 'menu-item',
        type: 'button',
        'data-index': i,
      }, t));
  
      const panel = createShell('pause', [
        el('h2', { class: 'screen__title' }, 'PAUSE'),
        el('div', { class: 'menu-list' }, buttons),
      ]);
  
      return mountScreen(panel, (bus) => {
        buttons.forEach((b, i) => b.addEventListener('click', () => bus.emit('select', { index: i, label: labels[i] })));
        cfg.actionMap.pushContext('menu');
        const unsub = wireMenuNavigation({
          items: buttons,
          actionMap: cfg.actionMap,
          onSelect: (idx) => bus.emit('select', { index: idx, label: labels[idx] }),
          onBack: () => bus.emit('select', { index: 0, label: labels[0] }),
        });
        return () => {
          unsub();
          cfg.actionMap.popContext();
        };
      });
    }
  
    // -------------------------------------------------------------------
    // GAME OVER
    // -------------------------------------------------------------------
  
    /**
     * @param {Object} cfg
     * @param {ReturnType<import('../input/actionMap.js').createActionMap>} cfg.actionMap
     * @param {number} cfg.score
     * @param {number} cfg.level
     * @param {number} cfg.lines
     * @param {number} cfg.timeMs
     * @param {number} [cfg.rank]
     * @returns {ScreenHandle}
     */
    function openGameOver(cfg) {
      const labels = ['REJOUER', 'QUITTER'];
      const buttons = labels.map((t, i) => el('button', { class: 'menu-item', type: 'button' }, t));
  
      const body = el('div', { class: 'screen__stats' }, [
        statRow('SCORE', padScore(cfg.score, 8)),
        statRow('NIVEAU', String(cfg.level)),
        statRow('LIGNES', String(cfg.lines)),
        statRow('TEMPS', formatTime(cfg.timeMs)),
        cfg.rank && cfg.rank > 0
          ? el('div', { class: 'screen__rank' }, `NOUVEAU RECORD #${cfg.rank}`)
          : null,
      ].filter(Boolean));
  
      const panel = createShell('gameover', [
        el('h2', { class: 'screen__title' }, 'GAME OVER'),
        body,
        el('div', { class: 'menu-list menu-list--horizontal' }, buttons),
      ]);
  
      return mountScreen(panel, (bus) => {
        buttons.forEach((b, i) => b.addEventListener('click', () => bus.emit('select', { index: i, label: labels[i] })));
        cfg.actionMap.pushContext('menu');
        const unsub = wireMenuNavigation({
          items: buttons,
          actionMap: cfg.actionMap,
          onSelect: (idx) => bus.emit('select', { index: idx, label: labels[idx] }),
          onBack: () => bus.emit('select', { index: 1, label: labels[1] }),
        });
        return () => {
          unsub();
          cfg.actionMap.popContext();
        };
      });
    }
  
    // -------------------------------------------------------------------
    // SPRINT RESULT
    // -------------------------------------------------------------------
  
    /**
     * @param {Object} cfg
     * @param {ReturnType<import('../input/actionMap.js').createActionMap>} cfg.actionMap
     * @param {number} cfg.timeMs
     * @param {number} cfg.piecesPlaced
     * @param {boolean} cfg.newRecord
     * @param {number} [cfg.previousBestMs]
     * @returns {ScreenHandle}
     */
    function openSprintResult(cfg) {
      const labels = ['REJOUER', 'QUITTER'];
      const buttons = labels.map((t) => el('button', { class: 'menu-item', type: 'button' }, t));
  
      const body = el('div', { class: 'screen__stats' }, [
        statRow('TEMPS', formatTime(cfg.timeMs)),
        statRow('PIÈCES', String(cfg.piecesPlaced)),
        cfg.previousBestMs != null
          ? statRow('PRÉCÉDENT', formatTime(cfg.previousBestMs))
          : null,
        cfg.newRecord
          ? el('div', { class: 'screen__rank' }, 'NOUVEAU RECORD !')
          : null,
      ].filter(Boolean));
  
      const panel = createShell('sprint-result', [
        el('h2', { class: 'screen__title' }, '40 LIGNES'),
        body,
        el('div', { class: 'menu-list menu-list--horizontal' }, buttons),
      ]);
  
      return mountScreen(panel, (bus) => {
        buttons.forEach((b, i) => b.addEventListener('click', () => bus.emit('select', { index: i, label: labels[i] })));
        cfg.actionMap.pushContext('menu');
        const unsub = wireMenuNavigation({
          items: buttons,
          actionMap: cfg.actionMap,
          onSelect: (idx) => bus.emit('select', { index: idx, label: labels[idx] }),
          onBack: () => bus.emit('select', { index: 1, label: labels[1] }),
        });
        return () => { unsub(); cfg.actionMap.popContext(); };
      });
    }
  
    // -------------------------------------------------------------------
    // HIGH SCORES
    // -------------------------------------------------------------------
  
    /**
     * @param {Object} cfg
     * @param {ReturnType<import('../input/actionMap.js').createActionMap>} cfg.actionMap
     * @param {import('./storage.js').createStorage extends any ? ReturnType<typeof import('./storage.js').createStorage> : never} cfg.storage
     * @returns {ScreenHandle}
     */
    function openHighScores(cfg) {
      const marathon = cfg.storage.getHighScores(GAME_MODES.MARATHON);
      const sprint = cfg.storage.getBestSprint();
  
      const marathonRows = marathon.length > 0
        ? marathon.map((entry, i) => el('div', { class: 'score-row' }, [
            el('span', { class: 'score-row__rank' }, `#${i + 1}`),
            el('span', { class: 'score-row__score' }, formatNumber(entry.score)),
            el('span', { class: 'score-row__meta' }, `N.${entry.level} · ${entry.lines}L`),
          ]))
        : [el('div', { class: 'score-row score-row--empty' }, 'Aucun score enregistré')];
  
      const sprintBlock = sprint
        ? el('div', { class: 'score-row score-row--sprint' }, [
            el('span', { class: 'score-row__rank' }, '40L'),
            el('span', { class: 'score-row__score' }, formatTime(sprint.timeMs)),
            el('span', { class: 'score-row__meta' }, `${sprint.piecesPlaced} pièces`),
          ])
        : el('div', { class: 'score-row score-row--empty' }, 'Pas de record 40L');
  
      const backBtn = el('button', { class: 'menu-item', type: 'button' }, 'RETOUR');
  
      const panel = createShell('scores', [
        el('h2', { class: 'screen__title' }, 'MEILLEURS SCORES'),
        el('div', { class: 'score-section' }, [
          el('h3', { class: 'score-section__title' }, 'MARATHON'),
          ...marathonRows,
        ]),
        el('div', { class: 'score-section' }, [
          el('h3', { class: 'score-section__title' }, 'SPRINT 40L'),
          sprintBlock,
        ]),
        el('div', { class: 'menu-list' }, [backBtn]),
      ]);
  
      return mountScreen(panel, (bus) => {
        backBtn.addEventListener('click', () => bus.emit('back'));
        cfg.actionMap.pushContext('menu');
        const unsub = wireMenuNavigation({
          items: [backBtn],
          actionMap: cfg.actionMap,
          onSelect: () => bus.emit('back'),
          onBack: () => bus.emit('back'),
        });
        return () => { unsub(); cfg.actionMap.popContext(); };
      });
    }
  
    // -------------------------------------------------------------------
    // SETTINGS
    // -------------------------------------------------------------------
  
    /**
     * @param {Object} cfg
     * @param {ReturnType<import('../input/actionMap.js').createActionMap>} cfg.actionMap
     * @param {ReturnType<import('./storage.js').createStorage>} cfg.storage
     * @returns {ScreenHandle}
     */
    function openSettings(cfg) {
      const vols = audio.getVolumes();
      const prefs = cfg.storage.getPreferences();
  
      const master = slider('MASTER', vols.master, (v) => audio.setVolumes({ master: v }));
      const sfx = slider('SFX', vols.sfx, (v) => audio.setVolumes({ sfx: v }));
      const music = slider('MUSIQUE', vols.music, (v) => audio.setVolumes({ music: v }));
      const ghost = toggle('AFFICHER LE FANTÔME', prefs.ghostEnabled !== false, (v) => cfg.storage.setPreferences({ ghostEnabled: v }));
      const shake = toggle('SECOUSSE CAMÉRA', prefs.shakeEnabled !== false, (v) => cfg.storage.setPreferences({ shakeEnabled: v }));
  
      const backBtn = el('button', { class: 'menu-item', type: 'button' }, 'RETOUR');
  
      const panel = createShell('settings', [
        el('h2', { class: 'screen__title' }, 'RÉGLAGES'),
        el('div', { class: 'settings-list' }, [master, sfx, music, ghost, shake]),
        el('div', { class: 'menu-list' }, [backBtn]),
      ]);
  
      return mountScreen(panel, (bus) => {
        backBtn.addEventListener('click', () => bus.emit('back'));
        cfg.actionMap.pushContext('menu');
        const unsub = wireMenuNavigation({
          items: [backBtn],
          actionMap: cfg.actionMap,
          onSelect: () => bus.emit('back'),
          onBack: () => bus.emit('back'),
        });
        return () => { unsub(); cfg.actionMap.popContext(); };
      });
    }
  
    // -------------------------------------------------------------------
    // LIFECYCLE GLOBAL
    // -------------------------------------------------------------------
  
    function clearAll() {
      openScreens.forEach((h) => {
        try { h.close(); } catch (_) {}
      });
      openScreens.clear();
      clearChildren(host);
    }
  
    function getOpenCount() {
      return openScreens.size;
    }
  
    return Object.freeze({
      openMainMenu,
      openPauseMenu,
      openGameOver,
      openSprintResult,
      openHighScores,
      openSettings,
      clearAll,
      getOpenCount,
    });
  }
  
  // ---------------------------------------------------------------------
  // HELPERS VISUELS — rangées, sliders, toggles
  // ---------------------------------------------------------------------
  
  function statRow(label, value) {
    return el('div', { class: 'screen__stat-row' }, [
      el('span', { class: 'screen__stat-label' }, label),
      el('span', { class: 'screen__stat-value' }, value),
    ]);
  }
  
  /**
   * @param {string} label
   * @param {number} initial  0..1
   * @param {(v:number) => void} onInput
   */
  function slider(label, initial, onInput) {
    const input = el('input', {
      type: 'range', min: '0', max: '100',
      value: String(Math.round(initial * 100)),
      class: 'setting__slider',
    });
    const valueEl = el('span', { class: 'setting__value' }, `${Math.round(initial * 100)}%`);
    input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      valueEl.textContent = `${Math.round(v * 100)}%`;
      onInput(v);
    });
    return el('label', { class: 'setting setting--slider' }, [
      el('span', { class: 'setting__label' }, label),
      input,
      valueEl,
    ]);
  }
  
  /**
   * @param {string} label
   * @param {boolean} initial
   * @param {(v:boolean) => void} onChange
   */
  function toggle(label, initial, onChange) {
    const input = el('input', { type: 'checkbox', class: 'setting__toggle' });
    if (initial) input.setAttribute('checked', '');
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'setting setting--toggle' }, [
      el('span', { class: 'setting__label' }, label),
      input,
    ]);
  }