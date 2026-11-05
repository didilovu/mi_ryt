import { describe, it, expect } from "vitest";
import {
  addDays,
  advance,
  calendarStatus,
  calories,
  finish,
  fresh,
  localDate,
  monday,
  newSession,
  periodCalories,
  planProgress,
  restoreSession,
  schedule,
  tick,
} from "../src/engine";
import { exercises, plannedSeconds, workoutForWeek } from "../src/data";
import { validateBackup } from "../src/storage";
const mini = {
  id: "test",
  name: "Тест",
  subtitle: "",
  color: "pink",
  steps: [
    { exerciseId: "squat", sets: 2, reps: "10", estimate: 30, rest: 20 },
    { exerciseId: "bridge", sets: 1, seconds: 30, rest: 0 },
  ],
};
describe("локальные даты и четырёхнедельный план", () => {
  it("считает границы дней и понедельник без UTC сдвига", () => {
    expect(monday("2026-11-08")).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(localDate(new Date(2026, 10, 5, 0, 1))).toBe("2026-11-05");
  });
  it("четыре обязательных дня, дополнительный выключен, только 28 дней", () => {
    const s = fresh();
    s.settings.startDate = "2026-11-02";
    expect(
      Array.from({ length: 28 }, (_, i) =>
        schedule(s, addDays(s.settings.startDate, i)),
      ).filter(Boolean),
    ).toHaveLength(16);
    expect(schedule(s, "2026-11-30")).toBeNull();
    s.settings.optional = true;
    expect(schedule(s, "2026-11-08")?.id).toBe("stretch");
  });
  it("будущие даты не пропущены; перенос не удаляет историю", () => {
    const s = fresh();
    s.settings.startDate = "2026-11-02";
    expect(calendarStatus(s, "2026-11-09", "2026-11-05")).toBe("Запланировано");
    expect(calendarStatus(s, "2026-11-02", "2026-11-05")).toBe("Пропущено");
    s.overrides = { "2026-11-02": null, "2026-11-04": "legs" };
    expect(schedule(s, "2026-11-02")).toBeNull();
    expect(schedule(s, "2026-11-04")?.id).toBe("legs");
  });
  it("расчёт времени включает подходы, отдых и реальные варианты недель", () => {
    expect(plannedSeconds(mini)).toBe(130);
    expect(plannedSeconds(workoutForWeek("flex", 2, 45))).toBe(2400);
    expect(plannedSeconds(workoutForWeek("stretch", 2, 45))).toBe(1800);
    expect(workoutForWeek("circuit", 3, 45).steps).toHaveLength(28);
  });
  it("все этапы программы используют известные упражнения и разные MET", () => {
    for (const id of ["legs", "flex", "full", "circuit", "stretch"])
      for (let w = 1; w <= 4; w++)
        for (const st of workoutForWeek(id, w, 45).steps)
          expect(exercises.some((e) => e.id === st.exerciseId)).toBe(true);
    expect(new Set(exercises.map((e) => e.met)).size).toBeGreaterThan(1);
  });
});
describe("таймер, пропуски, восстановление и MET", () => {
  it("проверяет формулу MET без пересчёта повторений", () => {
    expect(calories(600, 3.8, 60)).toBeCloseTo(39.9);
    expect(calories(600, 3.8, null)).toBeNull();
  });
  it("не начисляет активное время до старта, в паузе и отдыхе", () => {
    let s = newSession(mini, 60, "2026-11-05", 0);
    s = tick(s, 10000);
    expect(s.currentSeconds).toBe(0);
    s.phase = "active";
    s = tick(s, 40000);
    expect(s.currentSeconds).toBe(30);
    s.paused = true;
    s = tick(s, 50000);
    expect(s.currentSeconds).toBe(30);
    s.paused = false;
    s = advance(s, false, 50000);
    s = tick(s, 80000);
    expect(s.restSeconds).toBe(20);
    expect(s.currentSeconds).toBe(0);
    expect(s.phase).toBe("ready");
    expect(s.pauseSeconds).toBe(30);
  });
  it("таймер не завершает подход без подтверждения и не считает ожидание активностью", () => {
    let s = newSession(
      { ...mini, steps: [mini.steps[1]] },
      60,
      "2026-11-05",
      0,
    );
    s.phase = "active";
    s = tick(s, 40000);
    expect(s.phase).toBe("confirm");
    expect(s.entries).toHaveLength(0);
    expect(s.currentSeconds).toBe(30);
    expect(s.pauseSeconds).toBe(10);
    s = advance(s, false, 40000);
    expect(finish(s, 40000).status).toBe("completed");
  });
  it("пропущенная текущая часть не начисляет калории; подтверждённый подход сохраняется", () => {
    let s = newSession(mini, 60, "2026-11-05", 0);
    s.phase = "active";
    s = advance(s, false, 10000);
    s.phase = "active";
    s = advance(s, true, 20000);
    const r = finish(s, 20000);
    expect(r.activeSeconds).toBe(10);
    expect(r.entries).toHaveLength(1);
    expect(r.kcal).toBeCloseTo(calories(10, 3.8, 60)!);
    expect(r.status).toBe("partial");
  });
  it("частичный подход сохраняется при досрочном завершении, но не считается выполненным", () => {
    const s = newSession(mini, 60, "2026-11-05", 0);
    s.phase = "active";
    const r = finish(s, 15000);
    expect(r.activeSeconds).toBe(15);
    expect(r.entries[0].completed).toBe(false);
    expect(r.status).toBe("partial");
  });
  it("восстанавливается на паузе без начислений за закрытое приложение", () => {
    let s = newSession(mini, 60, "2026-11-05", 0);
    s.phase = "active";
    s = tick(s, 10000);
    s = restoreSession(s, 100000)!;
    s = tick(s, 110000);
    expect(s.currentSeconds).toBe(10);
    expect(s.paused).toBe(true);
  });
  it("история фиксирует вес, MET и продолжительность; агрегаты различают неизвестный расход", () => {
    const store = fresh();
    store.profile.weight = 60;
    const s = newSession(mini, store.profile.weight, "2026-11-05", 0);
    s.phase = "active";
    const r = finish(s, 30000);
    store.profile.weight = 90;
    expect(r.weight).toBe(60);
    expect(r.entries[0].met).toBe(3.8);
    const result = periodCalories(
      [r, { ...r, id: "other", kcal: null, weight: null }],
      "2026-11-01",
      "2026-11-30",
    );
    expect(result.missing).toBe(1);
    expect(result.value).toBe(r.kcal);
  });
  it("пустой прогресс не содержит выдуманных результатов", () => {
    expect(planProgress(fresh()).completed).toBe(0);
    expect(periodCalories([], "2026-01-01", "2026-12-31").count).toBe(0);
  });
});
describe("резервные копии", () => {
  it("проверяет восстановление сессии с реальным timestamp", () => {
    const s = fresh();
    s.session = newSession(workoutForWeek("legs", 1, 45), 60);
    expect(validateBackup(s).session?.lastTick).toBe(s.session.lastTick);
  });
  it("принимает пустые необязательные поля, отвергает повреждённые типы и диапазоны", () => {
    expect(validateBackup(fresh()).version).toBe(1);
    expect(() => validateBackup({ version: 1 })).toThrow();
    const s = fresh();
    s.profile.weight = -1;
    expect(() => validateBackup(s)).toThrow();
    s.profile.weight = 60;
    s.settings.days = [1, 1, 4, 6, 0];
    expect(() => validateBackup(s)).toThrow();
  });
});

