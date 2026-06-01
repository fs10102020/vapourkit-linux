import { useState, useEffect, useCallback } from 'react';
import type { SetupProgress, BackendCapabilities } from '../electron.d';
import { getErrorMessage } from '../types/errors';

export function useSetup(onLog: (message: string) => void) {
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isCheckingDeps, setIsCheckingDeps] = useState(true);
  const [backendCapabilities, setBackendCapabilities] = useState<BackendCapabilities | null>(null);
  const [setupProgress, setSetupProgress] = useState<SetupProgress | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [pluginInstallError, setPluginInstallError] = useState<string | null>(null);

  // Setup progress listener
  useEffect(() => {
    const unsubscribe = window.electronAPI.onSetupProgress((progress: SetupProgress) => {
      setSetupProgress(progress);
      onLog(`[Setup] ${progress.message} (${progress.progress}%)`);

      if (progress.type === 'error' && progress.component.startsWith('Plugins')) {
        // Plugin install error after the installer's internal auto-retry.
        // Keep isSettingUp false so the recovery buttons are enabled; surface
        // the error in dedicated state so SetupScreen renders the recovery UI.
        setPluginInstallError(progress.message);
        setIsSettingUp(false);
        return;
      }

      if (progress.type === 'complete' && progress.component === 'All Dependencies') {
        setIsSetupComplete(true);
        setIsSettingUp(false);
        setPluginInstallError(null);
      }
    });

    return unsubscribe;
  }, [onLog]);

  const refreshBackendCapabilities = useCallback(async (): Promise<BackendCapabilities | null> => {
    try {
      const capabilities = await window.electronAPI.getBackendCapabilities();
      setBackendCapabilities(capabilities);
      onLog(`Backend capabilities: ${capabilities.supportedBackends.join(', ')}, recommended: ${capabilities.recommendedBackend}`);
      return capabilities;
    } catch (error) {
      onLog(`Error refreshing backend capabilities: ${getErrorMessage(error)}`);
      return null;
    }
  }, [onLog]);

  const checkDependencies = useCallback(async (): Promise<void> => {
    setIsCheckingDeps(true);
    try {
      await refreshBackendCapabilities();

      const isComplete = await window.electronAPI.checkDependencies();
      setIsSetupComplete(isComplete);
      if (!isComplete) {
        onLog('Dependencies not found - setup required');
      } else {
        onLog('All dependencies present');
      }
    } catch (error) {
      onLog(`Error checking dependencies: ${getErrorMessage(error)}`);
    } finally {
      setIsCheckingDeps(false);
    }
  }, [onLog, refreshBackendCapabilities]);

  const handleSetup = async (): Promise<void> => {
    setIsSettingUp(true);
    setPluginInstallError(null);

    // Clear localStorage to prevent persistence issues from previous installations,
    // but preserve user preference keys.
    onLog('Clearing previous application data...');
    const keysToPreserve = ['inferenceBackend', 'numStreams', 'privacyMode', 'panelSizes'];
    const preserved: Record<string, string> = {};
    keysToPreserve.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) preserved[key] = value;
    });
    localStorage.clear();
    Object.entries(preserved).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });

    onLog('Starting dependency setup...');
    try {
      const result = await window.electronAPI.setupDependencies();

      // Refresh capabilities after setup completes so the main app sees post-setup state.
      if (result?.success) {
        await refreshBackendCapabilities();
        setPluginInstallError(null);
        setIsSettingUp(false);
        setIsSetupComplete(true);
      } else {
        if (result?.error) onLog(`Dependency setup failed: ${result.error}`);
        setIsSettingUp(false);
      }
    } catch (error) {
      onLog(`Dependency setup failed: ${getErrorMessage(error)}`);
      setIsSettingUp(false);
    }
  };

  const handleRetryPlugins = useCallback(async (): Promise<void> => {
    setIsSettingUp(true);
    setPluginInstallError(null);
    onLog('Retrying plugin install...');
    try {
      const result = await window.electronAPI.retrySetupPlugins();
      if (result.success) {
        await refreshBackendCapabilities();
        setPluginInstallError(null);
        setIsSettingUp(false);
        setIsSetupComplete(true);
      } else {
        if (result.error) onLog(`Plugin retry failed: ${result.error}`);
        setIsSettingUp(false);
      }
    } catch (error) {
      onLog(`Plugin retry failed: ${getErrorMessage(error)}`);
      setIsSettingUp(false);
    }
  }, [onLog, refreshBackendCapabilities]);

  const handleContinueWithoutPlugins = useCallback((): void => {
    onLog('User chose to continue without plugins - entering main app');
    setPluginInstallError(null);
    setIsSettingUp(false);
    setIsSetupComplete(true);
    // Fire-and-forget refresh so the main app eventually sees post-setup state;
    // do not block entry on a refresh failure.
    refreshBackendCapabilities();
  }, [onLog, refreshBackendCapabilities]);

  // Check dependencies on mount
  useEffect(() => {
    checkDependencies();
  }, [checkDependencies]);

  return {
    isSetupComplete,
    isCheckingDeps,
    backendCapabilities,
    setupProgress,
    isSettingUp,
    handleSetup,
    pluginInstallError,
    handleRetryPlugins,
    handleContinueWithoutPlugins,
  };
}
