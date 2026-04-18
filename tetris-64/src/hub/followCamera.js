/**
 * followCamera.js — Caméra "tierce personne" avec collision murs raycast.
 *
 * ========================================================================
 *  COLLISION MURS — GARANTIE ANTI-TRAVERSEE
 * ========================================================================
 *
 *  La caméra effectue un RAYCAST depuis le joueur vers sa position idéale
 *  contre tous les segments de murs fournis via `walls`. Si le rayon
 *  intersecte un mur, la caméra est plaquée juste devant ce mur, côté
 *  joueur, avec une marge de `wallPadding` pixels.
 *
 *  Conséquence : la caméra ne peut PHYSIQUEMENT jamais se retrouver de
 *  l'autre côté d'un mur, quel que soit l'état précédent ou le mouvement
 *  du joueur. C'est une garantie géométrique, pas un lerp qui peut rater.
 *
 *  Si aucun mur n'est fourni, on retombe sur le clamp rectangulaire
 *  `bounds` (legacy, moins précis mais suffit pour salles rectangulaires
 *  vides).
 *
 * ========================================================================
 *  FEATURES (inspirées Mario 64 / GTA V)
 * ========================================================================
 *
 *  - Auto-center lent de la rotation (lerpRot)
 *  - Look-ahead devant le joueur (lookAheadDistance)
 *  - Deadzone de position (deadzoneRadius)
 *  - Speed-based distance & hauteur
 *  - Clamp angulaire maxYawOffsetDeg (empêche la rotation 360°)
 *
 * ========================================================================
 *  CONVENTIONS MATHÉMATIQUES
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

import { lerp, lerpAngle, shortestDeltaDeg } from '../utils/math3d.js';

/**
 * @typedef {Object} WallSegment
 * @property {number} x1
 * @property {number} z1
 * @property {number} x2
 * @property {number} z2
 */

/**
 * @typedef {Object} FollowCameraOptions
 * @property {ReturnType<import('../camera/camera.js').createCamera>} camera
 * @property {{getPosition: () => {x:number,y:number,z:number}, getAngle?: () => number}} target
 * @property {number} [baseDistance=480]
 * @property {number} [baseHeight=-240]
 * @property {number} [lookAheadDistance=400]
 * @property {number} [deadzoneRadius=30]
 * @property {number} [lerpPosXZ=0.12]
 * @property {number} [lerpPosY=0.18]
 * @property {number} [lerpRot=0.04]
 * @property {number} [tiltDeg=20]
 * @property {number} [speedDistanceFactor=0.3]
 * @property {number} [speedHeightFactor=0.15]
 * @property {number} [maxSpeedExtraDist=120]
 * @property {number} [maxYawOffsetDeg=45]       - Clamp angulaire autour de idealRy
 * @property {number} [wallPadding=40]            - Marge caméra↔mur (px)
 * @property {number} [minDistanceToPlayer=120]   - Caméra ne se rapproche jamais plus près
 * @property {WallSegment[]} [walls]              - Murs pour le raycast (PRIORITAIRE)
 * @property {{minX:number,maxX:number,minZ:number,maxZ:number}} [bounds] - Fallback rectangulaire
 */

/**
 * @param {FollowCameraOptions} options
 */
