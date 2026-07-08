import Docket from '@/components/Docket'

export default function TodosPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">To Do</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Docket
        </h1>
        <p className="dek mt-2">Commitments, kept.</p>
      </header>

      <Docket />
    </main>
  )
}
