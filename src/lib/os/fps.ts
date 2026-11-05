/**
 * Global FPS meter — a single requestAnimationFrame loop shared by the
 * whole OS. Runs at display refresh rate; consumers subscribe to updates.
 */
export type FpsSample = {
  /** smoothed fps over the trailing window */
  fps: number
  /** raw frames recorded in the last second */
  raw: number
}

class FpsMeter {
  private frames: number[] = []
  private raf = 0
  private last = 0
  private subs = new Set<(s: FpsSample) => void>()
  private notifyTimer: ReturnType<typeof setTimeout> | null = null
  fps = 0
  raw = 0

  start() {
    if (this.raf) return
    this.last = performance.now()
    const loop = (t: number) => {
      const delta = t - this.last
      this.last = t
      this.frames.push(t)
      // keep ~2s of frame timestamps
      while (this.frames.length && t - this.frames[0] > 2000) this.frames.shift()
      // fps = frames in the trailing 1000ms
      let count = 0
      for (let i = this.frames.length - 1; i >= 0; i--) {
        if (t - this.frames[i] <= 1000) count++
        else break
      }
      this.raw = count
      this.fps = this.fps + (count - this.fps) * 0.1 // light smoothing
      this.scheduleNotify()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private scheduleNotify() {
    if (this.notifyTimer) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      const s = { fps: Math.round(this.fps), raw: this.raw }
      this.subs.forEach((fn) => fn(s))
    }, 250)
  }

  subscribe(fn: (s: FpsSample) => void) {
    this.subs.add(fn)
    fn({ fps: Math.round(this.fps), raw: this.raw })
    return () => {
      this.subs.delete(fn)
    }
  }

  /** history of recent fps values (sampled by callers, e.g. the monitor app) */
  history: number[] = []
  pushHistory(v: number) {
    this.history.push(v)
    if (this.history.length > 180) this.history.shift()
  }
}

export const fpsMeter = new FpsMeter()
