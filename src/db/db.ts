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
    this.version(7).stores({
      semesters: '++id, name, startDate, synced, isDeleted, userId, lastModified',
      students: '++id, &regNumber, name, synced, isDeleted, userId, lastModified',
      courses: '++id, code, semesterId, synced, isDeleted, userId, lastModified',
      enrollments: '++id, studentId, courseId, [studentId+courseId], synced, isDeleted, userId, lastModified',
      attendanceSessions: '++id, courseId, date, synced, isDeleted, userId, lastModified',
      attendanceRecords: '++id, sessionId, studentId, [sessionId+studentId], synced, isDeleted, userId, lastModified'
    });

    // Add hooks for automatic timestamping and sync status
    this.tables.forEach(table => {
      table.hook('creating', (_primKey, obj, _transaction) => {
        obj.lastModified = Date.now();
        obj.synced = 0;
      });
      table.hook('updating', (mods, _primKey, _obj, _transaction) => {
        if (typeof mods === 'object' && mods !== null) {
          // If we are specifically setting 'synced' (e.g. from syncEngine), don't reset it to 0
          if (!('synced' in mods)) {
             return { lastModified: Date.now(), synced: 0 };
          }
        } else {
           return { lastModified: Date.now(), synced: 0 };
        }
      });
    });
  }
}

export const db = new PresensysDB();
