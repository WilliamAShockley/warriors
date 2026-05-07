import { NextResponse } from 'next/server'
import Parallel from 'parallel-web'

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  try {
    const client = new Parallel({ apiKey: process.env.PARALLEL_API_KEY! })

    const taskRun = await client.taskRun.create({
      input: `Can you tell me who the founder of ${url} is?`,
      processor: 'core-fast',
      task_spec: {
        input_schema: { type: 'text', description: 'The user request to execute.' },
        output_schema: { type: 'text', description: 'Return a helpful final answer in clear markdown that addresses the user request.' },
      },
    })

    const runResult = await client.taskRun.result(taskRun.run_id)
    return NextResponse.json({ output: runResult.output, run_id: taskRun.run_id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
