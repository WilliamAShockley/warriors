'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckSquare, Crosshair, FolderKanban, Sunrise } from 'lucide-react'
import TodosSection from './TodosSection'
import NeedToDoSection from './NeedToDoSection'
import ProjectsSection from './ProjectsSection'
import MorningReportSection from './MorningReportSection'

type Section = 'report' | 'todos' | 'needtodo' | 'projects'

const NAV_ITEMS: { id: Section; label: string; icon: typeof CheckSquare }[] = [
  { id: 'report', label: 'Morning Report', icon: Sunrise },
  { id: 'todos', label: "To-Do's", icon: CheckSquare },
  { id: 'needtodo', label: 'Need to Do', icon: Crosshair },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
]

export default function TodosPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<Section>('report')

  return (
    <div className="min-h-screen bg-[#F7F6F3]">
      <header className="px-10 pt-12 pb-6">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-[#888884] hover:text-[#1A1A1A] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Home
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1A1A1A]">To-Do</h1>
      </header>

      <main className="px-10 pb-16">
        <div className="flex gap-6 max-w-4xl">
          {/* Sidebar */}
          <div className="w-48 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-[#E8E7E3] overflow-hidden sticky top-8">
              <div className="p-3 border-b border-[#E8E7E3]">
                <span className="text-xs font-medium text-[#888884] uppercase tracking-wide">
                  Sections
                </span>
              </div>
              <div className="p-1">
                {NAV_ITEMS.map(item => {
                  const Icon = item.icon
                  const isActive = activeSection === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                        isActive
                          ? 'bg-[#F7F6F3] text-[#1A1A1A] font-medium'
                          : 'text-[#888884] hover:bg-[#F7F6F3] hover:text-[#1A1A1A]'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeSection === 'report' && <MorningReportSection />}
            {activeSection === 'todos' && <TodosSection />}
            {activeSection === 'needtodo' && <NeedToDoSection />}
            {activeSection === 'projects' && <ProjectsSection />}
          </div>
        </div>
      </main>
    </div>
  )
}
