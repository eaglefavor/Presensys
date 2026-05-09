import { CheckCircle2, Clock, Archive } from 'lucide-react';
import type { AttendanceDetail } from './ArchiveTypes';

export const SkeletonCard = () => (
  <div className="card border-0 bg-white shadow-sm p-3 rounded-4">
    <span className="skeleton-line w-50 mb-2" style={{ display: 'block' }} />
    <span className="skeleton-line w-75 mb-2" style={{ display: 'block' }} />
    <span className="skeleton-line w-25" style={{ display: 'block' }} />
  </div>
);

export const CircularProgress = ({ percentage }: { percentage: number }) => {
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

export const DonutChart = ({ present, absent, excused }: { present: number; absent: number; excused: number }) => {
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

export const AttendanceHeatmap = ({ records }: { records: AttendanceDetail[] }) => {
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

export const StatusIcon = ({ status }: { status: string }) =>
  status === 'present' ? <CheckCircle2 size={18} /> : status === 'excused' ? <Clock size={18} /> : <Archive size={18} />;
