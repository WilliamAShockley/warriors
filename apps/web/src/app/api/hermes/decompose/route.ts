import { anthropic } from '@/lib/claude'

export async function POST(req: Request) {
  const { thesis } = await req.json()

  if (!thesis || typeof thesis !== 'string') {
    return Response.json({ error: 'thesis is required' }, { status: 400 })
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `You are a venture capital research analyst. A VC wants to explore the investment thesis: "${thesis}"

Break this thesis down into 4-7 specific, searchable sub-themes that would help discover companies, founders, and deals in this space. Each sub-theme should be:
- Specific enough to produce targeted search results
- Different enough from sibling sub-themes to avoid overlap
- Phrased as a noun phrase (not a question or sentence)

For each sub-theme, provide:
- label: 3-6 word name
- description: 1 sentence explaining what this covers
- searchQueries: 2-3 specific search queries that would find relevant companies/people

Return ONLY valid JSON, no markdown:
[
  {
    "label": "Tokenized Private Credit",
    "description": "Companies building infrastructure for tokenizing private credit instruments on-chain.",
    "searchQueries": ["tokenized private credit blockchain", "on-chain lending protocol infrastructure", "RWA private credit platform"]
  }
]`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    return Response.json({ error: 'Failed to parse LLM response' }, { status: 500 })
  }

  try {
    const subThemes = JSON.parse(jsonMatch[0])
    return Response.json({ thesis, subThemes })
  } catch {
    return Response.json({ error: 'Invalid JSON from LLM' }, { status: 500 })
  }
}
