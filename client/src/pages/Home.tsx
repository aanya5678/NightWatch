import type React from 'react'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import type { NightWatchSnapshot } from '../../../server/nightwatch/types'
import type { AlexaSimulationSnapshot } from '../../../server/nightwatch/alexaSimulation'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type NavSection = 'overview' | 'activity' | 'context' | 'mcp' | 'alexa' | 'system' | 'settings'
type Scenario   = 'normal' | 'unusual' | 'repeated' | 'reset'
type Classification = 'NORMAL' | 'ELEVATED' | 'UNUSUAL' | 'HIGH_PRIORITY'
type Priority   = 'LOW' | 'MEDIUM' | 'HIGH'
type Direction  = 'risk' | 'safe' | 'neutral'

interface ContextFactor {
  label: string
  value: string
  contribution: number
  direction: Direction
}

interface MotionEvent {
  id: string
  timestamp: string
  location: string
  type: string
  duration: number
  anomalous: boolean
}

interface ScenarioData {
  score: number
  classification: Classification
  escalate: boolean
  escalationLabel: string
  householdState: 'HOME' | 'AWAY' | 'ASLEEP' | 'VACATION'
  locationContext: string
  timeContext: string
  baseline: string
  occupants: number | null
  factors: ContextFactor[]
  events: MotionEvent[]
  priority: Priority
  evidence: string[]
  sourceEventIds: string[]
  alexaResponse: string
  narrationProvider: 'Deterministic fallback' | 'Amazon Bedrock'
  alertStatus: 'pending' | 'delivered' | null
}

// ─── SCENARIO DATA ────────────────────────────────────────────────────────────

function snapshotToScenarioData(snapshot: NightWatchSnapshot, alexaSnapshot: AlexaSimulationSnapshot | undefined): ScenarioData {
  const events = snapshot.events.map(event => ({
    id: event.id,
    timestamp: new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    location: event.location,
    type: event.eventType,
    duration: typeof event.metadata.duration === 'number' ? event.metadata.duration : 0,
    anomalous: snapshot.decision.escalated,
  }))
  const locations = Array.from(new Set(snapshot.events.map(event => event.location)))
  const first = snapshot.events[0]?.timestamp
  const last = snapshot.events.at(-1)?.timestamp
  const timeContext = first
    ? `${new Date(first).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${last && last !== first ? `–${new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
    : 'No events recorded'
  const latestInteraction = alexaSnapshot?.interaction
  const priority: Priority = snapshot.decision.priority === 'high_priority'
    ? 'HIGH'
    : snapshot.decision.priority === 'unusual'
      ? 'MEDIUM'
      : 'LOW'
  const classification: Classification = snapshot.assessment.classification === 'high_priority'
    ? 'HIGH_PRIORITY'
    : snapshot.assessment.classification === 'unusual'
      ? 'UNUSUAL'
      : 'NORMAL'

  return {
    score: snapshot.assessment.score,
    classification,
    escalate: snapshot.decision.escalated,
    escalationLabel: snapshot.decision.escalated ? 'Escalation recommended by context engine' : 'No escalation required',
    householdState: snapshot.householdState === 'sleeping' ? 'ASLEEP' : 'HOME',
    locationContext: locations.length > 0 ? locations.join(' · ') : '—',
    timeContext,
    baseline: snapshot.baseline.description,
    occupants: null,
    factors: snapshot.assessment.factors.map(factor => ({
      label: factor.label,
      value: factor.detail,
      contribution: factor.points,
      direction: factor.points > 0 ? 'risk' : 'neutral',
    })),
    events,
    priority,
    evidence: snapshot.assessment.factors.filter(factor => factor.points > 0).map(factor => factor.detail),
    sourceEventIds: snapshot.decision.escalated
      ? snapshot.events.map(event => event.id)
      : [],
    alexaResponse: latestInteraction?.response ?? snapshot.decision.alertMessage ?? snapshot.assessment.summary,
    narrationProvider: latestInteraction?.narrationProvider === 'bedrock' ? 'Amazon Bedrock' : 'Deterministic fallback',
    alertStatus: snapshot.alerts[0]?.status ?? null,
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function classificationStyle(c: Classification): { color: string; bg: string; border: string; label: string } {
  switch (c) {
    case 'NORMAL':       return { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.18)',  label: 'Normal' }
    case 'ELEVATED':     return { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)',   label: 'Elevated' }
    case 'UNUSUAL':      return { color: '#fb923c', bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.2)',   label: 'Unusual' }
    case 'HIGH_PRIORITY':return { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.22)', label: 'High Priority' }
  }
}

function priorityStyle(p: Priority): { color: string; bg: string; border: string } {
  switch (p) {
    case 'LOW':    return { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.18)' }
    case 'MEDIUM': return { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' }
    case 'HIGH':   return { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.22)' }
  }
}

function scoreColor(s: number): string {
  if (s === 0)  return '#243350'
  if (s < 25)   return '#4ade80'
  if (s < 50)   return '#f59e0b'
  if (s < 75)   return '#fb923c'
  return '#f87171'
}

function directionColor(dir: Direction, contribution: number): string {
  if (dir === 'neutral') return '#4a6480'
  if (dir === 'safe')    return '#4ade80'
  return contribution > 25 ? '#f87171' : '#f59e0b'
}

// ─── ICONS (inline SVG) ───────────────────────────────────────────────────────

const IC = {
  eye:      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  zap:      <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />,
  cpu:      <><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" /></>,
  plug:     <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />,
  mic:      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />,
  server:   <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v.75a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75v-.75m19.5 0a.75.75 0 0 0 .75-.75v-5.25a.75.75 0 0 0-.75-.75H3a.75.75 0 0 0-.75.75v5.25a.75.75 0 0 0 .75.75h18.75Zm-18-6V6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 .75.75V10.5" />,
  settings: <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  chevron:  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />,
  shield:   <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />,
  home:     <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />,
  check:    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />,
  close:    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />,
  warning:  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />,
  arrow:    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />,
  info:     <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />,
  beaker:   <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 1-6.23-.693L5 14.5m14.8.8 1.402 1.402c1 1 .03 2.798-1.414 2.798H4.213c-1.444 0-2.414-1.798-1.414-2.798L5 14.5" />,
}

function Icon({ name, size = 16, className = '', style }: { name: keyof typeof IC; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} style={style}>
      {IC[name]}
    </svg>
  )
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────

function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl border flex flex-col ${className}`}
      style={{ backgroundColor: '#0d1420', borderColor: '#1e2d45', ...style }}
    >
      {children}
    </div>
  )
}

function PanelHeader({ title, badge, right }: { title: string; badge?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #1e2d45' }}>
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold tracking-wide" style={{ color: '#dce6f5' }}>{title}</span>
        {badge}
      </div>
      {right && <div>{right}</div>}
    </div>
  )
}

function Chip({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      {label}
    </span>
  )
}

function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${pulse ? 'anim-pulse' : ''}`}
      style={{ backgroundColor: color }} />
  )
}

function Mono({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`font-mono text-xs ${className}`} style={{ fontFamily: "'JetBrains Mono', monospace", ...style }}>
      {children}
    </span>
  )
}

