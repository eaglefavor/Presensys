import Dexie, { type Table } from 'dexie';

export interface Semester {
  id?: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
  synced?: number;
  isDeleted?: number;
  userId?: string;
}

export interface Student {
  id?: number;
  regNumber: string;
  name: string;
  email?: string;
  phone?: string;
  synced?: number;
  isDeleted?: number;
  userId?: string;
}

export interface Course {
  id?: number;
  code: string;
  title: string;
  semesterId: number;
  synced?: number;
  isDeleted?: number;
  userId?: string;
}

export interface Enrollment {
  id?: number;
  studentId: number;
  courseId: number;
  synced?: number;
  isDeleted?: number;
  userId?: string;
}

export interface AttendanceSession {
  id?: number;
  courseId: number;
  date: string;
  title: string;
  synced?: number;
  isDeleted?: number;
  userId?: string;
}

export interface AttendanceRecord {
  id?: number;
  sessionId: number;
  studentId: number;
  status: 'present' | 'absent' | 'excused';
  timestamp: number;
  synced?: number;
  isDeleted?: number;
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
    this.version(6).stores({
      semesters: '++id, name, startDate, synced, isDeleted, userId',
      students: '++id, &regNumber, name, synced, isDeleted, userId',
      courses: '++id, code, semesterId, synced, isDeleted, userId',
      enrollments: '++id, studentId, courseId, [studentId+courseId], synced, isDeleted, userId',
      attendanceSessions: '++id, courseId, date, synced, isDeleted, userId',
      attendanceRecords: '++id, sessionId, studentId, [sessionId+studentId], synced, isDeleted, userId'
    });
  }
}

export const db = new PresensysDB();
