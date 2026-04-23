import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function generateTargetSummary(target: {
  name: string
  company: string
  stage: string
  lastContacted: Date | null
  notes: string | null
  activities: { type: string; description: string; date: Date }[]
}): Promise<string> {
  const activitiesText =
    target.activities.length > 0
      ? target.activities
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map((a) => `- [${a.type.toUpperCase()}] ${new Date(a.date).toLocaleDateString()}: ${a.description}`)
          .join('\n')
      : 'No activity logged yet.'

  const prompt = `You are an assistant to a venture capitalist. Based on the following information about a target contact, write a concise, actionable briefing (3-5 sentences max). Focus on where things stand and the most important next step. Be direct and specific — avoid filler language.

Contact: ${target.name} at ${target.company}
Stage: ${target.stage.replace(/_/g, ' ')}
Last Contacted: ${target.lastContacted ? new Date(target.lastContacted).toLocaleDateString() : 'Not yet'}
Notes: ${target.notes || 'None'}

Activity Log:
${activitiesText}

Write the briefing now:`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  return content.type === 'text' ? content.text : ''
}

export async function generateNextStep(target: {
  name: string
  company: string
  stage: string
  lastContacted: Date | null
  notes: string | null
  activities: { type: string; description: string; date: Date }[]
}): Promise<string> {
  const activitiesText =
    target.activities.length > 0
      ? target.activities
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 10)
          .map((a) => `- [${a.type.toUpperCase()}] ${new Date(a.date).toLocaleDateString()}: ${a.description}`)
          .join('\n')
      : 'No activity yet.'

  const daysSinceContact = target.lastContacted
    ? Math.floor((Date.now() - new Date(target.lastContacted).getTime()) / 86400000)
    : null

  const prompt = `You are an assistant to a venture capitalist tracking potential investments. Based on this contact's history, write a single sentence (max 12 words) that tells the VC exactly what to do next. Be specific and action-oriented. Bias toward re-engagement — these are high-value targets and momentum matters.

Contact: ${target.name} at ${target.company}
Stage: ${target.stage.replace(/_/g, ' ')}
Days since last contact: ${daysSinceContact !== null ? daysSinceContact : 'never contacted'}
Notes: ${target.notes || 'None'}

Recent activity:
${activitiesText}

One-sentence next step (no quotes, no filler, just the action):`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  return content.type === 'text' ? content.text.trim() : ''
}
