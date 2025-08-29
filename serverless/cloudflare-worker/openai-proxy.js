// Cloudflare Workers OpenAI taxonomy proxy
// Vars: OPENAI_API_KEY (Workers KV/Env)

export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response('', { headers });
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } });
    const { q } = await request.json().catch(() => ({}));
    if (!q) return new Response(JSON.stringify({ error: 'Missing q' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });

    const prompt = `You are a plant taxonomy assistant. Given a plant name (common or scientific): "${q}".
Return 1–3 likely scientific suggestions as JSON array of objects with keys: family, genus, species, and optional cultivar if widely known. Keep keys lowercase. No extra text.`;
    try{
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [ { role: 'system', content: 'Return JSON only.' }, { role: 'user', content: prompt } ],
          temperature: 0.2
        })
      });
      if(!r.ok) {
        const txt = await r.text();
        return new Response(JSON.stringify({ error: 'OpenAI error', detail: txt }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      const j = await r.json();
      const content = j.choices?.[0]?.message?.content || '[]';
      let data;
      try{ data = JSON.parse(content); }catch{ data = []; }
      if(!Array.isArray(data)) data = [data];
      data = data.map(x => ({ family: x.family||'', genus: x.genus||'', species: x.species||'', cultivar: x.cultivar||'' }));
      return new Response(JSON.stringify(data), { headers: { ...headers, 'Content-Type': 'application/json' } });
    }catch(err){
      return new Response(JSON.stringify({ error: 'Proxy failure' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
  }
}

