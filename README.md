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
| MCP | Planned local server boundary; no MCP compliance claim is made yet |
| Persistence | In-memory store for the first vertical slice; SQLite is the next backend milestone |
| Transport | WebDev's type-safe tRPC procedure boundary; the domain layer is isolated so REST/FastAPI or another transport can be added without moving UI logic |

The WebDev full-stack scaffold uses a Node/TypeScript server, so the first working dashboard uses that platform-native server boundary rather than introducing a second always-on Python process. The business logic is kept in small, readable modules under `server/nightwatch/`. Before Amazon integrations, the next architectural decision is whether to port that isolated domain layer to a Python/FastAPI service or keep the platform server and expose a separate Python MCP service.

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

The context-engine tests cover an empty window, normal isolated activity, repeated quiet-hours activity while sleeping, and the fact that time alone does not cause an escalation.

## Project structure

```text
client/src/pages/Home.tsx             Dashboard UI and simulator controls
client/src/index.css                  NightWatch visual system
server/nightwatch/types.ts            Domain models and integration status
server/nightwatch/contextEngine.ts    Deterministic assessment and explanation logic
server/nightwatch/store.ts             Local simulator state and scenario generation
server/nightwatch/router.ts            Backend procedures consumed by the dashboard
server/nightwatch/contextEngine.test.ts Context-engine regression tests
```

## Design notes

The context score combines time of day, event frequency, intervals, household state, location, and deviation from baseline. Thresholds are deterministic and visible in the dashboard. A score of 40 or more is unusual; a score of 70 or more is high priority. These thresholds are prototype policy, not a validated safety standard.

No credentials are hard-coded. When real integrations are introduced, secrets must remain in environment variables and each official Amazon capability must be verified against current documentation. In particular, the real Ring capability, Alexa+ MCP/Agent Skill access, MCP specification version, and physical-device action surface must be confirmed before the README or demo claims them.

## License

MIT. See [`LICENSE`](LICENSE).
