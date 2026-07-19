import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VOICE_ID = 'lxYfHSkYm1EzQzGhdbfc';
const MODEL_ID = 'eleven_turbo_v2_5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { text } = body;
    if (!text || !text.trim()) {
      return Response.json({ error: 'Missing text' }, { status: 400 });
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ATHINA-Voice] ElevenLabs error:', response.status, errText);
      return Response.json(
        { error: `ElevenLabs error ${response.status}: ${errText}` },
        { status: 502 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Convert to base64 in chunks to avoid stack overflow
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);

    return Response.json({ audio: base64, format: 'mp3' });
  } catch (error) {
    console.error('[ATHINA-Voice] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});