// ─── SCORE METER ──────────────────────────────────────────────────────────────

function ScoreMeter({ score }: { score: number }) {
  const r = 72, cx = 96, cy = 94
  const arcLen = Math.PI * r
  const progress = score / 100
  const col = scoreColor(score)

  return (
    <svg viewBox="0 0 192 100" className="w-full max-w-[260px] mx-auto" aria-label={`Score ${score} out of 100`}>
      {/* Tick marks */}
      {[0, 25, 50, 75, 100].map((tick) => {
        const angle = Math.PI * (tick / 100)
        const x1 = cx + (r - 16) * Math.cos(Math.PI - angle)
        const y1 = cy - (r - 16) * Math.sin(Math.PI - angle)
        const x2 = cx + (r - 10) * Math.cos(Math.PI - angle)
        const y2 = cy - (r - 10) * Math.sin(Math.PI - angle)
        return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e2d45" strokeWidth="1.5" strokeLinecap="round" />
      })}
      {/* Track */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#1e2d45" strokeWidth="10" strokeLinecap="round" />
      {/* Arc glow */}
      {score > 0 && (
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={col} strokeWidth="14" strokeLinecap="round" strokeOpacity="0.12"
          strokeDasharray={arcLen} strokeDashoffset={arcLen * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.4s' }} />
      )}
      {/* Arc */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={arcLen} strokeDashoffset={arcLen * (1 - progress)}
        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.4s' }} />
      {/* Score text */}
      <text x={cx} y={cy - 14} textAnchor="middle" fill={score === 0 ? '#4a6480' : '#dce6f5'}
        fontSize="34" fontWeight="700" fontFamily="Inter, sans-serif"
        style={{ transition: 'fill 0.4s' }}>
        {score}
      </text>
      <text x={cx} y={cy + 4} textAnchor="middle" fill="#4a6480" fontSize="11" fontFamily="Inter, sans-serif">
        / 100
      </text>
      {/* Labels */}
      <text x={cx - r + 4} y={cy + 16} fill="#4a6480" fontSize="9" fontFamily="Inter, sans-serif">0</text>
      <text x={cx + r - 8} y={cy + 16} fill="#4a6480" fontSize="9" fontFamily="Inter, sans-serif">100</text>
    </svg>
  )
}

// ─── FACTOR BAR ───────────────────────────────────────────────────────────────

function FactorBar({ contribution, direction }: { contribution: number; direction: Direction }) {
  const col = directionColor(direction, contribution)
  const w = Math.min(Math.abs(contribution) / 45 * 100, 100)
  return (
    <div className="relative h-1 w-24 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2d45' }}>
      <div className="absolute top-0 h-full rounded-full" style={{
        left: direction === 'safe' ? `${100 - w}%` : 0,
        width: `${w}%`,
        backgroundColor: col,
        opacity: 0.8,
        transition: 'width 0.6s ease',
      }} />
    </div>
  )
}

// ─── PANEL 1: CURRENT ASSESSMENT ─────────────────────────────────────────────

function CurrentAssessmentPanel({ data }: { data: ScenarioData }) {
  const cs = classificationStyle(data.classification)
  const col = scoreColor(data.score)

  return (
    <Card className="min-h-[220px]">
      <PanelHeader
        title="Current Assessment"
        badge={
          <Chip label="Deterministic Context Engine" color="#22d3ee"
            bg="rgba(34,211,238,0.07)" border="rgba(34,211,238,0.18)" />
        }
        right={
          <span className="text-xs" style={{ color: '#4a6480', fontFamily: "'JetBrains Mono', monospace" }}>CE v1.0.0</span>
        }
      />
      <div className="flex gap-0 flex-1">
        {/* Gauge */}
        <div className="flex flex-col items-center justify-center px-6 py-5 w-[260px] flex-shrink-0">
          <ScoreMeter score={data.score} />
          <div className="mt-2 text-center">
            <Chip label={cs.label.toUpperCase()} color={cs.color} bg={cs.bg} border={cs.border} />
          </div>
        </div>
        {/* Details */}
        <div className="flex-1 flex flex-col justify-center gap-4 px-6 py-5 border-l" style={{ borderColor: '#1e2d45' }}>
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: '#4a6480' }}>Escalation Status</div>
            <div className="flex items-center gap-2">
              <Dot color={data.escalate ? '#f87171' : '#4ade80'} pulse={data.escalate} />
              <span className="text-sm font-medium" style={{ color: data.escalate ? '#f87171' : '#4ade80' }}>
                {data.escalationLabel}
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: '#4a6480' }}>Score Breakdown</div>
            <div className="flex items-end gap-1" style={{ height: 28 }}>
              {[12, 18, 8, 24, 16, 22, 10, 28, 14, 32, 8, 16].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm" style={{
                  height: `${(h / 32) * 100}%`,
                  backgroundColor: i < (data.score / 100 * 12) ? col : '#1e2d45',
                  opacity: i < (data.score / 100 * 12) ? 0.7 + (i / 24) : 0.4,
                  transition: 'background-color 0.5s, opacity 0.5s',
                }} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs mb-0.5" style={{ color: '#4a6480' }}>Priority</div>
              <Chip
                label={data.priority}
                color={priorityStyle(data.priority).color}
                bg={priorityStyle(data.priority).bg}
                border={priorityStyle(data.priority).border}
              />
            </div>
            <div>
              <div className="text-xs mb-0.5" style={{ color: '#4a6480' }}>Events Assessed</div>
              <span className="text-sm font-semibold" style={{ color: '#dce6f5' }}>
                {data.events.length} event{data.events.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t flex items-center gap-1.5" style={{ borderColor: '#1e2d45' }}>
            <Icon name="shield" size={13} className="flex-shrink-0" style={{ color: '#22d3ee' } as React.CSSProperties} />
            <span className="text-xs" style={{ color: '#4a6480' }}>
              Assessed by NightWatch Deterministic Context Engine — Bedrock does not influence this decision
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── PANEL 2: HOUSEHOLD CONTEXT ───────────────────────────────────────────────

function HouseholdContextPanel({ data }: { data: ScenarioData }) {
  const stateColor: Record<string, string> = {
    HOME: '#22d3ee', AWAY: '#f59e0b', ASLEEP: '#8b5cf6', VACATION: '#94a8c0'
  }
  const col = stateColor[data.householdState] ?? '#94a8c0'

  const rows = [
    { label: 'Household State', value: data.householdState, accent: col },
    { label: 'Location Context', value: data.locationContext, accent: null },
    { label: 'Time Context', value: data.timeContext, accent: null },
    { label: 'Baseline', value: data.baseline, accent: null },
    { label: 'Occupants', value: `${data.occupants} person${data.occupants !== null && data.occupants !== 1 ? 's' : ''}`, accent: null },
  ]

  return (
    <Card>
      <PanelHeader title="Household Context" badge={
        <Dot color={col} pulse />
      } />
      <div className="px-5 py-4 flex flex-col gap-3">
        {rows.map(({ label, value, accent }) => (
          <div key={label}>
            <div className="text-xs mb-0.5" style={{ color: '#4a6480' }}>{label}</div>
            <div className="text-sm font-medium" style={{ color: accent ?? '#dce6f5' }}>{value}</div>
          </div>
        ))}
      </div>
      <div className="mx-5 mb-5 mt-auto rounded-lg px-3 py-2.5 text-xs leading-relaxed"
        style={{ backgroundColor: '#111927', color: '#4a6480', border: '1px solid #1e2d45' }}>
        Context is derived from SQLite event log + household configuration. Updated on each engine evaluation.
      </div>
    </Card>
  )
}

// ─── PANEL 3: CONTEXT FACTORS ─────────────────────────────────────────────────

function ContextFactorsPanel({ data }: { data: ScenarioData }) {
  return (
    <Card>
      <PanelHeader title="Context Factors" badge={
        <span className="text-xs" style={{ color: '#4a6480' }}>{data.factors.length} signals</span>
      } />
      <div className="px-5 py-4 flex flex-col gap-1">
        {data.factors.map((f) => {
          const col = directionColor(f.direction, f.contribution)
          const show = Math.abs(f.contribution)
          return (
            <div key={f.label} className="py-2.5 border-b last:border-0" style={{ borderColor: '#111927' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: '#94a8c0' }}>{f.label}</span>
                <span className="text-xs font-semibold font-mono tabular-nums" style={{
                  color: col,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {f.contribution === 0 ? '±0' : f.contribution > 0 ? `+${f.contribution}` : `${f.contribution}`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs truncate" style={{ color: '#4a6480' }}>{f.value}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <FactorBar contribution={f.contribution} direction={f.direction} />
                  {show > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col }} />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── PANEL 4: EVENT TIMELINE ──────────────────────────────────────────────────

function EventTimelinePanel({ data }: { data: ScenarioData }) {
  return (
    <Card>
      <PanelHeader
        title="Event Timeline"
        badge={
          data.events.some(e => e.anomalous)
            ? <Chip label="ANOMALIES DETECTED" color="#f59e0b" bg="rgba(245,158,11,0.08)" border="rgba(245,158,11,0.2)" />
            : <Chip label="ALL NOMINAL" color="#4ade80" bg="rgba(74,222,128,0.07)" border="rgba(74,222,128,0.18)" />
        }
        right={
          <span className="text-xs" style={{ color: '#4a6480' }}>Ring Simulator → SQLite</span>
        }
      />
      <div className="px-5 py-4">
        {data.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Icon name="eye" size={20} className="opacity-30" style={{ color: '#4a6480' } as React.CSSProperties} />
            <span className="text-sm" style={{ color: '#4a6480' }}>No events recorded</span>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ backgroundColor: '#1e2d45' }} />
            <div className="flex flex-col gap-0">
              {data.events.map((ev, i) => {
                const dotColor = ev.anomalous ? '#f59e0b' : '#4ade80'
                return (
                  <div key={ev.id} className="flex gap-4 py-3 group relative" style={{
                    animationDelay: `${i * 60}ms`
                  }}>
                    <div className="relative flex-shrink-0 mt-0.5">
                      <div className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center z-10 relative"
                        style={{ backgroundColor: '#0d1420', borderColor: dotColor }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
                      </div>
                    </div>
                    <div className="flex-1 flex items-start justify-between min-w-0 pr-1">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <Mono className="text-nw-t2">{ev.id}</Mono>
                          {ev.anomalous && (
                            <span className="text-[10px] font-semibold tracking-wider"
                              style={{ color: '#f59e0b' }}>ANOMALOUS</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: '#dce6f5' }}>{ev.location}</span>
                          <span className="text-xs" style={{ color: '#4a6480' }}>·</span>
                          <span className="text-xs" style={{ color: '#94a8c0' }}>{ev.type}</span>
                          <span className="text-xs" style={{ color: '#4a6480' }}>·</span>
                          <span className="text-xs" style={{ color: '#4a6480' }}>{ev.duration > 0 ? `${ev.duration}s` : '—'}</span>
                        </div>
                      </div>
                      <Mono className="flex-shrink-0 ml-3" style={{ color: '#4a6480' } as React.CSSProperties}>
                        {ev.timestamp}
                      </Mono>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── PANEL 5: ESCALATION DECISION ────────────────────────────────────────────

function EscalationPanel({ data }: { data: ScenarioData }) {
  const ps = priorityStyle(data.priority)

  return (
    <Card>
      <PanelHeader
        title="Escalation Decision"
        badge={
          <Chip
            label="NIGHTWATCH DETERMINISTIC ENGINE"
            color="#22d3ee" bg="rgba(34,211,238,0.07)" border="rgba(34,211,238,0.15)"
          />
        }
      />
      <div className="px-5 py-5 grid grid-cols-2 gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: '#4a6480' }}>Decision</div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: data.escalate ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.08)' }}>
                <Icon name={data.escalate ? 'warning' : 'check'} size={16}
                  style={{ color: data.escalate ? '#f87171' : '#4ade80' } as React.CSSProperties} />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: data.escalate ? '#f87171' : '#4ade80' }}>
                  {data.escalate ? 'Escalate' : 'No Escalation'}
                </div>
                <div className="text-xs" style={{ color: '#4a6480' }}>{data.escalationLabel}</div>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: '#4a6480' }}>Priority Level</div>
            <Chip label={data.priority} color={ps.color} bg={ps.bg} border={ps.border} />
          </div>
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: '#4a6480' }}>Source Event IDs</div>
            <div className="flex flex-wrap gap-1.5">
              {data.sourceEventIds.length === 0
                ? <span className="text-xs" style={{ color: '#4a6480' }}>—</span>
                : data.sourceEventIds.map(id => (
                    <Mono key={id} className="px-1.5 py-0.5 rounded" style={{
                      color: '#94a8c0', backgroundColor: '#111927', border: '1px solid #1e2d45'
                    } as React.CSSProperties}>
                      {id}
                    </Mono>
                  ))
              }
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium mb-2" style={{ color: '#4a6480' }}>Evidence</div>
          <div className="flex flex-col gap-2">
            {data.evidence.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-xs" style={{ color: '#94a8c0' }}>
                <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: '#4a6480' }} />
                {ev}
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t" style={{ borderColor: '#1e2d45' }}>
            <div className="text-xs leading-relaxed" style={{ color: '#4a6480' }}>
              This decision is made exclusively by the NightWatch Deterministic Context Engine. Amazon Bedrock narrates the result — it does not assess, modify, or override it.
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── PANEL 6: ALEXA+ INTERACTION ─────────────────────────────────────────────

function AlexaPanel({ data, bedrockEnabled, alexaSnapshot, onAsk, onTriggerAlert }: { data: ScenarioData; bedrockEnabled: boolean; alexaSnapshot?: AlexaSimulationSnapshot; onAsk: (question: string) => void; onTriggerAlert: () => void }) {
  const provider = bedrockEnabled ? 'Amazon Bedrock' : 'Deterministic fallback'
  const providerColor = bedrockEnabled ? '#8b5cf6' : '#4a6480'

  return (
    <Card>
      <PanelHeader
        title="Alexa+ Interaction"
        badge={
          <Chip label="SIMULATED" color="#f59e0b" bg="rgba(245,158,11,0.08)" border="rgba(245,158,11,0.2)" />
        }
      />
      <div className="px-5 pb-2 pt-3 flex-1 flex flex-col gap-3">
        {/* NightWatch prompt */}
        <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.12)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
            <span className="text-xs font-semibold" style={{ color: '#22d3ee' }}>NightWatch</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: '#dce6f5' }}>
            {data.events.length > 0
              ? `Unusual activity detected near ${data.locationContext}. ${data.events.filter(e => e.anomalous).length} anomalous event${data.events.filter(e => e.anomalous).length !== 1 ? 's' : ''} flagged.`
              : 'All systems nominal. No unusual activity detected.'
            }
          </p>
        </div>

        {data.escalate && (
          <>
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg px-3 py-2.5" style={{ backgroundColor: '#162035', border: '1px solid #1e2d45' }}>
                <p className="text-xs" style={{ color: '#94a8c0' }}>"Why did you wake me?"</p>
              </div>
            </div>
            {/* NightWatch response */}
            <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.12)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
                <span className="text-xs font-semibold" style={{ color: '#22d3ee' }}>NightWatch</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#dce6f5' }}>{alexaSnapshot?.interaction?.response ?? data.alexaResponse}</p>
            </div>
          </>
        )}

        <button
          disabled={!data.escalate || data.alertStatus === 'delivered'}
          onClick={onTriggerAlert}
          className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
          style={{ color: data.alertStatus === 'delivered' ? '#4ade80' : '#fcd34d', backgroundColor: data.alertStatus === 'delivered' ? 'rgba(74,222,128,0.07)' : 'rgba(245,158,11,0.08)', border: `1px solid ${data.alertStatus === 'delivered' ? 'rgba(74,222,128,0.18)' : 'rgba(245,158,11,0.2)'}` }}
        >
          {data.alertStatus === 'delivered' ? 'Simulated alert delivered' : data.escalate ? 'Trigger simulated Alexa alert' : 'No alert to deliver'}
        </button>

        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {["Why did you wake me?", "What happened?", "How many events were detected?", "Where did they happen?", "Was this unusual compared with the baseline?"].map(question => (
            <button key={question} onClick={() => onAsk(question)} className="text-[10px] text-left rounded px-2 py-1.5" style={{ color: '#94a8c0', backgroundColor: '#111927', border: '1px solid #1e2d45' }}>{question}</button>
          ))}
        </div>

        {!data.escalate && (
          <div className="flex-1 flex flex-col items-center justify-center py-2 gap-1">
            <Icon name="check" size={16} style={{ color: '#4ade80' } as React.CSSProperties} />
            <span className="text-xs" style={{ color: '#4a6480' }}>No escalation — no interaction needed</span>
          </div>
        )}
      </div>

      <div className="mx-5 mb-4 mt-3 rounded-lg px-3 py-2.5 flex items-center justify-between"
        style={{ backgroundColor: '#111927', border: '1px solid #1e2d45' }}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#4a6480' }}>Narration provider</span>
          <span className="text-xs font-semibold" style={{ color: providerColor }}>{provider}</span>
        </div>
        <div className="text-[10px] text-right" style={{ color: '#4a6480' }}>
          Powered by<br />NightWatch MCP
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="text-[10px] leading-relaxed" style={{ color: '#4a6480', borderTop: '1px solid #1e2d45', paddingTop: '10px' }}>
          This simulates Alexa+ receiving context from NightWatch via MCP. Physical Echo control is not implemented.
        </div>
      </div>
    </Card>
  )
}

// ─── PANEL 7: MCP PANEL ───────────────────────────────────────────────────────

const MCP_TOOLS = [
  { name: 'get_recent_events', desc: 'Retrieve recent motion events from SQLite log' },
  { name: 'get_home_context', desc: 'Return current household state and configuration' },
  { name: 'assess_activity', desc: 'Run deterministic context evaluation on events' },
  { name: 'get_alert_explanation', desc: 'Retrieve grounded escalation explanation' },
]

function MCPPanel() {
  return (
    <Card>
      <PanelHeader
        title="NightWatch MCP"
        badge={
          <div className="flex items-center gap-1.5">
            <Dot color="#4ade80" pulse />
            <span className="text-xs font-medium" style={{ color: '#4ade80' }}>Operational</span>
          </div>
        }
      />
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Transport', value: 'Streamable HTTP' },
            { label: 'Spec', value: 'MCP 2025-11-25' },
            { label: 'Auth', value: 'Local (dev)' },
            { label: 'Tools', value: '4 registered' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded px-2.5 py-2" style={{ backgroundColor: '#111927', border: '1px solid #1e2d45' }}>
              <div style={{ color: '#4a6480' }}>{label}</div>
              <div className="font-medium mt-0.5" style={{ color: '#dce6f5' }}>{value}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-xs font-medium mb-2" style={{ color: '#4a6480' }}>Registered Tools</div>
          <div className="flex flex-col gap-1.5">
            {MCP_TOOLS.map((t) => (
              <div key={t.name} className="flex items-start gap-2.5 rounded px-3 py-2"
                style={{ backgroundColor: '#111927', border: '1px solid #1e2d45' }}>
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: '#22d3ee' }} />
                <div>
                  <Mono className="block" style={{ color: '#22d3ee' } as React.CSSProperties}>{t.name}</Mono>
                  <span className="text-[11px]" style={{ color: '#4a6480' }}>{t.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] leading-relaxed pt-1" style={{ color: '#3d5470' }}>
          Not affiliated with or certified by Amazon or Alexa. Hackathon prototype only.
        </div>
      </div>
    </Card>
  )
}

// ─── PANEL 8: BEDROCK STATUS ──────────────────────────────────────────────────

function BedrockPanel({ data, enabled }: { data: ScenarioData; enabled: boolean }) {
  return (
    <Card>
      <PanelHeader title="Narration Engine" badge={<Chip label={enabled ? 'ACTIVE' : 'DISABLED BY DEFAULT'} color={enabled ? '#8b5cf6' : '#4a6480'} bg={enabled ? 'rgba(139,92,246,0.08)' : 'rgba(74,100,128,0.08)'} border={enabled ? 'rgba(139,92,246,0.18)' : 'rgba(74,100,128,0.18)'} />} />
      <div className="px-5 py-4 flex flex-col gap-4">
        {/* Key statement */}
        <div className="rounded-xl px-4 py-5 text-center" style={{
          backgroundColor: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)'
        }}>
          <div className="text-sm font-bold tracking-widest leading-tight" style={{ color: '#8b5cf6', letterSpacing: '0.1em' }}>
            BEDROCK NARRATES
          </div>
          <div className="text-[10px] font-semibold mt-1.5 tracking-wider" style={{ color: '#4a6480' }}>—</div>
          <div className="text-sm font-bold tracking-widest leading-tight mt-1" style={{ color: '#22d3ee', letterSpacing: '0.1em' }}>
            NIGHTWATCH DECIDES
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-2">
          {[
            { label: 'Bedrock narration', active: enabled },
            { label: 'Grounded context', active: true },
            { label: 'Engine override', active: false, denied: true },
          ].map(({ label, active, denied }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span style={{ color: '#94a8c0' }}>{label}</span>
              <div className="flex items-center gap-1.5">
                <Dot color={denied ? '#f87171' : active ? '#4ade80' : '#4a6480'} />
                <span style={{ color: denied ? '#f87171' : active ? '#4ade80' : '#4a6480' }}>
                  {denied ? 'Not permitted' : active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="text-[11px] leading-relaxed pt-1 border-t" style={{ color: '#3d5470', borderColor: '#1e2d45' }}>
          Bedrock receives grounded context from the Context Engine and cannot modify the assessment, score, or escalation decision. The engine's output is fixed before Bedrock is consulted.
        </div>

        <div>
          <div className="text-xs mb-1" style={{ color: '#4a6480' }}>Active provider</div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: enabled ? '#8b5cf6' : '#4a6480' }} />
            <span className="text-xs font-medium" style={{ color: enabled ? '#8b5cf6' : '#94a8c0' }}>
              {data.narrationProvider}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── PANEL 9: SIMULATION CONTROLS ────────────────────────────────────────────

const SIM_SCENARIOS: { key: Scenario; label: string; desc: string; color: string; bg: string; border: string }[] = [
  { key: 'normal', label: 'Normal Activity', desc: 'Morning routine, no anomalies', color: '#4ade80', bg: 'rgba(74,222,128,0.07)', border: 'rgba(74,222,128,0.18)' },
  { key: 'unusual', label: '3 AM Activity', desc: 'Front door, deep night, anomalous', color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.2)' },
  { key: 'repeated', label: 'Repeated Motion', desc: 'High-frequency cycling pattern', color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)' },
  { key: 'reset', label: 'Reset Simulation', desc: 'Clear all events, idle state', color: '#94a8c0', bg: 'rgba(148,168,192,0.05)', border: 'rgba(148,168,192,0.15)' },
]

function SimulationControls({ scenario, onScenario }: { scenario: Scenario; onScenario: (s: Scenario) => void }) {
  return (
    <Card>
      <PanelHeader
        title="Simulation"
        badge={
          <Chip label="RING SIMULATOR" color="#94a8c0" bg="rgba(148,168,192,0.06)" border="rgba(148,168,192,0.15)" />
        }
      />
      <div className="px-5 py-4 flex flex-col gap-2">
        {SIM_SCENARIOS.map(({ key, label, desc, color, bg, border }) => (
          <button
            key={key}
            onClick={() => onScenario(key)}
            className="w-full text-left rounded-lg px-3.5 py-3 transition-all"
            style={{
              backgroundColor: scenario === key ? bg : 'rgba(17,25,39,0.6)',
              border: `1px solid ${scenario === key ? border : '#1e2d45'}`,
              outline: 'none',
            }}
            onMouseEnter={e => { if (scenario !== key) (e.currentTarget as HTMLElement).style.backgroundColor = bg }}
            onMouseLeave={e => { if (scenario !== key) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(17,25,39,0.6)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {scenario === key && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                <div>
                  <div className="text-xs font-semibold" style={{ color: scenario === key ? color : '#dce6f5' }}>{label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#4a6480' }}>{desc}</div>
                </div>
              </div>
              {scenario === key && (
                <span className="text-[10px] font-semibold tracking-wider" style={{ color }}>ACTIVE</span>
              )}
            </div>
          </button>
        ))}
        <div className="mt-2 text-[10px] leading-relaxed" style={{ color: '#3d5470' }}>
          Simulates Ring motion events via the Ring Simulator. Real Ring integration is not implemented.
        </div>
      </div>
    </Card>
  )
}

// ─── PANEL 10: REAL VS SIMULATED ─────────────────────────────────────────────

const STATUS_IMPLEMENTED = [
  { label: 'Deterministic Context Engine', note: 'Rule-based, always authoritative' },
  { label: 'SQLite event log', note: 'Persistent storage for motion events' },
  { label: 'NightWatch MCP server', note: 'Streamable HTTP, 4 tools' },
  { label: 'Amazon Bedrock narration', note: 'Optional, disabled by default' },
]
const STATUS_SIMULATED = [
  { label: 'Ring motion events', note: 'Ring Simulator — no real Ring API' },
  { label: 'Alexa+ interaction', note: 'Conversation UI only, no Alexa SDK' },
  { label: 'Physical device control', note: 'No Echo integration' },
  { label: 'Remote MCP auth', note: 'Local dev only' },
]
const STATUS_NEXT = [
  'Live Ring webhook integration',
  'Authenticated remote MCP endpoint',
  'Adaptive baselines (ML)',
  'Multi-user household profiles',
]

function RealVsSimulatedPanel() {
  return (
    <Card>
      <PanelHeader title="System Status" badge={
        <Chip label="HACKATHON BUILD" color="#94a8c0" bg="rgba(148,168,192,0.06)" border="rgba(148,168,192,0.15)" />
      } />
      <div className="px-5 py-5 grid grid-cols-3 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4ade80' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4ade80' }}>Implemented</span>
          </div>
          <div className="flex flex-col gap-2">
            {STATUS_IMPLEMENTED.map(({ label, note }) => (
              <div key={label} className="flex items-start gap-2 text-xs">
                <Icon name="check" size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#4ade80' } as React.CSSProperties} />
                <div>
                  <div style={{ color: '#dce6f5' }}>{label}</div>
                  <div style={{ color: '#4a6480' }}>{note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f59e0b' }}>Simulated</span>
          </div>
          <div className="flex flex-col gap-2">
            {STATUS_SIMULATED.map(({ label, note }) => (
              <div key={label} className="flex items-start gap-2 text-xs">
                <div className="w-3 h-3 rounded border flex items-center justify-center mt-0.5 flex-shrink-0"
                  style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
                  <span className="text-[8px] font-bold">S</span>
                </div>
                <div>
                  <div style={{ color: '#94a8c0' }}>{label}</div>
                  <div style={{ color: '#4a6480' }}>{note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22d3ee' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#22d3ee' }}>Next Steps</span>
          </div>
          <div className="flex flex-col gap-2">
            {STATUS_NEXT.map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs">
                <Icon name="arrow" size={13} className="flex-shrink-0" style={{ color: '#22d3ee' } as React.CSSProperties} />
                <span style={{ color: '#94a8c0' }}>{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 text-[10px] leading-relaxed" style={{ color: '#3d5470', borderTop: '1px solid #1e2d45', paddingTop: 12 }}>
            NightWatch understands context instead of blindly reacting to motion. NightWatch decides — AI explains.
          </div>
        </div>
      </div>
    </Card>
  )
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

const NAV_ITEMS: { key: NavSection; label: string; icon: keyof typeof IC }[] = [
  { key: 'overview', label: 'Overview',         icon: 'eye' },
  { key: 'activity', label: 'Activity',          icon: 'zap' },
  { key: 'context',  label: 'Context Engine',    icon: 'cpu' },
  { key: 'mcp',      label: 'MCP',               icon: 'plug' },
  { key: 'alexa',    label: 'Alexa Simulation',  icon: 'mic' },
  { key: 'system',   label: 'System',            icon: 'server' },
  { key: 'settings', label: 'Settings',          icon: 'settings' },
]

function Sidebar({ active, onNavigate }: { active: NavSection; onNavigate: (s: NavSection) => void }) {
  return (
    <div className="w-56 flex-shrink-0 flex flex-col border-r h-full" style={{
      backgroundColor: '#080c14', borderColor: '#1e2d45'
    }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: '#1e2d45' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)' }}>
            <Icon name="shield" size={16} style={{ color: '#22d3ee' } as React.CSSProperties} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-wider" style={{ color: '#dce6f5', letterSpacing: '0.08em' }}>
              NIGHTWATCH
            </div>
            <div className="text-[10px]" style={{ color: '#4a6480' }}>Context-aware safety</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ key, label, icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all text-sm"
              style={{
                backgroundColor: isActive ? 'rgba(34,211,238,0.08)' : 'transparent',
                color: isActive ? '#22d3ee' : '#4a6480',
                fontWeight: isActive ? 500 : 400,
                border: `1px solid ${isActive ? 'rgba(34,211,238,0.15)' : 'transparent'}`,
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = '#94a8c0'
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(30,45,69,0.4)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = '#4a6480'
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                }
              }}
            >
              <Icon name={icon} size={15} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Bottom status */}
      <div className="px-4 py-4 border-t" style={{ borderColor: '#1e2d45' }}>
        <div className="flex items-center gap-2 mb-2">
          <Dot color="#4ade80" pulse />
          <span className="text-[11px] font-medium" style={{ color: '#4ade80' }}>All systems online</span>
        </div>
        <div className="text-[10px]" style={{ color: '#3d5470' }}>SQLite · MCP · CE v1.0</div>
      </div>
    </div>
  )
}

// ─── TOP BAR ──────────────────────────────────────────────────────────────────

function TopBar({ data, scenario }: { data: ScenarioData; scenario: Scenario }) {
  const cs = classificationStyle(data.classification)
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="flex items-center justify-between px-6 py-0 border-b flex-shrink-0" style={{
      height: 56, backgroundColor: '#080c14', borderColor: '#1e2d45'
    }}>
      <div className="flex items-center gap-6">
        <div>
          <span className="text-sm font-semibold tracking-widest" style={{ color: '#dce6f5', letterSpacing: '0.12em' }}>
            NIGHTWATCH
          </span>
          <span className="ml-3 text-xs" style={{ color: '#4a6480' }}>Context-aware home safety</span>
        </div>
        <div className="h-4 w-px" style={{ backgroundColor: '#1e2d45' }} />
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#4a6480' }}>Household:</span>
          <span className="text-xs font-semibold" style={{ color: '#22d3ee' }}>{data.householdState}</span>
          <span className="text-xs" style={{ color: '#4a6480' }}>· {data.occupants === null ? 'configured household' : `${data.occupants} occupant${data.occupants !== null && data.occupants !== 1 ? 's' : ''}`}</span>
        </div>
        <div className="h-4 w-px" style={{ backgroundColor: '#1e2d45' }} />
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#4a6480' }}>Assessment:</span>
          <Chip label={cs.label.toUpperCase()} color={cs.color} bg={cs.bg} border={cs.border} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Dot color="#4ade80" pulse />
          <span className="text-xs" style={{ color: '#4a6480' }}>System online</span>
        </div>
        <Mono className="tabular-nums" style={{ color: '#3d5470', fontSize: 11 } as React.CSSProperties}>
          {timeStr}
        </Mono>
      </div>
    </div>
  )
}

// ─── PLACEHOLDER PAGES ────────────────────────────────────────────────────────

function ActivityPage({ data }: { data: ScenarioData }) {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 anim-fade">
      <div className="mb-2">
        <h2 className="text-lg font-semibold" style={{ color: '#dce6f5' }}>Activity Log</h2>
        <p className="text-sm mt-0.5" style={{ color: '#4a6480' }}>Full motion event log from Ring Simulator → SQLite</p>
      </div>
      <EventTimelinePanel data={data} />
      <RealVsSimulatedPanel />
    </div>
  )
}

function ContextPage({ data }: { data: ScenarioData }) {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 anim-fade">
      <div className="mb-2">
        <h2 className="text-lg font-semibold" style={{ color: '#dce6f5' }}>Context Engine</h2>
        <p className="text-sm mt-0.5" style={{ color: '#4a6480' }}>Deterministic evaluation of household context and motion patterns</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ContextFactorsPanel data={data} />
        <HouseholdContextPanel data={data} />
      </div>
      <EscalationPanel data={data} />
    </div>
  )
}

function MCPPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 anim-fade">
      <div className="mb-2">
        <h2 className="text-lg font-semibold" style={{ color: '#dce6f5' }}>MCP Server</h2>
        <p className="text-sm mt-0.5" style={{ color: '#4a6480' }}>NightWatch Model Context Protocol server status and tool registry</p>
      </div>
      <MCPPanel />
    </div>
  )
}

function AlexaPage({ data, bedrockEnabled, alexaSnapshot, onAsk, onTriggerAlert }: { data: ScenarioData; bedrockEnabled: boolean; alexaSnapshot?: AlexaSimulationSnapshot; onAsk: (question: string) => void; onTriggerAlert: () => void }) {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 anim-fade">
      <div className="mb-2">
        <h2 className="text-lg font-semibold" style={{ color: '#dce6f5' }}>Alexa+ Simulation</h2>
        <p className="text-sm mt-0.5" style={{ color: '#4a6480' }}>Simulated Alexa+ interaction powered by NightWatch MCP</p>
      </div>
      <AlexaPanel data={data} bedrockEnabled={bedrockEnabled} alexaSnapshot={alexaSnapshot} onAsk={onAsk} onTriggerAlert={onTriggerAlert} />
    </div>
  )
}

function SystemPage({ data }: { data: ScenarioData }) {
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4 anim-fade">
      <div className="mb-2">
        <h2 className="text-lg font-semibold" style={{ color: '#dce6f5' }}>System Status</h2>
        <p className="text-sm mt-0.5" style={{ color: '#4a6480' }}>Service health, uptime, and component status</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { name: 'Context Engine', version: 'v1.0.0', status: 'Online', uptime: '99.9%', col: '#4ade80' },
          { name: 'SQLite Store', version: 'v3.45', status: 'Online', uptime: '100%', col: '#4ade80' },
          { name: 'MCP Server', version: '2025-11-25', status: 'Online', uptime: '99.7%', col: '#4ade80' },
          { name: 'Ring Simulator', version: 'v0.1', status: 'Simulated', uptime: '—', col: '#f59e0b' },
          { name: 'Bedrock Narration', version: 'Disabled', status: 'Standby', uptime: '—', col: '#4a6480' },
          { name: 'Alexa+ Bridge', version: 'v0.1', status: 'Simulated', uptime: '—', col: '#f59e0b' },
        ].map(({ name, version, status, uptime, col }) => (
          <Card key={name}>
            <div className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: '#dce6f5' }}>{name}</span>
                <Dot color={col} pulse={col === '#4ade80'} />
              </div>
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: '#4a6480' }}>Version</span>
                  <Mono style={{ color: '#94a8c0' } as React.CSSProperties}>{version}</Mono>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#4a6480' }}>Status</span>
                  <span style={{ color: col }}>{status}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#4a6480' }}>Uptime</span>
                  <span style={{ color: '#94a8c0' }}>{uptime}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <RealVsSimulatedPanel />
    </div>
  )
}

function SettingsPage({ bedrockEnabled, data }: {
  bedrockEnabled: boolean; data: ScenarioData
}) {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 anim-fade">
      <div className="mb-2">
        <h2 className="text-lg font-semibold" style={{ color: '#dce6f5' }}>Settings</h2>
        <p className="text-sm mt-0.5" style={{ color: '#4a6480' }}>NightWatch configuration and narration options</p>
      </div>
      <BedrockPanel data={data} enabled={bedrockEnabled} />
      <Card>
        <PanelHeader title="Thresholds" />
        <div className="px-5 py-4 flex flex-col gap-4">
          {[
            { label: 'Escalation score threshold', value: '60 / 100' },
            { label: 'Night window definition', value: '22:00 — 06:00' },
            { label: 'Frequency anomaly trigger', value: '> 5× baseline' },
            { label: 'Exterior zone risk multiplier', value: '1.4×' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: '#111927' }}>
              <span className="text-sm" style={{ color: '#94a8c0' }}>{label}</span>
              <Mono style={{ color: '#22d3ee' } as React.CSSProperties}>{value}</Mono>
            </div>
          ))}
        </div>
        <div className="px-5 pb-4">
          <div className="text-xs" style={{ color: '#3d5470' }}>
            Thresholds are evaluated deterministically by the Context Engine. Editing is not implemented in this build.
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────

function OverviewPage({
  data, bedrockEnabled, alexaSnapshot, onAsk, onTriggerAlert, scenario, onScenario,
}: {
  data: ScenarioData; bedrockEnabled: boolean; alexaSnapshot?: AlexaSimulationSnapshot; onAsk: (question: string) => void; onTriggerAlert: () => void;
  scenario: Scenario; onScenario: (s: Scenario) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 anim-fade">
      <div className="col-span-2"><CurrentAssessmentPanel data={data} /></div>
      <div className="col-span-1"><HouseholdContextPanel data={data} /></div>
      <div className="col-span-1"><ContextFactorsPanel data={data} /></div>
      <div className="col-span-2"><EventTimelinePanel data={data} /></div>
      <div className="col-span-2"><EscalationPanel data={data} /></div>
      <div className="col-span-1"><AlexaPanel data={data} bedrockEnabled={bedrockEnabled} alexaSnapshot={alexaSnapshot} onAsk={onAsk} onTriggerAlert={onTriggerAlert} /></div>
      <div className="col-span-1"><MCPPanel /></div>
      <div className="col-span-1"><BedrockPanel data={data} enabled={bedrockEnabled} /></div>
      <div className="col-span-1"><SimulationControls scenario={scenario} onScenario={onScenario} /></div>
      <div className="col-span-3"><RealVsSimulatedPanel /></div>
    </div>
  )
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview')
  const [selectedScenario, setSelectedScenario] = useState<Scenario>('reset')
  const utils = trpc.useUtils()
  const { data: snapshot, isLoading, error } = trpc.nightwatch.snapshot.useQuery()
  const { data: alexaSnapshot } = trpc.nightwatch.alexaSimulation.useQuery()
  const simulate = trpc.nightwatch.simulate.useMutation({
    onSuccess: async result => {
      setSelectedScenario(result.lastScenario === 'ready' ? 'reset' : result.lastScenario)
      await utils.nightwatch.snapshot.invalidate()
      await utils.nightwatch.alexaSimulation.invalidate()
      alexaInteract.mutate({})
    },
  })
  const reset = trpc.nightwatch.reset.useMutation({
    onSuccess: async () => {
      setSelectedScenario('reset')
      await utils.nightwatch.snapshot.invalidate()
      await utils.nightwatch.alexaSimulation.invalidate()
    },
  })
  const triggerAlert = trpc.nightwatch.triggerAlexaAlert.useMutation({
    onSuccess: () => utils.nightwatch.snapshot.invalidate(),
  })
  const alexaInteract = trpc.nightwatch.alexaInteract.useMutation({
    onSuccess: () => utils.nightwatch.alexaSimulation.invalidate(),
  })

  const data = snapshot ? snapshotToScenarioData(snapshot, alexaSnapshot) : null
  const bedrockEnabled = alexaSnapshot?.interaction?.narrationProvider === 'bedrock'

  function handleScenario(scenario: Scenario) {
    setSelectedScenario(scenario)
    if (scenario === 'reset') reset.mutate()
    else simulate.mutate({ scenario })
    if (activeSection !== 'overview') setActiveSection('overview')
  }

  if (isLoading || !data || !snapshot) {
    return <div className="h-screen flex items-center justify-center" style={{ backgroundColor: '#080c14', color: '#94a8c0' }}>{error ? 'NightWatch backend unavailable.' : 'Loading NightWatch command center…'}</div>
  }

  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: '#080c14' }}>
      <Sidebar active={activeSection} onNavigate={setActiveSection} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar data={data} scenario={selectedScenario} />
        <main className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: '#080c14' }}>
          {activeSection === 'overview' && <OverviewPage data={data} bedrockEnabled={bedrockEnabled} alexaSnapshot={alexaSnapshot} onAsk={question => alexaInteract.mutate({ question })} onTriggerAlert={() => triggerAlert.mutate()} scenario={selectedScenario} onScenario={handleScenario} />}
          {activeSection === 'activity' && <ActivityPage data={data} />}
          {activeSection === 'context' && <ContextPage data={data} />}
          {activeSection === 'mcp' && <MCPPage />}
          {activeSection === 'alexa' && <AlexaPage data={data} bedrockEnabled={bedrockEnabled} alexaSnapshot={alexaSnapshot} onAsk={question => alexaInteract.mutate({ question })} onTriggerAlert={() => triggerAlert.mutate()} />}
          {activeSection === 'system' && <SystemPage data={data} />}
          {activeSection === 'settings' && <SettingsPage bedrockEnabled={bedrockEnabled} data={data} />}
        </main>
      </div>
    </div>
  )
}
