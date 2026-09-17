# NightWatch

NightWatch is a context-aware home safety and alerting prototype for the Amazon Developer Hackathon 2026. It receives simulated Ring motion events, evaluates them against household context and a baseline, creates an explainable escalation decision, and drives a simulated Alexa alert. It deliberately reports **unusual activity** rather than claiming to identify a burglary, crime, or emergency.

## Milestone 1: local vertical slice

This first milestone is intentionally credential-free and simulator-only:

```text
Ring simulator
  → tRPC backend procedure
  → normalized SQLite-backed event store
  → deterministic context engine
  → escalation decision
  → simulated Alexa alert
  → grounded "Why did you wake me?" explanation
```

The dashboard communicates with the backend router. It does not call the context engine directly. The context engine is deterministic and is the authority for escalation; future AI can interpret context and generate language, but it must not be the sole authority for safety-critical escalation.

## Current status and deliberate limitations

| Integration | Status in this milestone |
| --- | --- |
| Ring | Simulator only; no live Ring credentials or undocumented API assumptions |
| Alexa+ | Simulated bedroom device and alert button only |
| AWS | Not connected |
| MCP | Streamable HTTP boundary targeting MCP `2025-11-25`; local experimental deployment |
| Persistence | Local SQLite store at `data/nightwatch.sqlite` |
| Transport | WebDev's type-safe tRPC procedure boundary; the domain layer is isolated so REST/FastAPI or another transport can be added without moving UI logic |

The WebDev full-stack scaffold uses a Node/TypeScript server, so the dashboard uses that platform-native server boundary rather than introducing a second always-on Python process. The business logic is kept in small, readable modules under `server/nightwatch/`. Persistence uses Node 22's built-in `node:sqlite` API, with no native npm dependency. The SQLite repository stores the current normalized Ring event window, household state, scenario marker, and alert history. Before Amazon integrations, the next architectural decision is whether to port that isolated domain layer to a Python/FastAPI service or keep the platform server and expose a separate Python MCP service.

## Milestone 3: MCP boundary

The official `@modelcontextprotocol/sdk` provides the transport and protocol handling. NightWatch mounts a stateless `POST /mcp` Streamable HTTP endpoint and exposes four read-oriented tools: `get_recent_events`, `get_home_context`, `assess_activity`, and `get_alert_explanation`. The tool handlers call the existing `store.ts` functions, which reload SQLite state and invoke the deterministic context engine. The MCP layer does not contain scoring, escalation, persistence, or explanation business logic.

This is an **experimental local MCP boundary**, tested in-process and with an HTTP initialization smoke test. It is not presented as Alexa+ compatible, as a physical Alexa integration, or as compliance with a particular MCP specification version. A future integration milestone must verify the target Amazon requirements, authentication, session behavior, protocol version, and deployment constraints before making those claims.

## Milestone 5: MCP Alexa+ readiness hardening

NightWatch explicitly targets MCP protocol version `2025-11-25`, matching the current Alexa+ MCP QuickStart technical requirement. The official SDK negotiates this version during initialization, and the client smoke test fails if a different version is returned. Each tool declares a small output schema and returns validated `structuredContent` alongside readable text content:

| Tool | Structured output |
| --- | --- |
| `get_recent_events` | `events`, `totalAvailable`, and SQLite `source` |
| `get_home_context` | Household state, scenario, baseline, latest event/alert, and integration status |
| `assess_activity` | Deterministic assessment, escalation decision, source event IDs, and authority marker |
| `get_alert_explanation` | Question, answer, evidence, and source event IDs |

The implementation satisfies the **local technical MCP checks** exercised here: initialization, protocol negotiation, `tools/list`, `tools/call`, Streamable HTTP, and structured-output validation. It does **not** satisfy Alexa+ onboarding yet. Amazon's current requirements additionally include a remotely reachable HTTPS endpoint, OAuth 2.1 authorization-code flow with PKCE/S256, protected-resource metadata, authorization-server metadata, developer-account/CLI onboarding, and add-on package metadata and certification. Those steps require Alexa+ developer access and are intentionally not implemented in this milestone. No Alexa+ compatibility claim is made.

