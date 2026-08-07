# RentLoop

**An operating system for renting.** Not a listing site — everything that happens _after_ a property is rented: the agreement, move-in evidence, monthly rent, repairs, communication, renewal, move-out, and the deposit argument at the end.

Built for **IDEALIZE 2026** (AIESEC in University of Moratuwa) by team **Just4fun** — Open Category, Mobile App.

---

## The problem

Renting in Sri Lanka runs on WhatsApp threads, bank transfer screenshots, paper agreements and memory. When something goes wrong — a disputed deduction, a repair nobody fixed, a payment nobody can find — there is no record either side agrees on.

The moment this costs real money is move-out. A landlord proposes deductions, the tenant has a few days to argue, and the evidence is scattered across a year of chat history. RentLoop is built so that by then, the record already exists.

---

## What it does

**36 screens**, both sides of the tenancy, running on mock data with four live AI agents.

### Tenant

- **Rent ledger** — every month from the tenancy start, showing what is owed, what was paid, and what is outstanding. Partial payments are first-class: rent split across two transfers is normal here, and the ledger has to be able to say so.
- **Bank slips** — photograph the slip; it becomes the proof attached to that month.
- **Receipts** — a slip proves money left your account. A receipt proves the landlord agrees it arrived.
- **Agreement** — photograph it once; the terms become reminders.
- **Move-in / move-out inspections** — a room-by-room photo checklist, and a side-by-side comparison at the end.
- **Repairs** — report with photos, watch the status timeline.
- **Messages** — every thread anchored to a payment or a repair, so it is findable a year later.
- **Reminders** — derived from live state, not authored. They disappear when dealt with.
- **Renewal and notice** — the notice deadline stated in days, because it is the one date you cannot recover from missing.
- **Deposit settlement** — deduction by deduction, with the evidence behind each.

### Landlord

Portfolio with arrears at a glance, property detail, repairs queue, inbox. Switchable from More — in the prototype it is a lens you flip, so connected mode can be demonstrated on one device.

### Tenant-only vs connected mode

RentLoop works with a landlord who has never heard of it — that is the default. Everything the tenant records is theirs. Inviting the landlord is additive: the same records, now shared.

---

## Tech stack

Matches the original proposal, with two pivots explained below.

| Layer       | Choice                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| Mobile      | React Native via **Expo SDK 54**, TypeScript (strict)                                 |
| Navigation  | expo-router (file-based)                                                              |
| AI          | **Google Gemini** (`gemini-flash-latest`) — multimodal, function calling              |
| Data (now)  | In-memory mock behind a `Repository` interface                                        |
| Data (next) | Supabase — Postgres, Auth, Storage. Schema and repository exist on `feature/database` |
| CI          | GitHub Actions — lint, format check, typecheck                                        |

### Pivots from the proposal, and why

**No custom Node/NestJS backend.** The proposal listed one. The app talks to Supabase directly instead. A separate API server in front of Postgres would add a deployment target and a second place for auth bugs, and buy nothing this product needs — Supabase's row-level security enforces ownership at the database, which is where it belongs. If server-side logic is later required (webhooks, scheduled reminders, holding the AI key), Edge Functions cover it without a standing server.

**Expo SDK 54, not the newest.** SDK 57 exists, but the published Expo Go only runs 54. Pinning to 54 means any judge can scan the QR code and see the app on their own phone in a minute, with no custom build. That mattered more than being current.

**Landlord view is in the mobile app, not a separate web dashboard.** The proposal put the landlord on web. Both roles share one codebase for now because the double-sided story is what needed proving, not the form factor. A wider web layout is a rendering concern, not a rewrite — the screens already run on react-native-web.

**Mock data, not live.** Explicitly permitted at this stage. The seam is real: screens depend on `src/data/repository.ts` and never on an implementation, so swapping in Supabase means adding one file, not touching 36 screens.

---

## The AI agents

Four agents, all real, all running against Gemini with function calling. Nothing is simulated.

Every one follows the same shape (`src/agent/core.ts`): a goal, tools that read live tenancy state, and a finishing tool whose schema enforces the output. The loop keeps going until the agent calls that finishing tool — **it decides which tools to call, in what order, and with what arguments.**

### 1. Deposit dispute analysis — `src/agent/depositAgent.ts`

The one that has to reason. Four lookups whose combination produces a conclusion none of them contains:

```
get_proposed_deductions   → what the landlord is claiming, and why
compare_inspections       → what actually changed between move-in and move-out
get_agreement_terms       → who the agreement makes liable
get_maintenance_history   → was it reported during the tenancy and ignored?
```

That last one is the point. A deduction for a damp-stained wall means something completely different if the tenant reported the leak eight months ago and the landlord did nothing — and only the agent goes and checks.

