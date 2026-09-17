import { randomUUID } from "node:crypto";
import {
  assessRecentActivity,
  getAlertExplanation,
  getHomeContext,
  getRecentEvents,
} from "./mcpTools";
import type { RingEvent } from "./types";

export type AlexaSimulationState = "idle" | "alert_ready" | "speaking" | "listening" | "answered";

export interface AlexaToolInvocation {
  name: "get_recent_events" | "get_home_context" | "assess_activity" | "get_alert_explanation";
  arguments: Record<string, unknown>;
  returnedEvidence: string[];
}

export interface AlexaInteraction {
  id: string;
  state: AlexaSimulationState;
  question: string | null;
  response: string;
  toolInvocations: AlexaToolInvocation[];
  evidence: string[];
  sourceEventIds: string[];
  createdAt: string;
}

export interface AlexaSimulationSnapshot {
  state: AlexaSimulationState;
  interaction: AlexaInteraction | null;
  modeLabel: "Alexa+ interaction simulation — powered by NightWatch MCP";
}

let state: AlexaSimulationState = "idle";
let latestInteraction: AlexaInteraction | null = null;

function eventIds(events: RingEvent[]) {
  return events.map(event => event.id);
}

function eventLocations(events: RingEvent[]) {
  return Array.from(new Set(events.map(event => event.location)));
}

function eventWindow(events: RingEvent[]) {
  if (events.length === 0) return "the current assessment window";
  const timestamps = events.map(event => Date.parse(event.timestamp)).sort((a, b) => a - b);
  const first = new Date(timestamps[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const last = new Date(timestamps[timestamps.length - 1]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return timestamps[0] === timestamps[timestamps.length - 1] ? first : `${first}–${last}`;
}

function tool(name: AlexaToolInvocation["name"], args: Record<string, unknown>, returnedEvidence: string[]): AlexaToolInvocation {
  return { name, arguments: args, returnedEvidence };
}

function buildAlertInteraction(): AlexaInteraction {
  const context = getHomeContext();
  const assessment = assessRecentActivity();
  const recent = getRecentEvents(50);
  const events = recent.events;
  const response = assessment.decision.alertMessage ?? "No unusual activity alert is queued. The current activity is consistent with the household context.";
  const evidence = assessment.assessment.factors.filter(factor => factor.points > 0).map(factor => factor.detail);

  return {
    id: `alexa-${randomUUID().slice(0, 8)}`,
    state: assessment.decision.escalated ? "speaking" : "answered",
    question: null,
    response,
    toolInvocations: [
      tool("get_home_context", {}, [`Household state: ${context.householdState}`, `Scenario: ${context.lastScenario}`]),
      tool("assess_activity", {}, [assessment.assessment.summary, `Decision escalated: ${assessment.decision.escalated}`]),
      tool("get_recent_events", { limit: 50 }, [`${recent.totalAvailable} events returned`, `Event IDs: ${eventIds(events).join(", ") || "none"}`]),
    ],
    evidence,
    sourceEventIds: eventIds(events),
    createdAt: new Date().toISOString(),
  };
}

function buildQuestionInteraction(question: string): AlexaInteraction {
  const normalized = question.toLowerCase().trim();
  const context = getHomeContext();
  const assessment = assessRecentActivity();
  const recent = getRecentEvents(50);
  const events = recent.events;
  const ids = eventIds(events);
  const locations = eventLocations(events);
  const invocations: AlexaToolInvocation[] = [
    tool("get_home_context", {}, [`Household state: ${context.householdState}`, `Baseline: ${context.baseline.description}`]),
    tool("assess_activity", {}, [assessment.assessment.comparedWithBaseline, `Classification: ${assessment.assessment.classification}`]),
  ];
  let response: string;
  let evidence: string[];

  if (/why|wake/.test(normalized)) {
    const explanation = getAlertExplanation(question);
    invocations.push(tool("get_alert_explanation", { question }, explanation.evidence));
    response = explanation.answer;
    evidence = explanation.evidence;
  } else if (/how many|number of|count/.test(normalized)) {
    invocations.push(tool("get_recent_events", { limit: 50 }, [`${recent.totalAvailable} events returned`]),);
    response = `NightWatch detected ${recent.totalAvailable} motion event${recent.totalAvailable === 1 ? "" : "s"} in ${eventWindow(events)}.`;
    evidence = [`Event count: ${recent.totalAvailable}`, `Source: ${recent.source}`];
  } else if (/where|location|happen/.test(normalized)) {
    invocations.push(tool("get_recent_events", { limit: 50 }, [`Locations: ${locations.join(", ") || "none"}`]));
    response = locations.length > 0
      ? `The motion events happened near ${locations.join(" and ")}.`
      : "There are no motion-event locations in the current assessment window.";
    evidence = locations.length > 0 ? [`Locations: ${locations.join(", ")}`, `Event count: ${events.length}`] : ["No persisted events were returned."];
  } else if (/unusual|baseline|normal|different/.test(normalized)) {
    response = `${assessment.assessment.comparedWithBaseline} NightWatch classified the current activity as ${assessment.assessment.classification.replace("_", " ")} with a deterministic score of ${assessment.assessment.score}/100.`;
    evidence = assessment.assessment.factors.map(factor => factor.detail);
  } else if (/what happened|latest|activity|events?/.test(normalized)) {
    invocations.push(tool("get_recent_events", { limit: 50 }, [`${recent.totalAvailable} events returned`, `Locations: ${locations.join(", ") || "none"}`]));
    response = events.length > 0
      ? `NightWatch recorded ${events.length} motion event${events.length === 1 ? "" : "s"} near ${locations.join(" and ")} during ${eventWindow(events)}. The household was ${context.householdState}.`
      : "NightWatch has no persisted motion events in the current assessment window.";
    evidence = [
      `Event count: ${events.length}`,
      `Locations: ${locations.join(", ") || "none"}`,
      `Household state: ${context.householdState}`,
    ];
  } else {
    invocations.push(tool("get_recent_events", { limit: 50 }, [`${recent.totalAvailable} events returned`]));
    response = "I can answer what happened, how many events were detected, where they happened, whether the pattern was unusual, or why an alert was raised. I will use the current NightWatch data for those answers.";
    evidence = [`Current event count: ${recent.totalAvailable}`, `Current classification: ${assessment.assessment.classification}`];
  }

  return {
    id: `alexa-${randomUUID().slice(0, 8)}`,
    state: "answered",
    question,
    response,
    toolInvocations: invocations,
    evidence,
    sourceEventIds: ids,
    createdAt: new Date().toISOString(),
  };
}

export function getAlexaSimulation(): AlexaSimulationSnapshot {
  return {
    state,
    interaction: latestInteraction,
    modeLabel: "Alexa+ interaction simulation — powered by NightWatch MCP",
  };
}

export function resetAlexaSimulation() {
  state = "idle";
  latestInteraction = null;
  return getAlexaSimulation();
}

export function interactWithAlexa(question?: string) {
  state = question?.trim() ? "listening" : "alert_ready";
  const interaction = question?.trim() ? buildQuestionInteraction(question.trim()) : buildAlertInteraction();
  latestInteraction = interaction;
  state = interaction.state;
  return getAlexaSimulation();
}

export const ALEXA_SUGGESTED_QUESTIONS = [
  "Why did you wake me?",
  "What happened?",
  "How many events were detected?",
  "Where did they happen?",
  "Was this unusual compared with the baseline?",
] as const;
