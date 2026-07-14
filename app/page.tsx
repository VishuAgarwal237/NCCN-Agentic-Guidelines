"use client";

import { useEffect, useState } from "react";
import {
  GUIDELINE_META,
  STAGES,
  SUBTYPES,
  SAMPLE_CASE,
  PATIENT_PERSONAS,
  MONITOR_PRESETS,
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
interface Monitor {
  id: string;
  name: string;
  status: string;
  nextRunAt?: string;
  trigger?: { period?: string };
}
interface Run {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  output?: { results?: { title?: string; url?: string; publishedDate?: string }[] };
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

// Clip a preview to a short, word-boundary excerpt (~a third of a highlight).
function clip(t: string, n = 110) {
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut) + "…";
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

// Grouped bar chart for quantitative answers (e.g. median PFS by regimen).
function PfsChart({
  title,
  data,
}: {
  title?: string;
  data: { label: string; value: number; comparator?: number }[];
}) {
  const hasComp = data.some((d) => typeof d.comparator === "number");
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.comparator ?? 0]));
  const H = 180; // px height for the tallest bar

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {title && (
        <div className="mb-2 text-center text-sm font-semibold text-nccn-navy">
          {title}
        </div>
      )}
      {hasComp && (
        <div className="mb-3 flex justify-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-3 rounded-sm bg-nccn-blue" /> Comparator
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-3 rounded-sm bg-nccn-pink" /> New regimen
          </span>
        </div>
      )}

      <div className="flex items-end gap-3 border-b border-slate-200 pb-0">
        {data.map((d, i) => (
          <div key={i} className="flex flex-1 items-end justify-center gap-1">
            {hasComp && typeof d.comparator === "number" && (
              <div className="flex flex-col items-center">
                <span className="data text-[10px] text-slate-500">{d.comparator}</span>
                <div
                  className="w-7 rounded-t bg-nccn-blue sm:w-9"
                  style={{ height: `${(d.comparator / max) * H}px` }}
                  title={`Comparator: ${d.comparator} mo`}
                />
              </div>
            )}
            <div className="flex flex-col items-center">
              <span className="data text-[10px] font-semibold text-nccn-navy">
                {d.value}
              </span>
              <div
                className="w-7 rounded-t bg-nccn-pink sm:w-9"
                style={{ height: `${(d.value / max) * H}px` }}
                title={`New regimen: ${d.value} mo`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 flex gap-3">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 text-center text-[10px] leading-tight text-slate-500"
          >
            {d.label}
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-center text-[10px] uppercase tracking-wide text-slate-400">
        Median PFS (months)
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

  // evidence (Exa) — three lenses under one step; remembered per patient
  const [lensByPatient, setLensByPatient] = useState<
    Record<string, "changed" | "drugs" | "trials">
  >({});
  const [monthsBack, setMonthsBack] = useState(18);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // find similar (Exa)
  const [similarFor, setSimilarFor] = useState<string | null>(null);
  const [similarData, setSimilarData] = useState<SimilarResult[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  // ask (Exa)
  const [question, setQuestion] = useState(
    "Please provide progression-free survival (PFS) Kaplan–Meier data for the latest breast cancer drugs?"
  );
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{
    answer: string;
    chart?: { label: string; value: number; comparator?: number }[];
    chartTitle?: string;
    citations: { title: string; url: string }[];
  } | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  // recently-approved drugs (Exa /search type=deep)
  const [drugs, setDrugs] = useState<{
    drugs: { name: string; sponsor?: string; indication?: string; approvalDate?: string }[];
    citations: { url: string }[];
  } | null>(null);
  const [drugsLoading, setDrugsLoading] = useState(false);
  const [drugsError, setDrugsError] = useState<string | null>(null);

  // recruiting trials (Exa /search on clinicaltrials.gov)
  const [trials, setTrials] = useState<
    {
      title: string;
      url: string;
      nct?: string;
      publishedDate: string | null;
      highlight: string | null;
    }[]
    | null
  >(null);
  const [trialsLoading, setTrialsLoading] = useState(false);
  const [trialsError, setTrialsError] = useState<string | null>(null);
  const [trialsPage, setTrialsPage] = useState(0);

  // monitors (Exa Monitors API) — global, not per-patient
  const [monitorsOpen, setMonitorsOpen] = useState(false);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [monitorsError, setMonitorsError] = useState<string | null>(null);
  const [monitorBusy, setMonitorBusy] = useState<string | null>(null);
  const [runsByMonitor, setRunsByMonitor] = useState<Record<string, Run[]>>({});

  const subtypeKey = deriveSubtype(er, pr, her2);
  const subtype = SUBTYPES[subtypeKey];
  const pathway = buildPathway(stage, subtypeKey);

  // Remember the selected evidence lens per patient.
  const patientKey = activePersona ?? `${stage}-${er}-${pr}-${her2}`;
  const evidenceTab = lensByPatient[patientKey] ?? "changed";
  const setEvidenceTab = (t: "changed" | "drugs" | "trials") =>
    setLensByPatient((m) => ({ ...m, [patientKey]: t }));

  function resetDownstream() {
    setData(null);
    setAnswer(null);
    setGroundedSteps(null);
    setGroundError(null);
    setSimilarFor(null);
    setDrugs(null);
    setTrials(null);
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

  async function runDrugs() {
    setDrugsLoading(true);
    setDrugsError(null);
    try {
      const res = await fetch("/api/drugs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, er, pr, her2 }),
      });
      const json = await res.json();
      if (!res.ok || json.error) setDrugsError(json.error ?? "Something went wrong.");
      else setDrugs(json);
    } catch (e) {
      setDrugsError((e as Error).message);
    } finally {
      setDrugsLoading(false);
    }
  }

  async function runTrials() {
    setTrialsLoading(true);
    setTrialsError(null);
    setTrialsPage(0);
    try {
      const res = await fetch("/api/trials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, er, pr, her2 }),
      });
      const json = await res.json();
      if (!res.ok || json.error) setTrialsError(json.error ?? "Something went wrong.");
      else setTrials(json.trials ?? []);
    } catch (e) {
      setTrialsError((e as Error).message);
    } finally {
      setTrialsLoading(false);
    }
  }

  async function loadMonitors() {
    try {
      const res = await fetch("/api/monitors");
      const json = await res.json();
      if (!res.ok || json.error) setMonitorsError(json.error ?? "Could not load monitors.");
      else {
        setMonitors(json.monitors ?? []);
        setMonitorsError(null);
      }
    } catch (e) {
      setMonitorsError((e as Error).message);
    }
  }

  useEffect(() => {
    loadMonitors();
  }, []);

  // Load a monitor's run history + latest results (read-only).
  async function loadRunsFor(id: string) {
    try {
      const res = await fetch(`/api/monitors/${id}/runs`);
      const json = await res.json();
      const runs: Run[] = json.runs ?? [];
      setRunsByMonitor((m) => ({ ...m, [id]: runs }));
      const latest = runs[0];
      if (latest?.status === "completed") {
        const dr = await fetch(`/api/monitors/${id}/runs?runId=${latest.id}`);
        const dj = await dr.json();
        setRunsByMonitor((m) => {
          const cur = [...(m[id] ?? runs)];
          if (cur[0]) cur[0] = { ...cur[0], ...dj.run };
          return { ...m, [id]: cur };
        });
      }
    } catch {
      /* history is best-effort */
    }
  }

  // When the panel is opened, populate history for any monitor not yet loaded.
  useEffect(() => {
    if (!monitorsOpen) return;
    monitors.forEach((m) => {
      if (!runsByMonitor[m.id]) loadRunsFor(m.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorsOpen, monitors]);

  async function createMonitor(presetId: string) {
    setMonitorBusy(presetId);
    setMonitorsError(null);
    try {
      const res = await fetch("/api/monitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ presetId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) setMonitorsError(json.error ?? "Could not create monitor.");
      else await loadMonitors();
    } catch (e) {
      setMonitorsError((e as Error).message);
    } finally {
      setMonitorBusy(null);
    }
  }

  async function triggerMonitor(id: string) {
    setMonitorBusy(id);
    try {
      await fetch(`/api/monitors/${id}/trigger`, { method: "POST" });
      // Poll the run history until the latest run completes.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch(`/api/monitors/${id}/runs`);
        const json = await res.json();
        const runs: Run[] = json.runs ?? [];
        setRunsByMonitor((m) => ({ ...m, [id]: runs }));
        const latest = runs[0];
        if (latest && (latest.status === "completed" || latest.status === "failed")) {
          if (latest.status === "completed") {
            const dr = await fetch(`/api/monitors/${id}/runs?runId=${latest.id}`);
            const dj = await dr.json();
            setRunsByMonitor((m) => {
              const cur = [...(m[id] ?? runs)];
              if (cur[0]) cur[0] = { ...cur[0], ...dj.run };
              return { ...m, [id]: cur };
            });
          }
          break;
        }
      }
    } finally {
      setMonitorBusy(null);
    }
  }

  const activePresetIds = new Set(
    monitors.map((m) => (m.name || "").toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-nccn-navy text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-nccn-pink">
              Oncology decision support · powered by Exa
            </div>
            <h1 className="text-xl font-bold">NCCN Agentic Guidelines</h1>
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

        {/* STEP 3 — Live evidence (three Exa lenses) */}
        <StepCard
          n={3}
          exa
          title="Live evidence for this patient"
          subtitle="Three Exa lenses on this profile — grounded & cited"
        >
          {/* lens tabs */}
          <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                ["changed", "What's changed"],
                ["drugs", "Approved drugs"],
                ["trials", "Open trials"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setEvidenceTab(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  evidenceTab === key
                    ? "bg-white text-nccn-navy shadow-sm"
                    : "text-slate-500 hover:text-nccn-navy"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* LENS: what's changed */}
          {evidenceTab === "changed" && (
          <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Developments published since the guideline froze — mapped to the point
              they update.
            </p>
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
          </div>
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
          </div>
          )}

          {/* LENS: approved drugs */}
          {evidenceTab === "drugs" && (
          <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              FDA approvals in this subtype in the last 2 years — deep structured search
              (~10s).
            </p>
            <button
              onClick={runDrugs}
              disabled={drugsLoading}
              className="rounded-lg bg-nccn-pink px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {drugsLoading ? "Scanning…" : drugs ? "Refresh" : "Scan FDA (deep)"}
            </button>
          </div>
          {drugsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {drugsError}
            </div>
          )}
          {!drugs && !drugsLoading && !drugsError && (
            <p className="py-4 text-center text-sm text-slate-400">
              Deep search across FDA sources for drugs approved in this subtype in the
              last 2 years. Slower (~10s) — it runs multiple query angles.
            </p>
          )}
          {drugsLoading && (
            <div className="py-6 text-center text-sm text-slate-500">
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-nccn-pink" />
              Deep search running…
            </div>
          )}
          {drugs && !drugsLoading && (
            <div className="space-y-3">
              {drugs.drugs.length === 0 ? (
                <p className="text-sm text-slate-500">No recent approvals returned.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Drug</th>
                        <th className="px-3 py-2 font-semibold">Sponsor</th>
                        <th className="px-3 py-2 font-semibold">Indication</th>
                        <th className="px-3 py-2 font-semibold">Approved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drugs.drugs.map((d, i) => (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 font-medium text-nccn-navy">{d.name}</td>
                          <td className="px-3 py-2 text-slate-600">{d.sponsor ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{d.indication ?? "—"}</td>
                          <td className="data whitespace-nowrap px-3 py-2 text-slate-600">
                            {d.approvalDate ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {drugs.citations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {drugs.citations.map((c, i) => (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                    >
                      🔗 {host(c.url)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
          )}

          {/* LENS: open trials */}
          {evidenceTab === "trials" && (
          <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Trials currently enrolling patients matching this profile
              (ClinicalTrials.gov).
            </p>
            <button
              onClick={runTrials}
              disabled={trialsLoading}
              className="rounded-lg bg-nccn-pink px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {trialsLoading ? "Searching…" : trials ? "Refresh" : "Find trials"}
            </button>
          </div>
          {trialsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {trialsError}
            </div>
          )}
          {!trials && !trialsLoading && !trialsError && (
            <p className="py-4 text-center text-sm text-slate-400">
              Find trials currently enrolling patients matching this profile.
            </p>
          )}
          {trialsLoading && (
            <div className="py-6 text-center text-sm text-slate-500">
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-nccn-pink" />
              Searching ClinicalTrials.gov…
            </div>
          )}
          {trials && !trialsLoading && (
            <div className="space-y-2">
              {trials.length === 0 ? (
                <p className="text-sm text-slate-500">No trials returned.</p>
              ) : (
                (() => {
                  const pageSize = 6;
                  const totalPages = Math.ceil(trials.length / pageSize);
                  const page = Math.min(trialsPage, totalPages - 1);
                  const shown = trials.slice(page * pageSize, page * pageSize + pageSize);
                  return (
                    <>
                      {shown.map((t, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 p-3">
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-nccn-blue hover:underline"
                          >
                            {t.title}
                          </a>
                          <div className="mt-0.5 flex items-center gap-2">
                            {t.nct && (
                              <span className="data rounded bg-nccn-blue/10 px-1.5 py-0.5 text-[10px] font-semibold text-nccn-blue">
                                {t.nct}
                              </span>
                            )}
                            <span className="data text-xs text-slate-400">
                              {host(t.url)}
                            </span>
                          </div>
                          {t.highlight && (
                            <p className="mt-1.5 line-clamp-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs italic text-slate-600">
                              “{clip(t.highlight)}”
                            </p>
                          )}
                        </div>
                      ))}

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="data text-xs text-slate-400">
                            {page * pageSize + 1}–{page * pageSize + shown.length} of{" "}
                            {trials.length} trials
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setTrialsPage((p) => Math.max(0, p - 1))}
                              disabled={page === 0}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                            >
                              ‹
                            </button>
                            {Array.from({ length: totalPages }).map((_, pi) => (
                              <button
                                key={pi}
                                onClick={() => setTrialsPage(pi)}
                                className={`data h-7 w-7 rounded-md text-xs font-semibold transition ${
                                  pi === page
                                    ? "bg-nccn-navy text-white"
                                    : "border border-slate-300 text-slate-500 hover:text-nccn-navy"
                                }`}
                              >
                                {pi + 1}
                              </button>
                            ))}
                            <button
                              onClick={() =>
                                setTrialsPage((p) => Math.min(totalPages - 1, p + 1))
                              }
                              disabled={page === totalPages - 1}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                            >
                              ›
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          )}
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
              {answer.chart && answer.chart.length > 0 && (
                <div className="mb-4">
                  <PfsChart title={answer.chartTitle} data={answer.chart} />
                </div>
              )}
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

        {/* MONITORS — watch for the "thaw" (Exa Monitors API) — collapsible */}
        <section className="mt-2 rounded-lg border border-nccn-navy/30 bg-white shadow-sm">
          <button
            onClick={() => setMonitorsOpen((o) => !o)}
            className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left"
          >
            <span className="data flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nccn-navy text-xs font-semibold text-white">
              ◎
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-nccn-navy">
                  Monitors — watch for the thaw
                </h2>
                <span className="data rounded bg-nccn-pink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-nccn-pink">
                  Exa
                </span>
                {monitors.length > 0 && (
                  <span className="data rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {monitors.length} active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Scheduled Exa searches for new NCCN versions, FDA approvals &amp;
                regulatory news. {monitorsOpen ? "" : "Click to expand."}
              </p>
            </div>
            <span className="data shrink-0 text-slate-400">
              {monitorsOpen ? "▲" : "▼"}
            </span>
          </button>

          {monitorsOpen && (
          <div className="space-y-4 border-t border-line p-5">
            {monitorsError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {monitorsError}
              </div>
            )}

            {/* create from presets */}
            <div className="flex flex-wrap gap-2">
              {MONITOR_PRESETS.map((p) => {
                const exists = activePresetIds.has(p.name.toLowerCase());
                return (
                  <button
                    key={p.id}
                    onClick={() => createMonitor(p.id)}
                    disabled={monitorBusy === p.id || exists}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      exists
                        ? "border-slate-200 bg-slate-50 text-slate-400"
                        : "border-slate-300 bg-white hover:border-nccn-pink"
                    }`}
                    title={p.query}
                  >
                    <div className="font-semibold">
                      {exists ? "✓ " : "+ "}
                      {p.name}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {monitorBusy === p.id ? "creating…" : exists ? "active" : "create monitor"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* existing monitors */}
            {monitors.length === 0 ? (
              <p className="text-sm text-slate-400">
                No monitors yet. Create one above to start watching.
              </p>
            ) : (
              <div className="space-y-3">
                {monitors.map((m) => {
                  const runs = runsByMonitor[m.id] ?? [];
                  const latest = runs[0];
                  return (
                    <div key={m.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-nccn-navy">{m.name}</div>
                          <div className="data text-[11px] text-slate-400">
                            {m.status} · every {m.trigger?.period ?? "1d"}
                          </div>
                        </div>
                        <button
                          onClick={() => triggerMonitor(m.id)}
                          disabled={monitorBusy === m.id}
                          className="rounded-lg border border-nccn-navy px-3 py-1.5 text-xs font-semibold text-nccn-navy transition hover:bg-nccn-navy hover:text-white disabled:opacity-50"
                        >
                          {monitorBusy === m.id ? "Running…" : "Run now"}
                        </button>
                      </div>

                      {/* run history */}
                      {runs.length > 0 && (
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Run history
                          </div>
                          <div className="space-y-1">
                            {runs.slice(0, 4).map((r) => (
                              <div
                                key={r.id}
                                className="data flex items-center gap-2 text-[11px] text-slate-500"
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    r.status === "completed"
                                      ? "bg-grounded"
                                      : r.status === "failed"
                                      ? "bg-red-400"
                                      : "bg-amber-400"
                                  }`}
                                />
                                {r.status}
                                {r.startedAt
                                  ? ` · ${new Date(r.startedAt).toLocaleString()}`
                                  : ""}
                              </div>
                            ))}
                          </div>

                          {/* latest results */}
                          {latest?.output?.results && latest.output.results.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {latest.output.results.slice(0, 5).map((r, i) => (
                                <a
                                  key={i}
                                  href={r.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-xs text-nccn-blue hover:underline"
                                >
                                  • {r.title ?? r.url}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </section>

        <footer className="pb-8 pt-6 text-center text-xs text-slate-400">
          Demo only · Exa retrieves &amp; grounds evidence — the treating clinician makes the
          final decision. Not a medical device.
        </footer>
      </main>
    </div>
  );
}
