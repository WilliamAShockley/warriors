import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Horizon OS' }

export default function HorizonLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#0d0f12] text-[#d6d8dd]"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
    >
      <nav className="flex items-center gap-5 border-b border-[#22262c] px-4 py-2 text-[13px] shrink-0">
        <span className="text-[#e8b04b] font-semibold tracking-wide">HORIZON&nbsp;OS</span>
        <Link href="/horizon" className="text-[#9aa0ab] hover:text-[#e6e8ec]">console</Link>
        <Link href="/horizon/missions" className="text-[#9aa0ab] hover:text-[#e6e8ec]">missions</Link>
        <Link href="/horizon/approvals" className="text-[#9aa0ab] hover:text-[#e6e8ec]">approvals</Link>
        <span className="ml-auto text-[#565c66] text-[11px]">operator console</span>
      </nav>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
