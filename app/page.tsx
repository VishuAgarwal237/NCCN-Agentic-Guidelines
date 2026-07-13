"use client";

import { useState } from "react";
import {
  GUIDELINE_META,
  STAGES,
  SUBTYPES,
  SAMPLE_CASE,
  PATIENT_PERSONAS,
  deriveSubtype,
  buildPathway,
  extractCaseProfile,
  type OptionTier,
  type PatientPersona,
  type ReceptorStatus,
  type StageKey,
} from "@/lib/nccn";

/* ---------------------------------- types --------------------------------- */

interface Development {
  title: string;
  affectsGuidelinePoint?: string;
  whatChanged: string;
  relevance: string;
}
interface Brief {
  headline: string;
  developments: Development[];
}
interface Source {
  title: string;
  url: string;
  publishedDate: string | null;
  highlight: string | null;
}
interface EvidenceResponse {
  brief: Brief | null;
  grounding: { field: string; citations?: { url: string; title?: string }[] }[];
  sources: Source[];
  cached: boolean;
  error?: string;
}
interface SimilarResult {
  title: string;
  url: string;
  publishedDate: string | null;
  highlight: string | null;
}

/* -------------------------------- helpers --------------------------------- */

const TIER_STYLE: Record<OptionTier, string> = {
  Preferred: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Other recommended": "bg-sky-100 text-sky-800 border-sky-200",
  "Certain circumstances": "bg-amber-100 text-amber-800 border-amber-200",
};

function tierStyle(t: string): string {
  const s = (t || "").toLowerCase();
  if (s.includes("preferred")) return TIER_STYLE.Preferred;
  if (s.includes("circumstance")) return TIER_STYLE["Certain circumstances"];
  if (s.includes("other")) return TIER_STYLE["Other recommended"];
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function fmtDate(d: string | null) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  } catch {
    return d;
  }
}

function citationsFor(
  grounding: EvidenceResponse["grounding"],
  i: number
): { url: string }[] {
  const prefix = `developments[${i}]`;
  const seen = new Set<string>();
  const out: { url: string }[] = [];
  for (const g of grounding ?? []) {
    if (!g.field?.startsWith(prefix)) continue;
    for (const c of g.citations ?? []) {
      if (c.url && !seen.has(c.url)) {
        seen.add(c.url);
        out.push(c);
      }
    }
  }
  return out;
}

/* ----------------------------- small components --------------------------- */

