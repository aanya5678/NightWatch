# NightWatch

NightWatch is a context-aware home safety and alerting prototype for the Amazon Developer Hackathon 2026. It receives simulated Ring motion events, evaluates them against household context and a baseline, creates an explainable escalation decision, and drives a simulated Alexa alert. It deliberately reports **unusual activity** rather than claiming to identify a burglary, crime, or emergency.

## Milestone 1: local vertical slice

This first milestone is intentionally credential-free and simulator-only:

```text
Ring simulator
  → tRPC backend procedure
  → normalized in-memory event store
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

## Milestone 4: MCP client verification

NightWatch now includes a real SDK client smoke path using `Client` and `StreamableHTTPClientTransport`. The automated test mounts the existing `/mcp` handler on an ephemeral local HTTP server, performs MCP initialization, discovers the four tools, and calls each tool over HTTP. It compares returned event IDs, household state, assessment score, escalation status, and explanation evidence with the existing NightWatch store output. The client contains no context-engine or escalation logic.

With the development server running, the same check can be run manually:

```bash
pnpm mcp:smoke http://127.0.0.1:3000/mcp
```

## Run locally

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open the preview URL printed by the development server. The main judging path is:

1. Click **3 AM activity**.
2. Review the timeline, context factors, score, and escalation decision.
3. Click **Trigger Alexa alert**.
4. Ask **Why did you wake me?**.
5. Read the answer and evidence grounded in the current events.

The other controls demonstrate an isolated daytime event and repeated activity while the household is active. **Reset simulation** returns to the empty baseline.

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
```

## Design notes

The context score combines time of day, event frequency, intervals, household state, location, and deviation from baseline. Thresholds are deterministic and visible in the dashboard. A score of 40 or more is unusual; a score of 70 or more is high priority. These thresholds are prototype policy, not a validated safety standard.

No credentials are hard-coded. When real integrations are introduced, secrets must remain in environment variables and each official Amazon capability must be verified against current documentation. In particular, the real Ring capability, Alexa+ MCP/Agent Skill access, MCP specification version, and physical-device action surface must be confirmed before the README or demo claims them.

## License

MIT. See [`LICENSE`](LICENSE).
