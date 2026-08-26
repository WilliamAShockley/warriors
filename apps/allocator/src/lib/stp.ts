// Straight-through processing checks — the verifications a staged email
// must clear before it could ever go out unsigned. Run at staging, filed
// on the proof (stpJson), shown in the proof room and the Record.
//
// NOT a send gate yet: today the results inform the reader's signature.
// When auto-send arrives, it stands behind stpAllPassed() — nothing else
// needs to change.
//
// Adding a check: append to STP_CHECKS. Each check is self-contained —
// it reads the staged email plus whatever the workspace can verify
// against, and answers pass/fail with a plain-English detail line.

export type StpInput = {
  body: string
  subject: string | null
  to: string | null
  mode: string | null // cold | follow_up
  audience: string | null // founder | investor | other
  grounding: string | null
  // The Register's entry for the company in play, when one exists — the
  // workspace's verified record, and the standard the checks hold the
  // draft to.
  register: { founderFirstName: string | null; founderFullName: string | null } | null
}

export type StpResult = { id: string; label: string; pass: boolean; detail: string }

export type StpCheck = {
  id: string
  label: string
  // Which staged emails the check applies to; inapplicable checks are
  // simply not run (a follow-up is not held to the cold subject format).
  applies: (input: StpInput) => boolean
  run: (input: StpInput) => Promise<{ pass: boolean; detail: string }>
}

// The greeting name: the first word of the draft, shorn of punctuation.
// Dez's cold structure always opens "<FirstName>," so this is reliable
// for the emails these checks govern.
export function greetingName(body: string): string | null {
  const first = body.trim().split('\n')[0] ?? ''
  const m = first.match(/^([A-Za-z][A-Za-z'’.-]*)\s*[,—–-]/)
  return m ? m[1].replace(/[.]$/, '') : null
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[’']/g, "'")

// ————— Check: the founder's name is verifiably correct —————
// The draft's greeting must match a name the workspace can stand behind:
// the Register's founder entry (filed by research), corroborated by the
// grounding the draft was based on. A name from nowhere fails — however
// plausible it reads.
const founderNameCheck: StpCheck = {
  id: 'founder-name',
  label: 'Founder name verified',
  applies: (i) => i.audience === 'founder',
  run: async (i) => {
    const greeted = greetingName(i.body)
    if (!greeted) {
      return { pass: false, detail: 'No greeting name found at the top of the draft.' }
    }
    const registerFirst = i.register?.founderFirstName?.trim() || null
    const registerFull = i.register?.founderFullName?.trim() || null
    if (!registerFirst && !registerFull) {
      return {
        pass: false,
        detail: `"${greeted}" is unverified — the Register has no founder on file for this company.`,
      }
    }
    const candidates = [registerFirst, registerFull?.split(/\s+/)[0]].filter(Boolean) as string[]
    const match = candidates.some((c) => norm(c) === norm(greeted))
    if (!match) {
      return {
        pass: false,
        detail: `The draft greets "${greeted}" but the Register has ${registerFull ?? registerFirst} on file.`,
      }
    }
    const grounded = i.grounding ? norm(i.grounding).includes(norm(greeted)) : false
    return grounded
      ? { pass: true, detail: `"${greeted}" matches the Register and appears in the grounding.` }
      : {
          pass: true,
          detail: `"${greeted}" matches the Register (not restated in the grounding).`,
        }
  },
}

// ————— Check: the subject line is as the reader specifies —————
// The reader's specified formats, one regex per acceptable shape. Edit
// here to change the specification; the check itself never changes.
const SUBJECT_FORMATS: { label: string; pattern: RegExp; modes: string[] }[] = [
  {
    label: 'Reaching Out - [Company] <> FirstMark',
    pattern: /^Reaching Out\s*-\s*.+\s*<>\s*.+$/i,
    modes: ['cold'],
  },
  {
    label: 'Re: Reaching Out - …',
    pattern: /^Re:\s*Reaching Out\s*-\s*.+$/i,
    modes: ['follow_up'],
  },
]

const subjectFormatCheck: StpCheck = {
  id: 'subject-format',
  label: 'Subject line to spec',
  applies: (i) => i.audience === 'founder' && Boolean(i.subject),
  run: async (i) => {
    const subject = (i.subject ?? '').trim()
    const applicable = SUBJECT_FORMATS.filter(
      (f) => !i.mode || f.modes.includes(i.mode)
    )
    const hit = applicable.find((f) => f.pattern.test(subject))
    if (hit) return { pass: true, detail: `"${subject}" matches "${hit.label}".` }
    return {
      pass: false,
      detail: `"${subject}" does not match ${applicable.map((f) => `"${f.label}"`).join(' or ') || 'any specified format'}.`,
    }
  },
}

// The registry. Order is display order.
export const STP_CHECKS: StpCheck[] = [founderNameCheck, subjectFormatCheck]

// Run every applicable check; a check that throws files as a failure
// rather than silently passing. Returns [] for proofs no check applies to.
export async function runStpChecks(input: StpInput): Promise<StpResult[]> {
  const results: StpResult[] = []
  for (const check of STP_CHECKS) {
    if (!check.applies(input)) continue
    try {
      const r = await check.run(input)
      results.push({ id: check.id, label: check.label, ...r })
    } catch (err) {
      results.push({
        id: check.id,
        label: check.label,
        pass: false,
        detail: `The check itself failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      })
    }
  }
  return results
}

export const stpAllPassed = (results: StpResult[]): boolean =>
  results.length > 0 && results.every((r) => r.pass)
