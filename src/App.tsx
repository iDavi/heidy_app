import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  GraduationCap,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SquarePen,
  TableProperties
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createEnrollment,
  createMeeting,
  createSemester,
  createTask,
  getLoginKey,
  getMoodleActivity,
  getMoodleCourse,
  getMe,
  getSchedule,
  listEnrollments,
  listMoodleCourses,
  listSemesters,
  listSyncRuns,
  listTasks,
  login,
  logout,
  startSync,
  updateMe,
  updateSemester,
  updateTaskStatus
} from "./api/client";
import type {
  CredentialBlob,
  Enrollment,
  MoodleActivityDetail,
  MoodleCourse,
  MoodleCourseDetail,
  Schedule,
  Semester,
  SyncRun,
  Task,
  TaskPriority,
  TaskStatus,
  User
} from "./api/types";
import { useLocalSession } from "./hooks/useLocalSession";
import { sealPassword } from "./lib/loginEnvelope";

const navItems = [
  { id: "home", label: "Home", icon: TableProperties },
  { id: "tasks", label: "Tasks", icon: Check },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "classes", label: "Classes", icon: BookOpen },
  { id: "moodle", label: "Moodle", icon: GraduationCap },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "settings", label: "Settings", icon: Settings }
] as const;

type PageId = (typeof navItems)[number]["id"];

const days = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"]
] as const;

const taskStatuses: TaskStatus[] = ["todo", "doing", "done"];
const taskPriorities: TaskPriority[] = ["low", "normal", "high"];
const taskKinds = ["assignment", "exam", "project", "reading", "other"] as const;

type WorkspaceState = {
  user: User;
  semesters: Semester[];
  enrollments: Enrollment[];
  tasks: Task[];
  schedule?: Schedule;
  syncRuns: SyncRun[];
  moodleCourses: MoodleCourse[];
  moodleCourse?: MoodleCourseDetail;
  moodleActivity?: MoodleActivityDetail;
};

function App() {
  const { session, setSession, patchUser, clearSession } = useLocalSession();

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

  return <Workspace session={session} onUserChange={patchUser} onLogout={clearSession} />;
}

