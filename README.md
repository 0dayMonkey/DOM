# Tetris 64

Un Tetris moderne qui s'ouvre comme un jeu Nintendo 64 de 1996. Entièrement en HTML/CSS/JS, sans canvas, sans WebGL — juste du DOM et du CSS 3D.

## 🎮 Lien vers le jeu hébergé

👉 **[Jouer à Tetris 64](https://tetris.teamcrouton.com/)** 

---

## 👥 Équipe

- **Naim** — 40%
- **Bilal** — 30%
- **Salima** — 30%

---

## 📖 Présentation du projet

Tetris 64 est une réinterprétation du jeu Tetris classique dans l'esthétique des jeux Nintendo 64 de la fin des années 90. Le joueur ne tombe pas directement sur la grille de jeu : il arrive sur un **écran titre arcade** avec le logo "TETRIS 67" (rouge métallique + doré incandescent), puis entre dans un **hub 3D style Mario 64** où il contrôle un petit personnage qui se promène dans un château. Chaque mode de jeu (Marathon, Sprint 40L, Zen) est accessible via un **tableau accroché au mur**, exactement comme dans Super Mario 64.

Une fois à l'intérieur d'un tableau, le jeu bascule sur une partie de Tetris classique avec toutes les mécaniques modernes :
- 7-bag randomizer
- Super Rotation System (SRS) avec wall kicks
- Détection des T-Spins (proper + mini)
- Back-to-Back, Combos, Perfect Clear
- Hold, Ghost piece, Lock delay
- Scoring guideline Tetris

---

## 🗂️ Structure du repository

```
tetris-64/
├── index.html                  # Point d'entrée HTML
├── package.json                # Dépendances (Vite + Vitest)
├── vite.config.js              # Config build
├── public/
│   └── maps/
│       └── hub-default.json    # Map par défaut du hub
├── mapcreator/
│   └── index.html              # Éditeur de map 2D top-down
├── src/
│   ├── main.js                 # Bootstrap du jeu
│   ├── core/                   # Moteur pur (sans DOM)
│   │   ├── game.js             # Moteur principal
│   │   ├── board.js            # Grille + collision
│   │   ├── piece.js            # Pièce active
│   │   ├── pieces.js           # Définitions des 7 tétrominos
│   │   ├── bag.js              # 7-bag randomizer
│   │   ├── srs.js              # Super Rotation System
│   │   ├── tspin.js            # Détection T-Spin
│   │   ├── scoring.js          # Calcul de score
│   │   └── constants.js        # Toutes les constantes
│   ├── scenes/                 # Orchestration des scènes
│   │   ├── sceneManager.js
│   │   ├── titleScene.js
│   │   ├── hubScene.js
│   │   ├── gameScene.js
│   │   └── transitions.js      # Transitions (fade, iris, tetris...)
│   ├── render/                 # Rendu DOM/CSS 3D
│   │   ├── boardRenderer.js
│   │   ├── pieceRenderer.js
│   │   ├── ghostRenderer.js
│   │   ├── hudRenderer.js
│   │   └── previewRenderer.js  # Next/Hold
│   ├── hub/                    # Scène hub 3D
│   │   ├── hubMap.js           # Construction de la salle
│   │   ├── player.js           # Personnage contrôlable
│   │   ├── paintings.js        # Tableaux interactifs
│   │   ├── thirdPersonCamera.js
│   │   └── followCamera.js
│   ├── camera/                 # Caméra virtuelle
│   │   ├── camera.js
│   │   ├── effects.js          # Shake, punch, tilt, flash
│   │   └── presets.js
│   ├── fx/                     # Effets visuels
│   │   ├── particles.js
│   │   ├── textPop.js          # "TETRIS!", "COMBO x3"...
│   │   ├── skybox.js
│   │   └── fog.js
│   ├── audio/
│   │   └── soundManager.js     # WebAudio + HTMLAudio
│   ├── input/
│   │   ├── keyboard.js         # DAS/ARR
│   │   ├── touch.js            # Gestes mobile
│   │   └── actionMap.js        # Keys → actions abstraites
│   ├── ui/
│   │   ├── screens.js          # Menus, pause, game over
│   │   └── storage.js          # Scores, préférences
│   ├── styles/                 # CSS tokens + modules
│   │   ├── tokens.css
│   │   ├── main.css
│   │   ├── scene3d.css
│   │   ├── board.css
│   │   ├── pieces.css
│   │   ├── hub.css
│   │   ├── character.css
│   │   ├── title.css
│   │   ├── ui.css
│   │   └── animations.css
│   └── utils/
│       ├── helpers.js
│       └── math3d.js
└── tests/                      # Tests Vitest
    ├── bag.test.js
    ├── scoring.test.js
    ├── srs.test.js
    └── tspin.test.js
```

---

## 🚀 Lancer le projet

```bash
npm install
npm run dev      # Lance en mode développement sur http://localhost:5173
npm run build    # Build de production dans /dist
npm test         # Lance les tests Vitest
```

---

## 🎯 Contrôles

**Dans le hub :**
- Flèches ← → : tourner
- Flèches ↑ ↓ : avancer / reculer
- Entrée : entrer dans un tableau

**En jeu :**
- ← → : déplacer
- ↓ : soft drop
- Espace : hard drop
- ↑ / X : rotation CW
- Z / Ctrl : rotation CCW
- A : rotation 180°
- C / Shift : hold
- Échap / P : pause
- M : mute

**Mobile :** tap = rotation, swipe ← → = déplacer, swipe ↓ = drop, swipe ↓ long = hard drop, long press = hold.

---

## 📝 Rapport de conception

### Pourquoi ce choix de jeu ?

On voulait faire un Tetris mais on savait qu'un Tetris "plat" en 2D serait banal. L'idée du wrapper Nintendo 64 est venue d'un constat simple : les jeux N64 de 1996 avaient une esthétique très reconnaissable (polygones peu nombreux, couleurs saturées, fog périphérique, skybox pastel) qu'on pouvait reproduire **entièrement en CSS 3D** sans avoir besoin de WebGL ou Three.js. Le défi technique nous a motivés.

Le choix de l'**intro façon Mario 64** (titre → hub → tableaux) donne au jeu une identité forte et permet d'introduire plusieurs modes de jeu sans avoir à faire un menu plat classique.

### Architecture générale

Le projet suit une séparation stricte entre **moteur pur** et **rendu** :

- `src/core/` contient toute la logique de Tetris (grille, pièces, collisions, rotations, scoring) sans aucune dépendance au DOM. Tout est testable en Node avec Vitest.
- `src/render/` prend un état de jeu et le transforme en DOM. Les renderers ne modifient jamais l'état du moteur.
- `src/scenes/` orchestre le cycle de vie (title → hub → game → game over) via un `sceneManager` qui gère les transitions.
- `src/camera/` simule une caméra en appliquant une transform CSS inverse sur le conteneur `#world`. Quand la caméra "avance", c'est le monde qui recule.

Cette séparation nous a permis de tester le moteur indépendamment du rendu et de changer le rendu visuel (debug, variations) sans toucher à la logique.

### La 3D sans canvas

Toute la 3D est faite avec `transform: translate3d()` + `rotateX/Y/Z()` + `perspective`. Chaque cube Tetris est un vrai cube CSS avec 6 faces. Les éclairages sont simulés avec des `linear-gradient` et `color-mix()` selon une source de lumière fictive en haut-gauche.

Le hub est une salle 3D avec un sol, un plafond, 4 murs et des tableaux accrochés. Tout est positionné avec des transforms 3D. La caméra suit le joueur en troisième personne (fixe derrière lui) avec un lerp pour adoucir les mouvements.

### Système d'inputs

On utilise un `actionMap` qui convertit les événements clavier/tactile en **actions abstraites** (`MOVE_LEFT`, `HARD_DROP`, `INTERACT`...). Chaque scène définit un "contexte" (`title`, `hub`, `game`, `menu`) qui filtre quelles actions sont autorisées. Ça évite les conflits quand plusieurs scènes tournent.

Le clavier gère lui-même le DAS (Delayed Auto Shift) et l'ARR (Auto Repeat Rate) pour que le gameplay corresponde aux standards Tetris modernes.

### Transitions signature

On a développé une transition **"tetris"** : lors du passage d'une scène à l'autre, l'écran se recouvre de tétrominos colorés qui tombent ligne par ligne, puis s'effacent façon "line clear" avec flash blanc pour révéler la nouvelle scène. C'est fait en pure CSS (keyframes) avec une grille dynamique générée en JS selon la résolution.

### Map Creator

On a fait un petit outil dans `/mapcreator/index.html` qui permet de dessiner la salle du hub en vue top-down (sol, murs, position des tableaux, spawn du joueur) et d'exporter en JSON. Le jeu charge automatiquement la map depuis `localStorage` ou `public/maps/hub-default.json`. Ça nous a permis d'itérer rapidement sur le level design sans toucher au code.

### Tests

Les parties critiques du moteur sont couvertes par des tests Vitest :
- `bag.test.js` : vérifie que le 7-bag distribue bien 7 pièces uniques par fenêtre
- `srs.test.js` : teste tous les wall kicks (JLSTZ, I, 180°)
- `tspin.test.js` : vérifie la détection proper/mini selon les 4 orientations du T
- `scoring.test.js` : valide le scoring guideline (B2B, combo, perfect clear, level up)

### Utilisation de l'IA

On a utilisé Claude (Anthropic) pour nous aider sur l'architecture et la génération de certains modules. Notre méthode : on définissait d'abord nous-mêmes les **spécifications** (types de données, API publique de chaque module, conventions de coordonnées), puis on demandait à l'IA de générer l'implémentation en respectant ces spécifications. Tout le code a ensuite été relu, testé, modifié et debuggé par nous. Les bugs non-triviaux (caméra qui traverse les murs, cubes fantômes au chargement, transitions qui laissent un fade noir parasite) ont été résolus à la main.

---

## 👤 Partie personnelle

### Naim (40%)
Pour ma part, j'ai piloté la majorité du projet, surtout tout ce qui touche à l'architecture de base et au moteur de jeu. Concrètement j'ai écrit la quasi-totalité du dossier `src/core/` : la grille, le 7-bag, le SRS avec les wall kicks, la détection des T-Spins et le scoring. C'est la partie où il fallait être le plus rigoureux parce qu'une erreur dans les tables de kicks ou dans le calcul du back-to-back se voit direct en jouant.

J'ai aussi mis en place le `sceneManager` et toute la logique de transitions entre les scènes, y compris la transition "tetris" qui est notre fierté, l'idée est venue en mindstorming mais c'est moi qui l'ai codée, et clairement c'est ce qui a pris le plus de temps parce qu'il fallait gérer précisément les timings, les reflows et éviter que l'overlay ne laisse un fade noir parasite à la fin (bug que j'ai dû traquer pendant une soirée entière).

