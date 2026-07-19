import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RENDER_BASE_URL = "https://backend1-88nk.onrender.com";

Deno.serve(async (req) => {
  try {
    console.log("[ATHINA] === Request received ===");
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { message, sessionId } = body;
    if (!message || !message.trim()) {
      return Response.json({ error: 'Missing message' }, { status: 400 });
    }

    console.log("[ATHINA] Proxying to Render /api/agent:", message.slice(0, 80));

    const response = await fetch(`${RENDER_BASE_URL}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ATHINA] Render error:", response.status, errText);
      return Response.json({ error: `Render error: ${response.status}: ${errText}` }, { status: 502 });
    }

    const data = await response.json();
    console.log("[ATHINA] Render response received");
    return Response.json(data);
  } catch (error) {
    console.error("[ATHINA] ERROR:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});