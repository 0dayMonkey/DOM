/**
 * hubMap.js — Construction de la salle du hub (château N64).
 *
 * Prend en entrée une `mapData` optionnelle (format mapcreator) qui décrit
 * le sol, les murs et les dimensions. Si aucune `mapData` n'est fournie,
 * on construit une salle rectangulaire par défaut avec 4 murs.
 *
 * Format mapData :
 * {
 *   floor: { width, depth, wallHeight },
 *   walls: [{ x1, z1, x2, z2 }, ...],
 *   spawn, paintings  (consommés par hubScene, pas par ce module)
 * }
 *
 * REPÈRE DE COORDONNÉES
 * ---------------------
 *   - origine (0, 0, 0) = centre de la salle, au niveau du sol
 *   - axe X : droite positive   (+X = droite de la salle)
 *   - axe Y : hauteur négative  (le sol est à y=0, le plafond à y=-wallHeight)
 *   - axe Z : profondeur       (+Z = vers la caméra, −Z = vers le fond)
 *
 * CONVENTION MURS
 * ---------------
 *   Un mur est un segment (x1,z1)→(x2,z2). On construit un rectangle 3D
 *   de longueur = ||(x2-x1, z2-z1)|| et hauteur = wallHeight, orienté
 *   perpendiculairement au segment. La face "intérieure" du mur (visible
 *   depuis l'intérieur de la salle) dépend de l'ordre des sommets :
 *   pour une salle rectangulaire parcourue dans le sens horaire vu de
 *   dessus, la face visible est côté intérieur. Pour des murs intérieurs,
 *   la face sera visible des deux côtés de toute façon.
 */

import { el } from '../utils/helpers.js';

/**
 * @typedef {Object} WallSegment
 * @property {number} x1
 * @property {number} z1
 * @property {number} x2
 * @property {number} z2
 */

/**
 * @typedef {Object} MapData
 * @property {number} [version]
 * @property {string} [name]
 * @property {number} [gridSize]
 * @property {{width:number, depth:number, wallHeight:number}} [floor]
 * @property {WallSegment[]} [walls]
 * @property {any[]} [paintings]
 * @property {{x:number, z:number, angle:number}} [spawn]
 */

/**
 * @typedef {Object} HubMapOptions
 * @property {HTMLElement} host
 * @property {MapData} [mapData]
 * @property {number} [width=1600]
 * @property {number} [depth=2000]
 * @property {number} [wallHeight=800]
 */

/**
 * @typedef {Object} HubBounds
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minZ
 * @property {number} maxZ
 */

/**
 * @param {HubMapOptions} options
 */
