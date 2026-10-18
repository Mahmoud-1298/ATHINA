# ATHINA

ATHINA is a frontend + backend agent application.

- Frontend deployment: Cloudflare Pages
- Backend deployment: Render (`backend/server.js`)
- Voice: ElevenLabs
- LLM provider: OpenRouter (called by backend)

## Prerequisites

1. Node.js 20+
2. npm

## Local Development

Install dependencies from the repository root:

```bash
npm install
```

Run frontend locally:

```bash
npm run dev
```

Run backend locally:

```bash
cd backend
npm install
npm run dev
```

## Environment Variables

Frontend (`.env.local`; public client values only):

```bash
VITE_BACKEND_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Backend (`backend/.env`; use `backend/.env.example` as the template):

```bash
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=lxYfHSkYm1EzQzGhdbfc
ELEVENLABS_MODEL_ID=eleven_v3

# Optional GitHub integration for repo data + sync endpoint
GITHUB_TOKEN=...
GITHUB_OWNER=Mahmoud-1298
GITHUB_REPO=ATHINA
GITHUB_BRANCH=main

# Backend CORS; production must use explicit HTTPS frontend origins
FRONTEND_ORIGIN=http://localhost:5173
```

## Deploy

- Deploy frontend from repo root to Cloudflare Pages.
- Deploy backend using `render.yaml` (service root is `backend/`).

## Validation

```bash
npm test
npm run lint
npm run build
cd backend && npm test
```

## Production Checks

- Keep secrets in local `.env` files; commit only `.env.example`.
- Ensure `FRONTEND_ORIGIN` is explicitly set in production and never `*`.
- Backend API routes require a Supabase bearer access token; the client obtains it from Supabase Auth.
- Review [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) before deploying.
