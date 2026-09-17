import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assessActivity, DEFAULT_BASELINE } from "./contextEngine";
import { ringEventSchema } from "./mcpSchemas";
import type { RingEvent } from "./types";

const examples = [
  { file: "mock_isolated_daytime.json", householdState: "active" as const, min: 0, max: 39, classification: "normal" },
  { file: "mock_baseline_active.json", householdState: "active" as const, min: 40, max: 69, classification: "unusual" },
  { file: "mock_ring_event_3am.json", householdState: "sleeping" as const, min: 70, max: 100, classification: "high_priority" },
] as const;

describe("mock Ring event payloads", () => {
  it.each(examples)("validates $file against the RingEvent schema and scoring range", example => {
    const payload = JSON.parse(readFileSync(resolve(process.cwd(), "examples/mock-events", example.file), "utf8")) as unknown;
    expect(Array.isArray(payload)).toBe(true);
    const events = (payload as unknown[]).map(item => ringEventSchema.parse(item)) as RingEvent[];
    const assessment = assessActivity(events, example.householdState, DEFAULT_BASELINE);

    expect(assessment.score).toBeGreaterThanOrEqual(example.min);
    expect(assessment.score).toBeLessThanOrEqual(example.max);
    expect(assessment.classification).toBe(example.classification);
  });
});
