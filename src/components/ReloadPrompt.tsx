import { useRegisterSW } from 'virtual:pwa-register/react';
import { X, DownloadCloud } from 'lucide-react';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered');
      // Check for updates every 5 minutes if online
      r && setInterval(() => {
        if (navigator.onLine) {
          console.log('Checking for SW update...');
          r.update().catch(e => console.log('SW update failed:', e));
        }
      }, 5 * 60 * 1000);
    },
    onRegisterError(error) {
      console.log('SW Registration Error', error);
    },
  });

  const close = () => setNeedRefresh(false);

  if (!needRefresh) return null;

  return (
    <div className="position-fixed bottom-0 start-50 translate-middle-x mb-4 z-index-toast p-3" style={{ zIndex: 10000, minWidth: '320px', maxWidth: '90%' }}>
      <div className="card border-0 shadow-lg bg-dark text-white rounded-4 overflow-hidden">
        <div className="card-body p-3 d-flex align-items-center gap-3">
          <div className="bg-primary rounded-circle p-2 animate-bounce-custom">
            <DownloadCloud size={20} />
          </div>
          <div className="flex-grow-1">
            <h6 className="fw-bold mb-0 text-white small">Update Available</h6>
            <p className="xx-small text-white-50 mb-0">Tap to load the latest version.</p>
          </div>
          <div className="d-flex gap-2 align-items-center">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 py-2" onClick={() => updateServiceWorker(true)}>
              Update
            </button>
            <button className="btn btn-link text-white-50 p-1" onClick={close}>
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .animate-bounce-custom { animation: bounce 2s infinite; }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
