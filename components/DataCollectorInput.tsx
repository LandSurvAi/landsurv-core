
import React from 'react';
import { CrosshairsIcon } from './icons';
import { UploadShell, UploadActionBar, UploadPrimaryButton } from './UploadShell.tsx';

interface DataCollectorInputProps {
  onSessionStart: () => void;
  onGoBack: () => void;
}

const DataCollectorInput: React.FC<DataCollectorInputProps> = ({ onSessionStart, onGoBack }) => {
  return (
    <UploadShell
      icon={CrosshairsIcon}
      accent="#60a5fa"
      title="GPS Rover"
      description="Use this device's GPS for stakeout and topographic survey. Collected points are transformed into your project's coordinate system by the agent."
      onGoBack={onGoBack}
      backTitle="Go to Home Screen"
    >
      <UploadActionBar note="Best on a phone or tablet outdoors with a clear sky view.">
        <UploadPrimaryButton onClick={onSessionStart}>Start GPS session</UploadPrimaryButton>
      </UploadActionBar>
    </UploadShell>
  );
};

export default DataCollectorInput;