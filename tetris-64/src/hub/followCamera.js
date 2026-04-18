/**
 * followCamera.js — Caméra "tierce personne" GTA V–like.
 *
 * ========================================================================
 *  FEATURES (inspirées de GTA V)
 * ========================================================================
 *
 *  1. AUTO-CENTER LENT DE LA ROTATION
 *     La caméra ne suit PAS instantanément la rotation du joueur. Son
 *     angle dérive très lentement vers "derrière le joueur" (lerpRot très
 *     faible, ~0.04). Quand le perso tourne, on le voit pivoter devant la
 *     caméra avant qu'elle ne rattrape. C'est la signature GTA.
 *
 *  2. REGARD DEVANT LE PERSO (look-ahead)
 *     La caméra ne regarde pas le perso directement, mais un point à X
 *     unités DEVANT lui dans sa direction de marche. Résultat : le perso
 *     apparaît en bas d'écran, l'horizon prend plus de place. Règle des
 *     tiers respectée.
 *
 *  3. DEADZONE DE POSITION
 *     Quand la caméra est à moins de `deadzoneRadius` pixels de sa
 *     position idéale, elle NE BOUGE PAS. Elle n'absorbe que les grands
 *     déplacements. Les micro-mouvements sont ignorés → caméra calme.
 *
 *  4. SPEED-BASED DISTANCE + HAUTEUR
 *     Plus le joueur court vite, plus la caméra s'éloigne (simule l'effet
 *     FOV qui s'élargit en accéléré). Elle se baisse aussi un peu pour
 *     montrer plus d'horizon. Quand le joueur s'arrête, elle se rapproche.
 *
 *  5. CAMERA COLLISION (clamp aux bounds)
 *     Si la position idéale sort de la salle (derrière un mur), on
 *     rapproche la caméra du joueur sur l'axe player→caméra jusqu'à ce
 *     qu'elle soit dans les bounds. Pas de ray-cast : approximation
 *     simple qui suffit pour une salle rectangulaire.
 *
 *  6. LERPS DISTINCTS PAR AXE
 *     - lerpPosXZ : position horizontale (0.12)
 *     - lerpPosY  : verticale (0.18, plus rapide pour suivre les sauts)
 *     - lerpRot   : rotation (0.04, TRÈS lent — auto-center GTA)
 *
 *  7. PAS DE SNAP
 *     Aucun appel à `snapToTarget` en runtime. Tous les changements
 *     passent par interpolation, même à l'activation initiale (un premier
 *     snap au `enable()` est toléré pour partir d'une position cohérente).
 *
 * ========================================================================
 *  CONVENTIONS MATHÉMATIQUES (validées par test)
 * ========================================================================
 *
 *   forward_player(a) = (sin a, 0, cos a)
 *   forward_camera(ry) = (sin ry, 0, -cos ry)
 *
 *   Pour une caméra en `camPos` qui doit regarder `lookAt` :
 *     dx = lookAt.x - camPos.x
 *     dz = lookAt.z - camPos.z
 *     ry_deg = atan2(dx, -dz) × 180 / π
 */

import { lerp, lerpAngle } from '../utils/math3d.js';

/**
 * @typedef {Object} FollowCameraOptions
 * @property {ReturnType<import('../camera/camera.js').createCamera>} camera
 * @property {{getPosition: () => {x:number,y:number,z:number}, getAngle?: () => number}} target
 * @property {number} [baseDistance=480]        - Distance derrière le joueur
 * @property {number} [baseHeight=-240]         - Offset Y (négatif = au-dessus)
 * @property {number} [lookAheadDistance=400]   - Distance du point de regard devant le joueur
 * @property {number} [deadzoneRadius=30]       - Rayon où la caméra ne bouge pas
 * @property {number} [lerpPosXZ=0.12]          - Lerp position horizontale
 * @property {number} [lerpPosY=0.18]           - Lerp position verticale
 * @property {number} [lerpRot=0.04]            - Lerp rotation (TRÈS lent = effet GTA)
 * @property {number} [tiltDeg=20]              - Inclinaison de regard
 * @property {number} [speedDistanceFactor=0.3] - Pixels de recul par px/s de vitesse
 * @property {number} [speedHeightFactor=0.15]  - Pixels d'abaissement par px/s de vitesse
 * @property {number} [maxSpeedExtraDist=120]   - Cap du recul
 * @property {{minX:number,maxX:number,minZ:number,maxZ:number}} [bounds] - Camera collision
 */

/**
 * @param {FollowCameraOptions} options
 */
