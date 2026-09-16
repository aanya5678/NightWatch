import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getSnapshot, resetSimulation, simulateScenario } from "./store";
import { createNightWatchMcpServer } from "./mcpServer";

async function createConnectedClient() {
  const server = createNightWatchMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "nightwatch-test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function readJson(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find(item => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool did not return a text payload");
  return JSON.parse(text) as Record<string, any>;
}

describe("NightWatch MCP server", () => {
  it("registers the four read-oriented NightWatch tools", async () => {
    resetSimulation();
    const { client, server } = await createConnectedClient();

    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).toEqual([
      "get_recent_events",
      "get_home_context",
      "assess_activity",
      "get_alert_explanation",
    ]);

    await client.close();
    await server.close();
  });

  it("retrieves persisted events through the existing store", async () => {
    resetSimulation();
    const snapshot = simulateScenario("unusual");
    const { client, server } = await createConnectedClient();

    const result = readJson(await client.callTool({ name: "get_recent_events", arguments: { limit: 2 } }) as any);

    expect(result.totalAvailable).toBe(3);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe(snapshot.events[0]?.id);

    await client.close();
    await server.close();
  });

  it("exposes the deterministic assessment and grounded explanation", async () => {
    resetSimulation();
    simulateScenario("unusual");
    const expected = getSnapshot();
    const { client, server } = await createConnectedClient();

    const assessment = readJson(await client.callTool({ name: "assess_activity", arguments: {} }) as any);
    const explanation = readJson(await client.callTool({
      name: "get_alert_explanation",
      arguments: { question: "Why did you wake me?" },
    }) as any);

    expect(assessment.assessment.score).toBe(expected.assessment.score);
    expect(assessment.decision.escalated).toBe(true);
    expect(assessment.deterministicAuthority).toContain("contextEngine");
    expect(explanation.answer).toContain("unusual-activity alert");
    expect(explanation.sourceEventIds).toEqual(expected.events.map(event => event.id));

    await client.close();
    await server.close();
  });

  it("returns current household context from the existing snapshot", async () => {
    resetSimulation();
    simulateScenario("normal");
    const { client, server } = await createConnectedClient();

    const context = readJson(await client.callTool({ name: "get_home_context", arguments: {} }) as any);

    expect(context.householdState).toBe("active");
    expect(context.lastScenario).toBe("normal");
    expect(context.recentEventCount).toBe(1);
    expect(context.integrationStatus.mcp).toBe("Local boundary (experimental)");

    await client.close();
    await server.close();
  });
});
