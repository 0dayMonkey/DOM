import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { loadFont } from '@remotion/google-fonts/PressStart2P';

import { TitleScene } from './scenes/Title';
import { TaglineScene } from './scenes/Tagline';
import { HubClip } from './scenes/HubClip';
import { CreatorsScene } from './scenes/Creators';
import { ModesIntro } from './scenes/ModesIntro';
import { MarathonClip } from './scenes/MarathonClip';
import { SprintClip } from './scenes/SprintClip';
import { ZenClip } from './scenes/ZenClip';
import { MapCreatorIntro } from './scenes/MapCreatorIntro';
import { MapCreatorClip } from './scenes/MapCreatorClip';
import { TechSpecs } from './scenes/TechSpecs';
import { CTA } from './scenes/CTA';

loadFont();

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Chaque [from, duration] en frames (30 fps). Total = 3000f = 100s.
const TIMELINE = {
  title:        { from: 0,    duration: 180 },  // 0–6s
  tagline:      { from: 180,  duration: 120 },  // 6–10s
  hub:          { from: 300,  duration: 360 },  // 10–22s
  creators:     { from: 660,  duration: 120 },  // 22–26s
  modesIntro:   { from: 780,  duration: 60 },   // 26–28s
  marathon:     { from: 840,  duration: 360 },  // 28–40s
  sprint:       { from: 1200, duration: 300 },  // 40–50s
  zen:          { from: 1500, duration: 240 },  // 50–58s
  mapIntro:     { from: 1740, duration: 60 },   // 58–60s
  mapCreator:   { from: 1800, duration: 360 },  // 60–72s
  techSpecs:    { from: 2160, duration: 360 },  // 72–84s
  cta:          { from: 2520, duration: 480 },  // 84–100s
};

export const VIDEO_DURATION_FRAMES = 3000; // 100 secondes à 30 fps

export const Video: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Sequence from={TIMELINE.title.from} durationInFrames={TIMELINE.title.duration}>
        <TitleScene />
      </Sequence>

      <Sequence from={TIMELINE.tagline.from} durationInFrames={TIMELINE.tagline.duration}>
        <TaglineScene />
      </Sequence>

      <Sequence from={TIMELINE.hub.from} durationInFrames={TIMELINE.hub.duration}>
        <HubClip />
      </Sequence>

      <Sequence from={TIMELINE.creators.from} durationInFrames={TIMELINE.creators.duration}>
        <CreatorsScene />
      </Sequence>

      <Sequence from={TIMELINE.modesIntro.from} durationInFrames={TIMELINE.modesIntro.duration}>
        <ModesIntro />
      </Sequence>

      <Sequence from={TIMELINE.marathon.from} durationInFrames={TIMELINE.marathon.duration}>
        <MarathonClip />
      </Sequence>

      <Sequence from={TIMELINE.sprint.from} durationInFrames={TIMELINE.sprint.duration}>
        <SprintClip />
      </Sequence>

      <Sequence from={TIMELINE.zen.from} durationInFrames={TIMELINE.zen.duration}>
        <ZenClip />
      </Sequence>

      <Sequence from={TIMELINE.mapIntro.from} durationInFrames={TIMELINE.mapIntro.duration}>
        <MapCreatorIntro />
      </Sequence>

      <Sequence from={TIMELINE.mapCreator.from} durationInFrames={TIMELINE.mapCreator.duration}>
        <MapCreatorClip />
      </Sequence>

      <Sequence from={TIMELINE.techSpecs.from} durationInFrames={TIMELINE.techSpecs.duration}>
        <TechSpecs />
      </Sequence>

      <Sequence from={TIMELINE.cta.from} durationInFrames={TIMELINE.cta.duration}>
        <CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
