# Guideline-Grounded Evidence Copilot — Exa Demo

Turns a **static NCCN treatment guideline** into a **living, evidence-backed decision
surface** powered by [Exa](https://exa.ai).

## The use case

| | |
|---|---|
| **End user** | Practicing oncologist / tumor-board coordinator at a cancer center |
| **Problem** | Guidelines are frozen at publication (here: *NCCN Invasive Breast Cancer, v2.2026, Feb 27 2026*). New trials, FDA approvals, and label changes land weekly. Keeping current across every subtype is impossible manually; keyword search misses semantically-relevant papers; generic LLMs hallucinate citations. |
| **What Exa does** | Neural search scoped to authoritative domains (FDA, NCCN, PubMed, ASCO/JCO, ClinicalTrials.gov, NEJM, Lancet), recency-filtered, returning a **grounded, cited brief** of what has changed since the guideline's cutoff. Every claim links to a real retrieved source. |
| **Guardrail** | Exa retrieves and grounds evidence — the treating clinician makes the final call. Not a medical device. |

## How it works

1. **Left panel — the guideline anchor.** Clinician sets the patient profile using the
   real NCCN axes: **clinical stage** + **ER / PR / HER2** receptor status. The app
   derives the **subtype** (HR+/HER2−, HER2+, or TNBC) and shows the standard-of-care
   treatment class from the guideline.
2. **Right panel — live evidence via Exa.** One click calls Exa's `/search` with
   `outputSchema` synthesis. Exa returns a headline + practice-relevant developments,
   each with **field-level citations**, plus the raw retrieved sources with highlights
   and publication dates.

The interesting Exa surface area on display:
- Neural search (`type: "auto"`)
- Domain scoping (`includeDomains`)
- Recency filter (`startPublishedDate`)
- Grounded structured synthesis (`outputSchema` + `systemPrompt`)
- Field-level `grounding` citations
- `highlights` content mode

## Run it

```bash
npm install
npm run dev
```

The Exa API key lives in `.env.local` (`EXA_API_KEY`). Results are cached in-process
per profile, so re-running the same profile during a demo does **not** re-hit the API.

Open the printed URL (e.g. http://localhost:3000).

### Try these profiles

| Profile | Why it demos well |
|---|---|
| Stage IV · ER− PR− HER2− → **TNBC** | Pulls recent ADC + immunotherapy trial readouts (sacituzumab govitecan + pembrolizumab, etc.) with PubMed citations |
| Stage II · ER+ PR+ HER2− → **HR+/HER2−** | CDK4/6 inhibitor + genomic-assay evidence |
| Stage III · HER2+ | Trastuzumab deruxtecan / neoadjuvant dual-blockade evidence |

## The demo narrative (30-min walkthrough)

1. **Frame the problem (slide).** Hold up the guideline PDF: "authoritative, but frozen
   on Feb 27 2026. The document itself says recommendations *may be redefined as often as
   new significant data become available*. That gap is where clinicians live."
2. **Show the anchor (live).** Pick a patient profile → the guideline's treatment class
   appears. Trusted, structured, but static.
3. **Fill the gap with Exa (live).** Hit *Refresh evidence* → grounded brief of what's
   changed since the cutoff, each claim citing a real FDA/PubMed/journal source.
4. **Business impact (slide).** Faster tumor-board prep, fewer missed options, defensible
   citations, reduced liability — and it's *current every single day* without a guideline
   re-print.

## Structure

```
app/
  page.tsx            Two-panel UI (guideline anchor ↔ live Exa evidence)
  api/evidence/route.ts  Server route: builds the query, calls Exa /search, returns grounded brief + sources
  layout.tsx, globals.css
lib/
  nccn.ts             Guideline anchor data + subtype derivation + query builder
```
