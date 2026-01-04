import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error: any) {
      console.log('SW Registration Error', error);
    },
  });

  const close = () => setNeedRefresh(false);

  if (!needRefresh) return null;

  return (
    <div className="position-fixed bottom-0 start-50 translate-middle-x mb-4 z-index-toast p-3" style={{ zIndex: 10000, minWidth: '300px' }}>
      <div className="card border-0 shadow-lg bg-dark text-white rounded-4 overflow-hidden">
        <div className="card-body p-3 d-flex align-items-center gap-3">
          <div className="bg-primary rounded-circle p-2 animate-spin">
            <RefreshCw size={20} />
          </div>
          <div className="flex-grow-1">
            <h6 className="fw-bold mb-0 text-white small">Update Available</h6>
            <p className="xx-small text-white-50 mb-0">New features ready.</p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3" onClick={() => updateServiceWorker(true)}>
              Update
            </button>
            <button className="btn btn-link text-white-50 p-1" onClick={close}>
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .animate-spin { animation: spin 2s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
