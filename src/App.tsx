import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Activity,
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  Heart,
  Home,
  Leaf,
  Pause,
  Play,
  Settings as SettingsIcon,
  Sparkles,
  TrendingUp,
  X,
  Download,
  Upload,
  Plus,
  Search,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import type { Store, Workout, RecordWorkout, Measurement } from "./model";
import { workouts, byId, exercises, plannedSeconds, MET_SOURCE } from "./data";
import {
  addDays,
  advance,
  calendarStatus,
  completedExercises,
  dayDistance,
  finish,
  fresh,
  localDate,
  monday,
  newSession,
  parseDate,
  periodCalories,
  planProgress,
  restoreSession,
  schedule,
  sessionKcal,
  tick,
} from "./engine";
import { load, save, validateBackup } from "./storage";
import { ExerciseDemo } from "./ExerciseDemo";
import { setSoundEnabled, unlockSound, timerSound } from "./audio";
const minutes = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const kcal = (value: number | null) =>
  value === null ? "Нет данных" : `≈ ${Math.round(value)} ккал`;
const dateLabel = (
  s: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) => parseDate(s).toLocaleDateString("ru-RU", options);
type Update = Dispatch<SetStateAction<Store>>;
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <Leaf size={28} />
      <p>{children}</p>
    </div>
  );
}
function WorkoutCard({
  workout,
  onStart,
}: {
  workout: Workout;
  onStart: () => void;
}) {
  return (
    <article className={`workout-card ${workout.color}`}>
      <div className="eyebrow">
        <Dumbbell size={17} /> ДОМА · БЕЗ ОБОРУДОВАНИЯ
      </div>
      <h2>{workout.name}</h2>
      <p>{workout.subtitle}</p>
      <div className="pills">
        <span>~{Math.round(plannedSeconds(workout) / 60)} мин</span>
        <span>{workout.steps.length} этапов</span>
        <span>С разминкой</span>
      </div>
      <button className="primary" onClick={onStart}>
        Начать тренировку <ArrowRight size={20} />
      </button>
      <small>
        Для повторений время ориентировочное. Двигайтесь в своём темпе.
      </small>
    </article>
  );
}
export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Главная");
  const [showSession, setShowSession] = useState(true);
  const [summary, setSummary] = useState<RecordWorkout | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const latest = useRef<Store | null>(null);
  useEffect(() => {
    load()
      .then(setStore)
      .catch((e) =>
        setError(
          `Не удалось прочитать данные: ${e.message}. Данные не перезаписаны.`,
        ),
      );
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(() =>
        setOfflineReady(!!navigator.serviceWorker.controller),
      );
      const controller = () => setOfflineReady(true);
      navigator.serviceWorker.addEventListener("controllerchange", controller);
      return () =>
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          controller,
        );
    }
  }, []);
  useEffect(() => {
    latest.current = store;
    if (store) {
      setSoundEnabled(store.settings.sound);
      document.documentElement.dataset.theme = store.settings.theme;
      save(store).catch(() =>
        setError(
          "Не удалось сохранить данные. Проверьте свободное место и разрешения браузера. Не закрывайте приложение; экспортируйте копию.",
        ),
      );
    }
  }, [store]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    const id = window.setInterval(
      () =>
        setStore((prev) =>
          prev?.session ? { ...prev, session: tick(prev.session) } : prev,
        ),
      500,
    );
    const hide = () => {
      if (document.hidden && latest.current?.session) {
        const next = {
          ...latest.current,
          session: { ...tick(latest.current.session), paused: true },
        };
        latest.current = next;
        setStore(next);
        save(next).catch(() => setError("Не удалось сохранить тренировку."));
      }
    };
    const guard = (e: BeforeUnloadEvent) => {
      if (latest.current?.session) {
        e.preventDefault();
        hide();
      }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("beforeunload", guard);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("beforeunload", guard);
    };
  }, []);
  if (!store)
    return (
      <main className="loading">
        <Heart />
        <h1>Мой ритм</h1>
        <p>{error || "Готовим ваше пространство…"}</p>
        {error && <button onClick={() => location.reload()}>Повторить</button>}
      </main>
    );
  const update: Update = setStore as Update;
  const start = (w: Workout, date = localDate()) => {
    if (store.session) {
      setShowSession(true);
      return;
    }
    setShowSession(true);
    setSummary(null);
    update((s) => ({ ...s, session: newSession(w, s.profile.weight, date) }));
    window.scrollTo(0, 0);
  };
  const end = (early = false) => {
    if (!store.session) return;
    if (
      early &&
      !confirm("Завершить тренировку и сохранить выполненную часть?")
    )
      return;
    const result = finish(store.session);
    update((s) => ({
      ...s,
      session: null,
      history: [...s.history.filter((h) => h.id !== result.id), result],
    }));
    setSummary(result);
  };
  const next = (skip = false) => {
    if (!store.session) return;
    const session = advance(store.session, skip);
    if (session.index >= session.workout.steps.length) {
      const result = finish(session);
      update((s) => ({ ...s, session: null, history: [...s.history, result] }));
      setSummary(result);
    } else update((s) => ({ ...s, session }));
  };
  return (
    <div className="app">
      <header className="topbar">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Главная");
          }}
          className="brand"
        >
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span>
            мой ритм<small>ПРОСТРАНСТВО ДЛЯ СЕБЯ</small>
          </span>
        </a>
        <div className="top-right">
          <span className="connection">
            <i />
            {!online
              ? "Без интернета"
              : offlineReady
                ? "Доступно офлайн"
                : "Локальные данные"}
          </span>
          <span className="avatar">
            <Heart size={20} />
          </span>
        </div>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button
            onClick={() =>
              save(store)
                .then(() => setError(""))
                .catch(() => {})
            }
          >
            Повторить сохранение
          </button>
        </div>
      )}
      <main>
        {store.session && !showSession && (
          <div className="note">
            <button className="primary" onClick={() => setShowSession(true)}>
              Вернуться к тренировке
            </button>
            <span>Тренировка на паузе. Вес для неё уже зафиксирован.</span>
          </div>
        )}
        {store.session && showSession ? (
          <SessionView
            session={store.session}
            change={(fn) =>
              update((s) => ({
                ...s,
                session: s.session ? fn(s.session) : null,
              }))
            }
            next={next}
            end={() => end(true)}
            settings={() => {
              setShowSession(false);
              setTab("Настройки");
              update((s) => ({
                ...s,
                session: s.session
                  ? { ...tick(s.session), paused: true }
                  : null,
              }));
            }}
          />
        ) : summary ? (
          <Summary record={summary} close={() => setSummary(null)} />
        ) : (
          <>
            <div className="page-intro">
              <div className="eyebrow">
                {tab === "Главная"
                  ? dateLabel(localDate(), {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : "МОЙ РИТМ · ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО"}
              </div>
              <h1>{tab === "Главная" ? "Движение в вашем ритме" : tab}</h1>
              <p>
                {
                  (
                    {
                      Главная: "Немного заботы о себе — с каждым движением.",
                      Календарь: "План, который подстраивается под вашу жизнь.",
                      Тренировки:
                        "Сила, подвижность и спокойствие. Всё уже здесь.",
                      Прогресс: "Замечайте изменения, без гонки за цифрами.",
                      Настройки: "Ваши привычки. Ваши правила.",
                    } as Record<string, string>
                  )[tab]
                }
              </p>
            </div>
            {tab === "Главная" && (
              <HomeView store={store} start={start} navigate={setTab} />
            )}
            {tab === "Календарь" && (
              <CalendarView store={store} update={update} start={start} />
            )}
            {tab === "Тренировки" && <Library store={store} start={start} />}
            {tab === "Прогресс" && <Progress store={store} update={update} />}
            {tab === "Настройки" && (
              <SettingsView store={store} update={update} />
            )}
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {[Home, CalendarDays, Dumbbell, TrendingUp, SettingsIcon].map(
          (Icon, i) => {
            const name = [
              "Главная",
              "Календарь",
              "Тренировки",
              "Прогресс",
              "Настройки",
            ][i];
            return (
              <button
                key={name}
                aria-current={tab === name ? "page" : undefined}
                className={tab === name ? "selected" : ""}
                onClick={() => {
                  if (store.session) {
                    if (
                      !confirm(
                        "Тренировка сохранится на паузе. Открыть раздел?",
                      )
                    )
                      return;
                    update((s) => ({
                      ...s,
                      session: s.session
                        ? { ...tick(s.session), paused: true }
                        : null,
                    }));
                    setShowSession(false);
                  }
                  setTab(name);
                  setSummary(null);
                  window.scrollTo(0, 0);
                }}
              >
                <Icon size={22} />
                <span>{name}</span>
              </button>
            );
          },
        )}
      </nav>
      <footer>Мягкое движение. Настоящий прогресс.</footer>
    </div>
  );
}
function HomeView({
  store,
  start,
  navigate,
}: {
  store: Store;
  start: (w: Workout) => void;
  navigate: (s: string) => void;
}) {
  const today = localDate(),
    workout = schedule(store, today),
    week = planProgress(store, monday(today), addDays(monday(today), 6));
  const weekNumber =
    Math.floor(dayDistance(store.settings.startDate, today) / 7) + 1;
  return (
    <div className="home-grid">
      <section>
        <div className="section-title">
          <h2>Сегодня для вас</h2>
          <span className="badge">
            {weekNumber >= 1 && weekNumber <= 4
              ? `Неделя ${weekNumber} из 4`
              : "Вне программы"}
          </span>
        </div>
        {workout ? (
          <WorkoutCard workout={workout} onStart={() => start(workout)} />
        ) : (
          <article className="rest-card">
            <Leaf size={48} />
            <h2>Время восстановиться</h2>
            <p>
              Сегодня нет запланированной тренировки. Можно отдохнуть или
              выбрать мягкую практику.
            </p>
            <button onClick={() => navigate("Тренировки")}>
              Открыть тренировки <ArrowRight size={18} />
            </button>
          </article>
        )}
        <div className="section-title">
          <h2>Ваша неделя</h2>
          <button className="text-button" onClick={() => navigate("Календарь")}>
            Календарь <ArrowRight size={16} />
          </button>
        </div>
        <div className="week-strip">
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(monday(today), i),
              done = store.history.some(
                (h) => h.date === date && h.status === "completed",
              );
            return (
              <div key={date} className={date === today ? "today" : ""}>
                <small>{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][i]}</small>
                <span
                  className={
                    done ? "done" : schedule(store, date) ? "planned" : ""
                  }
                >
                  {done ? <Check size={18} /> : parseDate(date).getDate()}
                </span>
                <i className={schedule(store, date) ? "dot" : ""} />
              </div>
            );
          })}
        </div>
        <div className="note">
          <Heart size={22} />
          <div>
            <strong>Регулярность начинается с комфорта</strong>
            <p>
              Уменьшайте амплитуду и делайте перерывы, когда это нужно. При боли
              остановитесь.
            </p>
          </div>
        </div>
      </section>
      <aside>
        <section className="card">
          <div className="section-title">
            <h2>В своём темпе</h2>
            <Sparkles size={21} />
          </div>
          <div
            className="progress-ring"
            style={{ "--progress": `${week.percent}%` } as React.CSSProperties}
          >
            <div>
              <strong>
                {week.completed}
                <span> / {week.planned}</span>
              </strong>
              <small>на этой неделе</small>
            </div>
          </div>
          <p className="center muted">
            Четыре занятия и достаточно отдыха между ними.
          </p>
          <div className="stats">
            <Stat
              value={
                store.history.filter((h) => h.status === "completed").length
              }
              label="тренировок"
            />
            <Stat
              value={`${Math.round(store.history.reduce((n, h) => n + h.duration, 0) / 60)} мин`}
              label="в движении и отдыхе"
            />
          </div>
        </section>
        <section className="card mint-soft">
          <div className="eyebrow">
            <Leaf size={17} /> МЯГКИЙ СТАРТ
          </div>
          <h3>Не нужно успевать всё</h3>
          <p>
            Первая неделя — знакомство с движениями. Выберите комфортный темп.
          </p>
          <button
            className="text-button"
            onClick={() => navigate("Тренировки")}
          >
            Изучить упражнения <ArrowRight size={16} />
          </button>
        </section>
      </aside>
    </div>
  );
}
function SessionView({
  session: s,
  change,
  next,
  end,
  settings,
}: {
  session: NonNullable<Store["session"]>;
  change: (
    fn: (s: NonNullable<Store["session"]>) => NonNullable<Store["session"]>,
  ) => void;
  next: (skip?: boolean) => void;
  end: () => void;
  settings: () => void;
}) {
  const step = s.workout.steps[s.index],
    exercise = byId[step.exerciseId];
  const previous = useRef(s.phase);
  useEffect(() => {
    if (
      (previous.current === "active" && s.phase === "confirm") ||
      (previous.current === "rest" && s.phase === "ready")
    ) {
      timerSound();
    }
    previous.current = s.phase;
  }, [s.phase]);
  return (
    <div className="session">
      <div className="section-title">
        <button className="text-button" onClick={end}>
          <X size={18} /> Завершить раньше
        </button>
        <span className="badge">
          {s.index + 1} / {s.workout.steps.length}
        </span>
      </div>
      <h1>{s.workout.name}</h1>
      <div className="stats live">
        <Stat label="прошло" value={minutes(s.elapsed)} />
        <Stat
          label="активно"
          value={minutes(
            s.entries.reduce((n, e) => n + e.seconds, 0) + s.currentSeconds,
          )}
        />
        <Stat label="расход" value={kcal(sessionKcal(s))} />
        <Stat
          label="упражнений / подходов"
          value={`${completedExercises(s.entries, s.workout)} / ${s.entries.filter((e) => e.completed).length}`}
        />
      </div>
      {s.weight === null && (
        <p className="note">
          Нет данных о весе. Тренировка сохранится без оценки калорий. Вес можно
          добавить в настройках перед следующей тренировкой.
        </p>
      )}
      <div className="session-grid">
        <section className="card">
          <div className="eyebrow">
            {exercise.category} · {exercise.met} MET
          </div>
          <h2>{exercise.name}</h2>
          <ExerciseDemo exercise={exercise} />
        </section>
        <section className="card">
          <span className="badge">
            Подход {s.set} из {step.sets}
          </span>
          <h2>
            {step.reps ? `${step.reps} повторений` : `${step.seconds} секунд`}
          </h2>
          <div className="timer">
            {s.phase === "rest"
              ? minutes(s.restRemaining)
              : minutes(
                  step.seconds
                    ? Math.max(0, step.seconds - s.currentSeconds)
                    : s.currentSeconds,
                )}
          </div>
          <p className="center">
            {s.paused
              ? "На паузе · нажмите «Продолжить»"
              : s.phase === "rest"
                ? "Отдых — отдельно от активного времени"
                : s.phase === "confirm"
                  ? "Время вышло. Подтвердите выполнение."
                  : s.phase === "ready"
                    ? "Готовы? Запустите подход."
                    : "Выполняйте упражнение в своём темпе"}
          </p>
          {s.phase === "ready" || s.paused ? (
            <button
              className="primary full"
              onClick={() => {
                unlockSound();
                change((v) => ({
                  ...tick(v),
                  paused: false,
                  phase: v.phase === "ready" ? "active" : v.phase,
                }));
              }}
            >
              <Play size={20} />
              {s.paused ? "Продолжить" : "Начать подход"}
            </button>
          ) : (
            <button
              className="secondary full"
              onClick={() => change((v) => ({ ...tick(v), paused: true }))}
            >
              <Pause size={20} />
              Пауза
            </button>
          )}
          {["active", "confirm"].includes(s.phase) && (
            <button
              className="primary full"
              disabled={s.paused}
              onClick={() => next()}
            >
              <Check size={20} />
              Подход выполнен
            </button>
          )}
          {s.phase === "rest" && (
            <button
              className="text-button full"
              onClick={() =>
                change((v) => ({
                  ...tick(v),
                  phase: "ready",
                  restRemaining: 0,
                }))
              }
            >
              Закончить отдых
            </button>
          )}
          <button
            className="text-button full"
            onClick={() => {
              if (
                confirm(
                  "Пропустить оставшуюся часть упражнения? Текущий незавершённый подход не засчитается.",
                )
              )
                next(true);
            }}
          >
            Пропустить упражнение <ArrowRight size={17} />
          </button>
          <details>
            <summary>Техника и облегчённая версия</summary>
            <p>{exercise.technique}</p>
            <p>
              <strong>Избегайте:</strong> {exercise.error}
            </p>
            <p>
              <strong>Проще:</strong> {exercise.easier}
            </p>
            <p>
              Если меняете технику на облегчённую, MET может завышать расход.
            </p>
            <button
              className="text-button"
              disabled={s.weight === null}
              onClick={() => {
                if (
                  confirm(
                    "Отключить оценку калорий до конца тренировки? Это подходит для облегчённых вариантов с другой интенсивностью.",
                  )
                )
                  change((v) => ({ ...v, weight: null }));
              }}
            >
              Выполняю другой вариант — отключить калории
            </button>
            <small>
              После отключения расход за эту тренировку будет «Нет данных».
            </small>
          </details>
          <small>
            Оценка расхода, не медицинское измерение. Паузы и отдых: 0 ккал в
            этом счётчике.
          </small>
        </section>
      </div>
      <button className="text-button" onClick={settings}>
        Открыть профиль (тренировка на паузе)
      </button>
    </div>
  );
}
function Summary({
  record: r,
  close,
}: {
  record: RecordWorkout;
  close: () => void;
}) {
  return (
    <section className="summary card">
      <span className="success-icon">
        <CheckCircle2 size={42} />
      </span>
      <div className="eyebrow">ТРЕНИРОВКА СОХРАНЕНА</div>
      <h1>
        {r.status === "completed"
          ? "Ваше время для себя"
          : "Каждое движение имеет значение"}
      </h1>
      <p>
        {r.name} · {dateLabel(r.date)}
      </p>
      <span className="badge">
        {r.status === "completed" ? "Завершена" : "Частично выполнена"}
      </span>
      <div className="stats">
        <Stat label="продолжительность" value={minutes(r.duration)} />
        <Stat label="активное время" value={minutes(r.activeSeconds)} />
        <Stat label="расход" value={kcal(r.kcal)} />
        <Stat
          label="подходы"
          value={`${r.entries.filter((e) => e.completed).length} / ${r.plannedSets}`}
        />
      </div>
      <p>
        Выполнено упражнений: {r.completedExercises} / {r.plannedExercises} .
        Отдых: {minutes(r.restSeconds)} · паузы: {minutes(r.pauseSeconds)}
      </p>
      <details>
        <summary>Подробности расчёта</summary>
        <p>
          Вес при расчёте: {r.weight ?? "не указан"} {r.weight ? "кг" : ""}. MET
          × 3,5 × кг / 200 × минуты. Незавершённое активное время при досрочном
          завершении включено; пропущенный текущий подход исключён.
        </p>
        {r.entries.map((e, i) => (
          <p key={i}>
            {byId[e.exerciseId]?.name ?? e.exerciseId}: {minutes(e.seconds)} ·{" "}
            {e.met} MET · {e.completed ? "подход выполнен" : "часть подхода"}
          </p>
        ))}
        <p>{r.source}</p>
      </details>
      <small>
        Приблизительная оценка только тренировочной активности. Не суточный
        расход и не медицинское измерение.
      </small>
      <button className="primary" onClick={close}>
        Вернуться к своему ритму <ArrowRight size={18} />
      </button>
    </section>
  );
}
function CalendarView({
  store,
  update,
  start,
}: {
  store: Store;
  update: Update;
  start: (w: Workout, d: string) => void;
}) {
  const [month, setMonth] = useState(localDate().slice(0, 7) + "-01"),
    [selected, setSelected] = useState(localDate()),
    [target, setTarget] = useState("");
  const d = parseDate(month);
  const gridStart = addDays(month, -((d.getDay() + 6) % 7));
  const w = schedule(store, selected);
  const records = store.history.filter((h) => h.date === selected);
  return (
    <div className="home-grid">
      <section className="card">
        <div className="section-title">
          <button
            aria-label="Предыдущий месяц"
            onClick={() => {
              const n = parseDate(month);
              n.setMonth(n.getMonth() - 1);
              setMonth(localDate(n));
            }}
          >
            <ChevronLeft />
          </button>
          <h2>{dateLabel(month, { month: "long", year: "numeric" })}</h2>
          <button
            aria-label="Следующий месяц"
            onClick={() => {
              const n = parseDate(month);
              n.setMonth(n.getMonth() + 1);
              setMonth(localDate(n));
            }}
          >
            <ChevronRight />
          </button>
        </div>
        <div className="calendar">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((t) => (
            <small key={t}>{t}</small>
          ))}
          {Array.from({ length: 42 }, (_, i) => {
            const date = addDays(gridStart, i),
              status = calendarStatus(store, date);
            return (
              <button
                key={date}
                aria-label={`${dateLabel(date)}: ${status}`}
                aria-pressed={date === selected}
                className={`${date === selected ? "chosen" : ""} ${date.slice(0, 7) !== month.slice(0, 7) ? "outside" : ""}`}
                onClick={() => setSelected(date)}
              >
                {parseDate(date).getDate()}
                <i
                  className={`calendar-dot status-${["Запланировано", "Выполнено", "Частично", "Пропущено", "Отдых"].indexOf(status)}`}
                />
              </button>
            );
          })}
        </div>
        <div className="legend">
          {["План", "Выполнено", "Частично", "Пропущено", "Отдых"].map(
            (s, i) => (
              <span key={s}>
                <i className={`calendar-dot status-${i}`} />
                {s}
              </span>
            ),
          )}
        </div>
      </section>
      <aside className="card">
        <div className="eyebrow">
          {dateLabel(selected, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
        <h2>{w?.name ?? "День отдыха"}</h2>
        <p>{calendarStatus(store, selected)}</p>
        {w && (
          <>
            <p>
              ~{Math.round(plannedSeconds(w) / 60)} мин · с разминкой и заминкой
            </p>
            <button className="primary full" onClick={() => start(w, selected)}>
              Начать <Play size={18} />
            </button>
            <label>
              Перенести на дату
              <input
                type="date"
                value={target}
                min={store.settings.startDate}
                max={addDays(store.settings.startDate, 27)}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <button
              disabled={
                !target ||
                target === selected ||
                target < store.settings.startDate ||
                target > addDays(store.settings.startDate, 27)
              }
              onClick={() => {
                if (
                  schedule(store, target) &&
                  !confirm(
                    "На выбранной дате уже есть план. Поменять тренировки местами?",
                  )
                )
                  return;
                const targetId = schedule(store, target)?.id ?? null;
                update((s) => ({
                  ...s,
                  overrides: {
                    ...s.overrides,
                    [selected]: targetId,
                    [target]: w.id,
                  },
                }));
                setTarget("");
              }}
            >
              Перенести / обменять
            </button>
          </>
        )}
        <label>
          План на выбранную дату
          <select
            value={w?.id ?? ""}
            disabled={
              dayDistance(store.settings.startDate, selected) < 0 ||
              dayDistance(store.settings.startDate, selected) >= 28
            }
            onChange={(e) =>
              update((s) => ({
                ...s,
                overrides: {
                  ...s.overrides,
                  [selected]: e.target.value || null,
                },
              }))
            }
          >
            <option value="">Отдых</option>
            {workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {records.length > 0 && (
          <>
            <h3>История этого дня</h3>
            {records.map((r) => (
              <HistoryItem key={r.id} record={r} />
            ))}
          </>
        )}
        <small>
          Перенос меняет только план; завершённые записи сохраняются.
        </small>
      </aside>
    </div>
  );
}
function Library({
  store,
  start,
}: {
  store: Store;
  start: (w: Workout) => void;
}) {
  const [mode, setMode] = useState("Программа"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Все"),
    [week, setWeek] = useState(1);
  return (
    <>
      <div className="tabs">
        {["Программа", "Упражнения"].map((t) => (
          <button
            key={t}
            className={mode === t ? "active" : ""}
            onClick={() => setMode(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {mode === "Программа" ? (
        <>
          <div className="section-title">
            <h2>Четыре недели для себя</h2>
            <select
              aria-label="Неделя программы"
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>
                  Неделя {w}
                </option>
              ))}
            </select>
          </div>
          <p className="muted">
            {
              [
                "Адаптация: объём многоподходных упражнений уменьшен. Можно завершить раньше.",
                "Стандартный объём. Следите за техникой.",
                "Небольшое увеличение: ещё один круг и +5 секунд в многоподходных удержаниях.",
                "Закрепление: сохраняйте комфортный ритм.",
              ][week - 1]
            }
          </p>
          <div className="workout-grid">
            {workouts
              .filter((w) => w.id !== "stretch" || store.settings.optional)
              .map((w) => {
                const workout = workoutForWeekLocal(
                  w.id,
                  week,
                  store.settings.rest,
                );
                return (
                  <WorkoutCard
                    key={w.id}
                    workout={workout}
                    onStart={() => start(workout)}
                  />
                );
              })}
          </div>
        </>
      ) : (
        <>
          <div className="filters">
            <label className="search">
              <Search size={18} />
              <input
                aria-label="Поиск упражнений"
                placeholder="Найти упражнение"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Категория"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {["Все", "Силовые", "Кардио", "Гибкость", "Разминка"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="exercise-grid">
            {exercises
              .filter(
                (e) =>
                  e.name.toLowerCase().includes(query.toLowerCase()) &&
                  (category === "Все" || e.category === category),
              )
              .map((e) => (
                <article className="card" key={e.id}>
                  <div className="eyebrow">{e.category}</div>
                  <h2>{e.name}</h2>
                  <ExerciseDemo exercise={e} compact />
                  <p>{e.technique}</p>
                  <details>
                    <summary>Ошибки, объём и упрощение</summary>
                    <p>
                      <strong>Избегайте:</strong> {e.error}
                    </p>
                    <p>
                      <strong>Проще:</strong> {e.easier}
                    </p>
                    <p>
                      В программе:{" "}
                      {workouts
                        .flatMap((w) => w.steps)
                        .filter((s) => s.exerciseId === e.id)
                        .map((s) => `${s.sets} × ${s.reps ?? `${s.seconds} с`}`)
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(" / ") || "40 с работы / 20 с отдыха в круге"}
                    </p>
                  </details>
                </article>
              ))}
          </div>
          {!exercises.some(
            (e) =>
              e.name.toLowerCase().includes(query.toLowerCase()) &&
              (category === "Все" || e.category === category),
          ) && <Empty>Ничего не найдено. Попробуйте другой запрос.</Empty>}
        </>
      )}
    </>
  );
}
import { workoutForWeek as workoutForWeekLocal } from "./data";
function HistoryItem({ record: r }: { record: RecordWorkout }) {
  return (
    <details className="history-item">
      <summary>
        <span>
          {dateLabel(r.date)} · {r.name}
          <small>
            {r.status === "completed" ? "Завершена" : "Частично"} ·{" "}
            {minutes(r.duration)} · {kcal(r.kcal)}
          </small>
        </span>
      </summary>
      <p>
        Активно: {minutes(r.activeSeconds)} · подходов:{" "}
        {r.entries.filter((e) => e.completed).length}/{r.plannedSets} · вес:{" "}
        {r.weight ?? "не указан"} кг
      </p>
      {r.entries.map((e, i) => (
        <p key={i}>
          {byId[e.exerciseId]?.name ?? e.exerciseId} · {minutes(e.seconds)} ·{" "}
          {e.met} MET
        </p>
      ))}
    </details>
  );
}
function Progress({ store, update }: { store: Store; update: Update }) {
  const [metric, setMetric] = useState("weight");
  const [notice, setNotice] = useState("");
  const today = localDate(),
    week = periodCalories(
      store.history,
      monday(today),
      addDays(monday(today), 6),
    ),
    month = periodCalories(
      store.history,
      today.slice(0, 7) + "-01",
      today.slice(0, 7) + "-31",
    ),
    progress = planProgress(store);
  const chart = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13),
      p = periodCalories(store.history, date, date);
    return {
      date: dateLabel(date),
      ккал: p.count && p.missing === 0 ? Math.round(p.value) : null,
    };
  });
  const measurements = [...store.measurements].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const complete = store.history.filter((r) => r.status === "completed").length;
  const addMeasurement = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const m: Measurement = {
      id: crypto.randomUUID(),
      date: String(data.get("date")),
    };
    for (const key of ["weight", "waist", "hips"] as const) {
      const value = data.get(key);
      if (value) m[key] = Number(value);
    }
    if (!m.weight && !m.waist && !m.hips) {
      setNotice("Укажите хотя бы одно измерение.");
      return;
    }
    update((s) => ({ ...s, measurements: [...s.measurements, m] }));
    setNotice(
      "Измерение сохранено. Текущий вес профиля редактируется отдельно.",
    );
    e.currentTarget.reset();
  };
  return (
    <>
      <div className="stats card">
        <Stat label="завершено тренировок" value={complete} />
        <Stat
          label="всего минут занятий"
          value={Math.round(
            store.history.reduce((n, r) => n + r.duration, 0) / 60,
          )}
        />
        <Stat label="план за 4 недели" value={`${progress.percent}%`} />
      </div>
      <div className="home-grid">
        <section className="card">
          <div className="section-title">
            <h2>Энергия движения</h2>
            <Flame size={22} />
          </div>
          <div className="stats">
            <Stat
              label="за текущую неделю"
              value={
                week.count > week.missing ? kcal(week.value) : "Нет данных"
              }
            />
            <Stat
              label="за текущий месяц"
              value={
                month.count > month.missing ? kcal(month.value) : "Нет данных"
              }
            />
          </div>
          {(week.missing > 0 || month.missing > 0) && (
            <p>
              Сумма только известных оценок; без веса: неделя — {week.missing},
              месяц — {month.missing} тренировок.
            </p>
          )}
          <p className="muted">
            Последние 14 дней · только сохранённые тренировки
          </p>
          {store.history.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis unit="" />
                  <Tooltip formatter={(v) => [`≈ ${v} ккал`, "Тренировки"]} />
                  <Bar dataKey="ккал" fill="#9476AC" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty>После первой тренировки здесь появится график.</Empty>
          )}
          <small>
            Дни без данных не равны нулевому суточному расходу. Приблизительные
            значения относятся только к тренировкам и не вычитаются из нормы
            питания.
          </small>
        </section>
        <section className="card">
          <h2>Измерения тела</h2>
          <select
            aria-label="Показатель графика"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="weight">Вес, кг</option>
            <option value="waist">Талия, см</option>
            <option value="hips">Бёдра, см</option>
          </select>
          {measurements.some(
            (m) => m[metric as keyof Measurement] !== undefined,
          ) ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={measurements.map((m) => ({
                    ...m,
                    label: dateLabel(m.date),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={["auto", "auto"]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey={metric}
                    name={
                      {
                        weight: "Вес, кг",
                        waist: "Талия, см",
                        hips: "Бёдра, см",
                      }[metric]
                    }
                    stroke="#9476AC"
                    strokeWidth={3}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty>Добавьте своё первое измерение.</Empty>
          )}
          <form onSubmit={addMeasurement}>
            <label>
              Дата
              <input
                name="date"
                type="date"
                required
                defaultValue={today}
                max={today}
              />
            </label>
            <div className="form-grid">
              {[
                ["weight", "Вес, кг", 20, 400],
                ["waist", "Талия, см", 20, 300],
                ["hips", "Бёдра, см", 20, 300],
              ].map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    name={String(key)}
                    type="number"
                    min={min}
                    max={max}
                    step="0.1"
                    inputMode="decimal"
                  />
                </label>
              ))}
            </div>
            <button className="secondary full">
              <Plus size={18} />
              Добавить измерение
            </button>
          </form>
          <p role="status">{notice}</p>
          <details>
            <summary>Все измерения · удалить ошибку</summary>
            {measurements.map((m) => (
              <div className="measurement" key={m.id}>
                <span>
                  {dateLabel(m.date)}: {m.weight ? `${m.weight} кг ` : ""}
                  {m.waist ? `талия ${m.waist} см ` : ""}
                  {m.hips ? `бёдра ${m.hips} см` : ""}
                </span>
                <button
                  aria-label="Удалить измерение"
                  onClick={() => {
                    if (confirm("Удалить это измерение?"))
                      update((s) => ({
                        ...s,
                        measurements: s.measurements.filter(
                          (x) => x.id !== m.id,
                        ),
                      }));
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            ))}
          </details>
        </section>
      </div>
      <div className="section-title">
        <h2>По неделям</h2>
      </div>
      <div className="weekly-grid">
        {[0, 1, 2, 3].map((i) => {
          const from = addDays(store.settings.startDate, i * 7),
            p = planProgress(store, from, addDays(from, 6));
          return (
            <article className="card" key={i}>
              <span className="eyebrow">НЕДЕЛЯ {i + 1}</span>
              <h3>
                {p.completed} из {p.planned}
              </h3>
              <progress max={100} value={p.percent} />
            </article>
          );
        })}
      </div>
      <section className="card">
        <h2>Маленькие достижения</h2>
        <div className="achievements">
          {[
            ["Первая тренировка", complete >= 1],
            ["Пять тренировок", complete >= 5],
            ["Десять тренировок", complete >= 10],
            [
              "Первый месяц занятий",
              complete >= 1 &&
                store.history.some(
                  (h) =>
                    h.status === "completed" &&
                    dayDistance(store.settings.startDate, h.date) >= 27,
                ) &&
                [0, 1, 2, 3].every((i) =>
                  store.history.some(
                    (h) =>
                      h.status === "completed" &&
                      dayDistance(store.settings.startDate, h.date) >= i * 7 &&
                      dayDistance(store.settings.startDate, h.date) < i * 7 + 7,
                  ),
                ),
            ],
          ].map(([title, done]) => (
            <div className={done ? "earned" : ""} key={String(title)}>
              <Sparkles />
              <span>{title}</span>
              <small>{done ? "Получено" : "Ещё впереди"}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>История тренировок</h2>
        {store.history.length ? (
          [...store.history]
            .reverse()
            .map((r) => <HistoryItem record={r} key={r.id} />)
        ) : (
          <Empty>
            Здесь будут ваши тренировки, включая частично выполненные.
          </Empty>
        )}
      </section>
      <details className="card">
        <summary>Как рассчитываются калории</summary>
        <p>
          Ккал = MET × 3,5 × масса тела / 200 × активные минуты. Возраст и рост
          в формулу не входят. Умеренная калистеника — 3,8 MET; лёгкая — 2,8;
          интенсивная — 8,0; мягкая растяжка — 2,3. Это категории активности, а
          не точные коэффициенты конкретного человека.
        </p>
        <p>{MET_SOURCE}</p>
        <p>
          Паузы и отдых записываются отдельно и не включены в расход. При
          пропуске сохраняются уже подтверждённые подходы, текущий незавершённый
          исключается. При досрочном завершении активная часть незавершённого
          подхода сохраняется без отметки выполнения.
        </p>
      </details>
    </>
  );
}
function SettingsView({ store, update }: { store: Store; update: Update }) {
  const [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `moy-ritm-${localDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importData = async (f: File) => {
    try {
      if (f.size > 15 * 1024 * 1024) throw Error("Файл больше 15 МБ.");
      const raw = JSON.parse(await f.text());
      const parsed = validateBackup(raw);
      if (
        !confirm(
          "Заменить все локальные данные этой копией? Сначала экспортируйте текущие данные, если хотите их сохранить.",
        )
      )
        return;
      parsed.session = restoreSession(parsed.session);
      await save(parsed);
      update(parsed);
      setMessage(
        "Резервная копия импортирована. История сохранена, незавершённая тренировка восстановлена на паузе.",
      );
    } catch (e) {
      setMessage(`Не удалось импортировать: ${(e as Error).message}`);
    }
  };

  return (
    <div className="home-grid">
      <div>
        <section className="card">
          <h2>Ваш профиль</h2>
          <p className="muted">
            Все поля необязательны. Для калорий нужен только вес.
          </p>
          <form
            key={JSON.stringify(store.profile)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update((s) => ({
                ...s,
                profile: {
                  age: f.get("age") ? Number(f.get("age")) : undefined,
                  height: f.get("height") ? Number(f.get("height")) : undefined,
                  weight: f.get("weight") ? Number(f.get("weight")) : undefined,
                  goals: String(f.get("goals")),
                },
              }));
              setMessage("Профиль сохранён. История расчётов не изменилась.");
            }}
          >
            <div className="form-grid">
              {[
                ["age", "Возраст, лет", 14, 120],
                ["height", "Рост, см", 80, 250],
                ["weight", "Вес, кг", 20, 400],
              ].map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    name={String(key)}
                    type="number"
                    inputMode="decimal"
                    step={key === "age" ? 1 : 0.1}
                    min={min}
                    max={max}
                    defaultValue={
                      store.profile[key as "age" | "height" | "weight"] ?? ""
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Цели тренировок
              <textarea
                name="goals"
                maxLength={1000}
                defaultValue={store.profile.goals}
                placeholder="Например, больше подвижности и сил"
              />
            </label>
            <button className="primary full">
              Сохранить профиль <Check size={18} />
            </button>
          </form>
        </section>
        <section className="card">
          <h2>Данные только у вас</h2>
          <p>
            Профиль и история хранятся в IndexedDB этого браузера. Очистка
            данных сайта удаляет их. Периодически сохраняйте копию.
          </p>
          <div className="button-row">
            <button onClick={exportData}>
              <Download size={18} />
              Экспорт JSON
            </button>
            <button onClick={() => file.current?.click()}>
              <Upload size={18} />
              Импорт JSON
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void importData(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            className="danger full"
            onClick={() => {
              if (
                confirm(
                  "Сбросить историю, измерения, текущую тренировку и переносы? Профиль и настройки сохранятся.",
                )
              ) {
                update((s) => ({
                  ...s,
                  history: [],
                  measurements: [],
                  session: null,
                  overrides: {},
                }));
                setMessage("Прогресс сброшен.");
              }
            }}
          >
            Сбросить прогресс
          </button>
        </section>
      </div>
      <div>
        <section className="card">
          <h2>Ваше расписание</h2>
          <label>
            Начало четырёх недель
            <input
              type="date"
              value={store.settings.startDate}
              onChange={(e) => {
                if (e.target.value)
                  update((s) => ({
                    ...s,
                    settings: { ...s.settings, startDate: e.target.value },
                  }));
              }}
            />
          </label>
          <small>
            Дата — первый день программы. Удобнее выбрать понедельник. После
            четырёх недель можно задать новую дату; история останется.
          </small>
          {[
            "Ноги и ягодицы",
            "Гибкость",
            "Всё тело и пресс",
            "Кардио и сила",
            "Дополнительная растяжка",
          ].map((title, i) => (
            <label key={title}>
              {title}
              <select
                value={store.settings.days[i]}
                onChange={(e) => {
                  const day = Number(e.target.value),
                    days = [...store.settings.days],
                    other = days.indexOf(day);
                  if (other >= 0) days[other] = days[i];
                  days[i] = day;
                  update((s) => ({ ...s, settings: { ...s.settings, days } }));
                }}
              >
                {[
                  "Воскресенье",
                  "Понедельник",
                  "Вторник",
                  "Среда",
                  "Четверг",
                  "Пятница",
                  "Суббота",
                ].map((d, j) => (
                  <option key={d} value={j}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="muted">
            При выборе занятого дня занятия меняются местами. Индивидуальные
            переносы в календаре имеют приоритет.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={store.settings.optional}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  settings: { ...s.settings, optional: e.target.checked },
                }))
              }
            />
            Пятая необязательная тренировка
          </label>
          <label>
            Отдых между силовыми подходами, с
            <input
              type="number"
              min={0}
              max={300}
              step={5}
              value={store.settings.rest}
              onChange={(e) => {
                const rest = Number(e.target.value);
                if (Number.isFinite(rest) && rest >= 0 && rest <= 300)
                  update((s) => ({ ...s, settings: { ...s.settings, rest } }));
              }}
            />
          </label>
          <small>
            В круговой тренировке отдых фиксирован: 20 секунд. Изменения
            применяются к новым тренировкам.
          </small>
        </section>
        <section className="card">
          <h2>Комфорт</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={store.settings.sound}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  settings: { ...s.settings, sound: e.target.checked },
                }))
              }
            />
            Звук по окончании интервала
          </label>
          <label>
            Тема
            <select
              value={store.settings.theme}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  settings: {
                    ...s.settings,
                    theme: e.target.value as "light" | "dark",
                  },
                }))
              }
            >
              <option value="light">Светлая</option>
              <option value="dark">Тёмная</option>
            </select>
          </label>
          <p>Настройка уменьшения движения учитывается автоматически.</p>
          <small>
            PWA работает офлайн после первой полной загрузки рабочей сборки. Для
            установки на телефон требуется HTTPS.
          </small>
        </section>
      </div>
      <div className="toast" role="status">
        {message}
      </div>
    </div>
  );
}
