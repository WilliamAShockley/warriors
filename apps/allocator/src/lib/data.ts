// All content is in-memory mock data for the v1 prototype.

// Configurable for other readers — this is meant to travel.
export const userName = process.env.NEXT_PUBLIC_READER_NAME || 'William'

export type Thesis = {
  slug: string
  name: string
  chip: string
  stance: string
  updated: string
  summary: string[]
  developments: { date: string; title: string; note: string; source: string }[]
  memo: { title: string; updated: string; state: string; excerpt: string }
  sources: { name: string; detail: string }[]
}

export type Deal = {
  id: string
  name: string
  oneLiner: string
  stage: string
  thesis: string
  status: 'live' | 'prospect'
  next: string
}

export type Segment = 'LPs' | 'Founders' | 'Co-investors' | 'Advisors'

export type Contact = {
  id: string
  name: string
  role: string
  firm: string
  segment: Segment
  context: string
  lastTouch: string
  location: string
  relationship: string
  introPath?: string
  followUp?: string
  dealIds: string[]
  noteIds: string[]
}

export type NoteLink =
  | { type: 'deal'; ref: string; label: string }
  | { type: 'thesis'; ref: string; label: string }
  | { type: 'contact'; ref: string; label: string }

export type Note = {
  id: string
  date: string
  title: string
  body: string
  links: NoteLink[]
}

export type BriefItem = {
  eyebrow: string
  headline: string
  dek: string
  source: string
  href?: string
}

// ————————————————————————————————————————————— Theses

