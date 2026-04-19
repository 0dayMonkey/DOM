import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { N64, PIXEL_FONT } from '../theme';

type Props = {
  src: string;          // ex: 'clips/02-hub.webm'
  label?: string;       // petit badge en haut (ex: 'HUB 3D')
  caption?: string;     // ligne en bas (ex: 'Déplace-toi entre les modes')
  startFrom?: number;   // frame de départ dans le clip source (si trimming)
};

export const ClipPlayer: React.FC<Props> = ({ src, label, caption, startFrom = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const alpha = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ background: '#000', opacity: alpha }}>
      <OffthreadVideo
        src={staticFile(src)}
        startFrom={startFrom}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {label && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 40,
            padding: '14px 24px',
            background: N64.navy,
            border: `4px solid ${N64.yellow}`,
            fontFamily: PIXEL_FONT,
            fontSize: 26,
            color: N64.yellow,
            letterSpacing: 4,
            boxShadow: '6px 6px 0 rgba(0,0,0,0.4)',
          }}
        >
          {label}
        </div>
      )}

      {caption && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: PIXEL_FONT,
            fontSize: 32,
            color: N64.cream,
            letterSpacing: 3,
            textShadow: '3px 3px 0 rgba(0,0,0,0.7)',
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
};
