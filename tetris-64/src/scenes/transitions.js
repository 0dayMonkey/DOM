/**
 * transitions.js — Transitions plein écran entre scènes.
 *
 * Fournit quatre transitions au-dessus de #transition-overlay :
 *  - fade   : fondu noir classique (passe-partout)
 *  - iris   : cercle qui se ferme puis s'ouvre (style N64/Mario)
 *  - flash  : flash blanc bref (enchaînements toniques, pas un vrai fondu)
 *  - tetris : SIGNATURE — l'écran se recouvre de tétrominos qui tombent
 *             comme une partie de Tetris, puis s'effacent ligne par ligne
 *             avec des flashs blancs (line clear) pour révéler la nouvelle
 *             scène. Deux phases bien distinctes :
 *
 *                OUT (recouvrement ~700ms) :
 *                  Les lignes apparaissent du HAUT vers le BAS, chaque
 *                  ligne peuplée de blocs colorés (7 couleurs tétrominos)
 *                  qui "tombent" avec un léger rebond + rotation.
 *
 *                IN (effacement ~650ms) :
 *                  Les lignes disparaissent du BAS vers le HAUT façon
 *                  line clear : flash blanc, puis shrink verticale, puis
 *                  disparition. Révèle la nouvelle scène dessous.
 *
 *             L'overlay reste "plein" entre les deux phases, ce qui masque
 *             parfaitement la destruction/reconstruction du DOM côté scène.
 *
 * Chaque transition expose deux phases :
 *  - `out(kind)` : avant destruction de la scène courante (retourne Promise)
 *  - `in(kind)`  : après mount de la nouvelle scène, s'efface
 *
 * L'overlay passe de pointer-events:none à auto pendant l'animation pour
 * bloquer les clics qui passeraient au travers.
 */

/**
 * @typedef {'fade' | 'iris' | 'flash' | 'tetris'} TransitionKind
 */

/**
 * @typedef {Object} TransitionsOptions
 * @property {HTMLElement} host
 * @property {number} [fadeMs=500]
 * @property {number} [irisMs=700]
 * @property {number} [flashMs=180]
 * @property {number} [tetrisOutMs=700]
 * @property {number} [tetrisInMs=650]
 * @property {number} [tetrisCellPx=64]   - Taille logique d'un bloc (px)
 */

// Couleurs des 7 tétrominos — synchronisées avec tokens.css.
// Note : on utilise des valeurs en dur ici plutôt que des CSS vars car
// on les échantillonne aléatoirement côté JS, et lire --piece-* via
// getComputedStyle à chaque création de bloc serait coûteux.
const TETROMINO_COLORS = [
  '#00E5E5', // I
  '#FFD500', // O
  '#B048E0', // T
  '#2DCC2D', // S
  '#E60012', // Z
  '#0066CC', // J
  '#FF8800', // L
];

/**
 * @param {TransitionsOptions} options
 */
