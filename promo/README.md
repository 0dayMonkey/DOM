# Tetris 67 — Vidéo promotionnelle (Remotion)

Vidéo de présentation **1920×1080, 30 fps, 100 secondes** pour le jury.

## Structure de la vidéo

| # | Section | Durée | Source |
|---|---|---|---|
| 1 | Écran titre | 6s | Remotion (animé) |
| 2 | Tagline « On le faisait sur 64… » | 4s | Remotion |
| 3 | Hub 3D | 12s | `public/clips/02-hub.webm` |
| 4 | Créateurs (Salima / Bilal / Naïm) | 4s | Remotion |
| 5 | Intro « 3 MODES » | 2s | Remotion |
| 6 | Gameplay Marathon | 12s | `public/clips/03-marathon.webm` |
| 7 | Gameplay Sprint 40L | 10s | `public/clips/04-sprint.webm` |
| 8 | Gameplay Zen | 8s | `public/clips/05-zen.webm` |
| 9 | Intro Map Creator | 2s | Remotion |
| 10 | Map Creator | 12s | `public/clips/06-mapcreator.webm` |
| 11 | Specs techniques | 12s | Remotion |
| 12 | CTA final (URL) | 16s | Remotion |

**Total : 100 s**

## 1. Installer les dépendances

```bash
cd promo
npm install
```

## 2. Filmer les clips

Voir `public/clips/INSTRUCTIONS.txt` — il liste chaque clip (nom de fichier,
durée à filmer, ce qu'il faut montrer). Dépose-les ensuite dans
`public/clips/`.

## 3. Prévisualiser

```bash
npm start
```

Ouvre `http://localhost:3000` (Remotion Studio). Tu peux scrubber la
timeline, modifier les textes, re-rendre en live.

## 4. Rendre la vidéo finale

```bash
npm run build
```

Le MP4 final sort dans `out/tetris67-promo.mp4`.

Pour un rendu personnalisé :

```bash
npx remotion render Tetris67Promo out/tetris67-promo.mp4 --codec=h264 --crf=18
```

## Palette

Couleurs Nintendo 64 (voir `src/theme.ts`) sur le dégradé signature
violet → orange du jeu.

## Polices

`Press Start 2P` chargée automatiquement via `@remotion/google-fonts`.
