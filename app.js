// Core UI + scheduling logic
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Utility
  const todayISO = () => new Date().toISOString().slice(0,10);
  const parseDate = (iso) => iso ? new Date(iso + (iso.length===10 ? 'T00:00:00' : '')) : new Date();
  const addDays = (date, days) => new Date(date.getTime() + days*86400000);
  const fmtDate = (d) => d.toISOString().slice(0,10);
  const daysBetween = (a,b) => Math.round((b - a)/86400000);

  // Nerdy: derive watering multiplier from light + pot size
  function intervalMultiplier(lightLevel, potSize){
    let light = 1.0; // baseline
    if(lightLevel === 'low') light = 1.15; // water less often
    if(lightLevel === 'medium') light = 1.0;
    if(lightLevel === 'high') light = 0.8; // water more often

    let pot = 1.0;
    if(potSize === 'small') pot = 0.85; // dries faster
    if(potSize === 'medium') pot = 1.0;
    if(potSize === 'large') pot = 1.1; // dries slower

    return Math.max(0.5, Math.min(1.5, light * pot));
  }

  function nextDueFrom(plant){
    const base = Math.max(1, Number(plant.baseIntervalDays || 7));
    const mult = intervalMultiplier(plant.lightLevel, plant.potSize);
    const s = getSettings();
    const seasonal = seasonalMultiplier(s);
    const micro = microEnvironmentMultiplier(plant);
    const interval = Math.max(1, Math.round(base * mult * seasonal * micro));
    const since = parseDate(plant.lastWatered || todayISO());
    return fmtDate(addDays(since, interval));
  }

  function nextTaskDue(task, lastDateISO){
    if(!task || !task.type || !task.everyDays) return null;
    const last = parseDate(lastDateISO || todayISO());
    return fmtDate(addDays(last, Math.max(1, Number(task.everyDays))));
  }

  function humanDue(nextDue){
    const d = parseDate(nextDue);
    const delta = daysBetween(new Date(), d);
    if(delta < -1) return `${Math.abs(delta)} days overdue`;
    if(delta === -1) return `1 day overdue`;
    if(delta === 0) return `due today`;
    if(delta === 1) return `due tomorrow`;
    return `in ${delta} days`;
  }

  function dueClass(nextDue){
    const d = parseDate(nextDue);
    const delta = daysBetween(new Date(), d);
    if(delta <= -1) return 'overdue';
    if(delta <= 0) return 'due';
    if(delta <= 2) return 'soon';
    return 'ok';
  }

  // Views
  const views = {
    showDashboard(){
      $('#editorView').classList.remove('active');
      $('#dashboardView').classList.add('active');
      renderList();
      renderScience();
    },
    showEditor(plant){
      $('#dashboardView').classList.remove('active');
      $('#editorView').classList.add('active');
      const isEdit = !!plant;
      $('#plantId').value = plant?.id || '';
      $('#plantName').value = plant?.name || '';
      $('#plantFamily').value = plant?.family || '';
      $('#plantGenus').value = plant?.genus || '';
      $('#plantSpecies').value = plant?.species || '';
      $('#cultivar').value = plant?.cultivar || '';
      $('#potDiameter').value = plant?.potDiameterCm || '';
      $('#baseInterval').value = plant?.baseIntervalDays || 7;
      $('#lightLevel').value = plant?.lightLevel || 'medium';
      $('#potSize').value = plant?.potSize || 'medium';
      $('#soilType').value = plant?.soilType || 'generic';
      $('#exposure').value = plant?.exposure || '';
      $('#inout').value = plant?.inout || 'indoor';
      $('#roomLabel').value = plant?.roomLabel || '';
      $('#lastWatered').value = plant?.lastWatered || '';
      $('#notes').value = plant?.notes || '';
      try{ updateWaterRec(); }catch{}
    }
  };

  async function renderList(){
    const list = $('#plantList');
    // Revoke image object URLs from existing cards
    Array.from(list.children).forEach(li => {
      try{ (JSON.parse(li.dataset.urls||'[]')).forEach(u => URL.revokeObjectURL(u)); }catch{}
    });
    list.innerHTML = '';
    const plants = await PlantDB.all();
    plants.forEach(p => {
      p.nextDue = nextDueFrom(p);
      (p.tasks||[]).forEach(t => t.nextDue = nextTaskDue(t, t.lastDone || p.lastWatered));
    });
    plants.sort((a,b) => a.nextDue.localeCompare(b.nextDue));
    for(const plant of plants){
      const li = document.createElement('li');
      li.innerHTML = cardHTML(plant);
      bindCard(li, plant);
      list.appendChild(li);
      enrichCardWithMedia(li, plant);
    }
  }

  async function enrichCardWithMedia(root, plant){
    const coverEl = root.querySelector('.cover');
    const thumbsEl = root.querySelector('.thumbs');
    const photos0 = (plant.observations||[]).filter(o => o.type==='photo' && o.fileId).sort((a,b)=> (a.at<b.at?1:-1));
    const photos = plant.coverFileId ? [{fileId: plant.coverFileId, at: '9999'}].concat(photos0.filter(p=>p.fileId!==plant.coverFileId)) : photos0;
    try{ (JSON.parse(root.dataset.urls||'[]')).forEach(u => URL.revokeObjectURL(u)); }catch{}
    const usedUrls = [];
    const top = photos.slice(0, 4);
    for(let i=0;i<top.length;i++){
      try{
        const blob = await PlantDB.getFile(top[i].fileId);
        if(!blob) continue;
        const url = URL.createObjectURL(blob);
        usedUrls.push(url);
        if(i===0 && coverEl){ coverEl.style.backgroundImage = `url('${url}')`; }
        if(i>0 && thumbsEl){ const img = document.createElement('img'); img.src = url; img.alt=''; thumbsEl.appendChild(img); }
      }catch{}
    }
    root.dataset.urls = JSON.stringify(usedUrls);
  }

  function cardHTML(p){
    const dueTxt = humanDue(p.nextDue);
    const badge = dueClass(p.nextDue);
    const tasks = (p.tasks||[]).filter(t => t.type && t.everyDays).slice(0,2);
    const tasksHTML = tasks.map(t => `<span class="pill ${t.nextDue ? dueClass(t.nextDue) : ''}">${escapeHtml(labelForTask(t))}</span>`).join('');
    const s = getSettings();
    const modeled = Math.round((p.baseIntervalDays||7) * intervalMultiplier(p.lightLevel, p.potSize) * seasonalMultiplier(s));
    const factor = seasonalMultiplier(s);
    return `
      <article class="plant-card">
        <div class="cover"></div>
        <div class="header">
          <div>
            <div class="name">${escapeHtml(p.name || 'Untitled')}</div>
            <div class="species">${escapeHtml(taxonLine(p))}</div>
          </div>
          <div class="pill ${badge}">${escapeHtml(dueTxt)}</div>
        </div>
        <div class="stats">
          <span title="Light level" class="pill">${escapeHtml(p.lightLevel || 'medium')}</span>
          <span title="Pot size" class="pill">${escapeHtml(p.potSize || 'medium')}</span>
          <span class="pill">base ${Number(p.baseIntervalDays || 7)}d</span>
          <span class="pill" title="Modeled interval">model ${modeled}d ×${factor.toFixed(2)}</span>
          ${tasksHTML}
        </div>
        <div class="thumbs"></div>
        <div class="actions-row">
          <button class="btn small" data-action="water">Watered</button>
          <input type="file" accept="image/*" capture="environment" data-snap hidden />
          <button class="btn small icon" data-action="snap">Snap</button>
          <button class="btn small" data-action="details">Details</button>
          <button class="btn small" data-action="edit">Edit</button>
          <button class="btn small danger" data-action="delete">Delete</button>
        </div>
      </article>
    `;
  }

  function bindCard(root, plant){
    root.querySelector('[data-action="water"]').addEventListener('click', async () => {
      const now = todayISO();
      plant.lastWatered = now;
      plant.history = Array.isArray(plant.history) ? plant.history : [];
      plant.history.push({ type:'water', at: now });
      if(plant.history.length > 200) plant.history.shift();
      plant.nextDue = nextDueFrom(plant);
      await PlantDB.put(plant);
      renderList();
    });
    root.querySelector('[data-action="details"]').addEventListener('click', () => openDetails(plant));
    const snapInput = root.querySelector('[data-snap]');
    root.querySelector('[data-action="snap"]').addEventListener('click', () => snapInput.click());
    snapInput.addEventListener('change', async () => {
      const file = snapInput.files && snapInput.files[0];
      if(!file) return;
      const resized = await resizeImage(file, 1600);
      const obs = { id: cryptoRandomId(), at: new Date().toISOString(), type:'photo', fileId: await PlantDB.putFile(resized) };
      plant.observations = Array.isArray(plant.observations) ? plant.observations : [];
      plant.observations.push(obs);
      plant.history = Array.isArray(plant.history) ? plant.history : [];
      plant.history.push({ type:'observe', at: obs.at });
      await PlantDB.put(plant);
      renderList();
    });
    root.querySelector('[data-action="edit"]').addEventListener('click', () => views.showEditor(plant));
    root.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if(confirm(`Delete ${plant.name || 'this plant'}?`)){
        await PlantDB.delete(plant.id);
        renderList();
      }
    });
  }

  // Form handling
  $('#addPlantBtn').addEventListener('click', () => views.showEditor(null));
  $('#cancelEdit').addEventListener('click', () => views.showDashboard());

  $('#plantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#plantId').value || cryptoRandomId();
    const plant = {
      id,
      name: $('#plantName').value.trim(),
      species: $('#plantSpecies').value.trim(),
      genus: $('#plantGenus').value.trim(),
      family: $('#plantFamily').value.trim(),
      cultivar: $('#cultivar').value.trim(),
      baseIntervalDays: Number($('#baseInterval').value || 7),
      lightLevel: $('#lightLevel').value,
      potSize: $('#potSize').value,
      soilType: $('#soilType').value,
      exposure: $('#exposure').value,
      inout: $('#inout').value,
      roomLabel: $('#roomLabel').value.trim(),
      lastWatered: $('#lastWatered').value || todayISO(),
      notes: $('#notes').value.trim(),
      tasks: collectTasks(),
    };
    // Persist plant-level weather override if present
    const tag = document.getElementById('plantWeatherTag');
    if(tag && tag.dataset.temp && tag.dataset.rh){
      plant.weatherOverride = { tempC: parseFloat(tag.dataset.temp), rh: parseFloat(tag.dataset.rh) };
    }else{
      delete plant.weatherOverride;
    }
    plant.nextDue = nextDueFrom(plant);
    await PlantDB.put(plant);
    views.showDashboard();
  });

  // Suggest taxonomy via optional OpenAI proxy, else GBIF fallback
  $('#suggestTaxonomy').addEventListener('click', async () => {
    const name = ($('#plantName').value || '').trim();
    if(!name){ alert('Enter a plant name first'); return; }
    try{
      const suggestions = await getTaxoSuggestions(name);
      renderTaxoSuggestions(suggestions);
    }catch(err){ alert('Suggestion failed'); }
  });

  // Per-plant weather override
  document.getElementById('usePlantWeather').addEventListener('click', async () => {
    try{
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      const { latitude: lat, longitude: lon } = pos.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`;
      const r = await fetch(url);
      const j = await r.json();
      let t = j?.current?.temperature_2m; let h = j?.current?.relative_humidity_2m;
      if(!Number.isFinite(t) || !Number.isFinite(h)) throw new Error('weather');
      // If indoor, shift toward typical indoor conditions
      const inout = document.getElementById('inout').value || 'indoor';
      if(inout === 'indoor'){ t = t - 2; h = Math.min(100, h + 10); }
      const tag = document.getElementById('plantWeatherTag');
      tag.textContent = `Plant weather: ${Math.round(t)}°C / ${Math.round(h)}%`;
      tag.dataset.temp = String(t); tag.dataset.rh = String(h);
      updateWaterRec();
    }catch(err){ alert('Location permission or network failed'); }
  });
  document.getElementById('clearPlantWeather').addEventListener('click', () => {
    const tag = document.getElementById('plantWeatherTag');
    tag.textContent = ''; delete tag.dataset.temp; delete tag.dataset.rh;
    updateWaterRec();
  });

  async function getTaxoSuggestions(name){
    const out = [];
    // Prefer OpenAI proxy for richer suggestions if available
    try{
      if(window.OPENAI_PROXY_URL){
        const ai = await suggestWithOpenAI(name);
        if(Array.isArray(ai)) ai.forEach(x => out.push(x));
        else if(ai) out.push(ai);
      }
    }catch{}
    // GBIF suggestions
    try{
      const gbif = await suggestListGBIF(name);
      gbif.forEach(x => out.push(x));
    }catch{}
    // Deduplicate by (genus,species) or name
    const seen = new Set();
    const dedup = [];
    for(const s of out){
      const key = (s.genus||'')+' '+(s.species||'') + '|' + (s.family||'');
      if(seen.has(key.trim())) continue; seen.add(key.trim()); dedup.push(s);
    }
    return dedup.slice(0,8);
  }

  function renderTaxoSuggestions(list){
    const host = document.getElementById('taxoSuggestions');
    if(!host) return;
    host.innerHTML = '';
    if(!list || !list.length){ host.textContent = 'No suggestions.'; return; }
    for(const s of list){
      const chip = document.createElement('span');
      chip.className = 'sugg';
      const label = [s.family?`[${s.family}]`:null, [s.genus,s.species].filter(Boolean).join(' ')||s.name].filter(Boolean).join(' ');
      chip.textContent = label;
      chip.title = 'Click to apply';
      chip.onclick = () => {
        if(s.family) document.getElementById('plantFamily').value = s.family;
        if(s.genus) document.getElementById('plantGenus').value = s.genus;
        if(s.species) document.getElementById('plantSpecies').value = s.species;
      };
      host.appendChild(chip);
    }
  }

  // Import / Export
  $('#exportBtn').addEventListener('click', async () => {
    const data = await PlantDB.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plant-tracker-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  $('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const text = await file.text();
    try{
      const json = JSON.parse(text);
      await PlantDB.import(json);
      views.showDashboard();
      alert('Import complete');
    }catch(err){
      alert('Invalid JSON');
    }
    e.target.value = '';
  });

  // ICS export for reminders
  $('#icsBtn').addEventListener('click', async () => {
    const plants = await PlantDB.all();
    const ics = buildICS(plants);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plant-reminders.ics';
    document.body.appendChild(a); a.click(); a.remove();
  });

  // Share link sync
  $('#shareBtn').addEventListener('click', async () => {
    const payload = await PlantDB.export();
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${location.origin}${location.pathname}#sync=${encoded}`;
    copyToClipboard(url);
    alert('Share link copied to clipboard. Open it on another device to import.');
  });

  // If loaded with #sync=, offer to import
  (function handleHashSync(){
    const m = location.hash.match(/#sync=([A-Za-z0-9+/=]+)/);
    if(!m) return;
    try{
      const json = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if(confirm('Import shared plants data? This merges with your current list.')){
        PlantDB.import(json).then(() => views.showDashboard());
      }
    }catch{}
  })();

  // Details modal with chart
  const modal = $('#detailsModal');
  $('#detailsClose').addEventListener('click', () => modal.classList.remove('show'));
  function openDetails(plant){
    $('#detailsTitle').textContent = plant.name || 'Plant Details';
    $('#detailsMeta').innerHTML = escapeHtml(detailMeta(plant));
    drawHistory($('#historyCanvas'), plant);
    bindObservations(plant);
    renderTasksChips(plant);
    modal.classList.add('show');
  }

  function drawHistory(canvas, plant){
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const history = (plant.history||[]).filter(h => h.type==='water').map(h => parseDate(h.at)).sort((a,b)=>a-b);
    if(history.length < 2){
      ctx.fillStyle = '#a9c8ba';
      ctx.fillText('Not enough watering history yet', 16, 24);
      return;
    }
    // Compute intervals in days
    const intervals = [];
    for(let i=1;i<history.length;i++) intervals.push(daysBetween(history[i-1], history[i]));
    const pad = 40;
    const W = canvas.width - pad*2;
    const H = canvas.height - pad*2;
    const maxY = Math.max(...intervals, plant.baseIntervalDays || 7) * 1.2;
    // Axes
    ctx.strokeStyle = '#244437'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, pad+H); ctx.lineTo(pad+W, pad+H); ctx.stroke();
    // Baseline (base interval and current modeled interval)
    const base = plant.baseIntervalDays || 7;
    const modeled = Math.round((plant.baseIntervalDays||7) * intervalMultiplier(plant.lightLevel, plant.potSize));
    ctx.strokeStyle = '#62d2b1'; ctx.setLineDash([4,4]);
    let yBase = pad + H - (base/maxY)*H; ctx.beginPath(); ctx.moveTo(pad, yBase); ctx.lineTo(pad+W, yBase); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#0fb58a'; ctx.beginPath(); let yMod = pad + H - (modeled/maxY)*H; ctx.moveTo(pad, yMod); ctx.lineTo(pad+W, yMod); ctx.stroke();
    // Data line
    ctx.strokeStyle = '#e9f5ef'; ctx.fillStyle = '#e9f5ef'; ctx.lineWidth = 2;
    ctx.beginPath();
    intervals.forEach((v, i) => {
      const x = pad + (i/(intervals.length-1))*W;
      const y = pad + H - (v/maxY)*H;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    intervals.forEach((v, i) => {
      const x = pad + (i/(intervals.length-1))*W;
      const y = pad + H - (v/maxY)*H;
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    });
    // Labels
    ctx.fillStyle = '#a9c8ba'; ctx.fillText('Days between waterings', pad, pad - 8);
    ctx.fillText(`base=${base}d modeled=${modeled}d`, pad+W-160, pad - 8);
  }

  // Observations
  function bindObservations(plant){
    const note = $('#obsNote');
    const photo = $('#obsPhoto');
    const addBtn = $('#obsAddBtn');
    addBtn.onclick = async () => {
      const obs = { id: cryptoRandomId(), at: new Date().toISOString(), note: note.value.trim(), type: 'note' };
      if(photo.files && photo.files[0]){
        const resized = await resizeImage(photo.files[0], 1600);
        obs.type = 'photo';
        obs.fileId = await PlantDB.putFile(resized);
      }
      plant.observations = Array.isArray(plant.observations) ? plant.observations : [];
      plant.observations.push(obs);
      plant.history = Array.isArray(plant.history) ? plant.history : [];
      plant.history.push({ type:'observe', at: obs.at });
      await PlantDB.put(plant);
      note.value = '';
      if(photo.value) photo.value = '';
      renderObsList(plant);
    };
    renderObsList(plant);
  }

  async function renderObsList(plant){
    const wrap = $('#obsList');
    wrap.innerHTML = '';
    const obs = (plant.observations||[]).slice().sort((a,b)=> (a.at<b.at?1:-1));
    for(const o of obs){
      const div = document.createElement('div');
      div.className = 'obs-card';
      if(o.fileId){
        const blob = await PlantDB.getFile(o.fileId);
        const url = blob ? URL.createObjectURL(blob) : '';
        div.innerHTML = `<img src="${url}"><div class="caption">${escapeHtml(o.note||'')} • ${escapeHtml(new Date(o.at).toLocaleDateString())}</div>`;
        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.style.margin = '6px 8px';
        const setBtn = document.createElement('button'); setBtn.className='btn small'; setBtn.textContent='Set as cover';
        setBtn.onclick = async () => { plant.coverFileId = o.fileId; await PlantDB.put(plant); renderList(); };
        actions.appendChild(setBtn);
        div.appendChild(actions);
      }else{
        div.innerHTML = `<div class="caption">${escapeHtml(o.note||'')} • ${escapeHtml(new Date(o.at).toLocaleDateString())}</div>`;
      }
      wrap.appendChild(div);
    }
  }

  function resizeImage(file, maxW){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(blob => { URL.revokeObjectURL(url); if(blob) resolve(blob); else reject(new Error('blob failed')); }, 'image/jpeg', 0.85);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function collectTasks(){
    const slots = [
      { t: $('#task1Type').value, e: Number($('#task1Every').value||0) },
      { t: $('#task2Type').value, e: Number($('#task2Every').value||0) },
      { t: $('#task3Type').value, e: Number($('#task3Every').value||0) },
    ];
    return slots.filter(s => s.t && s.e>0).map(s => ({ type:s.t, everyDays:s.e }));
  }

  function taxonLine(p){
    const parts = [];
    if(p.family) parts.push(p.family);
    if(p.genus) parts.push(p.genus + (p.species ? ` ${p.species}` : ''));
    else if(p.species) parts.push(p.species);
    if(p.cultivar) parts.push(`‘${p.cultivar}’`);
    return parts.join(' • ');
  }

  function labelForTask(t){
    const name = t.type === 'fertilize' ? 'fertilize' : (t.type === 'repot' ? 'repot' : t.type);
    if(t.nextDue){
      const rel = humanDue(t.nextDue);
      return `${name}: ${rel}`;
    }
    return `${name}: every ${t.everyDays}d`;
  }

  function renderTasksChips(plant){
    const host = $('#taskList');
    host.innerHTML = '';
    const tasks = (plant.tasks||[]).filter(t=>t.type && t.everyDays);
    for(const t of tasks){
      t.nextDue = nextTaskDue(t, t.lastDone || plant.lastWatered);
      const chip = document.createElement('span');
      chip.className = 'task-chip';
      chip.innerHTML = `<span class="pill ${t.nextDue?dueClass(t.nextDue):''}">${escapeHtml(labelForTask(t))}</span> <button title="Mark done">Done</button>`;
      chip.querySelector('button').addEventListener('click', async () => {
        t.lastDone = todayISO();
        plant.history = Array.isArray(plant.history) ? plant.history : [];
        plant.history.push({ type:`task:${t.type}`, at: t.lastDone });
        await PlantDB.put(plant);
        renderTasksChips(plant);
        renderList();
      });
      host.appendChild(chip);
    }
  }

  function detailMeta(p){
    const lines = [];
    if(p.family) lines.push(`Family: ${p.family}`);
    if(p.genus || p.species) lines.push(`Taxon: ${[p.genus, p.species].filter(Boolean).join(' ')}`);
    if(p.cultivar) lines.push(`Cultivar: ${p.cultivar}`);
    lines.push(`Light: ${p.lightLevel || 'medium'}`);
    lines.push(`Pot: ${p.potSize || 'medium'}`);
    lines.push(`Base interval: ${p.baseIntervalDays||7}d`);
    const tasks = (p.tasks||[]).filter(t=>t.type).map(t => `• ${t.type} every ${t.everyDays}d${t.nextDue ? ` (${humanDue(t.nextDue)})` : ''}`);
    if(tasks.length) lines.push('Tasks:\n' + tasks.join('\n'));
    return lines.join('\n');
  }

  function buildICS(plants){
    const NL = '\r\n';
    const now = new Date();
    function dtStamp(d){ return d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'; }
    let out = 'BEGIN:VCALENDAR'+NL+'VERSION:2.0'+NL+'PRODID:-//Plant Tracker//EN'+NL;
    for(const p of plants){
      const events = [];
      // watering
      const waterDue = nextDueFrom(p);
      events.push({
        uid: `${p.id}-water@plant-tracker`,
        start: waterDue,
        summary: `Water ${p.name||'plant'}`,
        desc: taxonLine(p)
      });
      // tasks
      (p.tasks||[]).forEach((t, idx) => {
        const due = nextTaskDue(t, t.lastDone || p.lastWatered);
        if(due){
          events.push({ uid: `${p.id}-${t.type}-${idx}@plant-tracker`, start: due, summary: `${capitalize(t.type)} ${p.name||''}`.trim(), desc: `Every ${t.everyDays}d`});
        }
      });
      for(const ev of events){
        out += 'BEGIN:VEVENT'+NL;
        out += 'UID:'+ev.uid+NL;
        out += 'DTSTAMP:'+dtStamp(now)+NL;
        out += 'DTSTART;VALUE=DATE:'+ev.start.replace(/-/g,'')+NL;
        out += 'SUMMARY:'+escapeICS(ev.summary)+NL;
        if(ev.desc) out += 'DESCRIPTION:'+escapeICS(ev.desc)+NL;
        out += 'END:VEVENT'+NL;
      }
    }
    out += 'END:VCALENDAR'+NL;
    return out;
  }

  function escapeICS(s=''){ return s.replace(/([,;\\])/g, '\\$1'); }
  function capitalize(s=''){ return s.charAt(0).toUpperCase()+s.slice(1); }
  function copyToClipboard(text){
    if(navigator.clipboard?.writeText){ navigator.clipboard.writeText(text); return; }
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }

  // Micro-environment factor from soil/exposure/indoor-outdoor
  function microEnvironmentMultiplier(p){
    let m = 1.0;
    if(p.soilType === 'cactus') m *= 1.2; // holds less water → longer interval
    if(p.soilType === 'aroid') m *= 0.95; // airy but moisture-retentive mixes → slightly shorter
    if(p.inout === 'outdoor') m *= 0.95; // outdoors usually dries faster
    if(p.exposure === 'S' || p.exposure === 'W') m *= 0.95; // sunnier aspects
    if(p.exposure === 'N') m *= 1.05; // dimmer aspect
    return clamp(m, 0.8, 1.3);
  }

  // Science panel and seasonal multiplier
  function getSettings(){
    try{ return JSON.parse(localStorage.getItem('plant-settings')||'{}'); }catch{ return {}; }
  }
  function setSettings(next){
    localStorage.setItem('plant-settings', JSON.stringify(next));
  }
  function seasonalMultiplier(s){
    const season = s.season || 'growing';
    const seasonFact = season==='peak' ? 0.9 : (season==='dormant' ? 1.2 : 1.0);
    let vpdFact = 1.0;
    if(Number.isFinite(s.tempC) && Number.isFinite(s.rh)){
      const T = s.tempC; const RH = Math.max(0, Math.min(100, s.rh));
      const svp = 0.6108 * Math.exp((17.27*T)/(T+237.3)); // kPa
      const vpd = svp * (1 - RH/100);
      vpdFact = clamp(1.0 - (vpd - 0.8)*0.3, 0.75, 1.15);
    }
    return seasonFact * vpdFact;
  }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function renderScience(){
    const s = getSettings();
    $('#seasonSelect').value = s.season || 'growing';
    $('#tempInput').value = (Number.isFinite(s.tempC) ? s.tempC : '');
    $('#rhInput').value = (Number.isFinite(s.rh) ? s.rh : '');
    const factor = seasonalMultiplier(s);
    $('#modelSummary').textContent = `factor ×${factor.toFixed(2)} (season ${s.season||'growing'}${Number.isFinite(s.tempC)?`, ${s.tempC}°C/${s.rh||''}% RH`:''})`;
  }
  $('#seasonSelect').addEventListener('change', () => { const s = getSettings(); s.season = $('#seasonSelect').value; setSettings(s); renderScience(); renderList(); });
  $('#tempInput').addEventListener('input', () => { const s = getSettings(); s.tempC = parseFloat($('#tempInput').value); setSettings(s); renderScience(); renderList(); });
  $('#rhInput').addEventListener('input', () => { const s = getSettings(); s.rh = parseFloat($('#rhInput').value); setSettings(s); renderScience(); renderList(); });

  // Weather integration via Open-Meteo using browser geolocation
  $('#useWeather').addEventListener('click', async () => {
    try{
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      const { latitude: lat, longitude: lon } = pos.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`;
      const r = await fetch(url);
      const j = await r.json();
      const t = j?.current?.temperature_2m; const h = j?.current?.relative_humidity_2m;
      if(Number.isFinite(t) && Number.isFinite(h)){
        const s = getSettings(); s.tempC = t; s.rh = h; setSettings(s); renderScience(); renderList();
      }else{
        alert('Weather lookup failed');
      }
    }catch(err){ alert('Location permission or network failed'); }
  });

  // Watering volume recommendation in editor
  const formInputs = ['plantName','plantGenus','plantSpecies','baseInterval','lightLevel','potSize','potDiameter','tuneIntervalPct','tuneVolumePct'];
  formInputs.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', updateWaterRec);
  });
  function updateWaterRec(){
    const base = Number($('#baseInterval').value||7);
    const light = $('#lightLevel').value; const pot = $('#potSize').value;
    const dcm = Number($('#potDiameter').value||0);
    const s = getSettings();
    const plant = {
      soilType: document.getElementById('soilType')?.value,
      inout: document.getElementById('inout')?.value,
      exposure: document.getElementById('exposure')?.value,
      tuneIntervalPct: Number(document.getElementById('tuneIntervalPct')?.value || 0),
      tuneVolumePct: Number(document.getElementById('tuneVolumePct')?.value || 0),
    };
    const micro = microEnvironmentMultiplier(plant);
    const seasonal = seasonalMultiplier(s);
    const mult = intervalMultiplier(light, pot) * seasonal * micro * (1 + plant.tuneIntervalPct/100);
    const modeled = Math.max(1, Math.round(base * mult));
    const vol = estimateWaterMl(dcm, seasonal * micro, plant.tuneVolumePct);
    const rec = document.getElementById('waterRec');
    if(rec) rec.textContent = vol ? `${vol.min}-${vol.max} ml per watering • every ~${modeled} days` : `every ~${modeled} days`;
  }
  function estimateWaterMl(diameterCm, factor){
    if(!diameterCm || diameterCm<=0) return null;
    const d = diameterCm/100; // m
    const h = d*0.9; // m, approx
    const volM3 = Math.PI*Math.pow(d/2,2)*h; // m^3
    const volLiters = volM3 * 1000; // L
    // Heuristic: 10–15% of pot volume, scaled by factor clamp 0.7–1.3
    const f = clamp(factor, 0.7, 1.3);
    const min = Math.round(volLiters * 1000 * 0.10 * f); // ml
    const max = Math.round(volLiters * 1000 * 0.15 * f); // ml
    return { min, max };
  }

  // OpenAI proxy hook (optional)
  async function suggestWithOpenAI(name){
    try{
      const r = await fetch(window.OPENAI_PROXY_URL, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ q: name }) });
      if(!r.ok) return null; const j = await r.json();
      return j; // either {family, genus, species, cultivar?} or [{...}, ...]
    }catch{ return null; }
  }
  // GBIF fallback
  async function suggestWithGBIF(name){
    try{
      const r = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`);
      const j = await r.json();
      if(!j) return null;
      return { family: j.family, genus: j.genus, species: j.species || j.specificEpithet };
    }catch{ return null; }
  }
  async function suggestListGBIF(name){
    try{
      const r = await fetch(`https://api.gbif.org/v1/species/suggest?q=${encodeURIComponent(name)}&limit=6`);
      const arr = await r.json();
      if(!Array.isArray(arr)) return [];
      return arr.map(x => ({ family: x.family, genus: x.genus, species: x.species || x.specificEpithet, name: x.scientificName }));
    }catch{ return []; }
  }

  // Helpers
  function escapeHtml(s=''){
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function cryptoRandomId(){
    if(window.crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
  }

  // Kickoff
  views.showDashboard();
})();
