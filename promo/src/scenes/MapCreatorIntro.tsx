import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GAME_GRADIENT, N64, PIXEL_FONT } from '../theme';

export const MapCreatorIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.5 } });
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: GAME_GRADIENT }}>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          opacity: exit,
        }}
      >
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 40,
            color: N64.cream,
            letterSpacing: 6,
            marginBottom: 20,
            opacity: pop,
          }}
        >
          ET EN BONUS
        </div>
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 90,
            color: N64.yellow,
            letterSpacing: 6,
            transform: `scale(${interpolate(pop, [0, 1], [0.5, 1])})`,
            textShadow: `5px 5px 0 ${N64.navy}`,
          }}
        >
          UN ÉDITEUR DE HUB
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
