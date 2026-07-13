# NCCN Guideline Copilot — Exa Demo

Turns a **static NCCN treatment guideline** into a **living, evidence-backed decision
surface** — powered entirely by [Exa](https://exa.ai), no other API.

**Live demo:** https://havana-pja203gw7-vishu-agarwals-projects-86fb5b9f.vercel.app
*(deployment URL changes per redeploy)*

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
3. **What's changed since the guideline** *(Exa)* — developments published after the
   frozen version, each tagged with the guideline point it updates and cited
   (FDA / PubMed / NEJM); "⤳ similar" finds related trials from one source.
4. **Ask about this patient** *(Exa)* — a question-first, grounded, cited answer.

## Exa capabilities used (Exa-only)

| Endpoint | Where | What it does |
|---|---|---|
| `/search` + `outputSchema` | Step 3 | Guideline-delta evidence: neural search scoped to authoritative domains, recency-filtered, grounded synthesis with field-level citations |
| `/search` + `outputSchema` | Step 2 | Grounds the NCCN decision tree in guideline sources (nccn.org, cancer.gov) |
| `/answer` | Step 4 | Question-first grounded answer with citations |
| `/findSimilar` | Step 3 | Semantic "similar studies" from a source URL |

Everything else (clinical-note extraction, subtype derivation, the baseline pathway
engine) runs locally — Exa is called only where it is uniquely beneficial.

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
  page.tsx               Numbered 4-step UI (personas → pathway → evidence → ask)
  api/evidence/route.ts  Exa /search — guideline-delta cited brief
  api/pathway/route.ts   Exa /search — NCCN decision tree grounded in source
  api/answer/route.ts    Exa /answer — grounded Q&A
  api/similar/route.ts   Exa /findSimilar — similar studies
  layout.tsx, globals.css
lib/
  nccn.ts                Guideline data, subtype derivation, pathway engine,
                         clinical-note extractor, patient personas, query builders
```