## Milestone 6: simulated Alexa+ interaction experience

NightWatch now includes a local **“Alexa+ interaction simulation — powered by NightWatch MCP”** panel. It is intentionally a simulation rather than a live Alexa+ connection. When a scenario is run, the simulated Alexa layer calls the existing NightWatch MCP tool adapters for home context, assessment, and recent events. It then renders a grounded alert briefing and exposes the tool names, returned evidence, and source event IDs used for that response.

The conversation supports “Why did you wake me?”, “What happened?”, “How many events were detected?”, “Where did they happen?”, and “Was this unusual compared with the baseline?”. Unsupported questions receive a bounded explanation of the supported scope. Responses are generated from the current persisted NightWatch state; the interaction layer does not invent events, locations, timestamps, or escalation reasoning. The deterministic context engine remains the only escalation authority.

The judging path is: run **3 AM activity**, observe the three front-entrance motion events and unusual-activity decision, then read the simulated Alexa briefing and ask **Why did you wake me?**. The follow-up cites the actual household state, event timing, frequency, location, and baseline factors returned by NightWatch.

This milestone does not connect to Alexa or an Echo, does not wake or target a physical device, and does not claim Alexa+ certification, Amazon approval, or live Alexa+ connectivity. A real integration remains dependent on Alexa+ developer access, a remote authenticated HTTPS MCP deployment, add-on onboarding, and Amazon’s review process.

## Milestone 4: MCP client verification

NightWatch now includes a real SDK client smoke path using `Client` and `StreamableHTTPClientTransport`. The automated test mounts the existing `/mcp` handler on an ephemeral local HTTP server, performs MCP initialization, discovers the four tools, and calls each tool over HTTP. It compares returned event IDs, household state, assessment score, escalation status, and explanation evidence with the existing NightWatch store output. The client contains no context-engine or escalation logic.

With the development server running, the same check can be run manually:

```bash
pnpm mcp:smoke http://127.0.0.1:3000/mcp
```

## Getting started

Requirements: **Node.js 22.5+** and **pnpm**. The repository uses Node's built-in `node:sqlite` API, so no native SQLite package or separate database service is required.

Clone and install the project:

```bash
git clone https://github.com/aanya5678/NightWatch.git
cd NightWatch
pnpm install
```

There is no separate database-initialization command. The first backend request creates `data/nightwatch.sqlite` and its schema automatically. That runtime database is local-only and is ignored by Git.

Start the development server:

```bash
pnpm dev
```

Open `http://127.0.0.1:3000/` when running locally, or open the preview URL printed by the development server. The main judging path is:

1. Click **3 AM activity**.
2. Review the timeline, context factors, score, and escalation decision.
3. Click **Trigger Alexa alert**.
4. Ask **Why did you wake me?**.
5. Read the answer and evidence grounded in the current events.

The other controls demonstrate an isolated daytime event and repeated activity while the household is active. **Reset simulation** returns to the empty baseline.

To test the MCP endpoint as a real MCP client, keep the development server running in one terminal and run this command in a second terminal:

```bash
pnpm mcp:smoke http://127.0.0.1:3000/mcp
```

The smoke client performs MCP initialization, verifies protocol `2025-11-25`, discovers all four tools, calls each tool, and validates every structured response. This is the recommended local `/mcp` check; it avoids relying on a hand-written JSON-RPC request.

## Mock Ring event payloads

The repository includes schema-valid example payloads under [`examples/mock-events/`](examples/mock-events/). Each file contains an array of the exact `RingEvent` objects used by NightWatch: `id`, ISO `timestamp`, `deviceId`, `deviceName`, `location`, literal `eventType: "motion"`, scalar `metadata`, and `householdState` (`"sleeping"` or `"active"`). They are examples for inspection and fixtures; the current simulator still generates its own normalized events through the dashboard.

