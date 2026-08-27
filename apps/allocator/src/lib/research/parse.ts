import type { ResearchFields } from './types'

// Pull the contract JSON out of an engine's reply. The charge says "end
// with ONLY this JSON", but foreign engines editorialize — so try the
// last object that names our first field before falling back to the
// greedy first-to-last-brace match.
export async function parseFields(text: string): Promise<ResearchFields> {
  const { parseLLMJsonObject } = await import('../retry')
  const marker = text.lastIndexOf('"founderFirstName"')
  if (marker !== -1) {
    const start = text.lastIndexOf('{', marker)
    if (start !== -1) {
      const tail = text.slice(start)
      const end = tail.indexOf('}')
      // Objects in this contract are flat — the first closing brace ends it.
      if (end !== -1) {
        try {
          return JSON.parse(tail.slice(0, end + 1))
        } catch {}
      }
    }
  }
  return parseLLMJsonObject<ResearchFields>(text, {})
}
