import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import {RootExperience} from './RootExperience.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <MotionConfig reducedMotion="user">
    <RootExperience />
  </MotionConfig>,
);
