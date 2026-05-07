import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';


export interface LocalLecturer {
  id?: number;
  serverId: string;
  name: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
}

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
  isDeleted: number;
  synced: number;
}


export interface LocalStudentCredential {
  id?: number;
  serverId: string;
  studentId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
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
  semesterId: string;
  userId?: string;
  dayOfWeek?: string;
  time?: string;
  lecturers?: string;
  createdAt?: string;
  updatedAt?: string;
  isDeleted: number;
  synced: number;
}

export interface LocalCourseSchedule {
  id?: number;
  serverId: string;
  courseId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
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
  lecturerId?: string;
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

/**
 * Outbox – immutable operation log.
 *
 * Every user-driven write (create, update, soft-delete) appends an entry here
 * via the Dexie hook `onsuccess` callback, which fires after the data transaction
 * commits.  The sync engine drains this log during pushChanges(), providing:
 *   • Ordered delivery (sorted by createdAt)
 *   • Per-item retry counting (stop re-trying permanently broken records)
 *   • Cancel-out logic: create+delete before first push → skip server write
 *
 * Note: writes are best-effort (separate micro-transaction after the data write).
 * The `synced=0` flag on data rows remains the authoritative "needs push" marker.
 */
export interface LocalOutboxEntry {
  id?: number;
  /** Dexie table name, e.g. 'semesters' */
  tableName: string;
  /** UUID that identifies the record on the server */
  serverId: string;
  operation: 'upsert' | 'delete';
  createdAt: string;
  /** How many times this entry has been attempted and failed */
  attempts: number;
  /** 0 = pending, 1 = successfully pushed */
  done: number;
}

export class PresensysDB extends Dexie {
  semesters!: Table<LocalSemester>;
  students!: Table<LocalStudent>;
  courses!: Table<LocalCourse>;
  enrollments!: Table<LocalEnrollment>;
  attendanceSessions!: Table<LocalAttendanceSession>;
  attendanceRecords!: Table<LocalAttendanceRecord>;
  lecturers!: Table<LocalLecturer>;
  courseSchedules!: Table<LocalCourseSchedule>;
  studentCredentials!: Table<LocalStudentCredential>;
  outbox!: Table<LocalOutboxEntry>;

  private onChangeListeners: (() => void)[] = [];

