import React from 'react';
import { offlineDetector } from './offlineDetector';

/**
 * React hook for offline detection
 */
export const useOfflineDetection = () => {
  const [isOnline, setIsOnline] = React.useState(offlineDetector.isOnline);

  React.useEffect(() => {
    const removeListener = offlineDetector.addListener((status, online) => {
      setIsOnline(online);
    });

    return removeListener;
  }, []);

  return isOnline;
};