import Link from 'next/link'
import WorkingPapers from '@/components/WorkingPapers'

export default async function ApolloTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <main className="pt-14">
      <Link href="/" className="eyebrow underline decoration-hairline underline-offset-4">
        ← Apollo
      </Link>
      <WorkingPapers id={id} />
    </main>
  )
}
