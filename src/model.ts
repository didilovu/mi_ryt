export type Category = "Силовые" | "Кардио" | "Гибкость" | "Разминка";
export interface Exercise {
  id: string;
  name: string;
  category: Category;
  met: number;
  source: string;
  technique: string;
  error: string;
  easier: string;
  poses: [string, string];
  captions: [string, string];
}
export interface Step {
  exerciseId: string;
  sets: number;
  reps?: string;
  seconds?: number;
  estimate?: number;
  rest: number;
}
export interface Workout {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  steps: Step[];
}
export interface Profile {
  age?: number;
  height?: number;
  weight?: number;
  goals: string;
}
export interface Measurement {
  id: string;
  date: string;
  weight?: number;
  waist?: number;
  hips?: number;
}
export interface Entry {
  exerciseId: string;
  set: number;
  seconds: number;
  met: number;
  completed: boolean;
}
export interface Session {
  id: string;
  workout: Workout;
  date: string;
  weight: number | null;
  index: number;
  set: number;
  phase: "ready" | "active" | "rest" | "confirm";
  paused: boolean;
  lastTick: number;
  elapsed: number;
  pauseSeconds: number;
  restSeconds: number;
  currentSeconds: number;
  restRemaining: number;
  entries: Entry[];
  skipped: string[];
  source: string;
}
export interface RecordWorkout {
  id: string;
  date: string;
  name: string;
  duration: number;
  activeSeconds: number;
  pauseSeconds: number;
  restSeconds: number;
  weight: number | null;
  kcal: number | null;
  entries: Entry[];
  skipped: string[];
  status: "completed" | "partial";
  source: string;
  plannedSets: number;
  completedExercises: number;
  plannedExercises: number;
}
export interface Settings {
  startDate: string;
  days: number[];
  rest: number;
  sound: boolean;
  optional: boolean;
  theme: "light" | "dark";
}
export interface Store {
  version: 1;
  profile: Profile;
  settings: Settings;
  overrides: Record<string, string | null>;
  measurements: Measurement[];
  history: RecordWorkout[];
  session: Session | null;
}