Le gros morceau qui m'a posé problème c'était la caméra troisième personne dans le hub. Au début j'avais fait une `followCamera` avec raycast contre les murs pour éviter qu'elle traverse, mais c'était trop complexe et parfois elle partait dans tous les sens quand le joueur tournait vite. J'ai fini par tout refaire en `thirdPersonCamera` beaucoup plus simple, qui reste juste derrière le joueur sans collision, et comme les murs du hub forment une salle fermée de toute façon, ça marche très bien. Leçon retenue : parfois la solution simple bat la solution "propre".

J'ai aussi écrit tous les tests Vitest parce que c'est un aspect que j'aime bien et que je voulais être sûr que le moteur ne régresse pas quand on refactorisait. On a 4 fichiers de tests qui couvrent les parties les plus sensibles.

Ce que j'ai le plus aimé : toute la partie moteur pur, testable, sans DOM. C'est propre, c'est satisfaisant, et ça m'a vraiment aidé à comprendre comment un jeu peut être structuré pour rester maintenable !!!!

### Bilal (30%)

Sur ce projet je me suis principalement occupé de tout le côté visuel et effets, donc en gros le dossier `src/fx/` et une bonne partie des CSS (`tokens.css`, `pieces.css`, `animations.css`, `title.css`).

Ma plus grosse contribution c'est l'écran titre avec le logo "TETRIS 67" (six seven) en rouge métallique biseauté et le "67" doré incandescent. J'ai passé pluuusieurs jours juste sur les text-shadow pour obtenir l'effet chrome arcade de 1996. Pour les connaisseurs, je me suis inspiré des logos des bornes Sega / Atari de l'époque, avec les contours bleu néon sur les lettres rouges. Au final j'ai empilé une vingtaine de text-shadow en couches (liseré noir → contour chrome bleu → halo flou → ombre portée dure) et ça rend vraiment comme je voulais. 

