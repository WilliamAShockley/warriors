'use client'

import { useRouter } from 'next/navigation'
import { Target, BookOpen, Newspaper, Archive, Settings, Wand2, Star, LinkIcon } from 'lucide-react'

const sections = [
  {
    id: 'targets',
    label: 'Targets',
    icon: Target,
    description: 'Companies and contacts you are actively pursuing',
    href: '/targets',
    active: true,
  },
  {
    id: 'research',
    label: 'Research',
    icon: BookOpen,
    description: 'Auto-generated company briefs for every target',
    href: '/research',
    active: true,
  },
  {
    id: 'news',
    label: 'News',
    icon: Newspaper,
    description: 'Live news feed for every company you are tracking',
    href: '/news',
    active: true,
  },
  {
    id: 'content',
    label: 'Content',
    icon: LinkIcon,
    description: 'Interesting links and resources you find on the internet',
    href: '/content',
    active: true,
  },
  {
    id: 'top-companies',
    label: 'Top Companies',
    icon: Star,
    description: 'Your ranked list of the top 10 companies you are most excited about',
    href: '/top-companies',
    active: true,
  },
  {
    id: 'repo',
    label: 'Repo',
    icon: Archive,
    description: 'Documents, decks, and reference materials',
    href: '/repo',
    active: false,
  },
]

export default function Home() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      <header className="relative px-10 pt-12 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">Warriors</h1>
        <p className="text-sm text-[#888884] mt-1">Your VC workflow hub</p>
        <button
          onClick={() => router.push('/settings')}
          className="absolute top-10 right-10 p-2 rounded-lg hover:bg-black/5 transition-colors"
        >
          <Settings size={16} className="text-[#888884]" />
        </button>
      </header>

      <main className="flex-1 px-10 pb-10 space-y-4">
        <div className="grid grid-cols-2 gap-4 max-w-3xl">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.id}
                onClick={() => section.active && router.push(section.href)}
                className={[
                  'group relative text-left p-6 rounded-2xl border transition-all duration-150',
                  section.active
                    ? 'bg-white border-[#E8E7E3] hover:border-[#C8C7C3] hover:shadow-sm cursor-pointer'
                    : 'bg-white border-[#E8E7E3] opacity-40 cursor-not-allowed',
                ].join(' ')}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#F7F6F3] flex items-center justify-center">
                    <Icon size={16} className="text-[#1A1A1A]" />
                  </div>
                  <span className="font-medium text-[#1A1A1A]">{section.label}</span>
                  {!section.active && (
                    <span className="ml-auto text-xs text-[#888884] font-normal">Coming soon</span>
                  )}
                </div>
                <p className="text-sm text-[#888884] leading-snug">{section.description}</p>
              </button>
            )
          })}
        </div>

        {/* Adapt — meta section */}
        <div className="max-w-3xl">
          <button
            onClick={() => router.push('/adapt')}
            className="w-full text-left p-6 rounded-2xl border border-dashed border-[#C8C7C3] hover:border-[#888884] hover:bg-white/50 transition-all duration-150 group"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#F0EFE9] flex items-center justify-center">
                <Wand2 size={16} className="text-[#888884] group-hover:text-[#1A1A1A] transition-colors" />
              </div>
              <span className="font-medium text-[#888884] group-hover:text-[#1A1A1A] transition-colors">Adapt</span>
            </div>
            <p className="text-sm text-[#B0AFAB] group-hover:text-[#888884] transition-colors leading-snug">
              Modify this app in plain language — describe a feature and it gets built in real time
            </p>
          </button>
        </div>
      </main>
    </div>
  )
}