export const theses: Thesis[] = [
  {
    slug: 'stablecoin-treasury',
    name: 'Stablecoin treasury infrastructure',
    chip: 'Stablecoin Treasury',
    stance:
      'The winners are not the coins — they are the plumbing firms that make corporate treasurers indifferent to which coin they hold.',
    updated: '6 July 2026',
    summary: [
      'The corporate adoption question is settled; the operational one is not. Every mid-market CFO who has moved a working-capital sleeve on-chain now runs a shadow back office of spreadsheets to handle attestation, yield sweep, and multi-issuer redemption. That back office is the product.',
      'Pricing power sits with whoever owns the reconciliation layer between issuers, custodians, and the ERP. Osprey remains the cleanest expression in the pipeline; the open risk is Circle building the same layer natively and giving it away to defend float.',
    ],
    developments: [
      {
        date: '6 Jul',
        title: 'Circle previews a native treasury console for USDC corporates',
        note: 'Bundled attestation and sweep, free for balances above $25m. Directly crowds the Osprey wedge at the top of the market; the mid-market remains open.',
        source: 'Company announcement',
      },
      {
        date: '3 Jul',
        title: 'Treasury departments now hold $48bn in stablecoins, up 3.1× YoY',
        note: 'The growth is in $50m–$500m revenue companies — precisely the segment too small for a Circle direct relationship.',
        source: 'Artemis / desk synthesis',
      },
      {
        date: '30 Jun',
        title: 'Second US regional bank launches deposit-token rails',
        note: 'Bank tokens fragment the issuer landscape further, which raises the value of issuer-agnostic reconciliation.',
        source: 'American Banker',
      },
    ],
    memo: {
      title: 'The back office is the product',
      updated: 'Draft · revised 5 July',
      state: 'Memo in progress',
      excerpt:
        'If stablecoins are deposits with worse ergonomics, the durable business is the one that sells the ergonomics. This memo argues the reconciliation layer consolidates to one or two firms within 24 months, and that distribution through ERP integrators — not exchanges — decides which…',
    },
    sources: [
      { name: 'Artemis stablecoin flows', detail: 'Weekly corporate-wallet cohort data' },
      { name: 'BIS quarterly review', detail: 'Deposit-token frameworks, Q2 2026' },
      { name: 'Osprey data room', detail: 'Cohort retention and sweep volumes' },
    ],
  },
  {
    slug: 'account-abstraction',
    name: 'ERC-4337 account abstraction',
    chip: 'Account Abstraction',
    stance:
      'Smart accounts turn wallets from consumer products into embedded infrastructure — the fees migrate to whoever runs the paymaster rails.',
    updated: '5 July 2026',
    summary: [
      'Smart-account share of new wallets crossed 40% this quarter, but the interesting number is sponsorship: two-thirds of those transactions are gas-abstracted, paid by an application, not a user. Paymaster spend is now a real, recurring B2B line item.',
      'The trade is unglamorous: bundler and paymaster infrastructure consolidates like payments processing did — scale, uptime, and fraud controls win. Keyring is the pipeline expression; the diligence question is whether their fraud loss ratio holds as volume shifts from games to commerce.',
    ],
    developments: [
      {
        date: '5 Jul',
        title: 'Coinbase Smart Wallet defaults to 4337 for all new retail accounts',
        note: 'The largest consumer on-ramp normalizing smart accounts compresses the education cost for everyone downstream.',
        source: 'Protocol changelog',
      },
      {
        date: '1 Jul',
        title: 'Paymaster sponsorship volume passes $90m/month across major bundlers',
        note: 'Keyring claims 11% share. Verify against Dune before the partner call.',
        source: 'Dune / desk synthesis',
      },
    ],
    memo: {
      title: 'Paymasters as the new merchant acquirers',
      updated: 'Draft · revised 2 July',
      state: 'Memo in progress',
      excerpt:
        'The analogy is imperfect but load-bearing: sponsored transactions are interchange, bundlers are processors, and the fraud problem is chargebacks wearing a new coat. History suggests two winners and thin margins for everyone else…',
    },
    sources: [
      { name: 'Dune 4337 dashboards', detail: 'Bundler share and sponsorship volume' },
      { name: 'EF account-abstraction roadmap', detail: 'Native AA timeline, post-Pectra' },
    ],
  },
  {
    slug: 'onchain-perps',
    name: 'Hyperliquid & on-chain perps',
    chip: 'On-chain Perps',
    stance:
      'Perp DEX market structure is a winner-take-most fee machine; the second-order trade is the tooling and market-making stack around it.',
    updated: '4 July 2026',
    summary: [
      'Hyperliquid holds roughly 60% of on-chain perp volume and prints fees that would flatter a mid-tier exchange. Direct exposure is priced accordingly; the desk view is the venue trade is over and the picks-and-shovels trade is not.',
      'Watch the vault and market-making layer: independent HLP-style vaults, risk tooling for on-chain MMs, and the compliance wrapper that lets a fund allocate to venue-adjacent yield without touching the token.',
    ],
    developments: [
      {
        date: '4 Jul',
        title: 'HIP-4 opens builder-deployed perp markets to third parties',
        note: 'Long-tail listing risk rises; so does the value of independent risk tooling. Vane is positioned exactly here.',
        source: 'Governance forum',
      },
      {
        date: '28 Jun',
        title: 'CME solana perps volume makes on-chain basis trades boring again',
        note: 'Basis compression pushes prop flow toward venue-adjacent yield — supportive of the vault thesis.',
        source: 'Desk synthesis',
      },
    ],
    memo: {
      title: 'After the venue trade',
      updated: 'Draft · revised 29 June',
      state: 'Memo in progress',
      excerpt:
        'Everyone underwrote the exchange; almost no one has underwritten the ecosystem that a dominant exchange creates. This memo maps the fee pools one layer out from the order book…',
    },
    sources: [
      { name: 'Hyperliquid stats', detail: 'Venue volume and HLP performance' },
      { name: 'Vane weekly letter', detail: 'MM risk metrics across venues' },
    ],
  },
  {
    slug: 'behavioral-health',
    name: 'Behavioral-health roll-ups',
    chip: 'Behavioral Health',
    stance:
      'Fragmented outpatient behavioral health supports a disciplined roll-up — if you buy at owner-operator multiples and refuse the platform premium.',
    updated: '2 July 2026',
    summary: [
      'Reimbursement tailwinds are intact and the seller demographics are relentless: a generation of clinic founders is retiring with no succession plan. The arbitrage is buying at 4–6× owner-operator EBITDA and running centralized billing, credentialing, and intake.',
      'The failure mode is well documented — clinical quality decays under absentee ownership and payer audits follow. Bluebonnet’s clinician-equity model is the most credible answer we have seen; the diligence hinges on same-clinic retention after acquisition.',
    ],
    developments: [
      {
        date: '2 Jul',
        title: 'CMS finalizes 3.4% uplift for outpatient behavioral codes',
        note: 'Directly accretive to the Bluebonnet base case; underwriting had assumed flat.',
        source: 'CMS final rule',
      },
      {
        date: '25 Jun',
        title: 'Two PE-backed platforms listed for sale in Texas at 9–11×',
        note: 'Exit comps for the roll-up, and a warning about what the platform premium does to discipline.',
        source: 'Banker teaser',
      },
    ],
    memo: {
      title: 'Owner-operator exits, clinician equity',
      updated: 'Draft · revised 24 June',
      state: 'Memo in progress',
      excerpt:
        'The roll-up graveyard is full of platforms that confused acquisition pace with value creation. The version that works pays clinicians like partners, not like inventory…',
    },
    sources: [
      { name: 'CMS rate files', detail: 'Outpatient behavioral reimbursement' },
      { name: 'Bluebonnet pipeline sheet', detail: '14 clinics under LOI or discussion' },
    ],
  },
  {
    slug: 'gp-economics',
    name: 'Alt-asset GP economics',
    chip: 'GP Economics',
    stance:
      'Emerging-manager economics are quietly the best structured-equity trade in private markets — buy the GP, not the fund.',
    updated: '30 June 2026',
    summary: [
      'GP stakes at the top of the market are priced to perfection, but the sub-$1bn manager segment trades at a fraction of the implied multiple, largely because cheque sizes are too small for the incumbents. That inefficiency is the opportunity — seed emerging managers, take a slice of the management company, and let fee-related earnings compound.',
      'This thesis is also self-referential: it is the argument for how this firm itself should be built. Fee discipline, SPV velocity, and a fund structure LPs can diligence in an afternoon.',
    ],
    developments: [
      {
        date: '30 Jun',
        title: 'Preqin: first-time fund count at a nine-year low, median size up',
        note: 'Fewer, larger first funds — consistent with LPs consolidating into managers with visible operational spine.',
        source: 'Preqin H1 review',
      },
    ],
    memo: {
      title: 'Buy the GP, not the fund',
      updated: 'Draft · revised 21 June',
      state: 'Memo in progress',
      excerpt:
        'Management-company cash flows are the most mispriced asset in private markets below $1bn AUM. The structural reason is cheque size, not quality — which is exactly the kind of mispricing that persists…',
    },
    sources: [
      { name: 'Preqin emerging-manager series', detail: 'First-fund formation data' },
      { name: 'Conversations, filed', detail: 'Six GP-stakes principals, Q2 2026' },
    ],
  },
]

