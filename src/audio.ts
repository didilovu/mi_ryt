let enabled = false;
let context: AudioContext | undefined;
export function setSoundEnabled(value: boolean) {
  enabled = value;
}
// Called from a user gesture so Safari can unlock audio playback.
export function unlockSound() {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  } catch {
    /* Audio is optional. */
  }
}
export function timerSound() {
  if (!enabled || !context || context.state !== "running") return;
  const oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
  oscillator.frequency.value = 650;
  oscillator.start();
  oscillator.stop(context.currentTime + 0.25);
}
