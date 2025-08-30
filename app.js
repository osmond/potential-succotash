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

    // Nerdy: derive watering multiplier from pot size category
    function intervalMultiplier(potSize){
      let pot = 1.0;
      if(potSize === 'small') pot = 0.85; // dries faster
      if(potSize === 'medium') pot = 1.0;
      if(potSize === 'large') pot = 1.1; // dries slower
      if(potSize === 'tiny') pot = 0.7;
      if(potSize === 'huge') pot = 1.25;
      return Math.max(0.5, Math.min(1.5, pot));
    }

    function potCategoryFromInches(inches){
      if(!inches) return 'medium';
      if(inches <= 4) return 'small';
      if(inches >= 10) return 'large';
      return 'medium';
    }

    function nextDueFrom(plant){
      const base = Math.max(1, Number(plant.intervalDays || plant.carePlan?.intervalDays || plant.baseIntervalDays || 7));
      const mult = intervalMultiplier(plant.potSize || potCategoryFromInches(plant.potSizeIn));
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

  let currentStep = 1;
  const stepData = {};
  let taxoSuggestions = [];
  let activeTaxo = -1;
  let photoObjectURL = null;

  function clearPhotoPreview(){
    const preview = document.getElementById('photoPreview');
    if(preview) preview.innerHTML = '';
    const input = document.getElementById('plantPhoto');
    if(input) input.value = '';
    if(photoObjectURL){
      URL.revokeObjectURL(photoObjectURL);
      photoObjectURL = null;
    }
  }

  function showStep(n){
    if(currentStep === 1 && n !== 1) clearPhotoPreview();
    currentStep = n;
    const steps = $$('#editorSteps .step');
    steps.forEach((s,i) => s.classList.toggle('hidden', i+1 !== n));
    const prog = document.getElementById('stepIndicator');
    if(prog){
      const pct = (n / steps.length) * 100;
      prog.setAttribute('aria-valuemax', String(steps.length));
      prog.setAttribute('aria-valuenow', String(n));
      prog.setAttribute('aria-valuetext', `Step ${n} of ${steps.length}`);
      prog.setAttribute('aria-label', `Step ${n} of ${steps.length}`);
      const bar = prog.querySelector('.bar');
      if(bar) bar.style.width = pct + '%';
    }
    if(n === 4) generateCarePlan();
    if(n === 5) updateConfirm();
  }
  async function generateCarePlan(){
    const name = $('#plantName').value.trim();
    if(!name){ alert('Enter a plant name first'); return; }
    if(!window.OPENAI_PLAN_URL){ alert('AI plan URL not configured.'); return; }
    const potIn = stepData.potSizeIn || 6;
    const details = document.getElementById('carePlanDetails');
    if(details) details.innerHTML = '<div class="flex justify-center p-4"><div class="w-6 h-6 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div></div>';
    try{
      const r = await fetch(window.OPENAI_PLAN_URL, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, potIn }) });
      if(!r.ok) throw new Error('plan');
      const plan = await r.json();
      stepData.family = plan.family || stepData.family;
      stepData.genus = plan.genus || stepData.genus;
      stepData.species = plan.species || stepData.species;
      stepData.carePlan = { intervalDays: plan.baseIntervalDays || plan.intervalDays || 7, waterMl: plan.waterMl || 250, fertilizer: plan.fertilizer || '', repot: plan.repot || '' };
      const oz = (stepData.carePlan.waterMl*0.033814).toFixed(1);
      if(details) details.innerHTML = `Water ${stepData.carePlan.waterMl} ml (${oz} oz) every ${stepData.carePlan.intervalDays} days<br>Fertilizer: ${escapeHtml(stepData.carePlan.fertilizer || '—')}<br>Repot: ${escapeHtml(stepData.carePlan.repot || '—')}`;
    }catch{
      if(details) details.textContent = 'Failed to generate care plan';
    }
  }
  function updateConfirm(){
    const sum = $('#confirmSummary');
    if(!sum) return;
    const name = $('#plantName').value.trim();
    const plan = stepData.carePlan;
    const water = plan ? `${plan.waterMl} ml (${(plan.waterMl*0.033814).toFixed(1)} oz)` : '—';
    const every = plan ? plan.intervalDays : '—';
    const pot = stepData.potSizeIn ? `${parseFloat(stepData.potSizeIn).toFixed(1).replace(/\.0$/,'')} in` : '—';
    const location = stepData.location || '—';
    const soil = stepData.soilType || '—';
    const drain = stepData.hasDrain ? 'drainage' : 'no drain';
    const photo = photoObjectURL ? `<img src="${photoObjectURL}" alt="${escapeHtml(name)}" class="object-cover w-full h-full"/>` : '';
    sum.innerHTML = `
      <article class="rounded-xl border p-3 bg-[color:var(--panel)] border-[color:var(--border)] flex flex-col gap-2">
        <div class="w-full aspect-video rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] overflow-hidden cursor-pointer" data-step="1">${photo}</div>
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="name font-semibold">${escapeHtml(name)}</div>
            <div class="species text-sm text-[color:var(--muted)]">${escapeHtml(taxonLine(stepData))}</div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <span class="pill cursor-pointer" data-step="4">Water ${water} every ${every} days</span>
          <span class="pill cursor-pointer" data-step="3">Pot ${pot}</span>
          <span class="pill cursor-pointer" data-step="2">${escapeHtml(location)}</span>
          <span class="pill cursor-pointer" data-step="3">Soil ${escapeHtml(soil)}</span>
          <span class="pill cursor-pointer" data-step="3">${drain}</span>
        </div>
      </article>`;
    sum.querySelectorAll('[data-step]').forEach(el => el.addEventListener('click', e => {
      const step = Number(el.getAttribute('data-step'));
      if(step) showStep(step);
    }));
  }

  // Views
  const views = {
    showDashboard(){
      clearPhotoPreview();
      $('#editorView').classList.remove('active');
      $('#dashboardView').classList.add('active');
      $('#plantsPage').classList.remove('active');
      renderList();
      renderScience();
      applyHomeView();
    },
    showEditor(plant){
      $('#dashboardView').classList.remove('active');
      $('#editorView').classList.add('active');
      clearPhotoPreview();
      stepData.id = plant?.id || '';
      stepData.carePlan = plant?.carePlan || null;
      stepData.potSizeIn = plant?.potSizeIn || 6;
      stepData.material = plant?.material || 'plastic';
      stepData.soilType = plant?.soilType || 'generic';
      stepData.hasDrain = plant?.hasDrain !== false;
      $('#plantName').value = plant?.name || '';
      $('#isOutdoor').checked = plant?.inout === 'outdoor';
      $('#potSize').value = String(stepData.potSizeIn);
      $$('#materialChips .chip').forEach(b => {
        const sel = b.dataset.material === stepData.material;
        b.classList.toggle('selected', sel);
        b.setAttribute('aria-checked', sel ? 'true' : 'false');
      });
      $$('#soilChips .chip').forEach(b => {
        const sel = b.dataset.soil === stepData.soilType;
        b.classList.toggle('selected', sel);
        b.setAttribute('aria-checked', sel ? 'true' : 'false');
      });
      $('#hasDrain').checked = stepData.hasDrain;
      if(stepData.carePlan){
        const oz = (stepData.carePlan.waterMl*0.033814).toFixed(1);
        $('#carePlanDetails').innerHTML = `Water ${stepData.carePlan.waterMl} ml (${oz} oz) every ${stepData.carePlan.intervalDays} days<br>Pot: ${stepData.potSizeIn} in`;
      }else{
        const cd = $('#carePlanDetails'); if(cd) cd.textContent = 'No plan';
      }
      showStep(1);
    },
    showPlantsPage(){
      $('#dashboardView').classList.remove('active');
      $('#editorView').classList.remove('active');
      $('#plantsPage').classList.add('active');
      renderAllPlants();
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
    const s = getSettings();
    const mode = s.plantsView || 'cards';
    for(const plant of plants){
      const li = document.createElement('li');
      li.innerHTML = mode === 'rows' ? rowHTML(plant) : cardHTML(plant);
      bindCard(li, plant);
      list.appendChild(li);
      enrichCardWithMedia(li, plant);
    }
    if(window.lucideRender) window.lucideRender();
  }

  function rowHTML(p){
    const dueTxt = humanDue(p.nextDue);
    const badge = dueClass(p.nextDue);
    const s = getSettings();
      const modeled = Math.round((p.intervalDays || p.carePlan?.intervalDays || p.baseIntervalDays || 7)
        * intervalMultiplier(p.potSize || potCategoryFromInches(p.potSizeIn))
        * seasonalMultiplier(s, p.weatherOverride)
        * microEnvironmentMultiplier(p)
        * (1 + (Number(p.tuneIntervalPct||0)/100))
      );
    const factor = seasonalMultiplier(s, p.weatherOverride) * microEnvironmentMultiplier(p) * (1 + (Number(p.tuneIntervalPct||0)/100));
    const wx = wxPill(p);
    const volPill = waterPill(p);
    return `
      <article class="rounded-xl border p-2 bg-[color:var(--panel)] border-[color:var(--border)] flex items-center gap-3">
        <div class="cover w-16 h-10 rounded border border-[color:var(--border)] bg-[color:var(--panel-2)]"></div>
        <div class="flex-1">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="font-semibold">${escapeHtml(p.name || 'Untitled')}</div>
              <div class="text-sm text-[color:var(--muted)]">${escapeHtml(taxonLine(p))}</div>
            </div>
            <div class="pill ${badge}">${escapeHtml(dueTxt)}</div>
          </div>
          <div class="flex flex-wrap gap-2 items-center mt-1">
            <span class="pill" title="Modeled interval">model ${modeled}d ×${factor.toFixed(2)}</span>
            ${envChip(p)}
            ${wx}
            ${volPill}
          </div>
        </div>
        <div class="flex gap-1">
          <button class="btn small" data-action="water" title="Watered">Water</button>
          <input type="file" accept="image/*" capture="environment" data-snap hidden />
          <button class="btn small icon" data-action="snap" title="Snap photo"><i data-lucide="camera"></i></button>
          <button class="btn small" data-action="open" title="Open">Open</button>
        </div>
      </article>
    `;
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
    const sOnly = getSettings().onlyOverdue || false;
    let addedOverdueHeader = false, addedTodayHeader = false;
    for(const it of items){
      if(sOnly){
        if(it.delta < 0){
          if(!addedOverdueHeader){
            const h = document.createElement('li'); h.className='group-header'; h.textContent='Overdue'; dueHost.appendChild(h); addedOverdueHeader=true;
          }
          const li = document.createElement('li'); li.innerHTML = taskCardHTML(it); bindTaskCard(li, it); dueHost.appendChild(li);
        }
        continue;
      }
      if(it.delta < 0){
        if(!addedOverdueHeader){ const h = document.createElement('li'); h.className='group-header'; h.textContent='Overdue'; dueHost.appendChild(h); addedOverdueHeader=true; }
        const li = document.createElement('li'); li.innerHTML = taskCardHTML(it); bindTaskCard(li, it); dueHost.appendChild(li);
      } else if(it.delta === 0){
        if(!addedTodayHeader){ const h = document.createElement('li'); h.className='group-header'; h.textContent='Today'; dueHost.appendChild(h); addedTodayHeader=true; }
        const li = document.createElement('li'); li.innerHTML = taskCardHTML(it); bindTaskCard(li, it); dueHost.appendChild(li);
      } else if(it.delta <= windowDays){
        const dayKey = it.due;
        let header = upHost.querySelector(`[data-day='${dayKey}']`);
        if(!header){
          const hli = document.createElement('li');
          hli.className = 'group-header';
          hli.dataset.day = dayKey;
          const date = new Date(dayKey+'T00:00:00');
          const dDelta = daysBetween(today, date);
          const label = dDelta===1 ? 'Tomorrow' : `In ${dDelta} days`;
          const suffix = date.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
          hli.textContent = `${label} (${suffix})`;
          upHost.appendChild(hli);
        }
        const li = document.createElement('li'); li.innerHTML = taskCardHTML(it); bindTaskCard(li, it); upHost.appendChild(li);
      }
    }
    if(window.lucideRender) window.lucideRender();
  }

  function taskCardHTML(it){
    const badge = dueClass(it.due);
    const rel = humanDue(it.due);
    const p = it.plant;
    const vol = waterPill(p);
    const iconEl = taskIcon(it.type);
    return `
      <article class="rounded-xl border p-3 bg-[color:var(--panel)] border-[color:var(--border)] flex flex-col gap-2">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold"><span title="${escapeHtml(capitalize(it.type))}">${iconEl}</span> ${escapeHtml(it.title)}</div>
            <div class="species text-sm text-[color:var(--muted)]">${escapeHtml(taxonLine(p))}</div>
          </div>
          <div class="pill ${badge}">${escapeHtml(rel)}</div>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          ${it.type==='water' ? vol : `<span class="pill" title="Task cadence">every ${it.task.everyDays}d</span>`}
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
    const onlyOverdue = document.getElementById('onlyOverdue');
    if(onlyOverdue) onlyOverdue.checked = !!s.onlyOverdue;
  }
  const resetFilters = document.getElementById('resetFilters');
  if(resetFilters) resetFilters.addEventListener('click', async () => { const s=getSettings(); s.taskType='all'; s.taskWindow=7; s.onlyOverdue=false; setSettings(s); applyHomeView(); await renderList(); showToast('Filters reset'); });
  const viewTasksBtn = document.getElementById('viewToggleTasks');
  const viewPlantsBtn = document.getElementById('viewTogglePlants');
  if(viewTasksBtn) viewTasksBtn.addEventListener('click', () => { const s=getSettings(); s.homeView='tasks'; setSettings(s); applyHomeView(); showToast('Showing tasks'); });
  if(viewPlantsBtn) viewPlantsBtn.addEventListener('click', () => { const s=getSettings(); s.homeView='plants'; setSettings(s); applyHomeView(); showToast('Showing plants'); });
  const typeSel = document.getElementById('taskTypeFilter');
  const winSel = document.getElementById('taskWindowFilter');
  const onlyOverdue = document.getElementById('onlyOverdue');
  if(typeSel) typeSel.addEventListener('change', async () => { const s=getSettings(); s.taskType=typeSel.value; setSettings(s); await renderList(); showToast('Filters saved'); });
  if(winSel) winSel.addEventListener('change', async () => { const s=getSettings(); s.taskWindow=Number(winSel.value); setSettings(s); await renderList(); showToast('Filters saved'); });
  if(onlyOverdue) onlyOverdue.addEventListener('change', async () => { const s=getSettings(); s.onlyOverdue=!!onlyOverdue.checked; setSettings(s); await renderList(); showToast('Filters saved'); });
  const legendToggle = document.getElementById('legendToggle');
  if(legendToggle){
    legendToggle.addEventListener('click', () => {
      const el = document.getElementById('legend');
      if(!el) return; el.style.display = (el.style.display==='none' || !el.style.display) ? 'block' : 'none';
    });
  }

  // Force Update button: clears caches, asks SW to update and reloads
  const updateBtn = document.getElementById('updateBtn');
  if(updateBtn){
    updateBtn.addEventListener('click', async () => {
      showToast('Updating…');
      try{
        // Clear caches
        if('caches' in window){
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        // Update SW
        if('serviceWorker' in navigator){
          const reg = await navigator.serviceWorker.getRegistration();
          if(reg){
            reg.update();
            if(reg.waiting){ reg.waiting.postMessage('SKIP_WAITING'); }
          }
        }
      }catch{}
      setTimeout(() => location.reload(), 300);
    });
  }

  // Manual icon refresh
  const refreshIconsBtn = document.getElementById('refreshIconsBtn');
  if(refreshIconsBtn){
    refreshIconsBtn.addEventListener('click', () => {
      if(window.lucideRender) { window.lucideRender(); showToast('Icons refreshed'); }
      else showToast('Icon renderer not ready');
    });
  }

  // Theme toggle (overrides prefers-color-scheme)
  const themeToggle = document.getElementById('themeToggle');
  if(themeToggle){
    themeToggle.addEventListener('click', () => {
      const s = getSettings();
      const cur = s.theme || 'auto';
      const next = cur === 'dark' ? 'light' : (cur === 'light' ? 'auto' : 'dark');
      s.theme = next; setSettings(s); applyTheme(); showToast('Theme: ' + next);
    });
    applyTheme();
  }
  function applyTheme(){
    const s = getSettings();
    const t = s.theme || 'auto';
    const el = document.documentElement;
    if(t === 'dark'){ el.setAttribute('data-theme','dark'); }
    else if(t === 'light'){ el.setAttribute('data-theme','light'); }
    else { el.removeAttribute('data-theme'); }
    if(window.lucideRender) window.lucideRender();
  }

  // Plants view (cards/rows)
  const pvCards = document.getElementById('plantsViewCards');
  const pvRows = document.getElementById('plantsViewRows');
  if(pvCards) pvCards.addEventListener('click', async () => { const s=getSettings(); s.plantsView='cards'; setSettings(s); await renderList(); showToast('Plants: cards'); });
  if(pvRows) pvRows.addEventListener('click', async () => { const s=getSettings(); s.plantsView='rows'; setSettings(s); await renderList(); showToast('Plants: rows'); });

  // Settings modal
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingsClose = document.getElementById('settingsClose');
  function openSettings(){
    // Pre-fill
    const s = getSettings();
    [...document.querySelectorAll('input[name="themeOpt"]')].forEach(r => r.checked = (s.theme||'auto') === r.value);
    [...document.querySelectorAll('input[name="plantsViewOpt"]')].forEach(r => r.checked = (s.plantsView||'cards') === r.value);
    document.getElementById('devHeaderToggle').checked = !!s.devHeader;
    document.getElementById('profileName').value = s.profileName || '';
    document.getElementById('profileEmoji').value = s.profileEmoji || '';
    settingsModal.classList.add('show');
  }
  function closeSettings(){ settingsModal.classList.remove('show'); }
  if(settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if(settingsClose) settingsClose.addEventListener('click', closeSettings);
  // Apply changes
  document.querySelectorAll('input[name="themeOpt"]').forEach(r => r.addEventListener('change', () => { const s=getSettings(); s.theme=r.value; setSettings(s); applyTheme(); }));
  document.querySelectorAll('input[name="plantsViewOpt"]').forEach(r => r.addEventListener('change', async () => { const s=getSettings(); s.plantsView=r.value; setSettings(s); await renderList(); }));
  const devHeaderToggle = document.getElementById('devHeaderToggle');
  if(devHeaderToggle) devHeaderToggle.addEventListener('change', () => { const s=getSettings(); s.devHeader=!!devHeaderToggle.checked; setSettings(s); applyDevHeader(); });
  // Settings shortcuts to actions
  const settingsSeed = document.getElementById('settingsSeed'); if(settingsSeed) settingsSeed.addEventListener('click', () => document.getElementById('seedBtn')?.click());
  const settingsUpdate = document.getElementById('settingsUpdate'); if(settingsUpdate) settingsUpdate.addEventListener('click', () => document.getElementById('updateBtn')?.click());
  const settingsIcons = document.getElementById('settingsIcons'); if(settingsIcons) settingsIcons.addEventListener('click', () => document.getElementById('refreshIconsBtn')?.click());
  const settingsReminders = document.getElementById('settingsReminders');
  if(settingsReminders) settingsReminders.addEventListener('click', async () => {
    const plants = await PlantDB.all();
    const ics = buildICS(plants);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plant-reminders.ics'; document.body.appendChild(a); a.click(); a.remove();
  });
  const profileName = document.getElementById('profileName'); if(profileName) profileName.addEventListener('input', () => { const s=getSettings(); s.profileName=profileName.value; setSettings(s); });
  const profileEmoji = document.getElementById('profileEmoji'); if(profileEmoji) profileEmoji.addEventListener('input', () => { const s=getSettings(); s.profileEmoji=profileEmoji.value; setSettings(s); });
  const settingsExport = document.getElementById('settingsExport');
  if(settingsExport) settingsExport.addEventListener('click', () => {
    const s = getSettings();
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plant-settings.json'; document.body.appendChild(a); a.click(); a.remove();
  });
  const settingsImportInput = document.getElementById('settingsImportInput');
  if(settingsImportInput) settingsImportInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if(!file) return;
    try{
      const text = await file.text();
      const json = JSON.parse(text);
      const s = Object.assign(getSettings(), json);
      setSettings(s);
      applyTheme(); applyDevHeader(); await renderList();
      showToast('Settings imported');
    }catch{ showToast('Invalid settings file'); }
    e.target.value = '';
  });

  function applyDevHeader(){
    const s = getSettings();
    document.querySelectorAll('.dev-only').forEach(el => el.style.display = s.devHeader ? '' : 'none');
  }
  applyDevHeader();

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
    const modeled = Math.round((p.intervalDays || p.carePlan?.intervalDays || p.baseIntervalDays || 7)
      * intervalMultiplier(p.potSize || potCategoryFromInches(p.potSizeIn))
      * seasonalMultiplier(s, p.weatherOverride)
      * microEnvironmentMultiplier(p)
      * (1 + (Number(p.tuneIntervalPct||0)/100))
    );
    const factor = seasonalMultiplier(s, p.weatherOverride) * microEnvironmentMultiplier(p) * (1 + (Number(p.tuneIntervalPct||0)/100));
    const env = envSummary(p);
    const wx = wxPill(p);
    const volPill = waterPill(p);
    return `
      <article class="rounded-xl border p-3 bg-[color:var(--panel)] border-[color:var(--border)] flex flex-col gap-2">
        <div class="w-full aspect-video rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] cover"></div>
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="name font-semibold">${escapeHtml(p.name || 'Untitled')}</div>
            <div class="species text-sm text-[color:var(--muted)]">${escapeHtml(taxonLine(p))}</div>
          </div>
          <div class="pill ${badge}">${escapeHtml(dueTxt)}</div>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <span class="pill" title="Modeled interval">model ${modeled}d ×${factor.toFixed(2)}</span>
          ${envChip(p)}
          ${wx}
          ${volPill}
        </div>
        <div class="thumbs flex gap-1"></div>
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
  $('#cancelEdit').addEventListener('click', () => { clearPhotoPreview(); views.showDashboard(); });
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

    // Editor navigation
    $$('#editorView [data-next]').forEach(btn => btn.addEventListener('click', () => showStep(Math.min(5, currentStep+1))));
    $$('#editorView [data-prev]').forEach(btn => btn.addEventListener('click', () => showStep(Math.max(1, currentStep-1))));

    // Taxonomy autosuggest
    const nameInput = document.getElementById('plantName');
    let taxoTimer;
    nameInput.addEventListener('input', e => {
      clearTimeout(taxoTimer);
      const q = e.target.value.trim();
      if(!q){ renderTaxoSuggestions([]); return; }
      taxoTimer = setTimeout(async () => {
        try{
          const suggestions = await getTaxoSuggestions(q);
          renderTaxoSuggestions(suggestions);
        }catch{
          renderTaxoSuggestions([]);
        }
      }, 300);
    });
    nameInput.addEventListener('keydown', e => {
      const host = document.getElementById('taxoResults');
      const items = host ? host.querySelectorAll('.sugg') : [];
      if(!items.length) return;
      if(e.key === 'ArrowDown'){
        e.preventDefault();
        activeTaxo = (activeTaxo + 1) % items.length;
        updateTaxoActive();
      }else if(e.key === 'ArrowUp'){
        e.preventDefault();
        activeTaxo = (activeTaxo - 1 + items.length) % items.length;
        updateTaxoActive();
      }else if(e.key === 'Enter' && activeTaxo >= 0){
        e.preventDefault();
        items[activeTaxo].click();
      }
    });

    // Photo preview
    const photoInput = document.getElementById('plantPhoto');
    photoInput.addEventListener('change', e => {
      if(photoObjectURL){
        URL.revokeObjectURL(photoObjectURL);
        photoObjectURL = null;
      }
      const file = e.target.files[0];
      const prev = document.getElementById('photoPreview');
      if(!file){
        if(prev) prev.innerHTML = '';
        return;
      }
      photoObjectURL = URL.createObjectURL(file);
      if(prev){
        prev.innerHTML = `<img src="${photoObjectURL}" alt="Plant photo" class="mb-2 max-w-full rounded border"/><button type="button" class="btn" id="removePhoto">Remove</button>`;
        const btn = document.getElementById('removePhoto');
        if(btn) btn.addEventListener('click', clearPhotoPreview);
      }
    });

    // Location selection
    function selectLocation(btn){
      stepData.location = btn.dataset.loc;
      $$('#locationChips .chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      fetchWeather();
    }
    function setupChip(btn){
      btn.addEventListener('click', () => selectLocation(btn));
      btn.addEventListener('dblclick', () => {
        const newName = prompt('Edit location', btn.dataset.loc);
        if(newName){
          btn.dataset.loc = newName;
          btn.textContent = newName;
          if(btn.classList.contains('selected')){
            stepData.location = newName;
            fetchWeather();
          }
        }
      });
    }
    $$('#locationChips [data-loc]').forEach(setupChip);
    const locInput = document.getElementById('newLocationInput');
    if(locInput){
      locInput.addEventListener('keydown', e => {
        if(e.key === 'Enter'){
          const val = locInput.value.trim();
          if(val){
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.dataset.loc = val;
            chip.textContent = val;
            setupChip(chip);
            const container = document.getElementById('locationChips');
            container.insertBefore(chip, locInput);
            locInput.value = '';
            chip.click();
          }
        }
      });
    }
    document.getElementById('isOutdoor').addEventListener('change', e => {
      stepData.inout = e.target.checked ? 'outdoor' : 'indoor';
      fetchWeather();
    });

    async function fetchWeather(){
      const tag = document.getElementById('weatherTag');
      if(tag) tag.textContent = 'Fetching weather…';
      try{
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
        const lat = pos.coords.latitude; const lon = pos.coords.longitude;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`;
        const r = await fetch(url); const j = await r.json();
        let t = j?.current?.temperature_2m; let h = j?.current?.relative_humidity_2m;
        if(!Number.isFinite(t) || !Number.isFinite(h)) throw new Error('weather');
        if(!stepData.inout || stepData.inout === 'indoor'){ t -= 2; h = Math.min(100, h + 10); }
        stepData.weatherOverride = { tempC: t, rh: h, fetchedAt: new Date().toISOString() };
        if(tag) tag.textContent = `Weather: ${Math.round(t)}°C / ${Math.round(h)}%`;
      }catch{
        if(tag) tag.textContent = 'Weather unavailable';
      }
    }
    document.getElementById('clearWeather').addEventListener('click', () => {
      stepData.weatherOverride = null;
      const tag = document.getElementById('weatherTag'); if(tag) tag.textContent = '';
    });

    // Pot, material, and soil inputs
    document.getElementById('potSize').addEventListener('change', e => { stepData.potSizeIn = parseFloat(e.target.value); });
    $$('#materialChips .chip').forEach(btn => {
      btn.addEventListener('click', () => {
        stepData.material = btn.dataset.material;
        $$('#materialChips .chip').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked','false'); });
        btn.classList.add('selected');
        btn.setAttribute('aria-checked','true');
      });
    });
    $$('#soilChips .chip').forEach(btn => {
      btn.addEventListener('click', () => {
        stepData.soilType = btn.dataset.soil;
        $$('#soilChips .chip').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked','false'); });
        btn.classList.add('selected');
        btn.setAttribute('aria-checked','true');
      });
    });
    document.getElementById('hasDrain').addEventListener('change', e => { stepData.hasDrain = e.target.checked; });

    // Final add action
    document.getElementById('addSpecimen').addEventListener('click', async () => {
      const id = stepData.id || cryptoRandomId();
      const name = $('#plantName').value.trim();
      const plant = {
        id,
        name,
        family: stepData.family || '',
        genus: stepData.genus || '',
        species: stepData.species || '',
        potSizeIn: stepData.potSizeIn,
        potSize: potCategoryFromInches(stepData.potSizeIn),
        material: stepData.material,
        soilType: stepData.soilType,
        hasDrain: stepData.hasDrain,
        inout: stepData.inout || ($('#isOutdoor').checked ? 'outdoor' : 'indoor'),
        location: stepData.location || '',
        carePlan: stepData.carePlan || null,
        lastWatered: todayISO(),
      };
      if(stepData.weatherOverride) plant.weatherOverride = stepData.weatherOverride;
      plant.intervalDays = stepData.carePlan?.intervalDays || plant.baseIntervalDays || 7;
      plant.nextDue = nextDueFrom(plant);
      await PlantDB.put(plant);
      views.showDashboard();
    });

  async function getTaxoSuggestions(name){
    const out = [];
    try{
      if(window.OPENAI_PROXY_URL){
        const ai = await suggestWithOpenAI(name);
        if(Array.isArray(ai)) ai.forEach(x => out.push(x));
        else if(ai) out.push(ai);
      }
    }catch{}
    try{
      const gbif = await suggestListGBIF(name);
      gbif.forEach(x => out.push(x));
    }catch{}
    const seen = new Set();
    const dedup = [];
    for(const s of out){
      const key = (s.genus||'')+' '+(s.species||'') + '|' + (s.family||'');
      if(seen.has(key.trim())) continue; seen.add(key.trim()); dedup.push(s);
    }
    return dedup.slice(0,8);
  }

  function renderTaxoSuggestions(list=[]){
    const host = document.getElementById('taxoResults');
    if(!host) return;
    host.innerHTML = '';
    host.classList.remove('show');
    taxoSuggestions = list || [];
    activeTaxo = -1;
    if(!taxoSuggestions.length) return;
    taxoSuggestions.forEach((s,i) => {
      const chip = document.createElement('div');
      chip.className = 'sugg';
      const label = [s.family?`[${s.family}]`:null, [s.genus,s.species].filter(Boolean).join(' ')||s.name].filter(Boolean).join(' ');
      chip.textContent = label;
      chip.addEventListener('click', () => applyTaxo(i));
      host.appendChild(chip);
    });
    host.classList.add('show');
  }

  function applyTaxo(i){
    const s = taxoSuggestions[i];
    if(!s) return;
    stepData.family = s.family || '';
    stepData.genus = s.genus || '';
    stepData.species = s.species || '';
    $('#plantName').value = [s.genus, s.species].filter(Boolean).join(' ') || s.name || '';
    renderTaxoSuggestions([]);
  }

  function updateTaxoActive(){
    const host = document.getElementById('taxoResults');
    const items = host ? host.querySelectorAll('.sugg') : [];
    items.forEach((el,i) => el.classList.toggle('active', i === activeTaxo));
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
  const icsBtn = document.getElementById('icsBtn');
  if(icsBtn) icsBtn.addEventListener('click', async () => {
    const plants = await PlantDB.all();
    const ics = buildICS(plants);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plant-reminders.ics';
    document.body.appendChild(a); a.click(); a.remove();
  });

  // Share link sync
  const shareBtn = document.getElementById('shareBtn');
  if(shareBtn) shareBtn.addEventListener('click', async () => {
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
  // Full-page detail view rendered via React component
  async function showPlantDetail(id){
    const plant = await PlantDB.get(id);
    if(!plant){ location.hash = ''; return; }
    $('#dashboardView').classList.remove('active');
    $('#editorView').classList.remove('active');
    const view = $('#plantDetailView');
    view.classList.add('active');
    view.innerHTML = `
      <div class="toolbar" style="justify-content:space-between; align-items:center">
        <button id="detailBack" class="btn">Back</button>
        <button id="detailEdit" class="btn">Edit</button>
      </div>
      <div id="detailRoot"></div>
    `;
    $('#detailBack').onclick = () => { location.hash = ''; };
    $('#detailEdit').onclick = () => { views.showEditor(plant); location.hash = '#editor'; };

    async function ensureReact(){
      while(!(window.React && window.ReactDOM && window.PlantDetail)){
        await new Promise(r => setTimeout(r,50));
      }
      return { React: window.React, ReactDOM: window.ReactDOM, PlantDetail: window.PlantDetail };
    }
    const { React, ReactDOM, PlantDetail } = await ensureReact();
    const mount = document.getElementById('detailRoot');
    const root = ReactDOM.createRoot(mount);

    let coverURL = null;
    if(plant.coverFileId){
      const blob = await PlantDB.getFile(plant.coverFileId);
      if(blob) coverURL = URL.createObjectURL(blob);
    }

    function hydrationPct(p){
      const last = parseDate(p.lastWatered || todayISO());
      const next = parseDate(nextDueFrom(p));
      const total = daysBetween(last, next);
      if(total <= 0) return 0;
      const used = daysBetween(last, new Date());
      return Math.max(0, Math.min(100, Math.round((total - used)/total*100)));
    }

    function render(){
      const hydration = { level: hydrationPct(plant), lastWatered: plant.lastWatered };
      const plantMeta = {
        name: plant.name || 'Plant',
        species: taxonLine(plant),
        location: plant.location,
        imageUrl: coverURL || undefined,
        history: plant.history || [],
        observations: plant.observations || [],
      };
      const metrics = {
        temperature: plant.weatherOverride?.tempC,
        humidity: plant.weatherOverride?.rh,
      };
      root.render(React.createElement(PlantDetail, {
        plant: plantMeta,
        hydration,
        metrics,
        onWater: async () => {
          plant.lastWatered = todayISO();
          plant.history = plant.history || [];
          plant.history.push({ type: 'water', at: todayISO() });
          await PlantDB.put(plant);
          render();
        },
        onPhoto: async (file) => {
          const resized = await resizeImage(file,1600);
          const obs={id:cryptoRandomId(),at:new Date().toISOString(),type:'photo',fileId:await PlantDB.putFile(resized)};
          plant.observations=plant.observations||[];
          plant.observations.push(obs);
          plant.history=plant.history||[];
          plant.history.push({type:'observe', at: obs.at});
          await PlantDB.put(plant);
          render();
        }
      }));
    }
    render();
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
      const baseInt = plant.intervalDays || plant.carePlan?.intervalDays || plant.baseIntervalDays || 7;
      const maxY = Math.max(...intervals, baseInt) * 1.2;
    // Axes
    ctx.strokeStyle = '#244437'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, pad+H); ctx.lineTo(pad+W, pad+H); ctx.stroke();
    // Baseline (base interval and current modeled interval)
      const base = baseInt;
      const modeled = Math.round(baseInt * intervalMultiplier(plant.potSize || potCategoryFromInches(plant.potSizeIn)));
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
    const soil = p.soilType === 'cactus' ? 'cactus' : 'sprout';
    const where = p.inout === 'outdoor' ? 'sun' : 'home';
    const exp = p.exposure || '';
    const title = `Soil: ${p.soilType||'generic'}; ${p.inout||'indoor'}${exp?(' • '+exp):''}`;
    return `<span class="pill" title="${escapeHtml(title)}">${icon(soil)} ${icon(where)}${exp?(' '+escapeHtml(exp)):''}</span>`;
  }

  function icon(name){
    return `<i data-lucide="${name}"></i>`;
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
    const din = p.potSizeIn || (p.potDiameterIn != null ? p.potDiameterIn : (p.potDiameterCm ? (p.potDiameterCm/2.54) : 0));
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
      lines.push(`Base interval: ${p.intervalDays || p.carePlan?.intervalDays || p.baseIntervalDays || 7}d`);
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
    const mk = (id, name, tax, light, potIn, soil, inout, exposure, interval) => ({
      id, name,
      family: tax.family, genus: tax.genus, species: tax.species, cultivar: tax.cultivar||'',
      lightLevel: light, potSize: potCategoryFromInches(potIn), potSizeIn: potIn,
      soilType: soil, inout, exposure, roomLabel: '',
      intervalDays: interval, tuneIntervalPct: 0, tuneVolumePct: 0,
      lastWatered: today, notes: '', tasks: [ {type:'fertilize', everyDays:30}, {type:'inspect', everyDays:14} ],
      observations: [], history: [{type:'water', at: today}],
    });
    return [
      mk(cryptoRandomId(), 'Monstera', {family:'Araceae',genus:'Monstera',species:'deliciosa'}, 'medium', 10, 'aroid', 'indoor', 'E', 7),
      mk(cryptoRandomId(), 'ZZ Plant', {family:'Araceae',genus:'Zamioculcas',species:'zamiifolia'}, 'low', 8, 'generic', 'indoor', 'N', 12),
      mk(cryptoRandomId(), 'Snake Plant', {family:'Asparagaceae',genus:'Dracaena',species:'trifasciata'}, 'low', 6, 'cactus', 'indoor', 'W', 14),
      mk(cryptoRandomId(), 'Fiddle-Leaf Fig', {family:'Moraceae',genus:'Ficus',species:'lyrata'}, 'high', 12, 'aroid', 'indoor', 'S', 6),
      mk(cryptoRandomId(), 'Aloe', {family:'Asphodelaceae',genus:'Aloe',species:'vera'}, 'high', 6, 'cactus', 'outdoor', 'S', 10),
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
    } else if(h === '#plants'){
      views.showPlantsPage();
      return;
    }
    // default dashboard
    $('#plantDetailView').classList.remove('active');
    views.showDashboard();
  }
  window.addEventListener('hashchange', handleHash);
  handleHash();
})();
