import { describe, expect, it } from "vitest";
import { getSnapshot, resetSimulation, simulateScenario } from "./store";
import {
  interactWithAlexa,
  resetAlexaSimulation,
  getAlexaSimulation,
} from "./alexaSimulation";

describe("simulated Alexa+ interaction", () => {
  it("triggers an alert response from unusual NightWatch activity", () => {
    resetSimulation();
    resetAlexaSimulation();
    const snapshot = simulateScenario("unusual");
    const result = interactWithAlexa();

    expect(result.state).toBe("speaking");
    expect(result.interaction?.response).toBe(snapshot.decision.alertMessage);
    expect(result.interaction?.sourceEventIds).toEqual(snapshot.events.map(event => event.id));
    expect(result.interaction?.toolInvocations.map(call => call.name)).toEqual([
      "get_home_context",
      "assess_activity",
      "get_recent_events",
    ]);
  });

  it("does not escalate normal activity", () => {
    resetSimulation();
    resetAlexaSimulation();
    const snapshot = simulateScenario("normal");
    const result = interactWithAlexa();

    expect(snapshot.decision.escalated).toBe(false);
    expect(result.state).toBe("answered");
    expect(result.interaction?.response).toContain("consistent with the household context");
  });

  it("answers why did you wake me with deterministic evidence", () => {
    resetSimulation();
    resetAlexaSimulation();
    const snapshot = simulateScenario("unusual");
    const result = interactWithAlexa("Why did you wake me?");

    expect(result.interaction?.response).toContain("unusual-activity alert");
    expect(result.interaction?.response).toContain("sleeping");
    expect(result.interaction?.sourceEventIds).toEqual(snapshot.events.map(event => event.id));
    expect(result.interaction?.evidence.length).toBeGreaterThan(0);
  });

  it.each([
    ["What happened?", "motion event"],
    ["How many events were detected?", "3 motion events"],
    ["Where did they happen?", "front entrance"],
    ["Was this unusual compared with the baseline?", "deterministic score"],
  ])("answers supported follow-up: %s", (question, expected) => {
    resetSimulation();
    resetAlexaSimulation();
    simulateScenario("unusual");
    const result = interactWithAlexa(question);

    expect(result.state).toBe("answered");
    expect(result.interaction?.response.toLowerCase()).toContain(expected.toLowerCase());
    expect(result.interaction?.toolInvocations.length).toBeGreaterThan(0);
  });

  it("handles an unknown question without inventing an answer", () => {
    resetSimulation();
    resetAlexaSimulation();
    simulateScenario("unusual");
    const result = interactWithAlexa("Can you order pizza?");

    expect(result.interaction?.response).toContain("I can answer what happened");
    expect(result.interaction?.sourceEventIds).toEqual(getSnapshot().events.map(event => event.id));
  });

  it("resets the simulated Alexa state", () => {
    resetSimulation();
    resetAlexaSimulation();
    simulateScenario("unusual");
    interactWithAlexa("What happened?");
    expect(getAlexaSimulation().interaction).not.toBeNull();

    const result = resetAlexaSimulation();
    expect(result.state).toBe("idle");
    expect(result.interaction).toBeNull();
  });
});
