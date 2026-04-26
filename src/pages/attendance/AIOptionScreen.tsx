import { Camera, MousePointerClick, Zap, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

interface Props {
  onCancel: () => void;
  onSelectManual: () => void;
  onSelectAI: () => void;
}

export default function AIOptionScreen({ onCancel, onSelectManual, onSelectAI }: Props) {
  const { isOnline, isSlow } = useNetworkStatus();

  return (
    <div className="d-flex flex-column h-100 bg-white">
      {/* Header */}
      <div className="bg-white sticky-top z-10 border-bottom border-light">
        <div className="d-flex align-items-center justify-content-between p-3">
          <button
            className="btn btn-light rounded-circle p-2 border-0"
            onClick={onCancel}
          >
            <ArrowLeft size={24} />
          </button>
          <div className="text-center flex-grow-1 pe-4">
            <h1 className="h6 fw-black mb-0 text-dark text-uppercase letter-spacing-n1">
              Choose Method
            </h1>
          </div>
        </div>
      </div>

      <div className="p-4 d-flex flex-column gap-4 container-mobile mx-auto flex-grow-1">
        <p className="text-muted small text-center mb-4">
          How would you like to mark attendance for this session?
        </p>

        {/* Manual Mode Option */}
        <button
          className="btn btn-outline-primary p-4 rounded-4 text-start d-flex flex-column gap-3 hover-shadow transition-all"
          onClick={onSelectManual}
        >
          <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-circle align-self-start">
            <MousePointerClick size={32} />
          </div>
          <div>
            <h3 className="h5 fw-bold mb-1">Manual Mode: Toggle to Mark</h3>
            <p className="text-muted small mb-0">
              Go through the list of enrolled students and manually mark them as present, absent, or excused.
            </p>
          </div>
        </button>

        {/* AI Mode Option */}
        <div className="position-relative">
          <button
            className={`btn ${!isOnline ? 'btn-outline-secondary' : 'btn-outline-primary border-2'} p-4 rounded-4 text-start d-flex flex-column gap-3 w-100 hover-shadow transition-all`}
            onClick={() => {
              if (isOnline) {
                if (isSlow) {
                  alert("Network seems slow. Upload may take longer than usual.");
                }
                onSelectAI();
              }
            }}
            disabled={!isOnline}
          >
            <div className="d-flex justify-content-between align-items-center w-100">
              <div className="bg-warning bg-opacity-10 text-warning p-3 rounded-circle">
                <Camera size={32} />
              </div>
              <div className="bg-primary text-white text-uppercase px-2 py-1 rounded-2 fw-bold" style={{ fontSize: '10px', letterSpacing: '1px' }}>
                <Zap size={10} className="me-1 mb-1" />
                AI Powered
              </div>
            </div>
            <div>
              <h3 className="h5 fw-bold mb-1">Snap to Mark</h3>
              <p className="text-muted small mb-0">
                Take a photo of the attendance sheet. Our AI will extract the registration numbers and automatically match them.
              </p>
            </div>
          </button>

          {/* Network Warning */}
          {!isOnline && (
            <div className="position-absolute bottom-0 start-50 translate-middle-x mb-2 w-100 text-center pointer-events-none">
              <div className="badge bg-danger bg-opacity-10 text-danger border border-danger p-2 rounded-pill d-inline-flex align-items-center gap-1 shadow-sm">
                <AlertTriangle size={14} />
                <span className="fw-bold small">⚠️ Stable Network Required</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