export function createTransitions(options) {
  const host = options.host;
  const fadeMs = options.fadeMs ?? 500;
  const irisMs = options.irisMs ?? 700;
  const flashMs = options.flashMs ?? 180;
  const tetrisOutMs = options.tetrisOutMs ?? 700;
  const tetrisInMs = options.tetrisInMs ?? 650;
  const tetrisCellPx = options.tetrisCellPx ?? 64;

  host.classList.add('transition-overlay');

  // Conteneur persistant pour la grille Tetris. Créé lazy à la première
  // utilisation, réutilisé et vidé entre deux transitions.
  /** @type {HTMLElement | null} */
  let tetrisGrid = null;

  function reset() {
    // CRITIQUE : on doit d'abord faire disparaître l'overlay (opacity:0)
    // AVANT de retirer les styles inline, sinon le retour à la règle CSS
    // par défaut (.transition-overlay { background: noir; transition: opacity 600ms })
    // déclenche un fade noir visible de 600ms.
    //
    // Ordre sécurisé :
    //   1. Force transition:none + opacity:0 + background:transparent
    //      → l'overlay devient instantanément invisible
    //   2. Force un reflow pour commiter ces valeurs
    //   3. Efface tout le reste
    host.style.transition = 'none';
    host.style.opacity = '0';
    host.style.background = 'transparent';
    host.style.pointerEvents = 'none';
    // eslint-disable-next-line no-unused-expressions
    host.offsetHeight; // reflow : commit des valeurs avant tout changement de classe/cssText
  
    host.className = 'transition-overlay';
    // On ne fait PAS cssText = '' : on nettoie les styles un par un pour
    // garder le contrôle et éviter que la règle CSS par défaut reprenne
    // la main avec sa transition.
    host.style.cssText =
      'transition: none; opacity: 0; background: transparent; pointer-events: none;';
  
    clearTetrisGrid();
  }

  function clearTetrisGrid() {
    if (tetrisGrid && tetrisGrid.parentNode) {
      tetrisGrid.parentNode.removeChild(tetrisGrid);
    }
    tetrisGrid = null;
  }

  /**
   * @param {TransitionKind} [kind='fade']
   * @returns {Promise<void>}
   */
  async function out(kind = 'fade') {
    host.classList.add('is-active');
    host.style.pointerEvents = 'auto';

    if (kind === 'flash') return runFlash();
    if (kind === 'iris') return runIrisClose();
    if (kind === 'tetris') return runTetrisOut();
    return runFadeOut();
  }

  /**
   * @param {TransitionKind} [kind='fade']
   * @returns {Promise<void>}
   */
  async function in_(kind = 'fade') {
    if (kind === 'flash') {
      reset();
      return;
    }
    if (kind === 'iris') return runIrisOpen();
    if (kind === 'tetris') return runTetrisIn();
    return runFadeIn();
  }

  // ---------------------------------------------------------------------
  // FADE
  // ---------------------------------------------------------------------

  function runFadeOut() {
    return new Promise((resolve) => {
      host.style.transition = `opacity ${fadeMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
      host.style.background = 'var(--outline-dark, #1A1A2E)';
      host.style.opacity = '0';
      // eslint-disable-next-line no-unused-expressions
      host.offsetHeight;
      host.style.opacity = '1';
      setTimeout(() => resolve(), fadeMs + 20);
    });
  }

  function runFadeIn() {
    return new Promise((resolve) => {
      host.style.transition = `opacity ${fadeMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
      host.style.opacity = '0';
      setTimeout(() => {
        reset();
        resolve();
      }, fadeMs + 20);
    });
  }

  // ---------------------------------------------------------------------
  // IRIS
  // ---------------------------------------------------------------------

  function runIrisClose() {
    return new Promise((resolve) => {
      host.classList.add('iris');
      host.style.background = 'var(--outline-dark, #1A1A2E)';
      host.style.opacity = '1';
      host.style.clipPath = 'circle(100% at 50% 50%)';
      host.style.transition = `clip-path ${irisMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
      // eslint-disable-next-line no-unused-expressions
      host.offsetHeight;
      host.style.clipPath = 'circle(0% at 50% 50%)';
      setTimeout(() => resolve(), irisMs + 20);
    });
  }

  function runIrisOpen() {
    return new Promise((resolve) => {
      host.classList.add('iris');
      host.style.background = 'var(--outline-dark, #1A1A2E)';
      host.style.opacity = '1';
      host.style.clipPath = 'circle(0% at 50% 50%)';
      host.style.transition = `clip-path ${irisMs}ms var(--ease-sharp, cubic-bezier(.7,0,.3,1))`;
      // eslint-disable-next-line no-unused-expressions
      host.offsetHeight;
      host.style.clipPath = 'circle(100% at 50% 50%)';
      setTimeout(() => {
        reset();
        resolve();
      }, irisMs + 20);
    });
  }

  // ---------------------------------------------------------------------
  // FLASH
  // ---------------------------------------------------------------------

  function runFlash() {
    return new Promise((resolve) => {
      host.style.transition = 'none';
      host.style.background = '#FFFFFF';
      host.style.opacity = '1';
      host.classList.add('flash-white');
      // eslint-disable-next-line no-unused-expressions
      host.offsetHeight;
      host.style.transition = `opacity ${flashMs}ms ease-out`;
      host.style.opacity = '0';
      setTimeout(() => {
        reset();
        resolve();
      }, flashMs + 20);
    });
  }

  // ---------------------------------------------------------------------
  // TETRIS — signature visuelle du jeu
  // ---------------------------------------------------------------------

  /**
   * Construit la grille de blocs qui va recouvrir l'écran. Retourne une
   * matrice [row][col] d'éléments DOM ainsi que les dimensions utilisées.
   */
  function buildTetrisGrid() {
    clearTetrisGrid();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // On calcule un nombre de colonnes/lignes qui couvre toujours l'écran.
    // On ajoute +1 pour éviter la moindre bande vide sur les bords.
    const cols = Math.ceil(vw / tetrisCellPx) + 1;
    const rows = Math.ceil(vh / tetrisCellPx) + 1;
    // On recentre la grille : si le nombre de colonnes ne tombe pas pile,
    // on décale légèrement pour que le centre reste centré.
    const offsetX = Math.floor((cols * tetrisCellPx - vw) / -2);

    const grid = document.createElement('div');
    grid.className = 'tetris-transition__grid';
    grid.style.left = `${offsetX}px`;
    grid.style.gridTemplateColumns = `repeat(${cols}, ${tetrisCellPx}px)`;
    grid.style.gridAutoRows = `${tetrisCellPx}px`;

    /** @type {HTMLElement[][]} */
    const cellMatrix = [];
    for (let y = 0; y < rows; y++) {
      const rowArr = [];
      for (let x = 0; x < cols; x++) {
        const cell = document.createElement('div');
        cell.className = 'tetris-transition__cell';
        // Couleur aléatoire parmi les 7 tétrominos.
        const color = TETROMINO_COLORS[(Math.random() * TETROMINO_COLORS.length) | 0];
        cell.style.setProperty('--tt-color', color);
        // Léger jitter de rotation initial pour que la chute paraisse vivante.
        const jitter = (Math.random() * 14 - 7).toFixed(1);
        cell.style.setProperty('--tt-jitter', `${jitter}deg`);
        // Stagger par colonne : chaque case d'une même ligne a un micro-delay
        // légèrement différent pour éviter l'effet "bloc monolithique".
        const colStagger = (Math.random() * 80).toFixed(0);
        cell.style.setProperty('--tt-col-stagger', `${colStagger}ms`);
        rowArr.push(cell);
        grid.appendChild(cell);
      }
      cellMatrix.push(rowArr);
    }

    host.appendChild(grid);
    tetrisGrid = grid;
    return { grid, cellMatrix, rows, cols };
  }

  /**
   * Phase OUT : les lignes tombent du haut vers le bas, chaque ligne avec
   * un stagger visible. À la fin, l'écran est totalement recouvert.
   */
  function runTetrisOut() {
    return new Promise((resolve) => {
      // Préparation : l'overlay reste transparent, seule la grille de blocs
      // apparaît dessus. On n'écrit PAS de background sur host (sinon on
      // aurait un fond noir visible entre les blocs pendant la cascade).
      host.style.background = 'transparent';
      host.style.opacity = '1';
      host.style.transition = 'none';
      host.classList.add('tetris-transition', 'tetris-transition--out');

      const { cellMatrix, rows } = buildTetrisGrid();

      // Stagger inter-lignes : chaque ligne démarre plus tard que la
      // précédente. On calibre pour que la dernière ligne termine pile
      // à tetrisOutMs.
      //
      // Total = lineDelay * (rows - 1) + fallDuration
      // On veut : lineDelay * (rows - 1) + fallDuration ≈ tetrisOutMs
      const fallDuration = Math.max(240, Math.round(tetrisOutMs * 0.45));
      const lineDelay = Math.max(
        0,
        Math.round((tetrisOutMs - fallDuration) / Math.max(1, rows - 1)),
      );

      for (let y = 0; y < rows; y++) {
        const rowDelay = y * lineDelay;
        for (let x = 0; x < cellMatrix[y].length; x++) {
          const cell = cellMatrix[y][x];
          cell.style.setProperty('--tt-fall-duration', `${fallDuration}ms`);
          cell.style.setProperty('--tt-fall-delay', `${rowDelay}ms`);
          // La classe déclenche l'animation CSS fall-in.
          cell.classList.add('tetris-transition__cell--falling');
        }
      }

      // Résout quand la toute dernière ligne a fini sa chute.
      // On ajoute une marge pour la lisibilité visuelle.
      const totalMs = lineDelay * (rows - 1) + fallDuration + 40;
      setTimeout(resolve, totalMs);
    });
  }

  /**
   * Phase IN : les lignes s'effacent du BAS vers le HAUT, chacune avec
   * un mini "line clear" (flash blanc + shrink). À la fin, plus aucun
   * bloc : on voit la nouvelle scène.
   */
  function runTetrisIn() {
    return new Promise((resolve) => {
      // Si buildTetrisGrid n'a jamais été appelé (cas limite), on fait
      // simplement un fade rapide pour ne pas bloquer.
      if (!tetrisGrid) {
        host.style.transition = `opacity ${fadeMs}ms var(--ease-sharp)`;
        host.style.opacity = '0';
        setTimeout(() => { reset(); resolve(); }, fadeMs + 20);
        return;
      }

      host.classList.remove('tetris-transition--out');
      host.classList.add('tetris-transition--in');

      // Récupération des lignes : on se base sur le nombre de colonnes
      // calculé au build pour reconstruire les lignes depuis le DOM.
      const allCells = /** @type {HTMLElement[]} */ (
        Array.from(tetrisGrid.querySelectorAll('.tetris-transition__cell'))
      );
      const colsFromGrid = /** @type {HTMLElement} */ (tetrisGrid)
        .style.gridTemplateColumns
        .match(/repeat\((\d+),/);
      const cols = colsFromGrid ? Number(colsFromGrid[1]) : 1;
      const rows = Math.ceil(allCells.length / cols);

      // Durée par ligne : chaque ligne fait son "line clear" (flash +
      // shrink) en clearDuration ms. Le stagger entre lignes découpe
      // le budget total.
      const clearDuration = Math.max(180, Math.round(tetrisInMs * 0.38));
      const lineDelay = Math.max(
        0,
        Math.round((tetrisInMs - clearDuration) / Math.max(1, rows - 1)),
      );

      // Bottom → top : la dernière ligne part en premier.
      for (let y = rows - 1; y >= 0; y--) {
        const invIdx = rows - 1 - y; // 0 pour la ligne du bas
        const delay = invIdx * lineDelay;
        for (let x = 0; x < cols; x++) {
          const cell = allCells[y * cols + x];
          if (!cell) continue;
          cell.style.setProperty('--tt-clear-duration', `${clearDuration}ms`);
          cell.style.setProperty('--tt-clear-delay', `${delay}ms`);
          cell.classList.add('tetris-transition__cell--clearing');
        }
      }

      const totalMs = lineDelay * (rows - 1) + clearDuration + 40;
setTimeout(() => {
  // Coupe la transition CSS par défaut AVANT le reset pour éviter
  // un fade-out parasite de 600 ms sur l'overlay lui-même.
  host.style.transition = 'none';
  host.style.opacity = '0';
  reset();
  resolve();
}, totalMs);
    });
  }

  // ---------------------------------------------------------------------
  // AVANCÉ — transitions enchaînées
  // ---------------------------------------------------------------------

  /**
   * Enchaîne out → action → in comme une "pipeline" simple.
   * @param {TransitionKind} kind
   * @param {() => Promise<void> | void} action
   */
  async function wrap(kind, action) {
    await out(kind);
    await Promise.resolve(action());
    await in_(kind);
  }

  reset();

  return Object.freeze({
    out,
    in: in_,
    reset,
    wrap,
  });
}