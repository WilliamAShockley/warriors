import NotesFile from '@/components/NotesFile'

export default function NotesPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Notes</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The File
        </h1>
        <p className="dek mt-2">Thought to record, before it gets away.</p>
      </header>

      <NotesFile />
    </main>
  )
}
