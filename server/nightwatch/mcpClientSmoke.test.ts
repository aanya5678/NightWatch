import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { getSnapshot, resetSimulation, simulateScenario } from "./store";
import { handleNightWatchMcpRequest } from "./mcpServer";
import { verifyNightWatchMcpEndpoint } from "./mcpClientSmoke";
import { NIGHTWATCH_MCP_PROTOCOL_VERSION } from "./mcpServer";

const servers: ReturnType<typeof createServer>[] = [];

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.post("/mcp", handleNightWatchMcpRequest);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/mcp`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe("NightWatch MCP client smoke test", () => {
  it("initializes, discovers tools, and calls all four tools over Streamable HTTP", async () => {
    resetSimulation();
    simulateScenario("unusual");
    const expected = getSnapshot();
    const endpoint = await startTestServer();

    const result = await verifyNightWatchMcpEndpoint(endpoint);

    expect(result.discoveredTools).toEqual([
      "get_recent_events",
      "get_home_context",
      "assess_activity",
      "get_alert_explanation",
    ]);
    expect(result.protocolVersion).toBe(NIGHTWATCH_MCP_PROTOCOL_VERSION);
    expect(result.results.recentEvents.totalAvailable).toBe(expected.events.length);
    expect((result.results.recentEvents.events as Array<{ id: string }>)[0]?.id).toBe(expected.events[0]?.id);
    expect(result.results.homeContext.householdState).toBe(expected.householdState);
    expect((result.results.assessment.assessment as { score: number }).score).toBe(expected.assessment.score);
    expect((result.results.assessment.decision as { escalated: boolean }).escalated).toBe(expected.decision.escalated);
    expect(result.results.assessment.deterministicAuthority).toContain("contextEngine");
    expect((result.results.explanation.sourceEventIds as string[])).toEqual(expected.events.map(event => event.id));
    expect((result.results.explanation.answer as string)).toContain("unusual-activity alert");
  });
});