function LoginScreen({
  onLogin
}: {
  onLogin: (session: { token: string; user: User; credentialBlob: CredentialBlob }) => void;
}) {
  const [uspUsername, setUspUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const loginKey = await getLoginKey();
      const envelope = await sealPassword(loginKey, password);
      const session = await login(uspUsername, envelope);
      onLogin({ token: session.token, user: session.user, credentialBlob: session.credential_blob });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="app-mark">H</div>
        <h1 id="login-title">Heidy</h1>
        <form className="stack" onSubmit={handleSubmit}>
          <label>
            USP number
            <input
              inputMode="numeric"
              autoComplete="username"
              value={uspUsername}
              onChange={(event) => setUspUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : null}
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function Workspace({
  session,
  onUserChange,
  onLogout
}: {
  session: { token: string; user: User; credentialBlob?: CredentialBlob };
  onUserChange: (user: User) => void;
  onLogout: () => void;
}) {
  const [page, setPage] = useState<PageId>("home");
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>("");
  const [state, setState] = useState<WorkspaceState>({
    user: session.user,
    semesters: [],
    enrollments: [],
    tasks: [],
    syncRuns: [],
    moodleCourses: []
  });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [moodleLoading, setMoodleLoading] = useState(false);
  const [moodleRequested, setMoodleRequested] = useState(false);

  const token = session.token;

  const activeSemester = useMemo(
    () => state.semesters.find((semester) => semester.id === selectedSemesterId) ?? state.semesters[0],
    [selectedSemesterId, state.semesters]
  );

  const refresh = useCallback(
    async (semesterId = selectedSemesterId) => {
      setError("");
      const [user, semestersPage, syncPage] = await Promise.all([getMe(token), listSemesters(token), listSyncRuns(token)]);
      const nextSemesterId =
        semesterId || semestersPage.data.find((semester) => semester.active)?.id || semestersPage.data[0]?.id || "";
      const [enrollmentsPage, tasksPage, schedule] = await Promise.all([
        listEnrollments(token, nextSemesterId || undefined),
        listTasks(token, { semesterId: nextSemesterId || undefined }),
        nextSemesterId ? getSchedule(token, nextSemesterId).catch(() => undefined) : Promise.resolve(undefined)
      ]);

      setSelectedSemesterId(nextSemesterId);
      setState((current) => ({
        ...current,
        user,
        semesters: semestersPage.data,
        enrollments: enrollmentsPage.data,
        tasks: tasksPage.data,
        schedule,
        syncRuns: syncPage.data
      }));
      onUserChange(user);
    },
    [onUserChange, selectedSemesterId, token]
  );

  useEffect(() => {
    refresh()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleLogout() {
    try {
      await logout(token);
    } catch {
      // Local logout is still correct if the token is already invalid.
    } finally {
      onLogout();
    }
  }

  async function runAction(action: () => Promise<void>, success?: string) {
    setError("");
    setNotice("");

    try {
      await action();
      if (success) setNotice(success);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const loadMoodleCourses = useCallback(async () => {
    if (!session.credentialBlob) throw new Error("Sign in again to access Moodle.");

    setMoodleRequested(true);
    setMoodleLoading(true);

    try {
      const moodleCourses = await listMoodleCourses(token, session.credentialBlob);
      setState((current) => ({ ...current, moodleCourses, moodleCourse: undefined, moodleActivity: undefined }));
    } finally {
      setMoodleLoading(false);
    }
  }, [session.credentialBlob, token]);

  async function loadMoodleCourse(course: MoodleCourse) {
    if (!session.credentialBlob) throw new Error("Sign in again to access Moodle.");

    setMoodleLoading(true);

    try {
      const moodleCourse = await getMoodleCourse(token, session.credentialBlob, course.id);
      setState((current) => ({ ...current, moodleCourse, moodleActivity: undefined }));
    } finally {
      setMoodleLoading(false);
    }
  }

  async function loadMoodleActivity(url: string) {
    if (!session.credentialBlob) throw new Error("Sign in again to access Moodle.");

    setMoodleLoading(true);

    try {
      const moodleActivity = await getMoodleActivity(token, session.credentialBlob, url);
      setState((current) => ({ ...current, moodleActivity }));
    } finally {
      setMoodleLoading(false);
    }
  }

  useEffect(() => {
    if (page === "moodle" && !moodleRequested && !moodleLoading) {
      loadMoodleCourses().catch((cause) => setError(errorMessage(cause)));
    }
  }, [loadMoodleCourses, moodleLoading, moodleRequested, page]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="account-row">
          <div className="app-mark small">H</div>
          <div>
            <strong>{state.user.name || state.user.usp_username}</strong>
            <span>{state.user.email || "No email"}</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <label className="search-box">
          <Search size={15} />
          <input placeholder="Search" />
        </label>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              type="button"
              onClick={() => setPage(item.id)}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-section">
          <div className="sidebar-label">Semesters</div>
          {state.semesters.slice(0, 5).map((semester) => (
            <button
              className={semester.id === activeSemester?.id ? "active subtle" : "subtle"}
              key={semester.id}
              type="button"
              onClick={() => {
                setSelectedSemesterId(semester.id);
                refresh(semester.id).catch((cause) => setError(errorMessage(cause)));
              }}
            >
              <Circle size={9} fill={semester.active ? "currentColor" : "none"} />
              {semester.label}
            </button>
          ))}
        </div>
        <button className="logout-button" type="button" onClick={handleLogout}>
          <LogOut size={16} />
          Log out
        </button>
      </aside>

      <main className="main-pane">
        <header className="topbar">
          <div>
            <span className="crumb">{pageLabel(page)}</span>
            <h1>{pageTitle(page, activeSemester)}</h1>
          </div>
          <div className="topbar-actions">
            <select
              value={activeSemester?.id ?? ""}
              onChange={(event) => {
                setSelectedSemesterId(event.target.value);
                refresh(event.target.value).catch((cause) => setError(errorMessage(cause)));
              }}
            >
              {state.semesters.length === 0 ? <option value="">No semester</option> : null}
              {state.semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => refresh().catch((cause) => setError(errorMessage(cause)))}>
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        </header>

        {notice ? <div className="notice">{notice}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        {loading ? (
          <div className="loading-state">
            <Loader2 className="spin" size={18} />
            Loading
          </div>
        ) : (
          <div className="content-grid">
            {page === "home" ? (
              <HomePage
                semesters={state.semesters}
                enrollments={state.enrollments}
                tasks={state.tasks}
                syncRuns={state.syncRuns}
                schedule={state.schedule}
                activeSemester={activeSemester}
                onTaskStatus={(task, status) =>
                  runAction(async () => {
                    await updateTaskStatus(token, task.id, status);
                    await refresh();
                  })
                }
              />
            ) : null}
            {page === "tasks" ? (
              <TasksPage
                tasks={state.tasks}
                enrollments={state.enrollments}
                semester={activeSemester}
                onCreate={(attrs) =>
                  runAction(async () => {
                    await createTask(token, attrs);
                    await refresh();
                  }, "Task added")
                }
                onStatus={(task, status) =>
                  runAction(async () => {
                    await updateTaskStatus(token, task.id, status);
                    await refresh();
                  })
                }
              />
            ) : null}
            {page === "schedule" ? <SchedulePage schedule={state.schedule} /> : null}
            {page === "classes" ? (
              <ClassesPage
                semester={activeSemester}
                semesters={state.semesters}
                enrollments={state.enrollments}
                onSemester={(attrs) =>
                  runAction(async () => {
                    const semester = await createSemester(token, attrs);
                    await refresh(semester.id);
                  }, "Semester added")
                }
                onActivate={(semester) =>
                  runAction(async () => {
                    await updateSemester(token, semester.id, { active: true });
                    await refresh(semester.id);
                  })
                }
                onEnrollment={(attrs) =>
                  runAction(async () => {
                    await createEnrollment(token, attrs);
                    await refresh();
                  }, "Class added")
                }
                onMeeting={(enrollmentId, attrs) =>
                  runAction(async () => {
                    await createMeeting(token, enrollmentId, attrs);
                    await refresh();
                  }, "Meeting added")
                }
              />
            ) : null}
            {page === "moodle" ? (
              <MoodlePage
                courses={state.moodleCourses}
                course={state.moodleCourse}
                activity={state.moodleActivity}
                loading={moodleLoading}
                onRefresh={() => runAction(loadMoodleCourses)}
                onCourse={(course) => runAction(() => loadMoodleCourse(course))}
                onActivity={(url) => runAction(() => loadMoodleActivity(url))}
              />
            ) : null}
            {page === "sync" ? (
              <SyncPage
                runs={state.syncRuns}
                hasCredential={Boolean(session.credentialBlob)}
                onSync={() =>
                  runAction(async () => {
                    if (!session.credentialBlob) throw new Error("Sign in again to refresh the credential blob.");
                    await startSync(token, session.credentialBlob, activeSemester?.id);
                    await refresh();
                  }, "Sync started")
                }
              />
            ) : null}
            {page === "settings" ? (
              <SettingsPage
                user={state.user}
                onSave={(attrs) =>
                  runAction(async () => {
                    const user = await updateMe(token, attrs);
                    setState((current) => ({ ...current, user }));
                    onUserChange(user);
                  }, "Profile saved")
                }
              />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

function HomePage({
  semesters,
  enrollments,
  tasks,
  syncRuns,
  schedule,
  activeSemester,
  onTaskStatus
}: {
  semesters: Semester[];
  enrollments: Enrollment[];
  tasks: Task[];
  syncRuns: SyncRun[];
  schedule?: Schedule;
  activeSemester?: Semester;
  onTaskStatus: (task: Task, status: TaskStatus) => void;
}) {
  const openTasks = tasks.filter((task) => task.status !== "done").slice(0, 6);

  return (
    <>
      <section className="metric-row">
        <Metric label="Semesters" value={semesters.length} />
        <Metric label="Classes" value={enrollments.length} />
        <Metric label="Open tasks" value={tasks.filter((task) => task.status !== "done").length} />
        <Metric label="Last sync" value={syncRuns[0]?.status ?? "none"} />
      </section>
      <section className="section-block">
        <SectionTitle icon={Check} title="Tasks" count={openTasks.length} />
        <TaskTable tasks={openTasks} enrollments={enrollments} onStatus={onTaskStatus} compact />
      </section>
      <section className="section-block">
        <SectionTitle icon={Clock3} title={activeSemester ? `Today in ${activeSemester.label}` : "Today"} />
        <ScheduleStrip schedule={schedule} />
      </section>
    </>
  );
}

function TasksPage({
  tasks,
  enrollments,
  semester,
  onCreate,
  onStatus
}: {
  tasks: Task[];
  enrollments: Enrollment[];
  semester?: Semester;
  onCreate: (attrs: Parameters<typeof createTask>[1]) => void;
  onStatus: (task: Task, status: TaskStatus) => void;
}) {
  const [title, setTitle] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [kind, setKind] = useState("assignment");
  const [priority, setPriority] = useState<TaskPriority>("normal");

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({
      title,
      enrollment_id: enrollmentId || undefined,
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      kind,
      priority
    });
    setTitle("");
    setDueAt("");
  }

  return (
    <>
      <section className="section-block">
        <SectionTitle icon={Plus} title="New task" />
        <form className="inline-form" onSubmit={submit}>
          <input placeholder="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <select value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}>
            <option value="">No class</option>
            {enrollments.map((enrollment) => (
              <option key={enrollment.id} value={enrollment.id}>
                {enrollment.title || "Untitled"}
              </option>
            ))}
          </select>
          <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {taskKinds.map((taskKind) => (
              <option key={taskKind}>{taskKind}</option>
            ))}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
            {taskPriorities.map((taskPriority) => (
              <option key={taskPriority}>{taskPriority}</option>
            ))}
          </select>
          <button className="icon-button" title="Add task" type="submit" disabled={!semester}>
            <Plus size={16} />
          </button>
        </form>
      </section>
      <section className="section-block">
        <SectionTitle icon={Check} title="Tasks" count={tasks.length} />
        <TaskTable tasks={tasks} enrollments={enrollments} onStatus={onStatus} />
      </section>
    </>
  );
}

function SchedulePage({ schedule }: { schedule?: Schedule }) {
  return (
    <section className="section-block fill">
      <SectionTitle icon={CalendarDays} title="Week" />
      <div className="week-grid">
        {days.map(([day, label]) => (
          <div className="day-column" key={day}>
            <div className="day-name">{label}</div>
            {(schedule?.days[day] ?? []).length === 0 ? <div className="empty-line">No meetings</div> : null}
            {(schedule?.days[day] ?? []).map((slot) => (
              <div className="slot-row" key={`${day}-${slot.enrollment_id}-${slot.starts_at}`}>
                <span className="color-dot" style={{ background: slot.color || "#8d8a82" }} />
                <div>
                  <strong>{slot.title || "Class"}</strong>
                  <span>
                    {slot.starts_at} - {slot.ends_at}
                    {slot.location ? ` · ${slot.location}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ClassesPage({
  semester,
  semesters,
  enrollments,
  onSemester,
  onActivate,
  onEnrollment,
  onMeeting
}: {
  semester?: Semester;
  semesters: Semester[];
  enrollments: Enrollment[];
  onSemester: (attrs: { label: string; start_date: string; end_date: string; active?: boolean }) => void;
  onActivate: (semester: Semester) => void;
  onEnrollment: (attrs: Parameters<typeof createEnrollment>[1]) => void;
  onMeeting: (enrollmentId: string, attrs: Parameters<typeof createMeeting>[2]) => void;
}) {
  const [semesterForm, setSemesterForm] = useState({ label: "", start_date: "", end_date: "", active: true });
  const [classForm, setClassForm] = useState({
    title: "",
    professor: "",
    credits: "",
    color: "#6f7d6d",
    absence_limit: ""
  });
  const [meetingForm, setMeetingForm] = useState({
    enrollmentId: "",
    day_of_week: "1",
    starts_at: "08:00",
    ends_at: "10:00",
    location: ""
  });

  function submitSemester(event: FormEvent) {
    event.preventDefault();
    onSemester(semesterForm);
    setSemesterForm({ label: "", start_date: "", end_date: "", active: true });
  }

  function submitClass(event: FormEvent) {
    event.preventDefault();
    if (!semester) return;
    onEnrollment({
      semester_id: semester.id,
      title: classForm.title,
      professor: classForm.professor || undefined,
      credits: classForm.credits ? Number(classForm.credits) : undefined,
      color: classForm.color,
      absence_limit: classForm.absence_limit ? Number(classForm.absence_limit) : undefined
    });
    setClassForm({ title: "", professor: "", credits: "", color: "#6f7d6d", absence_limit: "" });
  }

  function submitMeeting(event: FormEvent) {
    event.preventDefault();
    onMeeting(meetingForm.enrollmentId, {
      day_of_week: Number(meetingForm.day_of_week),
      starts_at: meetingForm.starts_at,
      ends_at: meetingForm.ends_at,
      location: meetingForm.location || undefined
    });
  }

  return (
    <>
      <section className="split-grid">
        <div className="section-block">
          <SectionTitle icon={Plus} title="Semester" />
          <form className="stack compact" onSubmit={submitSemester}>
            <input
              placeholder="Label"
              value={semesterForm.label}
              onChange={(event) => setSemesterForm({ ...semesterForm, label: event.target.value })}
              required
            />
            <div className="two-col">
              <input
                type="date"
                value={semesterForm.start_date}
                onChange={(event) => setSemesterForm({ ...semesterForm, start_date: event.target.value })}
                required
              />
              <input
                type="date"
                value={semesterForm.end_date}
                onChange={(event) => setSemesterForm({ ...semesterForm, end_date: event.target.value })}
                required
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={semesterForm.active}
                onChange={(event) => setSemesterForm({ ...semesterForm, active: event.target.checked })}
              />
              Active
            </label>
            <button type="submit">Add semester</button>
          </form>
        </div>
        <div className="section-block">
          <SectionTitle icon={Plus} title="Class" />
          <form className="stack compact" onSubmit={submitClass}>
            <input
              placeholder="Title"
              value={classForm.title}
              onChange={(event) => setClassForm({ ...classForm, title: event.target.value })}
              required
            />
            <input
              placeholder="Professor"
              value={classForm.professor}
              onChange={(event) => setClassForm({ ...classForm, professor: event.target.value })}
            />
            <div className="three-col">
              <input
                type="number"
                min="0"
                max="40"
                placeholder="Credits"
                value={classForm.credits}
                onChange={(event) => setClassForm({ ...classForm, credits: event.target.value })}
              />
              <input
                type="number"
                min="0"
                max="200"
                placeholder="Absences"
                value={classForm.absence_limit}
                onChange={(event) => setClassForm({ ...classForm, absence_limit: event.target.value })}
              />
              <input
                type="color"
                title="Color"
                value={classForm.color}
                onChange={(event) => setClassForm({ ...classForm, color: event.target.value })}
              />
            </div>
            <button type="submit" disabled={!semester}>
              Add class
            </button>
          </form>
        </div>
        <div className="section-block">
          <SectionTitle icon={Clock3} title="Meeting" />
          <form className="stack compact" onSubmit={submitMeeting}>
            <select
              value={meetingForm.enrollmentId}
              onChange={(event) => setMeetingForm({ ...meetingForm, enrollmentId: event.target.value })}
              required
            >
              <option value="">Class</option>
              {enrollments.map((enrollment) => (
                <option key={enrollment.id} value={enrollment.id}>
                  {enrollment.title || "Untitled"}
                </option>
              ))}
            </select>
            <select
              value={meetingForm.day_of_week}
              onChange={(event) => setMeetingForm({ ...meetingForm, day_of_week: event.target.value })}
            >
              {days.map(([, label], index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
            <div className="two-col">
              <input
                type="time"
                value={meetingForm.starts_at}
                onChange={(event) => setMeetingForm({ ...meetingForm, starts_at: event.target.value })}
                required
              />
              <input
                type="time"
                value={meetingForm.ends_at}
                onChange={(event) => setMeetingForm({ ...meetingForm, ends_at: event.target.value })}
                required
              />
            </div>
            <input
              placeholder="Room"
              value={meetingForm.location}
              onChange={(event) => setMeetingForm({ ...meetingForm, location: event.target.value })}
            />
            <button type="submit" disabled={enrollments.length === 0}>
              Add meeting
            </button>
          </form>
        </div>
      </section>
      <section className="section-block">
        <SectionTitle icon={BookOpen} title="Classes" count={enrollments.length} />
        <div className="data-table">
          <div className="table-head classes">
            <span>Name</span>
            <span>Professor</span>
            <span>Meetings</span>
            <span>Source</span>
          </div>
          {enrollments.map((enrollment) => (
            <div className="table-row classes" key={enrollment.id}>
              <span>
                <i className="color-dot" style={{ background: enrollment.color || "#8d8a82" }} />
                {enrollment.title || "Untitled"}
              </span>
              <span>{enrollment.professor || "-"}</span>
              <span>{enrollment.meetings.length}</span>
              <span>{enrollment.source}</span>
            </div>
          ))}
          {enrollments.length === 0 ? <div className="empty-table">No classes</div> : null}
        </div>
      </section>
      <section className="section-block">
        <SectionTitle icon={CalendarDays} title="Semesters" count={semesters.length} />
        <div className="row-list">
          {semesters.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <span>
                  {formatDate(item.start_date)} - {formatDate(item.end_date)}
                </span>
              </div>
              <button type="button" disabled={item.active} onClick={() => onActivate(item)}>
                {item.active ? "Active" : "Set active"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function MoodlePage({
  courses,
  course,
  activity,
  loading,
  onRefresh,
  onCourse,
  onActivity
}: {
  courses: MoodleCourse[];
  course?: MoodleCourseDetail;
  activity?: MoodleActivityDetail;
  loading: boolean;
  onRefresh: () => void;
  onCourse: (course: MoodleCourse) => void;
  onActivity: (url: string) => void;
}) {
  return (
    <>
      <section className="section-block">
        <div className="section-title with-action">
          <GraduationCap size={16} />
          <h2>Courses</h2>
          <span>{courses.length}</span>
          <button className="icon-button" title="Refresh courses" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={loading ? "spin" : undefined} size={16} />
          </button>
        </div>
        <div className="data-table">
          <div className="table-head moodle-courses">
            <span>Course</span>
            <span />
          </div>
          {courses.map((item) => (
            <div className="table-row moodle-courses" key={item.id}>
              <span className="course-name">
                {item.code ? <small>{item.code}</small> : null}
                <strong>{item.name || item.title}</strong>
              </span>
              <button className="icon-button" title={`Open ${item.title}`} type="button" onClick={() => onCourse(item)} disabled={loading}>
                <ArrowRight size={16} />
              </button>
            </div>
          ))}
          {!loading && courses.length === 0 ? <div className="empty-table">No courses</div> : null}
        </div>
      </section>

      {course ? (
        <section className="section-block">
          <SectionTitle icon={BookOpen} title={course.title} count={course.activities.length} />
          <div className="data-table">
            <div className="table-head moodle-activities">
              <span>Item</span>
              <span>Type</span>
              <span />
            </div>
            {course.activities.map((item) => (
              <div className="table-row moodle-activities" key={item.id}>
                <span>{item.title}</span>
                <span>{item.kind}</span>
                <button className="icon-button" title={`Read ${item.title}`} type="button" onClick={() => onActivity(item.url)} disabled={loading}>
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
            {course.activities.length === 0 ? <div className="empty-table">No items</div> : null}
          </div>
        </section>
      ) : null}

      {activity ? (
        <section className="section-block">
          <SectionTitle icon={BookOpen} title={activity.title} />
          {activity.file ? <MoodleFile file={activity.file} /> : <div className="moodle-content">{activity.content || "No readable text"}</div>}
        </section>
      ) : null}
    </>
  );
}

function MoodleFile({ file }: { file: NonNullable<MoodleActivityDetail["file"]> }) {
  const source = `data:${file.mime};base64,${file.data}`;

  if (file.mime.startsWith("image/")) {
    return <img className="moodle-file image" src={source} alt={file.name} />;
  }

  if (file.mime.includes("pdf")) {
    return <iframe className="moodle-file pdf" title={file.name} src={source} />;
  }

  return (
    <div className="moodle-content">
      <a href={source} download={file.name}>
        {file.name}
      </a>
    </div>
  );
}

function SyncPage({ runs, hasCredential, onSync }: { runs: SyncRun[]; hasCredential: boolean; onSync: () => void }) {
  return (
    <>
      <section className="section-block">
        <SectionTitle icon={RefreshCw} title="USP + Moodle" />
        <button className="primary-button narrow" type="button" onClick={onSync} disabled={!hasCredential}>
          <RefreshCw size={15} />
          Start sync
        </button>
        {!hasCredential ? <p className="muted">Sign in again to sync.</p> : null}
      </section>
      <section className="section-block">
        <SectionTitle icon={Clock3} title="Runs" count={runs.length} />
        <div className="data-table">
          <div className="table-head sync">
            <span>Status</span>
            <span>Sources</span>
            <span>Started</span>
            <span>Finished</span>
          </div>
          {runs.map((run) => (
            <div className="table-row sync" key={run.id}>
              <span className={`status ${run.status}`}>{run.status}</span>
              <span>{run.sources.join(", ")}</span>
              <span>{formatDateTime(run.started_at)}</span>
              <span>{run.finished_at ? formatDateTime(run.finished_at) : "-"}</span>
            </div>
          ))}
          {runs.length === 0 ? <div className="empty-table">No runs</div> : null}
        </div>
      </section>
    </>
  );
}

function SettingsPage({
  user,
  onSave
}: {
  user: User;
  onSave: (attrs: Partial<Pick<User, "name" | "email" | "course_id">>) => void;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");

  return (
    <section className="section-block settings-block">
      <SectionTitle icon={SquarePen} title="Profile" />
      <form
        className="stack compact"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name: name || undefined, email: email || undefined });
        }}
      >
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button type="submit">Save</button>
      </form>
    </section>
  );
}

function TaskTable({
  tasks,
  enrollments,
  onStatus,
  compact = false
}: {
  tasks: Task[];
  enrollments: Enrollment[];
  onStatus: (task: Task, status: TaskStatus) => void;
  compact?: boolean;
}) {
  const enrollmentById = useMemo(() => new Map(enrollments.map((item) => [item.id, item])), [enrollments]);

  return (
    <div className="data-table">
      <div className="table-head tasks">
        <span>Name</span>
        <span>Due</span>
        <span>Status</span>
        {!compact ? <span>Class</span> : null}
      </div>
      {tasks.map((task) => (
        <div className="table-row tasks" key={task.id}>
          <span className="task-name">
            <span>{task.title}</span>
            {task.source === "moodle" ? <small>Moodle</small> : null}
          </span>
          <span>{task.due_at ? formatDateTime(task.due_at) : "-"}</span>
          <span>
            <select value={task.status} onChange={(event) => onStatus(task, event.target.value as TaskStatus)}>
              {taskStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </span>
          {!compact ? <span>{task.enrollment_id ? enrollmentById.get(task.enrollment_id)?.title ?? "-" : "-"}</span> : null}
        </div>
      ))}
      {tasks.length === 0 ? <div className="empty-table">No tasks</div> : null}
    </div>
  );
}

function ScheduleStrip({ schedule }: { schedule?: Schedule }) {
  const todayKey = days[(new Date().getDay() + 6) % 7][0];
  const slots = schedule?.days[todayKey] ?? [];

  return (
    <div className="row-list">
      {slots.map((slot) => (
        <div className="list-row" key={`${slot.enrollment_id}-${slot.starts_at}`}>
          <div>
            <strong>{slot.title || "Class"}</strong>
            <span>
              {slot.starts_at} - {slot.ends_at}
              {slot.location ? ` · ${slot.location}` : ""}
            </span>
          </div>
        </div>
      ))}
      {slots.length === 0 ? <div className="empty-table">No meetings</div> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, count }: { icon: typeof Check; title: string; count?: number }) {
  return (
    <div className="section-title">
      <Icon size={16} />
      <h2>{title}</h2>
      {typeof count === "number" ? <span>{count}</span> : null}
    </div>
  );
}

function pageLabel(page: PageId) {
  return navItems.find((item) => item.id === page)?.label ?? "Home";
}

function pageTitle(page: PageId, semester?: Semester) {
  if (page === "home") return semester?.label ?? "Home";
  return pageLabel(page);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function errorMessage(cause: unknown) {
  if (cause instanceof ApiError) {
    const firstField = cause.fields ? Object.entries(cause.fields)[0] : undefined;
    return firstField ? `${firstField[0]}: ${firstField[1].join(", ")}` : cause.message;
  }

  if (cause instanceof Error) return cause.message;
  return "Request failed";
}

export default App;