| File | Scenario | Expected deterministic range |
| --- | --- | --- |
| [`mock_isolated_daytime.json`](examples/mock-events/mock_isolated_daytime.json) | One front-entrance motion event while the household is active during daytime | **0–39: `normal`** |
| [`mock_baseline_active.json`](examples/mock-events/mock_baseline_active.json) | Three repeated side-gate events while the household is active | **40–69: `unusual`** |
| [`mock_ring_event_3am.json`](examples/mock-events/mock_ring_event_3am.json) | Three repeated front-entrance events during quiet hours while the household is sleeping | **70–100: `high_priority`** |

The example files are validated in `server/nightwatch/mockEvents.test.ts` through the exported `ringEventSchema` and the real `assessActivity()` function. This ensures the examples exercise the actual thresholds rather than a parallel format or hand-calculated policy. To demonstrate the same scenarios in the application, run `pnpm dev`, open the dashboard, and select **Isolated daytime**, **Repeated activity**, or **3 AM activity**. The dashboard displays the resulting score and classification.

## MCP tool reference

NightWatch exposes these tools at the local Streamable HTTP endpoint `/mcp`. The tools are registered in `server/nightwatch/mcpServer.ts`; their structured outputs are defined in `server/nightwatch/mcpSchemas.ts`. Every tool calls an existing domain adapter in `server/nightwatch/mcpTools.ts`, so MCP does not duplicate persistence, scoring, escalation, or explanation logic.

The shared schema names below mean the following exact objects: `RingEvent` has `id`, `timestamp`, `deviceId`, `deviceName`, `location`, `eventType: "motion"`, scalar `metadata`, and `householdState`; `ContextFactor` has `key`, `label`, numeric `points`, `impact: "elevating" | "neutral"`, and `detail`; and `AlertRecord` has `id`, `createdAt`, `status: "pending" | "delivered"`, `message`, `reason`, and `relatedEventIds: string[]`.

### `get_recent_events`

**Purpose:** Return normalized recent Ring motion events from the SQLite event store.

**Input:** An optional object `{ "limit": number }`. `limit` is an integer from 1 through 50 and defaults to 10.

**Output:** `{ "events": RingEvent[], "totalAvailable": number, "source": "NightWatch SQLite event store" }`.

Example tool request:

```json
{ "name": "get_recent_events", "arguments": { "limit": 3 } }
```

Example structured response shape:

```json
{
  "events": [{ "id": "ring-…", "timestamp": "2026-09-17T03:04:00.000Z", "deviceId": "ring-front-01", "deviceName": "Ring Front Entrance", "location": "front entrance", "eventType": "motion", "metadata": { "zone": "porch", "sequence": 1 }, "householdState": "sleeping" }],
  "totalAvailable": 3,
  "source": "NightWatch SQLite event store"
}
```

The adapter calls `getSnapshot()` and returns the persisted event window; it does not create or assess events.

### `get_home_context`

**Purpose:** Return the current household state, scenario marker, baseline, recent-event count, latest event, latest alert, and integration status.

**Input:** No fields; use `{}`.

**Output:** `{ "householdState": "sleeping" | "active", "lastScenario": "ready" | "normal" | "unusual" | "repeated", "baseline": { "typicalEventsPerHour": number, "typicalLocations": string[], "quietHours": { "start": number, "end": number }, "description": string }, "recentEventCount": number, "latestEvent": RingEvent | null, "latestAlert": AlertRecord | null, "integrationStatus": { "ring": "Simulator", "alexa": "Simulation only", "aws": "Not connected", "mcp": "Local boundary (experimental)" } }`.

Example tool request:

```json
{ "name": "get_home_context", "arguments": {} }
```

The adapter reads `getSnapshot()` and returns current persisted context. It does not make an escalation decision.

### `assess_activity`

**Purpose:** Run the existing deterministic context assessment and escalation decision over persisted recent events.

**Input:** No fields; use `{}`.

**Output:** `{ "assessment": { "classification": "normal" | "unusual" | "high_priority", "score": number, "factors": ContextFactor[], "summary": string, "comparedWithBaseline": string, "eventCount": number, "intervalSeconds": number | null, "location": string }, "decision": { "escalated": boolean, "priority": "none" | "unusual" | "high_priority", "reason": string, "alertMessage": string | null, "createdAt": string }, "eventIds": string[], "deterministicAuthority": "NightWatch contextEngine.createEscalationDecision" }`.

