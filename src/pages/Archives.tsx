import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search, Archive, BarChart3, Calendar, Download, Share2,
  FileText, FileSpreadsheet, AlertTriangle, BookOpen, ChevronDown,
  ChevronUp, X, CheckCircle2, Clock, Printer, Users, LayoutGrid,
} from 'lucide-react';
import { db } from '../db/db';
import { ThemeColors } from '../lib/themeColors';
import type { LocalStudent, LocalLecturer } from '../db/db';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  exportToCSV,
  exportToXLSX,
  exportToPDF,
  exportToText,
  downloadText,
  shareData,
  exportToMultiSheetXLSX,
} from '../lib/ExportUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ArchiveMode = 'student' | 'compilation' | 'sessions' | 'semester' | 'atrisk';
type SortField = 'name' | 'regNumber' | 'percentage' | 'absentCount';
type SortDir = 'asc' | 'desc';
type FilterChip = '' | 'atrisk' | 'perfect' | 'excused';

interface CourseOption { id: string; code: string; title: string; lecturers?: string; }

interface CompilationRow {
  name: string; regNumber: string;
  totalSessions: number; presentCount: number; absentCount: number; excusedCount: number;
  percentage: number;
}

interface SessionRow {
  id: string; date: string; title: string;
  totalEnrolled: number; presentCount: number; absentCount: number; excusedCount: number;
  attendanceRate: number;
}

interface RollCallEntry { name: string; regNumber: string; status: 'present' | 'absent' | 'excused'; }

interface NameSuggestion { serverId: string; name: string; regNumber: string; }

interface AttendanceDetail {
  status: string; timestamp: string;
  session: { date: string; title: string };
  course: { code: string; title: string };
}

interface SemesterCourseRow {
  courseId: string; code: string; title: string;
  sessionsHeld: number; enrolledCount: number; avgAttendance: number;
  presentCount: number; absentCount: number; excusedCount: number;
}

type SupabaseStudentRow = { id: string; name: string; reg_number: string };
type SupabaseAttendanceRecordRow = {
  status: string;
  marked_at: string | number;
  attendance_sessions?: { date: string; title: string; courses?: { code: string; title: string } };
};
type SupabaseSessionRow = { id: string; date: string; title: string };
type SupabaseSessionRecordRow = { session_id: string; status: string };
type SupabaseEnrollmentRow = { student_id: string; students: { id: string; name: string; reg_number: string } };
type SupabaseRollCallRow = { status: string; students?: { name: string; reg_number: string } };

// ─── Constants ────────────────────────────────────────────────────────────────

const REG_NUMBER_PATTERN = /^(\d|[A-Z]{2,}\/)/i;
const EMPTY_LECTURERS: LocalLecturer[] = [];

// ─── sessionStorage helpers ───────────────────────────────────────────────────

const SS_KEY = 'archives_last_compilation';

function loadPersistedCompilation() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      courseId: string; startDate: string; endDate: string;
      data: CompilationRow[]; title: string;
    };
  } catch { return null; }
}

function savePersistedCompilation(
  courseId: string, startDate: string, endDate: string,
  data: CompilationRow[], title: string,
) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ courseId, startDate, endDate, data, title }));
  } catch { /* quota — ignore */ }
}

// ─── Pure-SVG Sub-components ──────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="card border-0 bg-white shadow-sm p-3 rounded-4">
    <span className="skeleton-line w-50 mb-2" style={{ display: 'block' }} />
    <span className="skeleton-line w-75 mb-2" style={{ display: 'block' }} />
    <span className="skeleton-line w-25" style={{ display: 'block' }} />
  </div>
);

const CircularProgress = ({ percentage }: { percentage: number }) => {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percentage / 100) * circ;
  const color = percentage >= 75 ? '#198754' : percentage >= 50 ? '#e6a817' : '#dc3545';
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-label={`${percentage}%`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="#f1f3f5" strokeWidth="7" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 36 36)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="36" y="42" textAnchor="middle" fontSize="13" fontWeight="900" fill={color}>
        {percentage}%
      </text>
    </svg>
  );
};

/** SVG donut chart for present/absent/excused */
const DonutChart = ({ present, absent, excused }: { present: number; absent: number; excused: number }) => {
  const total = present + absent + excused;
  if (total === 0) return null;
  const r = 30; const cx = 40; const cy = 40;
  const circ = 2 * Math.PI * r;
  const pPct = present / total;
  const aPct = absent  / total;
  const ePct = excused / total;
  const makeSlice = (pct: number, offsetPct: number, color: string, key: string) => {
    const len = circ * pct;
    return (
      <circle key={key} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="14"
        strokeDasharray={`${len} ${circ - len}`}
        strokeDashoffset={-offsetPct * circ}
        transform={`rotate(-90 ${cx} ${cy})`} />
    );
  };
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" aria-label="Attendance breakdown">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f3f5" strokeWidth="14" />
      {makeSlice(pPct, 0,           '#198754', 'p')}
      {makeSlice(aPct, pPct,        '#dc3545', 'a')}
      {makeSlice(ePct, pPct + aPct, '#e6a817', 'e')}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="10" fontWeight="900" fill="#333">
        {Math.round(pPct * 100)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#888">present</text>
    </svg>
  );
};

/** SVG sparkline — rolling-window trend */
const Sparkline = ({ records }: { records: AttendanceDetail[] }) => {
  if (records.length < 3) return null;
  const sorted = [...records].sort((a, b) => a.session.date.localeCompare(b.session.date));
  const ws = Math.min(5, sorted.length);
  const pts: number[] = [];
  for (let i = ws - 1; i < sorted.length; i++) {
    const w = sorted.slice(i - ws + 1, i + 1);
    pts.push(w.filter(r => r.status === 'present').length / ws * 100);
  }
  if (pts.length < 2) return null;
  const W = 80; const H = 28;
  const xStep = W / (pts.length - 1);
  const coords = pts.map((p, i) => `${i * xStep},${H - (p / 100) * H}`).join(' ');
  const last = pts[pts.length - 1]; const prev = pts[pts.length - 2];
  const color = last > prev ? '#198754' : last < prev ? '#dc3545' : '#adb5bd';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label="Trend">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(pts.length - 1) * xStep} cy={H - (last / 100) * H} r="3" fill={color} />
    </svg>
  );
};

