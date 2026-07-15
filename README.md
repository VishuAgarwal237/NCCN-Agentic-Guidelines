# NCCN Agentic Guidelines

Turns a **static NCCN treatment guideline** into a **living, evidence-backed decision
surface** — powered entirely by [Exa](https://exa.ai), no other API.

**Live demo:** https://nccn-agentic-guidelines.vercel.app
*(stable production URL — always serves the latest deploy)*

## The use case

| | |
|---|---|
| **End user** | Oncologists · tumor-board coordinators · quality managers |
| **Chosen customer** | ConcertAI / CancerLinQ — licenses NCCN Guidelines as a data asset |
| **Problem** | A guideline is frozen at publication (*NCCN Invasive Breast Cancer, v2.2026, Feb 27 2026*). New trials, FDA approvals, and label changes land weekly. Keyword search misses semantically-relevant papers; generic LLMs hallucinate citations you can't ship to clinicians. |
| **What Exa does** | The live, cited layer on top of NCCN: grounds the guideline pathway in real source content, surfaces what's changed since the cutoff (mapped to the exact guideline point it updates), and answers clinical questions — every claim grounded in a retrieved source. |
| **Guardrail** | Exa retrieves and grounds evidence — the treating clinician makes the final decision. Not a medical device. |

## The workflow (matches the on-screen steps)

1. **Select the patient** — pick a patient persona or paste a real oncology note; the
   profile (stage, ER/PR/HER2, biomarkers) is auto-extracted **locally** (no API).
2. **NCCN treatment pathway** — every option per phase, tiered (Preferred / Other
   recommended / Certain circumstances) with its NCCN Evidence & Consensus category.
   **"Ground in NCCN via Exa"** pulls the real algorithm from source and cites it.
3. **Live evidence for this patient** *(Exa)* — one step, three lenses (tabs):
   - **What's changed** — developments published after the frozen version, each tagged
     with the guideline point it updates and cited; "⤳ similar" finds related studies.
   - **Approved drugs** — deep structured search of recent FDA approvals in the subtype
     (drug · sponsor · indication), with citations.
   - **Open trials** — recruiting trials matching the profile from ClinicalTrials.gov,
     ordered newest-first by NCT id.
4. **Ask about this patient** *(Exa)* — a free-text question returns a **bold one-line
   takeaway**, a **bar chart** for quantitative outcomes (e.g. median PFS by regimen), and
   a grounded, cited answer.

**Monitors** *(Exa Monitors API, collapsible panel)* — scheduled searches that watch for
the "thaw": new NCCN versions, FDA approvals, and regulatory / competitor news. Trigger a
run on demand and view its history — the proactive complement to Step 3.

## Exa capabilities used (Exa-only)

| Endpoint | Where | What it does |
|---|---|---|
| `/search` + `outputSchema` | Step 2 | Grounds the NCCN decision tree in guideline sources (nccn.org, cancer.gov) |
| `/search` + `outputSchema` | Step 3 · What's changed | Guideline-delta evidence: neural search scoped to authoritative domains, recency-filtered, grounded synthesis with field-level citations |
| `/search` `type=deep` + `outputSchema` | Step 3 · Approved drugs | Deep structured enrichment of recent FDA approvals |
| `/search` | Step 3 · Open trials | Recruiting trials scoped to ClinicalTrials.gov |
| `/search` `type=deep` + `outputSchema` | Step 4 · Ask | Deep synthesis into a one-line summary, prose answer, cited sources, and (when applicable) bar-chart data |
| `/findSimilar` | Step 3 · What's changed | Semantic "similar studies" from a source URL |
| **Monitors** (`/monitors` create · trigger · runs) | Monitors panel | Scheduled recurring searches with run history; watches for guideline/regulatory change |

Three distinct Exa endpoints — `/search`, `/findSimilar`, and Monitors — across ~10 call
sites. `/search` does triple duty: raw retrieval, grounded schema-structured synthesis with
field-level citations, and deep multi-step research. Everything else (clinical-note
extraction, subtype derivation, the baseline pathway engine) runs locally — Exa is called
only where it is uniquely beneficial.

> **Monitors require production.** The Monitors API needs a public HTTPS webhook, so
> monitors can only be created on the deployed site, not `localhost`.

## Run it

```bash
npm install
npm run dev
```

Set your key in `.env.local` (gitignored):

```
EXA_API_KEY=your_key_here
```

Results are cached in-process per profile, so re-running the same patient during a demo
does not re-hit the API.

### Patient personas to try

| Persona | Demonstrates |
|---|---|
| Jane D. · Stage IIIA HER2+ | Extraction lands on Category-1 TCHP (matches the tumor board); rich HER2 evidence |
| Aisha K. · Metastatic TNBC (PD-L1+) | ADC + immunotherapy trial readouts with PubMed citations |
| Maria R. · Stage II HR+/HER2− | CDK4/6 inhibitor + genomic-assay evidence |

## Structure

```
app/
  page.tsx                       4-step UI (personas → pathway → tabbed evidence → ask) + Monitors
  api/evidence/route.ts          Exa /search — guideline-delta cited brief
  api/pathway/route.ts           Exa /search — NCCN decision tree grounded in source
  api/drugs/route.ts             Exa /search type=deep — recent FDA approvals (structured)
  api/trials/route.ts            Exa /search — recruiting trials (ClinicalTrials.gov)
  api/answer/route.ts            Exa /search type=deep — summary + chart + cited answer
  api/similar/route.ts           Exa /findSimilar — similar studies
  api/monitors/route.ts          Exa Monitors — list / create
  api/monitors/[id]/trigger      Exa Monitors — manual run
  api/monitors/[id]/runs         Exa Monitors — run history / detail
  api/monitor-webhook/route.ts   No-op HTTPS webhook receiver (required by Monitors)
  layout.tsx, globals.css
lib/
  nccn.ts                        Guideline data, subtype derivation, pathway engine,
                                 clinical-note extractor, patient personas, monitor
                                 presets, query builders
```
