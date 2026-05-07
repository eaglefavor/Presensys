import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FingerprintPattern, CheckCircle, SkipForward, StopCircle, Loader } from 'lucide-react';
import { db } from '../../db/db';
import type { LocalStudent } from '../../db/db';
import { authenticateStudentBiometric } from '../../lib/biometricService';
import toast from 'react-hot-toast';

interface MatchToast {
  id: number;
  name: string;
  regNumber: string;
}

interface Props {
  activeSessionId: string;
  enrollments: LocalStudent[];
  userId: string;
  onStop: () => void;
  onCancel: () => void;
}

type ScanStatus = 'idle' | 'scanning' | 'success' | 'error';

/**
 * Fingerprint Blitz — sequential WebAuthn attendance marking.
 *
 * Iterates through the enrolled student list one at a time.  For each student
 * the course rep taps "Scan Fingerprint"; the device biometric prompt appears
 * (via the Web Authentication API), and on success the attendance record is
 * written directly to the local DB.  No external bridge or daemon is required.
 */
export default function FingerprintBlitzScreen({
  activeSessionId,
  enrollments,
  userId,
  onStop,
  onCancel,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [presentCount, setPresentCount] = useState(0);
  const [toastQueue, setToastQueue] = useState<MatchToast[]>([]);
  const toastCounter = useRef(0);

  // Track already-marked students to avoid duplicates when navigating back
  const markedRef = useRef<Set<string>>(new Set());

  const total = enrollments.length;
  const isDone = currentIndex >= total;
  const currentStudent: LocalStudent | undefined = enrollments[currentIndex];

  const writeAttendance = useCallback(async (student: LocalStudent) => {
    if (markedRef.current.has(student.serverId)) return;
    const now = Date.now();
    try {
      const existing = await db.attendanceRecords
        .where('[sessionId+studentId]')
        .equals([activeSessionId, student.serverId])
        .first();

      if (existing) {
        await db.attendanceRecords.update(existing.id!, {
          status: 'present',
          isDeleted: 0,
          synced: 0,
          timestamp: now,
        });
      } else {
        await db.attendanceRecords.add({
          serverId: '',
          sessionId: activeSessionId,
          studentId: student.serverId,
          status: 'present',
          timestamp: now,
          synced: 0,
          userId,
          isDeleted: 0,
        });
      }

      markedRef.current.add(student.serverId);
      setPresentCount(c => c + 1);

      const id = ++toastCounter.current;
      setToastQueue(q => [...q, { id, name: student.name, regNumber: student.regNumber }]);
      setTimeout(() => setToastQueue(q => q.filter(t => t.id !== id)), 3000);

      if (window.navigator.vibrate) window.navigator.vibrate([30, 10, 30]);
    } catch (err) {
      console.error('FingerprintBlitz: failed to write record', err);
    }
  }, [activeSessionId, userId]);

  const handleScan = async () => {
    if (!currentStudent || scanStatus === 'scanning') return;
    setScanStatus('scanning');
    try {
      const verified = await authenticateStudentBiometric(currentStudent.serverId);
      if (verified) {
        await writeAttendance(currentStudent);
        setScanStatus('success');
        setTimeout(() => {
          setScanStatus('idle');
          setCurrentIndex(i => i + 1);
        }, 800);
      } else {
        toast('Fingerprint did not match — try again or skip.', { icon: '🔍', duration: 2500 });
        setScanStatus('error');
        setTimeout(() => setScanStatus('idle'), 1500);
      }
    } catch (err: unknown) {
      const isDomEx = err instanceof DOMException;
      if (isDomEx && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        // User dismissed the prompt — treat as skipped
        toast('Scan cancelled — student skipped.', { icon: '⏭️', duration: 2000 });
        setScanStatus('idle');
        setCurrentIndex(i => i + 1);
      } else {
        toast.error('Scan failed. Try again.');
        setScanStatus('error');
        setTimeout(() => setScanStatus('idle'), 1500);
      }
    }
  };

  const handleSkip = () => {
    if (scanStatus === 'scanning') return;
    setScanStatus('idle');
    setCurrentIndex(i => i + 1);
  };

  const scanBtnLabel = () => {
    switch (scanStatus) {
      case 'scanning': return 'Scanning…';
      case 'success':  return 'Matched!';
      case 'error':    return 'No Match';
      default:         return 'Scan Fingerprint';
    }
  };

  const scanBtnClass = () => {
    switch (scanStatus) {
      case 'success': return 'btn-success';
      case 'error':   return 'btn-danger';
      default:        return 'btn-primary';
    }
  };

  return (
    <div className="d-flex flex-column min-vh-100 bg-white">
      {/* Header */}
      <div className="bg-white sticky-top border-bottom" style={{ zIndex: 100 }}>
        <div className="d-flex align-items-center justify-content-between p-3">
          <button className="btn btn-light rounded-circle p-2 border-0" onClick={onCancel} disabled={scanStatus === 'scanning'}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="h6 fw-black mb-0 text-dark text-uppercase letter-spacing-n1 flex-grow-1 text-center pe-5">
            Fingerprint Blitz
          </h1>
        </div>
      </div>

      <div className="p-4 d-flex flex-column gap-4 container-mobile mx-auto flex-grow-1">

        {/* Running tally card */}
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div className="card-body p-4">
            <div className="row g-2 text-center">
              <div className="col-4">
                <div className="bg-success bg-opacity-10 rounded-3 p-3">
                  <div className="h4 fw-black text-success mb-0">{presentCount}</div>
                  <div className="xx-small fw-bold text-muted">MARKED</div>
                </div>
              </div>
              <div className="col-4">
                <div className="bg-primary bg-opacity-10 rounded-3 p-3">
                  <div className="h4 fw-black text-primary mb-0">{currentIndex + 1 > total ? total : currentIndex + 1}</div>
                  <div className="xx-small fw-bold text-muted">CURRENT</div>
                </div>
              </div>
              <div className="col-4">
                <div className="bg-light rounded-3 p-3">
                  <div className="h4 fw-black text-muted mb-0">{total}</div>
                  <div className="xx-small fw-bold text-muted">ENROLLED</div>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="progress rounded-pill mt-3" style={{ height: 8, backgroundColor: '#e9ecef' }}>
              <div
                className="progress-bar bg-primary rounded-pill"
                style={{ width: `${total > 0 ? (currentIndex / total) * 100 : 0}%`, transition: 'width 0.4s ease' }}
              />
            </div>
          </div>
        </div>

        {/* Current student card or Done state */}
        {isDone ? (
          <div className="text-center py-5">
            <div className="d-inline-block p-4 rounded-circle mb-3 bg-success bg-opacity-10">
              <CheckCircle size={56} className="text-success" />
            </div>
            <p className="fw-black h5 text-dark mb-1">All students processed!</p>
            <p className="xx-small fw-bold text-muted mb-0">
              {presentCount} of {total} marked present.
            </p>
          </div>
        ) : (
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="card-body p-4 text-center">
              <div className={`d-inline-block p-4 rounded-circle mb-3 ${scanStatus === 'scanning' ? 'bg-primary bg-opacity-10' : scanStatus === 'success' ? 'bg-success bg-opacity-10' : scanStatus === 'error' ? 'bg-danger bg-opacity-10' : 'bg-light'}`}>
                {scanStatus === 'scanning'
                  ? <Loader size={48} className="text-primary animate-spin" />
                  : scanStatus === 'success'
                  ? <CheckCircle size={48} className="text-success" />
                  : <FingerprintPattern size={48} className={scanStatus === 'error' ? 'text-danger' : 'text-primary'} />
                }
              </div>
              <p className="fw-black h5 text-dark mb-1 text-truncate">{currentStudent.name}</p>
              <p className="xx-small fw-bold text-muted font-monospace mb-3">{currentStudent.regNumber}</p>
              <p className="xx-small text-muted fw-bold mb-0">
                Student {currentIndex + 1} of {total}
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isDone && (
          <div className="d-flex gap-2">
            <button
              className={`btn ${scanBtnClass()} flex-grow-1 py-3 rounded-4 fw-bold d-flex align-items-center justify-content-center gap-2`}
              onClick={handleScan}
              disabled={scanStatus === 'scanning' || scanStatus === 'success'}
            >
              {scanStatus === 'scanning'
                ? <><span className="spinner-border spinner-border-sm" role="status" /> {scanBtnLabel()}</>
                : <><FingerprintPattern size={20} /> {scanBtnLabel()}</>
              }
            </button>
            <button
              className="btn btn-outline-secondary py-3 px-4 rounded-4 fw-bold d-flex align-items-center gap-1"
              onClick={handleSkip}
              disabled={scanStatus === 'scanning'}
              title="Skip student"
            >
              <SkipForward size={18} />
              Skip
            </button>
          </div>
        )}

        {/* Match toast cards */}
        <div className="d-flex flex-column gap-2" style={{ minHeight: 60 }}>
          <AnimatePresence>
            {toastQueue.map(t => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="card border-0 bg-success text-white shadow rounded-4 overflow-hidden"
              >
                <div className="card-body py-3 px-4 d-flex align-items-center gap-3">
                  <CheckCircle size={24} className="flex-shrink-0" />
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="fw-black text-truncate">{t.name}</div>
                    <div className="xx-small opacity-75 font-monospace">{t.regNumber}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Stop button */}
      <div className="p-4 bg-white border-top sticky-bottom">
        <button
          className="btn btn-danger w-100 py-3 rounded-4 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
          onClick={onStop}
          disabled={scanStatus === 'scanning'}
        >
          <StopCircle size={20} /> Stop Session &amp; Review
        </button>
      </div>
    </div>
  );
}
