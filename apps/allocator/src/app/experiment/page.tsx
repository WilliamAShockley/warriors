import ExperimentRoom from '@/components/ExperimentRoom'

export default function ExperimentPage() {
  return (
    <main className="pt-14">
      <header>
        <p className="eyebrow">Review</p>
        <h1 className="mt-2 font-serif text-[32px] font-semibold leading-none tracking-tight">
          The Experiment
        </h1>
        <p className="dek mt-2">
          Every cold email, drafted both ways — with your context and without. Pick the better one;
          the desk keeps score.
        </p>
      </header>

      <div className="rule-masthead mt-6" />

      <ExperimentRoom />
    </main>
  )
}
