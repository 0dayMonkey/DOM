/**
 * constants.js — Toutes les constantes du jeu
 *
 * Centralise dimensions, timings, règles de scoring, touches par défaut.
 * Aucune magic number ailleurs dans la codebase ; si une valeur doit être
 * ajustable ou réutilisée, elle atterrit ici.
 *
 * Zéro effet de bord, zéro import : ce fichier est pure data.
 */

// ============================================================================
// GRILLE
// ============================================================================

/** Nombre de colonnes visibles (standard Tetris). */
export const BOARD_COLS = 10;

/** Nombre de lignes visibles. */
export const BOARD_VISIBLE_ROWS = 20;

/** Nombre de lignes cachées en haut (zone de spawn). */
export const BOARD_HIDDEN_ROWS = 2;

/** Total de lignes (visibles + cachées). */
export const BOARD_TOTAL_ROWS = BOARD_VISIBLE_ROWS + BOARD_HIDDEN_ROWS;

/** Valeur d'une cellule vide dans la grille. */
export const CELL_EMPTY = 0;

// ============================================================================
// PIÈCES — identifiants
// ============================================================================

/**
 * Types de pièces. Les valeurs numériques correspondent aussi à l'ID stocké
 * dans la grille quand la pièce est verrouillée.
 */
export const PIECE_TYPES = Object.freeze(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);

/** Mapping type → id numérique (1..7). */
export const PIECE_ID = Object.freeze({
  I: 1,
  O: 2,
  T: 3,
  S: 4,
  Z: 5,
  J: 6,
  L: 7,
});

/** Inverse : id → type lettre. */
export const ID_TO_PIECE = Object.freeze({
  1: 'I',
  2: 'O',
  3: 'T',
  4: 'S',
  5: 'Z',
  6: 'J',
  7: 'L',
});

// ============================================================================
// SPAWN
// ============================================================================

/** Colonne de spawn (axe X du coin haut-gauche de la boîte de rotation). */
export const SPAWN_X = 3;

/** Ligne de spawn (dans la zone cachée). */
export const SPAWN_Y = 0;

// ============================================================================
// TIMINGS (tous en millisecondes sauf gravité)
// ============================================================================

/** Délai avant que la pièce se verrouille une fois posée. */
export const LOCK_DELAY_MS = 500;

/** Nombre max de resets du lock delay (anti-stall). */
export const MAX_LOCK_RESETS = 15;

/** Delayed Auto Shift : délai avant répétition. */
export const DAS_MS = 170;

/** Auto Repeat Rate : intervalle entre répétitions. */
export const ARR_MS = 50;

/** Délai soft drop (en ms entre cases). */
export const SOFT_DROP_INTERVAL_MS = 40;

/** Délai d'animation de line clear. */
export const LINE_CLEAR_ANIM_MS = 400;

/** Délai avant respawn de la pièce suivante après lock. */
export const SPAWN_DELAY_MS = 80;

/** Délai avant game over après détection. */
export const GAME_OVER_DELAY_MS = 1000;

// ============================================================================
// GRAVITÉ (formule guideline)
// ============================================================================

/**
 * Calcule la gravité en ms/cellule pour un niveau donné.
 * Formule officielle : (0.8 - (level-1)*0.007)^(level-1) secondes/cellule.
 * Clampée à 1ms minimum pour éviter les explosions numériques aux hauts niveaux.
 *
 * @param {number} level - Niveau courant (1+).
 * @returns {number} Durée en ms entre deux chutes d'une cellule.
 */
export function gravityMsForLevel(level) {
  const n = Math.max(1, level);
  const secondsPerCell = Math.pow(0.8 - (n - 1) * 0.007, n - 1);
  return Math.max(1, Math.round(secondsPerCell * 1000));
}

// ============================================================================
// LIGNES / NIVEAUX
// ============================================================================

/** Nombre de lignes à effacer pour monter de niveau. */
export const LINES_PER_LEVEL = 10;

/** Niveau max pratique (gravité ~1ms à partir de 20+). */
export const MAX_LEVEL = 20;

