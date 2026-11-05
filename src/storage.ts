import { openDB } from "idb";
import type { Store } from "./model";
import { fresh, restoreSession } from "./engine";
import { byId } from "./data";
let connection: ReturnType<typeof openDB> | undefined;
const db = () =>
  (connection ??= openDB("moy-ritm", 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  }));
export async function load(): Promise<Store> {
  const saved = await (await db()).get("state", "main");
  if (!saved) return fresh();
  const result = validateBackup(saved);
  return { ...result, session: restoreSession(result.session) };
}
export async function save(state: Store) {
  await (await db()).put("state", state, "main");
}
export function validateBackup(raw: unknown): Store {
  // A bounded, explicit schema prevents malformed backups from becoming executable UI state.
  const object = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  const num = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const str = (v: unknown) => typeof v === "string" && v.length <= 5000;
  const date = (v: unknown) =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(new Date(v).valueOf()) &&
    new Date(v + "T12:00:00").getDate() === Number(v.slice(-2));
  const optional = (v: unknown, min: number, max: number) =>
    v === undefined || num(v, min, max);
  if (
    !object(raw) ||
    raw.version !== 1 ||
    !object(raw.profile) ||
    !object(raw.settings) ||
    !object(raw.overrides) ||
    !Array.isArray(raw.history) ||
    !Array.isArray(raw.measurements)
  )
    throw Error("Неверный формат резервной копии.");
  const p = raw.profile,
    s = raw.settings;
  if (
    !optional(p.age, 14, 120) ||
    !optional(p.height, 80, 250) ||
    !optional(p.weight, 20, 400) ||
    !str(p.goals) ||
    !date(s.startDate) ||
    !Array.isArray(s.days) ||
    s.days.length !== 5 ||
    new Set(s.days).size !== 5 ||
    !s.days.every((d) => num(d, 0, 6) && Number.isInteger(d)) ||
    !num(s.rest, 0, 300) ||
    typeof s.sound !== "boolean" ||
    typeof s.optional !== "boolean" ||
    !["light", "dark"].includes(String(s.theme))
  )
    throw Error("Повреждены настройки или профиль.");
  if (
    !Object.entries(raw.overrides).every(
      ([d, id]) =>
        date(d) &&
        (id === null ||
          ["legs", "flex", "full", "circuit", "stretch"].includes(String(id))),
    )
  )
    throw Error("Повреждено расписание.");
  if (raw.history.length > 100000 || raw.measurements.length > 100000)
    throw Error("Слишком большая резервная копия.");
  const entry = (e: unknown) =>
    object(e) &&
    str(e.exerciseId) &&
    num(e.set, 1, 100) &&
    num(e.seconds) &&
    num(e.met, 0, 30) &&
    typeof e.completed === "boolean";
  for (const h of raw.history) {
    if (
      !object(h) ||
      !str(h.id) ||
      !date(h.date) ||
      !str(h.name) ||
      !num(h.duration) ||
      !num(h.activeSeconds) ||
      !num(h.pauseSeconds) ||
      !num(h.restSeconds) ||
      !(h.weight === null || num(h.weight, 20, 400)) ||
      !(h.kcal === null || num(h.kcal)) ||
      !["completed", "partial"].includes(String(h.status)) ||
      !num(h.plannedSets, 1, 10000) ||
      !num(h.completedExercises, 0, 10000) ||
      !num(h.plannedExercises, 1, 10000) ||
      !str(h.source) ||
      !Array.isArray(h.skipped) ||
      !h.skipped.every(str) ||
      !Array.isArray(h.entries) ||
      !h.entries.every(entry)
    )
      throw Error("Повреждена история тренировок.");
  }
  if (new Set(raw.history.map((h) => h.id)).size !== raw.history.length)
    throw Error("В истории есть повторяющиеся записи.");
  for (const m of raw.measurements) {
    if (
      !object(m) ||
      !str(m.id) ||
      !date(m.date) ||
      !optional(m.weight, 20, 400) ||
      !optional(m.waist, 20, 300) ||
      !optional(m.hips, 20, 300)
    )
      throw Error("Повреждены измерения.");
  }
  // Backups are imported without an active session; on-device session restoration has its own validated shape.
  if (raw.session !== null) {
    const a = raw.session;
    if (
      !object(a) ||
      !object(a.workout) ||
      !str(a.workout.id) ||
      !str(a.workout.name) ||
      !str(a.workout.subtitle) ||
      !str(a.workout.color) ||
      !Array.isArray(a.workout.steps) ||
      a.workout.steps.length === 0 ||
      !a.workout.steps.every(
        (st) =>
          object(st) &&
          typeof st.exerciseId === "string" &&
          Object.hasOwn(byId, st.exerciseId) &&
          num(st.sets, 1, 100) &&
          Number.isInteger(st.sets) &&
          num(st.rest, 0, 300) &&
          (num(st.seconds, 1, 7200) ||
            (str(st.reps) && num(st.estimate, 1, 7200))),
      ) ||
      !num(a.index, 0, a.workout.steps.length - 1) ||
      !Number.isInteger(a.index) ||
      !num(a.set, 1, 100) ||
      !Array.isArray(a.entries) ||
      !a.entries.every(entry) ||
      !["ready", "active", "rest", "confirm"].includes(String(a.phase)) ||
      !num(a.lastTick) ||
      !num(a.elapsed) ||
      !num(a.currentSeconds) ||
      !num(a.restRemaining) ||
      !num(a.pauseSeconds) ||
      !num(a.restSeconds) ||
      typeof a.paused !== "boolean" ||
      !date(a.date) ||
      !str(a.id) ||
      !str(a.source) ||
      !Array.isArray(a.skipped) ||
      !(a.weight === null || num(a.weight, 20, 400))
    )
      throw Error("Повреждена текущая тренировка.");
  }
  return structuredClone(raw) as unknown as Store;
}
