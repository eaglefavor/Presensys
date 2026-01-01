import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import App from './App.tsx'
import { useAppStore } from './store/useAppStore'

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
