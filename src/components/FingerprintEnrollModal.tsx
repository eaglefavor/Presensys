import { useState } from 'react';
import { X, FingerprintPattern, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import type { LocalStudent } from '../db/db';
import { registerStudentBiometric } from '../lib/biometricService';
import toast from 'react-hot-toast';

type Status = 'idle' | 'enrolling' | 'success' | 'error';

interface Props {
  student: LocalStudent;
  onClose: () => void;
}

/**
 * Modal that uses the Web Authentication API (WebAuthn) to enroll a student's
 * biometric credential.  The device's built-in fingerprint sensor (or Face ID
 * on supported devices) is prompted directly — no external bridge or daemon
 * is required.
 */
export default function FingerprintEnrollModal({ student, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleEnroll = async () => {
    setStatus('enrolling');
    setErrorMsg('');
    try {
      await registerStudentBiometric(student.serverId, student.name);
      setStatus('success');
      toast.success(`Fingerprint registered for ${student.name}`);
    } catch (err: unknown) {
      // DOMException: user cancelled — show a gentler message
      const isDomEx = err instanceof DOMException;
      if (isDomEx && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        setErrorMsg('Scan was cancelled. Tap "Try Again" to retry.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Enrollment failed. Please try again.');
      }
      setStatus('error');
    }
  };

  const statusIcon = () => {
    switch (status) {
      case 'idle':      return <FingerprintPattern size={48} className="text-primary mx-auto mb-3" />;
      case 'enrolling': return <Loader size={48} className="text-primary mx-auto mb-3 animate-spin" />;
      case 'success':   return <CheckCircle size={48} className="text-success mx-auto mb-3" />;
      case 'error':     return <AlertCircle size={48} className="text-danger mx-auto mb-3" />;
    }
  };

  const statusText = () => {
    switch (status) {
      case 'idle':      return 'Tap "Register Fingerprint" to begin. Your device will prompt for a biometric scan.';
      case 'enrolling': return 'Follow the on-screen prompt to complete the fingerprint scan…';
      case 'success':   return 'Fingerprint enrolled successfully!';
      case 'error':     return errorMsg || 'Enrollment failed. Please try again.';
    }
  };

  return (
    <>
      <div
        className="modal-backdrop fade show d-block"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 2100 }}
        onClick={status === 'enrolling' ? undefined : onClose}
      />
      <div className="modal fade show d-block" style={{ zIndex: 2101 }}>
        <div className="modal-dialog modal-dialog-centered mx-auto" style={{ maxWidth: 360 }}>
          <div className="modal-content border-0 shadow-2xl rounded-4">
            <div className="modal-header border-0 pt-4 px-4 pb-0 d-flex justify-content-between align-items-center">
              <h5 className="fw-black mb-0 text-dark text-uppercase" style={{ fontSize: '14px', letterSpacing: '1px' }}>Register Fingerprint</h5>
              {status !== 'enrolling' && (
                <button className="btn btn-light rounded-circle p-2 border-0" onClick={onClose}><X size={18} /></button>
              )}
            </div>

            <div className="modal-body px-4 py-4 text-center">
              <p className="fw-bold text-muted small mb-3">{student.name}</p>

              <div className="d-flex flex-column align-items-center py-2">
                {statusIcon()}
                <p className={`fw-bold small mb-0 ${status === 'error' ? 'text-danger' : status === 'success' ? 'text-success' : 'text-muted'}`}>
                  {statusText()}
                </p>
              </div>
            </div>

            <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex gap-2">
              {status !== 'enrolling' && (
                <button className="btn btn-light flex-grow-1 fw-bold rounded-3 py-2" onClick={onClose}>
                  {status === 'success' ? 'Close' : 'Cancel'}
                </button>
              )}
              {(status === 'idle' || status === 'error') && (
                <button className="btn btn-primary flex-grow-1 fw-bold rounded-3 py-2" onClick={handleEnroll}>
                  <FingerprintPattern size={16} className="me-2" />
                  {status === 'error' ? 'Try Again' : 'Register Fingerprint'}
                </button>
              )}
              {status === 'enrolling' && (
                <button className="btn btn-secondary flex-grow-1 fw-bold rounded-3 py-2" disabled>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Enrolling…
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
