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
    this.version(8).stores({
      semesters: '++id, name, startDate, synced, isDeleted, userId, lastModified, serverId',
      students: '++id, &regNumber, name, synced, isDeleted, userId, lastModified, serverId',
      courses: '++id, code, semesterId, synced, isDeleted, userId, lastModified, serverId',
      enrollments: '++id, studentId, courseId, [studentId+courseId], synced, isDeleted, userId, lastModified, serverId',
      attendanceSessions: '++id, courseId, date, synced, isDeleted, userId, lastModified, serverId',
      attendanceRecords: '++id, sessionId, studentId, [sessionId+studentId], synced, isDeleted, userId, lastModified, serverId'
    });

    // Add hooks for automatic timestamping and sync status
    this.tables.forEach(table => {
      table.hook('creating', (_primKey, obj, _transaction) => {
        // Only set defaults if not already provided (e.g. during sync)
        if (obj.lastModified === undefined) obj.lastModified = Date.now();
        if (obj.synced === undefined) obj.synced = 0;
      });
      table.hook('updating', (mods, _primKey, _obj, _transaction) => {
        if (typeof mods === 'object' && mods !== null) {
          // If we are specifically setting 'synced' or 'lastModified' (e.g. from syncEngine), respect it
          const updates: any = { };
          if (!('lastModified' in mods)) updates.lastModified = Date.now();
          if (!('synced' in mods)) updates.synced = 0;
          return updates;
        } else {
           return { lastModified: Date.now(), synced: 0 };
        }
      });
    });
  }
}

export const db = new PresensysDB();
