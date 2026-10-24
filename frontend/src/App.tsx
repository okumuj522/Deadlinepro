import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

type Priority = "Low" | "Medium" | "High";
type View = "Dashboard" | "My Tasks" | "Calendar" | "Reminders";

type Task = {
  id: number;
  title: string;
  category: string;
  dueDate: string;
  priority: Priority;
  completed: boolean | number;
  createdAt?: string;
};

type TaskForm = {
  title: string;
  category: string;
  dueDate: string;
  priority: Priority;
};

const emptyForm: TaskForm = {
  title: "",
  category: "General",
  dueDate: "",
  priority: "Medium",
};

function dateOnly(value: string | Date): string {
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }

  return String(value).slice(0, 10);
}

function localToday(): string {
  return dateOnly(new Date());
}

function isCompleted(task: Task): boolean {
  return task.completed === true || task.completed === 1;
}

function formatDate(value: string): string {
  if (!value) return "No date";

  const date = new Date(`${dateOnly(value)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: string, today: string): number {
  const due = new Date(`${dateOnly(value)}T00:00:00`);
  const current = new Date(`${today}T00:00:00`);

  return Math.round((due.getTime() - current.getTime()) / 86400000);
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Cannot connect to the backend. Start the server on port 5000.",
    );
  }

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed (${response.status})`;

    throw new Error(message);
  }

  return data as T;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<View>("Dashboard");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("date");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const today = localToday();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest<Task[]>("/tasks");

      setTasks(
        data.map((task) => ({
          ...task,
          dueDate: dateOnly(task.dueDate),
          completed: isCompleted(task),
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load tasks.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const stats = useMemo(() => {
    const pending = tasks.filter((task) => !isCompleted(task));
    const completed = tasks.filter(isCompleted);
    const overdue = pending.filter((task) => task.dueDate < today);

    const dueToday = pending.filter(
      (task) => daysUntil(task.dueDate, today) === 0,
    );

    const dueNextThreeDays = pending.filter((task) => {
      const days = daysUntil(task.dueDate, today);
      return days >= 1 && days <= 3;
    });

    const dueSoon = pending.filter((task) => {
      const days = daysUntil(task.dueDate, today);
      return days >= 0 && days <= 7;
    });

    return {
      total: tasks.length,
      pending: pending.length,
      completed: completed.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      dueNextThreeDays: dueNextThreeDays.length,
      dueSoon: dueSoon.length,
      progress: tasks.length
        ? Math.round((completed.length / tasks.length) * 100)
        : 0,
    };
  }, [tasks, today]);

  const visibleTasks = useMemo(() => {
    let result = [...tasks];

    if (view === "Reminders") {
      result = result.filter(
        (task) =>
          !isCompleted(task) && daysUntil(task.dueDate, today) <= 7,
      );
    }

    if (filter === "Pending") {
      result = result.filter((task) => !isCompleted(task));
    } else if (filter === "Completed") {
      result = result.filter(isCompleted);
    } else if (filter === "Overdue") {
      result = result.filter(
        (task) => !isCompleted(task) && task.dueDate < today,
      );
    } else if (filter === "High priority") {
      result = result.filter((task) => task.priority === "High");
    }

    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.category.toLowerCase().includes(query),
      );
    }

    result.sort((a, b) => {
      if (sort === "priority") {
        const rank: Record<Priority, number> = {
          High: 0,
          Medium: 1,
          Low: 2,
        };

        return rank[a.priority] - rank[b.priority];
      }

      if (sort === "title") {
        return a.title.localeCompare(b.title);
      }

      return a.dueDate.localeCompare(b.dueDate) || b.id - a.id;
    });

    return result;
  }, [tasks, view, filter, search, sort, today]);

  function openNewTask(date = "") {
    setEditingTask(null);
    setForm({ ...emptyForm, dueDate: date || today });
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      category: task.category,
      dueDate: dateOnly(task.dueDate),
      priority: task.priority,
    });
    setError("");
    setNotice("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    if (!form.dueDate) {
      setError("Please select a due date.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || "General",
      dueDate: form.dueDate,
      priority: form.priority,
    };

    try {
      if (editingTask) {
        await apiRequest<Task>(`/tasks/${editingTask.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        setNotice("Task updated successfully.");
      } else {
        await apiRequest<Task>("/tasks", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setNotice("Task created successfully.");
      }

      setShowForm(false);
      setEditingTask(null);
      setForm(emptyForm);
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: Task) {
    setBusyId(task.id);
    setError("");
    setNotice("");

    try {
      await apiRequest<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !isCompleted(task) }),
      });

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? { ...item, completed: !isCompleted(item) }
            : item,
        ),
      );

      setNotice(
        isCompleted(task)
          ? "Task marked as pending."
          : "Task completed. Great work!",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update task.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTask(task: Task) {
    const confirmed = window.confirm(
      `Delete "${task.title}"? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setBusyId(task.id);
    setError("");
    setNotice("");

    try {
      await apiRequest<void>(`/tasks/${task.id}`, {
        method: "DELETE",
      });

      setTasks((current) => current.filter((item) => item.id !== task.id));
      setNotice("Task deleted.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete task.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const pageDescription: Record<View, string> = {
    Dashboard: "Your deadlines, progress and priorities at a glance.",
    "My Tasks": "Create, organize and manage all your tasks.",
    Calendar: "View your deadlines across the month.",
    Reminders: "Keep an eye on overdue and upcoming deadlines.",
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>DeadlinePro</strong>
            <span>SMART PRODUCTIVITY</span>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="main-nav" aria-label="Main navigation">
          {(
            [
              ["Dashboard", "▦"],
              ["My Tasks", "☷"],
              ["Calendar", "▦"],
              ["Reminders", "♧"],
            ] as [View, string][]
          ).map(([item, symbol]) => (
            <button
              key={item}
              type="button"
              className={`nav-item ${view === item ? "active" : ""}`}
              onClick={() => {
                setView(item);
                setFilter("All");
                setSearch("");
              }}
            >
              <span className="nav-symbol">{symbol}</span>
              <span>{item}</span>
              {item === "Reminders" && stats.overdue > 0 && (
                <span className="nav-count">{stats.overdue}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">✦</span>
            <strong>Stay on track</strong>
            <p>Small steps every day lead to big results.</p>
          </div>

          <div className="sidebar-status">
            <span className="online-dot" />
            <span>Connected workspace</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{view}</strong>
          </div>

          <div className="topbar-right">
            <span className="today-label">{formatDate(today)}</span>
            <div className="avatar">DP</div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">YOUR PERSONAL WORKSPACE</div>
              <h1>
                {view === "Dashboard"
                  ? "Welcome back!"
                  : view === "My Tasks"
                    ? "My Tasks"
                    : view === "Calendar"
                      ? "Your Calendar"
                      : "Reminders"}
              </h1>
              <p>{pageDescription[view]}</p>
            </div>

            <button
              type="button"
              className="primary-button create-button"
              onClick={() => openNewTask()}
            >
              <span>＋</span> New Task
            </button>
          </section>

          {error && !showForm && (
            <div className="alert alert-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}

          {notice && !showForm && (
            <div className="alert alert-success" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}

          {view === "Dashboard" && (
            <>
              <section className="stats-grid">
                <StatCard
                  icon="☷"
                  label="Total tasks"
                  value={stats.total}
                  caption="All your tasks"
                  color="purple"
                />
                <StatCard
                  icon="◷"
                  label="Pending"
                  value={stats.pending}
                  caption="Still to complete"
                  color="blue"
                />
                <StatCard
                  icon="✓"
                  label="Completed"
                  value={stats.completed}
                  caption="Tasks finished"
                  color="green"
                />
                <StatCard
                  icon="!"
                  label="Overdue"
                  value={stats.overdue}
                  caption="Need your attention"
                  color="red"
                />
              </section>

              <section className="overview-grid">
                <div className="overview-card progress-card">
                  <div className="overview-card-heading">
                    <div>
                      <h2>Your progress</h2>
                      <p>Track your completed tasks</p>
                    </div>
                    <span className="overview-icon">✦</span>
                  </div>

                  <div className="progress-number">
                    {stats.progress}
                    <span>%</span>
                  </div>

                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-valuenow={stats.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Task completion progress"
                  >
                    <span style={{ width: `${stats.progress}%` }} />
                  </div>

                  <div className="progress-bottom">
                    <span>
                      {stats.completed} of {stats.total} tasks completed
                    </span>
                    <strong>{stats.progress}%</strong>
                  </div>
                </div>

                <div className="overview-card upcoming-card">
                  <div className="overview-card-heading">
                    <div>
                      <h2>Coming up</h2>
                      <p>Pending deadlines within 7 days</p>
                    </div>
                    <span className="overview-icon blue-icon">◷</span>
                  </div>

                  <div className="upcoming-number">{stats.dueSoon}</div>
                  <p className="upcoming-caption">
                    {stats.dueSoon === 1
                      ? "task needs attention soon"
                      : "tasks need attention soon"}
                  </p>

                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setView("Reminders");
                      setFilter("All");
                      setSearch("");
                    }}
                  >
                    View reminders <span>→</span>
                  </button>
                </div>
              </section>

              <section className="progress-banner">
                <div className="progress-copy">
                  <span className="progress-sparkle">✦</span>
                  <div>
                    <strong>Your progress at a glance</strong>
                    <p>
                      {stats.total === 0
                        ? "Add your first task and start making progress."
                        : stats.progress === 100
                          ? "Amazing! You've completed every task."
                          : "Keep going — every completed task moves you forward."}
                    </p>
                  </div>
                </div>
                <div className="progress-summary">
                  <strong>{stats.progress}%</strong>
                  <div className="progress-track">
                    <span style={{ width: `${stats.progress}%` }} />
                  </div>
                  <small>
                    {stats.completed} of {stats.total} completed
                  </small>
                </div>
              </section>

              <section
                className="smart-reminders"
                aria-labelledby="smart-reminders-title"
              >
                <div className="smart-reminders-heading">
                  <h2 id="smart-reminders-title">Smart reminders</h2>
                  <p>
                    A quick look at the deadlines that need your attention.
                  </p>
                </div>

                <div className="reminder-cards">
                  <button
                    type="button"
                    className="reminder-card reminder-overdue"
                    onClick={() => {
                      setView("Reminders");
                      setFilter("Overdue");
                      setSearch("");
                    }}
                  >
                    <span>Overdue</span>
                    <strong>{stats.overdue}</strong>
                    <small>
                      {stats.overdue === 1
                        ? "task needs attention now"
                        : "tasks need attention now"}
                    </small>
                  </button>

                  <button
                    type="button"
                    className="reminder-card reminder-today"
                    onClick={() => {
                      setView("Reminders");
                      setFilter("All");
                      setSearch("");
                    }}
                  >
                    <span>Due today</span>
                    <strong>{stats.dueToday}</strong>
                    <small>
                      {stats.dueToday === 1
                        ? "deadline is today"
                        : "deadlines are today"}
                    </small>
                  </button>

                  <button
                    type="button"
                    className="reminder-card reminder-upcoming"
                    onClick={() => {
                      setView("Reminders");
                      setFilter("All");
                      setSearch("");
                    }}
                  >
                    <span>Due in 1–3 days</span>
                    <strong>{stats.dueNextThreeDays}</strong>
                    <small>
                      {stats.dueNextThreeDays === 1
                        ? "upcoming task"
                        : "upcoming tasks"}
                    </small>
                  </button>
                </div>
              </section>
            </>
          )}

          {view === "Calendar" && (
            <CalendarView
              tasks={tasks}
              today={today}
              onAddTask={(date) => openNewTask(date)}
              onEditTask={openEditTask}
            />
          )}

          {view !== "Calendar" && (
            <section className="tasks-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {view === "Reminders"
                      ? "Upcoming reminders"
                      : view === "Dashboard"
                        ? "Your tasks"
                        : "Task manager"}
                  </h2>
                  <p>
                    {view === "Reminders"
                      ? "Overdue tasks and deadlines within seven days"
                      : "Manage your deadlines and priorities"}
                  </p>
                </div>
                <span className="task-total">
                  {visibleTasks.length}{" "}
                  {visibleTasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>

              <div className="task-toolbar">
                <div className="search-box">
                  <span>⌕</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search tasks or categories..."
                    aria-label="Search tasks"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="toolbar-selects">
                  <label className="select-wrap">
                    <span className="sr-only">Filter tasks</span>
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      aria-label="Filter tasks"
                    >
                      <option>All</option>
                      <option>Pending</option>
                      <option>Completed</option>
                      <option>Overdue</option>
                      <option>High priority</option>
                    </select>
                  </label>

                  <label className="select-wrap">
                    <span className="sr-only">Sort tasks</span>
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value)}
                      aria-label="Sort tasks"
                    >
                      <option value="date">Sort: Due date</option>
                      <option value="priority">Sort: Priority</option>
                      <option value="title">Sort: Title</option>
                    </select>
                  </label>
                </div>
              </div>

              {loading ? (
                <div className="empty-state">
                  <div className="loading-spinner" />
                  <strong>Loading your tasks...</strong>
                  <p>Connecting to your DeadlinePro database.</p>
                </div>
              ) : visibleTasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    {search || filter !== "All" ? "⌕" : "✓"}
                  </div>
                  <strong>
                    {search || filter !== "All"
                      ? "No tasks match your search"
                      : view === "Reminders"
                        ? "You're all caught up"
                        : "Nothing on your list yet"}
                  </strong>
                  <p>
                    {search || filter !== "All"
                      ? "Try a different search or filter."
                      : view === "Reminders"
                        ? "No overdue or soon-due pending tasks."
                        : "Add a task to start organizing your deadlines."}
                  </p>
                  {!search && filter === "All" && view !== "Reminders" && (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => openNewTask()}
                    >
                      ＋ Create your first task
                    </button>
                  )}
                </div>
              ) : (
                <div className="task-list">
                  {visibleTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today}
                      busy={busyId === task.id}
                      onToggle={toggleTask}
                      onEdit={openEditTask}
                      onDelete={deleteTask}
                    />
                  ))}
                </div>
              )}

              {!loading && visibleTasks.length > 0 && (
                <div className="panel-footer">
                  <span>Task changes are saved to MySQL.</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void loadTasks()}
                  >
                    ↻ Refresh tasks
                  </button>
                </div>
              )}
            </section>
          )}

          <footer className="page-footer">
            <span>© 2026 DeadlinePro. All rights reserved.</span>
            <span>
              <span className="online-dot" /> Your productivity, organized.
            </span>
          </footer>
        </div>
      </main>

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowForm(false);
            }
          }}
        >
          <section
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {editingTask ? "UPDATE YOUR WORK" : "PLAN YOUR WORK"}
                </span>
                <h2 id="task-modal-title">
                  {editingTask ? "Edit task" : "Create a new task"}
                </h2>
                <p>
                  {editingTask
                    ? "Update the details of your task."
                    : "Add a task and give yourself a clear deadline."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => !saving && setShowForm(false)}
                disabled={saving}
                aria-label="Close form"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <label className="form-field">
                <span>Task title *</span>
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="e.g. Submit API project"
                />
              </label>

              <label className="form-field">
                <span>Category</span>
                <input
                  maxLength={100}
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  placeholder="e.g. School, Work, Personal"
                />
              </label>

              <div className="form-row">
                <label className="form-field">
                  <span>Due date *</span>
                  <input
                    type="date"
                    required
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm({ ...form, dueDate: event.target.value })
                    }
                  />
                </label>

                <label className="form-field">
                  <span>Priority</span>
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        priority: event.target.value as Priority,
                      })
                    }
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingTask
                      ? "Save changes"
                      : "Create task"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  caption,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  caption: string;
  color: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className={`stat-icon ${color}`}>{icon}</span>
        <span className="stat-caption">{caption}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </article>
  );
}