**An actual run:**

> _"The Rs. 12,000 charge for repainting the bedroom wall is attributable to structural rain ingress that you reported in May 2025 and which was left unrepaired by the landlord."_

It rejected Rs. 12,000, **accepted** the fair Rs. 4,500 latch charge — a tenant who disputes everything loses credibility on the items that matter — disputed Rs. 8,000 of unevidenced cleaning, and drafted a calm reply citing specific dates. **Rs. 20,000 challenged.**

### 2. Payment intelligence — `src/agent/paymentAgent.ts`

Reads a photographed bank slip, then works out which month it settles by querying the actual ledger rather than assuming the current one — a payment dated the 18th is often clearing last month's arrears.

Genuinely sequential: it must read the slip to extract the reference, **then** query by that reference to catch a slip being recorded twice. The second call is impossible without the first.

### 3. Agreement intelligence — `src/agent/agreementAgent.ts`

Reads a photograph of the actual agreement and extracts rent, deposit, due date, notice period and end date — each with **the quote it came from**, so the tenant can check the model against their own document. Flags clauses that are vague or one-sided.

Nothing arrives confirmed. Extraction is a proposal; only confirmed terms drive deadlines.

### 4. Maintenance triage — `src/agent/maintenanceAgent.ts`

Multimodal — the tenant's photos go to the model. Reads the agreement for liability, checks for duplicate reports, and checks whether the affected area was photographed at move-in.

Observed: it caught a duplicate ticket, refused to guess liability because the agreement contradicted itself, and warned that the bathroom ceiling was never photographed at move-in so the tenant could be blamed later. Nothing told it to look there.

### Principles the code enforces

**The working is visible.** Every step renders on screen as it happens — tool arguments and raw JSON results expand on tap (`src/components/AgentTrace.tsx`). An agent you cannot watch is indistinguishable from a hardcoded answer.

**It never decides.** Agents propose; a human confirms before anything is written. `who_pays` can return **`unclear`**, and the prompt pushes it there when the agreement is ambiguous — a confident wrong answer about liability could cost a tenant real money.

**Confidence is shown honestly**, including when it is low.

---

## Running it

```bash
npm install
```

Copy `.env.example` to `.env` and add a Gemini API key from [aistudio.google.com](https://aistudio.google.com) (free tier is enough):

```
EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
```

Verify the key and find a model your account can actually call — a model being listed by the API does **not** mean your key can use it:

```bash
node scripts/check-gemini.mjs
```

Then:

```bash
npx expo start
```

Scan the QR with **Expo Go**. Press `w` for the browser instead.

The app opens on a seeded tenancy with six months of history covering every payment state. Without a Gemini key everything still works; the agents are disabled with a note saying why.

### Checks

```bash
npm run typecheck && npm run lint && npm run format:check
```

> **Windows note:** `format:check` flags every file locally because Git checks out CRLF while Prettier expects LF. CI runs on Linux and passes. Not a real failure.

> **Security note:** `EXPO_PUBLIC_` variables are compiled into the app bundle and can be extracted. Acceptable for a prototype, not for release — see Future plans.

---

## Project structure

```
app/                    36 screens (expo-router)
  tenant/               home, ledger, repairs, property, more
  landlord/             portfolio, repairs, inbox, more
  ...                   agreement, deposit, inspections, reminders, renewal, invite
src/
  agent/                core loop + 4 agents + Gemini client
  components/           design system, agent trace
  data/
    repository.ts       the seam every screen depends on
    mock/               in-memory implementation + seed
SPEC.md                 payments data model, with the reasoning behind each decision
```

`SPEC.md` records why each modelling fork was taken — properties as their own table, the landlord as a tenant-owned contact with a nullable `linked_user_id`, payments attached to generated rent periods, status derived rather than stored.

---

## Future plans

**Immediately next**

- **Merge the Supabase layer.** `feature/database` has the schema, client and repository. Its lifecycle methods are stubs and need filling before it can replace the mock.
- **Move the AI key server-side.** A Supabase Edge Function holding the Gemini key removes the one genuine security compromise in this build.
- **Agent memory.** Nothing persists between runs today. A deposit analysis should remember what the landlord already conceded.

**Then**

- Attach inspection evidence directly to deductions, so a disputed charge links to the photo that rebuts it
- Push reminders — the retention loop only works if it reaches the phone
- Per-tenant rent ledger and receipt issuing for landlords
- PDF export of the deposit evidence pack
- Payment gateway integration (PayHere, LankaQR) so rent is paid in-app, not just recorded

**Later** — the technician marketplace from the original proposal, once there is a tenancy base to serve.

---

## Team

**Just4fun** — University of Moratuwa
Sabith Ahamed · Izzath Nisfer · Rahim Mohamed Iqbal
