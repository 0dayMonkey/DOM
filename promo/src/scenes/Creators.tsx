import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GAME_GRADIENT, N64, PIXEL_FONT } from '../theme';

const NAMES = ['SALIMA', 'BILAL', 'NAÏM'];

export const CreatorsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const header = spring({ frame, fps, config: { damping: 18 } });

  const exit = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
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
            letterSpacing: 8,
            marginBottom: 60,
            opacity: header,
            transform: `translateY(${interpolate(header, [0, 1], [-30, 0])}px)`,
          }}
        >
          UN PROJET DE
        </div>

        <div style={{ display: 'flex', gap: 80 }}>
          {NAMES.map((name, i) => {
            const appear = spring({
              frame: frame - 15 - i * 10,
              fps,
              config: { damping: 16 },
            });
            return (
              <div
                key={name}
                style={{
                  fontFamily: PIXEL_FONT,
                  fontSize: 72,
                  color: [N64.red, N64.yellow, N64.green][i],
                  letterSpacing: 4,
                  opacity: appear,
                  transform: `scale(${interpolate(appear, [0, 1], [0.5, 1])})`,
                  textShadow: '5px 5px 0 rgba(0,0,0,0.5)',
                }}
              >
                {name}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
