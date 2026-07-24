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

Frontend (`.env.local`):

```bash
VITE_BACKEND_URL=http://localhost:3000
```

Backend (`backend/.env`):

```bash
OPENROUTER_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=lxYfHSkYm1EzQzGhdbfc
ELEVENLABS_MODEL_ID=eleven_v3

# Optional GitHub integration for repo data + sync endpoint
GITHUB_TOKEN=...
GITHUB_OWNER=Mahmoud-1298
GITHUB_REPO=ATHINA
GITHUB_BRANCH=main

# Optional backend CORS override
FRONTEND_ORIGIN=http://localhost:5173
```

## Deploy

- Deploy frontend from repo root to Cloudflare Pages.
- Deploy backend using `render.yaml` (service root is `backend/`).

## Build

```bash
npm run build
```
