import type {
  ApiErrorBody,
  CredentialBlob,
  Data,
  Enrollment,
  LoginKey,
  Meeting,
  MoodleActivityDetail,
  MoodleCourse,
  MoodleCourseDetail,
  Page,
  Schedule,
  Semester,
  Session,
  SyncRun,
  Task,
  TaskStatus,
  User
} from "./types";
import type { LoginEnvelope } from "../lib/loginEnvelope";

const apiBase = import.meta.env.VITE_API_BASE ?? "";

type RequestOptions = {
  method?: string;
  token?: string | null;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string[]>;

  constructor(status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

export async function getLoginKey() {
  return request<Data<LoginKey>>("/api/v1/auth/login-key").then((response) => response.data);
}

export async function login(uspUsername: string, envelope: LoginEnvelope) {
  return request<Data<Session>>("/api/v1/auth/login", {
    body: { usp_username: uspUsername, envelope }
  }).then((response) => response.data);
}

export async function logout(token: string) {
  await request<void>("/api/v1/auth/logout", { token, body: null, method: "DELETE" });
}

export async function getMe(token: string) {
  return request<Data<User>>("/api/v1/me", { token }).then((response) => response.data);
}

export async function updateMe(token: string, attrs: Partial<Pick<User, "name" | "email" | "course_id">>) {
  return request<Data<User>>("/api/v1/me", {
    token,
    body: attrs,
    method: "PATCH"
  }).then((response) => response.data);
}

export async function listSemesters(token: string) {
  return request<Page<Semester>>("/api/v1/semesters", {
    token,
    query: { page_size: 100, sort: "-start_date" }
  });
}

export async function createSemester(
  token: string,
  attrs: Pick<Semester, "label" | "start_date" | "end_date"> & { active?: boolean }
) {
  return request<Data<Semester>>("/api/v1/semesters", { token, body: attrs }).then((response) => response.data);
}

export async function updateSemester(token: string, id: string, attrs: Partial<Semester>) {
  return request<Data<Semester>>(`/api/v1/semesters/${id}`, {
    token,
    body: attrs,
    method: "PATCH"
  }).then((response) => response.data);
}

export async function listEnrollments(token: string, semesterId?: string | null) {
  return request<Page<Enrollment>>("/api/v1/enrollments", {
    token,
    query: { page_size: 100, semester_id: semesterId }
  });
}

export async function createEnrollment(
  token: string,
  attrs: {
    semester_id: string;
    title: string;
    professor?: string;
    credits?: number;
    color?: string;
    absence_limit?: number;
  }
) {
  return request<Data<Enrollment>>("/api/v1/enrollments", { token, body: attrs }).then((response) => response.data);
}

export async function createMeeting(
  token: string,
  enrollmentId: string,
  attrs: {
    day_of_week: number;
    starts_at: string;
    ends_at: string;
    location?: string;
  }
) {
  return request<Data<Meeting>>(`/api/v1/enrollments/${enrollmentId}/meetings`, {
    token,
    body: attrs
  }).then((response) => response.data);
}

export async function listTasks(token: string, filters: { semesterId?: string | null; status?: string } = {}) {
  return request<Page<Task>>("/api/v1/tasks", {
    token,
    query: {
      page_size: 100,
      sort: "due_at",
      semester_id: filters.semesterId,
      status: filters.status || undefined
    }
  });
}

export async function createTask(
  token: string,
  attrs: {
    title: string;
    enrollment_id?: string;
    due_at?: string;
    kind?: string;
    priority?: string;
    notes?: string;
  }
) {
  return request<Data<Task>>("/api/v1/tasks", { token, body: attrs }).then((response) => response.data);
}

export async function updateTaskStatus(token: string, id: string, status: TaskStatus) {
  return request<Data<Task>>(`/api/v1/tasks/${id}/status`, {
    token,
    body: { status },
    method: "PATCH"
  }).then((response) => response.data);
}

export async function getSchedule(token: string, semesterId: string) {
  return request<Data<Schedule>>("/api/v1/schedule", {
    token,
    query: { semester_id: semesterId }
  }).then((response) => response.data);
}

export async function listMoodleCourses(token: string, credentialBlob: CredentialBlob) {
  return request<Data<MoodleCourse[]>>("/api/v1/moodle/courses", {
    token,
    body: { credential_blob: credentialBlob.blob }
  }).then((response) => response.data);
}

export async function getMoodleCourse(token: string, credentialBlob: CredentialBlob, courseId: number) {
  return request<Data<MoodleCourseDetail>>(`/api/v1/moodle/courses/${courseId}`, {
    token,
    body: { credential_blob: credentialBlob.blob }
  }).then((response) => response.data);
}

export async function getMoodleActivity(token: string, credentialBlob: CredentialBlob, url: string) {
  return request<Data<MoodleActivityDetail>>("/api/v1/moodle/activity", {
    token,
    body: { credential_blob: credentialBlob.blob, url }
  }).then((response) => response.data);
}

export async function listSyncRuns(token: string) {
  return request<Page<SyncRun>>("/api/v1/usp/sync", {
    token,
    query: { page_size: 20 }
  });
}

export async function startSync(token: string, credentialBlob: CredentialBlob, semesterId?: string | null) {
  return request<Data<SyncRun>>("/api/v1/usp/sync", {
    token,
    body: {
      credential_blob: credentialBlob.blob,
      semester_id: semesterId || undefined
    }
  }).then((response) => response.data);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${apiBase}${path}`, window.location.origin);

  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => undefined)) as T | ApiErrorBody | undefined;

  if (!response.ok) {
    const body = payload as ApiErrorBody | undefined;
    const message = body?.error?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body?.error?.fields);
  }

  return payload as T;
}