// ————————————————————————————————————————————— Deals

export const deals: Deal[] = [
  {
    id: 'osprey',
    name: 'Osprey Treasury',
    oneLiner: 'Issuer-agnostic stablecoin treasury operations for mid-market CFOs.',
    stage: 'Term sheet drafted · SPV II forming',
    thesis: 'stablecoin-treasury',
    status: 'live',
    next: 'Answer Jonah’s split-lead proposal; term sheet expires Friday.',
  },
  {
    id: 'keyring',
    name: 'Keyring Labs',
    oneLiner: 'Paymaster and bundler infrastructure for sponsored transactions.',
    stage: 'Diligence · fraud-loss data requested',
    thesis: 'account-abstraction',
    status: 'live',
    next: 'Cohort data from Dev lands Thursday. Pricing call waits for it.',
  },
  {
    id: 'bluebonnet',
    name: 'Bluebonnet Behavioral',
    oneLiner: 'Clinician-equity roll-up of outpatient behavioral clinics, Texas triangle.',
    stage: 'LOI review · QoE scheduled',
    thesis: 'behavioral-health',
    status: 'live',
    next: 'QoE kicks off 15 July. Priya’s observer role needs Sam’s nod first.',
  },
  {
    id: 'vane',
    name: 'Vane Research',
    oneLiner: 'Risk tooling for on-chain market makers and perp-venue vaults.',
    stage: 'Second meeting · pricing discussion',
    thesis: 'onchain-perps',
    status: 'prospect',
    next: 'Draft a structure before the pricing conversation, not during it.',
  },
  {
    id: 'clearline',
    name: 'Clearline Attestation',
    oneLiner: 'Continuous attestation and reserve proofs for bank deposit tokens.',
    stage: 'First call Thursday',
    thesis: 'stablecoin-treasury',
    status: 'prospect',
    next: 'Sarah Kim’s regulatory read would sharpen the first call. Ask her.',
  },
  {
    id: 'kestrel',
    name: 'Kestrel Vaults',
    oneLiner: 'Independent vault manager for perp-venue liquidity, institutional wrapper.',
    stage: 'Sourcing · via Lily Zhao',
    thesis: 'onchain-perps',
    status: 'prospect',
    next: 'Lily owes context from the Toronto meeting. Intro follows Vane pricing.',
  },
  {
    id: 'fairwater',
    name: 'Fairwater Capital',
    oneLiner: 'First-time specialty-insurance GP; a candidate for a GP-stake seed.',
    stage: 'Second meeting scheduled',
    thesis: 'gp-economics',
    status: 'prospect',
    next: 'Ask for the management-company model, not the fund deck.',
  },
]

// ————————————————————————————————————————————— The Book

