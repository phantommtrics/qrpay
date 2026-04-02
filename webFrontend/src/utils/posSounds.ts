/** Lightweight POS feedback using Web Audio (no asset files; works after user gesture). */

let sharedCtx: AudioContext | null = null

function getContext(): AudioContext {
  if (!sharedCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) {
      throw new Error('Web Audio API not supported')
    }
    sharedCtx = new AC()
  }
  return sharedCtx
}

async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {
      /* autoplay policy may block until gesture */
    })
  }
}

function beep(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  gain = 0.12,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Short pleasant two-tone when an item is added */
export async function playPosScanSuccess(): Promise<void> {
  try {
    const ctx = getContext()
    await ensureRunning(ctx)
    const t = ctx.currentTime
    beep(ctx, 880, t, 0.07, 0.1)
    beep(ctx, 1174, t + 0.08, 0.1, 0.09)
  } catch {
    /* ignore if audio blocked */
  }
}

/** Lower harsh tone for errors / out of stock */
export async function playPosScanError(): Promise<void> {
  try {
    const ctx = getContext()
    await ensureRunning(ctx)
    const t = ctx.currentTime
    beep(ctx, 180, t, 0.12, 0.14, 'square')
    beep(ctx, 140, t + 0.14, 0.18, 0.12, 'square')
  } catch {
    /* ignore */
  }
}
