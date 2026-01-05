import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

export interface LocalSemester {
  id?: number;
  server_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_archived: boolean;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted: number; // 0 or 1
  synced_at: number; // 0 means dirty/unsynced
}

export interface LocalStudent {
  id?: number;
  server_id: string;
  reg_number: string;
  name: string;
  email?: string;
  phone?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted: number;
  synced_at: number;
}

export interface LocalCourse {
  id?: number;
  server_id: string;
  code: string;
  title: string;
  semester_id: string; // References server_id of semester
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted: number;
  synced_at: number;
}

export interface LocalEnrollment {
  id?: number;
  server_id: string;
  student_id: string; // References server_id
  course_id: string; // References server_id
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted: number;
  synced_at: number;
}

export interface LocalAttendanceSession {
  id?: number;
  server_id: string;
  course_id: string; // References server_id
  date: string;
  title: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted: number;
  synced_at: number;
}

export interface LocalAttendanceRecord {
  id?: number;
  server_id: string;
  session_id: string; // References server_id
  student_id: string; // References server_id
  status: 'present' | 'absent' | 'excused';
  marked_at: number;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted: number;
  synced_at: number;
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
    this.version(9).stores({
      semesters: '++id, &server_id, name, is_active, synced_at, is_deleted, user_id, updated_at',
      students: '++id, &server_id, &reg_number, name, synced_at, is_deleted, user_id, updated_at',
      courses: '++id, &server_id, semester_id, code, synced_at, is_deleted, user_id, updated_at',
      enrollments: '++id, &server_id, student_id, course_id, [student_id+course_id], synced_at, is_deleted, user_id, updated_at',
      attendanceSessions: '++id, &server_id, course_id, date, synced_at, is_deleted, user_id, updated_at',
      attendanceRecords: '++id, &server_id, session_id, student_id, [session_id+student_id], synced_at, is_deleted, user_id, updated_at'
    });

    // Add hooks for automatic UUIDs and timestamping
    this.tables.forEach(table => {
      table.hook('creating', (primKey, obj, transaction) => {
        if (!obj.server_id) obj.server_id = uuidv4();
        if (!obj.created_at) obj.created_at = new Date().toISOString();
        if (!obj.updated_at) obj.updated_at = new Date().toISOString();
        if (obj.is_deleted === undefined) obj.is_deleted = 0;
        if (obj.synced_at === undefined) obj.synced_at = 0; // 0 = unsynced/dirty
      });

      table.hook('updating', (mods, primKey, obj, transaction) => {
        if (typeof mods === 'object' && mods !== null) {
          // If we are specifically setting 'synced_at', respect it (it means we just synced)
          if ('synced_at' in mods) return mods;

          // Otherwise, any change marks it as dirty (synced_at = 0) and updates timestamp
          const updates: any = { updated_at: new Date().toISOString(), synced_at: 0 };
          return updates;
        }
        return { updated_at: new Date().toISOString(), synced_at: 0 };
      });
    });
  }
}

export const db = new PresensysDB();
