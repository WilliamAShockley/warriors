import { contacts, deals, theses, notes, thesisBySlug, dealById } from './data'

export type BriefingSection = { label: string; body: string }
export type Briefing = {
  title: string
  dateline: string
  sections: BriefingSection[]
}

const norm = (s: string) => s.toLowerCase()

// First sentence, split on sentence boundaries only (". " not "."),
// so figures like $1.5m survive intact.
const firstSentence = (s: string) => {
  const idx = s.indexOf('. ')
  return idx === -1 ? s : s.slice(0, idx + 1)
}

// The prototype Analyst answers from filed context only: it matches the query
// against the Book, the pipeline, and the theses, then composes a briefing.
export function askAnalyst(query: string): Briefing {
  const q = norm(query)

  const contact = contacts.find(
    (c) => q.includes(norm(c.name.split(' ')[0])) || q.includes(norm(c.name)) || q.includes(norm(c.firm))
  )
  if (contact) {
    const linkedNotes = notes.filter((n) => contact.noteIds.includes(n.id))
    const linkedDeals = contact.dealIds.map((id) => dealById(id)).filter(Boolean)
    const sections: BriefingSection[] = [
      { label: 'Who', body: `${contact.name} — ${contact.role}, ${contact.firm}. ${contact.location}. Last touch ${contact.lastTouch}.` },
      { label: 'The relationship', body: contact.relationship },
    ]
    if (linkedDeals.length)
      sections.push({
        label: 'Live exposure',
        body: linkedDeals.map((d) => `${d!.name} — ${d!.stage}.`).join(' '),
      })
    if (linkedNotes.length)
      sections.push({
        label: 'From your notes',
        body: linkedNotes.map((n) => `“${n.title}” (${n.date}): ${firstSentence(n.body)}`).join(' '),
      })
    if (contact.followUp) sections.push({ label: 'The open item', body: contact.followUp })
    return {
      title: `On ${contact.name}`,
      dateline: 'Prepared from the Book and filed notes',
      sections,
    }
  }

  const deal = deals.find((d) => q.includes(norm(d.name)) || q.includes(norm(d.id)))
  if (deal) {
    const t = thesisBySlug(deal.thesis)
    const dealNotes = notes.filter((n) => n.links.some((l) => l.type === 'deal' && l.ref === deal.id))
    const people = contacts.filter((c) => c.dealIds.includes(deal.id))
    return {
      title: `On ${deal.name}`,
      dateline: 'Prepared from the pipeline, the Book, and the thesis feed',
      sections: [
        { label: 'Position', body: `${deal.oneLiner} Currently: ${deal.stage}.` },
        ...(t ? [{ label: 'Thesis frame', body: t.stance }] : []),
        ...(people.length
          ? [{ label: 'Who matters', body: people.map((c) => `${c.name} (${c.firm}) — ${c.context}`).join(' ') }]
          : []),
        ...(dealNotes.length
          ? [{ label: 'Latest filed view', body: `“${dealNotes[0].title}” — ${dealNotes[0].body}` }]
          : []),
      ],
    }
  }

  const thesis = theses.find((t) => q.includes(norm(t.chip)) || q.includes(norm(t.name)) || t.slug.split('-').some((w) => w.length > 4 && q.includes(w)))
  if (thesis) {
    return {
      title: thesis.name,
      dateline: `Running synthesis · updated ${thesis.updated}`,
      sections: [
        { label: 'The stance', body: thesis.stance },
        { label: 'Where it stands', body: thesis.summary[0] },
        {
          label: 'New since you last read',
          body: thesis.developments.map((d) => `${d.title} (${d.date}).`).join(' '),
        },
        { label: 'Memo', body: `${thesis.memo.title} — ${thesis.memo.updated.toLowerCase()}. Open it from Research.` },
      ],
    }
  }

  if (q.includes('today') || q.includes('morning') || q.includes('week')) {
    return {
      title: 'The shape of the week',
      dateline: 'Prepared from the Brief and open items',
      sections: [
        { label: 'The decision', body: 'Osprey: Ana’s term sheet expires Friday and Jonah’s split-lead proposal needs an answer first. Everything else can wait a day; this cannot.' },
        { label: 'Commitments', body: 'Marguerite Chen was promised SPV II fee terms this week — Gene returns docs Wednesday. Keyring’s fraud data lands Thursday; hold pricing until then.' },
        { label: 'Watch', body: 'Circle’s treasury console reshapes the stablecoin thesis at the top of the market. The mid-market case strengthens; the memo needs a revision this weekend.' },
      ],
    }
  }

  return {
    title: 'Nothing filed under that yet',
    dateline: 'The Analyst answers from your own record',
    sections: [
      {
        label: 'Suggestion',
        body: 'Try a name from the Book, a pipeline company, or a thesis — “Prep me for my call with Marguerite,” “What do I know about Osprey?”, “Where does account abstraction stand?”',
      },
    ],
  }
}

export const suggestedQueries = [
  'Prep me for my call with Marguerite Chen',
  'What do I know about Osprey Treasury?',
  'Where does account abstraction stand?',
  'What matters this week?',
]
