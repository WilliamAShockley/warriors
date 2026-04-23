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
  passed: 'Passed',
}

export const ACTIVITY_TYPES = ['meeting', 'email', 'call', 'note', 'research', 'intro']
