import { z } from "zod";

const scalarMetadata = z.union([z.string(), z.number(), z.boolean()]);

export const ringEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  deviceId: z.string(),
  deviceName: z.string(),
  location: z.string(),
  eventType: z.literal("motion"),
  metadata: z.record(z.string(), scalarMetadata),
  householdState: z.enum(["sleeping", "active"]),
});

const alertSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  status: z.enum(["pending", "delivered"]),
  message: z.string(),
  reason: z.string(),
  relatedEventIds: z.array(z.string()),
});

const baselineSchema = z.object({
  typicalEventsPerHour: z.number(),
  typicalLocations: z.array(z.string()),
  quietHours: z.object({ start: z.number(), end: z.number() }),
  description: z.string(),
});

const architectureSchema = z.object({
  ring: z.literal("Simulator"),
  alexa: z.literal("Simulation only"),
  aws: z.literal("Not connected"),
  mcp: z.literal("Local boundary (experimental)"),
});

const contextFactorSchema = z.object({
  key: z.string(),
  label: z.string(),
  points: z.number(),
  impact: z.enum(["elevating", "neutral"]),
  detail: z.string(),
});

const assessmentSchema = z.object({
  classification: z.enum(["normal", "unusual", "high_priority"]),
  score: z.number().min(0).max(100),
  factors: z.array(contextFactorSchema),
  summary: z.string(),
  comparedWithBaseline: z.string(),
  eventCount: z.number(),
  intervalSeconds: z.number().nullable(),
  location: z.string(),
});

const decisionSchema = z.object({
  escalated: z.boolean(),
  priority: z.enum(["none", "unusual", "high_priority"]),
  reason: z.string(),
  alertMessage: z.string().nullable(),
  createdAt: z.string(),
});

export const recentEventsOutputSchema = z.object({
  events: z.array(ringEventSchema),
  totalAvailable: z.number(),
  source: z.literal("NightWatch SQLite event store"),
});

export const homeContextOutputSchema = z.object({
  householdState: z.enum(["sleeping", "active"]),
  lastScenario: z.enum(["ready", "normal", "unusual", "repeated"]),
  baseline: baselineSchema,
  recentEventCount: z.number(),
  latestEvent: ringEventSchema.nullable(),
  latestAlert: alertSchema.nullable(),
  integrationStatus: architectureSchema,
});

export const assessmentOutputSchema = z.object({
  assessment: assessmentSchema,
  decision: decisionSchema,
  eventIds: z.array(z.string()),
  deterministicAuthority: z.literal("NightWatch contextEngine.createEscalationDecision"),
});

export const explanationOutputSchema = z.object({
  question: z.string(),
  answer: z.string(),
  evidence: z.array(z.string()),
  sourceEventIds: z.array(z.string()),
});
