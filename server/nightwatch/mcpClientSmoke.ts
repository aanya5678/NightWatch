import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NIGHTWATCH_MCP_PROTOCOL_VERSION } from "./mcpServer";
import {
  assessmentOutputSchema,
  explanationOutputSchema,
  homeContextOutputSchema,
  recentEventsOutputSchema,
} from "./mcpSchemas";

export const EXPECTED_NIGHTWATCH_TOOLS = [
  "get_recent_events",
  "get_home_context",
  "assess_activity",
  "get_alert_explanation",
] as const;

export interface McpClientSmokeResult {
  endpoint: string;
  protocolVersion: string;
  discoveredTools: string[];
  results: {
    recentEvents: Record<string, unknown>;
    homeContext: Record<string, unknown>;
    assessment: Record<string, unknown>;
    explanation: Record<string, unknown>;
  };
}

type ToolResult = {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
};

function readStructured(result: ToolResult, schema: { parse(value: unknown): unknown }) {
  if (result.structuredContent === undefined) throw new Error("MCP tool did not return structuredContent");
  return schema.parse(result.structuredContent) as Record<string, unknown>;
}

export async function verifyNightWatchMcpEndpoint(endpoint: string): Promise<McpClientSmokeResult> {
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  const client = new Client({ name: "nightwatch-local-smoke-client", version: "1.0.0" });

  try {
    await client.connect(transport);
    if (transport.protocolVersion !== NIGHTWATCH_MCP_PROTOCOL_VERSION) {
      throw new Error(`Unexpected negotiated MCP protocol: ${transport.protocolVersion}`);
    }

    const tools = await client.listTools();
    const discoveredTools = tools.tools.map(tool => tool.name);
    if (JSON.stringify(discoveredTools) !== JSON.stringify(EXPECTED_NIGHTWATCH_TOOLS)) {
      throw new Error(`Unexpected NightWatch MCP tools: ${discoveredTools.join(", ")}`);
    }

    const recentEvents = readStructured(await client.callTool({
      name: "get_recent_events",
      arguments: { limit: 10 },
    }) as ToolResult, recentEventsOutputSchema);
    const homeContext = readStructured(await client.callTool({
      name: "get_home_context",
      arguments: {},
    }) as ToolResult, homeContextOutputSchema);
    const assessment = readStructured(await client.callTool({
      name: "assess_activity",
      arguments: {},
    }) as ToolResult, assessmentOutputSchema);
    const explanation = readStructured(await client.callTool({
      name: "get_alert_explanation",
      arguments: { question: "Why did you wake me?" },
    }) as ToolResult, explanationOutputSchema);

    return {
      endpoint,
      protocolVersion: transport.protocolVersion,
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
