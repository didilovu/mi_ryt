import { byId, MET_SOURCE, workoutForWeek } from "./data";
import type { Store, Session, Workout, RecordWorkout } from "./model";
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function dayDistance(a: string, b: string) {
  const p = (s: string) => {
    const d = parseDate(s);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((p(b) - p(a)) / 86400000);
}
export function monday(s = localDate()) {
  const d = parseDate(s);
  return addDays(s, -((d.getDay() + 6) % 7));
}
export function fresh(): Store {
  return {
    version: 1,
    profile: { goals: "" },
    settings: {
      startDate: monday(),
      days: [1, 2, 4, 6, 0],
      rest: 45,
      sound: false,
      optional: false,
      theme: "light",
    },
    overrides: {},
    measurements: [],
    history: [],
    session: null,
  };
}
export function schedule(store: Store, date: string) {
  const offset = dayDistance(store.settings.startDate, date);
  if (offset < 0 || offset >= 28) return null;
  const week = Math.floor(offset / 7) + 1;
  const day = parseDate(date).getDay();
  const ids = ["legs", "flex", "full", "circuit", "stretch"];
  const position = store.settings.days.indexOf(day);
  const id = Object.hasOwn(store.overrides, date)
    ? store.overrides[date]
    : position >= 0 && (position !== 4 || store.settings.optional)
      ? ids[position]
      : null;
  return id ? workoutForWeek(id, week, store.settings.rest) : null;
}
export function calendarStatus(
  store: Store,
  date: string,
  today = localDate(),
) {
  const records = store.history.filter((h) => h.date === date);
  if (records.some((h) => h.status === "completed")) return "Выполнено";
  if (records.length) return "Частично";
  if (!schedule(store, date)) return "Отдых";
  return date < today ? "Пропущено" : "Запланировано";
}
export function calories(seconds: number, met: number, weight: number | null) {
  return weight === null ? null : (((met * 3.5 * weight) / 200) * seconds) / 60;
}
export function newSession(
  workout: Workout,
  weight: number | undefined,
  date = localDate(),
  now = Date.now(),
): Session {
  return {
    id: crypto.randomUUID(),
    workout,
    date,
    weight: weight ?? null,
    index: 0,
    set: 1,
    phase: "ready",
    paused: false,
    lastTick: now,
    elapsed: 0,
    pauseSeconds: 0,
    restSeconds: 0,
    currentSeconds: 0,
    restRemaining: 0,
    entries: [],
    skipped: [],
    source: MET_SOURCE,
  };
}
export function tick(session: Session, now = Date.now()): Session {
  const s = { ...session };
  const dt = Math.max(0, (now - s.lastTick) / 1000);
  s.lastTick = now;
  s.elapsed += dt;
  if (s.paused || s.phase === "ready" || s.phase === "confirm") {
    s.pauseSeconds += dt;
    return s;
  }
  if (s.phase === "active") {
    s.currentSeconds += dt;
    const target = s.workout.steps[s.index]?.seconds;
    if (target && s.currentSeconds >= target) {
      s.pauseSeconds += s.currentSeconds - target;
      s.currentSeconds = target;
      s.phase = "confirm";
    }
  } else {
    const used = Math.min(dt, s.restRemaining);
    s.restSeconds += used;
    s.restRemaining -= used;
    s.pauseSeconds += dt - used;
    if (s.restRemaining <= 0) s.phase = "ready";
  }
  return s;
}
export function currentEntries(s: Session) {
  return [
    ...s.entries,
    ...(s.currentSeconds > 0
      ? [
          {
            exerciseId: s.workout.steps[s.index].exerciseId,
            set: s.set,
            seconds: s.currentSeconds,
            met: byId[s.workout.steps[s.index].exerciseId].met,
            completed: false,
          },
        ]
      : []),
  ];
}
export function sessionKcal(s: Session) {
  return s.weight === null
    ? null
    : currentEntries(s).reduce(
        (n, e) => n + (calories(e.seconds, e.met, s.weight) ?? 0),
        0,
      );
}
export function completedExercises(entries: Session["entries"], w: Workout) {
  return w.steps.filter((step, i) => {
    const before = w.steps
      .slice(0, i)
      .filter((p) => p.exerciseId === step.exerciseId)
      .reduce((n, p) => n + p.sets, 0);
    return (
      entries.filter((e) => e.exerciseId === step.exerciseId && e.completed)
        .length >=
      before + step.sets
    );
  }).length;
}
export function advance(
  session: Session,
  skip = false,
  now = Date.now(),
): Session {
  const s = tick(session, now);
  const step = s.workout.steps[s.index];
  if (skip) {
    s.skipped = [...s.skipped, `${s.index}:${step.exerciseId}`];
    s.currentSeconds = 0;
    s.index++;
    s.set = 1;
    s.phase = "ready";
    return s;
  }
  if (!["active", "confirm"].includes(s.phase) || s.paused) return s;
  s.entries = [
    ...s.entries,
    {
      exerciseId: step.exerciseId,
      set: s.set,
      seconds: s.currentSeconds,
      met: byId[step.exerciseId].met,
      completed: true,
    },
  ];
  s.currentSeconds = 0;
  if (s.set < step.sets) s.set++;
  else {
    s.index++;
    s.set = 1;
  }
  if (s.index < s.workout.steps.length) {
    s.restRemaining = step.rest;
    s.phase = step.rest > 0 ? "rest" : "ready";
  }
  return s;
}
export function finish(session: Session, now = Date.now()): RecordWorkout {
  const s = tick(session, now);
  const entries =
    s.index < s.workout.steps.length ? currentEntries(s) : s.entries;
  const plannedSets = s.workout.steps.reduce((n, st) => n + st.sets, 0);
  return {
    id: s.id,
    date: s.date,
    name: s.workout.name,
    duration: s.elapsed,
    activeSeconds: entries.reduce((n, e) => n + e.seconds, 0),
    pauseSeconds: s.pauseSeconds,
    restSeconds: s.restSeconds,
    weight: s.weight,
    kcal:
      s.weight === null
        ? null
        : entries.reduce(
            (n, e) => n + (calories(e.seconds, e.met, s.weight) ?? 0),
            0,
          ),
    entries,
    skipped: s.skipped,
    status:
      entries.filter((e) => e.completed).length === plannedSets
        ? "completed"
        : "partial",
    source: s.source,
    plannedSets,
    completedExercises: completedExercises(entries, s.workout),
    plannedExercises: s.workout.steps.length,
  };
}
export function restoreSession(s: Session | null, now = Date.now()) {
  return s ? { ...s, paused: true, lastTick: now } : null;
}
export function periodCalories(
  history: RecordWorkout[],
  from: string,
  to: string,
) {
  const records = history.filter((h) => h.date >= from && h.date <= to);
  return {
    value: records.reduce((n, h) => n + (h.kcal ?? 0), 0),
    missing: records.filter((h) => h.kcal === null).length,
    count: records.length,
  };
}
export function planProgress(
  store: Store,
  from = store.settings.startDate,
  to = addDays(store.settings.startDate, 27),
) {
  const dates = Array.from(
    { length: Math.max(0, dayDistance(from, to) + 1) },
    (_, i) => addDays(from, i),
  );
  const planned = dates.filter(
    (d) => schedule(store, d) && schedule(store, d)?.id !== "stretch",
  );
  const completed = planned.filter((d) =>
    store.history.some(
      (h) =>
        h.date === d &&
        h.status === "completed" &&
        h.name === schedule(store, d)?.name,
    ),
  );
  return {
    planned: planned.length,
    completed: completed.length,
    percent: planned.length
      ? Math.round((completed.length / planned.length) * 100)
      : 0,
  };
}