// ============================================================================
// SCORING (standard guideline)
// ============================================================================

/**
 * Points de base par type de clear, multipliés ensuite par niveau
 * et modifiés par B2B.
 */
export const SCORE_BASE = Object.freeze({
  SINGLE: 100,
  DOUBLE: 300,
  TRIPLE: 500,
  TETRIS: 800,
  TSPIN_MINI_NO_LINES: 100,
  TSPIN_NO_LINES: 400,
  TSPIN_MINI_SINGLE: 200,
  TSPIN_SINGLE: 800,
  TSPIN_DOUBLE: 1200,
  TSPIN_TRIPLE: 1600,
  SOFT_DROP_PER_CELL: 1,
  HARD_DROP_PER_CELL: 2,
  COMBO_PER_STEP: 50,
  PERFECT_CLEAR_SINGLE: 800,
  PERFECT_CLEAR_DOUBLE: 1200,
  PERFECT_CLEAR_TRIPLE: 1800,
  PERFECT_CLEAR_TETRIS: 2000,
});

/** Multiplicateur Back-to-Back (appliqué à certains clears éligibles). */
export const B2B_MULTIPLIER = 1.5;

/** Types de clear qui déclenchent / maintiennent le Back-to-Back. */
export const B2B_ELIGIBLE_CLEARS = Object.freeze(
  new Set(['TETRIS', 'TSPIN_SINGLE', 'TSPIN_DOUBLE', 'TSPIN_TRIPLE', 'TSPIN_MINI_SINGLE'])
);

// ============================================================================
// NEXT QUEUE / HOLD
// ============================================================================

/** Nombre de pièces visibles dans la prévisualisation next. */
export const NEXT_QUEUE_SIZE = 5;

// ============================================================================
// ROTATIONS
// ============================================================================

/** États de rotation : 0 = spawn, R = CW, 2 = 180°, L = CCW. */
export const ROTATION_STATES = Object.freeze([0, 1, 2, 3]);

// ============================================================================
// MODES DE JEU
// ============================================================================

export const GAME_MODES = Object.freeze({
  MARATHON: 'marathon',
  SPRINT_40L: 'sprint40',
  ZEN: 'zen',
});

/** Objectif de lignes pour le mode Sprint. */
export const SPRINT_TARGET_LINES = 40;

// ============================================================================
// PHASES DU JEU
// ============================================================================

export const GAME_PHASES = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  LOCKING: 'locking',
  CLEARING: 'clearing',
  SPAWNING: 'spawning',
  PAUSED: 'paused',
  GAME_OVER: 'gameover',
});

// ============================================================================
// SCÈNES
// ============================================================================

export const SCENES = Object.freeze({
  TITLE: 'title',
  HUB: 'hub',
  GAME: 'game',
  GAME_OVER: 'gameover',
});

// ============================================================================
// ACTIONS (inputs abstraits, indépendants de la touche)
// ============================================================================

export const ACTIONS = Object.freeze({
  // Game
  MOVE_LEFT: 'moveLeft',
  MOVE_RIGHT: 'moveRight',
  SOFT_DROP: 'softDrop',
  HARD_DROP: 'hardDrop',
  ROTATE_CW: 'rotateCW',
  ROTATE_CCW: 'rotateCCW',
  ROTATE_180: 'rotate180',
  HOLD: 'hold',
  PAUSE: 'pause',
  MUTE: 'mute',
  // Hub / title
  MOVE_UP: 'moveUp',
  MOVE_DOWN: 'moveDown',
  INTERACT: 'interact',
  BACK: 'back',
  START: 'start',
});

// ============================================================================
// MAPPING TOUCHES → ACTIONS (par défaut)
// ============================================================================

/**
 * Mapping KeyboardEvent.code / key → ACTION.
 * Résolu contextuellement par input/actionMap.js en fonction de la scène.
 */
