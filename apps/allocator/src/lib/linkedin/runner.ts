import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Launching the Playwright runner (apps/linkedin-nav/outreach_runner.py)
// from the app. Only possible where the app runs on the reader's own
// machine, beside his signed-in LinkedIn session. On a hosted deployment
// the row simply stays queued until `outreach_runner.py --watch` on his
// machine claims it over the API.

const g = globalThis as unknown as { __linkedinRunner?: { child: ChildProcess | null; startedAt: number; lastExit?: string } }
const state = (g.__linkedinRunner ??= { child: null, startedAt: 0 })

const firstExisting = (paths: string[]) => paths.find((p) => p && fs.existsSync(p))

function locate(): { script: string; python: string } | null {
  if (process.env.VERCEL) return null
  const dir =
    process.env.LINKEDIN_RUNNER_DIR ||
    firstExisting([path.resolve(process.cwd(), '../linkedin-nav'), path.resolve(process.cwd(), 'apps/linkedin-nav')])
  if (!dir) return null
  const script = path.join(dir, 'outreach_runner.py')
  if (!fs.existsSync(script)) return null
  const python =
    process.env.LINKEDIN_RUNNER_PYTHON ||
    firstExisting([path.join(dir, 'venv/bin/python'), path.join(os.homedir(), 'linkedin-nav-env/venv/bin/python')]) ||
    'python3'
  return { script, python }
}

export function runnerStatus(): { local: boolean; running: boolean; lastExit: string | null } {
  return { local: Boolean(locate()), running: Boolean(state.child), lastExit: state.lastExit ?? null }
}

// Start a drain run unless one is already going. The runner loops until
// the queue is empty, so a row queued while it works is picked up too.
export function kickRunner(origin: string): { started: boolean; running: boolean; reason?: string } {
  const found = locate()
  if (!found) return { started: false, running: false, reason: 'no local runner here — run outreach_runner.py --watch on the machine with your LinkedIn session' }
  if (state.child) return { started: false, running: true }

  const token = (process.env.APP_PASSWORD ?? '').split(',')[0]?.trim() ?? ''
  const logDir = path.join(path.dirname(found.script), 'outreach_logs')
  fs.mkdirSync(logDir, { recursive: true })
  const log = fs.openSync(path.join(logDir, 'runner.log'), 'a')

  const child = spawn(found.python, ['-u', found.script, '--drain'], {
    cwd: path.dirname(found.script),
    env: { ...process.env, ALLOCATOR_URL: origin, ALLOCATOR_TOKEN: token },
    stdio: ['ignore', log, log],
  })
  state.child = child
  state.startedAt = Date.now()
  state.lastExit = undefined

  const done = (why: string) => {
    if (state.child !== child) return
    state.child = null
    state.lastExit = why
    try {
      fs.closeSync(log)
    } catch {}
  }
  child.on('error', (e) => done(`could not start: ${e.message}`))
  child.on('exit', (code, signal) => done(signal ? `signal ${signal}` : `exit ${code}`))
  return { started: true, running: true }
}
