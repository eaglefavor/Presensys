export interface SyncableRecord {
  id?: number; // Local Dexie ID
  server_id?: string; // UUID from Supabase
  created_at?: string;
  updated_at?: string;
  is_deleted: boolean;
  synced_at?: number; // Timestamp of last successful sync
}

export interface Semester extends SyncableRecord {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_archived: boolean;
  user_id?: string;
}

export interface Student extends SyncableRecord {
  reg_number: string;
  name: string;
  email?: string;
  phone?: string;
  user_id?: string;
}

export interface Course extends SyncableRecord {
  code: string;
  title: string;
  semester_id: string; // References server_id of semester
  local_semester_id?: number; // Helper for local queries
  user_id?: string;
}

export interface Enrollment extends SyncableRecord {
  student_id: string; // References server_id
  course_id: string; // References server_id
  local_student_id?: number;
  local_course_id?: number;
  user_id?: string;
}

export interface AttendanceSession extends SyncableRecord {
  course_id: string; // References server_id
  local_course_id?: number;
  date: string;
  title: string;
  user_id?: string;
}

export interface AttendanceRecord extends SyncableRecord {
  session_id: string; // References server_id
  student_id: string; // References server_id
  local_session_id?: number;
  local_student_id?: number;
  status: 'present' | 'absent' | 'excused';
  marked_at: number;
  user_id?: string;
}