export const DEFAULT_KEYMAP = Object.freeze({
  // Flèches
  ArrowLeft: ACTIONS.MOVE_LEFT,
  ArrowRight: ACTIONS.MOVE_RIGHT,
  ArrowDown: ACTIONS.SOFT_DROP,
  ArrowUp: ACTIONS.ROTATE_CW,
  // Game
  Space: ACTIONS.HARD_DROP,
  KeyX: ACTIONS.ROTATE_CW,
  KeyZ: ACTIONS.ROTATE_CCW,
  ControlLeft: ACTIONS.ROTATE_CCW,
  ControlRight: ACTIONS.ROTATE_CCW,
  KeyA: ACTIONS.ROTATE_180,
  KeyC: ACTIONS.HOLD,
  ShiftLeft: ACTIONS.HOLD,
  ShiftRight: ACTIONS.HOLD,
  KeyP: ACTIONS.PAUSE,
  Escape: ACTIONS.PAUSE,
  KeyM: ACTIONS.MUTE,
  Enter: ACTIONS.INTERACT,
});

// ============================================================================
// AUDIO
// ============================================================================

export const SFX_IDS = Object.freeze({
  MOVE: 'sfx-move',
  ROTATE: 'sfx-rotate',
  LOCK: 'sfx-lock',
  CLEAR: 'sfx-clear',
  TETRIS: 'sfx-tetris',
  TSPIN: 'sfx-tspin',
  HOLD: 'sfx-hold',
  HARD_DROP: 'sfx-hard-drop',
  LEVEL_UP: 'sfx-levelup',
  MENU_SELECT: 'sfx-menu-select',
  MENU_MOVE: 'sfx-menu-move',
  HUB_FOOTSTEP: 'sfx-hub-footstep',
  HUB_DOOR: 'sfx-hub-door',
});

export const MUSIC_IDS = Object.freeze({
  TITLE: 'music-title',
  HUB: 'music-hub',
  GAME: 'music-game',
  GAME_OVER: 'music-gameover',
});

/** Volumes par défaut (0..1). */
export const DEFAULT_VOLUMES = Object.freeze({
  MASTER: 0.8,
  SFX: 0.9,
  MUSIC: 0.5,
});

// ============================================================================
// FX — limites
// ============================================================================

/** Budget max de particules simultanées. */
export const MAX_PARTICLES = 100;

/** Durées des text pops (ms). */
export const TEXT_POP_DURATION_MS = 1200;

// ============================================================================
// CAMERA — presets de base
// ============================================================================

export const CAMERA_PRESETS = Object.freeze({
  GAME_DEFAULT: { x: 0, y: 0, z: 0, rx: -8, ry: 0, rz: 0 },
  GAME_TILT_LEFT: { x: 0, y: 0, z: 0, rx: -8, ry: 6, rz: 0 },
  GAME_TILT_RIGHT: { x: 0, y: 0, z: 0, rx: -8, ry: -6, rz: 0 },
  GAME_ZOOM_IN: { x: 0, y: 0, z: 100, rx: -8, ry: 0, rz: 0 },
  HUB_OVERVIEW: { x: 0, y: -200, z: -600, rx: -20, ry: 0, rz: 0 },
  HUB_FOLLOW: { x: 0, y: -100, z: -350, rx: -12, ry: 0, rz: 0 },
  TITLE_ORBIT: { x: 0, y: 0, z: -400, rx: -5, ry: 0, rz: 0 },
});

// ============================================================================
// STORAGE
// ============================================================================

export const STORAGE_KEYS = Object.freeze({
  HIGH_SCORES: 'tetris64.highScores',
  SETTINGS: 'tetris64.settings',
  BEST_SPRINT: 'tetris64.bestSprint',
});

/** Nombre de high scores conservés par mode. */
export const HIGH_SCORES_LIMIT = 10;

// ============================================================================
// DIVERS
// ============================================================================

/** Framerate cible. */
export const TARGET_FPS = 60;

/** Pas de temps fixe pour les ticks logiques (ms). */
export const FIXED_TIMESTEP_MS = 1000 / TARGET_FPS;

/** Delta max par frame pour éviter les "spirales" en cas de pause onglet. */
export const MAX_FRAME_DT_MS = 100;