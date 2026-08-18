/**
 * Horizon OS seed — default firm/workspace scope plus fake people and one
 * fake campaign/mission for exercising the pipeline locally.
 *
 * Idempotent: safe to re-run. Run with:
 *   npx tsx scripts/seed-horizon.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const FAKE_PEOPLE = [
  { name: 'Ada Okafor', email: 'ada@ledgerline.dev', linkedinUrl: 'https://www.linkedin.com/in/ada-okafor-fake', currentRole: 'CEO', currentCompany: 'Ledgerline', tags: ['fintech-infra', 'founder'] },
  { name: 'Boris Lindqvist', email: 'boris@railgun.finance', linkedinUrl: 'https://www.linkedin.com/in/boris-lindqvist-fake', currentRole: 'Co-founder', currentCompany: 'Railgun', tags: ['fintech-infra', 'founder'] },
  { name: 'Carmen Reyes', email: 'carmen@stackwire.io', linkedinUrl: 'https://www.linkedin.com/in/carmen-reyes-fake', currentRole: 'CTO', currentCompany: 'Stackwire', tags: ['fintech-infra', 'founder'] },
  { name: 'Dmitri Antonov', email: 'dmitri@clearrail.com', linkedinUrl: 'https://www.linkedin.com/in/dmitri-antonov-fake', currentRole: 'CEO', currentCompany: 'ClearRail', tags: ['payments', 'founder'] },
  { name: 'Esi Mensah', email: 'esi@vaultbridge.co', linkedinUrl: 'https://www.linkedin.com/in/esi-mensah-fake', currentRole: 'Founder', currentCompany: 'Vaultbridge', tags: ['fintech-infra', 'founder'] },
  { name: 'Farid Haddad', email: 'farid@meshpay.dev', linkedinUrl: 'https://www.linkedin.com/in/farid-haddad-fake', currentRole: 'CEO', currentCompany: 'Meshpay', tags: ['payments', 'founder'] },
  { name: 'Greta Voss', email: 'greta@quorumledger.com', linkedinUrl: 'https://www.linkedin.com/in/greta-voss-fake', currentRole: 'Co-founder', currentCompany: 'Quorum Ledger', tags: ['fintech-infra', 'founder'] },
  { name: 'Hiro Tanaka', email: 'hiro@finloom.jp', linkedinUrl: 'https://www.linkedin.com/in/hiro-tanaka-fake', currentRole: 'CEO', currentCompany: 'Finloom', tags: ['fintech-infra', 'founder'] },
  { name: 'Imani Walker', email: 'imani@driftbank.dev', linkedinUrl: 'https://www.linkedin.com/in/imani-walker-fake', currentRole: 'Founder', currentCompany: 'Driftbank', tags: ['banking', 'founder'] },
  { name: 'Jonas Berg', email: 'jonas@keelcapital.io', linkedinUrl: 'https://www.linkedin.com/in/jonas-berg-fake', currentRole: 'CEO', currentCompany: 'Keel Capital', tags: ['fintech-infra', 'founder', 'do-not-contact-example'] },
]

async function main() {
  // 1. Default firm + workspace (the minimal scoping layer)
  let firm = await db.firm.findFirst()
  if (!firm) firm = await db.firm.create({ data: { name: 'Nazare' } })

  let workspace = await db.workspace.findFirst({ where: { firmId: firm.id } })
  if (!workspace) {
    workspace = await db.workspace.create({ data: { firmId: firm.id, name: 'Main desk' } })
  }
  // A second workspace of the same firm, to demonstrate the shared person graph
  const second = await db.workspace.findFirst({ where: { firmId: firm.id, name: 'Second desk' } })
  if (!second) await db.workspace.create({ data: { firmId: firm.id, name: 'Second desk' } })

  console.log(`firm=${firm.id} workspace=${workspace.id}`)

  // 2. Fake people, deduped on email
  for (const p of FAKE_PEOPLE) {
    const existing = await db.person.findFirst({ where: { email: p.email } })
    if (existing) {
      await db.person.update({ where: { id: existing.id }, data: { firmId: firm.id } })
      continue
    }
    await db.person.create({
      data: {
        name: p.name,
        email: p.email,
        linkedinUrl: p.linkedinUrl,
        currentRole: p.currentRole,
        currentCompany: p.currentCompany,
        tags: p.tags,
        firmId: firm.id,
        sourceType: 'horizon_seed',
        status: p.tags.includes('do-not-contact-example') ? 'do-not-contact' : 'active',
        enrichment: {
          source: 'seed',
          fetchedAt: new Date().toISOString(),
          fields: { role: p.currentRole, company: p.currentCompany },
        },
      },
    })
  }
  console.log(`people: ${FAKE_PEOPLE.length} ensured`)

  // 3. One fake campaign + mission in draft, for poking at the UI
  let campaign = await db.campaign.findFirst({ where: { name: 'Seed: Project Spear (fake)' } })
  if (!campaign) {
    campaign = await db.campaign.create({
      data: {
        workspaceId: workspace.id,
        name: 'Seed: Project Spear (fake)',
        hypothesis: 'Fintech infra founders respond to thesis-first cold outreach.',
        icpDefinition: { criteria: { tags: ['fintech-infra'] }, exclusions: { recontactDays: 90, excludeTags: ['portfolio'] } },
        messageStrategy: 'Lead with the Project Spear thesis, one concrete observation about their company, one ask: a 20-minute call.',
        sequence: [
          { channel: 'email', delayDays: 0, template: 'intro' },
          { channel: 'linkedin', delayDays: 3, template: 'nudge' },
          { channel: 'email', delayDays: 7, template: 'breakup' },
        ],
        status: 'draft',
      },
    })
    const mission = await db.mission.create({
      data: {
        workspaceId: workspace.id,
        type: 'outreach_campaign',
        title: 'Seed: Project Spear outreach (fake)',
        instruction: 'Cold outreach to ~10 fake fintech infra founders to test the Project Spear hypothesis.',
        campaignId: campaign.id,
        status: 'created',
        createdBy: 'seed',
      },
    })
    await db.missionEvent.create({
      data: { missionId: mission.id, kind: 'status-change', actor: 'system', payload: { to: 'created', note: 'seeded for local dev' } },
    })
    console.log(`campaign=${campaign.id} mission=${mission.id}`)
  } else {
    console.log(`campaign already seeded: ${campaign.id}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
