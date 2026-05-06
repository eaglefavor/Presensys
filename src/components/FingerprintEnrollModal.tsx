import { useEffect, useRef, useState, useCallback } from 'react';
import { X, FingerprintPattern, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { db, type LocalStudent } from '../db/db';
import { getBridgeUrl } from '../lib/bridgeSettings';
import toast from 'react-hot-toast';

type Status = 'connecting' | 'connected' | 'captured' | 'error';

interface Props {
  student: LocalStudent;
  onClose: () => void;
}

/**
 * Modal that connects to the local fingerprint bridge WebSocket daemon,
 * captures a single fingerprint scan event and stores it on the student record.
 */
export default function FingerprintEnrollModal({ student, onClose }: Props) {
  const [status, setStatus] = useState<Status>('connecting');
  const [capturedId, setCapturedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  // Track capture in a ref so the ws.onclose handler doesn't read stale state
  const capturedRef = useRef(false);

  const closeWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    const bridgeUrl = getBridgeUrl();
    let ws: WebSocket;
    try {
      ws = new WebSocket(bridgeUrl);
      wsRef.current = ws;

      ws.onopen = () => setStatus('connected');

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data?.type === 'fingerprint' && data?.fingerId) {
            const id = String(data.fingerId);
            capturedRef.current = true;
            setCapturedId(id);
            setStatus('captured');
            closeWs();
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setErrorMsg('Could not connect to the fingerprint bridge. Is the Termux daemon running?');
      };

      ws.onclose = () => {
        if (!capturedRef.current) {
          setStatus('error');
          setErrorMsg('Connection to the bridge was lost.');
        }
      };
    } catch {
      setTimeout(() => {
        setStatus('error');
        setErrorMsg('Failed to create WebSocket connection. Check that the bridge is running.');
      }, 0);
    }

    return () => closeWs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!capturedId || !student.id) return;
    try {
      await db.students.update(student.id, { fingerprintId: capturedId, synced: 0 });
      toast.success(`Fingerprint registered for ${student.name}`);
      onClose();
    } catch {
      toast.error('Failed to save fingerprint.');
    }
  };

  const statusIcon = () => {
    switch (status) {
      case 'connecting': return <Loader size={48} className="text-primary mx-auto mb-3 animate-spin" />;
      case 'connected':  return <FingerprintPattern size={48} className="text-primary mx-auto mb-3" />;
      case 'captured':   return <CheckCircle size={48} className="text-success mx-auto mb-3" />;
      case 'error':      return <AlertCircle size={48} className="text-danger mx-auto mb-3" />;
    }
  };

  const statusText = () => {
    switch (status) {
      case 'connecting': return 'Waiting for bridge…';
      case 'connected':  return 'Connected — place finger on sensor';
      case 'captured':   return `Fingerprint captured! ID: ${capturedId}`;
      case 'error':      return errorMsg || 'Connection error';
    }
  };

  const hasExisting = Boolean(student.fingerprintId);

  return (
    <>
      <div
        className="modal-backdrop fade show d-block"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 2100 }}
        onClick={onClose}
      />
      <div className="modal fade show d-block" style={{ zIndex: 2101 }}>
        <div className="modal-dialog modal-dialog-centered mx-auto" style={{ maxWidth: 360 }}>
          <div className="modal-content border-0 shadow-2xl rounded-4">
            <div className="modal-header border-0 pt-4 px-4 pb-0 d-flex justify-content-between align-items-center">
              <h5 className="fw-black mb-0 text-dark text-uppercase" style={{ fontSize: '14px', letterSpacing: '1px' }}>Register Fingerprint</h5>
              <button className="btn btn-light rounded-circle p-2 border-0" onClick={onClose}><X size={18} /></button>
            </div>

            <div className="modal-body px-4 py-4 text-center">
              <p className="fw-bold text-muted small mb-3">{student.name}</p>

              {hasExisting && status !== 'captured' && (
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
              <button className="btn btn-light flex-grow-1 fw-bold rounded-3 py-2" onClick={onClose}>Cancel</button>
              {status === 'captured' && (
                <button className="btn btn-success flex-grow-1 fw-bold rounded-3 py-2" onClick={handleSave}>
                  Save Fingerprint
                </button>
              )}
              {status === 'error' && (
                <button className="btn btn-primary flex-grow-1 fw-bold rounded-3 py-2" onClick={() => window.location.reload()}>
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