export const contacts: Contact[] = [
  {
    id: 'marguerite-chen',
    name: 'Marguerite Chen',
    role: 'Principal',
    firm: 'Halloran Family Office',
    segment: 'LPs',
    context: 'Anchor prospect for SPV II. Wants operational detail before wiring.',
    lastTouch: '28 June',
    location: 'Chicago',
    relationship:
      'Introduced by Gene Marchetti in March. Runs directs for a single-family office built on industrial distribution; allergic to deck-speak, warms to working models. Committed $500k to SPV I within two weeks of the Osprey data-room walk-through. Has soft-circled $1.5m for SPV II pending fee terms and a look at the reconciliation demo.',
    introPath: 'Came in via Gene Marchetti (fund counsel) — their families summer together in Harbor Springs.',
    followUp: 'You told her fee terms by this week. The SPV II summary is drafted in Notes.',
    dealIds: ['osprey'],
    noteIds: ['n1', 'n5'],
  },
  {
    id: 'tom-okafor',
    name: 'Tom Okafor',
    role: 'Director of Research',
    firm: 'Ashbourne Partners',
    segment: 'LPs',
    context: 'Fund-of-funds. Tracking the firm for a Fund I anchor, not SPVs.',
    lastTouch: '19 June',
    location: 'New York',
    relationship:
      'Ashbourne seeds emerging managers at $5–15m tickets but requires a fund vehicle and two years of SPV track record. Tom reads everything — he flagged the Hyperliquid governance change before the desk did. Quarterly cadence; send him the perps memo when it is presentable.',
    followUp: 'Owes you their emerging-manager DDQ template; nudge gently mid-July.',
    dealIds: [],
    noteIds: ['n6'],
  },
  {
    id: 'priya-raman',
    name: 'Dr. Priya Raman',
    role: 'Angel · former GP',
    firm: 'Personal capital',
    segment: 'LPs',
    context: 'Behavioral-health operator turned investor. $250k in SPV I.',
    lastTouch: '1 July',
    location: 'Austin',
    relationship:
      'Built and sold a 12-clinic psychiatry group in 2021; the sharpest clinical-quality read in the network. Invested $250k in SPV I largely on the Bluebonnet relationship. Wants to co-diligence the QoE and would take a board-observer seat if the deal closes.',
    followUp: 'Confirm she gets the Bluebonnet QoE scope before the 15 July kickoff.',
    dealIds: ['bluebonnet'],
    noteIds: ['n3'],
  },
  {
    id: 'marcus-ellingsen',
    name: 'Marcus Ellingsen',
    role: 'Exited founder',
    firm: 'Formerly Brightpay',
    segment: 'LPs',
    context: 'Payments exit, 2024. Fast yes/no; hates process theater.',
    lastTouch: '11 June',
    location: 'Miami',
    relationship:
      'Sold Brightpay to a processor consortium; now writes $100–500k checks into infrastructure he understands. Passed on SPV I ("too early for you, too late for me") but asked to see the next stablecoin deal. Osprey is squarely his lane.',
    introPath: 'Via Jonah Price — they co-invested in two payments seeds.',
    followUp: 'Send the Osprey one-pager once the term sheet is countersigned.',
    dealIds: ['osprey'],
    noteIds: [],
  },
  {
    id: 'ana-oliveira',
    name: 'Ana Oliveira',
    role: 'Co-founder & CEO',
    firm: 'Osprey Treasury',
    segment: 'Founders',
    context: 'Term sheet in her hands. Wants the round closed before Q3 pipeline review.',
    lastTouch: '5 July',
    location: 'São Paulo / New York',
    relationship:
      'Ex-treasury lead at a LatAm neobank; built Osprey after living the reconciliation problem herself. Direct, numerate, replies at 6 a.m. Negotiation is warm but she is running a real process — Cormorant has a competing sheet. Your edge is speed and the mid-market GTM view from the thesis work.',
    followUp: 'She asked for the SPV II timeline in writing. Term sheet expires Friday.',
    dealIds: ['osprey'],
    noteIds: ['n1', 'n2'],
  },
  {
    id: 'dev-chandra',
    name: 'Dev Chandra',
    role: 'Founder',
    firm: 'Keyring Labs',
    segment: 'Founders',
    context: 'Diligence open. Fraud-loss cohort data promised by 10 July.',
    lastTouch: '2 July',
    location: 'Bangalore / SF',
    relationship:
      'Second-time founder; first company was acquired by a bundler that later collapsed, which is either a red flag or the entire reason he wins — the reference calls say the latter. Claims 11% sponsorship share; the Dune numbers need independent verification before pricing talk.',
    followUp: 'Hold him to the 10 July data delivery; the memo stalls without it.',
    dealIds: ['keyring'],
    noteIds: ['n4'],
  },
  {
    id: 'sam-whitlock',
    name: 'Sam Whitlock',
    role: 'CEO',
    firm: 'Bluebonnet Behavioral',
    segment: 'Founders',
    context: 'LOI under review. Fourteen clinics in pipeline; wants a partner, not a lender.',
    lastTouch: '27 June',
    location: 'Dallas',
    relationship:
      'Former clinic operator; evangelist for the clinician-equity model. Turned down two PE platforms on culture grounds, which is the whole reason the deal exists at this price. Priya vouches for his clinical instincts. Moves slowly and deliberately — do not crowd him.',
    followUp: 'QoE kickoff 15 July. Confirm Priya’s observer role with him beforehand.',
    dealIds: ['bluebonnet'],
    noteIds: ['n3'],
  },
  {
    id: 'jonah-price',
    name: 'Jonah Price',
    role: 'Partner',
    firm: 'Cormorant Ventures',
    segment: 'Co-investors',
    context: 'Friendly rival on Osprey — competing sheet, but wants to split it.',
    lastTouch: '4 July',
    location: 'New York',
    relationship:
      'Known him since his operator days. Cormorant issued a competing sheet on Osprey but Jonah has floated co-leading with the SPV taking 40%. Genuinely good on fintech GTM; his diligence notes are worth the equity he asks for. Also your best path to Marcus Ellingsen and two other HNWs.',
    followUp: 'He proposed terms for a split lead. Decide before Ana’s Friday deadline.',
    dealIds: ['osprey'],
    noteIds: ['n2'],
  },
  {
    id: 'lily-zhao',
    name: 'Lily Zhao',
    role: 'Principal',
    firm: 'Foundry North',
    segment: 'Co-investors',
    context: 'Crypto-infra specialist. Swaps diligence on 4337 and perps names.',
    lastTouch: '24 June',
    location: 'Toronto',
    relationship:
      'The best technical diligence in the network for anything EVM-adjacent. Traded notes on Keyring — she passed at seed on valuation, not quality, and her fraud-model questions became your data request to Dev. Keeps score on intro reciprocity; you owe her one.',
    followUp: 'Owe her an intro to Vane once the pricing discussion settles.',
    dealIds: ['keyring', 'vane'],
    noteIds: ['n4'],
  },
  {
    id: 'gene-marchetti',
    name: 'Gene Marchetti',
    role: 'Fund counsel',
    firm: 'Marchetti & Cole LLP',
    segment: 'Advisors',
    context: 'Handles SPV formation and the Fund I structure work.',
    lastTouch: '30 June',
    location: 'Chicago',
    relationship:
      'Twenty years of fund formation; took the firm on as a favor to the Halloran family and stayed because the deal flow amuses him. Bills fairly, answers on Sundays. Pushing you to standardize SPV docs now so Fund I diligence is trivial later — he is right.',
    followUp: 'SPV II formation docs due back from him Wednesday.',
    dealIds: ['osprey'],
    noteIds: ['n5'],
  },
  {
    id: 'sarah-kim',
    name: 'Sarah Kim',
    role: 'Policy advisor',
    firm: 'Independent · ex-Treasury',
    segment: 'Advisors',
    context: 'Reads the regulatory tape on stablecoins before it prints.',
    lastTouch: '20 June',
    location: 'Washington',
    relationship:
      'Former Treasury staffer on digital-asset policy. Monthly call; her read on the deposit-token guidance shaped the stablecoin thesis stance. Compensated in carry points on SPV II — paper with Gene when it forms.',
    followUp: 'Ask her read on the Circle console — does it draw a regulatory moat too?',
    dealIds: ['osprey'],
    noteIds: [],
  },
]

