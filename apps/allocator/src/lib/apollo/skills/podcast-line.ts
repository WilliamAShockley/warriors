import { anthropic } from '../../claude'

// The podcast context line: turns gathered company context into the
// thesis-oriented phrase that anchors a podcast invitation. The system
// prompt is the reader's own, verbatim — editable from Settings.
// Runs on the skill model (opus-tier): this is the reasoning-heavy step
// where the quality of the invitation is actually decided.
const SKILL_MODEL = process.env.APOLLO_SKILL_MODEL || process.env.APOLLO_MODEL || 'claude-opus-4-8'

export const PODCAST_LINE_SYSTEM = `Podcast Outreach — Thesis-Oriented Context Line Generator

You are helping me write cold outreach to founders inviting them onto my podcast. I will provide context on a company (funding announcement, launch coverage, memo notes, etc.). Your job is to produce a 1–2 sentence phrase that slots into this sentence:
"I think a ton of people would love to hear more about [insert relevant context], and just in general how you're thinking about the business."
Follow this reasoning process before writing anything:
    1    Strip the press-release framing. Ignore the marketing language, the round size, the investor list, and the headline metric. Every congrats-tweet will repeat these. Ask instead: what is the underlying architectural, structural, or strategic claim beneath the framing?
    2    Identify the mechanism, not the consequence. Headline metrics (cost savings, growth rates, efficiency multiples) are consequences of a deeper decision. Find the mechanism that produces the number. Lead with the cause, not the effect — this implicitly signals "I understand why your number is what it is."
    3    Name the consensus being bet against. Every interesting company is a bet against a default approach the rest of the market takes for granted. Identify what the consensus alternative is, and frame the company's choice as a decision made against it. Founders — especially research or technical founders — respond to questions about the contrarian decision far more than to compliments about their round, partners, or trajectory.
    4    Anchor to the timing driver. Answer "why is this a company now and not a feature or a paper?" Tie the mechanism to the market shift that makes it matter at this moment. One short clause is enough.
    5    Calibrate to the founder. If the founder is a researcher or deeply technical, lean into the technical wedge. If the founder is a commercial operator, lean into the market-structure or go-to-market decision. The question should be one they'd genuinely want to answer on air.
Output format:
    •    Produce 2–3 options, each 1–2 sentences max, each written to slot grammatically into the sentence above.
    •    Option 1 should be the mechanism-forward version (the default recommendation).
    •    Label the others by their angle (e.g., cost angle, research-to-company arc, market timing).
    •    After the options, add one line explaining which option to use and why, based on the founder's profile.
Quality bar: Each option should read as a question a real counterparty would ask — someone who has done the work — not a round-chaser summarizing the announcement. If a line could have been written by someone who only read the headline, discard it.`

export const podcastLineSkill = {
  id: 'podcast-context-line',
  label: 'Podcast context line',
  description:
    'Turns gathered company context into the thesis-oriented phrase that anchors a podcast invitation — mechanism over metric, the consensus being bet against, the timing driver. Edit it here and the next invitation follows it.',
  whenToUse:
    'when drafting a podcast invitation — after gathering context, this produces the line for "I think a ton of people would love to hear more about […]"',
  defaultPrompt: PODCAST_LINE_SYSTEM,
} as const

export type PodcastLineInput = {
  company: string
  founder?: string
  // Everything gathered: the Register entry, research findings, thread facts.
  context: string
}

// Run the skill: returns the full output — 2-3 labeled options plus the
// one-line recommendation — for Apollo to choose from.
export async function generatePodcastLine(input: PodcastLineInput): Promise<string> {
  const { getSkillPrompt } = await import('./store')
  const system = await getSkillPrompt('podcast-context-line', PODCAST_LINE_SYSTEM)

  const user = `Company: ${input.company}${input.founder ? `\nFounder: ${input.founder}` : ''}

Here is the company context:
${input.context.trim() || '(no context was gathered — say plainly that the context is too thin for a thesis-oriented line, and produce the best honest option available)'}`

  const response = await anthropic.messages.create({
    model: SKILL_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: user }],
  } as any)

  return (response.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}
