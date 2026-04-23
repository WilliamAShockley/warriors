import { redirect } from 'next/navigation'
import { getAuthUrl } from '@/lib/gmail'

export async function GET() {
  const url = getAuthUrl()
  redirect(url)
}
