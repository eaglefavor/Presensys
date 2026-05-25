import { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { setStudentPin } from '../lib/pinBlitzService';
import { OVERLAY_COLORS } from '../lib/themeColors';
import type { LocalStudent } from '../db/db';
import toast from 'react-hot-toast';

interface SetPinModalProps {
  student: LocalStudent;
  onClose: () => void;
}

export default function SetPinModal({ student, onClose }: SetPinModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (pin.length !== 6) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await setStudentPin(student.serverId, pin);
      toast.success('PIN successfully set!');
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to set PIN.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop fade show d-block" style={{ backgroundColor: OVERLAY_COLORS.backdrop, backdropFilter: 'blur(4px)', zIndex: 2005 }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="modal fade show d-block" style={{ zIndex: 2006 }}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
            <div className="modal-header border-0 bg-light p-4 pb-3">
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2 text-dark">
                <KeyRound size={20} className="text-primary" />
                Set Custom PIN
              </h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>

            <div className="modal-body p-4 text-center">
              <p className="text-muted mb-4 small">Set a 6-digit PIN for <strong>{student.name}</strong>.</p>

              <div className="mb-3 text-start">
                <label className="form-label xx-small fw-bold text-muted">NEW PIN</label>
                <input
                  type="password"
                  className="form-control form-control-lg text-center fw-bold fs-4 letter-spacing-2 rounded-3"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setPin(val);
                    setError('');
                  }}
                  placeholder="------"
                  disabled={isSaving}
                  autoFocus
                />
              </div>

              <div className="mb-4 text-start">
                <label className="form-label xx-small fw-bold text-muted">CONFIRM PIN</label>
                <input
                  type="password"
                  className="form-control form-control-lg text-center fw-bold fs-4 letter-spacing-2 rounded-3"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setConfirmPin(val);
                    setError('');
                  }}
                  placeholder="------"
                  disabled={isSaving}
                />
              </div>

              {error && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-4">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span className="text-start">{error}</span>
                </div>
              )}

              <button
                className="btn btn-primary w-100 py-3 rounded-3 fw-bold shadow-sm d-flex justify-content-center align-items-center gap-2"
                onClick={() => void handleSave()}
                disabled={isSaving || pin.length !== 6 || confirmPin.length !== 6}
              >
                {isSaving ? <div className="spinner-border spinner-border-sm" /> : <><CheckCircle2 size={18} /> Set PIN</>}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