export function createFollowCamera(options) {
  const camera = options.camera;
  const target = options.target;

  // Paramètres de comportement
  let baseDistance = options.baseDistance ?? 480;
  let baseHeight = options.baseHeight ?? -240;
  let lookAheadDistance = options.lookAheadDistance ?? 400;
  let deadzoneRadius = options.deadzoneRadius ?? 30;
  let lerpPosXZ = options.lerpPosXZ ?? 0.12;
  let lerpPosY = options.lerpPosY ?? 0.18;
  let lerpRot = options.lerpRot ?? 0.04;
  let tiltDeg = options.tiltDeg ?? 20;
  let speedDistanceFactor = options.speedDistanceFactor ?? 0.3;
  let speedHeightFactor = options.speedHeightFactor ?? 0.15;
  let maxSpeedExtraDist = options.maxSpeedExtraDist ?? 120;
  let bounds = options.bounds ?? null;

  /** Position filtrée de la caméra (ce qui est réellement appliqué). */
  let curX = 0, curY = baseHeight, curZ = 0, curRy = 0;

  /** Distance courante (varie avec la vitesse). */
  let curDistance = baseDistance;
  let curHeightAdd = 0;

  /** Pour mesurer la vitesse du joueur. */
  let prevPlayerX = 0, prevPlayerZ = 0;
  let curSpeed = 0; // pixels / seconde (filtrée)

  let enabled = false;
  let firstFrame = true;

  // ---------------------------------------------------------------------
  // API PUBLIQUE
  // ---------------------------------------------------------------------

  function enable() {
    enabled = true;
    firstFrame = true;
    // Initialise prev pos
    const p = target.getPosition();
    prevPlayerX = p.x;
    prevPlayerZ = p.z;
    curSpeed = 0;
  }

  function disable() {
    enabled = false;
  }

  /**
   * Premier placement — SEULEMENT utilisé à l'activation initiale pour
   * éviter une trajectoire bizarre depuis (0,0,0) vers la cible.
   */
  function snapToTarget() {
    const { idealPos, idealLookAt } = computeIdeal();
    curX = idealPos.x;
    curY = idealPos.y;
    curZ = idealPos.z;
    curDistance = baseDistance;
    curHeightAdd = 0;
    // Rotation initiale = regarde vers le look-at immédiatement
    curRy = computeRyTo(idealPos, idealLookAt);
  }

  /**
   * @param {number} dtMs
   */
  function update(dtMs) {
    if (!enabled) return;
    const dt = Math.max(0.001, dtMs / 1000);

    // ---------- 1) Mesure de la vitesse du joueur ----------
    const p = target.getPosition();
    if (firstFrame) {
      prevPlayerX = p.x;
      prevPlayerZ = p.z;
      firstFrame = false;
      snapToTarget();
      apply();
      return;
    }
    const dx = p.x - prevPlayerX;
    const dz = p.z - prevPlayerZ;
    const instSpeed = Math.hypot(dx, dz) / dt;
    // Lisse la vitesse (évite les pics sur un seul frame lent)
    curSpeed = lerp(curSpeed, instSpeed, 0.15);
    prevPlayerX = p.x;
    prevPlayerZ = p.z;

    // ---------- 2) Distance et hauteur adaptatives à la vitesse ----------
    const extraDist = Math.min(maxSpeedExtraDist, curSpeed * speedDistanceFactor);
    const extraHeight = Math.min(maxSpeedExtraDist * 0.5, curSpeed * speedHeightFactor);
    curDistance = lerp(curDistance, baseDistance + extraDist, 0.08);
    curHeightAdd = lerp(curHeightAdd, extraHeight, 0.08);

    // ---------- 3) Calcule position idéale et lookAt ----------
    const { idealPos, idealLookAt } = computeIdeal();

    // ---------- 4) Camera collision (clamp aux bounds) ----------
    const clampedPos = applyBoundsCollision(idealPos, p);

    // ---------- 5) Deadzone de position ----------
    const distToIdeal = Math.hypot(clampedPos.x - curX, clampedPos.z - curZ);
    const posLerp = (distToIdeal > deadzoneRadius) ? lerpPosXZ : 0;

    curX = lerp(curX, clampedPos.x, posLerp);
    curZ = lerp(curZ, clampedPos.z, posLerp);
    curY = lerp(curY, clampedPos.y, lerpPosY); // Y toujours rapide, pas de deadzone

    // ---------- 6) Rotation vers le lookAt, TRÈS LENTE ----------
    const idealRy = computeRyTo({ x: curX, z: curZ }, idealLookAt);
    curRy = lerpAngle(curRy, idealRy, lerpRot);

    // ---------- 7) Apply ----------
    apply();
  }

  // ---------------------------------------------------------------------
  // COMPUTATIONS
  // ---------------------------------------------------------------------

  /**
   * Calcule la position idéale de la caméra (derrière le perso sur son
   * forward, avec corrections vitesse) et le point de regard (devant lui).
   */
  function computeIdeal() {
    const p = target.getPosition();
    const angle = target.getAngle ? target.getAngle() : 0;

    // forward_player = (sin a, 0, cos a)
    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);

    const idealPos = {
      x: p.x - fwdX * curDistance,
      y: p.y + baseHeight - curHeightAdd, // Y négatif = haut, on baisse un peu
      z: p.z - fwdZ * curDistance,
    };

    const idealLookAt = {
      x: p.x + fwdX * lookAheadDistance,
      y: p.y, // le lookAt reste à hauteur du joueur
      z: p.z + fwdZ * lookAheadDistance,
    };

    return { idealPos, idealLookAt };
  }

  /**
   * ry pour que la caméra en `camPos` regarde vers `lookAt`.
   * ry_deg = atan2(dx, -dz) × 180 / π
   *
   * @param {{x:number, z:number}} camPos
   * @param {{x:number, z:number}} lookAt
   */
  function computeRyTo(camPos, lookAt) {
    const dx = lookAt.x - camPos.x;
    const dz = lookAt.z - camPos.z;
    if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) return curRy;
    const rad = Math.atan2(dx, -dz);
    return (rad * 180) / Math.PI;
  }

  /**
   * Camera collision simple : si la position idéale sort des bounds,
   * on glisse vers le joueur le long du vecteur player→caméra jusqu'à
   * être dans la salle.
   *
   * @param {{x:number, y:number, z:number}} idealPos
   * @param {{x:number, y:number, z:number}} playerPos
   */
  function applyBoundsCollision(idealPos, playerPos) {
    if (!bounds) return idealPos;

    let { x, y, z } = idealPos;
    const { minX, maxX, minZ, maxZ } = bounds;

    // Si on est dans la salle, rien à faire
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return idealPos;

    // Sinon, on scale la direction player→cam pour atterrir pile à la bordure
    const vx = x - playerPos.x;
    const vz = z - playerPos.z;

    // t = facteur pour que playerPos + v*t soit à la bordure la plus proche
    // On calcule le t max pour chaque bordure qu'on dépasse, puis on prend le min
    let t = 1; // si rien ne dépasse, on garde la position idéale
    if (x < minX && vx !== 0) t = Math.min(t, (minX - playerPos.x) / vx);
    if (x > maxX && vx !== 0) t = Math.min(t, (maxX - playerPos.x) / vx);
    if (z < minZ && vz !== 0) t = Math.min(t, (minZ - playerPos.z) / vz);
    if (z > maxZ && vz !== 0) t = Math.min(t, (maxZ - playerPos.z) / vz);

    // Clamp t pour que la caméra ne se retrouve pas devant le joueur
    t = Math.max(0.1, Math.min(1, t));

    return {
      x: playerPos.x + vx * t,
      y,
      z: playerPos.z + vz * t,
    };
  }

  function apply() {
    camera.set({
      x: curX,
      y: curY,
      z: curZ,
      rx: tiltDeg,
      ry: curRy,
      rz: 0,
    });
  }

  // ---------------------------------------------------------------------
  // TWEAKING — API exposée pour la console
  // ---------------------------------------------------------------------

  function setBaseDistance(d) { baseDistance = d; }
  function setBaseHeight(h) { baseHeight = h; }
  function setLookAhead(d) { lookAheadDistance = d; }
  function setDeadzone(r) { deadzoneRadius = r; }
  function setTilt(deg) { tiltDeg = deg; }
  function setLerp(cfg) {
    if (typeof cfg.posXZ === 'number') lerpPosXZ = cfg.posXZ;
    if (typeof cfg.posY === 'number') lerpPosY = cfg.posY;
    if (typeof cfg.rot === 'number') lerpRot = cfg.rot;
  }
  function setSpeedEffect(cfg) {
    if (typeof cfg.distFactor === 'number') speedDistanceFactor = cfg.distFactor;
    if (typeof cfg.heightFactor === 'number') speedHeightFactor = cfg.heightFactor;
    if (typeof cfg.maxExtraDist === 'number') maxSpeedExtraDist = cfg.maxExtraDist;
  }
  function setBounds(b) { bounds = b; }

  function getStatus() {
    return {
      baseDistance, baseHeight, lookAheadDistance, deadzoneRadius, tiltDeg,
      lerpPosXZ, lerpPosY, lerpRot,
      speedDistanceFactor, speedHeightFactor, maxSpeedExtraDist,
      curSpeed: Math.round(curSpeed),
      curDistance: Math.round(curDistance),
      curHeightAdd: Math.round(curHeightAdd),
      position: { x: Math.round(curX), y: Math.round(curY), z: Math.round(curZ) },
      ry: Math.round(curRy),
    };
  }

  function destroy() {
    disable();
  }

  return Object.freeze({
    enable,
    disable,
    update,
    snapToTarget,
    destroy,
    isEnabled: () => enabled,
    // Tweaking
    setBaseDistance,
    setBaseHeight,
    setLookAhead,
    setDeadzone,
    setTilt,
    setLerp,
    setSpeedEffect,
    setBounds,
    getStatus,
  });
}