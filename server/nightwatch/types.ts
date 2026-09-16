export type HouseholdState = "sleeping" | "active";
export type ScenarioName = "normal" | "unusual" | "repeated";
export type EventClassification = "normal" | "unusual" | "high_priority";
export type AlertStatus = "pending" | "delivered";

export interface RingEvent {
  id: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  location: string;
  eventType: "motion";
  metadata: Record<string, string | number | boolean>;
  householdState: HouseholdState;
}

export interface HouseholdBaseline {
  typicalEventsPerHour: number;
  typicalLocations: string[];
  quietHours: { start: number; end: number };
  description: string;
}

export interface ContextFactor {
  key: string;
  label: string;
  points: number;
  impact: "elevating" | "neutral";
  detail: string;
}

export interface ActivityAssessment {
  classification: EventClassification;
  score: number;
  factors: ContextFactor[];
  summary: string;
  comparedWithBaseline: string;
  eventCount: number;
  intervalSeconds: number | null;
  location: string;
}

export interface EscalationDecision {
  escalated: boolean;
  priority: "none" | "unusual" | "high_priority";
  reason: string;
  alertMessage: string | null;
  createdAt: string;
}

export interface AlertRecord {
  id: string;
  createdAt: string;
  status: AlertStatus;
  message: string;
  reason: string;
  relatedEventIds: string[];
}

export interface ArchitectureStatus {
  ring: "Simulator";
  alexa: "Simulation only";
  aws: "Not connected";
  mcp: "Local boundary (experimental)";
}

export interface NightWatchSnapshot {
  householdState: HouseholdState;
  events: RingEvent[];
  assessment: ActivityAssessment;
  decision: EscalationDecision;
  alerts: AlertRecord[];
  baseline: HouseholdBaseline;
  architecture: ArchitectureStatus;
  lastScenario: ScenarioName | "ready";
}

export interface ExplanationResponse {
  question: string;
  answer: string;
  evidence: string[];
  sourceEventIds: string[];
}
