import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("NightWatch backend contract", () => {
  it("runs the unusual simulator scenario through escalation", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.nightwatch.reset();

    const snapshot = await caller.nightwatch.simulate({ scenario: "unusual" });

    expect(snapshot.events).toHaveLength(3);
    expect(snapshot.decision.escalated).toBe(true);
    expect(snapshot.alerts[0]?.status).toBe("pending");
  });

  it("grounds why-question answers in the current event IDs", async () => {
    const caller = appRouter.createCaller(createContext());
    const snapshot = await caller.nightwatch.snapshot();
    const answer = await caller.nightwatch.askWhy({ question: "Why did you wake me?" });

    expect(answer.question).toBe("Why did you wake me?");
    expect(answer.answer).toContain("unusual-activity alert");
    expect(answer.sourceEventIds).toEqual(snapshot.events.map(event => event.id));
    expect(answer.evidence.length).toBeGreaterThan(0);
  });
});
