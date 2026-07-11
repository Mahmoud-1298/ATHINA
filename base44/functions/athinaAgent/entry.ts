import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SYSTEM_PROMPT = 'You are ATHINA, an autonomous executive AI assistant. Be concise, professional, and intelligent. Summarize what you did for the user using specific details from the tool results.';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { message } = body;
    if (!message || !message.trim()) {
      return Response.json({ error: 'Missing message' }, { status: 400 });
    }

    const actions = [];

    // Detect location requests
    const locationMatch = message.match(/(?:show|find|locate|where is|where\b|map|pinpoint|address of|directions to)\s+(.+)/i);
    if (locationMatch) {
      const query = locationMatch[1].replace(/\?$/, '').trim();
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '1');
      url.searchParams.set('q', query);
      const resp = await fetch(url.toString(), {
        headers: { 'User-Agent': 'ATHINA-Agent/1.0', Accept: 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json();
        const first = data && data[0];
        if (first) {
          actions.push({ type: 'locate', success: true, query, name: first.display_name, lat: Number(first.lat), lng: Number(first.lon) });
        } else {
          actions.push({ type: 'locate', success: false, query, error: 'Location not found' });
        }
      } else {
        actions.push({ type: 'locate', success: false, query, error: 'Geocoding service returned ' + resp.status });
      }
    }

    // Detect web search requests
    const searchMatch = message.match(/(?:search|google|look up|lookup|browse|find out|what is|who is|tell me about)\s+(.+)/i);
    if (searchMatch && !locationMatch) {
      const query = searchMatch[1].replace(/\?$/, '').trim();
      const searchResult = await base44.integrations.Core.InvokeLLM({
        prompt: query,
        add_context_from_internet: true,
        model: 'gemini_3_flash',
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            sources: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } } } },
          },
        },
      });
      actions.push({ type: 'web_search', success: true, query, summary: searchResult.summary, sources: searchResult.sources || [] });
    }

    // If no actions were triggered, treat as conversation
    if (actions.length === 0) {
      const reply = await base44.integrations.Core.InvokeLLM({
        prompt: SYSTEM_PROMPT + '\n\nUser: ' + message,
      });
      return Response.json({
        success: true,
        reply: typeof reply === 'string' ? reply : JSON.stringify(reply),
        actions: [],
        timestamp: new Date().toISOString(),
      });
    }

    // Summarize results
    const resultsSummary = actions.map((a) => {
      if (a.type === 'locate') {
        return a.success ? 'Located "' + a.query + '": ' + a.name + ' at ' + a.lat + ', ' + a.lng : 'Failed to locate "' + a.query + '": ' + a.error;
      }
      if (a.type === 'web_search') {
        return 'Searched for "' + a.query + '": ' + (a.summary || '').slice(0, 500);
      }
      return JSON.stringify(a);
    }).join('\n');

    const finalReply = await base44.integrations.Core.InvokeLLM({
      prompt: SYSTEM_PROMPT + '\n\nUser asked: ' + message + '\n\nI executed these actions:\n' + resultsSummary + '\n\nSummarize what you did concisely. Mention specific details.',
    });

    return Response.json({
      success: true,
      reply: typeof finalReply === 'string' ? finalReply : JSON.stringify(finalReply),
      actions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});