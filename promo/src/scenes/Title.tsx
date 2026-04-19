import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GAME_GRADIENT, N64, PIXEL_FONT } from '../theme';

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const appear = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const scale = interpolate(appear, [0, 1], [0.6, 1]);
  const opacity = interpolate(appear, [0, 1], [0, 1]);

  const sub = spring({ frame: frame - 25, fps, config: { damping: 20 } });

  const exitStart = durationInFrames - 20;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
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
          opacity: exitOpacity,
        }}
      >
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 28,
            color: N64.cream,
            letterSpacing: 6,
            marginBottom: 40,
            opacity,
          }}
        >
          © 67 PRODUCTION
        </div>

        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 200,
            color: N64.navy,
            letterSpacing: 12,
            textShadow: `6px 6px 0 ${N64.cream}, 12px 12px 0 rgba(0,0,0,0.35)`,
            transform: `scale(${scale})`,
            opacity,
          }}
        >
          TETRIS
        </div>

        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 180,
            color: N64.navy,
            letterSpacing: 8,
            textShadow: `0 0 40px ${N64.yellow}, 6px 6px 0 ${N64.cream}, 12px 12px 0 rgba(0,0,0,0.35)`,
            transform: `scale(${scale})`,
            opacity,
          }}
        >
          67
        </div>

        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 26,
            color: N64.cream,
            letterSpacing: 5,
            marginTop: 40,
            opacity: sub,
          }}
        >
          UN JEU ARCADE DE 1996
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
