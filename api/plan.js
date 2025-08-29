module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = req.body || {};
  const { name, inout, exposure, potIn } = body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
  const prompt = `You are a plant care assistant. Generate a beginner-friendly care plan for "${name}".
Return a single JSON object with these exact keys:
{
  "family": string,
  "genus": string,
  "species": string,
  "cultivar": string, // empty if none
  "lightLevel": "low"|"medium"|"high",
  "soilType": "generic"|"aroid"|"cactus",
  "baseIntervalDays": number, // baseline watering interval in days for ${inout||'indoor'} ${exposure||''}
  "tasks": [{"type":"fertilize"|"repot"|"prune"|"inspect"|"mist","everyDays":number}],
  "careSummary": string,
  "potDiameterIn": number // suggested for pot ${potIn||''} if provided
}
Only return JSON.`;
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
    const content = j.choices?.[0]?.message?.content || '{}';
    let data;
    try{ data = JSON.parse(content); }catch{ data = {}; }
    return res.json(data);
  }catch(err){
    res.status(500).json({ error: 'Proxy failure' });
  }
}

