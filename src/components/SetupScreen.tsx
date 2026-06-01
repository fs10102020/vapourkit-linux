import { memo, useMemo } from 'react';
import { Loader2, Download, XCircle, CheckCircle2 } from 'lucide-react';
import type { SetupProgress, BackendCapabilities } from '../electron.d';
import { Logo } from './Logo';

interface SetupScreenProps {
  isCheckingDeps: boolean;
  isSetupComplete: boolean;
  backendCapabilities: BackendCapabilities | null;
  setupProgress: SetupProgress | null;
  isSettingUp: boolean;
  onSetup: () => Promise<void>;
  pluginInstallError: string | null;
  onRetryPlugins: () => Promise<void>;
  onContinueWithoutPlugins: () => void;
}

interface SetupStep {
  id: string;
  name: string;
  description: string;
  componentPrefixes: string[];
}

function getSetupSteps(isLinuxPlatform: boolean, cudaAvailable: boolean): SetupStep[] {
  if (isLinuxPlatform) {
    return [
      { id: 'python', name: 'Python', description: 'Python 3 interpreter', componentPrefixes: ['Python'] },
      { id: 'python-venv', name: 'Python venv', description: 'Virtual environment', componentPrefixes: ['Python venv'] },
      { id: 'python-packages', name: 'Python Packages', description: 'Required Python packages', componentPrefixes: ['Python Packages', 'pip-'] },
      { id: 'ffmpeg', name: 'FFmpeg', description: 'Video encoding/decoding', componentPrefixes: ['FFmpeg'] },
      { id: 'vapoursynth', name: 'VapourSynth', description: 'Video processing framework', componentPrefixes: ['VapourSynth'] },
      { id: 'onnx', name: 'vs-mlrt ONNX Runtime', description: 'ONNX Runtime support', componentPrefixes: ['vs-mlrt ONNX Runtime', 'vs-mlrt'] },
      { id: 'models', name: 'ONNX Models', description: 'Bundled AI upscaling models', componentPrefixes: ['ONNX Models'] },
      { id: 'plugins', name: 'Plugins & Filters', description: 'PyTorch, vsjetpack, and VapourSynth plugins', componentPrefixes: ['Plugins'] },
    ];
  }

  const steps: SetupStep[] = [
    { id: 'vapoursynth', name: 'VapourSynth Portable R72', description: 'Video processing framework', componentPrefixes: ['VapourSynth R72', 'VapourSynth Portable'] },
    { id: 'bestsource', name: 'BestSource R13', description: 'Video source filter', componentPrefixes: ['BestSource R13', 'BestSource'] },
    { id: 'video-compare', name: 'Video Compare Tool', description: 'Side-by-side comparison viewer', componentPrefixes: ['Video Compare Tool'] },
    { id: 'onnx', name: 'vs-mlrt ONNX Runtime Plugin v15.13', description: 'ONNX Runtime support', componentPrefixes: ['vs-mlrt ONNX Runtime'] },
    { id: 'python', name: 'Python Embedded', description: 'Python runtime for VapourSynth', componentPrefixes: ['Python Embedded'] },
    { id: 'ffmpeg', name: 'FFmpeg', description: 'Video encoding/decoding', componentPrefixes: ['FFmpeg'] },
    { id: 'models', name: 'ONNX Models', description: 'Bundled AI upscaling models', componentPrefixes: ['ONNX Models'] },
    { id: 'plugins', name: 'Plugins & Filters', description: 'PyTorch, vsjetpack, and VapourSynth plugins', componentPrefixes: ['Plugins'] },
  ];

  if (cudaAvailable) {
    steps.splice(4, 0, {
      id: 'tensorrt',
      name: 'vs-mlrt TensorRT Plugin v15.13',
      description: 'AI inference engine (NVIDIA GPUs)',
      componentPrefixes: ['vs-mlrt TensorRT']
    });
  }

  return steps;
}

function getStepIconColor(stepId: string): string {
  switch (stepId) {
    case 'vapoursynth': return 'text-primary-blue';
    case 'tensorrt': return 'text-primary-purple';
    case 'onnx': return 'text-accent-cyan';
    case 'bestsource': return 'text-green-400';
    case 'video-compare': return 'text-yellow-400';
    case 'python': return 'text-orange-400';
    case 'python-venv': return 'text-orange-400';
    case 'python-packages': return 'text-orange-300';
    case 'models': return 'text-pink-400';
    case 'ffmpeg': return 'text-blue-400';
    case 'plugins': return 'text-primary-purple';
    default: return 'text-gray-400';
  }
}

