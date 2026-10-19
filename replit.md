# Kaos Chat

Kaos Chat is a Turkish group-chat workbench with five distinct characters. ChatGPT and Gemini use server-side API routes when their API keys are configured; Claude, Grok, and DeepSeek are local rule-based simulations, not real language models. Chat history is stored in the browser's `localStorage`; the chat feature does not require a database.

## Run

- Install workspace dependencies with `pnpm install`.
- Run the workspace's configured Project workflow in Replit.
- API server: `pnpm --filter @workspace/api-server run dev` (port 5000; builds the server before starting).
- Frontend: `pnpm --filter @workspace/conversation-engine run dev`.
- Run tests from the repository root with `pnpm test` (requires Node.js 22+; Replit configuration uses Node.js 24).
- Typecheck: `pnpm run typecheck`.
- Build: `pnpm run build`.

## Secrets

Set these in Replit Secrets, never in frontend code or committed files:

- `OPENAI_API_KEY` — OpenAI API key.
- `GEMINI_API_KEY` — Google Gemini API key.

Optional model overrides:

- `OPENAI_MODEL` (default `gpt-4.1-mini`).
- `GEMINI_MODEL` (default `gemini-2.5-flash`).

API calls may incur provider charges. The status endpoint reveals only whether a key is configured and which model name is selected; it never returns the key.

## Project layout

- `artifacts/conversation-engine/src/App.tsx` — Turkish responsive UI, manual messaging, run controls, localStorage history, and TXT/JSON export.
- `artifacts/conversation-engine/src/engine.ts` — local dialogue rules, speaker profiles, claims, questions, and conversation state.
- `artifacts/conversation-engine/src/automation.ts` — single-loop controller, provider cancellation, turn limits, and stop handling.
- `artifacts/conversation-engine/src/providerClient.ts` — frontend API request payloads; contains no secret keys.
- `artifacts/api-server/src/providers.ts` — server-side OpenAI/Gemini requests, timeouts, error mapping, and provider model defaults.
- `artifacts/api-server/src/routes/` — health, status, ChatGPT, and Gemini endpoints.
- `artifacts/conversation-engine/src/chatStorage.ts` — localStorage sessions and TXT/JSON export.

## Notes

- Automatic chat does not start by itself; use **Otomatik başlat**.
- The selected turn count is the total number of generated character messages. Five turns means five messages total.
- Provider requests are tested with mocked HTTP responses in the test suite; successful tests do not prove that real API keys or account billing are valid.
- Local character output is a rule-based simulation, not an actual Claude, Grok, or DeepSeek model.
