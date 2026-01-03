import Dexie, { type Table } from 'dexie';

export interface Semester {
  id?: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
  synced?: number;
  userId?: string;
}

export interface Student {
  id?: number;
  regNumber: string;
  name: string;
  email?: string;
  phone?: string;
  synced?: number;
  userId?: string;
}

export interface Course {
  id?: number;
  code: string;
  title: string;
  semesterId: number;
  synced?: number;
  userId?: string;
}

export interface Enrollment {
  id?: number;
  studentId: number;
  courseId: number;
  synced?: number;
  userId?: string;
}

export interface AttendanceSession {
  id?: number;
  courseId: number;
  date: string;
  title: string;
  synced?: number;
  userId?: string;
}

export interface AttendanceRecord {
  id?: number;
  sessionId: number;
  studentId: number;
  status: 'present' | 'absent' | 'excused';
  timestamp: number;
  synced?: number;
  userId?: string;
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
    this.version(5).stores({
      semesters: '++id, name, startDate, synced, userId',
      students: '++id, &regNumber, name, synced, userId',
      courses: '++id, code, semesterId, synced, userId',
      enrollments: '++id, studentId, courseId, [studentId+courseId], synced, userId',
      attendanceSessions: '++id, courseId, date, synced, userId',
      attendanceRecords: '++id, sessionId, studentId, [sessionId+studentId], synced, userId'
    });
  }
}

export const db = new PresensysDB();
