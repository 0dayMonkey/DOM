import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GAME_GRADIENT, N64, PIXEL_FONT } from '../theme';

type Spec = { label: string; value: string; color: string };

const SPECS: Spec[] = [
  { label: 'RENDU', value: '100% DOM', color: N64.red },
  { label: 'MOTEUR', value: 'CSS 3D', color: N64.blue },
  { label: 'CANVAS', value: 'ZERO', color: N64.yellow },
  { label: 'HUB', value: '3D TEMPS-RÉEL', color: N64.green },
];

export const TechSpecs: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const header = spring({ frame, fps, config: { damping: 20 } });

  const exit = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
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
          gap: 50,
        }}
      >
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 56,
            color: N64.cream,
            letterSpacing: 6,
            opacity: header,
            transform: `translateY(${interpolate(header, [0, 1], [-30, 0])}px)`,
            marginBottom: 30,
            textShadow: '4px 4px 0 rgba(0,0,0,0.4)',
          }}
        >
          SOUS LE CAPOT
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 40,
            width: 1400,
          }}
        >
          {SPECS.map((spec, i) => {
            const cardFrame = frame - 20 - i * 14;
            const appear = spring({ frame: cardFrame, fps, config: { damping: 15 } });
            return (
              <div
                key={spec.label}
                style={{
                  background: N64.navy,
                  border: `6px solid ${spec.color}`,
                  padding: '36px 48px',
                  boxShadow: '8px 8px 0 rgba(0,0,0,0.4)',
                  transform: `scale(${interpolate(appear, [0, 1], [0.6, 1])})`,
                  opacity: appear,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: PIXEL_FONT,
                    fontSize: 22,
                    color: N64.muted,
                    letterSpacing: 4,
                  }}
                >
                  {spec.label}
                </div>
                <div
                  style={{
                    fontFamily: PIXEL_FONT,
                    fontSize: 48,
                    color: spec.color,
                    letterSpacing: 3,
                  }}
                >
                  {spec.value}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
