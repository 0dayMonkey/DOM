import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { GAME_GRADIENT, N64, PIXEL_FONT } from '../theme';

export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const intro = spring({ frame, fps, config: { damping: 14 } });
  const title = spring({ frame: frame - 15, fps, config: { damping: 14 } });
  const url = spring({ frame: frame - 45, fps, config: { damping: 16 } });
  const tag = spring({ frame: frame - 80, fps, config: { damping: 18 } });

  // Pulse discret sur l'URL après son apparition.
  const pulse = 1 + 0.03 * Math.sin((frame - 60) * 0.15);

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
          gap: 50,
          opacity: exit,
        }}
      >
        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 40,
            color: N64.cream,
            letterSpacing: 8,
            opacity: intro,
            transform: `translateY(${interpolate(intro, [0, 1], [-30, 0])}px)`,
          }}
        >
          DISPONIBLE MAINTENANT
        </div>

        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 130,
            color: N64.navy,
            letterSpacing: 8,
            textShadow: `5px 5px 0 ${N64.cream}, 10px 10px 0 rgba(0,0,0,0.35)`,
            transform: `scale(${interpolate(title, [0, 1], [0.6, 1])})`,
            opacity: title,
          }}
        >
          TETRIS 67
        </div>

        <div
          style={{
            background: N64.navy,
            border: `6px solid ${N64.yellow}`,
            padding: '30px 60px',
            fontFamily: PIXEL_FONT,
            fontSize: 56,
            color: N64.yellow,
            letterSpacing: 4,
            boxShadow: '8px 8px 0 rgba(0,0,0,0.4)',
            transform: `scale(${url * pulse})`,
            opacity: url,
          }}
        >
          TETRIS.TEAMCROUTON.COM
        </div>

        <div
          style={{
            fontFamily: PIXEL_FONT,
            fontSize: 28,
            color: N64.cream,
            letterSpacing: 5,
            marginTop: 20,
            opacity: tag,
          }}
        >
          GRATUIT · BÊTA · JOUABLE SUR NAVIGATEUR
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
