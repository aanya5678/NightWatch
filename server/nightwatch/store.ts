import { randomUUID } from "node:crypto";
import {
  assessActivity,
  createEscalationDecision,
  DEFAULT_BASELINE,
  explainDecision,
} from "./contextEngine";
import { createNightWatchRepository } from "./sqliteRepository";
import {
  AlertRecord,
  ExplanationResponse,
  HouseholdState,
  NightWatchSnapshot,
  RingEvent,
  ScenarioName,
} from "./types";

const architecture = {
  ring: "Simulator" as const,
  alexa: "Simulation only" as const,
  aws: "Not connected" as const,
  mcp: "Local boundary (experimental)" as const,
};

const repository = createNightWatchRepository();

function scenarioBaseTime(scenario: ScenarioName) {
  const base = new Date();
  if (scenario === "normal") {
    base.setHours(14, 12, 0, 0);
    return base;
  }
  base.setHours(3, 4, 0, 0);
  if (base.getTime() > Date.now()) base.setDate(base.getDate() - 1);
  return base;
}

function makeEvent(
  timestamp: Date,
  location: string,
  householdState: HouseholdState,
  sequence: number,
  metadata: RingEvent["metadata"],
): RingEvent {
  return {
    id: `ring-${randomUUID().slice(0, 8)}`,
    timestamp: timestamp.toISOString(),
    deviceId: "ring-front-01",
    deviceName: "Ring Front Entrance",
    location,
    eventType: "motion",
    metadata: { ...metadata, sequence },
    householdState,
  };
}

function generateScenario(scenario: ScenarioName): RingEvent[] {
  const base = scenarioBaseTime(scenario);
  if (scenario === "normal") {
    return [makeEvent(base, "front entrance", "active", 1, { zone: "porch", sensitivity: "standard" })];
  }

  if (scenario === "repeated") {
    return [0, 210, 390, 510].map((offset, index) => makeEvent(
      new Date(base.getTime() + offset * 1000),
      "side gate",
      "active",
      index + 1,
      { zone: "side-yard", sensitivity: "standard" },
    ));
  }

  return [0, 94, 176].map((offset, index) => makeEvent(
    new Date(base.getTime() + offset * 1000),
    "front entrance",
    "sleeping",
    index + 1,
    { zone: "porch", sensitivity: "high", personDetected: false },
  ));
}

function buildSnapshot(): NightWatchSnapshot {
  const persisted = repository.readState();
  const assessment = assessActivity(persisted.events, persisted.householdState, DEFAULT_BASELINE);
  const decision = createEscalationDecision(assessment, persisted.events);

  return {
    householdState: persisted.householdState,
    events: persisted.events,
    assessment,
    decision,
    alerts: persisted.alerts,
    baseline: DEFAULT_BASELINE,
    architecture,
    lastScenario: persisted.lastScenario,
  };
}

export function getSnapshot() {
  return buildSnapshot();
}

export function resetSimulation() {
  repository.clearSimulation();
  return buildSnapshot();
}

export function setHouseholdState(householdState: HouseholdState) {
  repository.updateHouseholdState(householdState);
  return buildSnapshot();
}

export function simulateScenario(scenario: ScenarioName) {
  const events = generateScenario(scenario);
  const householdState = scenario === "normal" || scenario === "repeated" ? "active" : "sleeping";
  repository.replaceEvents(events, householdState, scenario);

  const snapshot = buildSnapshot();
  if (snapshot.decision.escalated && snapshot.decision.alertMessage) {
    const alert: AlertRecord = {
      id: `alert-${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      status: "pending",
      message: snapshot.decision.alertMessage,
      reason: snapshot.decision.reason,
      relatedEventIds: events.map(event => event.id),
    };
    repository.addAlert(alert);
  }
  return buildSnapshot();
}

export function triggerAlexaAlert() {
  repository.markLatestAlertDelivered();
  return buildSnapshot();
}

export function askWhy(question: string): ExplanationResponse {
  const snapshot = buildSnapshot();
  const explanation = explainDecision(snapshot.assessment, snapshot.decision, snapshot.events);
  return {
    question,
    ...explanation,
  };
}
