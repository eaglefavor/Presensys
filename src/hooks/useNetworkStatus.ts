import { useState, useEffect } from 'react';

interface NavigatorWithConnection extends Navigator {
  connection?: {
    effectiveType: string;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };
  mozConnection?: unknown;
  webkitConnection?: unknown;
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check connection speed if available
    const nav = navigator as unknown as NavigatorWithConnection;
    const connection = nav.connection || (nav.mozConnection as typeof nav.connection) || (nav.webkitConnection as typeof nav.connection);
    if (connection && typeof connection.addEventListener === 'function') {
      const updateConnectionStatus = () => {
        if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') {
          setIsSlow(true);
        } else {
          setIsSlow(false);
        }
      };

      connection.addEventListener('change', updateConnectionStatus);
      updateConnectionStatus();

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        connection.removeEventListener('change', updateConnectionStatus);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isSlow };
}
