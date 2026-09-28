# NightWatch frontend guidance

NightWatch is a React + Vite + Tailwind CSS frontend backed by a Node.js/tRPC server. The frontend must remain connected to the existing SQLite, MCP, deterministic context-engine, Alexa simulation, and optional Bedrock narration layers.

## Development server

The NightWatch development server is started with:

```bash
pnpm dev
```

It serves the React frontend and Node.js backend together. Do not replace the full-stack server with a standalone Vite-only server.

## Project structure

- `client/src/main.tsx` — React entrypoint and providers
- `client/src/App.tsx` — route and application shell
- `client/src/pages/Home.tsx` — NightWatch dashboard and simulator experience
- `client/src/index.css` — global theme and Tailwind styles
- `client/index.html` — Vite document shell
- `server/` — Node.js/tRPC backend and NightWatch domain logic
- `server/nightwatch/` — SQLite store, deterministic context engine, MCP boundary, and Alexa simulation
- `shared/` — shared application types and constants
- `vite.config.ts` — NightWatch-aware Vite configuration with the `client/` root and `dist/public` output
- `package.json` — full-stack scripts and dependencies

## Frontend data rules

- Use the existing tRPC client in `client/src/lib/trpc.ts` for backend data.
- Do not hard-code simulator results, escalation decisions, evidence, or Alexa responses in the UI.
- Keep the deterministic context engine as the sole authority for safety scoring and escalation.
- Keep Alexa/Echo, Ring, MCP remote authentication, and Bedrock status claims explicit about what is simulated, optional, local, or unimplemented.
- Preserve the existing `@/*` alias for `client/src` and `@shared/*` alias for `shared`.

## Styling

Tailwind CSS v4 is integrated through `@tailwindcss/vite`. Global styles belong in `client/src/index.css`; keep CSS imports at the top of that file. The current dashboard uses the NightWatch dark command-center visual system and should be extended without removing its safety/status labels.

## Verification

Before handing off frontend changes, run:

```bash
pnpm check
pnpm test
pnpm build
pnpm mcp:smoke
pnpm diff:check
```

Do not replace NightWatch's package, Vite, or TypeScript configuration with a standalone Figma Make scaffold. Adapt frontend-only settings while preserving the full-stack server and deployment paths.
