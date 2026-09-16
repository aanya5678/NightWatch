import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const EXPECTED_NIGHTWATCH_TOOLS = [
  "get_recent_events",
  "get_home_context",
  "assess_activity",
  "get_alert_explanation",
] as const;

export interface McpClientSmokeResult {
  endpoint: string;
  discoveredTools: string[];
  results: {
    recentEvents: Record<string, unknown>;
    homeContext: Record<string, unknown>;
    assessment: Record<string, unknown>;
    explanation: Record<string, unknown>;
  };
}

function readJson(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find(item => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool did not return a text payload");
  return JSON.parse(text) as Record<string, unknown>;
}

export async function verifyNightWatchMcpEndpoint(endpoint: string): Promise<McpClientSmokeResult> {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  const client = new Client({ name: "nightwatch-local-smoke-client", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const discoveredTools = tools.tools.map(tool => tool.name);
    if (JSON.stringify(discoveredTools) !== JSON.stringify(EXPECTED_NIGHTWATCH_TOOLS)) {
      throw new Error(`Unexpected NightWatch MCP tools: ${discoveredTools.join(", ")}`);
    }

    const recentEvents = readJson(await client.callTool({
      name: "get_recent_events",
      arguments: { limit: 10 },
    }) as { content: Array<{ type: string; text?: string }> });
    const homeContext = readJson(await client.callTool({
      name: "get_home_context",
      arguments: {},
    }) as { content: Array<{ type: string; text?: string }> });
    const assessment = readJson(await client.callTool({
      name: "assess_activity",
      arguments: {},
    }) as { content: Array<{ type: string; text?: string }> });
    const explanation = readJson(await client.callTool({
      name: "get_alert_explanation",
      arguments: { question: "Why did you wake me?" },
    }) as { content: Array<{ type: string; text?: string }> });

    return {
      endpoint,
      discoveredTools,
      results: { recentEvents, homeContext, assessment, explanation },
    };
  } finally {
    await client.close();
  }
}

if (process.argv[1]?.endsWith("mcpClientSmoke.ts")) {
  const endpoint = process.argv[2] ?? "http://127.0.0.1:3000/mcp";
  verifyNightWatchMcpEndpoint(endpoint)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error("NightWatch MCP client smoke test failed:", error);
      process.exitCode = 1;
    });
}
