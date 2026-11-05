import { NextResponse } from 'next/server'
import os from 'os'
import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

type CpuSnapshot = { idle: number; total: number; t: number }
// module-scoped snapshot so CPU% is computed between polls
let lastCpu: CpuSnapshot | null = null

function readCpuTimes(): { idle: number; total: number } {
  try {
    const line = readFileSync('/proc/stat', 'utf8').split('\n')[0]
    const parts = line.split(/\s+/).slice(1).map(Number)
    const user = parts[0] || 0, nice = parts[1] || 0, system = parts[2] || 0,
      idle = parts[3] || 0, iowait = parts[4] || 0, irq = parts[5] || 0,
      softirq = parts[6] || 0, steal = parts[7] || 0
    return { idle: idle + iowait, total: user + nice + system + idle + iowait + irq + softirq + steal }
  } catch {
    // fallback: os.cpus()
    const cpus = os.cpus()
    let idle = 0, total = 0
    for (const c of cpus) {
      idle += c.times.idle
      total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
    }
    return { idle, total }
  }
}

function computeCpuPercent(): number {
  const now = readCpuTimes()
  const t = Date.now()
  if (lastCpu) {
    const dt = t - lastCpu.t
    const dTotal = now.total - lastCpu.total
    const dIdle = now.idle - lastCpu.idle
    lastCpu = { ...now, t }
    if (dt > 0 && dTotal > 0) {
      const pct = ((dTotal - dIdle) / dTotal) * 100
      return Math.max(0, Math.min(100, Math.round(pct * 10) / 10))
    }
  } else {
    lastCpu = { ...now, t }
  }
  return 0
}

export async function GET() {
  const memTotal = os.totalmem()
  const memFree = os.freemem()
  const cpus = os.cpus()

  let procCount = 0
  let topProcs: { pid: string; command: string; cpu: string; mem: string }[] = []
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,comm,%cpu,%mem', '--no-headers', '--sort=-%cpu'], {
      timeout: 3000,
    })
    const lines = stdout.trim().split('\n').filter(Boolean)
    procCount = lines.length
    topProcs = lines.slice(0, 6).map((l) => {
      const parts = l.trim().split(/\s+/)
      if (parts.length >= 4) {
        return {
          pid: parts[0],
          command: parts.slice(1, -2).join(' ') || parts[1],
          cpu: parts[parts.length - 2],
          mem: parts[parts.length - 1],
        }
      }
      return { pid: '0', command: l.trim(), cpu: '0', mem: '0' }
    })
  } catch {
    // ps unavailable — leave empty
  }

  return NextResponse.json({
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    cpuModel: cpus[0]?.model?.trim() ?? 'Unknown CPU',
    cores: cpus.length,
    uptime: os.uptime(),
    cpuPercent: computeCpuPercent(),
    memTotal,
    memUsed: memTotal - memFree,
    load: os.loadavg().map((v) => Math.round(v * 100) / 100),
    procCount,
    topProcs,
  })
}
