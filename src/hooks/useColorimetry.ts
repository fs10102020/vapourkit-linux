import { useState, useEffect } from 'react';
import type { ColorimetrySettings } from '../electron.d';
import { getErrorMessage } from '../types/errors';

export function useColorimetry(isSetupComplete: boolean, onLog: (message: string) => void) {
  const [colorimetrySettings, setColorimetrySettings] = useState<ColorimetrySettings>({
    overwriteMatrix: false,
    matrix709: false,
    defaultMatrix: '709',
    defaultPrimaries: '709',
    defaultTransfer: '709'
  });

  // Load colorimetry settings
  useEffect(() => {
    const loadColorimetrySettings = async () => {
      try {
        const settings = await window.electronAPI.getColorimetrySettings();
        setColorimetrySettings(settings);
        onLog('Colorimetry settings loaded');
      } catch (error) {
        onLog(`Error loading colorimetry settings: ${getErrorMessage(error)}`);
      }
    };

    if (isSetupComplete) {
      loadColorimetrySettings();
    }
  }, [isSetupComplete, onLog]);

  const handleColorimetryChange = async (settings: ColorimetrySettings) => {
    setColorimetrySettings(settings);
    try {
      await window.electronAPI.setColorimetrySettings(settings);
      onLog(`Colorimetry settings updated: ${settings.overwriteMatrix ? (settings.matrix709 ? 'BT.709' : 'BT.601') : 'disabled'}`);
    } catch (error) {
      onLog(`Error saving colorimetry settings: ${getErrorMessage(error)}`);
    }
  };

  return {
    colorimetrySettings,
    handleColorimetryChange,
  };
}
