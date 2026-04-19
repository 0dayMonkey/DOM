import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GAME_GRADIENT, N64, PIXEL_FONT } from '../theme';

export const TaglineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entrance = spring({ frame, fps, config: { damping: 18 } });
  const highlight = spring({ frame: frame - 20, fps, config: { damping: 22 } });

  const exitOpacity = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const y = interpolate(entrance, [0, 1], [60, 0]);

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
            fontSize: 64,
            color: N64.cream,
            letterSpacing: 4,
            textAlign: 'center',
            lineHeight: 1.6,
            transform: `translateY(${y}px)`,
            opacity: entrance,
            textShadow: '4px 4px 0 rgba(0,0,0,0.4)',
          }}
        >
          ON LE FAISAIT SUR <span style={{ color: N64.red }}>64</span>,
          <br />
          ON LE FERA EN{' '}
          <span
            style={{
              color: N64.yellow,
              textShadow: `0 0 40px ${N64.yellow}, 4px 4px 0 rgba(0,0,0,0.4)`,
              transform: `scale(${interpolate(highlight, [0, 1], [1, 1.15])})`,
              display: 'inline-block',
            }}
          >
            67
          </span>
          .
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
