export type ArchiveMode = 'student' | 'compilation' | 'sessions' | 'semester' | 'atrisk';
export type SortField = 'name' | 'regNumber' | 'percentage' | 'absentCount';
export type SortDir = 'asc' | 'desc';
export type FilterChip = '' | 'atrisk' | 'perfect' | 'excused';

export interface CourseOption { id: string; code: string; title: string; }

export interface CompilationRow {
  name: string; regNumber: string;
  totalSessions: number; presentCount: number; absentCount: number; excusedCount: number;
  percentage: number;
}

export interface SessionRow {
  id: string; date: string; title: string;
  totalEnrolled: number; presentCount: number; absentCount: number; excusedCount: number;
  attendanceRate: number;
}

export interface RollCallEntry { name: string; regNumber: string; status: 'present' | 'absent' | 'excused'; }

export interface NameSuggestion { serverId: string; name: string; regNumber: string; }

export interface AttendanceDetail {
  status: string; timestamp: string;
  session: { date: string; title: string };
  course: { code: string; title: string };
}

export interface SemesterCourseRow {
  courseId: string; code: string; title: string;
  sessionsHeld: number; enrolledCount: number; avgAttendance: number;
  presentCount: number; absentCount: number; excusedCount: number;
}

export interface StudentResult { name: string; regNumber: string; }
export interface ActiveSemester { name: string; }