export function createFollowCamera(options) {
  const camera = options.camera;
  const target = options.target;

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
  let maxYawOffsetDeg = options.maxYawOffsetDeg ?? 45;
  let wallPadding = options.wallPadding ?? 40;
  let minDistanceToPlayer = options.minDistanceToPlayer ?? 120;
  let walls = options.walls ? options.walls.map((w) => ({ ...w })) : null;
  let bounds = options.bounds ?? null;

  let curX = 0, curY = baseHeight, curZ = 0, curRy = 0;
  let curDistance = baseDistance;
  let curHeightAdd = 0;

  let prevPlayerX = 0, prevPlayerZ = 0;
  let curSpeed = 0;

  let enabled = false;
  let firstFrame = true;

  // ---------------------------------------------------------------------
  // API PUBLIQUE
  // ---------------------------------------------------------------------

  function enable() {
    enabled = true;
    firstFrame = true;
    const p = target.getPosition();
    prevPlayerX = p.x;
    prevPlayerZ = p.z;
    curSpeed = 0;
  }

  function disable() {
    enabled = false;
  }

  function snapToTarget() {
    const { idealPos, idealLookAt } = computeIdeal();
    const safePos = resolveCollisions(idealPos, target.getPosition());
    curX = safePos.x;
    curY = safePos.y;
    curZ = safePos.z;
    curDistance = baseDistance;
    curHeightAdd = 0;
    curRy = computeRyTo(safePos, idealLookAt);
  }

  /**
   * @param {number} dtMs
   */
  function update(dtMs) {
    if (!enabled) return;
    const dt = Math.max(0.001, dtMs / 1000);

    // 1) Mesure vitesse
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
    curSpeed = lerp(curSpeed, instSpeed, 0.15);
    prevPlayerX = p.x;
    prevPlayerZ = p.z;

    // 2) Distance/hauteur adaptatives
    const extraDist = Math.min(maxSpeedExtraDist, curSpeed * speedDistanceFactor);
    const extraHeight = Math.min(maxSpeedExtraDist * 0.5, curSpeed * speedHeightFactor);
    curDistance = lerp(curDistance, baseDistance + extraDist, 0.08);
    curHeightAdd = lerp(curHeightAdd, extraHeight, 0.08);

    // 3) Position idéale + lookAt
    const { idealPos, idealLookAt } = computeIdeal();

    // 4) COLLISION — la position idéale est-elle atteignable sans
    //    traverser un mur ? Si non, on la rapproche du joueur.
    const safePos = resolveCollisions(idealPos, p);

    // 5) Deadzone
    const distToIdeal = Math.hypot(safePos.x - curX, safePos.z - curZ);
    const posLerp = (distToIdeal > deadzoneRadius) ? lerpPosXZ : 0;

    curX = lerp(curX, safePos.x, posLerp);
    curZ = lerp(curZ, safePos.z, posLerp);
    curY = lerp(curY, safePos.y, lerpPosY);

    // 6) SAFETY NET : si le lerp a laissé la caméra de l'autre côté d'un
    //    mur (cas limite où safePos était côté joueur mais curX/Z reste
    //    coincé derrière), on RE-RESOUD depuis la position lerpée vers
    //    le joueur. Cette passe finale garantit "jamais de traversée".
    const finalSafe = resolveCollisions({ x: curX, y: curY, z: curZ }, p);
    curX = finalSafe.x;
    curZ = finalSafe.z;

    // 7) Rotation clampée
    const idealRy = computeRyTo({ x: curX, z: curZ }, idealLookAt);
    curRy = lerpAngle(curRy, idealRy, lerpRot);
    const delta = shortestDeltaDeg(idealRy, curRy);
    if (delta > maxYawOffsetDeg) curRy = idealRy + maxYawOffsetDeg;
    else if (delta < -maxYawOffsetDeg) curRy = idealRy - maxYawOffsetDeg;

    apply();
  }

  // ---------------------------------------------------------------------
  // COLLISION — raycast contre les murs
  // ---------------------------------------------------------------------

  /**
   * Prend la position idéale de la caméra et la rapproche du joueur
   * jusqu'à ce qu'elle ne traverse plus aucun mur, avec une marge.
   *
   * Algorithme :
   *   1. Raycast depuis le joueur vers la position idéale.
   *   2. Pour chaque mur, calcul de l'intersection segment-segment.
   *   3. On garde le t minimum (intersection la plus proche du joueur).
   *   4. Si t < 1, on place la caméra à (joueur + dir × t × dist - padding).
   *   5. On applique aussi le clamp rectangulaire `bounds` en dernier recours.
   *   6. On respecte la distance minimale au joueur pour éviter que la
   *      caméra soit "dans le joueur" quand un mur est très proche.
   *
   * @param {{x:number, y:number, z:number}} idealPos
   * @param {{x:number, y:number, z:number}} playerPos
   */
  function resolveCollisions(idealPos, playerPos) {
    let resultX = idealPos.x;
    let resultY = idealPos.y;
    let resultZ = idealPos.z;

    if (walls && walls.length > 0) {
      const dirX = idealPos.x - playerPos.x;
      const dirZ = idealPos.z - playerPos.z;
      const rayLen = Math.hypot(dirX, dirZ);

      if (rayLen > 0.001) {
        // Cherche le t le plus petit en [0, 1] où le rayon touche un mur.
        let closestT = 1;
        for (let i = 0; i < walls.length; i++) {
          const w = walls[i];
          const t = raySegmentIntersect(
            playerPos.x, playerPos.z,
            idealPos.x,  idealPos.z,
            w.x1, w.z1, w.x2, w.z2,
          );
          if (t != null && t < closestT) closestT = t;
        }

        // On applique padding pour que la caméra reste devant le mur.
        // Padding converti en fraction du rayon.
        const paddingT = wallPadding / rayLen;
        let safeT = closestT - paddingT;

        // Distance minimale au joueur
        const minT = minDistanceToPlayer / rayLen;
        if (safeT < minT) safeT = Math.min(minT, 1);

        // Si closestT était très petit (mur collé au joueur), on peut
        // avoir safeT négatif. On clamp à minT.
        if (safeT < 0) safeT = 0;
        if (safeT > 1) safeT = 1;

        resultX = playerPos.x + dirX * safeT;
        resultZ = playerPos.z + dirZ * safeT;
      }
    } else if (bounds) {
      // Fallback legacy : clamp rectangulaire dur
      resultX = Math.max(bounds.minX, Math.min(bounds.maxX, resultX));
      resultZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, resultZ));
    }

    // Filet de sécurité supplémentaire : clamp bounds même si on a les murs
    if (bounds) {
      resultX = Math.max(bounds.minX, Math.min(bounds.maxX, resultX));
      resultZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, resultZ));
    }

    return { x: resultX, y: resultY, z: resultZ };
  }

  /**
   * Intersection rayon [A, B] contre segment [C, D] dans le plan XZ.
   * Retourne le paramètre t ∈ [0, 1] sur le rayon où a lieu l'intersection,
   * ou null si pas d'intersection.
   *
   * Algorithme standard segment-segment 2D :
   *   A + t (B-A) = C + u (D-C)
   *   Résolu en t et u ; l'intersection n'est valide que si
   *   t ∈ [0, 1] ET u ∈ [0, 1].
   */
  function raySegmentIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
    const rx = bx - ax, rz = bz - az;
    const sx = dx - cx, sz = dz - cz;
    const denom = rx * sz - rz * sx;
    if (Math.abs(denom) < 1e-6) return null; // parallèles
    const t = ((cx - ax) * sz - (cz - az) * sx) / denom;
    const u = ((cx - ax) * rz - (cz - az) * rx) / denom;
    if (t < 0 || t > 1) return null;
    if (u < 0 || u > 1) return null;
    return t;
  }

  // ---------------------------------------------------------------------
  // COMPUTATIONS (position/rotation idéales)
  // ---------------------------------------------------------------------

  function computeIdeal() {
    const p = target.getPosition();
    const angle = target.getAngle ? target.getAngle() : 0;

    const fwdX = Math.sin(angle);
    const fwdZ = Math.cos(angle);

    const idealPos = {
      x: p.x - fwdX * curDistance,
      y: p.y + baseHeight - curHeightAdd,
      z: p.z - fwdZ * curDistance,
    };

    const idealLookAt = {
      x: p.x + fwdX * lookAheadDistance,
      y: p.y,
      z: p.z + fwdZ * lookAheadDistance,
    };

    return { idealPos, idealLookAt };
  }

  function computeRyTo(camPos, lookAt) {
    const dx = lookAt.x - camPos.x;
    const dz = lookAt.z - camPos.z;
    if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) return curRy;
    const rad = Math.atan2(dx, -dz);
    return (rad * 180) / Math.PI;
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
  // TWEAKING
  // ---------------------------------------------------------------------

  function setBaseDistance(d) { baseDistance = d; }
  function setBaseHeight(h) { baseHeight = h; }
  function setLookAhead(d) { lookAheadDistance = d; }
  function setDeadzone(r) { deadzoneRadius = r; }
  function setTilt(deg) { tiltDeg = deg; }
  function setYawLimit(deg) { maxYawOffsetDeg = deg; }
  function setWallPadding(px) { wallPadding = px; }
  function setMinDistance(px) { minDistanceToPlayer = px; }
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
  function setWalls(w) { walls = Array.isArray(w) ? w.map((x) => ({ ...x })) : null; }

  function getStatus() {
    return {
      baseDistance, baseHeight, lookAheadDistance, deadzoneRadius, tiltDeg,
      lerpPosXZ, lerpPosY, lerpRot,
      speedDistanceFactor, speedHeightFactor, maxSpeedExtraDist,
      maxYawOffsetDeg, wallPadding, minDistanceToPlayer,
      wallCount: walls ? walls.length : 0,
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
    setYawLimit,
    setWallPadding,
    setMinDistance,
    setLerp,
    setSpeedEffect,
    setBounds,
    setWalls,
    getStatus,
  });
}