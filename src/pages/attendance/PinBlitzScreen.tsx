import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle, KeyRound, StopCircle, UserX, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../db/db';
import type { LocalStudent } from '../../db/db';
import { ensureStudentPins, generatePinChallenge, verifyStudentPin } from '../../lib/pinBlitzService';

const SESSION_DURATION_S = 15 * 60;
const PIN_LENGTH = 6;

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

function shuffleStudents(students: LocalStudent[]): LocalStudent[] {
  const arr = [...students];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PinBlitzScreen({
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
  const [isPreparingPins, setIsPreparingPins] = useState(true);

  const [studentList, setStudentList] = useState<LocalStudent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [attemptMeta, setAttemptMeta] = useState<{ remainingAttempts: number; retryAfterSeconds: number } | null>(null);

  const onStopRef = useRef(onStop);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  useEffect(() => {
    const preload = async () => {
      try {
        const existing = await db.attendanceRecords
          .where('sessionId').equals(activeSessionId)
          .filter(r => r.isDeleted !== 1 && r.status === 'present')
          .toArray();
        const existingIds = new Set(existing.map(r => r.studentId));
        markedRef.current = existingIds;
        setPresentCount(existing.length);

        const unmarked = enrollments.filter(s => !existingIds.has(s.serverId));
        const reveals = await ensureStudentPins(unmarked.map(s => s.serverId));
        if (reveals.length > 0) {
          toast.success(`${reveals.length} new PIN(s) auto-generated. Share securely with affected students.`);
        }

        setStudentList(shuffleStudents(unmarked));
      } catch (err) {
        console.error('PinBlitz: preload failed', err);
        toast.error('Failed to prepare PIN Blitz session.');
      } finally {
        setIsPreparingPins(false);
      }
    };
    void preload();
  }, [activeSessionId, enrollments]);

  useEffect(() => {
    if (isPreparingPins) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          toast('Session timer expired — reviewing attendance.', { icon: '⏰' });
          setTimeout(() => onStopRef.current(), 1200);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPreparingPins]);

  const currentStudent = useMemo(() => studentList[currentIndex], [studentList, currentIndex]);

  useEffect(() => {
    const prepareChallenge = async () => {
      if (!currentStudent) return;
      setPinError('');
      setAttemptMeta(null);
      setPinInput('');
      setChallengeId(null);
      try {
        const id = await generatePinChallenge(activeSessionId, currentStudent.serverId);
        setChallengeId(id);
      } catch (err) {
        console.error('PinBlitz: challenge generation failed', err);
        setPinError('Unable to start PIN verification for this student. You can skip and continue.');
      }
    };
    void prepareChallenge();
  }, [activeSessionId, currentStudent]);

  const moveToNext = () => {
    setPinError('');
    setAttemptMeta(null);
    setPinInput('');
    setChallengeId(null);
    if (currentIndex < studentList.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      toast('All enrolled students processed!', { icon: '✅' });
      handleStop();
    }
  };

  const markStudentPresent = async (student: LocalStudent) => {
    const now = Date.now();
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
  };

  const handleVerifyPin = async () => {
    if (!currentStudent || !challengeId || pinInput.length !== PIN_LENGTH || isVerifying) return;
    setIsVerifying(true);
    setPinError('');

    try {
      const result = await verifyStudentPin({
        sessionId: activeSessionId,
        studentId: currentStudent.serverId,
        challengeId,
        pin: pinInput,
      });

      if (result.verified) {
        await markStudentPresent(currentStudent);
        moveToNext();
        return;
      }

      if (result.locked) {
        setPinError(`Student temporarily locked. Retry in ${result.retryAfterSeconds}s or skip.`);
      } else {
        setPinError('Invalid PIN.');
      }
      setAttemptMeta({ remainingAttempts: result.remainingAttempts, retryAfterSeconds: result.retryAfterSeconds });
      try {
        const newChallenge = await generatePinChallenge(activeSessionId, currentStudent.serverId);
        setChallengeId(newChallenge);
      } catch {
        setChallengeId(null);
      }
      setPinInput('');
    } catch (err) {
      console.error('PinBlitz: verification failed', err);
      setPinError('Verification failed. Please retry or skip.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleStop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onStop();
  };

  const handleCancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onCancel();
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const progress = ((SESSION_DURATION_S - secondsLeft) / SESSION_DURATION_S) * 100;
  const total = enrollments.length;

  return (
    <div className="d-flex flex-column min-vh-100 bg-white">
      <div className="bg-white sticky-top border-bottom" style={{ zIndex: 100 }}>
        <div className="d-flex align-items-center justify-content-between p-3">
          <button className="btn btn-light rounded-circle p-2 border-0" onClick={handleCancel}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="h6 fw-black mb-0 text-dark text-uppercase letter-spacing-n1 flex-grow-1 text-center pe-5">
            PIN Blitz
          </h1>
        </div>
      </div>

      <div className="p-4 d-flex flex-column gap-4 container-mobile mx-auto flex-grow-1">
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div className="card-body p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="xx-small fw-bold text-muted">SECURE PIN VERIFICATION</span>
              <span className="fw-black h5 mb-0 font-monospace text-primary">{mm}:{ss}</span>
            </div>
            <div className="progress rounded-pill mb-3" style={{ height: 8, backgroundColor: '#e9ecef' }}>
              <div className="progress-bar bg-primary rounded-pill" style={{ width: `${progress}%`, transition: 'width 1s linear' }} />
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

        {isPreparingPins ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status" />
            <p className="text-muted small mt-3 mb-0">Preparing secure PIN records…</p>
          </div>
        ) : currentStudent ? (
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden text-center p-4">
            <h3 className="h5 fw-black mb-1">{currentStudent.name}</h3>
            <p className="text-muted small fw-bold font-monospace mb-4">{currentStudent.regNumber}</p>

            <div className={`d-inline-flex justify-content-center align-items-center p-4 rounded-circle mb-4 ${isVerifying ? 'bg-primary bg-opacity-10' : pinError ? 'bg-danger bg-opacity-10' : 'bg-light'}`} style={{ width: 100, height: 100 }}>
              <KeyRound size={48} className={isVerifying ? 'text-primary' : pinError ? 'text-danger' : 'text-muted'} />
            </div>

            <div className="mb-3">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PIN_LENGTH}
                className="form-control form-control-lg text-center fw-black font-monospace"
                placeholder="Enter 6-digit PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleVerifyPin();
                  }
                }}
                disabled={isVerifying}
              />
            </div>

            {pinError && (
              <p className="text-danger small fw-bold mb-2 d-flex align-items-center justify-content-center gap-1">
                <AlertCircle size={16} /> {pinError}
              </p>
            )}
            {attemptMeta && !attemptMeta.retryAfterSeconds && (
              <p className="text-muted xx-small fw-bold mb-3">Attempts left: {attemptMeta.remainingAttempts}</p>
            )}

            <div className="d-flex gap-2 w-100">
              <button className="btn btn-light fw-bold py-3 flex-grow-1" onClick={moveToNext} disabled={isVerifying}>
                <UserX size={20} className="me-2" /> Skip
              </button>
              <button className="btn btn-primary fw-bold py-3 flex-grow-1" onClick={() => void handleVerifyPin()} disabled={isVerifying || pinInput.length !== PIN_LENGTH || !challengeId}>
                {isVerifying ? 'Verifying…' : 'Verify PIN'}
              </button>
            </div>
            <div className="mt-3 text-muted xx-small fw-bold">Student {currentIndex + 1} of {studentList.length}</div>
          </div>
        ) : (
          <div className="text-center py-5">
            <CheckCircle size={48} className="text-success mx-auto mb-3" />
            <h3 className="h5 fw-black text-dark">All Caught Up!</h3>
            <p className="text-muted small">No more students to process.</p>
          </div>
        )}

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

