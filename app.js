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
      applyHomeView();
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
      const pin = (plant?.potDiameterIn != null) ? plant.potDiameterIn : (plant?.potDiameterCm ? (plant.potDiameterCm/2.54) : '');
      $('#potDiameter').value = pin || '';
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
    await renderTasks(plants);
    // Empty state
    const oldEmpty = document.getElementById('emptyState');
    if(oldEmpty) oldEmpty.remove();
    if(!plants.length){
      const empty = document.createElement('div');
      empty.id = 'emptyState';
      empty.className = 'card';
      empty.style.margin = '12px 0';
      empty.innerHTML = '<div style="display:flex; align-items:center; gap:.5rem; justify-content:space-between"><div><strong>No plants yet.</strong><div class="muted">Use Add Plant or Add Demo to get started.</div></div><div><button id="emptySeed" class="btn">Add Demo</button></div></div>';
      list.parentElement.insertBefore(empty, list);
      const btn = document.getElementById('emptySeed');
      if(btn) btn.onclick = () => document.getElementById('seedBtn')?.click();
      return;
    }
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

  async function renderTasks(plants){
    const dueHost = document.getElementById('dueList');
    const upHost = document.getElementById('upcomingList');
    if(!dueHost || !upHost) return;
    dueHost.innerHTML = '';
    upHost.innerHTML = '';
    const s = getSettings();
    const filterType = s.taskType || 'all';
    const windowDays = Number(s.taskWindow || 7);
    const items = [];
    const today = new Date();
    for(const p of plants){
      // Watering as a task
      const waterDue = nextDueFrom(p);
      const d = parseDate(waterDue);
      const delta = daysBetween(today, d);
      if(filterType==='all' || filterType==='water'){
        items.push({ plant:p, type:'water', title:`Water ${p.name||''}`.trim(), due: waterDue, delta });
      }
      // Other tasks
      (p.tasks||[]).forEach(t => {
        const tdue = nextTaskDue(t, t.lastDone || p.lastWatered);
        if(tdue){
          const dt = daysBetween(today, parseDate(tdue));
          if(filterType==='all' || filterType==='other'){
            items.push({ plant:p, type:t.type, task:t, title:`${capitalize(t.type)} ${p.name||''}`.trim(), due: tdue, delta: dt });
          }
        }
      });
    }
    items.sort((a,b) => a.due.localeCompare(b.due));
    for(const it of items){
      const li = document.createElement('li');
      li.innerHTML = taskCardHTML(it);
      bindTaskCard(li, it);
      if(it.delta <= 0) dueHost.appendChild(li); else if(it.delta <= windowDays) upHost.appendChild(li);
    }
  }

  function taskCardHTML(it){
    const badge = dueClass(it.due);
    const rel = humanDue(it.due);
    const p = it.plant;
    const vol = waterPill(p);
    return `
      <article class="plant-card">
        <div class="header">
          <div>
            <div class="name">${escapeHtml(it.title)}</div>
            <div class="species">${escapeHtml(taxonLine(p))}</div>
          </div>
          <div class="pill ${badge}">${escapeHtml(rel)}</div>
        </div>
        <div class="stats">
          ${it.type==='water' ? vol : `<span class="pill">every ${it.task.everyDays}d</span>`}
        </div>
        <div class="actions-row">
          <button class="btn small" data-action="done">Done</button>
          <button class="btn small" data-action="open">Open</button>
        </div>
      </article>
    `;
  }

  // Home view toggle + filter persistence
  function applyHomeView(){
    const s = getSettings();
    const view = s.homeView || 'tasks';
    const tasksSection = document.getElementById('tasksSection');
    const plantsSection = document.getElementById('plantsSection');
    if(tasksSection && plantsSection){
      if(view === 'plants'){
        tasksSection.style.display = 'none';
        plantsSection.style.display = '';
      }else{
        tasksSection.style.display = '';
        plantsSection.style.display = '';
      }
    }
    const typeSel = document.getElementById('taskTypeFilter');
    const winSel = document.getElementById('taskWindowFilter');
    if(typeSel) typeSel.value = s.taskType || 'all';
    if(winSel) winSel.value = String(s.taskWindow || 7);
  }
  const viewTasksBtn = document.getElementById('viewToggleTasks');
  const viewPlantsBtn = document.getElementById('viewTogglePlants');
  if(viewTasksBtn) viewTasksBtn.addEventListener('click', () => { const s=getSettings(); s.homeView='tasks'; setSettings(s); applyHomeView(); showToast('Showing tasks'); });
  if(viewPlantsBtn) viewPlantsBtn.addEventListener('click', () => { const s=getSettings(); s.homeView='plants'; setSettings(s); applyHomeView(); showToast('Showing plants'); });
  const typeSel = document.getElementById('taskTypeFilter');
  const winSel = document.getElementById('taskWindowFilter');
  if(typeSel) typeSel.addEventListener('change', async () => { const s=getSettings(); s.taskType=typeSel.value; setSettings(s); await renderList(); showToast('Filters saved'); });
  if(winSel) winSel.addEventListener('change', async () => { const s=getSettings(); s.taskWindow=Number(winSel.value); setSettings(s); await renderList(); showToast('Filters saved'); });

  function showToast(msg){
    const t = document.getElementById('toast'); if(!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => { t.style.display = 'none'; }, 1500);
  }

  function bindTaskCard(root, it){
    root.querySelector('[data-action="done"]').addEventListener('click', async () => {
      if(it.type==='water'){
        it.plant.lastWatered = todayISO();
        it.plant.history = it.plant.history||[]; it.plant.history.push({type:'water', at: todayISO()});
      }else{
        it.task.lastDone = todayISO();
        it.plant.history = it.plant.history||[]; it.plant.history.push({type:`task:${it.type}`, at: todayISO()});
      }
      await PlantDB.put(it.plant);
      renderList();
    });
    root.querySelector('[data-action="open"]').addEventListener('click', () => navigateToPlant(it.plant.id));
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
    const modeled = Math.round((p.baseIntervalDays||7)
      * intervalMultiplier(p.lightLevel, p.potSize)
      * seasonalMultiplier(s, p.weatherOverride)
      * microEnvironmentMultiplier(p)
      * (1 + (Number(p.tuneIntervalPct||0)/100))
    );
    const factor = seasonalMultiplier(s, p.weatherOverride) * microEnvironmentMultiplier(p) * (1 + (Number(p.tuneIntervalPct||0)/100));
    const env = envSummary(p);
    const wx = wxPill(p);
    const volPill = waterPill(p);
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
          <span class="pill" title="Modeled interval">model ${modeled}d ×${factor.toFixed(2)}</span>
          ${envChip(p)}
          ${wx}
          ${volPill}
        </div>
        <div class="thumbs"></div>
        <div class="actions-row">
          <button class="btn small" data-action="water">Watered</button>
          <input type="file" accept="image/*" capture="environment" data-snap hidden />
          <button class="btn small icon" data-action="snap">Snap</button>
          <button class="btn small" data-action="open">Open</button>
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
    // Open detail view
    const openBtn = root.querySelector('[data-action="open"]');
    if(openBtn) openBtn.addEventListener('click', () => navigateToPlant(plant.id));
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
  // Seed demo data
  const seedBtn = document.getElementById('seedBtn');
  if(seedBtn){
    seedBtn.addEventListener('click', async () => {
      const demo = makeDemoPlants();
      for(const p of demo){ await PlantDB.put(p); }
      renderList();
      alert('Added demo plants');
    });
  }

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
      potDiameterIn: Number($('#potDiameter').value || 0),
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
      plant.weatherOverride = { tempC: parseFloat(tag.dataset.temp), rh: parseFloat(tag.dataset.rh), fetchedAt: tag.dataset.time || new Date().toISOString() };
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

  // Smart defaults based on name/genus/species
  ;['plantName','plantGenus','plantSpecies'].forEach(id => {
    const el = document.getElementById(id); if(el) el.addEventListener('input', applySmartDefaults);
  });
  function applySmartDefaults(){
    const name = document.getElementById('plantName').value.toLowerCase();
    const genus = document.getElementById('plantGenus').value.toLowerCase();
    const species = document.getElementById('plantSpecies').value.toLowerCase();
    const hint = `${genus} ${species} ${name}`;
    const setIfEmpty = (id, val) => { const el = document.getElementById(id); if(el && (!el.value || el.value===el.getAttribute('placeholder'))) el.value = val; };
    // Heuristics
    if(/(aloe|echeveria|haworth|crassula|sedum|opuntia|cactus|succulent|sansevieria|trifasciata|snake)/.test(hint)){
      setIfEmpty('soilType','cactus'); setIfEmpty('lightLevel','high'); setIfEmpty('baseInterval', 12);
    }else if(/(monstera|philodendron|anthurium|epipremnum|pothos|syngonium|aroid)/.test(hint)){
      setIfEmpty('soilType','aroid'); setIfEmpty('lightLevel','medium'); setIfEmpty('baseInterval', 7);
    }else if(/(fern|nephrolepis|pteris|blechnum)/.test(hint)){
      setIfEmpty('soilType','generic'); setIfEmpty('lightLevel','low'); setIfEmpty('baseInterval', 4);
    }else if(/(ficus|lyrata|rubber)/.test(hint)){
      setIfEmpty('soilType','aroid'); setIfEmpty('lightLevel','high'); setIfEmpty('baseInterval', 6);
    }else if(/(zamioculcas|zz\s*plant)/.test(hint)){
      setIfEmpty('soilType','generic'); setIfEmpty('lightLevel','low'); setIfEmpty('baseInterval', 12);
    }
    // Reasonable pot default
    setIfEmpty('potDiameter', 6);
  }

  // Update GBIF/Wikipedia links when taxon fields change
  // Removed external GBIF/Wikipedia buttons for a cleaner flow.

  // Cultivar suggestions via OpenAI proxy (optional)
  const cultBtn = document.getElementById('suggestCultivar');
  if(cultBtn){
    cultBtn.addEventListener('click', async () => {
      const genus = document.getElementById('plantGenus').value.trim();
      const species = document.getElementById('plantSpecies').value.trim();
      const name = document.getElementById('plantName').value.trim();
      try{
        const list = await getCultivarSuggestions({ genus, species, name });
        renderCultivarSuggestions(list);
      }catch{ alert('Cultivar suggestion failed'); }
    });
  }
  async function getCultivarSuggestions({ genus, species, name }){
    if(!window.OPENAI_PROXY_URL) return [];
    const q = [genus, species].filter(Boolean).join(' ');
    const prompt = `Suggest 3-6 widely known horticultural cultivars for ${q || name}. Return a JSON array of strings with cultivar names only.`;
    try{
      const r = await fetch(window.OPENAI_PROXY_URL, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ q: prompt }) });
      if(!r.ok) return [];
      const j = await r.json();
      if(Array.isArray(j)) return j.filter(x => typeof x === 'string');
      if(j && Array.isArray(j.cultivars)) return j.cultivars;
      return [];
    }catch{ return []; }
  }
  function renderCultivarSuggestions(list){
    const host = document.getElementById('cultivarSuggestions');
    if(!host) return; host.innerHTML = '';
    if(!list || !list.length){ host.textContent = 'No cultivar suggestions.'; return; }
    list.forEach(name => {
      const chip = document.createElement('span'); chip.className = 'sugg'; chip.textContent = name; chip.title = 'Click to apply';
      chip.onclick = () => { document.getElementById('cultivar').value = name; };
      host.appendChild(chip);
    });
  }

  // AI Care Plan (one-shot)
  const planBtn = document.getElementById('generatePlanBtn');
  if(planBtn){
    planBtn.addEventListener('click', async () => {
      const name = document.getElementById('plantName').value.trim();
      const inout = document.getElementById('inout').value;
      const exposure = document.getElementById('exposure').value;
      const potIn = parseFloat(document.getElementById('potDiameter').value || '0');
      if(!name){ alert('Enter a plant name or common name first'); return; }
      if(!window.OPENAI_PLAN_URL){ alert('AI plan URL not configured.'); return; }
      planBtn.disabled = true; planBtn.textContent = 'Generating…';
      try{
        const r = await fetch(window.OPENAI_PLAN_URL, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, inout, exposure, potIn }) });
        if(!r.ok) throw new Error('plan');
        const plan = await r.json();
        applyCarePlan(plan);
      }catch(err){ alert('Failed to generate care plan'); }
      finally{ planBtn.disabled = false; planBtn.textContent = 'AI Care Plan'; }
    });
  }
  function applyCarePlan(p){
    if(p.family) document.getElementById('plantFamily').value = p.family;
    if(p.genus) document.getElementById('plantGenus').value = p.genus;
    if(p.species) document.getElementById('plantSpecies').value = p.species;
    if(p.cultivar) document.getElementById('cultivar').value = p.cultivar;
    if(p.potDiameterIn) document.getElementById('potDiameter').value = Number(p.potDiameterIn) || '';
    if(p.lightLevel) document.getElementById('lightLevel').value = p.lightLevel;
    if(p.soilType) document.getElementById('soilType').value = p.soilType;
    if(Number.isFinite(p.baseIntervalDays)) document.getElementById('baseInterval').value = p.baseIntervalDays;
    if(p.tasks && Array.isArray(p.tasks)){
      const slots = ['1','2','3'];
      for(let i=0;i<slots.length;i++){
        const t = p.tasks[i]; if(!t) break;
        document.getElementById(`task${slots[i]}Type`).value = t.type || '';
        document.getElementById(`task${slots[i]}Every`).value = t.everyDays || '';
      }
    }
    // Put care summary into notes if provided
    if(p.careSummary){
      const prev = document.getElementById('notes').value.trim();
      document.getElementById('notes').value = p.careSummary + (prev ? ('\n\n' + prev) : '');
    }
    updateWaterRec();
  }
  // Per-plant weather override
  document.getElementById('usePlantWeather').addEventListener('click', async () => {
    try{
      let lat = parseFloat(document.getElementById('plantLat').value || '');
      let lon = parseFloat(document.getElementById('plantLon').value || '');
      if(!Number.isFinite(lat) || !Number.isFinite(lon)){
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
        lat = pos.coords.latitude; lon = pos.coords.longitude;
      }
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
      tag.dataset.time = new Date().toISOString();
      updateWaterRec();
    }catch(err){ alert('Location permission or network failed'); }
  });
  document.getElementById('clearPlantWeather').addEventListener('click', () => {
    const tag = document.getElementById('plantWeatherTag');
    tag.textContent = ''; delete tag.dataset.temp; delete tag.dataset.rh; delete tag.dataset.time;
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
  // Full-page detail view
  async function showPlantDetail(id){
    const plant = await PlantDB.get(id);
    if(!plant){ location.hash = ''; return; }
    $('#dashboardView').classList.remove('active');
    $('#editorView').classList.remove('active');
    $('#plantDetailView').classList.add('active');
    // Header
    $('#plantDetailTitle').textContent = plant.name || 'Plant';
    $('#plantDetailTaxon').textContent = taxonLine(plant);
    // Cover
    const cover = $('#plantDetailCover'); cover.style.backgroundImage = '';
    const photos = (plant.observations||[]).filter(o=>o.type==='photo'&&o.fileId).sort((a,b)=> (a.at<b.at?1:-1));
    if(plant.coverFileId) photos.unshift({fileId: plant.coverFileId});
    if(photos[0]){
      const blob = await PlantDB.getFile(photos[0].fileId); if(blob){ cover.style.backgroundImage = `url('${URL.createObjectURL(blob)}')`; }
    }
    // Stats
    const s = getSettings();
    const modeled = Math.round((plant.baseIntervalDays||7) * intervalMultiplier(plant.lightLevel, plant.potSize) * seasonalMultiplier(s, plant.weatherOverride) * microEnvironmentMultiplier(plant) * (1 + (Number(plant.tuneIntervalPct||0)/100)));
    const factor = seasonalMultiplier(s, plant.weatherOverride) * microEnvironmentMultiplier(plant) * (1 + (Number(plant.tuneIntervalPct||0)/100));
    const water = waterPill(plant);
    const dueTxt = humanDue(nextDueFrom(plant));
    const stats = $('#plantDetailStats');
    stats.innerHTML = `<span class="pill">model ${modeled}d ×${factor.toFixed(2)}</span> ${water} <span class="pill ${dueClass(nextDueFrom(plant))}">${escapeHtml(dueTxt)}</span>`;
    // Actions
    $('#detailBack').onclick = () => { location.hash = ''; };
    $('#detailEdit').onclick = () => { views.showEditor(plant); location.hash = '#editor'; };
    $('#detailWater').onclick = async () => { plant.lastWatered = todayISO(); plant.history = plant.history||[]; plant.history.push({type:'water', at: todayISO()}); await PlantDB.put(plant); showPlantDetail(plant.id); };
    $('#detailSnap').onclick = () => $('#detailSnapInput').click();
    $('#detailSnapInput').onchange = async (e) => { const f = e.target.files?.[0]; if(!f) return; const resized = await resizeImage(f,1600); const obs={id:cryptoRandomId(),at:new Date().toISOString(),type:'photo',fileId:await PlantDB.putFile(resized)}; plant.observations=plant.observations||[]; plant.observations.push(obs); await PlantDB.put(plant); showPlantDetail(plant.id); };
    // Observations
    await renderObsListFor($('#detailObsList'), plant);
    $('#detailObsAdd').onclick = async () => {
      const noteEl=$('#detailObsNote'); const fileEl=$('#detailObsPhoto'); const obs={id:cryptoRandomId(),at:new Date().toISOString(),note:noteEl.value.trim(),type:'note'}; if(fileEl.files&&fileEl.files[0]){const resized=await resizeImage(fileEl.files[0],1600); obs.type='photo'; obs.fileId=await PlantDB.putFile(resized);} plant.observations=plant.observations||[]; plant.observations.push(obs); plant.history=plant.history||[]; plant.history.push({type:'observe', at: obs.at}); await PlantDB.put(plant); noteEl.value=''; fileEl.value=''; renderObsListFor($('#detailObsList'), plant);
    };
    // Tasks
    renderTasksChipsFor($('#detailTaskList'), plant);
    // Notes
    $('#detailNotes').textContent = plant.notes || '';
    // Weather
    const wxEl = $('#plantDetailWx');
    if(plant.weatherOverride){
      const t = Math.round(plant.weatherOverride.tempC);
      const h = Math.round(plant.weatherOverride.rh);
      const age = plant.weatherOverride.fetchedAt ? relTime(plant.weatherOverride.fetchedAt) : '';
      wxEl.textContent = `wx ${t}°C / ${h}%${age ? ' • ' + age : ''}`;
      wxEl.style.display = '';
    }else{
      wxEl.textContent = '';
      wxEl.style.display = 'none';
    }
    // Chart
    drawHistory($('#detailChart'), plant);
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

  async function renderObsListFor(wrap, plant){
    wrap.innerHTML = '';
    const obs = (plant.observations||[]).slice().sort((a,b)=> (a.at<b.at?1:-1));
    for(const o of obs){
      const div = document.createElement('div');
      div.className = 'obs-card';
      if(o.fileId){
        const blob = await PlantDB.getFile(o.fileId); const url = blob ? URL.createObjectURL(blob) : '';
        div.innerHTML = `<img src="${url}"><div class="caption">${escapeHtml(o.note||'')} • ${escapeHtml(new Date(o.at).toLocaleDateString())}</div>`;
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

  function envSummary(p){
    const soil = p.soilType === 'cactus' ? 'cactus' : (p.soilType === 'aroid' ? 'aroid' : (p.soilType ? 'soil' : ''));
    const where = p.inout === 'outdoor' ? 'outdoor' : (p.inout ? 'indoor' : '');
    const exp = p.exposure || '';
    const tunes = [];
    if(p.tuneIntervalPct) tunes.push(`Δint ${p.tuneIntervalPct}%`);
    if(p.tuneVolumePct) tunes.push(`Δvol ${p.tuneVolumePct}%`);
    const parts = [soil, where, exp].filter(Boolean).join(' • ');
    const tuneStr = tunes.length ? ` • ${tunes.join(' ')}` : '';
    return (parts || '—') + tuneStr;
  }
  function envChip(p){
    const soil = p.soilType === 'cactus' ? 'cactus' : (p.soilType === 'aroid' ? 'aroid' : 'soil');
    const where = p.inout === 'outdoor' ? 'out' : 'in';
    const exp = p.exposure || '';
    return `<span class="pill" title="Environment">${soil} • ${where}${exp?(' • '+exp):''}</span>`;
  }

  // Weather pill in Details header
  function setDetailsWx(plant){
    const el = document.getElementById('detailsWx');
    if(!el) return;
    if(plant.weatherOverride){
      const t = Math.round(plant.weatherOverride.tempC);
      const h = Math.round(plant.weatherOverride.rh);
      const age = plant.weatherOverride.fetchedAt ? relTime(plant.weatherOverride.fetchedAt) : '';
      el.textContent = `wx ${t}°C / ${h}%${age ? ' • ' + age : ''}`;
      el.style.display = '';
    }else{
      el.textContent = '';
      el.style.display = 'none';
    }
  }

  function wxPill(p){
    if(!p.weatherOverride) return '';
    const age = p.weatherOverride.fetchedAt ? relTime(p.weatherOverride.fetchedAt) : '';
    const label = `wx${age ? ' • ' + age : ''}`;
    return `<span class="pill wx-pill" title="Plant weather override">${label}</span>`;
  }

  function relTime(iso){
    try{
      const then = new Date(iso).getTime();
      const now = Date.now();
      const s = Math.max(0, Math.round((now-then)/1000));
      if(s < 60) return `${s}s`; const m = Math.round(s/60);
      if(m < 60) return `${m}m`; const h = Math.round(m/60);
      if(h < 48) return `${h}h`; const d = Math.round(h/24);
      return `${d}d`;
    }catch{ return ''; }
  }

  function waterPill(p){
    const din = (p.potDiameterIn != null) ? p.potDiameterIn : (p.potDiameterCm ? (p.potDiameterCm/2.54) : 0);
    if(!din || din<=0) return '';
    const s = getSettings();
    const vol = estimateWaterMlFromInches(din, seasonalMultiplier(s, p.weatherOverride) * microEnvironmentMultiplier(p) * (1 + (Number(p.tuneVolumePct||0)/100)));
    if(!vol) return '';
    const ozMin = Math.round((vol.min/29.5735)*10)/10;
    const ozMax = Math.round((vol.max/29.5735)*10)/10;
    return `<span class="pill water" title="Estimated per watering">${vol.min}-${vol.max} ml (${ozMin}–${ozMax} oz)</span>`;
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

  function renderTasksChipsFor(host, plant){
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
        renderTasksChipsFor(host, plant);
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
  function seasonalMultiplier(s, override){
    const season = s.season || 'growing';
    const seasonFact = season==='peak' ? 0.9 : (season==='dormant' ? 1.2 : 1.0);
    let vpdFact = 1.0;
    const tc = Number.isFinite(override?.tempC) ? override.tempC : s.tempC;
    const rh = Number.isFinite(override?.rh) ? override.rh : s.rh;
    if(Number.isFinite(tc) && Number.isFinite(rh)){
      const T = tc; const RH = Math.max(0, Math.min(100, rh));
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
    const din = Number($('#potDiameter').value||0);
    const s = getSettings();
    const plant = {
      soilType: document.getElementById('soilType')?.value,
      inout: document.getElementById('inout')?.value,
      exposure: document.getElementById('exposure')?.value,
      tuneIntervalPct: Number(document.getElementById('tuneIntervalPct')?.value || 0),
      tuneVolumePct: Number(document.getElementById('tuneVolumePct')?.value || 0),
    };
    const micro = microEnvironmentMultiplier(plant);
    // Use plant editor override if present in tag
    const tag = document.getElementById('plantWeatherTag');
    const override = (tag && tag.dataset.temp && tag.dataset.rh) ? { tempC: parseFloat(tag.dataset.temp), rh: parseFloat(tag.dataset.rh) } : undefined;
    const seasonal = seasonalMultiplier(s, override);
    const mult = intervalMultiplier(light, pot) * seasonal * micro * (1 + plant.tuneIntervalPct/100);
    const modeled = Math.max(1, Math.round(base * mult));
    const vol = estimateWaterMlFromInches(din, seasonal * micro * (1 + plant.tuneVolumePct/100));
    const rec = document.getElementById('waterRec');
    if(rec){
      if(vol){
        const oz = { min: (vol.min/29.5735), max: (vol.max/29.5735) };
        const fmt = (n) => (Math.round(n*10)/10).toFixed(1);
        rec.textContent = `${vol.min}-${vol.max} ml (${fmt(oz.min)}–${fmt(oz.max)} oz) • every ~${modeled} days`;
      }else{
        rec.textContent = `every ~${modeled} days`;
      }
    }
  }
  function estimateWaterMlFromInches(diameterIn, factor){
    if(!diameterIn || diameterIn<=0) return null;
    const d = diameterIn * 0.0254; // m
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

  function makeDemoPlants(){
    const today = todayISO();
    const mk = (id, name, tax, light, potSize, potIn, soil, inout, exposure, baseDays) => ({
      id, name,
      family: tax.family, genus: tax.genus, species: tax.species, cultivar: tax.cultivar||'',
      lightLevel: light, potSize, potDiameterIn: potIn,
      soilType: soil, inout, exposure, roomLabel: '',
      baseIntervalDays: baseDays, tuneIntervalPct: 0, tuneVolumePct: 0,
      lastWatered: today, notes: '', tasks: [ {type:'fertilize', everyDays:30}, {type:'inspect', everyDays:14} ],
      observations: [], history: [{type:'water', at: today}],
    });
    return [
      mk(cryptoRandomId(), 'Monstera', {family:'Araceae',genus:'Monstera',species:'deliciosa'}, 'medium', 'large', 10, 'aroid', 'indoor', 'E', 7),
      mk(cryptoRandomId(), 'ZZ Plant', {family:'Araceae',genus:'Zamioculcas',species:'zamiifolia'}, 'low', 'medium', 8, 'generic', 'indoor', 'N', 12),
      mk(cryptoRandomId(), 'Snake Plant', {family:'Asparagaceae',genus:'Dracaena',species:'trifasciata'}, 'low', 'medium', 6, 'cactus', 'indoor', 'W', 14),
      mk(cryptoRandomId(), 'Fiddle-Leaf Fig', {family:'Moraceae',genus:'Ficus',species:'lyrata'}, 'high', 'large', 12, 'aroid', 'indoor', 'S', 6),
      mk(cryptoRandomId(), 'Aloe', {family:'Asphodelaceae',genus:'Aloe',species:'vera'}, 'high', 'small', 6, 'cactus', 'outdoor', 'S', 10),
    ];
  }

  // Kickoff
  function navigateToPlant(id){ location.hash = `#plant/${id}`; }
  function handleHash(){
    const h = location.hash;
    if(h.startsWith('#plant/')){
      const id = h.split('/')[1];
      showPlantDetail(id);
      return;
    }
    // default dashboard
    $('#plantDetailView').classList.remove('active');
    views.showDashboard();
  }
  window.addEventListener('hashchange', handleHash);
  handleHash();
})();
