import { contacts as seedContacts, type Segment } from '../data'
import { listTodos, createTodo } from '../todos'
import { listDbContacts, createContact } from '../book'
import { listDbTheses, getDbThesis } from '../theses'
import { listMargin, createMargin } from '../margin'
import type { ApolloStep } from './store'

const hasDb = () => Boolean(process.env.DATABASE_URL)

async function getDb() {
  const { db } = await import('../db')
  return db
}

// Tool definitions — prescriptive descriptions (when to call, not just what it does).
export const APOLLO_TOOL_DEFS = [
  {
    name: 'read_docket',
    description:
      'Read the reader’s open to-dos (the Docket), including today’s cleared items. Call this whenever the task touches commitments, follow-ups, or what the reader owes people.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'read_book',
    description:
      'List everyone in the reader’s relationship book (LPs, founders, co-investors, advisors) with one-line context. Call this to find who is relevant before reading a specific contact.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'read_contact',
    description:
      'Read one contact’s full record: relationship history, the open follow-up, the intro path. Call this when a task names a person or when read_book surfaced someone relevant.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_or_id: { type: 'string', description: 'Contact name (or part of it) or id' },
      },
      required: ['name_or_id'],
    },
  },
  {
    name: 'read_theses',
    description:
      'List the reader’s active research theses with stance and charter. Call this when the task touches markets, deals, or anything the reader might already have a view on.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'read_margin',
    description:
      'Read the reader’s recent margin notes — freeform thinking and things learned, newest first. Call this to understand what has been on the reader’s mind lately.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'read_calendar',
    description:
      'Read upcoming calendar events. Call this whenever the task involves scheduling, preparation, or the shape of the reader’s week.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_ahead: { type: 'integer', description: 'How many days forward to read (default 7, max 30)' },
      },
    },
  },
  {
    name: 'read_meeting_notes',
    description:
      'Read recent meeting notes (Granola summaries with attendees). Call this for “last time we spoke” context on people or companies.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Optional substring to match against title or attendees' },
      },
    },
  },
  {
    name: 'add_todo',
    description:
      'File a to-do on the reader’s Docket. Call this when the task’s outcome includes a commitment the reader should act on. Keep text short and imperative; meta is an optional small-caps context line. New items file under Today and age into later buckets on their own.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string' },
        meta: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'add_contact',
    description:
      'Add a person to the reader’s Book. Call this only when the task surfaced a genuinely new, relevant person — never duplicate someone already in read_book.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        role: { type: 'string' },
        firm: { type: 'string' },
        segment: { type: 'string', enum: ['LPs', 'Founders', 'Co-investors', 'Advisors'] },
        context: { type: 'string', description: 'One editorial line on why they matter' },
      },
      required: ['name', 'role', 'firm', 'segment', 'context'],
    },
  },
  {
    name: 'file_margin_note',
    description:
      'File a note in the reader’s Margin — for a finding worth retaining that is not an action item. It returns to the reader as a morning recall cue.',
    input_schema: {
      type: 'object' as const,
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
]

export type ToolExecution = {
  output: string
  step: Omit<ApolloStep, 't'>
  isError?: boolean
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export async function executeApolloTool(name: string, input: any): Promise<ToolExecution> {
  try {
    switch (name) {
      case 'read_docket': {
        const { todos } = await listTodos()
        return {
          output: JSON.stringify(todos),
          step: { kind: 'tool', name: 'Read the docket', detail: `${todos.filter((t) => t.status === 'open').length} open` },
        }
      }

      case 'read_book': {
        const { contacts: dbContacts } = await listDbContacts()
        const all = [
          ...seedContacts.map((c) => ({ id: c.id, name: c.name, role: c.role, firm: c.firm, segment: c.segment, context: c.context })),
          ...dbContacts.map((c) => ({ id: c.id, name: c.name, role: c.role, firm: c.firm, segment: c.segment, context: c.context })),
        ]
        return {
          output: JSON.stringify(all),
          step: { kind: 'tool', name: 'Read the Book', detail: `${all.length} relationships` },
        }
      }

      case 'read_contact': {
        const q = String(input?.name_or_id ?? '').toLowerCase()
        const seed = seedContacts.find(
          (c) => c.id === q || c.name.toLowerCase().includes(q)
        )
        if (seed) {
          return {
            output: JSON.stringify(seed),
            step: { kind: 'tool', name: 'Read the Book', detail: seed.name },
          }
        }
        const { contacts: dbContacts } = await listDbContacts()
        const hit = dbContacts.find((c) => c.id === q || c.name.toLowerCase().includes(q))
        return hit
          ? { output: JSON.stringify(hit), step: { kind: 'tool', name: 'Read the Book', detail: hit.name } }
          : { output: 'No contact matched.', step: { kind: 'tool', name: 'Read the Book', detail: `no match · ${clip(q, 40)}` } }
      }

      case 'read_theses': {
        const { live, theses } = await listDbTheses()
        if (live) {
          return {
            output: theses.length
              ? JSON.stringify(theses)
              : 'No active theses. The reader has not filed any yet.',
            step: { kind: 'tool', name: 'Read the theses', detail: `${theses.length} active` },
          }
        }
        const { theses: seedTheses } = await import('../data')
        const compact = seedTheses.map((t) => ({ slug: t.slug, name: t.name, stance: t.stance, summary: t.summary.join(' ') }))
        return {
          output: JSON.stringify(compact),
          step: { kind: 'tool', name: 'Read the theses', detail: `${compact.length} active` },
        }
      }

      case 'read_margin': {
        const { entries } = await listMargin()
        return {
          output: entries.length
            ? JSON.stringify(entries.map((e) => ({ when: e.when, text: e.text })))
            : 'The margin is empty.',
          step: { kind: 'tool', name: 'Read the margin', detail: `${entries.length} entries` },
        }
      }

      case 'read_calendar': {
        if (!hasDb()) return { output: 'Calendar not connected.', step: { kind: 'tool', name: 'Read the calendar', detail: 'not connected' } }
        const days = Math.min(Number(input?.days_ahead) || 7, 30)
        const db = await getDb()
        const now = new Date()
        const events = await db.calendarEvent.findMany({
          where: { start: { gte: now, lt: new Date(now.getTime() + days * 24 * 3600 * 1000) } },
          orderBy: { start: 'asc' },
          take: 40,
        })
        return {
          output: JSON.stringify(
            events.map((e) => ({ title: e.title, start: e.start.toISOString(), allDay: e.allDay, location: e.location, attendees: e.attendees ? JSON.parse(e.attendees) : [] }))
          ),
          step: { kind: 'tool', name: 'Read the calendar', detail: `${events.length} events · next ${days} days` },
        }
      }

      case 'read_meeting_notes': {
        if (!hasDb()) return { output: 'Meeting notes not connected.', step: { kind: 'tool', name: 'Read meeting notes', detail: 'not connected' } }
        const db = await getDb()
        const q = input?.query ? String(input.query).toLowerCase() : null
        const rows = await db.meetingNote.findMany({ orderBy: { granolaCreatedAt: 'desc' }, take: 30 })
        const hits = rows.filter(
          (n) => !q || n.title.toLowerCase().includes(q) || (n.attendees ?? '').toLowerCase().includes(q)
        )
        return {
          output: JSON.stringify(
            hits.slice(0, 12).map((n) => ({
              title: n.title,
              date: n.granolaCreatedAt?.toISOString().slice(0, 10) ?? null,
              attendees: n.attendees ? JSON.parse(n.attendees) : [],
              summary: clip(n.summary, 900),
            }))
          ),
          step: { kind: 'tool', name: 'Read meeting notes', detail: q ? `${hits.length} match · ${clip(q, 30)}` : `${hits.length} recent` },
        }
      }

      case 'add_todo': {
        const todo = await createTodo({ text: String(input?.text ?? ''), meta: input?.meta ? String(input.meta) : `Filed by Apollo` })
        return todo
          ? { output: `Filed: ${todo.text} (${todo.group})`, step: { kind: 'write', name: 'Filed a to-do', detail: clip(todo.text, 60) } }
          : { output: 'Could not file the to-do (no database).', step: { kind: 'note', name: 'To-do not filed', detail: 'no database' }, isError: true }
      }

      case 'add_contact': {
        const contact = await createContact({
          name: String(input?.name ?? ''),
          role: String(input?.role ?? ''),
          firm: String(input?.firm ?? ''),
          segment: String(input?.segment ?? 'Advisors') as Segment,
          context: String(input?.context ?? ''),
        })
        return contact
          ? { output: `Added to the Book: ${contact.name} (${contact.segment})`, step: { kind: 'write', name: 'Added to the Book', detail: `${contact.name} · ${contact.firm}` } }
          : { output: 'Could not add the contact (no database).', step: { kind: 'note', name: 'Contact not added', detail: 'no database' }, isError: true }
      }

      case 'file_margin_note': {
        const entry = await createMargin(String(input?.text ?? ''))
        return entry
          ? { output: 'Filed to the margin.', step: { kind: 'write', name: 'Filed a margin note', detail: clip(String(input?.text ?? ''), 60) } }
          : { output: 'Could not file the note.', step: { kind: 'note', name: 'Margin note not filed', detail: 'no database' }, isError: true }
      }

      default:
        return { output: `Unknown tool: ${name}`, step: { kind: 'note', name: 'Unknown tool', detail: name }, isError: true }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { output: `Tool error: ${msg}`, step: { kind: 'note', name: 'Tool error', detail: clip(`${name} · ${msg}`, 80) }, isError: true }
  }
}
