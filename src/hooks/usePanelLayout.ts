import { useState, useEffect, useCallback } from 'react';
import { getErrorMessage } from '../types/errors';

interface PanelSizes {
  leftPanel: number;
  rightPanel: number;
  queuePanel?: number;
}

export function usePanelLayout(isSetupComplete: boolean, onLog: (message: string) => void) {
  const [panelSizes, setPanelSizes] = useState<PanelSizes>({ leftPanel: 60, rightPanel: 40, queuePanel: 25 });
  const [panelSizesLoaded, setPanelSizesLoaded] = useState(false);

  // Load panel sizes from backend
  useEffect(() => {
    const loadPanelSizes = async () => {
      try {
        const sizes = await window.electronAPI.getPanelSizes();
        setPanelSizes({
          leftPanel: sizes.leftPanel || 60,
          rightPanel: sizes.rightPanel || 40,
          queuePanel: sizes.queuePanel || 25
        });
        setPanelSizesLoaded(true);
      } catch (error) {
        onLog(`Error loading panel sizes: ${getErrorMessage(error)}`);
        setPanelSizesLoaded(true); // Still mark as loaded even on error
      }
    };

    if (isSetupComplete) {
      loadPanelSizes();
    }
  }, [isSetupComplete, onLog]);

  // Save panel sizes when they change (with debouncing)
  useEffect(() => {
    if (!panelSizesLoaded) return;

    const timeoutId = setTimeout(async () => {
      try {
        await window.electronAPI.setPanelSizes(panelSizes);
      } catch (error) {
        onLog(`Error saving panel sizes: ${getErrorMessage(error)}`);
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [panelSizes, panelSizesLoaded, onLog]);

  const handlePanelResize = useCallback((sizes: number[]) => {
    setPanelSizes(prev => {
      if (sizes.length === 3) {
        const [leftPanel, rightPanel, queuePanel] = sizes;
        return { leftPanel, rightPanel, queuePanel };
      } else if (sizes.length === 2) {
        const [leftPanel, rightPanel] = sizes;
        return { 
          leftPanel, 
          rightPanel, 
          queuePanel: prev.queuePanel || 25 
        };
      }
      return prev;
    });
  }, []);

  return {
    panelSizes,
    panelSizesLoaded,
    handlePanelResize,
  };
}