function StepCard({
  n,
  title,
  subtitle,
  action,
  exa,
  last,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  exa?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex gap-4">
      {/* spine node + connector */}
      <div className="relative flex w-9 flex-col items-center">
        <div
          className={`spine-node ${
            exa ? "bg-nccn-pink text-white" : "bg-nccn-navy text-white"
          }`}
        >
          {n}
        </div>
        {!last && (
          <div className="absolute -bottom-5 left-1/2 top-9 w-0.5 -translate-x-1/2 bg-line" />
        )}
      </div>
      <section className="min-w-0 flex-1 rounded-lg border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-nccn-navy">
                {title}
              </h2>
              {exa && (
                <span className="data rounded bg-nccn-pink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-nccn-pink">
                  Exa
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function ReceptorPills({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ReceptorStatus;
  onChange: (v: ReceptorStatus) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
        {(["positive", "negative"] as ReceptorStatus[]).map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2 py-0.5 text-[11px] font-semibold transition ${
              value === opt
                ? opt === "positive"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-600 text-white"
                : "bg-white text-slate-400 hover:text-slate-700"
            }`}
          >
            {opt === "positive" ? "+" : "−"}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function Page() {
  // profile
  const [stage, setStage] = useState<StageKey>("III");
  const [er, setEr] = useState<ReceptorStatus>("positive");
  const [pr, setPr] = useState<ReceptorStatus>("negative");
  const [her2, setHer2] = useState<ReceptorStatus>("positive");
  const [activePersona, setActivePersona] = useState<string | null>("jane-her2");

  // case ingest
  const [caseOpen, setCaseOpen] = useState(false);
  const [caseText, setCaseText] = useState("");
  const [extracted, setExtracted] = useState<ReturnType<
    typeof extractCaseProfile
  > | null>(null);

  // pathway grounding (Exa)
  const [groundedSteps, setGroundedSteps] = useState<
    { phase: string; option: string; tier: string; category: string }[] | null
  >(null);
  const [groundedCitations, setGroundedCitations] = useState<{ url: string }[]>([]);
  const [grounding, setGrounding] = useState(false);
  const [groundError, setGroundError] = useState<string | null>(null);

  // evidence (Exa)
  const [monthsBack, setMonthsBack] = useState(18);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // find similar (Exa)
  const [similarFor, setSimilarFor] = useState<string | null>(null);
  const [similarData, setSimilarData] = useState<SimilarResult[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  // ask (Exa)
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{
    answer: string;
    citations: { title: string; url: string }[];
  } | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const subtypeKey = deriveSubtype(er, pr, her2);
  const subtype = SUBTYPES[subtypeKey];
  const pathway = buildPathway(stage, subtypeKey);

  function resetDownstream() {
    setData(null);
    setAnswer(null);
    setGroundedSteps(null);
    setGroundError(null);
    setSimilarFor(null);
  }

  function selectPersona(p: PatientPersona) {
    setActivePersona(p.id);
    setStage(p.stage);
    setEr(p.er);
    setPr(p.pr);
    setHer2(p.her2);
    setExtracted(null);
    setCaseText("");
    setCaseOpen(false);
    resetDownstream();
  }

  function manual<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setActivePersona(null);
      resetDownstream();
    };
  }

  function ingestCase() {
    const text = caseText.trim();
    if (!text) return;
    const result = extractCaseProfile(text);
    setStage(result.stage);
    setEr(result.er);
    setPr(result.pr);
    setHer2(result.her2);
    setExtracted(result);
    setActivePersona(null);
    resetDownstream();
  }

  async function groundPathway() {
    setGrounding(true);
    setGroundError(null);
    try {
      const res = await fetch("/api/pathway", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, er, pr, her2 }),
      });
      const json = await res.json();
      if (!res.ok || json.error) setGroundError(json.error ?? "Something went wrong.");
      else {
        setGroundedSteps(json.steps ?? []);
        setGroundedCitations(json.citations ?? []);
      }
    } catch (e) {
      setGroundError((e as Error).message);
    } finally {
      setGrounding(false);
    }
  }

  async function runEvidence() {
    setLoading(true);
    setError(null);
    setSimilarFor(null);
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, er, pr, her2, monthsBack }),
      });
      const json = (await res.json()) as EvidenceResponse;
      if (!res.ok || json.error) {
        setError(json.error ?? "Something went wrong.");
        setData(null);
      } else setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function findSimilar(url: string) {
    if (similarFor === url) {
      setSimilarFor(null);
      return;
    }
    setSimilarFor(url);
    setSimilarData([]);
    setSimilarLoading(true);
    try {
      const res = await fetch("/api/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (res.ok && !json.error) setSimilarData(json.results ?? []);
    } finally {
      setSimilarLoading(false);
    }
  }

  async function askQuestion() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswerError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, stage, subtype: subtypeKey }),
      });
      const json = await res.json();
      if (!res.ok || json.error) setAnswerError(json.error ?? "Something went wrong.");
      else setAnswer(json);
    } catch (e) {
      setAnswerError((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-nccn-navy text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-nccn-pink">
              Oncology decision support · powered by Exa
            </div>
            <h1 className="text-xl font-bold">NCCN Guideline Copilot</h1>
          </div>
          <div className="text-right text-[11px] leading-tight text-white/70">
            <div className="font-semibold text-white">Breast cancer</div>
            <span className="data">
              {GUIDELINE_META.version} · frozen {GUIDELINE_META.cutoff}
            </span>
          </div>
        </div>
      </header>

      {/* One-line framing (requirement #2) */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-2.5 text-xs text-slate-600">
          <span className="font-semibold text-nccn-navy">For oncologists &amp; tumor boards.</span>{" "}
          NCCN guidelines freeze at publication — Exa surfaces what&apos;s changed since,
          grounded and cited. <span className="text-slate-400">Exa-only, no other API.</span>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-5 px-6 py-6">
        {/* STEP 1 — Select the patient */}
        <StepCard
          n={1}
          title="Select the patient"
          subtitle="Pick a persona, or paste a real case to auto-extract the profile"
        >
          {/* persona chips */}
          <div className="flex flex-wrap gap-2">
            {PATIENT_PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPersona(p)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  activePersona === p.id
                    ? "border-nccn-navy bg-nccn-navy text-white"
                    : "border-slate-300 bg-white hover:border-nccn-blue"
                }`}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div
                  className={`text-xs ${
                    activePersona === p.id ? "text-white/80" : "text-slate-500"
                  }`}
                >
                  {p.blurb}
                </div>
              </button>
            ))}
            <button
              onClick={() => {
                setCaseOpen((o) => !o);
                if (!caseText) setCaseText(SAMPLE_CASE);
              }}
              className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500 hover:border-nccn-blue"
            >
              + Paste a case
            </button>
          </div>

          {/* case ingest (collapsible) */}
          {caseOpen && (
            <div className="mt-3">
              <textarea
                value={caseText}
                onChange={(e) => setCaseText(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-xs leading-relaxed focus:border-nccn-blue focus:outline-none"
                placeholder="Paste a de-identified oncology note…"
              />
              <button
                onClick={ingestCase}
                className="mt-2 rounded-lg bg-nccn-navy px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Extract profile
              </button>
              {extracted && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {extracted.entities.map((e, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-slate-700"
                    >
                      <span className="font-semibold text-emerald-700">{e.label}:</span>{" "}
                      {e.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* resulting profile — compact, editable */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Stage</span>
              {STAGES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => manual(setStage)(s.key)}
                  className={`data h-6 w-8 rounded text-xs font-semibold transition ${
                    stage === s.key
                      ? "bg-nccn-navy text-white"
                      : "bg-white text-slate-500 hover:text-nccn-navy"
                  }`}
                >
                  {s.key}
                </button>
              ))}
            </div>
            <ReceptorPills label="ER" value={er} onChange={manual(setEr)} />
            <ReceptorPills label="PR" value={pr} onChange={manual(setPr)} />
            <ReceptorPills label="HER2" value={her2} onChange={manual(setHer2)} />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-400">→</span>
              <span className="rounded-lg bg-nccn-blue/10 px-3 py-1 text-sm font-bold text-nccn-navy">
                {subtype.label}
              </span>
            </div>
          </div>
        </StepCard>

        {/* STEP 2 — Treatment pathway */}
        <StepCard
          n={2}
          title="NCCN treatment pathway"
          subtitle={`${subtype.label} · Stage ${stage} · ${pathway.setting}`}
          action={
            <button
              onClick={groundPathway}
              disabled={grounding}
              className="rounded-lg bg-nccn-pink px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
              title="Retrieve & cite the current NCCN algorithm from source via Exa"
            >
              {grounding ? "Grounding…" : "Ground in NCCN via Exa"}
            </button>
          }
        >
          <p className="text-sm text-slate-600">{pathway.summary}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(["Preferred", "Other recommended", "Certain circumstances"] as OptionTier[]).map(
              (t) => (
                <span
                  key={t}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIER_STYLE[t]}`}
                >
                  {t}
                </span>
              )
            )}
          </div>

          <ol className="mt-4 space-y-3">
            {pathway.phases.map((phase, pi) => (
              <li key={pi} className="relative pl-7">
                <span className="absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
                  {pi + 1}
                </span>
                <div className="font-semibold text-nccn-navy">{phase.phase}</div>
                {phase.decisionPoint && (
                  <div className="text-xs italic text-slate-500">↳ {phase.decisionPoint}</div>
                )}
                <div className="mt-1.5 space-y-1.5">
                  {phase.options.map((opt, oi) => (
                    <div
                      key={oi}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
                    >
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIER_STYLE[opt.tier]}`}
                      >
                        {opt.tier}
                      </span>
                      <span className="text-sm font-medium text-slate-800">{opt.name}</span>
                      {opt.regimen && (
                        <span className="text-xs text-slate-500">— {opt.regimen}</span>
                      )}
                      <span className="data ml-auto shrink-0 rounded bg-nccn-navy/10 px-2 py-0.5 text-[10px] font-semibold text-nccn-navy">
                        {opt.category}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          {groundError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {groundError}
            </div>
          )}

          {groundedSteps && (
            <div className="mt-4 rounded-xl border-2 border-nccn-pink/40 bg-nccn-pink/[0.04] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-nccn-pink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Grounded in NCCN via Exa
                </span>
                <span className="text-[11px] text-slate-500">
                  {groundedCitations.length} guideline sources cited
                </span>
              </div>
              {groundedSteps.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Exa did not return structured steps for this profile.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {groundedSteps.map((s, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {s.phase}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tierStyle(
                          s.tier
                        )}`}
                      >
                        {s.tier}
                      </span>
                      <span className="text-sm font-medium text-slate-800">{s.option}</span>
                      <span className="data ml-auto shrink-0 rounded bg-nccn-navy/10 px-2 py-0.5 text-[10px] font-semibold text-nccn-navy">
                        {s.category}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {groundedCitations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-nccn-pink/20 pt-3">
                  {groundedCitations.map((c, i) => (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-nccn-pink/30 bg-white px-2.5 py-1 text-[11px] font-medium text-nccn-navy hover:bg-nccn-pink/10"
                    >
                      🔗 {host(c.url)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </StepCard>

        {/* STEP 3 — What's changed since the guideline */}
        <StepCard
          n={3}
          exa
          title="What's changed since the guideline"
          subtitle="Live evidence via Exa — every claim grounded in a cited source"
          action={
            <div className="flex items-center gap-2">
              <select
                value={monthsBack}
                onChange={(e) => setMonthsBack(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                <option value={6}>6 mo</option>
                <option value={12}>12 mo</option>
                <option value={18}>18 mo</option>
                <option value={36}>36 mo</option>
              </select>
              <button
                onClick={runEvidence}
                disabled={loading}
                className="rounded-lg bg-nccn-pink px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                {loading ? "Searching…" : data ? "Refresh" : "Find evidence"}
              </button>
            </div>
          }
        >
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!data && !loading && !error && (
            <p className="py-6 text-center text-sm text-slate-400">
              Hit <span className="font-semibold text-nccn-pink">Find evidence</span> to pull
              the latest cited developments for this patient.
            </p>
          )}

          {loading && (
            <div className="py-8 text-center text-sm text-slate-500">
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-nccn-pink" />
              Retrieving &amp; synthesizing via Exa…
            </div>
          )}

          {data && !loading && (
            <div className="space-y-4">
              {data.brief && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <p className="mb-3 font-semibold text-nccn-navy">{data.brief.headline}</p>
                  <div className="space-y-2.5">
                    {data.brief.developments?.map((d, i) => {
                      const cites = citationsFor(data.grounding, i);
                      return (
                        <div
                          key={i}
                          className="rounded-lg border border-emerald-100 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-nccn-navy">{d.title}</div>
                            {d.affectsGuidelinePoint && (
                              <span className="shrink-0 rounded-full bg-nccn-navy px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                {d.affectsGuidelinePoint}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-slate-700">{d.whatChanged}</div>
                          <div className="mt-1.5 text-xs text-emerald-700">
                            <span className="font-semibold">Why it matters: </span>
                            {d.relevance}
                          </div>
                          {cites.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {cites.map((c, ci) => (
                                <a
                                  key={ci}
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                                >
                                  🔗 {host(c.url)}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* sources with find-similar */}
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                  Retrieved sources
                </div>
                <div className="space-y-2">
                  {data.sources.map((s, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-nccn-blue hover:underline"
                        >
                          {s.title}
                        </a>
                        <div className="flex shrink-0 items-center gap-2">
                          {fmtDate(s.publishedDate) && (
                            <span className="data rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              {fmtDate(s.publishedDate)}
                            </span>
                          )}
                          <button
                            onClick={() => findSimilar(s.url)}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
                              similarFor === s.url
                                ? "border-nccn-pink bg-nccn-pink text-white"
                                : "border-slate-300 text-slate-500 hover:border-nccn-pink hover:text-nccn-pink"
                            }`}
                            title="Find semantically similar studies via Exa"
                          >
                            ⤳ similar
                          </button>
                        </div>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{host(s.url)}</div>
                      {s.highlight && (
                        <p className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs italic text-slate-600">
                          “{s.highlight}”
                        </p>
                      )}

                      {/* similar results panel */}
                      {similarFor === s.url && (
                        <div className="mt-3 rounded-lg border border-nccn-pink/30 bg-nccn-pink/[0.04] p-3">
                          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-nccn-pink">
                            Similar studies via Exa /findSimilar
                          </div>
                          {similarLoading ? (
                            <div className="text-xs text-slate-500">Finding similar…</div>
                          ) : similarData.length === 0 ? (
                            <div className="text-xs text-slate-500">No similar results.</div>
                          ) : (
                            <ul className="space-y-1.5">
                              {similarData.map((r, ri) => (
                                <li key={ri}>
                                  <a
                                    href={r.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm text-nccn-blue hover:underline"
                                  >
                                    {r.title}
                                  </a>
                                  <span className="ml-1 text-[11px] text-slate-400">
                                    · {host(r.url)}
                                    {fmtDate(r.publishedDate)
                                      ? ` · ${fmtDate(r.publishedDate)}`
                                      : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </StepCard>

        {/* STEP 4 — Ask */}
        <StepCard
          n={4}
          exa
          last
          title="Ask about this patient"
          subtitle="Question-first grounded answer via Exa /answer"
        >
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askQuestion()}
              placeholder="e.g. Data on T-DM1 for residual disease after neoadjuvant TCHP?"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-nccn-blue focus:outline-none"
            />
            <button
              onClick={askQuestion}
              disabled={asking || !question.trim()}
              className="rounded-lg bg-nccn-navy px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {asking ? "Asking…" : "Ask Exa"}
            </button>
          </div>

          {answerError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {answerError}
            </div>
          )}
          {answer && (
            <div className="mt-3 rounded-xl border border-nccn-blue/20 bg-nccn-blue/5 p-4">
              <p className="whitespace-pre-wrap text-sm text-slate-800">{answer.answer}</p>
              {answer.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-nccn-blue/10 pt-3">
                  {answer.citations.map((c, i) => (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-nccn-blue/30 bg-white px-2.5 py-1 text-[11px] font-medium text-nccn-blue hover:bg-nccn-blue/10"
                    >
                      🔗 {host(c.url)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </StepCard>

        <footer className="pb-8 pt-2 text-center text-xs text-slate-400">
          Demo only · Exa retrieves &amp; grounds evidence — the treating clinician makes the
          final decision. Not a medical device.
        </footer>
      </main>
    </div>
  );
}
