import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_ID = 'agent_3301kt6djmwmet7tp8n2jjs9f3f5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ElevenLabs-SignedUrl] Error:', response.status, errText);
      return Response.json(
        { error: `ElevenLabs error ${response.status}: ${errText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    return Response.json({ signed_url: data.signed_url });
  } catch (error) {
    console.error('[ElevenLabs-SignedUrl] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});