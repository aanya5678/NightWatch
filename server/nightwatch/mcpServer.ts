import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  assessRecentActivity,
  getAlertExplanation,
  getHomeContext,
  getRecentEvents,
  serializeToolResult,
} from "./mcpTools";

export const NIGHTWATCH_MCP_PATH = "/mcp";

export function createNightWatchMcpServer() {
  const server = new McpServer({
    name: "nightwatch",
    version: "0.3.0",
  });

  server.registerTool(
    "get_recent_events",
    {
      title: "Get recent Ring events",
      description: "Retrieve normalized recent Ring motion events from the NightWatch SQLite event store.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional().default(10) },
    },
    async ({ limit }) => serializeToolResult(getRecentEvents(limit)),
  );

  server.registerTool(
    "get_home_context",
    {
      title: "Get home context",
      description: "Retrieve the current household state, baseline, recent activity summary, and integration status.",
    },
    async () => serializeToolResult(getHomeContext()),
  );

  server.registerTool(
    "assess_activity",
    {
      title: "Assess recent activity",
      description: "Run the existing deterministic NightWatch context assessment and escalation decision over persisted recent events.",
    },
    async () => serializeToolResult(assessRecentActivity()),
  );

  server.registerTool(
    "get_alert_explanation",
    {
      title: "Get alert explanation",
      description: "Return an explanation and evidence grounded in the persisted events behind the current escalation decision.",
      inputSchema: { question: z.string().min(1).max(240).optional().default("Why did you wake me?") },
    },
    async ({ question }) => serializeToolResult(getAlertExplanation(question)),
  );

  return server;
}

export async function handleNightWatchMcpRequest(req: Request, res: Response) {
  const server = createNightWatchMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[NightWatch MCP] Request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  } finally {
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  }
}
