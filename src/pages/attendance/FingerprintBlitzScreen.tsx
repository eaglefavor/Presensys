
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FingerprintPattern, CheckCircle, StopCircle, UserX, AlertCircle } from 'lucide-react';
import { db } from '../../db/db';
import type { LocalStudent } from '../../db/db';
import { verifyStudentFingerprint, hasRegisteredFingerprint } from '../../lib/biometricService';
import toast from 'react-hot-toast';

const SESSION_DURATION_S = 15 * 60; // 15 minutes in seconds

interface MatchToast {
  id: number;
  name: string;
  regNumber: string;
}

interface Props {
  activeSessionId: string;
  enrollments: LocalStudent[];
  userId: string;
  onStop: () => void;        // navigate to ManualMarking for review
  onCancel: () => void;      // back to choosing screen
}

export default function FingerprintBlitzScreen({
  activeSessionId,
  enrollments,
  userId,
  onStop,
  onCancel,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(SESSION_DURATION_S);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const markedRef = useRef<Set<string>>(new Set());
  const [presentCount, setPresentCount] = useState(0);
  const [toastQueue, setToastQueue] = useState<MatchToast[]>([]);
  const toastCounter = useRef(0);

  // Blitz state
  const [studentList, setStudentList] = useState<LocalStudent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  // Preload
  useEffect(() => {
    db.attendanceRecords
      .where('sessionId').equals(activeSessionId)
      .filter(r => r.isDeleted !== 1 && r.status === 'present')
      .toArray()
      .then(existing => {
        const existingIds = new Set(existing.map(r => r.studentId));
        markedRef.current = existingIds;
        setPresentCount(existing.length);

        // Filter enrollments to only those who have a registered fingerprint AND haven't been marked yet
        const prepareList = async () => {
           const withFingerprints: LocalStudent[] = [];
           for (const student of enrollments) {
              if (!existingIds.has(student.serverId) && await hasRegisteredFingerprint(student.serverId)) {
                  withFingerprints.push(student);
              }
           }
           setStudentList(withFingerprints);
        };
        prepareList();
      });
  }, [activeSessionId, enrollments]);

  // Countdown timer
  const onStopRef = useRef(onStop);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          toast('Session timer expired — reviewing attendance.', { icon: '⏰' });
          setTimeout(() => onStopRef.current(), 1500);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const markStudentPresent = async (student: LocalStudent) => {
    const now = Date.now();
    try {
      const existing = await db.attendanceRecords
        .where('[sessionId+studentId]')
        .equals([activeSessionId, student.serverId])
        .first();

      if (existing) {
        await db.attendanceRecords.update(existing.id!, { status: 'present', isDeleted: 0, synced: 0, timestamp: now });
      } else {
        await db.attendanceRecords.add({
          serverId: crypto.randomUUID(),
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
  };

  const handleNextScan = async () => {
    setIsScanning(true);
    setScanError('');

    if (currentIndex >= studentList.length) {
       setIsScanning(false);
       return;
    }
    const student = studentList[currentIndex];

    try {
      const success = await verifyStudentFingerprint(student);

      if (success) {
        await markStudentPresent(student);
        moveToNext();
      }
    } catch (err: unknown) {
      console.error("Scan failed", err);
      const e = err as Error;
      if (e.name === "NotAllowedError") {
        setScanError("Fingerprint not found on this device. If browser data was cleared, please delete and re-register the fingerprint for this student.");
      } else {
        setScanError(e.message || "Verification failed. Try again.");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const moveToNext = () => {
      setScanError('');
      if (currentIndex < studentList.length - 1) {
          setCurrentIndex(prev => prev + 1);
      } else {
          toast('All enrolled students scanned!', { icon: '✅' });
          handleStop();
      }
  };

  const handleSkip = () => {
      moveToNext();
  };

  const handleStop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onStop();
  };

  /** Clears the timer so it does not fire after the user navigates back. */
  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onCancel();
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const progress = ((SESSION_DURATION_S - secondsLeft) / SESSION_DURATION_S) * 100;
  const total = enrollments.length;

  const currentStudent = studentList[currentIndex];

  return (
    <div className="d-flex flex-column min-vh-100 bg-white">
      {/* Header */}
      <div className="bg-white sticky-top border-bottom" style={{ zIndex: 100 }}>
        <div className="d-flex align-items-center justify-content-between p-3">
          <button className="btn btn-light rounded-circle p-2 border-0" onClick={handleCancel}>
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
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="xx-small fw-bold text-muted">WEB AUTHENTICATION</span>
              <span className="fw-black h5 mb-0 font-monospace text-primary">{mm}:{ss}</span>
            </div>

            <div className="progress rounded-pill mb-3" style={{ height: 8, backgroundColor: '#e9ecef' }}>
              <div
                className="progress-bar bg-primary rounded-pill"
                style={{ width: `${progress}%`, transition: 'width 1s linear' }}
              />
            </div>

            <div className="row g-2 text-center">
              <div className="col-6">
                <div className="bg-success bg-opacity-10 rounded-3 p-3">
                  <div className="h4 fw-black text-success mb-0">{presentCount}</div>
                  <div className="xx-small fw-bold text-muted">PRESENT</div>
                </div>
              </div>
              <div className="col-6">
                <div className="bg-light rounded-3 p-3">
                  <div className="h4 fw-black text-muted mb-0">{total}</div>
                  <div className="xx-small fw-bold text-muted">ENROLLED</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scan Area */}
        {currentStudent ? (
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden text-center p-4">
                <h3 className="h5 fw-black mb-1">{currentStudent.name}</h3>
                <p className="text-muted small fw-bold font-monospace mb-4">{currentStudent.regNumber}</p>

                <div className={`d-inline-flex justify-content-center align-items-center p-4 rounded-circle mb-4 ${isScanning ? 'bg-primary bg-opacity-10' : scanError ? 'bg-danger bg-opacity-10' : 'bg-light'}`} style={{ width: 100, height: 100 }}>
                    <FingerprintPattern size={48} className={isScanning ? 'text-primary' : scanError ? 'text-danger' : 'text-muted'} />
                </div>

                {scanError && <p className="text-danger small fw-bold mb-3 d-flex align-items-center justify-content-center gap-1"><AlertCircle size={16}/> {scanError}</p>}

                <div className="d-flex gap-2 w-100">
                    <button className="btn btn-light fw-bold py-3 flex-grow-1" onClick={handleSkip} disabled={isScanning}>
                        <UserX size={20} className="me-2" /> Skip
                    </button>
                    <button className="btn btn-primary fw-bold py-3 flex-grow-1" onClick={handleNextScan} disabled={isScanning}>
                        {isScanning ? 'Scanning...' : 'Scan Finger'}
                    </button>
                </div>
                <div className="mt-3 text-muted xx-small fw-bold">Student {currentIndex + 1} of {studentList.length}</div>
            </div>
        ) : (
            <div className="text-center py-5">
                <CheckCircle size={48} className="text-success mx-auto mb-3" />
                <h3 className="h5 fw-black text-dark">All Caught Up!</h3>
                <p className="text-muted small">No more students with registered fingerprints to scan.</p>
            </div>
        )}

        {/* Match toast cards */}
        <div className="d-flex flex-column gap-2" style={{ minHeight: 80 }}>
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
          onClick={handleStop}
        >
          <StopCircle size={20} /> Stop Session &amp; Review
        </button>
      </div>
    </div>
  );
}