// ————————————————————————————————————————————— Notes

export const notes: Note[] = [
  {
    id: 'n1',
    date: '6 July',
    title: 'Osprey — the Circle question, answered honestly',
    body:
      'Circle’s console kills the top-of-market wedge but validates the category. Ana’s mid-market GTM through ERP integrators is the real moat — Circle will not field a 40-person integrator channel for sub-$25m balances. Underwrite the mid-market only; treat enterprise as optionality. This goes in the memo and in the Marguerite walk-through.',
    links: [
      { type: 'deal', ref: 'osprey', label: 'Osprey Treasury' },
      { type: 'thesis', ref: 'stablecoin-treasury', label: 'Stablecoin Treasury' },
      { type: 'contact', ref: 'ana-oliveira', label: 'Ana Oliveira' },
    ],
  },
  {
    id: 'n2',
    date: '4 July',
    title: 'Jonah’s split-lead proposal',
    body:
      'Cormorant leads, SPV II takes 40% of the round at identical terms, board seat shared on an observer basis. The honest read: it halves the economics and doubles the credibility with Ana. Counter: 50/50 with our SPV papering first. Decide before Friday.',
    links: [
      { type: 'deal', ref: 'osprey', label: 'Osprey Treasury' },
      { type: 'contact', ref: 'jonah-price', label: 'Jonah Price' },
    ],
  },
  {
    id: 'n3',
    date: '27 June',
    title: 'Bluebonnet — what Priya would kill the deal over',
    body:
      'Her line: “Same-clinic clinician retention below 85% at month 18 means the equity model is theater.” Sam’s number is 91% across the first four clinics. Get the QoE to test it independently; if it holds, this is the cleanest roll-up entry we will see this cycle.',
    links: [
      { type: 'deal', ref: 'bluebonnet', label: 'Bluebonnet Behavioral' },
      { type: 'thesis', ref: 'behavioral-health', label: 'Behavioral Health' },
      { type: 'contact', ref: 'priya-raman', label: 'Priya Raman' },
    ],
  },
  {
    id: 'n4',
    date: '2 July',
    title: 'Keyring — Lily’s fraud-model questions, forwarded as diligence',
    body:
      'Three asks sent to Dev: cohort fraud-loss by vertical (games vs. commerce), sponsorship concentration by top-10 apps, and chargeback-equivalent policy when a paymaster disputes. Lily thinks commerce loss ratios are the whole ballgame. Data due 10 July.',
    links: [
      { type: 'deal', ref: 'keyring', label: 'Keyring Labs' },
      { type: 'thesis', ref: 'account-abstraction', label: 'Account Abstraction' },
      { type: 'contact', ref: 'lily-zhao', label: 'Lily Zhao' },
    ],
  },
  {
    id: 'n5',
    date: '30 June',
    title: 'SPV II terms — what Marguerite needs in writing',
    body:
      'Draft summary for Halloran: 2/20 with fees offset against Fund I commitment, $1.5m soft-circled, quarterly operational letter (she asked twice — she reads them). Gene returns formation docs Wednesday; send the summary same day.',
    links: [
      { type: 'contact', ref: 'marguerite-chen', label: 'Marguerite Chen' },
      { type: 'contact', ref: 'gene-marchetti', label: 'Gene Marchetti' },
      { type: 'deal', ref: 'osprey', label: 'Osprey Treasury' },
    ],
  },
  {
    id: 'n6',
    date: '19 June',
    title: 'Ashbourne’s bar for a Fund I anchor',
    body:
      'Tom, verbatim: “Two years of SPVs, one full realization, and an ops stack I can audit in a day.” The GP-economics thesis is the pitch — the firm as a working proof of it. File the perps memo to him when the venue section is tighter.',
    links: [
      { type: 'contact', ref: 'tom-okafor', label: 'Tom Okafor' },
      { type: 'thesis', ref: 'gp-economics', label: 'GP Economics' },
    ],
  },
]

