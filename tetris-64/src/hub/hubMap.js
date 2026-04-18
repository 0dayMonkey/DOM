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
 * REPÈRE DE COORDONNÉES
 * ---------------------
 *   - origine (0, 0, 0) = centre de la salle, au niveau du sol
 *   - axe X : droite positive   (+X = droite de la salle)
 *   - axe Y : hauteur négative  (le sol est à y=0, le plafond à y=-wallHeight)
 *   - axe Z : profondeur       (+Z = vers la caméra, −Z = vers le fond)
 *
 * ORIENTATION DES MURS (rappel CSS) :
 *   - Par défaut, la "face avant" d'un élément DOM pointe vers +Z.
 *   - rotateY(+90)  = la face tourne vers +X (mur à gauche regardant l'intérieur)
 *   - rotateY(-90)  = la face tourne vers -X (mur à droite regardant l'intérieur)
 *   - rotateY(180)  = la face tourne vers -Z (mur avant regardant le fond)
 *   - rotateX(+90)  = la face pointe vers +Y (sol regardant vers le haut)
 *   - rotateX(-90)  = la face pointe vers -Y (plafond regardant vers le bas)
 *
 * CONVENTION DE TRANSFORMATION
 *   Les transformations s'appliquent dans l'ordre `translate` puis `rotate`.
 *   Le point d'origine (coin haut-gauche de l'élément) est translaté, puis
 *   l'élément pivote autour de ce point. On choisit les coordonnées du
 *   coin haut-gauche pour qu'après rotation, le rectangle s'étende au bon
 *   endroit dans la salle.
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

  // -------------------------------------------------------------------
  // SOL (damier + tapis)
  // -------------------------------------------------------------------

  // Le sol est un rectangle de taille (width × depth) posé à plat.
  // On le tourne de 90° autour de X pour qu'il soit horizontal, face vers +Y.
  // Son coin haut-gauche (avant rotation) est placé tel qu'après rotation
  // le rectangle couvre X ∈ [-width/2, +width/2], Z ∈ [-depth/2, +depth/2].
  const floor = el('div', { class: 'hub-map__floor' });
  floor.style.width = `${width}px`;
  floor.style.height = `${depth}px`;
  floor.style.transform =
    `translate3d(${-width / 2}px, 0px, ${-depth / 2}px) rotateX(90deg)`;
  root.appendChild(floor);

  // Tapis rouge central au milieu du sol
  const carpetW = Math.round(width * 0.3);
  const carpetD = Math.round(depth * 0.8);
  const carpet = el('div', { class: 'hub-map__carpet' });
  carpet.style.width = `${carpetW}px`;
  carpet.style.height = `${carpetD}px`;
  // -1px en Y pour éviter le z-fighting avec le sol
  carpet.style.transform =
    `translate3d(${-carpetW / 2}px, -1px, ${-carpetD / 2}px) rotateX(90deg)`;
  root.appendChild(carpet);

  // -------------------------------------------------------------------
  // PLAFOND
  // -------------------------------------------------------------------

  // Même technique que le sol, mais élevé à y=-wallHeight et tourné de -90°
  // pour que sa face (avec texture bois) regarde vers le bas.
  const ceiling = el('div', { class: 'hub-map__ceiling' });
  ceiling.style.width = `${width}px`;
  ceiling.style.height = `${depth}px`;
  ceiling.style.transform =
    `translate3d(${-width / 2}px, ${-wallHeight}px, ${-depth / 2}px) rotateX(-90deg)`;
  root.appendChild(ceiling);

  // -------------------------------------------------------------------
  // MURS
  // -------------------------------------------------------------------

  // Chaque mur est un rectangle de largeur "longueur du mur" et de hauteur
  // wallHeight. On le place dans l'espace 3D via translate + rotate.

  // --- Mur arrière : z = -depth/2, face regardant vers l'intérieur (+Z).
  // Pas de rotation nécessaire car par défaut la face pointe déjà vers +Z.
  // C'est le mur sur lequel on accroche les tableaux.
  const backWall = el('div', { class: 'hub-map__wall hub-map__wall--back' });
  backWall.style.width = `${width}px`;
  backWall.style.height = `${wallHeight}px`;
  backWall.style.transform =
    `translate3d(${-width / 2}px, ${-wallHeight}px, ${-depth / 2}px)`;
  root.appendChild(backWall);

  // --- Mur avant : z = +depth/2, face regardant vers -Z (vers le fond).
  // rotateY(180) inverse la face pour qu'elle soit visible depuis l'intérieur.
  // Après rotation, la "largeur" locale s'étend vers -X, donc on pose le coin
  // haut-gauche d'origine à x = +width/2 pour que la face finale couvre
  // [-width/2, +width/2].
  const frontWall = el('div', { class: 'hub-map__wall hub-map__wall--front' });
  frontWall.style.width = `${width}px`;
  frontWall.style.height = `${wallHeight}px`;
  frontWall.style.transform =
    `translate3d(${width / 2}px, ${-wallHeight}px, ${depth / 2}px) rotateY(180deg)`;
  root.appendChild(frontWall);

  // --- Mur gauche : x = -width/2, face regardant vers +X.
  // La largeur du mur dans le monde est `depth` (il s'étend du fond à l'avant).
  // rotateY(90) : la direction "largeur" locale (+X) devient -Z monde.
  // Coin haut-gauche à z=+depth/2, ainsi après rotation le mur va de
  // z=+depth/2 vers z=-depth/2 en longeant x=-width/2.
  const leftWall = el('div', { class: 'hub-map__wall hub-map__wall--left' });
  leftWall.style.width = `${depth}px`;
  leftWall.style.height = `${wallHeight}px`;
  leftWall.style.transform =
    `translate3d(${-width / 2}px, ${-wallHeight}px, ${depth / 2}px) rotateY(90deg)`;
  root.appendChild(leftWall);

  // --- Mur droit : x = +width/2, face regardant vers -X.
  // rotateY(-90) : la direction "largeur" locale (+X) devient +Z monde.
  // Coin haut-gauche à z=-depth/2 pour que le mur aille de
  // z=-depth/2 vers z=+depth/2 en longeant x=+width/2.
  const rightWall = el('div', { class: 'hub-map__wall hub-map__wall--right' });
  rightWall.style.width = `${depth}px`;
  rightWall.style.height = `${wallHeight}px`;
  rightWall.style.transform =
    `translate3d(${width / 2}px, ${-wallHeight}px, ${-depth / 2}px) rotateY(-90deg)`;
  root.appendChild(rightWall);

  // -------------------------------------------------------------------
  // DÉCORS : 4 piliers aux coins + petit tapis d'entrée
  // -------------------------------------------------------------------

  const pillarInset = 200;
  /** @type {Array<{x:number, z:number}>} */
  const pillarPositions = [
    { x: -width / 2 + pillarInset, z: -depth / 2 + pillarInset },
    { x:  width / 2 - pillarInset, z: -depth / 2 + pillarInset },
    { x: -width / 2 + pillarInset, z:  depth / 2 - pillarInset },
    { x:  width / 2 - pillarInset, z:  depth / 2 - pillarInset },
  ];
  pillarPositions.forEach((p) => {
    const pillar = el('div', { class: 'hub-map__pillar' });
    pillar.style.height = `${wallHeight}px`;
    // Le pillar CSS a width=60 et on le centre sur son point (x, _, z)
    pillar.style.transform = `translate3d(${p.x - 30}px, ${-wallHeight}px, ${p.z}px)`;
    root.appendChild(pillar);
  });

  // Socle / tapis d'entrée (pour contextualiser la position de spawn devant
  // la caméra initiale). Juste un petit rectangle plat orné.
  const entryRug = el('div', { class: 'hub-map__entry-rug' });
  entryRug.style.transform =
    `translate3d(${-120}px, -1px, ${depth / 2 - 260}px) rotateX(90deg)`;
  root.appendChild(entryRug);

  // -------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------

  /**
   * Retourne les limites de déplacement du joueur, avec une marge pour
   * qu'il ne se colle pas aux murs.
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
   * Dimensions de la salle (pour les autres modules du hub : placement
   * des tableaux, positionnement de la caméra d'intro, etc.).
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