function TaskRow({
  task,
  today,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  today: string;
  busy: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const completed = isCompleted(task);
  const overdue = !completed && task.dueDate < today;
  const days = daysUntil(task.dueDate, today);

  let dueLabel = formatDate(task.dueDate);

  if (!completed) {
    if (overdue) {
      dueLabel = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    } else if (days === 0) {
      dueLabel = "Due today";
    } else if (days === 1) {
      dueLabel = "Due tomorrow";
    }
  }

  return (
    <article className={`task-row ${completed ? "task-completed" : ""}`}>
      <button
        type="button"
        className={`task-check ${completed ? "checked" : ""}`}
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={completed ? "Mark task pending" : "Mark task completed"}
        title={completed ? "Mark pending" : "Complete task"}
      >
        {completed ? "✓" : ""}
      </button>

      <div className="task-main">
        <div className="task-title-line">
          <h3>{task.title}</h3>
          <span
            className={`priority-badge priority-${task.priority.toLowerCase()}`}
          >
            {task.priority}
          </span>
        </div>

        <div className="task-meta">
          <span className="task-category">{task.category || "General"}</span>
          <span className="meta-separator">•</span>
          <span className={overdue ? "overdue-text" : ""}>
            <span aria-hidden="true">◷ </span>
            {dueLabel}
          </span>
        </div>
      </div>

      <div className="task-actions">
        <button
          type="button"
          className="row-action"
          onClick={() => onEdit(task)}
          disabled={busy}
          aria-label={`Edit ${task.title}`}
          title="Edit task"
        >
          ✎
        </button>
        <button
          type="button"
          className="row-action delete-action"
          onClick={() => onDelete(task)}
          disabled={busy}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
        >
          ×
        </button>
      </div>
    </article>
  );
}

function CalendarView({
  tasks,
  today,
  onAddTask,
  onEditTask,
}: {
  tasks: Task[];
  today: string;
  onAddTask: (date: string) => void;
  onEditTask: (task: Task) => void;
}) {
  const [month, setMonth] = useState(() => {
    const current = new Date();
    return new Date(current.getFullYear(), current.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState(today);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(month);

  const firstWeekday = new Date(year, monthIndex, 1).getDay();

  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthIndex, index - firstWeekday + 1);

    return {
      date,
      dateKey: dateOnly(date),
      inCurrentMonth: date.getMonth() === monthIndex,
    };
  });

  const selectedTasks = tasks
    .filter((task) => task.dueDate === selectedDate)
    .sort((a, b) => a.title.localeCompare(b.title));

  function moveMonth(amount: number) {
    const nextMonth = new Date(year, monthIndex + amount, 1);

    setMonth(nextMonth);
    setSelectedDate(dateOnly(nextMonth));
  }

  function goToToday() {
    const current = new Date();

    setMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setSelectedDate(today);
  }

  return (
    <section className="calendar-panel">
      <div className="calendar-heading">
        <div>
          <h2>Deadline calendar</h2>
          <p>Select a date to see its tasks and deadlines.</p>
        </div>

        <div className="calendar-navigation">
          <button
            type="button"
            className="calendar-nav-button"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
          >
            ‹
          </button>
          <strong>{monthLabel}</strong>
          <button
            type="button"
            className="calendar-nav-button"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            className="calendar-today-button"
            onClick={goToToday}
          >
            Today
          </button>
        </div>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarDays.map(({ date, dateKey, inCurrentMonth }) => {
          const dayTasks = tasks.filter((task) => task.dueDate === dateKey);
          const hasOverdue = dayTasks.some(
            (task) => !isCompleted(task) && task.dueDate < today,
          );
          const hasPending = dayTasks.some((task) => !isCompleted(task));
          const hasCompleted = dayTasks.some(isCompleted);

          return (
            <button
              type="button"
              key={dateKey}
              className={[
                "calendar-day",
                !inCurrentMonth ? "outside-month" : "",
                dateKey === today ? "calendar-today" : "",
                dateKey === selectedDate ? "calendar-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedDate(dateKey)}
              aria-pressed={dateKey === selectedDate}
              aria-label={`${date.toLocaleDateString("en", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}, ${dayTasks.length} tasks`}
            >
              <span className="calendar-day-number">{date.getDate()}</span>

              {dayTasks.length > 0 && (
                <span className="calendar-day-count">
                  {dayTasks.length}{" "}
                  {dayTasks.length === 1 ? "task" : "tasks"}
                </span>
              )}

              <span className="calendar-indicators" aria-hidden="true">
                {hasOverdue && <i className="indicator-overdue" />}
                {hasPending && !hasOverdue && (
                  <i className="indicator-pending" />
                )}
                {hasCompleted && <i className="indicator-completed" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="calendar-legend">
        <span>
          <i className="indicator-pending" /> Pending
        </span>
        <span>
          <i className="indicator-completed" /> Completed
        </span>
        <span>
          <i className="indicator-overdue" /> Overdue
        </span>
      </div>

      <div className="calendar-selected-tasks">
        <div className="calendar-selected-heading">
          <div>
            <h3>
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
                "en",
                { weekday: "long", month: "long", day: "numeric" },
              )}
            </h3>
            <p>
              {selectedTasks.length}{" "}
              {selectedTasks.length === 1 ? "task" : "tasks"} scheduled
            </p>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => onAddTask(selectedDate)}
          >
            + Add task
          </button>
        </div>

        {selectedTasks.length === 0 ? (
          <div className="calendar-no-tasks">
            No tasks are scheduled for this date.
          </div>
        ) : (
          <div className="calendar-task-list">
            {selectedTasks.map((task) => {
              const completed = isCompleted(task);
              const overdue = !completed && task.dueDate < today;

              return (
                <button
                  type="button"
                  key={task.id}
                  className="calendar-task"
                  onClick={() => onEditTask(task)}
                >
                  <span
                    className={[
                      "calendar-task-status",
                      completed
                        ? "indicator-completed"
                        : overdue
                          ? "indicator-overdue"
                          : "indicator-pending",
                    ].join(" ")}
                  />
                  <span className="calendar-task-copy">
                    <strong>{task.title}</strong>
                    <small>
                      {task.category} · {task.priority} priority
                    </small>
                  </span>
                  <span
                    className={`calendar-task-badge ${
                      completed
                        ? "completed-badge"
                        : overdue
                          ? "overdue-badge"
                          : ""
                    }`}
                  >
                    {completed ? "Completed" : overdue ? "Overdue" : "Pending"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default App;