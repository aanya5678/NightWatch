import {
  ActivityAssessment,
  ContextFactor,
  EscalationDecision,
  HouseholdBaseline,
  HouseholdState,
  RingEvent,
} from "./types";

export const DEFAULT_BASELINE: HouseholdBaseline = {
  typicalEventsPerHour: 0.7,
  typicalLocations: ["front entrance", "driveway"],
  quietHours: { start: 23, end: 6 },
  description: "A quiet household with occasional daytime motion near the front entrance.",
};

function isQuietHour(date: Date, baseline: HouseholdBaseline) {
  const hour = date.getHours();
  return hour >= baseline.quietHours.start || hour < baseline.quietHours.end;
}

function getIntervalSeconds(events: RingEvent[]) {
  if (events.length < 2) return null;
  const timestamps = events.map(event => Date.parse(event.timestamp)).sort((a, b) => a - b);
  return Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 1000 / (events.length - 1));
}

function factor(
  key: string,
  label: string,
  points: number,
  detail: string,
  impact: ContextFactor["impact"] = points > 0 ? "elevating" : "neutral",
): ContextFactor {
  return { key, label, points, detail, impact };
}

export function assessActivity(
  events: RingEvent[],
  householdState: HouseholdState,
  baseline: HouseholdBaseline = DEFAULT_BASELINE,
): ActivityAssessment {
  if (events.length === 0) {
    return {
      classification: "normal",
      score: 0,
      factors: [
        factor("time", "Time of day", 0, "No event timestamp is available to evaluate."),
        factor("frequency", "Event frequency", 0, "No motion events are currently in the assessment window."),
        factor("interval", "Interval between events", 0, "There is no repeat interval to evaluate."),
        factor("household", "Household state", 0, `The household is marked ${householdState}; state becomes relevant when activity is present.`),
        factor("location", "Location pattern", 0, "No event location is currently available to compare."),
        factor("baseline", "Current vs normal activity", 0, `No activity is currently observed against the baseline of ${baseline.typicalEventsPerHour} events per hour.`),
      ],
      summary: "No activity in the current assessment window.",
      comparedWithBaseline: "The current pattern is consistent with the household baseline.",
      eventCount: 0,
      intervalSeconds: null,
      location: "No activity",
    };
  }

  const orderedEvents = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const latestEvent = orderedEvents[orderedEvents.length - 1];
  const intervalSeconds = getIntervalSeconds(orderedEvents);
  const location = latestEvent?.location ?? "No activity";
  const lateNight = latestEvent ? isQuietHour(new Date(latestEvent.timestamp), baseline) : false;
  const sameLocation = orderedEvents.length > 0 && orderedEvents.every(event => event.location === location);
  const locationIsTypical = baseline.typicalLocations.includes(location);

  const factors = [
    factor(
      "time",
      "Time of day",
      lateNight ? 25 : 0,
      lateNight ? "Activity occurred during the household quiet-hours window (23:00–06:00)." : "Activity occurred outside the configured quiet-hours window.",
    ),
    factor(
      "frequency",
      "Event frequency",
      orderedEvents.length >= 4 ? 30 : orderedEvents.length === 3 ? 25 : orderedEvents.length === 2 ? 14 : 0,
      orderedEvents.length > 1 ? `${orderedEvents.length} motion events were observed in this assessment window.` : "Only one motion event was observed in this assessment window.",
    ),
    factor(
      "interval",
      "Interval between events",
      intervalSeconds !== null && intervalSeconds <= 120 ? 20 : intervalSeconds !== null && intervalSeconds <= 300 ? 10 : 0,
      intervalSeconds === null ? "There is no repeat interval to evaluate." : `Average interval is ${intervalSeconds} seconds between events.`,
    ),
    factor(
      "household",
      "Household state",
      householdState === "sleeping" ? 15 : 0,
      householdState === "sleeping" ? "The household is marked as sleeping, so the same activity has higher context priority." : "The household is marked active, reducing the context priority of motion.",
    ),
    factor(
      "location",
      "Location pattern",
      !locationIsTypical ? 10 : 0,
      locationIsTypical ? `${location} is included in the household's usual monitored locations.` : `${location} is not in the household's current typical-location baseline.`,
    ),
    factor(
      "baseline",
      "Current vs normal activity",
      orderedEvents.length > baseline.typicalEventsPerHour * 2 ? 10 : 0,
      orderedEvents.length > baseline.typicalEventsPerHour * 2 ? `The observed count is materially above the baseline of ${baseline.typicalEventsPerHour} events per hour.` : `The observed count is close to the baseline of ${baseline.typicalEventsPerHour} events per hour.`,
    ),
  ];

  const score = Math.min(100, factors.reduce((total, current) => total + current.points, 0));
  const classification = score >= 70 ? "high_priority" : score >= 40 ? "unusual" : "normal";
  const comparedWithBaseline = score >= 40
    ? "The current pattern is materially different from the household baseline."
    : "The current pattern is consistent with the household baseline.";

  const summary = classification === "normal"
    ? "No unusual pattern detected. The activity is consistent with the household context."
    : classification === "high_priority"
      ? "High-priority unusual activity pattern detected. Escalation is warranted, but this is not a determination of a crime or emergency."
      : "Unusual activity pattern detected. Escalation is warranted for human review, but this is not a determination of a crime or emergency.";

  return {
    classification,
    score,
    factors,
    summary,
    comparedWithBaseline,
    eventCount: orderedEvents.length,
    intervalSeconds,
    location,
  };
}

export function createEscalationDecision(
  assessment: ActivityAssessment,
  events: RingEvent[],
): EscalationDecision {
  const escalated = assessment.classification !== "normal";
  const priority = assessment.classification === "high_priority"
    ? "high_priority"
    : assessment.classification === "unusual"
      ? "unusual"
      : "none";
  const alertMessage = escalated
    ? `NightWatch detected unusual activity near your ${assessment.location}. There have been ${events.length} motion events in the last few minutes.`
    : null;

  return {
    escalated,
    priority,
    reason: assessment.summary,
    alertMessage,
    createdAt: new Date().toISOString(),
  };
}

export function explainDecision(
  assessment: ActivityAssessment,
  decision: EscalationDecision,
  events: RingEvent[],
): { answer: string; evidence: string[]; sourceEventIds: string[] } {
  const positiveFactors = assessment.factors.filter(current => current.points > 0);
  const evidence = positiveFactors.map(current => current.detail);
  const sourceEventIds = events.map(event => event.id);

  if (!decision.escalated) {
    return {
      answer: "I did not wake you. The latest activity was treated as normal because it was isolated and aligned with the household context.",
      evidence: evidence.length > 0 ? evidence : ["No escalation factors were present."],
      sourceEventIds,
    };
  }

  return {
    answer: `I woke you because NightWatch observed ${events.length} motion events near the ${assessment.location} during a context window where the household was ${events[events.length - 1]?.householdState ?? "unknown"}. The deterministic assessment scored the pattern ${assessment.score}/100 as ${assessment.classification.replace("_", " ")}. This is an unusual-activity alert, not a definitive identification of a burglary, crime, or emergency.`,
    evidence,
    sourceEventIds,
  };
}