export function createHubMap(options) {
  const host = options.host;
  const mapData = options.mapData ?? null;

  // Dimensions : mapData a priorité, sinon options, sinon défauts
  const width = mapData?.floor?.width ?? options.width ?? 1600;
  const depth = mapData?.floor?.depth ?? options.depth ?? 2000;
  const wallHeight = mapData?.floor?.wallHeight ?? options.wallHeight ?? 800;

  const root = el('div', { class: 'hub-map' });
  host.appendChild(root);

  // -------------------------------------------------------------------
  // SOL (damier + tapis)
  // -------------------------------------------------------------------
  if (mapData?.floor?.visible !== false) {
  const floor = el('div', { class: 'hub-map__floor' });
  floor.style.width = `${width}px`;
  floor.style.height = `${depth}px`;
  floor.style.transform =
    `translate3d(${-width / 2}px, -1000px, 0px) rotateX(90deg)`;
  root.appendChild(floor);
  }

  const deco = mapData?.decorations ?? {};

  if (deco.centerCarpet) {

  // Tapis rouge central
  const carpetW = Math.round(width * 0.3);
  const carpetD = Math.round(depth * 0.8);
  const carpet = el('div', { class: 'hub-map__carpet' });
  carpet.style.width = `${carpetW}px`;
  carpet.style.height = `${carpetD}px`;
  carpet.style.transform =
    `translate3d(${-carpetW / 2}px, -801px, 0px) rotateX(90deg)`;
  root.appendChild(carpet);
  }
  // -------------------------------------------------------------------
  // PLAFOND
  // -------------------------------------------------------------------
  if (mapData?.ceiling?.visible !== false) {

  const ceiling = el('div', { class: 'hub-map__ceiling' });
  ceiling.style.width = `${width}px`;
  ceiling.style.height = `${depth}px`;
  ceiling.style.transform =
    `translate3d(${-width / 2}px, ${-wallHeight-1000}px, ${-depth / 2}px) rotateX(-90deg)`;
  root.appendChild(ceiling);
  }
  // -------------------------------------------------------------------
  // MURS — générés depuis mapData.walls ou par défaut
  // -------------------------------------------------------------------

  const wallsData = (mapData?.walls && mapData.walls.length > 0)
    ? mapData.walls
    : defaultRectangleWalls(width, depth);

  // Rendu visuel : on skippe les murs avec visible === false
  // (la collision utilisera getWalls() qui retourne TOUS les segments)
  wallsData.forEach((seg) => {
    if (seg.visible === false) return;
    buildWallSegment(root, seg, wallHeight);
  });

  const entryRug = el('div', { class: 'hub-map__entry-rug' });
  entryRug.style.transform =
    `translate3d(${-120}px, -1px, -801px) rotateX(90deg)`;
  root.appendChild(entryRug);

  // -------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------

  /**
   * Bounds rectangulaires couvrant tout le sol, avec une marge.
   * Pour une gestion fine des murs intérieurs il faudra ajouter une
   * vraie collision segment-par-segment côté player.
   *
   * @returns {HubBounds}
   */
  function getBounds() {
    const margin = 100;
    return {
      minX: -width / 2 + margin,
      maxX:  width / 2 - margin,
      minZ: -depth / 2 + margin,
      maxZ:  depth / 2 - margin,
    };
  }

  /**
   * Dimensions de la salle.
   */
  function getDimensions() {
    return { width, depth, wallHeight };
  }

  /**
   * Liste des segments de murs (utile pour collision player↔walls future).
   * @returns {WallSegment[]}
   */
  function getWalls() {
    return wallsData.map((w) => ({ ...w }));
  }

  function destroy() {
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return Object.freeze({
    getBounds,
    getDimensions,
    getWalls,
    destroy,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Salle rectangulaire par défaut : 4 murs dans le sens horaire vu de dessus.
 * @param {number} W
 * @param {number} D
 * @returns {WallSegment[]}
 */
function defaultRectangleWalls(W, D) {
  return [
    { x1: -W / 2, z1: -D / 2, x2:  W / 2, z2: -D / 2 }, // arrière
    { x1:  W / 2, z1: -D / 2, x2:  W / 2, z2:  D / 2 }, // droit
    { x1:  W / 2, z1:  D / 2, x2: -W / 2, z2:  D / 2 }, // avant
    { x1: -W / 2, z1:  D / 2, x2: -W / 2, z2: -D / 2 }, // gauche
  ];
}

/**
 * Construit un mur 3D à partir d'un segment 2D.
 *
 * Le mur est un rectangle DOM de taille (length × wallHeight). Son origine
 * (coin haut-gauche) est placée à (midX - length/2, -wallHeight, midZ),
 * et on pivote autour d'un axe vertical passant par son centre-bas pour
 * aligner sa "largeur" avec la direction du segment.
 *
 * @param {HTMLElement} root
 * @param {WallSegment} seg
 * @param {number} wallHeight
 */
function buildWallSegment(root, seg, wallHeight) {
  const dx = seg.x2 - seg.x1;
  const dz = seg.z2 - seg.z1;
  const length = Math.hypot(dx, dz);
  if (length < 1) return; // segment dégénéré

  // Angle Y : on veut que le vecteur "largeur locale" (+X du rectangle)
  // soit aligné avec le vecteur (dx, dz) dans le plan monde.
  // Un rectangle non tourné a sa largeur selon +X ; rotateY(θ) envoie
  // +X local vers (cos θ, 0, -sin θ) en monde. Pour aligner avec (dx, dz),
  // on résout : cos θ = dx/L, -sin θ = dz/L → θ = atan2(-dz, dx).
  const angleDeg = (Math.atan2(-dz, dx) * 180) / Math.PI;

  const midX = (seg.x1 + seg.x2) / 2;
  const midZ = (seg.z1 + seg.z2) / 2;

  const wall = el('div', { class: 'hub-map__wall hub-map__wall--generated' });
  wall.style.width = `${length}px`;
  wall.style.height = `${wallHeight}px`;
  // Origine = coin haut-gauche du rectangle. On la place de façon que,
  // APRÈS rotation autour du centre-bas, le mur soit pile sur le segment.
  // Centre-bas local = (length/2, wallHeight, 0).
  wall.style.transformOrigin = `${length / 2}px ${wallHeight}px 0`;
  wall.style.transform =
    `translate3d(${midX - length / 2}px, ${-wallHeight}px, ${midZ}px) ` +
    `rotateY(${angleDeg}deg)`;

  root.appendChild(wall);
}