import { FormEvent, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  Database,
  DoorOpen,
  Moon,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const scenarioButtons = [
  { id: "normal" as const, label: "Normal activity", detail: "Daytime · isolated motion", icon: Sun },
  { id: "unusual" as const, label: "3 AM activity", detail: "Sleeping · repeated motion", icon: Moon },
  { id: "repeated" as const, label: "Repeated motion", detail: "Active · short sequence", icon: RotateCcw },
];

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
}

function classificationLabel(classification?: string) {
  if (classification === "high_priority") return "HIGH PRIORITY";
  if (classification === "unusual") return "UNUSUAL";
  return "NORMAL";
}

function classificationTone(classification?: string) {
  if (classification === "high_priority") return "danger";
  if (classification === "unusual") return "warning";
  return "success";
}

export default function Home() {
  const utils = trpc.useUtils();
  const { data: snapshot, isLoading } = trpc.nightwatch.snapshot.useQuery();
  const [question, setQuestion] = useState("Why did you wake me?");
  const [explanation, setExplanation] = useState<{ question: string; answer: string; evidence: string[]; sourceEventIds: string[] }>();
  const simulate = trpc.nightwatch.simulate.useMutation({ onSuccess: () => utils.nightwatch.snapshot.invalidate() });
  const reset = trpc.nightwatch.reset.useMutation({
    onSuccess: () => {
      setExplanation(undefined);
      utils.nightwatch.snapshot.invalidate();
    },
  });
  const setState = trpc.nightwatch.setHouseholdState.useMutation({ onSuccess: () => utils.nightwatch.snapshot.invalidate() });
  const triggerAlert = trpc.nightwatch.triggerAlexaAlert.useMutation({ onSuccess: () => utils.nightwatch.snapshot.invalidate() });
  const askWhy = trpc.nightwatch.askWhy.useMutation({ onSuccess: setExplanation });

  const activityPercent = snapshot?.assessment.score ?? 0;
  const tone = classificationTone(snapshot?.assessment.classification);
  const currentAlert = snapshot?.alerts[0];
  const latestEvent = snapshot?.events[0];
  const activeFactors = snapshot?.assessment.factors.filter(factor => factor.points > 0).length ?? 0;

  const timeLabel = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), []);

  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    askWhy.mutate({ question: question.trim() });
  }

  if (isLoading || !snapshot) {
    return <div className="min-h-screen bg-[#080b10] p-8 text-slate-200">Loading NightWatch command center…</div>;
  }

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100 selection:bg-cyan-300 selection:text-slate-950">
      <div className="mx-auto min-h-screen max-w-[1600px] px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="brand-mark"><ShieldCheck size={23} strokeWidth={2.4} /></div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold tracking-[-0.03em] text-white">NightWatch</h1>
                <span className="eyebrow-pill"><span className="pulse-dot" /> SIMULATOR</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Context-aware home safety & alerting</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden items-center gap-2 text-slate-500 sm:flex"><Wifi size={15} className="text-emerald-400" /> Local control plane</div>
            <div className="status-chip"><span className="status-live" /> System nominal</div>
            <div className="time-chip"><Clock3 size={14} /> {timeLabel}</div>
          </div>
        </header>

        <main className="space-y-6 py-7">
          <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr]">
            <div className="panel panel-hero relative overflow-hidden p-6 sm:p-7">
              <div className="hero-glow" />
              <div className="relative z-10 flex h-full flex-col justify-between gap-8">
                <div>
                  <div className="section-kicker"><span className="kicker-line" /> HOUSEHOLD CONTEXT</div>
                  <div className="mt-5 flex items-end gap-4">
                    <h2 className="text-4xl font-semibold tracking-[-0.05em] text-white">{snapshot.householdState === "sleeping" ? "Sleeping" : "Active"}</h2>
                    <span className="mb-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Live state</span>
                  </div>
                  <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">The context engine weighs time, repetition, location and household state together. It does not make a definitive crime or emergency determination.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={`state-button ${snapshot.householdState === "sleeping" ? "state-button-active" : ""}`} onClick={() => setState.mutate({ householdState: "sleeping" })}><Moon size={15} /> Mark sleeping</button>
                  <button className={`state-button ${snapshot.householdState === "active" ? "state-button-active" : ""}`} onClick={() => setState.mutate({ householdState: "active" })}><Sun size={15} /> Mark active</button>
                </div>
              </div>
            </div>

            <div className="panel flex flex-col justify-between p-6">
              <div className="flex items-start justify-between">
                <div><div className="section-kicker">ACTIVITY LEVEL</div><div className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">{activityPercent}<span className="text-base font-normal text-slate-500"> / 100</span></div></div>
                <div className={`icon-tile icon-tile-${tone}`}><Activity size={19} /></div>
              </div>
              <div className="mt-7">
                <div className="meter-track"><div className={`meter-fill meter-fill-${tone}`} style={{ width: `${Math.max(activityPercent, 3)}%` }} /></div>
                <div className="mt-3 flex justify-between text-xs text-slate-500"><span>Baseline</span><span>{activeFactors} elevating factors</span></div>
              </div>
            </div>

            <div className="panel flex flex-col justify-between p-6">
              <div className="flex items-start justify-between"><div><div className="section-kicker">CURRENT ASSESSMENT</div><div className={`mt-4 text-2xl font-semibold tracking-[-0.04em] tone-${tone}`}>{classificationLabel(snapshot.assessment.classification)}</div></div><div className={`icon-tile icon-tile-${tone}`}><Zap size={19} /></div></div>
              <div className="mt-5 flex items-end justify-between"><p className="max-w-[220px] text-xs leading-5 text-slate-500">{snapshot.assessment.comparedWithBaseline}</p><span className="text-xs text-slate-600">{snapshot.events.length} event{snapshot.events.length === 1 ? "" : "s"}</span></div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr_0.85fr]">
            <div className="panel min-h-[430px] overflow-hidden">
              <div className="panel-heading"><div><div className="section-kicker">RING EVENT TIMELINE</div><h3 className="panel-title">Recent motion activity</h3></div><span className="count-badge">{snapshot.events.length} events</span></div>
              <div className="divide-y divide-white/[0.07]">
                {snapshot.events.length === 0 ? <div className="empty-state"><DoorOpen size={23} /><span>No simulated events yet.</span><span className="text-xs text-slate-600">Run a scenario to populate the timeline.</span></div> : snapshot.events.map((event, index) => (
                  <div className="timeline-row" key={event.id}>
                    <div className={`timeline-marker ${index === 0 ? "timeline-marker-active" : ""}`}><div /></div>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-200">{event.eventType}</span><span className="mini-tag">{event.location}</span><span className="mini-tag">{event.householdState}</span></div><div className="mt-2 text-xs text-slate-500">{event.deviceName} <span className="mx-1.5 text-slate-700">·</span> {formatDate(event.timestamp)}</div></div>
                    <div className="text-right"><div className="font-mono text-xs text-slate-300">{formatTime(event.timestamp)}</div><div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-slate-600">{String(event.metadata.zone)}</div></div>
                  </div>
                ))}
              </div>
              <div className="panel-footer"><span className="flex items-center gap-2"><span className="legend-dot legend-dot-ring" /> Ring simulator input</span><span>Normalized server-side</span></div>
            </div>

            <div className="panel min-h-[430px]">
              <div className="panel-heading"><div><div className="section-kicker">CONTEXT ANALYSIS</div><h3 className="panel-title">Why this score?</h3></div><Sparkles size={17} className="text-cyan-300" /></div>
              <div className="space-y-4 p-5">
                {snapshot.assessment.factors.map(factor => <div className="factor-row" key={factor.key}><div className={`factor-icon ${factor.points > 0 ? "factor-icon-on" : ""}`}>{factor.points > 0 ? <ArrowUpRight size={14} /> : <Check size={14} />}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-300">{factor.label}</span><span className={`font-mono text-xs ${factor.points > 0 ? "text-cyan-300" : "text-slate-600"}`}>{factor.points > 0 ? `+${factor.points}` : "—"}</span></div><p className="mt-1 text-[11px] leading-4 text-slate-600">{factor.detail}</p></div></div>)}
              </div>
              <div className="border-t border-white/[0.07] px-5 py-4"><div className="flex justify-between text-[11px] uppercase tracking-[0.12em] text-slate-600"><span>Household baseline</span><span>{snapshot.baseline.typicalEventsPerHour} events / hour</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{snapshot.baseline.description}</p></div>
            </div>

            <div className="space-y-6">
              <div className={`panel escalation-panel escalation-${tone}`}>
                <div className="panel-heading"><div><div className="section-kicker">ESCALATION DECISION</div><h3 className={`panel-title tone-${tone}`}>{snapshot.decision.escalated ? "Review recommended" : "No escalation"}</h3></div><AlertTriangle size={19} className={snapshot.decision.escalated ? "text-amber-300" : "text-emerald-300"} /></div>
                <div className="p-5"><div className="decision-callout"><div className={`decision-status decision-status-${tone}`}>{snapshot.decision.escalated ? "ESCALATED" : "CLEAR"}</div><p className="mt-3 text-sm leading-6 text-slate-300">{snapshot.decision.reason}</p></div>{snapshot.decision.escalated && <div className="mt-5 text-xs leading-5 text-slate-500">The deterministic decision is separate from future AI interpretation. Human judgment remains required.</div>}</div>
              </div>

              <div className="panel alexa-panel">
                <div className="panel-heading"><div><div className="section-kicker">ALEXA DESTINATION</div><h3 className="panel-title">Bedroom Echo</h3></div><div className="alexa-orb"><BellRing size={16} /></div></div>
                <div className="p-5"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-400"><span className="status-live" /> Simulation ready</span><span className="text-slate-600">Alexa+ path</span></div><div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-xs leading-5 text-slate-400">{currentAlert?.message ?? "No alert queued. Run the 3 AM scenario to create an escalation."}</div><button className="primary-button mt-4 w-full" disabled={!currentAlert || triggerAlert.isPending} onClick={() => triggerAlert.mutate()}><BellRing size={15} /> {currentAlert?.status === "delivered" ? "Alert delivered" : "Trigger Alexa alert"}</button></div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
            <div className="panel p-6">
              <div className="flex items-start justify-between"><div><div className="section-kicker">EVENT SIMULATOR</div><h3 className="panel-title">Drive the demo</h3><p className="mt-2 max-w-md text-sm leading-5 text-slate-500">Generate normalized Ring events without live credentials. The 3 AM scenario is the primary judging path.</p></div><Database size={19} className="text-slate-600" /></div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">{scenarioButtons.map(scenario => { const Icon = scenario.icon; return <button key={scenario.id} className={`scenario-button ${snapshot.lastScenario === scenario.id ? "scenario-button-selected" : ""}`} onClick={() => simulate.mutate({ scenario: scenario.id })}><Icon size={17} /><span className="text-left"><strong>{scenario.label}</strong><small>{scenario.detail}</small></span><ChevronRight size={15} className="ml-auto text-slate-600" /></button>; })}</div>
              <button className="secondary-button mt-4" onClick={() => reset.mutate()}><X size={15} /> Reset simulation</button>
            </div>

            <div className="panel p-6">
              <div className="section-kicker">WHY DID YOU WAKE ME?</div><h3 className="panel-title">Contextual explanation</h3>
              <form className="mt-5 flex gap-2" onSubmit={submitQuestion}><input className="text-input" value={question} onChange={event => setQuestion(event.target.value)} aria-label="Ask NightWatch a question" /><button className="send-button" disabled={askWhy.isPending}><Send size={16} /></button></form>
              {explanation ? <div className="answer-card mt-4"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.13em] text-cyan-300"><Sparkles size={13} /> Grounded in this assessment</div><p className="mt-3 text-sm leading-6 text-slate-300">{explanation.answer}</p><div className="mt-4 space-y-2">{explanation.evidence.map(item => <div className="flex gap-2 text-xs leading-5 text-slate-500" key={item}><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-300" />{item}</div>)}</div></div> : <div className="answer-empty mt-4"><span>Ask a question after an escalation.</span><span className="text-xs text-slate-600">The response will cite the actual event IDs and context factors.</span></div>}
            </div>
          </section>

          <section className="integration-strip"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.15em] text-slate-400"><ShieldCheck size={15} className="text-cyan-300" /> Integration readiness</div><div className="integration-items"><span><i className="integration-dot dot-cyan" /> Ring <b>{snapshot.architecture.ring}</b></span><span><i className="integration-dot dot-violet" /> Alexa+ <b>{snapshot.architecture.alexa}</b></span><span><i className="integration-dot dot-slate" /> AWS <b>{snapshot.architecture.aws}</b></span><span><i className="integration-dot dot-emerald" /> MCP <b>{snapshot.architecture.mcp}</b></span></div></section>
        </main>
      </div>
    </div>
  );
}
