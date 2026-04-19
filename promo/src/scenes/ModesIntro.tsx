import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GAME_GRADIENT, N64, PIXEL_FONT } from '../theme';

export const ModesIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.5 } });
  const scale = interpolate(pop, [0, 1], [0.4, 1]);
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
          opacity: exit,
        }}
      >
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 120,
            color: N64.yellow,
            letterSpacing: 10,
            transform: `scale(${scale})`,
            textShadow: `6px 6px 0 ${N64.navy}, 0 0 50px ${N64.yellow}`,
          }}
        >
          3 MODES
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
