/**
 * hubMap.js — Construction de la salle du hub (château N64).
 *
 * Crée le sol, les 4 murs, le plafond, un tapis central et quelques détails
 * de décor (socles, piliers) directement en DOM 3D. Pas de modèles externes :
 * tout est de la CSS (transform + background).
 *
 * Le module expose également les limites de déplacement du joueur
 * (getBounds) pour qu'il puisse rester dans la salle.
 *
 * Repère de coordonnées utilisé dans le hub :
 *   - origine (0, 0, 0) = centre de la salle, au niveau du sol
 *   - X : droite positive
 *   - Y : hauteur ; négatif = haut (convention scène : le sol est à y=0)
 *   - Z : profondeur ; -Z = vers le fond (loin du spectateur à la base)
 */

import { el } from '../utils/helpers.js';

/**
 * @typedef {Object} HubMapOptions
 * @property {HTMLElement} host
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
  const width = options.width ?? 1600;
  const depth = options.depth ?? 2000;
  const wallHeight = options.wallHeight ?? 800;
  const host = options.host;

  const root = el('div', { class: 'hub-map' });
  host.appendChild(root);

  // ---------------------------------------------------------------------
  // SOL
  // ---------------------------------------------------------------------

  const floor = el('div', { class: 'hub-map__floor' });
  floor.style.width = `${width}px`;
  floor.style.height = `${depth}px`;
  floor.style.transform =
    `translate3d(${-width / 2}px, 0px, ${-depth / 2}px) rotateX(90deg)`;
  root.appendChild(floor);

  // Tapis rouge central
  const carpet = el('div', { class: 'hub-map__carpet' });
  const carpetW = Math.round(width * 0.3);
  const carpetD = Math.round(depth * 0.8);
  carpet.style.width = `${carpetW}px`;
  carpet.style.height = `${carpetD}px`;
  carpet.style.transform =
    `translate3d(${-carpetW / 2}px, -1px, ${-carpetD / 2}px) rotateX(90deg)`;
  root.appendChild(carpet);

  // ---------------------------------------------------------------------
  // PLAFOND
  // ---------------------------------------------------------------------

  const ceiling = el('div', { class: 'hub-map__ceiling' });
  ceiling.style.width = `${width}px`;
  ceiling.style.height = `${depth}px`;
  ceiling.style.transform =
    `translate3d(${-width / 2}px, ${-wallHeight}px, ${-depth / 2}px) rotateX(-90deg)`;
  root.appendChild(ceiling);

  // ---------------------------------------------------------------------
  // MURS
  // ---------------------------------------------------------------------

  // Mur arrière (Z = -depth/2) — celui où sont accrochés les tableaux
  const backWall = el('div', { class: 'hub-map__wall hub-map__wall--back' });
  backWall.style.width = `${width}px`;
  backWall.style.height = `${wallHeight}px`;
  backWall.style.transform =
    `translate3d(${-width / 2}px, ${-wallHeight}px, ${-depth / 2}px)`;
  root.appendChild(backWall);

  // Mur avant (Z = +depth/2) — regarde vers -Z, donc rotateY(180)
  const frontWall = el('div', { class: 'hub-map__wall hub-map__wall--front' });
  frontWall.style.width = `${width}px`;
  frontWall.style.height = `${wallHeight}px`;
  frontWall.style.transform =
    `translate3d(${width / 2}px, ${-wallHeight}px, ${depth / 2}px) rotateY(180deg)`;
  root.appendChild(frontWall);

  // Mur gauche (X = -width/2)
  const leftWall = el('div', { class: 'hub-map__wall hub-map__wall--left' });
  leftWall.style.width = `${depth}px`;
  leftWall.style.height = `${wallHeight}px`;
  leftWall.style.transform =
    `translate3d(${-width / 2}px, ${-wallHeight}px, ${depth / 2}px) rotateY(90deg)`;
  root.appendChild(leftWall);

  // Mur droit (X = +width/2)
  const rightWall = el('div', { class: 'hub-map__wall hub-map__wall--right' });
  rightWall.style.width = `${depth}px`;
  rightWall.style.height = `${wallHeight}px`;
  rightWall.style.transform =
    `translate3d(${width / 2}px, ${-wallHeight}px, ${-depth / 2}px) rotateY(-90deg)`;
  root.appendChild(rightWall);

  // ---------------------------------------------------------------------
  // DÉCORS : 4 piliers aux coins + socles sous les tableaux
  // ---------------------------------------------------------------------

  const pillarInset = 200;
  const pillarCfg = [
    { x: -width / 2 + pillarInset, z: -depth / 2 + pillarInset },
    { x:  width / 2 - pillarInset, z: -depth / 2 + pillarInset },
    { x: -width / 2 + pillarInset, z:  depth / 2 - pillarInset },
    { x:  width / 2 - pillarInset, z:  depth / 2 - pillarInset },
  ];
  pillarCfg.forEach((p) => {
    const pillar = el('div', { class: 'hub-map__pillar' });
    pillar.style.height = `${wallHeight}px`;
    pillar.style.transform = `translate3d(${p.x - 30}px, ${-wallHeight}px, ${p.z}px)`;
    root.appendChild(pillar);
  });

  // Socle / tapis d'entrée (pour contextualiser la position de spawn)
  const entryRug = el('div', { class: 'hub-map__entry-rug' });
  entryRug.style.transform =
    `translate3d(${-120}px, -1px, ${depth / 2 - 260}px) rotateX(90deg)`;
  root.appendChild(entryRug);

  // ---------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------

  /**
   * @returns {HubBounds}
   */
  function getBounds() {
    const margin = 100;
    return {
      minX: -width / 2 + margin,
      maxX: width / 2 - margin,
      minZ: -depth / 2 + margin,
      maxZ: depth / 2 - margin,
    };
  }

  /**
   * Dimensions de la salle (pour les autres modules du hub).
   */
  function getDimensions() {
    return { width, depth, wallHeight };
  }

  function destroy() {
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return Object.freeze({
    getBounds,
    getDimensions,
    destroy,
  });
}