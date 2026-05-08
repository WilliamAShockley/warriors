import { NextResponse } from 'next/server'
import Parallel from 'parallel-web'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const requestPayload = {
    input: `Can you tell me who the founder of ${cleanUrl} is?`,
    processor: 'core-fast' as const,
    task_spec: {
      input_schema: { type: 'text' as const, description: 'The user request to execute.' },
      output_schema: { type: 'text' as const, description: 'Return a helpful final answer in clear markdown that addresses the user request.' },
    },
  }

  try {
    const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })

    const taskRun = await client.taskRun.create(requestPayload)
    const runResult = await client.taskRun.result(taskRun.run_id)

    const output = (runResult.output as any)?.content ?? JSON.stringify(runResult.output, null, 2)
    const confidence: string = (runResult.output as any)?.basis?.[0]?.confidence ?? 'unknown'
    return NextResponse.json({ output, confidence, run_id: taskRun.run_id, _request: requestPayload, _response: runResult })
  } catch (e) {
    return NextResponse.json({ error: String(e), _request: requestPayload }, { status: 500 })
  }
}