// ————————————————————————————————————————————— To Do's

// Docket buckets are derived from age: filed today, yesterday, within the
// week, or older — the parking lot. The seed carries a fixed bucket only
// because mock data has no timestamps.
export type TodoBucket = 'Today' | 'Yesterday' | 'Last Week' | 'Parking Lot'

export type Todo = {
  id: string
  text: string
  meta: string
  href?: string
  group: TodoBucket
}

export const todos: Todo[] = [
  {
    id: 't1',
    text: 'Answer Jonah’s split-lead proposal',
    meta: 'Before Ana’s Friday deadline · Osprey Treasury',
    href: '/book/jonah-price',
    group: 'Today',
  },
]

export const todoGroups = ['Today', 'Yesterday', 'Last Week', 'Parking Lot'] as const

// ————————————————————————————————————————————— News

export type NewsItem = {
  source: string
  age: string
  headline: string
  dek: string
  thesis?: string
  chip?: string
}

export const newsItems: NewsItem[] = [
  {
    source: 'Company announcement',
    age: 'This morning',
    headline: 'Circle previews a native treasury console for USDC corporates',
    dek: 'Free above $25m in balances. The mid-market — Osprey’s market — is conspicuously absent.',
    thesis: 'stablecoin-treasury',
    chip: 'Stablecoin Treasury',
  },
  {
    source: 'Artemis',
    age: '3h',
    headline: 'Corporate stablecoin balances reach $48bn, up 3.1× on the year',
    dek: 'Growth concentrates in $50m–$500m revenue companies.',
    thesis: 'stablecoin-treasury',
    chip: 'Stablecoin Treasury',
  },
  {
    source: 'Protocol changelog',
    age: 'Yesterday',
    headline: 'Coinbase Smart Wallet defaults all new retail accounts to 4337',
    dek: 'The education cost of smart accounts moves to someone else’s income statement.',
    thesis: 'account-abstraction',
    chip: 'Account Abstraction',
  },
  {
    source: 'Governance forum',
    age: 'Yesterday',
    headline: 'HIP-4 opens builder-deployed perp markets to third parties',
    dek: 'Long-tail listing risk rises — and with it, the value of independent risk tooling.',
    thesis: 'onchain-perps',
    chip: 'On-chain Perps',
  },
  {
    source: 'CMS final rule',
    age: '2d',
    headline: 'CMS finalizes a 3.4% uplift for outpatient behavioral codes',
    dek: 'Directly accretive to the Bluebonnet base case; underwriting assumed flat.',
    thesis: 'behavioral-health',
    chip: 'Behavioral Health',
  },
  {
    source: 'American Banker',
    age: '2d',
    headline: 'Second US regional bank launches deposit-token rails',
    dek: 'Issuer fragmentation continues — supportive of issuer-agnostic reconciliation.',
    thesis: 'stablecoin-treasury',
    chip: 'Stablecoin Treasury',
  },
  {
    source: 'Preqin',
    age: '1w',
    headline: 'First-time fund count hits a nine-year low; median size rises',
    dek: 'LPs consolidating into managers with visible operational spine.',
    thesis: 'gp-economics',
    chip: 'GP Economics',
  },
  {
    source: 'Desk wire',
    age: '1w',
    headline: 'CME solana perps make the on-chain basis trade boring again',
    dek: 'Basis compression pushes prop flow toward venue-adjacent yield.',
    thesis: 'onchain-perps',
    chip: 'On-chain Perps',
  },
]

