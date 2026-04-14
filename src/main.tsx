import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import App from './App.tsx'
import { useAppStore } from './store/useAppStore'

// Load the mobile dev-tools console only in development builds.
// Dynamic import keeps eruda out of the production bundle entirely.
if (import.meta.env.DEV) {
  import('eruda').then(({ default: eruda }) => eruda.init());
}

const Root = () => {
  const initialize = useAppStore(state => state.initialize);
  
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
};

createRoot(document.getElementById('root')!).render(<Root />)
