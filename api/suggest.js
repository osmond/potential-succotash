// Vercel Serverless Function for taxonomy suggestions via OpenAI
// Deploy path: /api/suggest
// Env: OPENAI_API_KEY

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { q } = req.body || {};
  if (!q) return res.status(400).json({ error: 'Missing q' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
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
      return res.status(500).json({ error: 'OpenAI error', detail: txt });
    }
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || '[]';
    // Try JSON parse; if single object, wrap as array
    let data;
    try{ data = JSON.parse(content); }catch{ data = []; }
    if(!Array.isArray(data)) data = [data];
    // Normalize keys
    data = data.map(x => ({ family: x.family||'', genus: x.genus||'', species: x.species||'', cultivar: x.cultivar||'' }));
    res.json(data);
  }catch(err){
    res.status(500).json({ error: 'Proxy failure' });
  }
}
