import Dexie, { type Table } from 'dexie';

export interface Semester {
  id?: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
  synced?: number; // 0 for no, 1 for yes
}

export interface Student {
  id?: number;
  regNumber: string;
  name: string;
  email?: string;
  phone?: string;
  synced?: number;
}

export interface Course {
  id?: number;
  code: string;
  title: string;
  semesterId: number;
  synced?: number;
}

export interface Enrollment {
  id?: number;
  studentId: number;
  courseId: number;
  synced?: number;
}

export interface AttendanceSession {
  id?: number;
  courseId: number;
  date: string;
  title: string;
  synced?: number;
}

export interface AttendanceRecord {
  id?: number;
  sessionId: number;
  studentId: number;
  status: 'present' | 'absent' | 'excused';
  timestamp: number;
  synced?: number;
}

export class PresensysDB extends Dexie {
  semesters!: Table<Semester>;
  students!: Table<Student>;
  courses!: Table<Course>;
  enrollments!: Table<Enrollment>;
  attendanceSessions!: Table<AttendanceSession>;
  attendanceRecords!: Table<AttendanceRecord>;

  constructor() {
    super('PresensysDB');
    this.version(4).stores({
      semesters: '++id, name, startDate, synced',
      students: '++id, &regNumber, name, synced',
      courses: '++id, code, semesterId, synced',
      enrollments: '++id, studentId, courseId, [studentId+courseId], synced',
      attendanceSessions: '++id, courseId, date, synced',
      attendanceRecords: '++id, sessionId, studentId, [sessionId+studentId], synced'
    });
  }
}

export const db = new PresensysDB();
