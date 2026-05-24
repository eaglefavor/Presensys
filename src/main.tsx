import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppStore } from './store/useAppStore'
import { useAppModeStore } from './store/useAppModeStore'

// Load the mobile dev-tools console so console output is visible in the browser.
import('eruda').then(({ default: eruda }) => eruda.init());

export const Root = () => {
  const initialize = useAppStore(state => state.initialize);
  const initializeAppMode = useAppModeStore(state => state.initialize);
  
  useEffect(() => {
    initialize();
    // Initialize app mode detection to set data-app-mode attribute and listen for changes
    initializeAppMode();
  }, [initialize, initializeAppMode]);

  return (
    <StrictMode>
      <ErrorBoundary>
      <App />
    </ErrorBoundary>
    </StrictMode>
  );
};

createRoot(document.getElementById('root')!).render(<Root />)