/** Heatmap calendar — one square per session */
const AttendanceHeatmap = ({ records }: { records: AttendanceDetail[] }) => {
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => a.session.date.localeCompare(b.session.date));
  const colorOf = (s: string) => s === 'present' ? '#198754' : s === 'absent' ? '#dc3545' : '#e6a817';
  return (
    <div>
      <div className="xx-small fw-black text-muted text-uppercase tracking-widest mb-2">Attendance Heatmap</div>
      <div className="d-flex flex-wrap gap-1">
        {sorted.map((r, i) => (
          <div key={i} title={`${r.course.code} — ${r.session.date}: ${r.status}`}
            style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: colorOf(r.status), flexShrink: 0 }} />
        ))}
      </div>
      <div className="d-flex gap-3 mt-2">
        {([['#198754', 'Present'], ['#dc3545', 'Absent'], ['#e6a817', 'Excused']] as [string, string][]).map(([c, l]) => (
          <div key={l} className="d-flex align-items-center gap-1">
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: c }} />
            <span className="xx-small text-muted">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const statusBadgeClass = (status: string) =>
  status === 'present' ? 'bg-success text-white' : status === 'absent' ? 'bg-danger text-white' : 'bg-warning text-dark';

const StatusIcon = ({ status }: { status: string }) =>
  status === 'present' ? <CheckCircle2 size={18} /> : status === 'excused' ? <Clock size={18} /> : <Archive size={18} />;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Archives() {
  const { user } = useAuthStore();
  const activeSemester = useAppStore(state => state.activeSemester);
  const queriedLecturers = useLiveQuery(() => db.lecturers.filter(l => l.isDeleted !== 1).toArray());
  const lecturers = queriedLecturers ?? EMPTY_LECTURERS;

  const [mode, setMode] = useState<ArchiveMode>('student');
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<CourseOption[]>([]);

  // ── Student Lookup ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<NameSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [studentResult, setStudentResult] = useState<LocalStudent | null>(null);
  const [studentAttendance, setStudentAttendance] = useState<AttendanceDetail[]>([]);
  const [studentCourseFilter, setStudentCourseFilter] = useState('');
  const [studentDateStart, setStudentDateStart] = useState('');
  const [studentDateEnd, setStudentDateEnd] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const studentItemsPerPage = 10;
  const suggestRef = useRef<HTMLDivElement>(null);

  // Compare student
  const [compareQuery, setCompareQuery] = useState('');
  const [compareResult, setCompareResult] = useState<LocalStudent | null>(null);
  const [compareAttendance, setCompareAttendance] = useState<AttendanceDetail[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // Collapsible course sections
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  // ── Compilation ─────────────────────────────────────────────────────────────
  const persisted = useMemo(() => loadPersistedCompilation(), []);
  const [selectedCourseId, setSelectedCourseId] = useState(persisted?.courseId || '');
  const [startDate, setStartDate] = useState(persisted?.startDate || '');
  const [endDate, setEndDate] = useState(persisted?.endDate || '');
  const [compilationData, setCompilationData] = useState<CompilationRow[]>(persisted?.data || []);
  const [compilationTitle, setCompilationTitle] = useState(persisted?.title || '');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sortField, setSortField] = useState<SortField>('percentage');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterChip, setFilterChip] = useState<FilterChip>('');
  const [compilationPage, setCompilationPage] = useState(1);
  const [compilationLecturerId, setCompilationLecturerId] = useState('');
  const compilationItemsPerPage = 15;

  // ── Session Drill-Down ──────────────────────────────────────────────────────
  const [sessionsCourseId, setSessionsCourseId] = useState('');
  const [sessionsLecturerId, setSessionsLecturerId] = useState('');
  const [sessionsList, setSessionsList] = useState<SessionRow[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [rollCallMap, setRollCallMap] = useState<Record<string, RollCallEntry[]>>({});
  const [rollCallLoading, setRollCallLoading] = useState<string | null>(null);

  // ── Semester Summary ────────────────────────────────────────────────────────
  const [semesterRows, setSemesterRows] = useState<SemesterCourseRow[]>([]);
  const [semesterLoaded, setSemesterLoaded] = useState(false);
  const [expandedSemCourseId, setExpandedSemCourseId] = useState<string | null>(null);
  const [semRollCallMap, setSemRollCallMap] = useState<Record<string, CompilationRow[]>>({});

  // ── At-Risk ─────────────────────────────────────────────────────────────────
  const [atRiskCourseId, setAtRiskCourseId] = useState('');
  const [atRiskLecturerId, setAtRiskLecturerId] = useState('');
  const [atRiskThreshold, setAtRiskThreshold] = useState(75);
  const [atRiskStartDate, setAtRiskStartDate] = useState('');
  const [atRiskEndDate, setAtRiskEndDate] = useState('');
  const [atRiskData, setAtRiskData] = useState<CompilationRow[]>([]);
  const [atRiskTitle, setAtRiskTitle] = useState('');
  const [showAtRiskExportMenu, setShowAtRiskExportMenu] = useState(false);

  // ── Live summary stats ───────────────────────────────────────────────────────
  const summaryStats = useLiveQuery(async () => {
    const studentCount = await db.students.filter(s => s.isDeleted !== 1).count();
    if (!activeSemester) return { studentCount, totalSessions: 0, avgRate: 0, courseCount: 0 };
    const semCourses = await db.courses
      .where('semesterId').equals(activeSemester.serverId)
      .filter(c => c.isDeleted !== 1).toArray();

    const courseIds = semCourses.map(c => c.serverId);
    const sessions = await db.attendanceSessions
      .where('courseId').anyOf(courseIds)
      .filter(s => s.isDeleted !== 1 && (!sessionsLecturerId || s.lecturerId === sessionsLecturerId)).toArray();

    const totalSessions = sessions.length;
    let totalPresent = 0;
    let totalRecords = 0;

    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.serverId);
      const recs = await db.attendanceRecords
        .where('sessionId').anyOf(sessionIds)
        .filter(r => r.isDeleted !== 1).toArray();
      totalPresent = recs.filter(r => r.status === 'present').length;
      totalRecords = recs.length;
    }
    return {
      studentCount, totalSessions,
      avgRate: totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0,
      courseCount: semCourses.length,
    };
  }, [activeSemester, sessionsLecturerId]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Load courses ──────────────────────────────────────────────────────────
  const loadCourses = useCallback(async () => {
    if (!user) return;
    const local = await db.courses.filter(c => c.isDeleted !== 1 && (!activeSemester || c.semesterId === activeSemester.serverId)).toArray();
    if (local.length > 0) {
      setCourses(local.map(c => ({ id: c.serverId, code: c.code, title: c.title, lecturers: c.lecturers || '' })));
      return;
    }
    let query = supabase.from('courses').select('id, code, title, lecturers').eq('user_id', user.id).eq('is_deleted', 0);
    if (activeSemester) query = query.eq('semester_id', activeSemester.serverId);
    const { data } = await query;
    if (data) setCourses(data);
  }, [user, activeSemester]);

  // Load courses on mount so dropdowns are ready for all tabs
  // Removed loadCourses effect to prevent cascading renders

  const handleModeSwitch = (newMode: ArchiveMode) => {
    setMode(newMode);
    if (newMode !== 'student' && courses.length === 0) loadCourses();
  };

  const getCourseLecturerOptions = useCallback((courseId: string) => {
    if (!courseId) return lecturers;
    const course = courses.find(c => c.id === courseId);
    const raw = course?.lecturers?.trim();
    if (!raw) return lecturers;
    const ids = new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
    return lecturers.filter(l => ids.has(l.serverId));
  }, [courses, lecturers]);

  const compilationLecturers = useMemo(
    () => getCourseLecturerOptions(selectedCourseId),
    [getCourseLecturerOptions, selectedCourseId]
  );
  const sessionsLecturers = useMemo(
    () => getCourseLecturerOptions(sessionsCourseId),
    [getCourseLecturerOptions, sessionsCourseId]
  );
  const atRiskLecturers = useMemo(
    () => getCourseLecturerOptions(atRiskCourseId),
    [getCourseLecturerOptions, atRiskCourseId]
  );

  // Replaced with derived state

  // Replaced with derived state

  // Replaced with derived state

  // ── Name autocomplete ──────────────────────────────────────────────────────
  const handleQueryChange = async (value: string) => {
    setSearchQuery(value);
    if (value.length < 2) { setNameSuggestions([]); setShowSuggestions(false); return; }
    if (!REG_NUMBER_PATTERN.test(value)) {
      const lo = value.toLowerCase();
      const matches = await db.students
        .filter(s => s.isDeleted !== 1 && s.name.toLowerCase().includes(lo))
        .limit(6).toArray();
      setNameSuggestions(matches.map(s => ({ serverId: s.serverId, name: s.name, regNumber: s.regNumber })));
      setShowSuggestions(matches.length > 0);
    } else {
      setNameSuggestions([]); setShowSuggestions(false);
    }
  };

  // ── Shared attendance history fetch ───────────────────────────────────────
  const doStudentFetch = async (student: { serverId: string }): Promise<AttendanceDetail[]> => {
    // Query local DB first (faster and works offline / before sync)
    const localRecords = await db.attendanceRecords
      .where('studentId').equals(student.serverId)
      .filter(r => r.isDeleted !== 1)
      .toArray();

    if (localRecords.length > 0) {
      // N+1 Optimization: Batch fetch all sessions and courses instead of querying in the loop
      const sessionIds = [...new Set(localRecords.map(r => r.sessionId))];
      const sessions = await db.attendanceSessions.where('serverId').anyOf(sessionIds).filter(s => s.isDeleted !== 1 && (!sessionsLecturerId || s.lecturerId === sessionsLecturerId)).toArray();
      const sessionMap = new Map(sessions.map(s => [s.serverId, s]));

      const courseIds = [...new Set(sessions.map(s => s.courseId))];
      const courses = await db.courses.where('serverId').anyOf(courseIds).filter(c => c.isDeleted !== 1).toArray();
      const courseMap = new Map(courses.map(c => [c.serverId, c]));

      const details: AttendanceDetail[] = [];
      for (const record of localRecords) {
        const session = sessionMap.get(record.sessionId);
        if (!session) continue;
        const course = courseMap.get(session.courseId);
        if (!course) continue;
        details.push({
          status: record.status,
          timestamp: new Date(record.timestamp).toISOString(),
          session: { date: session.date, title: session.title },
          course: { code: course.code, title: course.title },
        });
      }
      if (details.length > 0) {
        return details.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      }
    }

    // Fall back to Supabase for historical data not yet in local DB
    if (!navigator.onLine) {
      toast.error('No local records found. Connect to the internet to load historical data.');
      return [];
    }
    const { data: records, error } = await supabase
      .from('attendance_records')
      .select('status, marked_at, attendance_sessions (date, title, courses (code, title))')
      .eq('student_id', student.serverId)
      .eq('is_deleted', 0)
      .order('marked_at', { ascending: false });
    if (error) { toast.error('Failed to fetch history from cloud.'); return []; }
     const typedRecords = (records || []) as unknown as SupabaseAttendanceRecordRow[];
    return typedRecords
      .filter(r => r.attendance_sessions?.courses)
      .map(r => ({
        status: r.status,
        timestamp: typeof r.marked_at === 'number'
          ? new Date(r.marked_at).toISOString()
          : String(r.marked_at),
        session: { date: r.attendance_sessions!.date, title: r.attendance_sessions!.title },
        course: { code: r.attendance_sessions!.courses!.code, title: r.attendance_sessions!.courses!.title },
      }));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true); setStudentPage(1);
    setStudentCourseFilter(''); setStudentDateStart(''); setStudentDateEnd('');
    setNameSuggestions([]); setShowSuggestions(false);
    setShowCompare(false); setCompareResult(null); setCompareAttendance([]);
    setExpandedCourses(new Set());

    let student: LocalStudent | null = await db.students.where('regNumber').equals(searchQuery.trim()).first() ?? null;
    if (!student) {
      const lo = searchQuery.trim().toLowerCase();
      student = await db.students.filter(s => s.isDeleted !== 1 && s.name.toLowerCase() === lo).first() ?? null;
    }
    if (!student) {
      const { data } = await supabase.from('students').select('*')
        .eq('reg_number', searchQuery.trim()).maybeSingle();
      const row = data as SupabaseStudentRow | null;
      if (row) student = { serverId: row.id, name: row.name, regNumber: row.reg_number, isDeleted: 0, synced: 1 };
    }
    if (!student) {
      const { data } = await supabase.from('students').select('*')
        .ilike('name', `%${searchQuery.trim()}%`).limit(1);
      const rows = (data || []) as SupabaseStudentRow[];
      if (rows[0]) {
        const d = rows[0];
        student = { serverId: d.id, name: d.name, regNumber: d.reg_number, isDeleted: 0, synced: 1 };
      }
    }
    if (!student) {
      setStudentResult(null); setStudentAttendance([]);
      toast.error('Student not found.'); setLoading(false); return;
    }
    setStudentResult(student);
    const details = await doStudentFetch(student);
    setStudentAttendance(details);
    setLoading(false);
  };

  const handleSelectSuggestion = async (s: NameSuggestion) => {
    setSearchQuery(s.regNumber); setShowSuggestions(false);
    setLoading(true); setStudentPage(1);
    setStudentCourseFilter(''); setStudentDateStart(''); setStudentDateEnd('');
    setExpandedCourses(new Set());
    setStudentResult({ ...s, isDeleted: 0, synced: 1 });
    const details = await doStudentFetch(s);
    setStudentAttendance(details);
    setLoading(false);
  };

  const clearStudentSearch = () => {
    setSearchQuery(''); setStudentResult(null); setStudentAttendance([]);
    setShowSuggestions(false); setStudentCourseFilter('');
    setStudentDateStart(''); setStudentDateEnd('');
    setShowCompare(false); setCompareResult(null); setCompareAttendance([]);
    setExpandedCourses(new Set());
  };

  // ── Compare second student ────────────────────────────────────────────────
  const handleCompareSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compareQuery.trim()) return;
    setLoading(true);
    let student: LocalStudent | null = await db.students.where('regNumber').equals(compareQuery.trim()).first() ?? null;
    if (!student) {
      const lo = compareQuery.trim().toLowerCase();
      student = await db.students.filter(s => s.isDeleted !== 1 && s.name.toLowerCase() === lo).first() ?? null;
    }
    if (!student) {
      const { data } = await supabase.from('students').select('*')
        .eq('reg_number', compareQuery.trim()).maybeSingle();
      const row = data as SupabaseStudentRow | null;
      if (row) student = { serverId: row.id, name: row.name, regNumber: row.reg_number, isDeleted: 0, synced: 1 };
    }
    if (!student) { toast.error('Second student not found.'); setLoading(false); return; }
    setCompareResult(student);
    const details = await doStudentFetch(student);
    setCompareAttendance(details);
    setLoading(false);
  };

  // ── Per-course summaries ──────────────────────────────────────────────────
  const buildCourseSummaries = (attendance: AttendanceDetail[]) => {
    const map: Record<string, {
      code: string; title: string;
      present: number; absent: number; excused: number; total: number;
      records: AttendanceDetail[];
    }> = {};
    for (const r of attendance) {
      if (!map[r.course.code]) map[r.course.code] = { code: r.course.code, title: r.course.title, present: 0, absent: 0, excused: 0, total: 0, records: [] };
      map[r.course.code].total++;
      map[r.course.code].records.push(r);
      if (r.status === 'present') map[r.course.code].present++;
      else if (r.status === 'absent') map[r.course.code].absent++;
      else map[r.course.code].excused++;
    }
    return Object.values(map).sort((a, b) => (b.present / (b.total || 1)) - (a.present / (a.total || 1)));
  };

  const courseSummaries = useMemo(() => buildCourseSummaries(studentAttendance), [studentAttendance]);

  const overallStudentPct = useMemo(() =>
    studentAttendance.length
      ? Math.round(studentAttendance.filter(r => r.status === 'present').length / studentAttendance.length * 100)
      : 0,
  [studentAttendance]);

  const overallComparePct = useMemo(() =>
    compareAttendance.length
      ? Math.round(compareAttendance.filter(r => r.status === 'present').length / compareAttendance.length * 100)
      : 0,
  [compareAttendance]);

  const filteredStudentAttendance = useMemo(() =>
    studentAttendance
      .filter(r => !studentCourseFilter || r.course.code === studentCourseFilter)
      .filter(r => !studentDateStart || r.session.date >= studentDateStart)
      .filter(r => !studentDateEnd   || r.session.date <= studentDateEnd),
  [studentAttendance, studentCourseFilter, studentDateStart, studentDateEnd]);

  const studentTotalPages = Math.ceil(filteredStudentAttendance.length / studentItemsPerPage);
  const displayedStudentRecords = filteredStudentAttendance.slice(
    (studentPage - 1) * studentItemsPerPage,
    studentPage * studentItemsPerPage,
  );

  const absenceStreak = (courseCode: string, attendance: AttendanceDetail[]) => {
    const recs = attendance
      .filter(r => r.course.code === courseCode)
      .sort((a, b) => {
        // Use string comparison for ISO date strings (avoids Date allocation per call)
        if (b.session.date > a.session.date) return 1;
        if (b.session.date < a.session.date) return -1;
        return 0;
      });
    let streak = 0;
    for (const r of recs) { if (r.status === 'absent') streak++; else break; }
    return streak;
  };

  const toggleCourseSection = (code: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  // ── Shared compile logic ──────────────────────────────────────────────────
  const compileForCourse = async (courseId: string, sDate: string, eDate: string, lecturerId?: string): Promise<CompilationRow[]> => {
    // Query local DB first
    const localSessions = await db.attendanceSessions
      .where('courseId').equals(courseId)
      .filter(s => s.isDeleted !== 1 && (!lecturerId || s.lecturerId === lecturerId) && s.date >= sDate && s.date <= eDate)
      .toArray();
    const localEnrollments = await db.enrollments
      .where('courseId').equals(courseId)
      .filter(e => e.isDeleted !== 1)
      .toArray();

    if (localSessions.length > 0 && localEnrollments.length > 0) {
      const totalSessions = localSessions.length;
      const sessionIds = localSessions.map(s => s.serverId);
      const allRecords = await db.attendanceRecords
        .where('sessionId').anyOf(sessionIds)
        .filter(r => r.isDeleted !== 1)
        .toArray();

      const studentIds = localEnrollments.map(e => e.studentId);
      const students = await db.students.where('serverId').anyOf(studentIds).filter(s => s.isDeleted !== 1).toArray();
      const studentMap = new Map(students.map(s => [s.serverId, s]));

      // Performance optimization: Pre-calculate counts instead of filtering arrays inside the loop O(N*M) -> O(N+M)
      const studentStatsMap = new Map<string, { present: number; absent: number; excused: number }>();
      for (const r of allRecords) {
        if (!studentStatsMap.has(r.studentId)) {
          studentStatsMap.set(r.studentId, { present: 0, absent: 0, excused: 0 });
        }
        const stats = studentStatsMap.get(r.studentId)!;
        if (r.status === 'present') stats.present++;
        else if (r.status === 'absent') stats.absent++;
        else if (r.status === 'excused') stats.excused++;
      }

      const rows: CompilationRow[] = [];
      for (const enrollment of localEnrollments) {
        const student = studentMap.get(enrollment.studentId);
        if (!student) continue;
        const stats = studentStatsMap.get(enrollment.studentId) || { present: 0, absent: 0, excused: 0 };
        rows.push({
          name: student.name, regNumber: student.regNumber,
          totalSessions, presentCount: stats.present, absentCount: stats.absent, excusedCount: stats.excused,
          percentage: totalSessions > 0 ? Math.round((stats.present / totalSessions) * 100) : 0,
        });
      }
      if (rows.length > 0) {
        return rows.sort((a, b) => b.percentage - a.percentage);
      }
    }

    // Fall back to Supabase for historical data not yet in local DB
    if (!navigator.onLine) { return []; }
    let sessionQuery = supabase
      .from('attendance_sessions').select('id, date, title')
      .eq('course_id', courseId).eq('is_deleted', 0)
      .gte('date', sDate).lte('date', eDate);
    if (lecturerId) sessionQuery = sessionQuery.eq('lecturer_id', lecturerId);
    const { data: sessions, error: sessErr } = await sessionQuery.order('date', { ascending: true });
    const sessionRows = (sessions || []) as SupabaseSessionRow[];
    if (sessErr || sessionRows.length === 0) return [];
    const { data: records } = await supabase
      .from('attendance_records').select('student_id, status, session_id')
      .in('session_id', sessionRows.map(s => s.id)).eq('is_deleted', 0);
    const { data: enrollments } = await supabase
      .from('enrollments').select('student_id, students (id, name, reg_number)')
      .eq('course_id', courseId).eq('is_deleted', 0);
    const enrollmentRows = (enrollments || []) as unknown as SupabaseEnrollmentRow[];
    if (enrollmentRows.length === 0) return [];
    const totalSessions = sessionRows.length;

    // Performance optimization: Pre-calculate counts O(N+M)
    const studentStatsMap = new Map<string, { present: number; absent: number; excused: number }>();
    for (const r of (records || []) as unknown as SupabaseSessionRecordRow[]) {
      if (!studentStatsMap.has((r as any).student_id)) {
        studentStatsMap.set((r as any).student_id, { present: 0, absent: 0, excused: 0 });
      }
      const stats = studentStatsMap.get((r as any).student_id)!;
      if (r.status === 'present') stats.present++;
      else if (r.status === 'absent') stats.absent++;
      else if (r.status === 'excused') stats.excused++;
    }

    return enrollmentRows.map(enr => {
      const student = enr.students;
      const stats = studentStatsMap.get(student.id) || { present: 0, absent: 0, excused: 0 };
      return {
        name: student.name, regNumber: student.reg_number,
        totalSessions, presentCount: stats.present, absentCount: stats.absent, excusedCount: stats.excused,
        percentage: totalSessions > 0 ? Math.round((stats.present / totalSessions) * 100) : 0,
      };
    }).sort((a: CompilationRow, b: CompilationRow) => b.percentage - a.percentage);
  };

  // ── Compilation handlers ──────────────────────────────────────────────────
  const handleCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !startDate || !endDate) { toast.error('Select a course and date range.'); return; }
    setLoading(true); setCompilationData([]); setFilterChip(''); setCompilationPage(1);
    const c = courses.find(c => c.id === selectedCourseId);
    const title = `${c?.code || 'Course'} — ${c?.title || ''}`;
    setCompilationTitle(title);
    const rows = await compileForCourse(selectedCourseId, startDate, endDate, compilationLecturerId);
    if (rows.length === 0) toast.error('No sessions or enrollments found.');
    setCompilationData(rows);
    savePersistedCompilation(selectedCourseId, startDate, endDate, rows, title);
    setLoading(false);
  };

  const processedCompilation = useMemo(() => {
    let data = [...compilationData];
    if (filterChip === 'atrisk')       data = data.filter(r => r.percentage < 75);
    else if (filterChip === 'perfect') data = data.filter(r => r.percentage === 100);
    else if (filterChip === 'excused') data = data.filter(r => r.excusedCount > 0);
    data.sort((a, b) => {
      const va = a[sortField] as string | number;
      const vb = b[sortField] as string | number;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return data;
  }, [compilationData, filterChip, sortField, sortDir]);

  const compilationTotalPages = Math.ceil(processedCompilation.length / compilationItemsPerPage);
  const displayedCompilation = processedCompilation.slice(
    (compilationPage - 1) * compilationItemsPerPage,
    compilationPage * compilationItemsPerPage,
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setCompilationPage(1);
  };

  const buildExportRows = (data: CompilationRow[]) =>
    data.map((row, idx) => ({
      'S/N': idx + 1, 'Name': row.name, 'Reg Number': row.regNumber,
      'Total Sessions': row.totalSessions, 'Present': row.presentCount,
      'Absent': row.absentCount, 'Excused': row.excusedCount,
      'Attendance %': `${row.percentage}%`,
    }));

  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf' | 'text' | 'share' | 'semester') => {
    setShowExportMenu(false);
    const profile = useAuthStore.getState().profile;
    const meta = { faculty: profile?.faculty, department: profile?.department, level: profile?.level };
    if (format === 'semester') { await handleExportSemester(meta); return; }
    const filename = `attendance_${compilationTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${startDate}_to_${endDate}`;
    const title    = `Attendance Compilation: ${compilationTitle} | ${startDate} to ${endDate}`;
    const exportData = buildExportRows(compilationData);
    switch (format) {
      case 'csv':   exportToCSV(exportData, filename, meta);        toast.success('CSV downloaded!');   break;
      case 'xlsx':  exportToXLSX(exportData, filename, meta);       toast.success('Excel downloaded!'); break;
      case 'pdf':   exportToPDF(exportData, title, filename, meta); toast.success('PDF downloaded!');   break;
      case 'text':  { const t = exportToText(exportData, title, meta); downloadText(t, filename); toast.success('Text downloaded!'); break; }
      case 'share': { const t = exportToText(exportData, title, meta); shareData(t, title).then(ok => { if (ok) toast.success('Shared!'); }); break; }
    }
  };

  const handleExportSemester = async (meta?: { faculty?: string; department?: string; level?: string }) => {
    if (!activeSemester || courses.length === 0) { toast.error('No active semester or courses loaded.'); return; }
    setLoading(true);
    const resolved = meta ?? (() => {
      const p = useAuthStore.getState().profile;
      return { faculty: p?.faculty, department: p?.department, level: p?.level };
    })();
    const sDate = startDate || activeSemester.startDate || `${new Date().getFullYear()}-01-01`;
    const eDate = endDate   || activeSemester.endDate   || `${new Date().getFullYear()}-12-31`;
    const sheets: Array<{ name: string; data: ReturnType<typeof buildExportRows> }> = [];
    for (const course of courses) {
      const rows = await compileForCourse(course.id, sDate, eDate);
      if (rows.length > 0) sheets.push({ name: course.code, data: buildExportRows(rows) });
    }
    if (sheets.length === 0) { toast.error('No data found for any course.'); setLoading(false); return; }
    const filename = `semester_${activeSemester.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    exportToMultiSheetXLSX(sheets, filename, resolved);
    toast.success(`Semester workbook (${sheets.length} sheet${sheets.length !== 1 ? 's' : ''}) downloaded!`);
    setLoading(false);
  };

  // ── Session Drill-Down ────────────────────────────────────────────────────
  const handleLoadSessions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionsCourseId) { toast.error('Select a course.'); return; }
    setLoading(true); setSessionsList([]); setExpandedSessionId(null); setRollCallMap({});

    // Query local DB first
    const localSessions = await db.attendanceSessions
      .where('courseId').equals(sessionsCourseId)
      .filter(s => s.isDeleted !== 1 && (!sessionsLecturerId || s.lecturerId === sessionsLecturerId))
      .toArray();
    const localEnrollments = await db.enrollments
      .where('courseId').equals(sessionsCourseId)
      .filter(e => e.isDeleted !== 1)
      .toArray();

    if (localSessions.length > 0) {
      const totalEnrolled = localEnrollments.length;
      const sessionIds = localSessions.map(s => s.serverId);
      const allRecords = await db.attendanceRecords
        .where('sessionId').anyOf(sessionIds)
        .filter(r => r.isDeleted !== 1)
        .toArray();
      // Performance optimization: Group records by sessionId O(N+M)
      const sessionStatsMap = new Map<string, { present: number; absent: number; excused: number }>();
      for (const r of allRecords) {
        if (!sessionStatsMap.has(r.sessionId)) {
          sessionStatsMap.set(r.sessionId, { present: 0, absent: 0, excused: 0 });
        }
        const stats = sessionStatsMap.get(r.sessionId)!;
        if (r.status === 'present') stats.present++;
        else if (r.status === 'absent') stats.absent++;
        else if (r.status === 'excused') stats.excused++;
      }

      const list: SessionRow[] = localSessions
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(s => {
          const stats = sessionStatsMap.get(s.serverId) || { present: 0, absent: 0, excused: 0 };
          return {
            id: s.serverId, date: s.date, title: s.title, totalEnrolled,
            presentCount: stats.present, absentCount: stats.absent, excusedCount: stats.excused,
            attendanceRate: totalEnrolled > 0 ? Math.round((stats.present / totalEnrolled) * 100) : 0,
          };
        });
      setSessionsList(list);
      setLoading(false);
      return;
    }

    // Fall back to Supabase for historical data
    if (!navigator.onLine) { toast.error('Session data requires an internet connection.'); setLoading(false); return; }
    let sessionsQuery = supabase.from('attendance_sessions').select('id, date, title')
      .eq('course_id', sessionsCourseId).eq('is_deleted', 0);
    if (sessionsLecturerId) sessionsQuery = sessionsQuery.eq('lecturer_id', sessionsLecturerId);

    const [sessRes, enrollRes] = await Promise.all([
      sessionsQuery.order('date', { ascending: false }),
      supabase.from('enrollments').select('student_id')
        .eq('course_id', sessionsCourseId).eq('is_deleted', 0),
    ]);
    if (sessRes.error || !sessRes.data) { toast.error('Failed to load sessions.'); setLoading(false); return; }
    const sessionRows = (sessRes.data || []) as SupabaseSessionRow[];
    if (sessionRows.length === 0) { toast.error('No sessions found.'); setLoading(false); return; }
    const totalEnrolled = enrollRes.data?.length ?? 0;
    const { data: records } = await supabase
      .from('attendance_records').select('session_id, status')
      .in('session_id', sessionRows.map(s => s.id)).eq('is_deleted', 0);
    // Performance optimization: Pre-calculate counts O(N+M)
    const sessionStatsMap = new Map<string, { present: number; absent: number; excused: number }>();
    for (const r of (records || []) as SupabaseSessionRecordRow[]) {
      if (!sessionStatsMap.has(r.session_id)) {
        sessionStatsMap.set(r.session_id, { present: 0, absent: 0, excused: 0 });
      }
      const stats = sessionStatsMap.get(r.session_id)!;
      if (r.status === 'present') stats.present++;
      else if (r.status === 'absent') stats.absent++;
      else if (r.status === 'excused') stats.excused++;
    }

    setSessionsList(sessionRows.map(s => {
      const stats = sessionStatsMap.get(s.id) || { present: 0, absent: 0, excused: 0 };
      return {
        id: s.id, date: s.date, title: s.title, totalEnrolled,
        presentCount: stats.present, absentCount: stats.absent, excusedCount: stats.excused,
        attendanceRate: totalEnrolled > 0 ? Math.round((stats.present / totalEnrolled) * 100) : 0,
      };
    }));
    setLoading(false);
  };

  const handleExpandSession = async (sessionId: string) => {
    if (expandedSessionId === sessionId) { setExpandedSessionId(null); return; }
    setExpandedSessionId(sessionId);
    if (rollCallMap[sessionId]) return;
    setRollCallLoading(sessionId);

    // Query local DB first
    const localRecords = await db.attendanceRecords
      .where('sessionId').equals(sessionId)
      .filter(r => r.isDeleted !== 1)
      .toArray();

    if (localRecords.length > 0) {
      const ORDER: Record<string, number> = { present: 0, excused: 1, absent: 2 };
      const studentIds = localRecords.map(r => r.studentId);
      const students = await db.students.where('serverId').anyOf(studentIds).filter(s => s.isDeleted !== 1).toArray();
      const studentMap = new Map(students.map(s => [s.serverId, s]));

      const entries: RollCallEntry[] = [];
      for (const record of localRecords) {
        const student = studentMap.get(record.studentId);
        if (!student) continue;
        entries.push({ name: student.name, regNumber: student.regNumber, status: record.status });
      }
      entries.sort((a, b) => ORDER[a.status] - ORDER[b.status]);
      setRollCallMap(prev => ({ ...prev, [sessionId]: entries }));
      setRollCallLoading(null);
      return;
    }

    // Fall back to Supabase
    if (!navigator.onLine) { setRollCallLoading(null); return; }
    const { data: records } = await supabase
      .from('attendance_records')
      .select('status, students (name, reg_number)')
      .eq('session_id', sessionId).eq('is_deleted', 0);
    if (records) {
      const ORDER: Record<string, number> = { present: 0, excused: 1, absent: 2 };
      const rows = (records || []) as unknown as SupabaseRollCallRow[];
      const entries: RollCallEntry[] = rows
        .filter(r => r.students)
        .map(r => ({ name: r.students!.name, regNumber: r.students!.reg_number, status: r.status as RollCallEntry['status'] }))
        .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
      setRollCallMap(prev => ({ ...prev, [sessionId]: entries }));
    }
    setRollCallLoading(null);
  };

  // ── Semester Summary ──────────────────────────────────────────────────────
  const handleLoadSemesterSummary = async () => {
    if (!activeSemester) { toast.error('No active semester.'); return; }
    setLoading(true); setSemesterRows([]); setSemesterLoaded(false);

    const semCourses = courses; // courses is already filtered by activeSemester
    if (semCourses.length === 0 && courses.length === 0) {
      const local = await db.courses.where('semesterId').equals(activeSemester.serverId).filter(c => c.isDeleted !== 1).toArray();
      semCourses.push(...local.map(c => ({ id: c.serverId, code: c.code, title: c.title })));
    }

    if (semCourses.length === 0) { toast.error('No courses for this semester.'); setLoading(false); return; }
    const sDate = activeSemester.startDate || `${new Date().getFullYear()}-01-01`;
    const eDate = activeSemester.endDate   || `${new Date().getFullYear()}-12-31`;

    const courseIds = semCourses.map(c => c.id);
    const [sessRes, enrollRes] = await Promise.all([
      supabase.from('attendance_sessions').select('id, course_id')
        .in('course_id', courseIds).eq('is_deleted', 0)
        .gte('date', sDate).lte('date', eDate),
      supabase.from('enrollments').select('student_id, course_id')
        .in('course_id', courseIds).eq('is_deleted', 0),
    ]);

    const allSessions = (sessRes.data || []) as { id: string; course_id: string }[];
    const allEnrollments = (enrollRes.data || []) as { student_id: string; course_id: string }[];
    const sessionIds = allSessions.map(s => s.id);

    let allRecords: { status: string; session_id: string }[] = [];
    if (sessionIds.length > 0) {
      const { data: recs } = await supabase.from('attendance_records').select('status, session_id')
        .in('session_id', sessionIds).eq('is_deleted', 0);
      allRecords = (recs || []) as { status: string; session_id: string }[];
    }

    const sessionsByCourse = new Map<string, typeof allSessions>();
    allSessions.forEach(s => {
      if (!sessionsByCourse.has(s.course_id)) sessionsByCourse.set(s.course_id, []);
      sessionsByCourse.get(s.course_id)!.push(s);
    });

    const enrollCountByCourse = new Map<string, number>();
    allEnrollments.forEach(e => {
      enrollCountByCourse.set(e.course_id, (enrollCountByCourse.get(e.course_id) || 0) + 1);
    });

    const recordsBySession = new Map<string, typeof allRecords>();
    allRecords.forEach(r => {
      if (!recordsBySession.has(r.session_id)) recordsBySession.set(r.session_id, []);
      recordsBySession.get(r.session_id)!.push(r);
    });

    const rows: SemesterCourseRow[] = semCourses.map(course => {
      const sessions = sessionsByCourse.get(course.id) || [];
      const enrolledCount = enrollCountByCourse.get(course.id) || 0;
      let presentCount = 0; let absentCount = 0; let excusedCount = 0;

      sessions.forEach(s => {
        const recs = recordsBySession.get(s.id) || [];
        recs.forEach(r => {
          if (r.status === 'present') presentCount++;
          else if (r.status === 'absent') absentCount++;
          else if (r.status === 'excused') excusedCount++;
        });
      });

      const total = sessions.length * enrolledCount;
      return {
        courseId: course.id, code: course.code, title: course.title,
        sessionsHeld: sessions.length, enrolledCount,
        avgAttendance: total > 0 ? Math.round((presentCount / total) * 100) : 0,
        presentCount, absentCount, excusedCount,
      };
    });
    rows.sort((a, b) => a.avgAttendance - b.avgAttendance); // worst first
    setSemesterRows(rows);
    setSemesterLoaded(true);
    setLoading(false);
  };

  const handleExpandSemCourse = async (courseId: string) => {
    if (expandedSemCourseId === courseId) { setExpandedSemCourseId(null); return; }
    setExpandedSemCourseId(courseId);
    if (semRollCallMap[courseId]) return;
    if (!activeSemester) return;
    const sDate = activeSemester.startDate || `${new Date().getFullYear()}-01-01`;
    const eDate = activeSemester.endDate   || `${new Date().getFullYear()}-12-31`;
    const rows = await compileForCourse(courseId, sDate, eDate);
    setSemRollCallMap(prev => ({ ...prev, [courseId]: rows }));
  };

  // ── At-Risk handlers ──────────────────────────────────────────────────────
  const handleAtRiskCompile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!atRiskCourseId || !atRiskStartDate || !atRiskEndDate) { toast.error('Fill all fields.'); return; }
    setLoading(true); setAtRiskData([]);
    const c = courses.find(c => c.id === atRiskCourseId);
    setAtRiskTitle(`${c?.code || 'Course'} — ${c?.title || ''}`);
    const rows = await compileForCourse(atRiskCourseId, atRiskStartDate, atRiskEndDate, atRiskLecturerId);
    const atRisk = rows.filter(r => r.percentage < atRiskThreshold);
    setAtRiskData(atRisk);
    if (atRisk.length === 0) toast.success('No at-risk students found! 🎉');
    setLoading(false);
  };

  const handleAtRiskExport = (format: 'csv' | 'xlsx' | 'pdf' | 'text' | 'share') => {
    setShowAtRiskExportMenu(false);
    const profile = useAuthStore.getState().profile;
    const meta = { faculty: profile?.faculty, department: profile?.department, level: profile?.level };
    const filename = `at_risk_${atRiskTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${atRiskStartDate}_to_${atRiskEndDate}`;
    const title    = `At-Risk Report (below ${atRiskThreshold}%): ${atRiskTitle} | ${atRiskStartDate} to ${atRiskEndDate}`;
    const exportData = atRiskData.map((row, idx) => ({
      'S/N': idx + 1, 'Name': row.name, 'Reg Number': row.regNumber,
      'Total Sessions': row.totalSessions, 'Present': row.presentCount,
      'Absent': row.absentCount, 'Excused': row.excusedCount,
      'Attendance %': `${row.percentage}%`,
      'Status': `AT RISK (below ${atRiskThreshold}%)`,
    }));
    switch (format) {
      case 'csv':   exportToCSV(exportData, filename, meta);        toast.success('CSV downloaded!');   break;
      case 'xlsx':  exportToXLSX(exportData, filename, meta);       toast.success('Excel downloaded!'); break;
      case 'pdf':   exportToPDF(exportData, title, filename, meta); toast.success('PDF downloaded!');   break;
      case 'text':  { const t = exportToText(exportData, title, meta); downloadText(t, filename); toast.success('Text downloaded!'); break; }
      case 'share': { const t = exportToText(exportData, title, meta); shareData(t, title).then(ok => { if (ok) toast.success('Shared!'); }); break; }
    }
  };

  // ── Tab config ────────────────────────────────────────────────────────────
  const tabs: Array<{ id: ArchiveMode; label: string; icon: React.ReactNode }> = [
    { id: 'student',     label: 'LOOKUP',   icon: <Search size={10} />        },
    { id: 'compilation', label: 'COMPILE',  icon: <BarChart3 size={10} />     },
    { id: 'sessions',    label: 'SESSIONS', icon: <BookOpen size={10} />      },
    { id: 'semester',    label: 'SEMESTER', icon: <LayoutGrid size={10} />    },
    { id: 'atrisk',      label: 'AT-RISK',  icon: <AlertTriangle size={10} /> },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="archives-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>

      {/* ── Header ── */}
      <div className="bg-white border-bottom px-4 py-4 mb-3 shadow-sm sticky-top archives-form" style={{ zIndex: 100 }}>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <div>
            <h1 className="h4 fw-black mb-0 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>
              DATA ARCHIVES
            </h1>
            <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">
              Institutional Search Engine
            </p>
          </div>
          <button
            className="btn btn-light btn-sm rounded-3 border d-flex align-items-center gap-1 fw-bold xx-small shadow-sm"
            onClick={() => window.print()}
            title="Print current view"
          >
            <Printer size={13} /> PRINT
          </button>
        </div>

        {/* 5-tab switcher */}
        <div className="mode-switcher-wrapper p-1 shadow-sm border my-3">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`mode-btn ${mode === tab.id ? 'active' : ''}`}
              style={{ padding: '6px 2px', fontSize: '9px' }}
              onClick={() => handleModeSwitch(tab.id)}
            >
              {tab.icon}<span className="ms-1">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Student Lookup form */}
        {mode === 'student' && (
          <div ref={suggestRef} className="position-relative">
            <form onSubmit={handleSearch}>
              <div className="modern-input-unified p-1 d-flex align-items-center bg-light shadow-inner">
                <Search size={20} className="text-muted ms-3" />
                <input
                  type="text"
                  className="form-control border-0 bg-transparent py-3 fw-bold font-monospace letter-spacing-1"
                  placeholder="Reg number or student name…"
                  value={searchQuery}
                  onChange={e => handleQueryChange(e.target.value)}
                  onFocus={() => nameSuggestions.length > 0 && setShowSuggestions(true)}
                  autoComplete="off"
                />
                {searchQuery && (
                  <button type="button" className="btn btn-link p-0 me-2 text-muted" onClick={clearStudentSearch}>
                    <X size={16} />
                  </button>
                )}
                <button className="btn btn-primary rounded-3 px-4 fw-black xx-small me-1 py-2 shadow-sm" type="submit" disabled={loading}>
                  {loading ? '…' : 'GO'}
                </button>
              </div>
            </form>

            <AnimatePresence>
              {showSuggestions && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="position-absolute start-0 end-0 bg-white shadow-lg rounded-4 border mt-1 overflow-hidden"
                  style={{ zIndex: 200 }}
                >
                  {nameSuggestions.map((s, i) => (
                    <button
                      key={i}
                      className="w-100 text-start btn btn-light border-0 py-2 px-3 d-flex align-items-center gap-2 rounded-0"
                      onClick={() => handleSelectSuggestion(s)}
                    >
                      <div
                        className="bg-primary bg-opacity-10 text-primary rounded-2 d-flex align-items-center justify-content-center fw-black flex-shrink-0"
                        style={{ width: '28px', height: '28px', fontSize: '11px' }}
                      >
                        {s.name[0]}
                      </div>
                      <div>
                        <div className="fw-bold small text-dark text-uppercase">{s.name}</div>
                        <div className="xx-small text-muted font-monospace">{s.regNumber}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Compilation form */}
        {mode === 'compilation' && (
          <form onSubmit={handleCompile}>
            <div className="mb-2">
              <select className="form-select rounded-3 fw-bold border-light bg-light py-2" value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} required>
                <option value="">Select Course…</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>

            <div className="mb-2">
              <select className="form-select rounded-3 fw-bold border-light bg-light py-2" value={compilationLecturerId} onChange={e => setCompilationLecturerId(e.target.value)}>
                <option value="">All Lecturers</option>
                {compilationLecturers.map(l => <option key={l.serverId} value={l.serverId}>{l.name}</option>)}
              </select>
            </div>

            <div className="row g-2 mb-2">
              <div className="col-6">
                <div className="d-flex align-items-center gap-1">
                  <Calendar size={14} className="text-muted flex-shrink-0" />
                  <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
              </div>
              <div className="col-6">
                <div className="d-flex align-items-center gap-1">
                  <Calendar size={14} className="text-muted flex-shrink-0" />
                  <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
              </div>
            </div>
            <button className="btn btn-primary w-100 py-2 rounded-3 fw-black xx-small shadow-sm text-uppercase" type="submit" disabled={loading}>
              {loading ? 'Compiling…' : 'COMPILE ATTENDANCE'}
            </button>
          </form>
        )}

        {/* Sessions form */}
        {mode === 'sessions' && (
          <form onSubmit={handleLoadSessions}>
            <div className="mb-2">
              <select className="form-select rounded-3 fw-bold border-light bg-light py-2" value={sessionsCourseId} onChange={e => setSessionsCourseId(e.target.value)} required>
                <option value="">Select Course…</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>

            <div className="mb-2">
              <select className="form-select rounded-3 fw-bold border-light bg-light py-2" value={sessionsLecturerId} onChange={e => setSessionsLecturerId(e.target.value)}>
                <option value="">All Lecturers</option>
                {sessionsLecturers.map(l => <option key={l.serverId} value={l.serverId}>{l.name}</option>)}
              </select>
            </div>

            <button className="btn btn-primary w-100 py-2 rounded-3 fw-black xx-small shadow-sm text-uppercase" type="submit" disabled={loading}>
              {loading ? 'Loading…' : 'LOAD SESSIONS'}
            </button>
          </form>
        )}

        {/* Semester Summary form */}
        {mode === 'semester' && (
          <div>
            {activeSemester ? (
              <div className="d-flex align-items-center justify-content-between bg-light rounded-3 p-3 border">
                <div>
                  <div className="fw-black small text-dark text-uppercase">{activeSemester.name}</div>
                  <div className="xx-small text-muted font-monospace">{activeSemester.startDate} → {activeSemester.endDate}</div>
                </div>
                <button className="btn btn-primary btn-sm rounded-3 fw-black xx-small shadow-sm" onClick={handleLoadSemesterSummary} disabled={loading}>
                  {loading ? 'Loading…' : 'LOAD SUMMARY'}
                </button>
              </div>
            ) : (
              <div className="text-center py-2 xx-small text-muted fw-bold">No active semester selected.</div>
            )}
          </div>
        )}

        {/* At-Risk form */}
        {mode === 'atrisk' && (
          <form onSubmit={handleAtRiskCompile}>
            <div className="mb-2">
              <select className="form-select rounded-3 fw-bold border-light bg-light py-2" value={atRiskLecturerId} onChange={e => setAtRiskLecturerId(e.target.value)}>
                <option value="">All Lecturers</option>
                {atRiskLecturers.map(l => <option key={l.serverId} value={l.serverId}>{l.name}</option>)}
              </select>
            </div>
            <div className="mb-2">
              <select className="form-select rounded-3 fw-bold border-light bg-light py-2" value={atRiskCourseId} onChange={e => setAtRiskCourseId(e.target.value)} required>
                <option value="">Select Course…</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-6">
                <div className="d-flex align-items-center gap-1">
                  <Calendar size={14} className="text-muted flex-shrink-0" />
                  <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light" value={atRiskStartDate} onChange={e => setAtRiskStartDate(e.target.value)} required />
                </div>
              </div>
              <div className="col-6">
                <div className="d-flex align-items-center gap-1">
                  <Calendar size={14} className="text-muted flex-shrink-0" />
                  <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light" value={atRiskEndDate} onChange={e => setAtRiskEndDate(e.target.value)} required />
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-warning flex-shrink-0" />
              <span className="xx-small fw-bold text-muted">Threshold:</span>
              <input
                type="number" min={1} max={99}
                className="form-control form-control-sm rounded-3 fw-bold border-light bg-light"
                style={{ width: '70px' }}
                value={atRiskThreshold}
                onChange={e => setAtRiskThreshold(Number(e.target.value))}
              />
              <span className="xx-small fw-bold text-muted">%</span>
            </div>
            <button className="btn btn-danger w-100 py-2 rounded-3 fw-black xx-small shadow-sm text-uppercase" type="submit" disabled={loading}>
              {loading ? 'Analyzing…' : 'FIND AT-RISK STUDENTS'}
            </button>
          </form>
        )}
      </div>

      {/* ── Live Summary Stats Bar ── */}
      {summaryStats && (
        <div className="px-4 container-mobile mb-3">
          <div className="row g-2">
            {[
              { label: 'STUDENTS', value: summaryStats.studentCount,  colorClass: 'text-dark'    },
              { label: 'COURSES',  value: summaryStats.courseCount,   colorClass: 'text-primary' },
              { label: 'SESSIONS', value: summaryStats.totalSessions, colorClass: 'text-info'    },
              { label: 'AVG RATE', value: `${summaryStats.avgRate}%`, colorClass: summaryStats.avgRate >= 75 ? 'text-success' : 'text-danger' },
            ].map(stat => (
              <div key={stat.label} className="col-3">
                <div className="bg-white p-2 rounded-3 border text-center shadow-sm">
                  <div className={`fw-black small ${stat.colorClass}`}>{stat.value}</div>
                  <div className="xx-small fw-bold text-muted">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Content Area ── */}
      <div className="px-4 container-mobile archives-print-area">
        <AnimatePresence mode="wait">

          {/* ════════════════ STUDENT LOOKUP ════════════════ */}
          {mode === 'student' && (
            studentResult ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="student-results">

                {/* Compare toggle */}
                <div className="d-flex justify-content-end mb-2">
                  <button
                    className={`btn btn-sm rounded-pill fw-black xx-small px-3 shadow-sm ${showCompare ? 'btn-primary' : 'btn-light border'}`}
                    onClick={() => { setShowCompare(!showCompare); setCompareResult(null); setCompareAttendance([]); setCompareQuery(''); }}
                  >
                    <Users size={11} className="me-1" /> COMPARE
                  </button>
                </div>

                {showCompare ? (
                  /* ── Side-by-side compare cards ── */
                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <div className="card border-0 bg-white shadow-sm p-3 rounded-4" style={{ borderLeft: '4px solid #0d6efd' }}>
                        <div className="d-flex align-items-center gap-2">
                          <CircularProgress percentage={overallStudentPct} />
                          <div className="overflow-hidden">
                            <div className="fw-black small text-dark text-uppercase text-truncate">{studentResult.name}</div>
                            <div className="xx-small text-muted font-monospace">{studentResult.regNumber}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      {compareResult ? (
                        <div className="card border-0 bg-white shadow-sm p-3 rounded-4" style={{ borderLeft: '4px solid #6f42c1' }}>
                          <div className="d-flex align-items-center gap-2">
                            <CircularProgress percentage={overallComparePct} />
                            <div className="overflow-hidden">
                              <div className="fw-black small text-dark text-uppercase text-truncate">{compareResult.name}</div>
                              <div className="xx-small text-muted font-monospace">{compareResult.regNumber}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handleCompareSearch} className="h-100">
                          <div className="card border-0 bg-light shadow-sm p-3 rounded-4 h-100 d-flex flex-column justify-content-center">
                            <input
                              type="text"
                              className="form-control form-control-sm rounded-3 fw-bold border-light bg-white mb-2 xx-small"
                              placeholder="2nd reg / name…"
                              value={compareQuery}
                              onChange={e => setCompareQuery(e.target.value)}
                            />
                            <button className="btn btn-sm btn-outline-primary rounded-3 fw-black xx-small" type="submit" disabled={loading}>
                              {loading ? '…' : 'SEARCH'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── Sticky single-student profile card ── */
                  <div
                    className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-3 overflow-hidden"
                    style={{ position: 'sticky', top: 0, zIndex: 10, borderLeft: '4px solid #0d6efd' }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <CircularProgress percentage={overallStudentPct} />
                      <div className="flex-grow-1 overflow-hidden">
                        <h4 className="fw-black mb-0 text-dark text-uppercase letter-spacing-n1 text-truncate">{studentResult.name}</h4>
                        <p className="xx-small fw-black text-muted tracking-widest mb-2 font-monospace">{studentResult.regNumber}</p>
                        <div className="d-flex gap-2 flex-wrap">
                          <span className="badge bg-success bg-opacity-10 text-success fw-black xx-small px-2 py-1">{studentAttendance.filter(r => r.status === 'present').length} Present</span>
                          <span className="badge bg-danger bg-opacity-10 text-danger fw-black xx-small px-2 py-1">{studentAttendance.filter(r => r.status === 'absent').length} Absent</span>
                          {studentAttendance.filter(r => r.status === 'excused').length > 0 && (
                            <span className="badge bg-warning bg-opacity-10 text-warning fw-black xx-small px-2 py-1">{studentAttendance.filter(r => r.status === 'excused').length} Excused</span>
                          )}
                        </div>
                      </div>
                      {studentAttendance.length >= 3 && (
                        <div className="flex-shrink-0 text-end">
                          <div className="xx-small fw-black text-muted uppercase mb-1">TREND</div>
                          <Sparkline records={studentAttendance} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Attendance Heatmap ── */}
                {!showCompare && studentAttendance.length > 0 && (
                  <div className="card border-0 bg-white shadow-sm p-3 rounded-4 mb-3">
                    <AttendanceHeatmap records={studentAttendance} />
                  </div>
                )}

                {/* ── Course Breakdown (collapsible) ── */}
                <div className="mb-3">
                  <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-2 px-1">
                    Course Breakdown — tap to expand
                  </h6>

                  {showCompare && compareResult ? (
                    /* Side-by-side comparison per-course */
                    <div className="row g-2">
                      {[
                        { student: studentResult, summaries: buildCourseSummaries(studentAttendance), attendance: studentAttendance, borderColor: '#0d6efd' },
                        { student: compareResult, summaries: buildCourseSummaries(compareAttendance), attendance: compareAttendance, borderColor: '#6f42c1' },
                      ].map(({ student, summaries, attendance, borderColor }) => (
                        <div key={student.serverId} className="col-6">
                          <div className="xx-small fw-black uppercase tracking-widest mb-1" style={{ color: borderColor }}>{student.name.split(' ')[0]}</div>
                          {summaries.map(cs => {
                            const pct = cs.total > 0 ? Math.round((cs.present / cs.total) * 100) : 0;
                            return (
                              <div key={cs.code} className="card border-0 bg-white shadow-sm rounded-3 p-2 mb-1">
                                <div className="d-flex justify-content-between align-items-center">
                                  <span className="fw-black small text-dark uppercase">{cs.code}</span>
                                  <span className={`fw-black small ${pct >= 75 ? 'text-success' : 'text-danger'}`}>{pct}%</span>
                                </div>
                                <div className="mt-1 rounded-pill overflow-hidden" style={{ height: '3px', backgroundColor: 'var(--divider-color)' }}>
                                  <div className={`h-100 rounded-pill ${pct >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                          <div className="mt-2">
                            <AttendanceHeatmap records={attendance} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Collapsible per-course sections */
                    <div className="d-flex flex-column gap-2">
                      {courseSummaries.map(cs => {
                        const pct = cs.total > 0 ? Math.round((cs.present / cs.total) * 100) : 0;
                        const streak = absenceStreak(cs.code, studentAttendance);
                        const isOpen = expandedCourses.has(cs.code);
                        const courseRecs = cs.records.sort((a, b) => b.session.date.localeCompare(a.session.date));
                        return (
                          <div key={cs.code} className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden">
                            <div
                              className="p-3 cursor-pointer active-scale d-flex align-items-center gap-2"
                              onClick={() => toggleCourseSection(cs.code)}
                            >
                              <div
                                className={`fw-black xx-small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${pct >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                                style={{ width: '44px', height: '36px' }}
                              >
                                {pct}%
                              </div>
                              <div className="flex-grow-1 overflow-hidden">
                                <div className="fw-black small text-dark text-uppercase">{cs.code}</div>
                                <div className="xx-small text-muted text-truncate">{cs.title}</div>
                              </div>
                              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                                {streak >= 3 && (
                                  <span className="badge bg-danger xx-small fw-black px-2 py-1" aria-label={`${streak} consecutive absences`}>⬤ {streak} missed</span>
                                )}
                                <span className="xx-small fw-black text-muted">{cs.present}/{cs.total}</span>
                                <DonutChart present={cs.present} absent={cs.absent} excused={cs.excused} />
                                {isOpen ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                              </div>
                            </div>
                            <div className="px-3 pb-1">
                              <div className="rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: 'var(--divider-color)' }}>
                                <div className={`h-100 rounded-pill ${pct >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
                              </div>
                            </div>

                            <AnimatePresence>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-3 pb-3 pt-2 border-top" style={{ borderColor: 'var(--divider-color)' }}>
                                    <div className="d-flex flex-column gap-1">
                                      {courseRecs.map((r, i) => (
                                        <div key={i} className="d-flex align-items-center gap-2 py-1">
                                          <span className={`badge rounded-pill xx-small fw-black px-2 py-1 flex-shrink-0 ${statusBadgeClass(r.status)}`} style={{ minWidth: '60px', textAlign: 'center' }}>
                                            {r.status.toUpperCase()}
                                          </span>
                                          <span className="fw-bold xx-small text-dark text-uppercase text-truncate">{r.session.title || r.course.title}</span>
                                          <span className="xx-small text-muted font-monospace ms-auto flex-shrink-0">
                                            {new Date(r.session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Date-range filter + paginated flat timeline ── */}
                {!showCompare && (
                  <>
                    <div className="mb-3">
                      {/* Course filter chips */}
                      {courseSummaries.length > 1 && (
                        <div className="d-flex gap-2 flex-wrap mb-2">
                          <button
                            className={`btn btn-sm rounded-pill fw-black xx-small px-3 ${studentCourseFilter === '' ? 'btn-primary' : 'btn-light border'}`}
                            onClick={() => { setStudentCourseFilter(''); setStudentPage(1); }}
                          >
                            ALL
                          </button>
                          {courseSummaries.map(cs => (
                            <button
                              key={cs.code}
                              className={`btn btn-sm rounded-pill fw-black xx-small px-3 ${studentCourseFilter === cs.code ? 'btn-primary' : 'btn-light border'}`}
                              onClick={() => { setStudentCourseFilter(cs.code); setStudentPage(1); }}
                            >
                              {cs.code}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="row g-2">
                        <div className="col-6">
                          <div className="d-flex align-items-center gap-1">
                            <Calendar size={12} className="text-muted flex-shrink-0" />
                            <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light xx-small" value={studentDateStart} onChange={e => { setStudentDateStart(e.target.value); setStudentPage(1); }} />
                          </div>
                        </div>
                        <div className="col-6">
                          <div className="d-flex align-items-center gap-1">
                            <Calendar size={12} className="text-muted flex-shrink-0" />
                            <input type="date" className="form-control form-control-sm rounded-3 fw-bold border-light bg-light xx-small" value={studentDateEnd} onChange={e => { setStudentDateEnd(e.target.value); setStudentPage(1); }} />
                          </div>
                        </div>
                      </div>
                      {(studentCourseFilter || studentDateStart || studentDateEnd) && (
                        <div className="d-flex justify-content-end mt-1">
                          <button
                            className="btn btn-link btn-sm xx-small text-muted fw-bold p-0 d-flex align-items-center gap-1"
                            onClick={() => { setStudentCourseFilter(''); setStudentDateStart(''); setStudentDateEnd(''); setStudentPage(1); }}
                          >
                            <X size={11} /> Clear Filters
                          </button>
                        </div>
                      )}
                    </div>

                    {(studentCourseFilter || studentDateStart || studentDateEnd) && (
                      <>
                        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-2 px-1">
                          Filtered Timeline ({filteredStudentAttendance.length})
                        </h6>
                        <div className="d-flex flex-column gap-2">
                          {displayedStudentRecords.length === 0 ? (
                            <div className="text-center py-4 text-muted xx-small fw-bold uppercase">No records match the current filters.</div>
                          ) : displayedStudentRecords.map((record, idx) => (
                            <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
                              <div className="d-flex align-items-center gap-3">
                                <div className={`p-2 rounded-2 ${record.status === 'present' ? 'bg-success bg-opacity-10 text-success' : record.status === 'absent' ? 'bg-danger bg-opacity-10 text-danger' : 'bg-warning bg-opacity-10 text-warning'}`}>
                                  <StatusIcon status={record.status} />
                                </div>
                                <div className="flex-grow-1 overflow-hidden text-start">
                                  <div className="d-flex justify-content-between align-items-start">
                                    <h6 className="fw-black mb-0 text-dark small uppercase">{record.course?.code}</h6>
                                    <span className="xx-small fw-black text-muted uppercase flex-shrink-0 ms-2">
                                      {new Date(record.session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                  <p className="xx-small fw-bold text-muted mb-0 text-truncate text-uppercase">
                                    {record.session.title || record.course?.title}
                                  </p>
                                </div>
                                <span className={`badge rounded-pill xx-small fw-black px-3 ${statusBadgeClass(record.status)}`}>
                                  {record.status.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          ))}

                          {filteredStudentAttendance.length > studentItemsPerPage && (
                            <div className="d-flex justify-content-between align-items-center mt-3">
                              <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === 1} onClick={() => setStudentPage(p => p - 1)}>PREV</button>
                              <span className="xx-small fw-black text-muted uppercase">Page {studentPage} of {studentTotalPages}</span>
                              <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={studentPage === studentTotalPages} onClick={() => setStudentPage(p => p + 1)}>NEXT</button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="student-empty" className="text-center py-5 mt-3">
                {loading ? (
                  <div className="d-flex flex-column gap-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                ) : (
                  <>
                    <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><Search size={48} className="text-muted opacity-25" /></div>
                    <h5 className="fw-black text-muted text-uppercase tracking-widest">Search the Archive</h5>
                    <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Enter a reg number or student name above</p>
                  </>
                )}
              </motion.div>
            )
          )}

          {/* ════════════════ COMPILATION ════════════════ */}
          {mode === 'compilation' && (
            compilationData.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="compilation">

                <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-3" style={{ borderLeft: '4px solid #0d6efd' }}>
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="fw-black text-dark text-uppercase letter-spacing-n1 mb-1">{compilationTitle}</h5>
                      <p className="xx-small fw-bold text-muted uppercase tracking-widest mb-0">{startDate} → {endDate}</p>
                    </div>
                    <div className="position-relative">
                      <button className="btn btn-primary btn-sm rounded-pill px-3 fw-black xx-small shadow-sm d-flex align-items-center gap-1" onClick={() => setShowExportMenu(!showExportMenu)}>
                        <Download size={12} /> EXPORT
                      </button>
                      {showExportMenu && (
                        <div className="position-absolute end-0 mt-1 bg-white shadow-lg rounded-4 border p-2" style={{ zIndex: 200, minWidth: '210px' }}>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('csv')}><FileText size={14} className="text-success" /> CSV File</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('xlsx')}><FileSpreadsheet size={14} className="text-primary" /> Excel (XLSX)</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('pdf')}><FileText size={14} className="text-danger" /> PDF Document</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('text')}><FileText size={14} className="text-muted" /> Plain Text</button>
                          <hr className="dropdown-divider my-1" />
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('semester')}>
                            <FileSpreadsheet size={14} className="text-warning" /> Full Semester (XLSX)
                          </button>
                          <hr className="dropdown-divider my-1" />
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleExport('share')}><Share2 size={14} className="text-info" /> Share</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Donut chart + aggregate stats */}
                  <div className="d-flex align-items-center gap-3">
                    <DonutChart
                      present={compilationData.reduce((a, b) => a + b.presentCount, 0)}
                      absent={compilationData.reduce((a, b) => a + b.absentCount, 0)}
                      excused={compilationData.reduce((a, b) => a + b.excusedCount, 0)}
                    />
                    <div className="flex-grow-1">
                      <div className="row g-2">
                        {[
                          { label: 'STUDENTS', value: compilationData.length, cls: 'text-dark' },
                          { label: 'SESSIONS', value: compilationData[0]?.totalSessions ?? 0, cls: 'text-primary' },
                          {
                            label: 'AVG %',
                            value: `${Math.round(compilationData.reduce((a, b) => a + b.percentage, 0) / compilationData.length)}%`,
                            cls: Math.round(compilationData.reduce((a, b) => a + b.percentage, 0) / compilationData.length) >= 75 ? 'text-success' : 'text-danger',
                          },
                        ].map(s => (
                          <div key={s.label} className="col-4">
                            <div className="bg-light p-2 rounded-3 text-center border">
                              <div className={`h6 mb-0 fw-black ${s.cls}`}>{s.value}</div>
                              <div className="xx-small fw-bold text-muted">{s.label}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="d-flex gap-3 mt-2">
                        {([['#198754', compilationData.reduce((a, b) => a + b.presentCount, 0), 'Present'],
                           ['#dc3545', compilationData.reduce((a, b) => a + b.absentCount, 0), 'Absent'],
                           ['#e6a817', compilationData.reduce((a, b) => a + b.excusedCount, 0), 'Excused']] as [string, number, string][]).map(([c, n, l]) => (
                          <div key={l} className="d-flex align-items-center gap-1">
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: c }} />
                            <span className="xx-small text-muted">{n} {l}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filter chips */}
                <div className="d-flex gap-2 mb-2 flex-wrap">
                  {([
                    { chip: '' as FilterChip, label: 'ALL' },
                    { chip: 'atrisk' as FilterChip, label: '⚠ AT-RISK' },
                    { chip: 'perfect' as FilterChip, label: '✓ PERFECT' },
                    { chip: 'excused' as FilterChip, label: '✦ EXCUSED' },
                  ]).map(({ chip, label }) => (
                    <button
                      key={chip}
                      className={`btn btn-sm rounded-pill fw-black xx-small px-3 ${filterChip === chip ? 'btn-primary' : 'btn-light border'}`}
                      onClick={() => { setFilterChip(chip); setCompilationPage(1); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Sort controls */}
                <div className="d-flex gap-2 mb-3 align-items-center flex-wrap">
                  <span className="xx-small fw-black text-muted uppercase">Sort:</span>
                  {([['name', 'NAME'], ['regNumber', 'REG #'], ['percentage', '%'], ['absentCount', 'ABSENCES']] as [SortField, string][]).map(([field, label]) => (
                    <button
                      key={field}
                      className={`btn btn-sm rounded-pill fw-black xx-small px-3 ${sortField === field ? 'btn-primary' : 'btn-light border'}`}
                      onClick={() => handleSort(field)}
                    >
                      {label} {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  ))}
                </div>

                <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-2 px-1">
                  Per-Student Breakdown ({processedCompilation.length})
                </h6>
                <div className="d-flex flex-column gap-2">
                  {displayedCompilation.map((row, idx) => (
                    <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className={`fw-black small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${row.percentage >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                          style={{ width: '44px', height: '44px', fontSize: '12px' }}
                        >
                          {row.percentage}%
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                          <h6 className="fw-bold mb-0 text-dark text-uppercase small letter-spacing-n1 text-truncate">{row.name}</h6>
                          <div className="xx-small fw-black text-muted font-monospace tracking-widest">{row.regNumber}</div>
                        </div>
                        <div className="text-end flex-shrink-0">
                          <div className="xx-small fw-black text-success">{row.presentCount}P</div>
                          <div className="xx-small fw-black text-danger">{row.absentCount}A</div>
                          {row.excusedCount > 0 && <div className="xx-small fw-black text-warning">{row.excusedCount}E</div>}
                        </div>
                      </div>
                      <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: 'var(--divider-color)' }}>
                        <div className={`h-100 rounded-pill ${row.percentage >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${row.percentage}%`, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  ))}

                  {compilationTotalPages > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={compilationPage === 1} onClick={() => setCompilationPage(p => p - 1)}>PREV</button>
                      <span className="xx-small fw-black text-muted uppercase">Page {compilationPage} of {compilationTotalPages}</span>
                      <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={compilationPage === compilationTotalPages} onClick={() => setCompilationPage(p => p + 1)}>NEXT</button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="compilation-empty" className="text-center py-5 mt-3">
                {loading ? (
                  <div className="d-flex flex-column gap-2">{Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                ) : (
                  <>
                    <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><BarChart3 size={48} className="text-muted opacity-25" /></div>
                    <h5 className="fw-black text-muted text-uppercase tracking-widest">Course Attendance</h5>
                    <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Select a course and date range above to compile</p>
                  </>
                )}
              </motion.div>
            )
          )}

          {/* ════════════════ SESSION DRILL-DOWN ════════════════ */}
          {mode === 'sessions' && (
            sessionsList.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="sessions">
                <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 px-1">
                  {courses.find(c => c.id === sessionsCourseId)?.code} — {sessionsList.length} Session{sessionsList.length !== 1 ? 's' : ''}
                </h6>
                <div className="d-flex flex-column gap-2">
                  {sessionsList.map(session => {
                    const isExpanded = expandedSessionId === session.id;
                    const isLoadingRoll = rollCallLoading === session.id;
                    return (
                      <div key={session.id} className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden">
                        <div className="p-3 cursor-pointer active-scale" onClick={() => handleExpandSession(session.id)}>
                          <div className="d-flex align-items-center gap-3">
                            <div
                              className={`fw-black xx-small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${session.attendanceRate >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                              style={{ width: '44px', height: '44px' }}
                            >
                              {session.attendanceRate}%
                            </div>
                            <div className="flex-grow-1 overflow-hidden">
                              <div className="fw-black small text-dark text-uppercase letter-spacing-n1 text-truncate">{session.title}</div>
                              <div className="xx-small text-muted font-monospace">
                                {new Date(session.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                              </div>
                            </div>
                            <div className="d-flex align-items-center gap-2 flex-shrink-0">
                              <div className="text-end">
                                <div className="xx-small fw-black text-success">{session.presentCount}P</div>
                                <div className="xx-small fw-black text-danger">{session.absentCount}A</div>
                                {session.excusedCount > 0 && <div className="xx-small fw-black text-warning">{session.excusedCount}E</div>}
                              </div>
                              {isExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                            </div>
                          </div>
                          <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '3px', backgroundColor: 'var(--divider-color)' }}>
                            <div className={`h-100 rounded-pill ${session.attendanceRate >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${session.attendanceRate}%` }} />
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 pt-2 border-top" style={{ borderColor: 'var(--divider-color)' }}>
                                {isLoadingRoll ? (
                                  <div className="d-flex flex-column gap-2 py-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                                ) : rollCallMap[session.id] ? (
                                  <div className="d-flex flex-column gap-1">
                                    {rollCallMap[session.id].map((entry, i) => (
                                      <div key={i} className="d-flex align-items-center gap-2 py-1">
                                        <span className={`badge rounded-pill xx-small fw-black px-2 py-1 flex-shrink-0 ${statusBadgeClass(entry.status)}`} style={{ minWidth: '60px', textAlign: 'center' }}>
                                          {entry.status.toUpperCase()}
                                        </span>
                                        <span className="fw-bold xx-small text-dark text-uppercase">{entry.name}</span>
                                        <span className="xx-small text-muted font-monospace ms-auto">{entry.regNumber}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center py-2 xx-small text-muted fw-bold">No roll-call data.</div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="sessions-empty" className="text-center py-5 mt-3">
                {loading ? (
                  <div className="d-flex flex-column gap-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                ) : (
                  <>
                    <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><BookOpen size={48} className="text-muted opacity-25" /></div>
                    <h5 className="fw-black text-muted text-uppercase tracking-widest">Session Drill-Down</h5>
                    <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Select a course above to list all sessions</p>
                  </>
                )}
              </motion.div>
            )
          )}

          {/* ════════════════ SEMESTER SUMMARY ════════════════ */}
          {mode === 'semester' && (
            semesterLoaded && semesterRows.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="semester">
                <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-3 px-1">
                  {activeSemester?.name} — {semesterRows.length} Course{semesterRows.length !== 1 ? 's' : ''} (sorted by attendance ↑)
                </h6>

                {/* Overall donut */}
                <div className="card border-0 bg-white shadow-sm p-3 rounded-4 mb-3 d-flex flex-row align-items-center gap-3">
                  <DonutChart
                    present={semesterRows.reduce((a, b) => a + b.presentCount, 0)}
                    absent={semesterRows.reduce((a, b) => a + b.absentCount, 0)}
                    excused={semesterRows.reduce((a, b) => a + b.excusedCount, 0)}
                  />
                  <div>
                    <div className="fw-black small text-dark uppercase">{activeSemester?.name}</div>
                    <div className="xx-small text-muted">
                      {semesterRows.reduce((a, b) => a + b.sessionsHeld, 0)} sessions across {semesterRows.length} course{semesterRows.length !== 1 ? 's' : ''}
                    </div>
                    <div className="xx-small fw-black mt-1" style={{ color: Math.round(semesterRows.reduce((a, b) => a + b.avgAttendance, 0) / semesterRows.length) >= 75 ? ThemeColors.status.success : ThemeColors.status.danger }}>
                      Avg {Math.round(semesterRows.reduce((a, b) => a + b.avgAttendance, 0) / semesterRows.length)}% attendance
                    </div>
                  </div>
                </div>

                <div className="d-flex flex-column gap-2">
                  {semesterRows.map(row => {
                    const isExpanded = expandedSemCourseId === row.courseId;
                    const students = semRollCallMap[row.courseId];
                    return (
                      <div key={row.courseId} className="card border-0 bg-white shadow-sm rounded-4 overflow-hidden">
                        <div className="p-3 cursor-pointer active-scale" onClick={() => handleExpandSemCourse(row.courseId)}>
                          <div className="d-flex align-items-center gap-3">
                            <div
                              className={`fw-black xx-small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 ${row.avgAttendance >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                              style={{ width: '48px', height: '44px' }}
                            >
                              {row.avgAttendance}%
                            </div>
                            <div className="flex-grow-1 overflow-hidden">
                              <div className="fw-black small text-dark text-uppercase letter-spacing-n1">{row.code}</div>
                              <div className="xx-small text-muted text-truncate">{row.title}</div>
                            </div>
                            <div className="d-flex align-items-center gap-2 flex-shrink-0">
                              <DonutChart present={row.presentCount} absent={row.absentCount} excused={row.excusedCount} />
                              <div className="text-end">
                                <div className="xx-small fw-black text-muted">{row.sessionsHeld} sess.</div>
                                <div className="xx-small fw-black text-muted">{row.enrolledCount} enrolled</div>
                              </div>
                              {isExpanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                            </div>
                          </div>
                          <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: 'var(--divider-color)' }}>
                            <div className={`h-100 rounded-pill ${row.avgAttendance >= 75 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${row.avgAttendance}%`, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 pt-2 border-top" style={{ borderColor: 'var(--divider-color)' }}>
                                {!students ? (
                                  <div className="d-flex flex-column gap-2 py-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                                ) : students.length === 0 ? (
                                  <div className="text-center py-2 xx-small text-muted fw-bold">No student data.</div>
                                ) : (
                                  <div className="d-flex flex-column gap-1">
                                    {students.map((s, i) => (
                                      <div key={i} className="d-flex align-items-center gap-2 py-1">
                                        <div
                                          className={`fw-black xx-small rounded-2 px-2 py-1 flex-shrink-0 ${s.percentage >= 75 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}
                                          style={{ minWidth: '44px', textAlign: 'center' }}
                                        >
                                          {s.percentage}%
                                        </div>
                                        <span className="fw-bold xx-small text-dark text-uppercase text-truncate">{s.name}</span>
                                        <span className="xx-small text-muted font-monospace ms-auto flex-shrink-0">{s.regNumber}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="semester-empty" className="text-center py-5 mt-3">
                {loading ? (
                  <div className="d-flex flex-column gap-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                ) : (
                  <>
                    <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><LayoutGrid size={48} className="text-muted opacity-25" /></div>
                    <h5 className="fw-black text-muted text-uppercase tracking-widest">Semester Summary</h5>
                    <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Click LOAD SUMMARY above to see all courses side-by-side</p>
                  </>
                )}
              </motion.div>
            )
          )}

          {/* ════════════════ AT-RISK REPORT ════════════════ */}
          {mode === 'atrisk' && (
            atRiskData.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key="atrisk">
                <div className="card border-0 bg-white shadow-sm p-4 rounded-4 mb-3" style={{ borderLeft: '4px solid #dc3545' }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h5 className="fw-black text-danger text-uppercase letter-spacing-n1 mb-1">
                        ⚠ {atRiskData.length} AT-RISK STUDENT{atRiskData.length !== 1 ? 'S' : ''} ({'<'}{atRiskThreshold}%)
                      </h5>
                      <p className="xx-small fw-bold text-muted uppercase tracking-widest mb-0">{atRiskTitle} | {atRiskStartDate} → {atRiskEndDate}</p>
                    </div>
                    <div className="position-relative">
                      <button className="btn btn-danger btn-sm rounded-pill px-3 fw-black xx-small shadow-sm d-flex align-items-center gap-1" onClick={() => setShowAtRiskExportMenu(!showAtRiskExportMenu)}>
                        <Download size={12} /> EXPORT
                      </button>
                      {showAtRiskExportMenu && (
                        <div className="position-absolute end-0 mt-1 bg-white shadow-lg rounded-4 border p-2" style={{ zIndex: 200, minWidth: '200px' }}>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('csv')}><FileText size={14} className="text-success" /> CSV File</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('xlsx')}><FileSpreadsheet size={14} className="text-primary" /> Excel (XLSX)</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('pdf')}><FileText size={14} className="text-danger" /> Warning PDF</button>
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('text')}><FileText size={14} className="text-muted" /> Plain Text</button>
                          <hr className="dropdown-divider my-1" />
                          <button className="dropdown-item fw-bold small rounded-3 d-flex align-items-center gap-2 py-2 px-3" onClick={() => handleAtRiskExport('share')}><Share2 size={14} className="text-info" /> Share</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="d-flex flex-column gap-2">
                  {atRiskData.map((row, idx) => (
                    <div key={idx} className="card border-0 bg-white shadow-sm p-3 rounded-4">
                      <div className="d-flex align-items-center gap-3">
                        <div
                          className="fw-black small d-flex align-items-center justify-content-center rounded-3 flex-shrink-0 bg-danger bg-opacity-10 text-danger"
                          style={{ width: '44px', height: '44px', fontSize: '12px' }}
                        >
                          {row.percentage}%
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                          <h6 className="fw-bold mb-0 text-dark text-uppercase small letter-spacing-n1 text-truncate">{row.name}</h6>
                          <div className="xx-small fw-black text-muted font-monospace tracking-widest">{row.regNumber}</div>
                        </div>
                        <div className="text-end flex-shrink-0">
                          <div className="xx-small fw-black text-success">{row.presentCount}P</div>
                          <div className="xx-small fw-black text-danger">{row.absentCount}A</div>
                          {row.excusedCount > 0 && <div className="xx-small fw-black text-warning">{row.excusedCount}E</div>}
                        </div>
                      </div>
                      <div className="mt-2 rounded-pill overflow-hidden" style={{ height: '4px', backgroundColor: 'var(--divider-color)' }}>
                        <div className="h-100 rounded-pill bg-danger" style={{ width: `${row.percentage}%`, transition: 'width 0.5s ease' }} />
                      </div>
                      <div className="mt-1 d-flex justify-content-between">
                        <span className="xx-small text-muted">{row.presentCount}/{row.totalSessions} sessions attended</span>
                        <span className="xx-small fw-black text-danger">{atRiskThreshold - row.percentage}% below threshold</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key="atrisk-empty" className="text-center py-5 mt-3">
                {loading ? (
                  <div className="d-flex flex-column gap-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                ) : (
                  <>
                    <div className="bg-white d-inline-block p-4 rounded-circle shadow-sm mb-4"><AlertTriangle size={48} className="text-muted opacity-25" /></div>
                    <h5 className="fw-black text-muted text-uppercase tracking-widest">At-Risk Report</h5>
                    <p className="xx-small fw-bold text-uppercase tracking-widest text-muted">Configure above and click FIND AT-RISK STUDENTS</p>
                  </>
                )}
              </motion.div>
            )
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