export const SetupScreen = memo<SetupScreenProps>(({
  isCheckingDeps,
  isSetupComplete,
  backendCapabilities,
  setupProgress,
  isSettingUp,
  onSetup,
  pluginInstallError,
  onRetryPlugins,
  onContinueWithoutPlugins,
}: SetupScreenProps) => {
  const isLinuxPlatform = backendCapabilities?.platform === 'linux';
  const cudaAvailable = backendCapabilities?.cudaAvailable ?? false;

  const setupSteps = useMemo(
    () => getSetupSteps(isLinuxPlatform, cudaAvailable),
    [isLinuxPlatform, cudaAvailable]
  );

  // Track which steps are completed, in progress, or pending
  const stepStatuses = useMemo(() => {
    if (!setupProgress || !isSettingUp) {
      return setupSteps.reduce((acc, step) => {
        acc[step.id] = 'pending';
        return acc;
      }, {} as Record<string, 'pending' | 'in-progress' | 'completed'>);
    }

    const statuses: Record<string, 'pending' | 'in-progress' | 'completed'> = {};
    const currentComponent = setupProgress.component;

    // Check if all setup is complete (not just one component)
    const isFullyComplete = setupProgress.type === 'complete' && setupProgress.component === 'All Dependencies';

    if (isFullyComplete) {
      // Mark all steps as completed
      setupSteps.forEach(step => {
        statuses[step.id] = 'completed';
      });
      return statuses;
    }

    // Find the index of the current component using prefix matching
    const currentIndex = setupSteps.findIndex(step =>
      step.componentPrefixes.some(prefix => currentComponent.startsWith(prefix))
    );

    for (let i = 0; i < setupSteps.length; i++) {
      const step = setupSteps[i];

      if (i < currentIndex) {
        // Steps before current are completed
        statuses[step.id] = 'completed';
      } else if (i === currentIndex) {
        // Current step is in progress (unless it just completed)
        statuses[step.id] = setupProgress.type === 'complete' ? 'completed' : 'in-progress';
      } else {
        // Steps after current are pending
        statuses[step.id] = 'pending';
      }
    }

    // If current component wasn't found, mark all as pending
    if (currentIndex === -1) {
      setupSteps.forEach(step => {
        statuses[step.id] = 'pending';
      });
    }

    return statuses;
  }, [setupProgress, setupSteps, isSettingUp]);

  // Checking dependencies screen
  if (isCheckingDeps) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-purple animate-spin mx-auto mb-4" />
          <p className="text-lg text-gray-300">Checking dependencies...</p>
        </div>
      </div>
    );
  }

  // Setup required screen
  if (!isSetupComplete) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Logo className="w-6 h-6" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-blue via-primary-purple to-accent-cyan bg-clip-text text-transparent">
                Vapourkit
              </h1>
            </div>
            <p className="text-gray-400">First-time setup required</p>
          </div>

          {/* Main Card */}
          <div className="bg-dark-elevated rounded-xl p-6 border border-gray-800">
            <h2 className="text-lg font-semibold mb-2">Download Required Components</h2>
            <p className="text-gray-400 text-sm mb-4">
              {isLinuxPlatform
                ? 'The following system dependencies and app-managed components will be checked or installed:'
                : "The following components will be downloaded and installed to the application's data folder:"}
            </p>

            {/* Component List */}
            <div className="space-y-2 mb-6">
              {setupSteps.map((step) => {
                const status = stepStatuses[step.id];
                const isCurrentStep = step.componentPrefixes.some(prefix =>
                  setupProgress?.component.startsWith(prefix) ?? false
                );

                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      status === 'completed' ? 'bg-green-500/10 border border-green-500/20' :
                      status === 'in-progress' ? 'bg-dark-surface border border-primary-purple/50' :
                      'bg-dark-surface border border-transparent'
                    }`}
                  >
                    {/* Status Icon */}
                    {status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : status === 'in-progress' ? (
                      <Loader2 className="w-5 h-5 text-primary-purple animate-spin flex-shrink-0" />
                    ) : (
                      <Download className={`w-5 h-5 flex-shrink-0 ${getStepIconColor(step.id)}`} />
                    )}

                    {/* Name & Progress */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${
                            status === 'completed' ? 'text-green-300' :
                            status === 'in-progress' ? 'text-white' :
                            'text-gray-300'
                          }`}>
                            {step.name}
                          </p>
                          <p className="text-sm text-gray-500">{step.description}</p>
                        </div>
                        {status === 'completed' && (
                          <span className="text-xs text-green-400 ml-3 flex-shrink-0">Done</span>
                        )}
                        {status === 'in-progress' && isCurrentStep && setupProgress && (
                          <span className="text-xs text-primary-purple font-medium ml-3 flex-shrink-0">
                            {Math.round(setupProgress.progress)}%
                          </span>
                        )}
                      </div>

                      {/* Progress bar for current step */}
                      {status === 'in-progress' && isCurrentStep && setupProgress && (
                        <div className="mt-1.5 h-1 bg-dark-bg rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary-blue to-primary-purple transition-all duration-300"
                            style={{ width: `${setupProgress.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Error Message */}
            {setupProgress?.type === 'error' && !pluginInstallError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {setupProgress.message}
                </p>
              </div>
            )}

            {/* Plugin install error with recovery options */}
            {pluginInstallError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-3">
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  Plugin install failed: {pluginInstallError}
                </p>
                <p className="text-gray-400 text-xs">
                  You can retry now, or continue without plugins and install them later from the Plugins menu.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onRetryPlugins}
                    disabled={isSettingUp}
                    className="flex-1 bg-gradient-to-r from-primary-blue to-primary-purple hover:from-blue-600 hover:to-purple-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-all duration-200"
                  >
                    Retry plugins
                  </button>
                  <button
                    onClick={onContinueWithoutPlugins}
                    disabled={isSettingUp}
                    className="flex-1 bg-dark-surface hover:bg-gray-700 disabled:bg-dark-surface disabled:cursor-not-allowed text-gray-200 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Continue without plugins
                  </button>
                </div>
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={onSetup}
              disabled={isSettingUp}
              className="w-full bg-gradient-to-r from-primary-blue to-primary-purple hover:from-blue-600 hover:to-purple-600 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isSettingUp ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Start Setup
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
});
