
import { useState, useEffect } from 'react';
import { X, FingerprintPattern, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { type LocalStudent } from '../db/db';
import { registerStudentFingerprint, hasRegisteredFingerprint } from '../lib/biometricService';
import toast from 'react-hot-toast';

type Status = 'ready' | 'capturing' | 'captured' | 'error';

interface Props {
  student: LocalStudent;
  onClose: () => void;
  userId: string;
}

export default function FingerprintEnrollModal({ student, onClose, userId }: Props) {
  const [status, setStatus] = useState<Status>('ready');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    hasRegisteredFingerprint(student.serverId).then(setHasExisting);
  }, [student.serverId]);

  const handleCapture = async () => {
    setStatus('capturing');
    try {
      await registerStudentFingerprint(student, userId);
      setStatus('captured');
      toast.success(`Fingerprint registered for ${student.name}`);
      setTimeout(onClose, 2000);
    } catch (err: unknown) {
      setStatus('error');
      setErrorMsg((err as Error).message || 'Failed to capture fingerprint.');
    }
  };

  const statusIcon = () => {
    switch (status) {

      case 'error':      return <AlertCircle size={48} className="text-danger mx-auto mb-3" />;
      case 'ready':      return <FingerprintPattern size={48} className="text-primary mx-auto mb-3" />;
      case 'capturing':  return <Loader size={48} className="text-primary mx-auto mb-3 animate-spin" />;
      case 'captured':   return <CheckCircle size={48} className="text-success mx-auto mb-3" />;
    }
  };

  const statusText = () => {
    switch (status) {
      case 'ready':      return 'Ready to capture';
      case 'capturing':  return 'Touch sensor to authenticate…';
      case 'captured':   return 'Fingerprint captured!';
      case 'error':      return errorMsg || 'Capture failed';
    }
  };

  return (
    <>
      <div
        className="modal-backdrop fade show d-block"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 2100 }}
        onClick={status === 'capturing' ? undefined : onClose}
      />
      <div className="modal fade show d-block" style={{ zIndex: 2101 }}>
        <div className="modal-dialog modal-dialog-centered mx-auto" style={{ maxWidth: 360 }}>
          <div className="modal-content border-0 shadow-2xl rounded-4">
            <div className="modal-header border-0 pt-4 px-4 pb-0 d-flex justify-content-between align-items-center">
              <h5 className="fw-black mb-0 text-dark text-uppercase" style={{ fontSize: '14px', letterSpacing: '1px' }}>Register Fingerprint</h5>
              <button
                className="btn btn-light rounded-circle p-2 border-0"
                onClick={onClose}
                disabled={status === 'capturing'}
              ><X size={18} /></button>
            </div>

            <div className="modal-body px-4 py-4 text-center">
              <p className="fw-bold text-muted small mb-3">{student.name}</p>

              {hasExisting && status === 'ready' && (
                <div className="alert alert-warning py-2 px-3 rounded-3 small fw-bold d-flex align-items-center gap-2 text-start mb-3">
                  <FingerprintPattern size={16} className="flex-shrink-0" />
                  <span>This student already has a fingerprint enrolled. Scanning again will replace it.</span>
                </div>
              )}

              <div className="d-flex flex-column align-items-center py-2">
                {statusIcon()}
                <p className={`fw-bold small mb-0 ${status === 'error' ? 'text-danger' : status === 'captured' ? 'text-success' : 'text-muted'}`}>
                  {statusText()}
                </p>
              </div>
            </div>

            <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex gap-2">
              {status !== 'capturing' && status !== 'captured' && (
                <button className="btn btn-light flex-grow-1 fw-bold rounded-3 py-2" onClick={onClose}>Cancel</button>
              )}
              {status === 'ready' && (
                <button className="btn btn-primary flex-grow-1 fw-bold rounded-3 py-2" onClick={handleCapture}>
                  Start Capture
                </button>
              )}
              {status === 'error' && (
                <button className="btn btn-primary flex-grow-1 fw-bold rounded-3 py-2" onClick={handleCapture}>
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