La partie sur laquelles j'ai passé le plus de temps c'est les **cubes fantômes au chargement du titre**. En résumé, quand on arrivait sur l'écran titre, il y avait une frame où tous les tétrominos orbitants apparaissaient au centre avant d'aller sur leur orbite. Très moche. J'ai mis un moment à comprendre que c'était parce que je créais les slots dans le DOM avant que la première frame de `update()` ne soit appelée. La solution a été de calculer la position d'orbite directement à la création (avec `t=0`), de démarrer en `opacity: 0` et de révéler les cubes au premier `requestAnimationFrame`. Petit fix mais ça m'a bien pris la tête haha.

J'ai aussi fait le système de particules (burst, sparkle, confetti, dust, shard) avec un pool réutilisable pour éviter de recréer des DOM à chaque frame, et le système de text pops ("TETRIS!", "COMBO x3", "T-SPIN DOUBLE"). Tout ça branché sur les events du moteur de Naim <3.

Le choix de ce projet je l'ai bien apprécié parce que j'aime bien le CSS et les petits détails visuels. Faire du "fake 3D" avec juste des transforms c'est vraiment satisfaisant quand ça marche, et le résultat final a une personnalité très marquée.

### Salima (30%)

Sur ce projet, j'ai travaillé principalement sur la scène du hub, qui est à mon sens la partie la plus originale du projet, l'inspiration Super Mario 64 avec le château et les tableaux qui servent de portails vers les modes de jeu.

