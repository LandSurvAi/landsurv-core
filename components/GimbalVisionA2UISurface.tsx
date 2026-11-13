import React from 'react';
import SurveyorsEyePanel from './SurveyorsEyePanel.tsx';

export const GIMBAL_VISION_SURFACE_KEY = 'gimbal-vision';

/**
 * Standard A2UI presentation of Surveyors Eye. The panel reads the live store,
 * so scans, pass-2 frames, road findings, QA, and acceptance update in place.
 */
export const GimbalVisionA2UISurface: React.FC<{
  presentation?: 'inline' | 'floating' | 'docked';
}> = ({ presentation = 'floating' }) => (
  <SurveyorsEyePanel showTitle={presentation === 'docked'} />
);

export default GimbalVisionA2UISurface;