  constructor() {
    super('PresensysDB');

    const dataSchema = {
      semesters: '++id, &serverId, name, startDate, isActive, synced, isDeleted, userId, updatedAt',
      students: '++id, &serverId, &regNumber, name, synced, isDeleted, userId, updatedAt',
      courses: '++id, &serverId, semesterId, code, dayOfWeek, synced, isDeleted, userId, updatedAt',
      enrollments: '++id, &serverId, studentId, courseId, [studentId+courseId], synced, isDeleted, userId, updatedAt',
      attendanceSessions: '++id, &serverId, courseId, date, lecturerId, synced, isDeleted, userId, updatedAt',
      lecturers: '++id, &serverId, name, synced, isDeleted, userId, updatedAt',
      attendanceRecords: '++id, &serverId, sessionId, studentId, [sessionId+studentId], synced, isDeleted, userId, updatedAt',
            courseSchedules: '++id, &serverId, courseId, dayOfWeek, synced, isDeleted, userId, updatedAt',
      studentCredentials: '++id, &serverId, studentId, credentialId, synced, isDeleted, userId, updatedAt',
    };

    // Version 11 – initial index fix
    this.version(11).stores(dataSchema);

    // Version 12 – one-time clear to resolve UUID conflicts (already deployed; keep for users upgrading from v11)
    this.version(12).stores(dataSchema).upgrade(async (tx) => {
      console.log('DB Upgrade (v12): Clearing local data to resolve UUID conflicts.');
      const tables = ['semesters', 'students', 'courses', 'enrollments', 'attendanceSessions', 'attendanceRecords', 'studentCredentials'];
      await Promise.all(tables.map(t => tx.table(t).clear()));
      // Clear legacy single-cursor key; per-table cursors (sync_cursor_*) are the new standard
      localStorage.removeItem('last_sync_timestamp');
    });

    // Version 13 – add outbox table (non-destructive; data rows unchanged)
    this.version(13).stores({
      ...dataSchema,
      outbox: '++id, tableName, serverId, [tableName+serverId], createdAt, done, attempts',
    });

    // Version 14 - add dayOfWeek, time, lecturers to courses
    this.version(14).stores({
      ...dataSchema,
      outbox: '++id, tableName, serverId, [tableName+serverId], createdAt, done, attempts',
    });

    // Version 15 - add lecturers table and lecturerId to attendanceSessions
    this.version(15).stores({
      ...dataSchema,
      outbox: '++id, tableName, serverId, [tableName+serverId], createdAt, done, attempts',
    });

    // Version 16 – add courseSchedules table (flexible multi-slot schedule per course)
    this.version(16).stores({
      ...dataSchema,
      outbox: '++id, tableName, serverId, [tableName+serverId], createdAt, done, attempts',
    });

    // Version 17 - unused
    this.version(17).stores({
      ...dataSchema,
      outbox: '++id, tableName, serverId, [tableName+serverId], createdAt, done, attempts',
    });

    // Version 18 - webauthn credentials
    this.version(18).stores({
      ...dataSchema,
      outbox: '++id, tableName, serverId, [tableName+serverId], createdAt, done, attempts',
    });

    // -------------------------------------------------------------------
    // Dexie hooks – run on every table except the outbox itself
    // -------------------------------------------------------------------
    // We must capture `this` (PresensysDB) before entering the forEach because
    // the hook callbacks below use regular functions so that Dexie's own `this`
    // (the hook context, which exposes `onsuccess`) is accessible via `this`,
    // while `self` retains the DB instance reference.
    // -------------------------------------------------------------------
    const self = this;

    this.tables.forEach(table => {
      if (table.name === 'outbox') return; // never hook the outbox itself

      // ---- creating --------------------------------------------------
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table.hook('creating', function (this: any, _primKey: unknown, obj: any) {
        if (!obj.serverId) obj.serverId = uuidv4();
        if (!obj.createdAt) obj.createdAt = new Date().toISOString();
        if (!obj.updatedAt) obj.updatedAt = new Date().toISOString();
        if (obj.isDeleted === undefined) obj.isDeleted = 0;
        if (obj.synced === undefined) obj.synced = 0;

        // Capture fields before async gap
        const capturedServerId = obj.serverId as string;
        const capturedTableName = table.name;

        // Write outbox entry AFTER the transaction commits (onsuccess fires post-commit).
        // This is a separate micro-transaction; failures are silently ignored because
        // the synced=0 flag on the data row is the authoritative "needs push" marker.
        this.onsuccess = () => {
          self.outbox.add({
            tableName: capturedTableName,
            serverId: capturedServerId,
            operation: 'upsert',
            createdAt: new Date().toISOString(),
            attempts: 0,
            done: 0,
          }).catch(() => {/* best-effort */});
        };

        self.notifyChange();
      });

      // ---- updating --------------------------------------------------
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table.hook('updating', function (this: any, mods: any, _primKey: unknown, obj: any) {
        // The sync engine marks records with { synced: 1 } to confirm a successful
        // push.  We must not re-trigger a sync cycle or stamp a new updatedAt for
        // these internal confirmations.
        const isSyncEngineConfirm =
          mods !== null && 'synced' in mods && mods.synced === 1;

        if (!isSyncEngineConfirm) {
          self.notifyChange();
        }

        if (isSyncEngineConfirm) {
          return; // pass-through: let the engine's changes apply unchanged
        }

        // Write an outbox entry after the data transaction commits
        if (obj?.serverId) {
          const capturedServerId = obj.serverId as string;
          const capturedTableName = table.name;
          // A soft-delete (isDeleted: 1) produces a 'delete' outbox operation
          const operation: 'upsert' | 'delete' =
            'isDeleted' in mods && mods.isDeleted === 1 ? 'delete' : 'upsert';

          this.onsuccess = () => {
            self.outbox.add({
              tableName: capturedTableName,
              serverId: capturedServerId,
              operation,
              createdAt: new Date().toISOString(),
              attempts: 0,
              done: 0,
            }).catch(() => {/* best-effort */});
          };
        }

        // Stamp updatedAt and reset synced for all user-driven updates
        return { updatedAt: new Date().toISOString(), synced: 0 };
      });

      // ---- deleting --------------------------------------------------
      table.hook('deleting', () => {
        // Hard deletes are only done by the purge mechanism (meticulousPurge /
        // tombstone cleanup).  No outbox entry needed – there is nothing to push.
        self.notifyChange();
      });
    });
  }

  onLocalChange(callback: () => void) {
    this.onChangeListeners.push(callback);
  }

  private notifyChange() {
    this.onChangeListeners.forEach(l => l());
  }
}

export const db = new PresensysDB();

export type Semester = LocalSemester;
export type Student = LocalStudent;
export type Course = LocalCourse;
export type CourseSchedule = LocalCourseSchedule;
export type Enrollment = LocalEnrollment;
export type AttendanceSession = LocalAttendanceSession;
export type Lecturer = LocalLecturer;
export type AttendanceRecord = LocalAttendanceRecord;
export type StudentCredential = LocalStudentCredential;
