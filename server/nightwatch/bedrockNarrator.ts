import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { ENV } from "../_core/env";
import type { ActivityAssessment, EscalationDecision, ExplanationResponse, HouseholdBaseline, HouseholdState, RingEvent } from "./types";

export type NarrationProvider = "bedrock" | "deterministic-fallback";

export interface NarrationRequest {
  question: string;
  householdState: HouseholdState;
  baseline: HouseholdBaseline;
  events: RingEvent[];
  assessment: ActivityAssessment;
  decision: EscalationDecision;
  explanation: ExplanationResponse;
}

export interface NarrationResult {
  provider: NarrationProvider;
  text: string;
  modelId: string | null;
  fallbackReason?: "disabled" | "missing_configuration" | "request_failed";
}

interface BedrockClientLike {
  send(command: ConverseCommand, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
}

export interface NarratorConfig {
  enabled: boolean;
  region: string;
  modelId: string;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

function getConfig(): NarratorConfig {
  return {
    enabled: ENV.nightwatchAiEnabled,
    region: ENV.awsRegion,
    modelId: ENV.nightwatchBedrockModelId,
    timeoutMs: ENV.nightwatchAiTimeoutMs,
  };
}

function fallback(request: NarrationRequest, reason: NarrationResult["fallbackReason"]): NarrationResult {
  return {
    provider: "deterministic-fallback",
    text: request.explanation.answer,
    modelId: null,
    fallbackReason: reason,
  };
}

function buildGroundingPayload(request: NarrationRequest) {
  return {
    householdState: request.householdState,
    baseline: request.baseline,
    events: request.events.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      deviceId: event.deviceId,
      deviceName: event.deviceName,
      location: event.location,
      eventType: event.eventType,
      metadata: event.metadata,
      householdState: event.householdState,
    })),
    assessment: request.assessment,
    decision: request.decision,
    deterministicExplanation: request.explanation,
  };
}

export function buildNarrationPrompt(request: NarrationRequest): string {
  return [
    "User question:",
    request.question,
    "",
    "Authoritative NightWatch facts (JSON):",
    JSON.stringify(buildGroundingPayload(request), null, 2),
  ].join("\n");
}

function extractResponseText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const output = (value as { output?: { message?: { content?: Array<{ text?: string }> } } }).output;
  const text = output?.message?.content?.map(block => block.text ?? "").join("").trim();
  return text || null;
}

export function createBedrockNarrator(
  client?: BedrockClientLike,
  config: NarratorConfig = getConfig(),
) {
  let runtimeClient: BedrockClientLike | undefined = client;

  return async function narrate(request: NarrationRequest): Promise<NarrationResult> {
    if (!config.enabled) return fallback(request, "disabled");
    if (!config.region || !config.modelId) return fallback(request, "missing_configuration");

    runtimeClient ??= new BedrockRuntimeClient({ region: config.region });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, config.timeoutMs || DEFAULT_TIMEOUT_MS));

    try {
      const command = new ConverseCommand({
        modelId: config.modelId,
        system: [{ text: "You are the optional NightWatch narration layer. Use only supplied facts. Preserve the exact unusual-activity terminology and supplied classification. Never claim burglary, crime, emergency, or a person's identity. Never invent events, timestamps, locations, sensor readings, household state, or reasons. Never change the escalation decision. Answer briefly and naturally; if facts are insufficient, say so." }],
        messages: [{ role: "user", content: [{ text: buildNarrationPrompt(request) }] }],
        inferenceConfig: { maxTokens: 180, temperature: 0.2 },
      });
      const response = await runtimeClient.send(command, { abortSignal: controller.signal });
      const text = extractResponseText(response);
      return text
        ? { provider: "bedrock", text, modelId: config.modelId }
        : fallback(request, "request_failed");
    } catch (error) {
      console.warn("[NightWatch AI] Bedrock narration unavailable; using deterministic fallback.", error instanceof Error ? error.name : "unknown error");
      return fallback(request, "request_failed");
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const narrateWithBedrock = createBedrockNarrator();
