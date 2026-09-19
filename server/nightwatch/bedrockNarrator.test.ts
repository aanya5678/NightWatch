import { describe, expect, it, vi } from "vitest";
import { askWhy } from "./store";
import { getHomeContext, assessRecentActivity, getRecentEvents } from "./mcpTools";
import { createBedrockNarrator, NarrationRequest } from "./bedrockNarrator";
import { getSnapshot, resetSimulation, simulateScenario } from "./store";

function request(): NarrationRequest {
  const context = getHomeContext();
  const assessment = assessRecentActivity();
  const events = getRecentEvents(50).events;
  return {
    question: "Why did you wake me?",
    householdState: context.householdState,
    baseline: context.baseline,
    events,
    assessment: assessment.assessment,
    decision: assessment.decision,
    explanation: askWhy("Why did you wake me?"),
  };
}

const config = { enabled: true, region: "us-east-1", modelId: "test-model", timeoutMs: 50 };

describe("optional Bedrock narrator", () => {
  it("falls back when AI is disabled", async () => {
    resetSimulation();
    const result = await createBedrockNarrator(undefined, { ...config, enabled: false })(request());
    expect(result.provider).toBe("deterministic-fallback");
    expect(result.fallbackReason).toBe("disabled");
    expect(result.text).toContain("did not wake you");
  });

  it("falls back when AWS configuration is incomplete", async () => {
    const result = await createBedrockNarrator(undefined, { ...config, region: "" })(request());
    expect(result.provider).toBe("deterministic-fallback");
    expect(result.fallbackReason).toBe("missing_configuration");
  });

  it("uses mocked Bedrock narration and sends current NightWatch facts", async () => {
    resetSimulation();
    simulateScenario("unusual");
    const current = request();
    let received = "";
    const client = {
      send: vi.fn(async command => {
        received = JSON.stringify(command.input);
        return { output: { message: { content: [{ text: "Grounded AI narration." }] } } };
      }),
    };

    const result = await createBedrockNarrator(client, config)(current);

    expect(result).toEqual({ provider: "bedrock", text: "Grounded AI narration.", modelId: "test-model" });
    expect(received).toContain(current.events[0]?.id);
    expect(received).toContain("front entrance");
    expect(received).toContain("high_priority");
    expect(received).toContain("unusual-activity alert");
  });

  it("preserves the deterministic normal decision when AI narrates", async () => {
    resetSimulation();
    simulateScenario("normal");
    const before = getSnapshot();
    const client = { send: vi.fn(async () => ({ output: { message: { content: [{ text: "Normal activity narration." }] } } })) };
    const result = await createBedrockNarrator(client, config)(request());
    const after = getSnapshot();

    expect(result.provider).toBe("bedrock");
    expect(after.assessment.score).toBe(before.assessment.score);
    expect(after.assessment.classification).toBe("normal");
    expect(after.decision.escalated).toBe(false);
    expect(after.decision.priority).toBe("none");
  });

  it("falls back on Bedrock errors without exposing the raw error", async () => {
    const client = { send: vi.fn(async () => { throw new Error("secret AWS token details"); }) };
    const result = await createBedrockNarrator(client, config)(request());
    expect(result.provider).toBe("deterministic-fallback");
    expect(result.fallbackReason).toBe("request_failed");
    expect(result.text).not.toContain("secret AWS token details");
  });

  it("falls back on timeout", async () => {
    const client = {
      send: vi.fn((_command: unknown, options?: { abortSignal?: AbortSignal }) => new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error("late response")), 50);
        options?.abortSignal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      })),
    };
    const result = await createBedrockNarrator(client, { ...config, timeoutMs: 5 })(request());
    expect(result.provider).toBe("deterministic-fallback");
    expect(result.fallbackReason).toBe("request_failed");
  });
});