describe("сохранённый прогресс и изменения плана", () => {
  it("процент не удваивается при нескольких тренировках за день; перенос не меняет историю", () => {
    const s = fresh();
    s.settings.startDate = "2026-11-02";
    let session = newSession(
      workoutForWeek("legs", 1, 45),
      60,
      "2026-11-02",
      0,
    );
    // A saved completed record represents an explicitly confirmed workout.
    const record = { ...finish(session, 0), status: "completed" as const };
    s.history = [record, { ...record, id: "second" }];
    expect(planProgress(s).completed).toBe(1);
    expect(planProgress(s).planned).toBe(16);
    s.overrides = { "2026-11-02": null, "2026-11-04": "legs" };
    expect(s.history[0].date).toBe("2026-11-02");
    expect(calendarStatus(s, "2026-11-02")).toBe("Выполнено");
    expect(planProgress(s).completed).toBe(0);
  });
  it("итог различает полный объём упражнения и отдельный подход", () => {
    let s = newSession(mini, 60, "2026-11-05", 0);
    s.phase = "active";
    s = advance(s, false, 10000);
    expect(finish(s, 10000).completedExercises).toBe(0);
    s.phase = "active";
    s = advance(s, false, 20000);
    expect(finish(s, 20000).completedExercises).toBe(1);
  });
});
