# Production readiness checklist

## Supabase Auth

- [ ] Create separate Supabase projects for staging and production.
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Cloudflare Pages.
- [ ] Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`), and `SUPABASE_SERVICE_ROLE_KEY` in Render.
- [ ] Deploy the ElevenLabs signed-URL Edge Function with JWT verification enabled and test it with a valid and invalid user token.
- [ ] Enable the intended sign-in providers and configure their credentials in Supabase Auth.
- [ ] Decide whether public self-registration is allowed; restrict privileged features by server-verified roles if users have different permissions.
- [ ] For email registration, configure the Supabase confirmation email template to deliver a six-digit email OTP, and verify signup, resend, and confirmation links.
- [ ] Add the deployed frontend origin and password-reset URL to Supabase Auth's allowed redirect URLs.
- [ ] Review every table and storage bucket policy for least-privilege RLS; the backend service-role client bypasses RLS.
- [ ] Apply and verify the SQL migrations against staging before production.

## Hosting and secrets

- [ ] Set `NODE_ENV=production`, `FRONTEND_ORIGIN` to the exact HTTPS frontend origin(s), and `OPENROUTER_API_KEY` in Render. Production startup fails if these core values are missing.
- [ ] Set `VITE_BACKEND_URL` to the Render API URL in Cloudflare Pages and run a production build with those exact frontend variables.
- [ ] Configure Render's health check and select a paid plan if cold starts or availability are not acceptable.
- [ ] Store all private keys only in the hosting providers' secret stores. Rotate any secret that has ever appeared in Git history; removing `.env` from the current index does not erase history.
- [ ] Configure Google OAuth callback URLs and provider allowlists if Google integration is enabled.
- [ ] Configure domain, TLS, DNS, and separate staging/production deployment environments.

## Operations

- [ ] Resolve and review outstanding `npm audit` findings; do not apply breaking upgrades without compatibility testing.
- [ ] Add backend integration tests using staging Supabase/Auth and smoke tests for deployed endpoints.
- [ ] Configure error aggregation, uptime monitoring, alerting, and a documented incident owner.
- [ ] Define database backup/restore, migration rollback, retention, and user-data deletion procedures.
- [ ] Load test LLM, voice, upload, and streaming paths; set provider budgets and abuse thresholds.
- [ ] Confirm privacy/retention requirements for request audit logs and user content.
- [ ] Optimize the frontend's >500 kB JavaScript chunk and verify accessibility, browser support, and mobile behavior.