Example tool request:

```json
{ "name": "assess_activity", "arguments": {} }
```

The adapter calls `getSnapshot()`, which invokes `assessActivity()` and `createEscalationDecision()` from `contextEngine.ts`. The context engine remains the authority for the score and escalation thresholds: below 40 is `normal`, 40–69 is `unusual`, and 70 or higher is `high_priority`.

### `get_alert_explanation`

**Purpose:** Return a grounded explanation and evidence for the current escalation decision.

**Input:** An optional object `{ "question": string }`. `question` must contain 1–240 characters and defaults to `"Why did you wake me?"`.

**Output:** `{ "question": string, "answer": string, "evidence": string[], "sourceEventIds": string[] }`.

Example tool request:

```json
{ "name": "get_alert_explanation", "arguments": { "question": "Why did you wake me?" } }
```

Example structured response shape:

```json
{
  "question": "Why did you wake me?",
  "answer": "I woke you because NightWatch observed 3 motion events near the front entrance during a context window where the household was sleeping…",
  "evidence": ["Activity occurred during the household quiet-hours window (23:00–06:00).", "3 motion events were observed in this assessment window."],
  "sourceEventIds": ["ring-…"]
}
```

The adapter calls `askWhy()`, which runs the deterministic assessment and `explainDecision()` over the current persisted events. It does not invent evidence or infer a crime or emergency.

## Test and build

```bash
pnpm test
pnpm check
pnpm build
```

The context-engine tests cover an empty window, normal isolated activity, repeated quiet-hours activity while sleeping, and the fact that time alone does not cause an escalation. MCP tests additionally cover initialization, protocol negotiation, tool discovery, all four calls, output schemas, and real HTTP transport.

## Project structure

```text
client/src/pages/Home.tsx             Dashboard UI and simulator controls
client/src/index.css                  NightWatch visual system
server/nightwatch/types.ts            Domain models and integration status
server/nightwatch/contextEngine.ts    Deterministic assessment and explanation logic
server/nightwatch/store.ts              Simulator generation and SQLite-backed snapshot orchestration
server/nightwatch/sqliteSchema.ts       Minimal SQLite DDL and indexes
server/nightwatch/sqliteRepository.ts   SQLite persistence boundary
server/nightwatch/router.ts            Backend procedures consumed by the dashboard
server/nightwatch/contextEngine.test.ts Context-engine regression tests
server/nightwatch/sqliteRepository.test.ts SQLite persistence regression tests
server/nightwatch/mcpTools.ts            Typed adapters over existing domain capabilities
server/nightwatch/mcpServer.ts           Official SDK server and Streamable HTTP endpoint
server/nightwatch/mcpServer.test.ts      In-process MCP tool protocol tests
server/nightwatch/mcpClientSmoke.ts     Official SDK client smoke verifier
server/nightwatch/mcpClientSmoke.test.ts Real HTTP client-to-server verification
server/nightwatch/alexaSimulation.ts     MCP-backed simulated Alexa conversation layer
server/nightwatch/alexaSimulation.test.ts Simulated Alexa interaction and state tests
server/nightwatch/mockEvents.test.ts     Schema and deterministic-range checks for examples
examples/mock-events/                     Representative RingEvent JSON fixtures
```

## Design notes

The context score combines time of day, event frequency, intervals, household state, location, and deviation from baseline. Thresholds are deterministic and visible in the dashboard. A score of 40 or more is unusual; a score of 70 or more is high priority. These thresholds are prototype policy, not a validated safety standard.

No credentials are hard-coded. When real integrations are introduced, secrets must remain in environment variables and each official Amazon capability must be verified against current documentation. In particular, the real Ring capability, Alexa+ MCP/Agent Skill access, MCP specification version, and physical-device action surface must be confirmed before the README or demo claims them.

## License

MIT. See [`LICENSE`](LICENSE).
