import React from 'react';

const EnvironmentInfo = () => {
  const isElectron = () => {
    return typeof window !== 'undefined' && window.process && window.process.type;
  };

  const getEnvironmentInfo = () => {
    const info = {
      platform: 'Browser',
      userAgent: navigator.userAgent,
      hasGlobal: typeof global !== 'undefined',
      hasProcess: typeof process !== 'undefined',
      hasWindow: typeof window !== 'undefined',
      nodeEnv: process?.env?.NODE_ENV || 'undefined'
    };

    if (isElectron()) {
      info.platform = 'Electron';
      info.electronVersion = process.versions?.electron || 'unknown';
      info.nodeVersion = process.versions?.node || 'unknown';
    }

    return info;
  };

  const envInfo = getEnvironmentInfo();

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white text-xs p-3 rounded-lg max-w-xs">
      <div className="font-semibold mb-2">Environment Info</div>
      <div className="space-y-1">
        <div>Platform: {envInfo.platform}</div>
        <div>Global: {envInfo.hasGlobal ? '✅' : '❌'}</div>
        <div>Process: {envInfo.hasProcess ? '✅' : '❌'}</div>
        <div>Window: {envInfo.hasWindow ? '✅' : '❌'}</div>
        <div>NODE_ENV: {envInfo.nodeEnv}</div>
        {envInfo.electronVersion && (
          <div>Electron: {envInfo.electronVersion}</div>
        )}
      </div>
    </div>
  );
};

export default EnvironmentInfo;
