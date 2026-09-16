import { getSnapshot, askWhy } from "./store";
import { RingEvent } from "./types";

export function getRecentEvents(limit = 10) {
  const snapshot = getSnapshot();
  return {
    events: snapshot.events.slice(0, Math.max(1, Math.min(limit, 50))),
    totalAvailable: snapshot.events.length,
    source: "NightWatch SQLite event store",
  };
}

export function getHomeContext() {
  const snapshot = getSnapshot();
  return {
    householdState: snapshot.householdState,
    lastScenario: snapshot.lastScenario,
    baseline: snapshot.baseline,
    recentEventCount: snapshot.events.length,
    latestEvent: snapshot.events[0] ?? null,
    latestAlert: snapshot.alerts[0] ?? null,
    integrationStatus: snapshot.architecture,
  };
}

export function assessRecentActivity() {
  const snapshot = getSnapshot();
  return {
    assessment: snapshot.assessment,
    decision: snapshot.decision,
    eventIds: snapshot.events.map(event => event.id),
    deterministicAuthority: "NightWatch contextEngine.createEscalationDecision",
  };
}

export function getAlertExplanation(question = "Why did you wake me?") {
  return askWhy(question);
}

export function serializeToolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function summarizeEvent(event: RingEvent) {
  return {
    id: event.id,
    timestamp: event.timestamp,
    deviceName: event.deviceName,
    location: event.location,
    eventType: event.eventType,
    householdState: event.householdState,
    metadata: event.metadata,
  };
}
