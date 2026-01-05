import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

export interface LocalSemester {
  id?: number;
  serverId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number; // 0 or 1
  synced: number; // 0 = dirty, 1 = synced
}

export interface LocalStudent {
  id?: number;
  serverId: string;
  regNumber: string;
  name: string;
  email?: string;
  phone?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
}

export interface LocalCourse {
  id?: number;
  serverId: string;
  code: string;
  title: string;
  semesterId: string; // References serverId
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
}

export interface LocalEnrollment {
  id?: number;
  serverId: string;
  studentId: string;
  courseId: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
}

export interface LocalAttendanceSession {
  id?: number;
  serverId: string;
  courseId: string;
  date: string;
  title: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
}

export interface LocalAttendanceRecord {
  id?: number;
  serverId: string;
  sessionId: string;
  studentId: string;
  status: 'present' | 'absent' | 'excused';
  timestamp: number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
}

export class PresensysDB extends Dexie {
  semesters!: Table<LocalSemester>;
  students!: Table<LocalStudent>;
  courses!: Table<LocalCourse>;
  enrollments!: Table<LocalEnrollment>;
  attendanceSessions!: Table<LocalAttendanceSession>;
  attendanceRecords!: Table<LocalAttendanceRecord>;

  constructor() {
    super('PresensysDB');
    this.version(11).stores({
      semesters: '++id, &serverId, name, startDate, isActive, synced, isDeleted, userId, updatedAt',
      students: '++id, &serverId, &regNumber, name, synced, isDeleted, userId, updatedAt',
      courses: '++id, &serverId, semesterId, code, synced, isDeleted, userId, updatedAt',
      enrollments: '++id, &serverId, studentId, courseId, [studentId+courseId], synced, isDeleted, userId, updatedAt',
      attendanceSessions: '++id, &serverId, courseId, date, synced, isDeleted, userId, updatedAt',
      attendanceRecords: '++id, &serverId, sessionId, studentId, [sessionId+studentId], synced, isDeleted, userId, updatedAt'
    });

    this.tables.forEach(table => {
      table.hook('creating', (_primKey, obj, _transaction) => {
        if (!obj.serverId) obj.serverId = uuidv4();
        if (!obj.createdAt) obj.createdAt = new Date().toISOString();
        if (!obj.updatedAt) obj.updatedAt = new Date().toISOString();
        if (obj.isDeleted === undefined) obj.isDeleted = 0;
        if (obj.synced === undefined) obj.synced = 0;
      });

      table.hook('updating', (mods, _primKey, _obj, _transaction) => {
        if (typeof mods === 'object' && mods !== null) {
          if ('synced' in mods) return mods;
          return { updatedAt: new Date().toISOString(), synced: 0 };
        }
        return { updatedAt: new Date().toISOString(), synced: 0 };
      });
    });
  }
}

export const db = new PresensysDB();

// Re-export original types for compatibility
export type Semester = LocalSemester;
export type Student = LocalStudent;
export type Course = LocalCourse;
export type Enrollment = LocalEnrollment;
export type AttendanceSession = LocalAttendanceSession;
export type AttendanceRecord = LocalAttendanceRecord;