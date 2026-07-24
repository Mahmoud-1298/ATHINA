# AGENTS.md

## Project Context

This is a user-owned application repository. Keep changes focused on the user's request and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Deployment Architecture

- Frontend: Cloudflare Pages
- Backend: Render (`backend/server.js`)
- LLM: OpenRouter via backend
- Voice: ElevenLabs via backend

## Key Files

- `src/`: frontend application source.
- `src/lib/functionApi.js`: frontend function invocation client (`/api/functions/:name`).
- `backend/server.js`: backend API and legacy-compatible function endpoints.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `npm run dev` from repo root for frontend local development.
- Use `cd backend && npm run dev` for backend local development.
- Keep frontend calls aligned with backend endpoints and contracts.
- Run the relevant checks from `package.json` before finishing code changes.
