export type Page<T> = {
  data: T[];
  meta: {
    page: number;
    page_size: number;
    total: number;
  };
};

export type Data<T> = {
  data: T;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[]>;
  };
};

export type User = {
  id: string;
  usp_username: string;
  name?: string | null;
  email?: string | null;
  course_id?: string | null;
};

export type LoginKey = {
  key_id: string;
  alg: string;
  public_key: string;
};

export type CredentialBlob = {
  blob: string;
  expires_at: string;
};

export type Session = {
  user: User;
  token: string;
  credential_blob: CredentialBlob;
};

export type Semester = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  active: boolean;
  source: "manual" | "usp";
};

export type Meeting = {
  id: string;
  enrollment_id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  location?: string | null;
};

export type Enrollment = {
  id: string;
  semester_id: string;
  discipline_id?: string | null;
  title?: string | null;
  professor?: string | null;
  credits?: number | null;
  color?: string | null;
  absence_limit?: number | null;
  source: "manual" | "usp";
  external_ref?: string | null;
  meetings: Meeting[];
};

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "normal" | "high";
export type TaskKind = "assignment" | "exam" | "project" | "reading" | "other";

export type Task = {
  id: string;
  enrollment_id?: string | null;
  title: string;
  notes?: string | null;
  kind?: TaskKind | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at?: string | null;
  source: "manual" | "usp";
};

export type ScheduleSlot = {
  enrollment_id: string;
  title: string;
  color?: string | null;
  starts_at: string;
  ends_at: string;
  location?: string | null;
};

export type Schedule = {
  semester_id: string;
  days: Record<string, ScheduleSlot[]>;
};

export type SyncRun = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  sources: string[];
  semester_id?: string | null;
  counts?: Record<string, number> | null;
  error?: string | null;
  started_at: string;
  finished_at?: string | null;
};
