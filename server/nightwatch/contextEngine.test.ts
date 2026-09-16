import { describe, expect, it } from "vitest";
import { assessActivity, createEscalationDecision } from "./contextEngine";
import { RingEvent } from "./types";

function event(id: string, timestamp: string, householdState: RingEvent["householdState"], location = "front entrance"): RingEvent {
  return {
    id,
    timestamp,
    deviceId: "ring-front-01",
    deviceName: "Ring Front Entrance",
    location,
    eventType: "motion",
    metadata: { zone: "porch" },
    householdState,
  };
}

describe("NightWatch context engine", () => {
  it("keeps an empty assessment window at a clean baseline", () => {
    const assessment = assessActivity([], "sleeping");

    expect(assessment.classification).toBe("normal");
    expect(assessment.score).toBe(0);
    expect(assessment.factors.every(factor => factor.points === 0)).toBe(true);
  });

  it("keeps an isolated daytime event normal", () => {
    const events = [event("normal-1", "2026-09-16T14:12:00.000Z", "active")];
    const assessment = assessActivity(events, "active");
    const decision = createEscalationDecision(assessment, events);

    expect(assessment.classification).toBe("normal");
    expect(assessment.score).toBeLessThan(40);
    expect(decision.escalated).toBe(false);
  });

  it("escalates repeated quiet-hours activity while sleeping", () => {
    const events = [
      event("unusual-1", "2026-09-16T03:04:00.000Z", "sleeping"),
      event("unusual-2", "2026-09-16T03:05:34.000Z", "sleeping"),
      event("unusual-3", "2026-09-16T03:06:56.000Z", "sleeping"),
    ];
    const assessment = assessActivity(events, "sleeping");
    const decision = createEscalationDecision(assessment, events);

    expect(assessment.classification).toBe("high_priority");
    expect(assessment.factors.find(factor => factor.key === "time")?.points).toBe(25);
    expect(assessment.factors.find(factor => factor.key === "interval")?.points).toBe(20);
    expect(decision.escalated).toBe(true);
    expect(decision.alertMessage).toContain("front entrance");
  });

  it("does not rely on the clock alone", () => {
    const events = [event("quiet-1", "2026-09-16T03:04:00.000Z", "active")];
    const assessment = assessActivity(events, "active");

    expect(assessment.classification).toBe("normal");
    expect(assessment.factors.find(factor => factor.key === "time")?.points).toBe(25);
    expect(assessment.score).toBeLessThan(40);
  });
});
