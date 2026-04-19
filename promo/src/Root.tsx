import { Composition } from 'remotion';
import { Video, FPS, VIDEO_DURATION_FRAMES, WIDTH, HEIGHT } from './Video';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Tetris67Promo"
        component={Video}
        durationInFrames={VIDEO_DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
