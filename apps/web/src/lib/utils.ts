import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STAGES: Record<string, string> = {
  intro_sent: 'Intro Sent',
  meeting_scheduled: 'Meeting Scheduled',
  follow_up: 'Follow Up',
  active: 'Active',
  outreach: 'Outreach',
  passed: 'Passed',
}

export const ACTIVITY_TYPES = ['meeting', 'email', 'call', 'note', 'research', 'intro']

export function getEffectiveStatus(
  status: string,
  lastContacted: string | null,
  lastActivityDate: string | null,
): string {
  const lastDate = lastActivityDate ?? lastContacted
  if (!lastDate) return status
  const daysSince = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince > 21) return 'red'
  if (daysSince > 7) return 'yellow'
  return 'green'
}
