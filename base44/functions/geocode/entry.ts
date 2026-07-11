import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { query } = body;
    if (!query) return Response.json({ error: 'Missing query' }, { status: 400 });

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    url.searchParams.set('q', query);

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'ATHINA-Agent/1.0', Accept: 'application/json' },
    });

    if (!response.ok) {
      return Response.json({ error: 'Geocoding failed with status ' + response.status }, { status: 502 });
    }

    const results = await response.json();

    return Response.json({
      results: (results || []).map((r) => ({
        name: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon),
        type: r.type,
        category: r.category,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});