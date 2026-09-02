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

// The greeting name, shorn of punctuation. Dez's cold structure opens
// "Hey <FirstName> -" (OG) or bare "<FirstName>," — the same shapes the
// greeting-format check accepts — so this is reliable for the emails
// these checks govern.
export function greetingName(body: string): string | null {
  const first = body.trim().split('\n')[0] ?? ''
  const m = first.match(/^(?:(?:Hey|Hi)\s+)?([A-Za-z][A-Za-z'’.-]*)\s*[,—–-]/)
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

// ————— The voice-profile checks —————
// Mechanical verifications derived from the reader's email voice profile
// (dez-email-voice-profile.md): structure, greeting shape, sign-off,
// punctuation tells, banned corporate-AI phrasing. Each is a plain
// string check on the staged draft — no model in the loop — so a pass
// is something auto-send could stand behind. They double as the OG
// sheet's columns.

const isCold = (i: StpInput) => i.mode !== 'follow_up'
const founderEmail = (i: StpInput) => i.audience === 'founder'

const paragraphs = (body: string): string[] =>
  body
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

// The body shorn of its sign-off line, for prose checks.
const prose = (body: string): string => body.trim().replace(/\n+\s*Dez\s*$/i, '')

const greetingFormatCheck: StpCheck = {
  id: 'greeting-format',
  label: 'Greeting to spec',
  applies: founderEmail,
  run: async (i) => {
    const first = i.body.trim().split('\n')[0] ?? ''
    const m = first.match(/^(?:(Hey|Hi)\s+)?([A-Z][A-Za-z'’.-]*)\s*[-,]/)
    if (!m) {
      return { pass: false, detail: `The draft opens "${first.slice(0, 40)}…" — not "Hey [First] -" / "[First] -".` }
    }
    return { pass: true, detail: `Opens "${first.slice(0, Math.min(first.length, 30))}…" — greeting shape matches.` }
  },
}

const signoffCheck: StpCheck = {
  id: 'signoff',
  label: 'Signed off bare "Dez"',
  applies: founderEmail,
  run: async (i) => {
    const lines = i.body.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    const last = lines[lines.length - 1] ?? ''
    if (/^dez$/i.test(last)) return { pass: true, detail: 'Ends on a bare "Dez".' }
    if (!isCold(i)) return { pass: true, detail: `No sign-off ("${last.slice(0, 30)}…") — in-voice for a follow-up.` }
    return { pass: false, detail: `Ends "${last.slice(0, 40)}" — a cold email signs off with a bare "Dez".` }
  },
}

const coldStructureCheck: StpCheck = {
  id: 'cold-structure',
  label: 'Cold structure (intro + ask)',
  applies: (i) => founderEmail(i) && isCold(i),
  run: async (i) => {
    const paras = paragraphs(prose(i.body))
    if (paras.length < 2 || paras.length > 3) {
      return { pass: false, detail: `${paras.length} paragraph(s) — the cold shape is one intro/thesis block + a short ask (+ optional one-line closer).` }
    }
    return { pass: true, detail: `${paras.length} paragraphs — intro + ask${paras.length === 3 ? ' + closer' : ''}.` }
  },
}

const introLengthCheck: StpCheck = {
  id: 'intro-length',
  label: 'Intro block 100–180 words',
  applies: (i) => founderEmail(i) && isCold(i),
  run: async (i) => {
    const n = words(paragraphs(prose(i.body))[0] ?? '')
    if (n < 100 || n > 180) {
      return { pass: false, detail: `Paragraph one runs ${n} words — the profile's wall is 100–180.` }
    }
    return { pass: true, detail: `Paragraph one runs ${n} words.` }
  },
}

const askQuestionCheck: StpCheck = {
  id: 'ask-question',
  label: 'The ask is a question',
  applies: (i) => founderEmail(i) && isCold(i),
  run: async (i) => {
    const paras = paragraphs(prose(i.body))
    const ask = paras.slice(1).join(' ')
    return ask.includes('?')
      ? { pass: true, detail: 'The ask lands as a direct question.' }
      : { pass: false, detail: 'No question mark after the intro — the ask must be asked.' }
  },
}

// Phrases the profile bans outright. "Circle back", "hope this note finds
// you well", and "touch base" are deliberately NOT here — they are the voice.
const BANNED_PHRASES = [
  'dear ',
  'best regards',
  'sincerely',
  'email finds you well', // it's always "note", never "email"
  'per my last email',
  'gentle reminder',
  'bumping this',
  'at your earliest convenience',
  'synergies',
  "i'd welcome the opportunity",
  'are you the right person',
  'calendly',
]

const bannedPhrasesCheck: StpCheck = {
  id: 'banned-phrases',
  label: 'No corporate-AI phrasing',
  applies: founderEmail,
  run: async (i) => {
    const hay = `${i.subject ?? ''}\n${i.body}`.toLowerCase()
    const hits = BANNED_PHRASES.filter((p) => hay.includes(p))
    return hits.length === 0
      ? { pass: true, detail: 'Clear of the banned list.' }
      : { pass: false, detail: `Banned phrase(s): ${hits.map((h) => `"${h.trim()}"`).join(', ')}.` }
  },
}

const punctuationCheck: StpCheck = {
  id: 'punctuation',
  label: 'No em dashes or semicolons',
  applies: founderEmail,
  run: async (i) => {
    const hay = `${i.subject ?? ''}\n${i.body}`
    const emDash = hay.includes('—')
    const semi = i.body.includes(';')
    if (!emDash && !semi) return { pass: true, detail: 'Spaced hyphens only — no em dashes, no semicolons.' }
    const found = [emDash ? 'an em dash' : null, semi ? 'a semicolon' : null].filter(Boolean).join(' and ')
    return { pass: false, detail: `The draft carries ${found} — the voice uses spaced hyphens and never semicolons.` }
  },
}

const minuteQuantifierCheck: StpCheck = {
  id: 'no-minutes',
  label: 'Meeting length never quantified',
  applies: founderEmail,
  run: async (i) => {
    const m = i.body.match(/\b\d+[- ]?minutes?\b/i)
    return m
      ? { pass: false, detail: `"${m[0]}" — it's "quick call" or "coffee", never a minute count.` }
      : { pass: true, detail: 'No minute-counted ask.' }
  },
}

const placeholderCheck: StpCheck = {
  id: 'no-placeholders',
  label: 'No unfilled placeholders',
  applies: founderEmail,
  run: async (i) => {
    const hay = `${i.subject ?? ''}\n${i.body}`
    const m = hay.match(/\{\{[^}]*\}\}|\[(?:first|name|company|founder)[^\]]*\]/i)
    return m
      ? { pass: false, detail: `Unfilled placeholder in the draft: "${m[0]}".` }
      : { pass: true, detail: 'No template placeholders survive.' }
  },
}

const explicitOutCheck: StpCheck = {
  id: 'no-explicit-out',
  label: 'No explicit out',
  applies: (i) => founderEmail(i) && isCold(i),
  run: async (i) => {
    const hay = i.body.toLowerCase()
    const hit = ['no worries if not', 'feel free to ignore', 'if not, no problem', 'totally fine if not'].find((p) =>
      hay.includes(p)
    )
    return hit
      ? { pass: false, detail: `"${hit}" — the voice softens with empathy, never hands the reader an out.` }
      : { pass: true, detail: 'No explicit out offered.' }
  },
}

// The registry. Order is display order — and the OG sheet's column order.
export const STP_CHECKS: StpCheck[] = [
  founderNameCheck,
  subjectFormatCheck,
  greetingFormatCheck,
  signoffCheck,
  coldStructureCheck,
  introLengthCheck,
  askQuestionCheck,
  bannedPhrasesCheck,
  punctuationCheck,
  minuteQuantifierCheck,
  placeholderCheck,
  explicitOutCheck,
]

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
