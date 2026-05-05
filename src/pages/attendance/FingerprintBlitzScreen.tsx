import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FingerprintPattern, CheckCircle, WifiOff, StopCircle } from 'lucide-react';
import { db } from '../../db/db';
import type { LocalStudent } from '../../db/db';
import { useFingerprintBridge } from '../../hooks/useFingerprintBridge';
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
  // Countdown timer state
  const [secondsLeft, setSecondsLeft] = useState(SESSION_DURATION_S);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track which studentIds have already been marked in this session to avoid duplicates
  const markedRef = useRef<Set<string>>(new Set());

  // Present count for the running tally
  const [presentCount, setPresentCount] = useState(0);

  // Toast queue for match feedback
  const [toastQueue, setToastQueue] = useState<MatchToast[]>([]);
  const toastCounter = useRef(0);

  // Preload existing present records so we don't double-count on re-entry
  useEffect(() => {
    db.attendanceRecords
      .where('sessionId').equals(activeSessionId)
      .filter(r => r.isDeleted !== 1 && r.status === 'present')
      .toArray()
      .then(existing => {
        existing.forEach(r => markedRef.current.add(r.studentId));
        setPresentCount(existing.length);
      });
  }, [activeSessionId]);

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

  // Build a lookup map: fingerprintId → student
  const fingerprintMap = useRef<Map<string, LocalStudent>>(new Map());
  useEffect(() => {
    const m = new Map<string, LocalStudent>();
    for (const s of enrollments) {
      if (s.fingerprintId) m.set(s.fingerprintId, s);
    }
    fingerprintMap.current = m;
  }, [enrollments]);

  // Process incoming fingerprint events — called directly from the bridge hook
  const handleFingerprintEvent = useCallback(async (fingerId: string) => {
    const student = fingerprintMap.current.get(fingerId);
    if (!student) {
      toast('Unknown fingerprint — no match found.', { icon: '🔍', duration: 2000 });
      return;
    }

    if (markedRef.current.has(student.serverId)) {
      // Silently ignore duplicate scan
      return;
    }

    // Write directly to DB (no pending state — speed matters here)
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

      // Show match toast card
      const id = ++toastCounter.current;
      setToastQueue(q => [...q, { id, name: student.name, regNumber: student.regNumber }]);
      setTimeout(() => setToastQueue(q => q.filter(t => t.id !== id)), 3000);

      if (window.navigator.vibrate) window.navigator.vibrate([30, 10, 30]);
    } catch (err) {
      console.error('FingerprintBlitz: failed to write record', err);
    }
  }, [activeSessionId, userId]);

  // Connect to the bridge — events are delivered via callback (no intermediate state)
  const { connected } = useFingerprintBridge(handleFingerprintEvent);

  const handleStop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onStop();
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const progress = ((SESSION_DURATION_S - secondsLeft) / SESSION_DURATION_S) * 100;
  const total = enrollments.length;

  return (
    <div className="d-flex flex-column min-vh-100 bg-white">
      {/* Header */}
      <div className="bg-white sticky-top border-bottom" style={{ zIndex: 100 }}>
        <div className="d-flex align-items-center justify-content-between p-3">
          <button className="btn btn-light rounded-circle p-2 border-0" onClick={onCancel}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="h6 fw-black mb-0 text-dark text-uppercase letter-spacing-n1 flex-grow-1 text-center pe-5">
            Fingerprint Blitz
          </h1>
        </div>
      </div>

      <div className="p-4 d-flex flex-column gap-4 container-mobile mx-auto flex-grow-1">

        {/* Bridge status banner */}
        {!connected && (
          <div className="alert alert-danger d-flex align-items-center gap-2 py-2 px-3 rounded-4 fw-bold small mb-0">
            <WifiOff size={18} className="flex-shrink-0" />
            <span>Bridge offline — reconnecting… Start the Termux daemon to enable scanning.</span>
          </div>
        )}

        {/* Running tally card */}
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div className="card-body p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center gap-2">
                <div className={`rounded-circle ${connected ? 'bg-success' : 'bg-danger'}`} style={{ width: 10, height: 10 }} />
                <span className="xx-small fw-bold text-muted">{connected ? 'BRIDGE CONNECTED' : 'BRIDGE OFFLINE'}</span>
              </div>
              <span className="fw-black h5 mb-0 font-monospace text-primary">{mm}:{ss}</span>
            </div>

            {/* Progress bar */}
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

        {/* Sensor prompt */}
        <div className="text-center py-4">
          <div className={`d-inline-block p-4 rounded-circle mb-3 ${connected ? 'bg-success bg-opacity-10' : 'bg-light'}`}>
            <FingerprintPattern size={56} className={connected ? 'text-success' : 'text-muted'} />
          </div>
          <p className={`fw-bold mb-1 ${connected ? 'text-dark' : 'text-muted'}`}>
            {connected ? 'Waiting for fingerprint scan…' : 'Waiting for bridge connection…'}
          </p>
          <p className="xx-small fw-bold text-muted mb-0">Students touch the sensor to mark attendance</p>
        </div>

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