// ————————————————————————————————————————————— The Brief (today)

export const briefLead = {
  eyebrow: 'The Lead · Pipeline',
  headline: 'Circle moves upmarket; the Osprey window narrows to Friday',
  dek: 'A free treasury console for $25m+ balances redraws the map above the mid-market — and makes Ana Oliveira’s expiring term sheet the week’s only decision that matters.',
  body: [
    'Circle’s console announcement reads, at first, like the risk the stablecoin-treasury thesis always carried: the issuer builds the plumbing and gives it away. Read closer and it is a gift — it cedes the mid-market, where Osprey’s ERP-integrator channel operates unopposed, and it validates the category for every CFO still on spreadsheets.',
    'The complication is timing. Ana’s term sheet expires Friday, Cormorant’s competing sheet is live, and Jonah Price has proposed a split lead that halves the economics and doubles the credibility. The desk’s read is in your notes; the decision is not.',
  ],
  source: 'From the desk · Osprey Treasury, filed notes, thesis feed',
}

export const briefItems: BriefItem[] = [
  {
    eyebrow: 'Markets',
    headline: 'Treasury stablecoin balances reach $48bn, tripling on the year',
    dek: 'Growth concentrates in the $50m–$500m revenue segment — the mid-market case, arriving on schedule.',
    source: 'Artemis · Thesis: Stablecoin Treasury',
    href: '/research/stablecoin-treasury',
  },
  {
    eyebrow: 'Thesis Watch',
    headline: 'Coinbase defaults retail to smart accounts',
    dek: 'The education cost of account abstraction just moved to someone else’s income statement.',
    source: 'Protocol changelog · Thesis: Account Abstraction',
    href: '/research/account-abstraction',
  },
  {
    eyebrow: 'Follow Up',
    headline: 'You told Marguerite Chen she’d have SPV II fee terms this week',
    dek: 'Gene returns formation docs Wednesday; the summary in your notes is ready to send the same day.',
    source: 'The Book · Halloran Family Office',
    href: '/book/marguerite-chen',
  },
  {
    eyebrow: 'Diligence',
    headline: 'Keyring’s fraud-loss data lands Thursday — hold the pricing call until it does',
    dek: 'Lily Zhao’s commerce-loss question remains the open item that decides the memo.',
    source: 'Pipeline · Keyring Labs',
    href: '/book/dev-chandra',
  },
  {
    eyebrow: 'The Book',
    headline: 'A CMS rate uplift quietly improves the Bluebonnet base case',
    dek: '3.4% on outpatient behavioral codes, against an underwriting that assumed flat. Priya will have noticed.',
    source: 'CMS final rule · Bluebonnet Behavioral',
    href: '/research/behavioral-health',
  },
  {
    eyebrow: 'Read Next',
    headline: 'Buy the GP, not the fund',
    dek: 'The memo-in-progress on emerging-manager economics — also the argument for how this firm gets built.',
    source: 'Research · GP Economics',
    href: '/research/gp-economics',
  },
]

// ————————————————————————————————————————————— Apollo (mock-mode example)

