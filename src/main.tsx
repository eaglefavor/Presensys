import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppStore } from './store/useAppStore'

// Load the mobile dev-tools console so console output is visible in the browser.
import('eruda').then(({ default: eruda }) => eruda.init());

export const Root = () => {
  const initialize = useAppStore(state => state.initialize);
  
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <StrictMode>
      <ErrorBoundary>
      <App />
    </ErrorBoundary>
    </StrictMode>
  );
};

createRoot(document.getElementById('root')!).render(<Root />)