J'ai codé le personnage contrôlable (`player.js`) : la petite mascotte-cube avec son corps rouge, sa tête beige, ses yeux qui clignent, et surtout les **cheveux animés physiquement** dont je suis particulièrement contente xD. L'idée est que quand le joueur bouge ou tourne, les mèches de cheveux ont une petite inertie qui les fait traîner derrière, c'est calculé en projetant la vitesse du joueur dans son repère local puis en appliquant un lissage exponentiel. Le résultat donne vraiment de la vie au personnage et au jeu en général.

J'ai aussi réalisé les tableaux interactifs (`paintings.js`) avec leur cadre doré, leur halo qui s'allume à l'approche du joueur, et leur mini-preview de tétrominos qui tournent doucement. Et j'ai construit `hubMap.js` qui génère la salle 3D à partir d'un fichier JSON : sol en damier, murs, plafond, tapis, piliers optionnels, tableaux.

Ce qui m'a posé beaucoup (trop) de difficultés, c'est le **map creator**. Au départ je positionnais les tableaux à la main dans le code, avec des coordonnées en dur, et c'était insupportable à itérer, à chaque petit ajustement il fallait recompiler et relancer. J'ai donc développé un petit éditeur 2D top-down (`mapcreator/index.html`) qui permet de placer murs, tableaux et spawn du joueur à la souris, puis d'exporter en JSON. L'intégration a demandé du travail parce qu'il fallait gérer la cohérence entre les repères 2D de l'éditeur et les coordonnées 3D du jeu (axe Y inversé, origine au centre, angles en degrés vs radians).

Un autre bug qui m'a fait perdre du temps : les tableaux se téléportaient quand on s'en approchait à cause d'une animation CSS `painting-pulse` qui écrasait le `transform` inline que j'écrivais en JS pour positionner le tableau. La solution a été de déplacer l'animation sur un enfant (`.painting__frame`) au lieu du conteneur lui-même.

J'ai choisi de participer à ce projet parce que l'idée d'un Tetris "qui s'ouvre comme un jeu N64" m'a diiirectement plu. Les références Mario 64 sont volontaires et assumées^^, et je trouve que le résultat rend hommage à cette époque tout en proposant quelque chose de cohérent avec le gameplay Tetris (et parce que j'adore tetris aussi mais c ok).

---

## 📄 Licence

Projet académique — © 2026