// One worked example so the zero-env demo shows what Apollo does.
// Typed loosely here to avoid a circular import with lib/apollo/store.
export const apolloExample = {
  id: 'example',
  ask: 'Prep me for the week: what on my calendar collides with the Osprey decision, and what am I about to drop?',
  status: 'done' as const,
  planNote: 'Cross-reference the calendar and open docket against the Osprey timeline; flag collisions and orphaned commitments.',
  steps: [
    { t: '07:41', kind: 'tool' as const, name: 'Read the docket', detail: '1 open item · Answer Jonah’s split-lead proposal' },
    { t: '07:41', kind: 'tool' as const, name: 'Read the calendar', detail: '4 events in the next 7 days' },
    { t: '07:42', kind: 'tool' as const, name: 'Read the Book', detail: 'Jonah Price · Ana Oliveira · Marguerite Chen' },
    { t: '07:42', kind: 'search' as const, name: 'Searched the wire', detail: 'stablecoin treasury console mid-market' },
    { t: '07:43', kind: 'write' as const, name: 'Filed a to-do', detail: 'Draft the split-lead counter before Thursday’s call' },
  ],
  result: {
    title: 'The week bends around Friday',
    dateline: 'Apollo · from the calendar, the docket, and the wire',
    sections: [
      {
        label: 'The collision',
        body: 'Thursday’s partner call lands a day before Ana’s term sheet expires, and the split-lead answer Jonah is waiting on is the only open docket item. Decide before the call, not on it — I have filed a to-do to draft the counter by Wednesday night.',
      },
      {
        label: 'About to drop',
        body: 'Marguerite was promised fee terms this week and nothing on the calendar carries it. Either send the summary Wednesday when Gene’s docs land, or move the promise explicitly — silence is the only losing move.',
      },
      {
        label: 'From the wire',
        body: 'Circle’s console coverage keeps validating the mid-market wedge. Nothing new changes the Osprey case; one more reason the Friday deadline deserves a yes or a counter, not a lapse.',
      },
    ],
  },
  verdict: null,
  feedbackNote: null,
  createdAt: '2026-07-09T11:41:00.000Z',
  finishedAt: '2026-07-09T11:44:00.000Z',
}

// ————————————————————————————————————————————— The Proofs (seed)

// Zero-env demo of the review tray. Shape mirrors lib/review.ts ProofRecord.
export const proofs = [
  {
    id: 'p1',
    kind: 'email',
    title: 'SPV II fee terms for Marguerite',
    summary: 'She was promised terms in writing this week. Drafted from your notes.',
    body: 'Marguerite,\n\nAs promised — SPV II terms in writing: 2 and 20, with fees offset dollar-for-dollar against a Fund I commitment. Your soft-circled $1.5m stands reserved through the 25th.\n\nThe quarterly operational letter you asked about twice is part of the package; the first one accompanies the closing docs.\n\nGene returns the formation documents Wednesday. If the terms read right, I will send the subscription package the same day.\n\nWilliam',
    actionType: 'send_email',
    action: { to: 'marguerite@halloran.example', subject: 'SPV II — terms in writing' },
    sourceUrl: null,
    filedOn: '9 July',
    todo: { id: 't-demo-1', text: 'Send Marguerite the SPV II fee terms' },
  },
  {
    id: 'p2',
    kind: 'post',
    title: 'The back office is the product',
    summary: 'A short post arguing the stablecoin trade is the reconciliation layer.',
    body: 'Every mid-market CFO who moved a working-capital sleeve on-chain now runs a shadow back office of spreadsheets — attestation, yield sweep, multi-issuer redemption. That back office is the product.\n\nThe coins will not matter. The plumbing firms that make treasurers indifferent to which coin they hold will. Pricing power sits with whoever owns the reconciliation layer between issuers, custodians, and the ERP.\n\nCircle just validated the category by giving the top of the market away for free. The mid-market is still unclaimed. That is the trade.',
    actionType: 'none',
    action: null,
    sourceUrl: null,
    filedOn: '8 July',
    todo: { id: 't-demo-2', text: 'Write the stablecoin post for the site' },
  },
  {
    id: 'p3',
    kind: 'analysis',
    title: 'Keyring fraud-loss cohorts — first read',
    summary: 'The working file is ready for review before Thursday\u2019s pricing call.',
    body: 'Commerce loss ratios hold under 40bps across the last three cohorts — the number Lily said would decide it. Games-heavy cohorts run hotter but are shrinking as a share of sponsorship volume.\n\nThe full workings, cohort tables, and the sensitivity on take-rate are in the working file.',
    actionType: 'none',
    action: null,
    sourceUrl: 'https://docs.google.com/spreadsheets/d/keyring-cohorts',
    filedOn: '8 July',
    todo: { id: 't-demo-3', text: 'Review Keyring fraud-loss cohorts before the pricing call' },
  },
] as const

// ————————————————————————————————————————————— Lookups

export const thesisBySlug = (slug: string) => theses.find((t) => t.slug === slug)
export const contactById = (id: string) => contacts.find((c) => c.id === id)
export const dealById = (id: string) => deals.find((d) => d.id === id)
export const notesByIds = (ids: string[]) => notes.filter((n) => ids.includes(n.id))

export const segments: Segment[] = ['LPs', 'Founders', 'Co-investors', 'Advisors']
