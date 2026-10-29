/* AlertaVecinal · mejoras: tema, accesibilidad, sonido, menú, recuperar contraseña,
   alertas por cercanía, monitoreo en vivo, silenciar y ruta al incidente.
   Usa los ganchos que app.js expone en window.AV. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const LS = localStorage, root = document.documentElement, A = () => window.AV;
  const get = (k, d) => { try { const v = LS.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const put = (k, v) => LS.setItem(k, JSON.stringify(v));
  const prefs = { theme: get('av_theme', 'auto'), fs: 1.1, sound: get('av_snd', true), motion: get('av_motion', true) };
  const mq = matchMedia('(prefers-color-scheme: dark)');

  /* ---------- Tema, tamaño de letra y movimiento ---------- */
  function applyPrefs(rerender) {
    root.dataset.theme = prefs.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : prefs.theme;
    root.dataset.motion = prefs.motion ? 'on' : 'off';
    root.style.setProperty('--fs', prefs.fs);
    $('meta[name=theme-color]')?.setAttribute('content', root.dataset.theme === 'dark' ? '#0a1230' : '#2458f0');
    const t = { auto: ['🌓', 'Tema automático'], light: ['☀️', 'Tema claro'], dark: ['🌙', 'Tema oscuro'] }[prefs.theme];
    $$('[data-d=theme]').forEach(b => { b.textContent = t[0]; b.title = b.ariaLabel = t[1] + ' (pulsa para cambiar)'; });
    $$('[data-d=sound]').forEach(b => { b.textContent = prefs.sound ? '🔊' : '🔇'; b.title = b.ariaLabel = prefs.sound ? 'Sonido activado (pulsa para silenciar)' : 'Sonido desactivado'; });
    if (rerender && A()?.state.map) A().renderPage(); // el mapa cambia de estilo con el tema
  }
  mq.addEventListener?.('change', () => prefs.theme === 'auto' && applyPrefs(true));
  const mkBtn = (d, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.dataset.d = d; return b; };
  const tb = $('.topbar-actions'), av = $('#topAvatar');
  tb.insertBefore(mkBtn('sound', 'icon-button av-tb'), av); tb.insertBefore(mkBtn('theme', 'icon-button av-tb'), av);
  $('.auth-panel')?.append(mkBtn('theme', 'av-tb av-auth-theme'));
  document.addEventListener('click', e => {
    const k = e.target.closest('[data-d]')?.dataset.d; if (!k) return;
    if (k === 'theme') { prefs.theme = { auto: 'light', light: 'dark', dark: 'auto' }[prefs.theme]; put('av_theme', prefs.theme); applyPrefs(true); }
    if (k === 'sound') { prefs.sound = !prefs.sound; put('av_snd', prefs.sound); applyPrefs(); if (prefs.sound) tone(784, .12, .06); }
  });

  /* ---------- Sonido (sintetizado, sin archivos) ---------- */
  let ac, lastTick = 0, hoverEl = null;
  function tone(f, d = .07, v = .035, type = 'sine') {
    if (!prefs.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
    } catch { /* el navegador puede bloquear audio hasta el primer clic */ }
  }
  const siren = () => [0, 220, 440].forEach(ms => setTimeout(() => { tone(880, .16, .07, 'square'); setTimeout(() => tone(660, .16, .07, 'square'), 170); }, ms));
  const HOVER = 'button,a,.nav-link,.quick-action,[data-incident],select,.switch,.av-chip';
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target.closest(HOVER); if (!t || t === hoverEl) return;
    hoverEl = t; const n = performance.now(); if (n - lastTick < 70) return; lastTick = n; tone(620 + (t.matches('.btn-primary') ? 160 : 0), .05, .028);
  }, true);
  document.addEventListener('pointerout', e => { if (!hoverEl || !hoverEl.contains(e.relatedTarget)) hoverEl = null; }, true);
  document.addEventListener('click', e => { if (e.target.closest('button,a,.nav-link')) tone(440, .09, .05, 'triangle'); }, true);

  /* ---------- Menú hamburguesa: panel lateral con fondo, ESC y aria ---------- */
  const scrim = document.createElement('div'); scrim.className = 'av-scrim'; document.body.append(scrim);
  const sidebar = $('#sidebar'), burger = $('#menuToggle');
  const syncMenu = () => { const o = sidebar.classList.contains('open'); burger.setAttribute('aria-expanded', o); burger.setAttribute('aria-label', o ? 'Cerrar menú' : 'Abrir menú'); scrim.classList.toggle('on', o); };
  new MutationObserver(syncMenu).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  scrim.onclick = () => sidebar.classList.remove('open');
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { sidebar.classList.remove('open'); if ($('#modalRoot .modal')) $('#modalRoot').innerHTML = ''; } });

  /* ---------- Acceso: radar animado, medidor de contraseña ---------- */
  const vis = $('.auth-visual');
  if (vis) for (let k = 0; k < 5; k++) { const b = document.createElement('i'); b.className = 'blip'; b.style.cssText = `right:${8 + Math.random() * 40}%;top:${15 + Math.random() * 60}%;animation-delay:${k * .7}s`; vis.append(b); }
  const rp = $('#registerPassword');
  if (rp) {
    const m = document.createElement('div'); m.className = 'av-meter'; m.innerHTML = '<i></i>'; rp.closest('.password-wrap').after(m);
    const hint = document.createElement('small'); hint.className = 'form-help'; m.after(hint);
    rp.addEventListener('input', () => {
      const v = rp.value, s = (v.length >= 8) + /[A-Z]/.test(v) + /\d/.test(v) + /[^\w]/.test(v) + (v.length >= 12);
      m.firstChild.style.width = s * 20 + '%'; m.firstChild.style.background = ['#e5484d', '#e5484d', '#f59e0b', '#f5b93a', '#19c39b', '#19c39b'][s];
      hint.textContent = v ? ['Muy débil', 'Débil', 'Regular', 'Buena', 'Fuerte', 'Muy fuerte'][s] + ' · usa 8+ caracteres, mayúscula y número' : '';
    });
  }

  /* ---------- Recuperar contraseña (con validación y espera de 60 s) ---------- */
  document.addEventListener('click', e => {
    if (!e.target.closest('#forgotBtn')) return;
    e.stopImmediatePropagation(); e.preventDefault(); openRecovery();
  }, true);
  function openRecovery() {
    $('#modalRoot').innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="recT"><div class="modal-head"><div><h2 id="recT">🔑 Recuperar contraseña</h2><p>Escribe tu correo y te enviaremos un enlace para crear una nueva.</p></div><button class="icon-button" data-close-modal aria-label="Cerrar">✕</button></div><form id="avRecForm" novalidate><div class="modal-body"><label class="field-label">Correo electrónico<input class="field-control" id="recEmail" type="email" autocomplete="email" placeholder="tu@correo.com" value="${$('#loginEmail').value.trim()}"></label><p class="form-error" id="recErr" role="alert"></p><p class="form-help" id="recOk"></p></div><div class="modal-foot"><button type="button" class="btn btn-outline" data-close-modal>Cancelar</button><button class="btn btn-primary" id="recBtn" type="submit">Enviar enlace</button></div></form></section></div>`;
    $('#recEmail').focus();
    $('#avRecForm').addEventListener('submit', async ev => {
      ev.preventDefault(); ev.stopPropagation();
      const email = $('#recEmail').value.trim(), err = $('#recErr'), ok = $('#recOk'), btn = $('#recBtn'); err.textContent = ok.textContent = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Escribe un correo válido, por ejemplo nombre@correo.com.'; return; }
      const wait = Math.ceil((get('av_rec_until', 0) - Date.now()) / 1000);
      if (wait > 0) { err.textContent = `Espera ${wait} s antes de pedir otro enlace.`; return; }
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        if (A().supabase) {
          const { error } = await A().supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
          if (error) throw error;
          ok.textContent = '✓ Si el correo está registrado, recibirás el enlace en unos minutos. Revisa también la carpeta de spam.';
        } else ok.textContent = '✓ Modo demostración: con Supabase conectado se enviaría el enlace a ' + email + '.';
        put('av_rec_until', Date.now() + 60000); tone(784, .15, .06); setTimeout(() => tone(1046, .2, .06), 140);
      } catch (x) {
        err.textContent = /rate|security|seconds/i.test(x.message) ? 'Pediste varios enlaces seguidos. Espera un momento e inténtalo otra vez.' : 'No se pudo enviar: ' + x.message;
      }
      btn.disabled = false; btn.textContent = 'Enviar enlace';
    });
  }
  document.addEventListener('submit', e => { // la nueva contraseña debe repetirse igual
    if (e.target.id !== 'resetPasswordForm') return;
    const a = $('#newPassword').value, b = $('#newPassword2')?.value;
    if (b !== undefined && a !== b) { e.stopImmediatePropagation(); e.preventDefault(); A().toast('Las contraseñas no coinciden', 'Escríbela igual en los dos campos.', 'error'); }
  }, true);

  /* ---------- Cercanía, monitoreo en vivo y silencio temporal ---------- */
  const km = (a, b, c, d) => { const t = x => x * Math.PI / 180, h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const fmtD = k => k < 1 ? Math.round(k * 1000) + ' m' : k.toFixed(1) + ' km';
  const radius = () => Number(LS.getItem('av_radius') || 1.5);
  const muted = () => Date.now() < get('av_mute_until', 0) || LS.getItem('av_mute') === 'true';
  let pos = null, watch = null, tried = false, seen = null, lastSync = Date.now(), feed = [];
  const me = () => pos || A().state.currentLocation;
  const sig = () => A().state.incidents.map(i => i.id + i.status + (i.confirmations || 0) + (i.comments?.length || 0)).join('|');
  const busy = () => $('#modalRoot').children.length || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || A().state.mapCaptureMode;

  function startWatch() {
    if (watch !== null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition(p => { const first = !pos; pos = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }; if (first) { decorate(true); A().toast('📍 Ubicación activada', 'Recibirás alertas dentro de ' + radius() + ' km.'); } },
      er => { watch = null; if (er.code !== 1) { A().ipPosition().then(q => { const first = !pos; pos = { latitude: q.coords.latitude, longitude: q.coords.longitude, accuracy: q.coords.accuracy }; if (first) { decorate(true); A().toast('📍 Ubicación aproximada', 'No hay WiFi/GPS; usamos tu conexión a internet. Alertas dentro de ' + radius() + ' km.'); } }).catch(() => A().toast('Ubicación', 'No se pudo obtener tu ubicación.', 'error')); return; } A().toast('Ubicación', er.code === 1 ? 'Permiso denegado. Actívalo en el candado de la barra del navegador.' : 'No se pudo obtener tu ubicación.', 'error'); },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 });
  }
  function notify(title, msg, urgent) {
    A().pushNotification(title, msg);
    feed.unshift({ t: Date.now(), title, msg, urgent }); feed = feed.slice(0, 8); paintFeed();
    if (muted()) return;
    A().toast(title, msg); urgent ? siren() : tone(660, .12, .05);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body: msg });
  }
  function scan() { // compara lo que había con lo que hay ahora: incidentes nuevos y cambios de estado
    const S = A().state; if (!S.user) { seen = null; return; }
    const cur = new Map(S.incidents.map(i => [String(i.id), i.status]));
    if (!seen) { seen = cur; return; }
    S.incidents.forEach(i => {
      const id = String(i.id), c = A().category(i.category);
      if (!seen.has(id)) {
        if (!A().isActive(i) || i.user_id === S.user.id || i.reporter_id === S.user.id) return;
        if (S.role === 'vecino') {
          const p = me(); if (!p || !A().hasCoords(i)) return;
          const d = km(p.latitude, p.longitude, +i.latitude, +i.longitude);
          if (d <= radius()) notify(`${c.icon} Alerta a ${fmtD(d)} de ti`, `${c.name}: ${i.address || i.description}`, true);
        } else if (S.demo && S.role === 'policia') notify(`${c.icon} Nueva alerta`, `${c.name}: ${i.address || ''}`, true);
      } else if (seen.get(id) !== i.status) notify(`Reporte ${i.code || i.report_code || i.id}`, `Ahora está: ${i.status}`, false);
    });
    seen = cur;
  }
  async function poll() { // respaldo si Realtime se corta: pregunta cada 15 s y solo redibuja si algo cambió
    const S = A().state; if (!S.user || S.demo || document.hidden) return;
    const before = sig();
    try { await A().loadRemote(); lastSync = Date.now(); if (sig() !== before && !busy()) A().renderPage(); } catch { /* sin red */ }
  }
  addEventListener('storage', e => { // modo demo: otra pestaña cambió datos → se refleja al instante
    const S = A()?.state; if (!S?.user || !S.demo || !['av_incidents', 'av_responses', 'av_stations'].includes(e.key)) return;
    A().loadDemo(); A().loadResponses().then(() => { lastSync = Date.now(); if (!busy()) A().renderPage(); });
  });
  document.addEventListener('visibilitychange', () => !document.hidden && poll());
  setInterval(poll, 15000); setInterval(scan, 1500);

  function simulate() {
    const S = A().state, b = me() || { latitude: -16.5008, longitude: -68.1336 }, d = Math.random() * radius() * .7, a = Math.random() * 6.283;
    const cats = ['robo', 'sospechoso', 'vandalismo', 'emergencia'];
    S.incidents.unshift({ id: 'AV-' + String(Date.now()).slice(-6), user_id: 'otro-vecino', reporter_name: 'Vecino (simulado)', category: cats[Math.floor(Math.random() * 4)], description: 'Alerta simulada para probar los avisos por cercanía.', latitude: b.latitude + d / 111 * Math.sin(a), longitude: b.longitude + d / (111 * Math.cos(b.latitude * Math.PI / 180)) * Math.cos(a), address: 'Cerca de ti (simulación)', status: 'Activa', created_at: new Date().toISOString(), confirmations: 0, comments: [], observations: [], station_id: null });
    A().saveDemo(); if (!me()) A().toast('Activa tu ubicación', 'Sin ubicación no se puede medir la cercanía.', 'error'); scan(); if (!busy()) A().renderPage();
  }
  const nearCount = () => { const p = me(); return p ? A().state.incidents.filter(i => A().isActive(i) && A().hasCoords(i) && km(p.latitude, p.longitude, +i.latitude, +i.longitude) <= radius()).length : null; };

  /* chip "En vivo" en la barra superior */
  const chip = document.createElement('span'); chip.className = 'av-live'; chip.id = 'avLive'; chip.setAttribute('role', 'status'); chip.innerHTML = '<i></i><span></span>';
  $('.topbar-actions').prepend(chip);
  setInterval(() => {
    const S = A()?.state, left = get('av_mute_until', 0) - Date.now(), t = chip.lastChild;
    chip.classList.toggle('off', !navigator.onLine); chip.classList.toggle('mute', left > 0);
    t.textContent = !navigator.onLine ? 'Sin conexión' : left > 0 ? `🔕 Silenciado ${Math.ceil(left / 60000)} min` : S?.demo ? 'Demo en vivo · pestañas sincronizadas' : `En vivo · actualizado hace ${Math.round((Date.now() - lastSync) / 1000)} s`;
    if ($('#avMuteState')) $('#avMuteState').textContent = left > 0 ? `🔕 Silenciado ${Math.ceil(left / 60000)} min más` : muted() ? '🔕 Modo no molestar activo' : '🔔 Notificaciones activas';
    if (S?.user && !tried) { tried = true; navigator.permissions?.query({ name: 'geolocation' }).then(r => r.state === 'granted' && startWatch()).catch(() => {}); }
    if (!S?.user) tried = false;
  }, 1000);

  /* ---------- Piezas inyectadas en las pantallas existentes ---------- */
  function paintFeed() {
    const ul = $('#avFeed'); if (!ul) return;
    const rows = feed.length ? feed : A().state.incidents.slice(0, 4).map(i => ({ t: new Date(i.created_at).getTime(), title: `${A().category(i.category).icon} ${A().category(i.category).name}`, msg: `${i.address || ''} · ${i.status}` }));
    ul.innerHTML = rows.map(r => `<li class="${r.urgent ? 'new' : ''}"><div><strong>${A().esc(r.title)}</strong><br><small>${A().esc(r.msg)} · ${A().ago(r.t)}</small></div></li>`).join('') || '<li>Esperando novedades…</li>';
  }
  function decorate(force) {
    const S = A()?.state; if (!S?.user) { revPage = null; return; }
    const pc = $('#pageContent');
    if (S.page === 'dashboard' && pc) {
      if (force) { $('#avBanner')?.remove(); }
      if (!$('#avHero') && pc.firstElementChild) pc.insertAdjacentHTML('afterbegin', heroHtml(S));
      if (!$('#avFeedPanel') && pc.firstElementChild) {
        ($('.welcome-card,.police-banner', pc) || pc.firstElementChild).insertAdjacentHTML('afterend', '<section class="panel" id="avFeedPanel"><div class="panel-header"><div><h3 class="panel-title">📡 Monitoreo en tiempo real</h3><p class="panel-subtitle">Se actualiza solo, sin recargar la página</p></div><span class="av-live"><i></i><span>En vivo</span></span></div><ul class="av-feed" id="avFeed"></ul></section>');
        paintFeed();
      }
      if (S.role === 'vecino' && !$('#avTips') && pc.lastElementChild) pc.lastElementChild.insertAdjacentHTML('afterend', `<section class="panel av-tips" id="avTips"><div class="panel-header"><div><h3 class="panel-title">Cuidemos juntos nuestro barrio</h3><p class="panel-subtitle">Tres hábitos sencillos que hacen una gran diferencia</p></div></div><div class="av-tip-grid"><article class="av-tip t1"><div class="av-tip-art art-bienvenida" aria-hidden="true"></div><div class="av-tip-tx"><h4>Conoce a tus vecinos</h4><p>Un barrio que se conoce se cuida mejor. Intercambia contactos con vecinos de confianza.</p><button class="btn" data-page="map">Ver el mapa</button></div></article><article class="av-tip t2"><div class="av-tip-art art-reportes" aria-hidden="true"></div><div class="av-tip-tx"><h4>Reporta con detalles</h4><p>Indica la calle, qué pasó y a qué hora. Una foto ayuda a que la policía llegue más rápido.</p><button class="btn" data-action="new-alert">Reportar incidente</button></div></article><article class="av-tip t3"><div class="av-tip-art art-policia" aria-hidden="true"></div><div class="av-tip-tx"><h4>Ante un peligro, llama primero</h4><p>Si hay riesgo inmediato, contacta a los servicios de emergencia y después repórtalo aquí.</p></div></article></div></section>`);
      if (S.role === 'vecino' && !$('#avBanner') && pc.firstElementChild) {
        const n = nearCount();
        ($('#avHero') || pc).insertAdjacentHTML($('#avHero') ? 'afterend' : 'afterbegin', `<div class="av-banner" id="avBanner"><div><strong>${n === null ? '📍 Activa tu ubicación para recibir alertas cerca de ti' : `📍 ${n} alerta(s) activa(s) a menos de ${radius()} km de ti`}</strong><br><small>${n === null ? 'Solo se usa en tu dispositivo para medir la distancia.' : 'Te avisaremos cuando ocurra algo dentro de tu radio.'}</small></div>${n === null ? '<button class="btn btn-sm" style="background:#f5b93a;color:#101936" data-av="loc">Activar ubicación</button>' : '<button class="btn btn-sm" style="background:#ffffff30" data-page="settings">Cambiar radio</button>'}</div>`);
      }
    }
    if ($('#radiusRange') && !$('#avMutePanel')) {
      const n = nearCount();
      $('#pageContent').lastElementChild.insertAdjacentHTML('afterend', `<section class="panel" id="avMutePanel"><div class="panel-header"><div><h3 class="panel-title">🔕 Silenciar notificaciones</h3><p class="panel-subtitle" id="avMuteState"></p></div></div><div>${[['15', '15 minutos'], ['60', '1 hora'], ['480', '8 horas'], ['tom', 'Hasta mañana 7:00'], ['0', 'Reactivar ahora']].map(([v, l]) => `<button class="av-chip" data-av-mute="${v}">${l}</button>`).join('')}</div><div class="divider"></div><p id="avNear"><strong>${n === null ? 'Activa tu ubicación para ver cuántas alertas hay cerca.' : `Ahora hay ${n} alerta(s) activa(s) dentro de ${radius()} km.`}</strong></p><p class="form-help">El radio se guarda al mover el control. Las alertas fuera de él no te molestan.</p><button class="av-chip" data-av="loc">📍 Activar mi ubicación</button><button class="av-chip" data-av="perm">🔔 Permitir avisos del navegador</button>${S.demo ? '<button class="av-chip" data-av="sim">🧪 Simular alerta cercana</button>' : ''}</section>`);
    }
    if (S.page === 'map' && $('#mapPickInstruction') && !$('#avMapTools')) { mapTools(S); lastMap = null; }
    if ($('#avMapTools') && S.map && S.map !== lastMap) { lastMap = S.map; applyHeat(); }
    if (S.page === 'statistics' && S.map && S.map !== lastStat) { // mapa de calor de administración con colores y radio por zoom
      const m = lastStat = S.map; ready(m, () => { if (!m.getLayer('incident-heat-layer')) return; m.setPaintProperty('incident-heat-layer', 'heatmap-color', RAMP); m.setPaintProperty('incident-heat-layer', 'heatmap-radius', ['interpolate', ['linear'], ['zoom'], 10, 24, 16, 70]); m.setPaintProperty('incident-heat-layer', 'heatmap-opacity', .85); });
    }
    const rmA = $('#modalRoot .modal a[href*="google.com/maps/dir"]');
    if (rmA && !$('.av-route') && S.selected && A().hasCoords(S.selected)) rmA.insertAdjacentHTML('beforebegin', '<div class="av-route"><strong>🧭 Mi ubicación y ruta hacia el incidente</strong><p class="form-help">Mira dónde estás tú y el camino hasta el lugar.</p><button class="av-chip on" data-av-prof="driving">🚗 En auto</button><button class="av-chip" data-av-prof="walking">🚶 A pie</button><br><button class="btn btn-primary btn-sm" data-av="route">Mostrar ruta</button><p id="avRouteInfo" role="status"></p><div class="rmap hidden" id="avRouteMap"></div></div>');
    if ($('#resetPasswordForm') && !$('#newPassword2')) $('#newPassword').closest('label').insertAdjacentHTML('afterend', '<label class="field-label" style="margin-top:12px">Repite la contraseña<input class="field-control" id="newPassword2" type="password" minlength="8" required></label>');
    reveal(S);
    $$('.stat-value:not([data-c])').forEach(el => { // contadores animados
      el.dataset.c = 1; const txt = el.textContent.trim(); if (!/^\d{1,4}$/.test(txt) || !prefs.motion || !el.firstChild) return;
      const n = +txt; let t0; const f = t => { t0 = t0 || t; const p = Math.min(1, (t - t0) / 800); el.firstChild.nodeValue = Math.round(n * (1 - (1 - p) ** 3)); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
    });
  }
  let tm; new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(() => decorate(), 40); }).observe(document.body, { childList: true, subtree: true });
  setInterval(paintFeed, 20000);

  document.addEventListener('input', e => { // el radio se guarda al instante
    if (e.target.id !== 'radiusRange') return;
    LS.setItem('av_radius', e.target.value); const n = nearCount();
    if ($('#avNear')) $('#avNear').innerHTML = `<strong>${n === null ? 'Activa tu ubicación para ver cuántas alertas hay cerca.' : `Ahora hay ${n} alerta(s) activa(s) dentro de ${e.target.value} km.`}</strong>`;
    $('#avBanner')?.remove(); // se rehace con el radio nuevo al volver al resumen
  });

  /* ---------- Rutas (Mapbox Directions) y mapa de calor ---------- */
  let prof = 'driving', rmap = null, rm = [], heatOn = null, lastMap = null, lastStat = null;
  const mapStyle = () => root.dataset.theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';
  const ready = (m, fn) => m.isStyleLoaded() ? fn() : m.once('load', fn);
  async function myLocation() {
    try { const o = await new Promise((ok, no) => navigator.geolocation.getCurrentPosition(p => ok({ latitude: p.coords.latitude, longitude: p.coords.longitude }), no, { enableHighAccuracy: true, timeout: 12000 })); pos = o; return o; } catch { try { const q = await A().ipPosition(); pos = { latitude: q.coords.latitude, longitude: q.coords.longitude, accuracy: q.coords.accuracy }; return pos; } catch { return null; } }
  }
  async function getRoute(o, d, p) { // o y d son [lng, lat]; si falla devuelve línea recta
    if (A().mapConfigured) try {
      const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${p}/${o.join(',')};${d.join(',')}?geometries=geojson&overview=full&steps=true&language=es&access_token=${A().cfg.MAPBOX_TOKEN}`);
      const rt = (await r.json()).routes?.[0];
      if (rt) return { line: rt.geometry.coordinates, dist: rt.distance / 1000, min: Math.max(1, Math.round(rt.duration / 60)), steps: rt.legs[0].steps.map(s => ({ t: s.maneuver.instruction, d: s.distance })), dashed: false };
    } catch { /* línea recta */ }
    return { line: [o, d], dist: km(o[1], o[0], d[1], d[0]), min: null, steps: [], dashed: true };
  }
  const routeHtml = rt => `<p><strong>${fmtD(rt.dist)}</strong>${rt.min ? ` · <strong>${rt.min} min</strong> ${prof === 'walking' ? 'caminando' : 'en auto'}` : ' en línea recta (no se pudo calcular el camino por calles)'}</p>${rt.steps.length ? `<ol class="av-steps">${rt.steps.map(x => `<li>${A().esc(x.t)} <small>(${fmtD(x.d / 1000)})</small></li>`).join('')}</ol>` : ''}`;
  function drawRoute(m, rt, org, dest) {
    ready(m, () => {
      rm.forEach(x => x.remove());
      rm = [new mapboxgl.Marker({ color: '#2458f0' }).setLngLat(org).setPopup(new mapboxgl.Popup().setText('Tú estás aquí')).addTo(m), new mapboxgl.Marker({ color: '#e5484d' }).setLngLat(dest).setPopup(new mapboxgl.Popup().setText('Destino')).addTo(m)];
      ['av-route', 'av-route-case'].forEach(id => m.getLayer(id) && m.removeLayer(id)); m.getSource('av-route') && m.removeSource('av-route');
      m.addSource('av-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: rt.line } } });
      const lay = { 'line-cap': 'round', 'line-join': 'round' };
      m.addLayer({ id: 'av-route-case', type: 'line', source: 'av-route', layout: lay, paint: { 'line-color': '#101936', 'line-width': 11, 'line-opacity': .45 } });
      m.addLayer({ id: 'av-route', type: 'line', source: 'av-route', layout: lay, paint: { 'line-color': '#f5b93a', 'line-width': 6, ...(rt.dashed ? { 'line-dasharray': [2, 2] } : {}) } });
      const b = new mapboxgl.LngLatBounds(); rt.line.forEach(c => b.extend(c)); m.fitBounds(b, { padding: 60, duration: 800 });
    });
  }
  async function showRoute() { // ruta dentro del detalle de un incidente
    const i = A().state.selected, info = $('#avRouteInfo'), box = $('#avRouteMap'); if (!i || !info) return;
    info.textContent = 'Buscando tu ubicación…';
    const o = await myLocation(); if (!o) { info.textContent = 'No pudimos ver tu ubicación. Actívala en el candado de la barra del navegador.'; return; }
    const org = [o.longitude, o.latitude], dest = [+i.longitude, +i.latitude], rt = await getRoute(org, dest, prof);
    info.innerHTML = routeHtml(rt);
    if (!A().mapConfigured || !window.mapboxgl) return;
    rmap?.remove(); box.classList.remove('hidden'); mapboxgl.accessToken = A().cfg.MAPBOX_TOKEN;
    drawRoute(rmap = new mapboxgl.Map({ container: box, style: mapStyle(), center: org, zoom: 13 }), rt, org, dest);
  }
  async function mapRoute() { // ruta sobre el mapa principal hacia un incidente o un retén
    const S = A().state, v = $('#avRouteTo')?.value, out = $('#avMapRoute'); if (!v) { out.textContent = 'No hay destinos con ubicación en el mapa.'; return; }
    const x = (v[0] === 'i' ? S.incidents : S.stations).find(z => String(z.id) === v.slice(2)); out.textContent = 'Buscando tu ubicación…';
    const o = await myLocation(); if (!o) { out.textContent = 'Activa la ubicación del navegador (candado de la barra) para trazar la ruta.'; return; }
    const org = [o.longitude, o.latitude], dest = [+x.longitude, +x.latitude], rt = await getRoute(org, dest, prof);
    out.innerHTML = routeHtml(rt); if (S.map && window.mapboxgl) drawRoute(S.map, rt, org, dest);
  }
  const RAMP = ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(36,88,240,0)', .2, '#4cc9f0', .4, '#19c39b', .6, '#f5b93a', .8, '#f26b3a', 1, '#e5484d'];
  const heatData = () => { const per = +$('#avHeatPeriod').value, cat = $('#avHeatCat').value, now = Date.now(); return A().state.incidents.filter(i => A().hasCoords(i) && (!cat || i.category === cat) && (!per || now - new Date(i.created_at) <= per * 864e5)); };
  function applyHeat() {
    const m = A().state.map; if (!m || !$('#avHeatPeriod')) return;
    ready(m, () => {
      m.getLayer('av-heat') && m.removeLayer('av-heat'); m.getSource('av-heat') && m.removeSource('av-heat');
      const f = heatData();
      if (heatOn && f.length) {
        m.addSource('av-heat', { type: 'geojson', data: { type: 'FeatureCollection', features: f.map(i => ({ type: 'Feature', properties: { w: A().isActive(i) ? 1 : .6 }, geometry: { type: 'Point', coordinates: [+i.longitude, +i.latitude] } })) } });
        m.addLayer({ id: 'av-heat', type: 'heatmap', source: 'av-heat', paint: { 'heatmap-weight': ['get', 'w'], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 3], 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 24, 16, 70], 'heatmap-opacity': .85, 'heatmap-color': RAMP } });
      }
      const g = {}; f.forEach(i => { const k = Math.round(i.latitude / .005) + ',' + Math.round(i.longitude / .005); (g[k] = g[k] || []).push(i); });
      const top = Object.values(g).sort((a, b) => b.length - a.length).slice(0, 5);
      $('#avHot').innerHTML = top.map(z => `<li><button class="av-chip" data-hot="${z[0].longitude},${z[0].latitude}">📍 ${A().esc(z[0].address || 'Zona sin nombre')} · ${z.length} reporte(s)</button></li>`).join('') || '<li class="form-help">No hay reportes con ubicación en este periodo.</li>';
      $('#avHeatLegend').hidden = !heatOn;
    });
  }
  function mapTools(S) { // panel de herramientas bajo el mapa: calor + ruta
    if (heatOn === null) heatOn = S.role === 'admin';
    const dests = S.incidents.filter(i => A().isActive(i) && A().hasCoords(i)).slice(0, 15).map(i => `<option value="i:${A().esc(i.id)}">${A().category(i.category).icon} ${A().esc(A().category(i.category).name)} · ${A().esc(i.address || i.id)}</option>`)
      .concat(S.stations.filter(A().hasCoords).map(x => `<option value="s:${A().esc(x.id)}">🏢 ${A().esc(x.name)}</option>`)).join('');
    $('#mapPickInstruction').insertAdjacentHTML('afterend', `<div class="av-tools" id="avMapTools"><div class="av-row"><strong>🔥 Mapa de calor</strong><button class="av-chip ${heatOn ? 'on' : ''}" data-av="heat" aria-pressed="${!!heatOn}">${heatOn ? 'Ocultar zonas calientes' : 'Mostrar zonas calientes'}</button><select class="field-control" id="avHeatPeriod" aria-label="Periodo"><option value="7">Últimos 7 días</option><option value="30" selected>Últimos 30 días</option><option value="0">Todo el historial</option></select><select class="field-control" id="avHeatCat" aria-label="Categoría"><option value="">Todas las categorías</option>${['robo', 'sospechoso', 'violencia', 'emergencia', 'vandalismo', 'otro'].map(c => `<option value="${c}">${A().category(c).icon} ${A().category(c).name}</option>`).join('')}</select></div><div class="av-legend-heat" id="avHeatLegend" hidden><span>Pocos reportes</span><i></i><span>Muchos reportes</span></div><ol class="av-hot" id="avHot"></ol><div class="av-row"><strong>🧭 Ruta</strong><select class="field-control" id="avRouteTo" aria-label="Destino">${dests}</select><button class="av-chip on" data-av-prof="driving">🚗 En auto</button><button class="av-chip" data-av-prof="walking">🚶 A pie</button><button class="btn btn-primary btn-sm" data-av="maproute">Trazar ruta</button></div><div id="avMapRoute" role="status"></div></div>`);
  }
  document.addEventListener('change', e => { if (e.target.id === 'avHeatPeriod' || e.target.id === 'avHeatCat') applyHeat(); });

  /* ---------- Acciones de los botones inyectados ---------- */
  document.addEventListener('click', e => {
    const mu = e.target.closest('[data-av-mute]'), ac2 = e.target.closest('[data-av]'), pf = e.target.closest('[data-av-prof]');
    if (mu) {
      const v = mu.dataset.avMute; let until = 0;
      if (v === 'tom') { const d = new Date(); d.setHours(7, 0, 0, 0); if (d <= Date.now()) d.setDate(d.getDate() + 1); until = +d; } else if (v !== '0') until = Date.now() + v * 60000;
      put('av_mute_until', until); if (v === '0') { LS.setItem('av_mute', 'false'); const sw = $('#muteSwitch'); if (sw) sw.checked = false; }
      $$('[data-av-mute]').forEach(b => b.classList.toggle('on', b === mu && v !== '0'));
      A().toast(v === '0' ? 'Notificaciones activadas' : 'Notificaciones silenciadas', v === '0' ? 'Volverás a recibir avisos.' : 'Se reactivarán solas cuando termine el tiempo.');
    }
    const hot = e.target.closest('[data-hot]'); if (hot && A().state.map) { const [x, y] = hot.dataset.hot.split(',').map(Number); A().state.map.flyTo({ center: [x, y], zoom: 16 }); }
    if (pf) { prof = pf.dataset.avProf; $$('[data-av-prof]').forEach(b => b.classList.toggle('on', b === pf)); if ($('#avRouteMap') && !$('#avRouteMap').classList.contains('hidden')) showRoute(); else if ($('#avMapRoute')?.innerHTML) mapRoute(); }
    if (ac2) {
      const k = ac2.dataset.av;
      if (k === 'loc') startWatch();
      if (k === 'sim') simulate();
      if (k === 'route') showRoute();
      if (k === 'maproute') mapRoute();
      if (k === 'heat') { heatOn = !heatOn; ac2.classList.toggle('on', heatOn); ac2.setAttribute('aria-pressed', heatOn); ac2.textContent = heatOn ? 'Ocultar zonas calientes' : 'Mostrar zonas calientes'; applyHeat(); }
      if (k === 'perm' && 'Notification' in window) Notification.requestPermission().then(r => A().toast('Avisos del navegador', r === 'granted' ? 'Activados.' : 'Permiso no concedido.', r === 'granted' ? 'success' : 'error'));
    }
  });


  /* ---------- Calle automática: al marcar el incidente se rellena «Calle, zona o referencia» ---------- */
  let geoTimer, geoCtl;
  document.addEventListener('input', e => { if (e.target.id === 'alertAddress') e.target.dataset.manual = e.target.value ? '1' : ''; });
  document.addEventListener('av:point', ev => {
    clearTimeout(geoTimer);
    geoTimer = setTimeout(async () => {
      const f = $('#alertAddress'); if (!f || f.dataset.manual === '1' || !A().mapConfigured) return;
      geoCtl?.abort(); geoCtl = new AbortController(); const ph = f.placeholder; f.placeholder = 'Buscando la calle…';
      try {
        const { lat, lng } = ev.detail;
        const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address,poi,neighborhood,locality&language=es&limit=1&access_token=${A().cfg.MAPBOX_TOKEN}`, { signal: geoCtl.signal });
        const place = (await r.json()).features?.[0]?.place_name;
        if (place && f.dataset.manual !== '1') { f.value = place.split(', ').slice(0, 3).join(', '); f.dataset.manual = ''; }
        else if (!place) f.placeholder = 'No se encontró la calle; escríbela tú';
      } catch (x) { if (x.name !== 'AbortError') f.placeholder = 'No se pudo buscar la calle; escríbela tú'; }
      if (f.placeholder === 'Buscando la calle…') f.placeholder = ph;
    }, 450);
  });

  /* ---------- Carrusel de portada ---------- */
  const hero = { i: 0 };
  const ART = { '🚨': 'alerta', '🗺️': 'mapa', '📋': 'reportes', '🔔': 'notificaciones', '🔥': 'calor', '🧭': 'ruta', '🔕': 'silencio', '📊': 'estadisticas', '📈': 'estadisticas', '👮': 'policia', '🏢': 'reten', '🗂️': 'historial' };
  function heroSlides(S) {
    const n = nearCount(), mine = S.incidents.filter(i => i.user_id === S.user.id || i.reporter_id === S.user.id), act = S.incidents.filter(A().isActive), unread = S.notifications.filter(x => x.unread).length;
    const NEW = 'Novedad', IMP = 'Importante', QUICK = 'Acceso rápido';
    if (S.role === 'policia') return [
      ['🚨', IMP, `${act.length} alerta(s) pendientes`, 'Atiéndelas desde tu panel y registra cada avance.', 'alerts', 'Atender alertas'],
      ['🗺️', QUICK, 'Mapa operativo', 'Ubica incidentes, retenes y unidades en la calle.', 'map', 'Abrir mapa'],
      ['🔥', NEW, 'Mapa de calor', 'Mira en qué zonas se repiten los reportes.', 'map', 'Ver zonas calientes'],
      ['🧭', NEW, 'Rutas hasta el incidente', 'Distancia, minutos y pasos en español.', 'map', 'Trazar ruta'],
      ['🗂️', QUICK, 'Historial de atención', 'Consulta las intervenciones ya cerradas.', 'history', 'Ver historial']];
    if (S.role === 'admin') return [
      ['📊', IMP, `${S.incidents.length} incidentes registrados`, `${act.length} siguen activos y esperan atención.`, 'alerts', 'Ver incidentes'],
      ['🔥', NEW, 'Mapa de calor', 'Detecta las zonas con más reportes por periodo y categoría.', 'map', 'Abrir mapa de calor'],
      ['📈', QUICK, 'Estadísticas', 'Indicadores de los últimos 7 días y por categoría.', 'statistics', 'Ver estadísticas'],
      ['👮', QUICK, 'Cuentas policiales', 'Registra, asigna retén y activa o desactiva accesos.', 'police-users', 'Gestionar cuentas'],
      ['🏢', QUICK, 'Retenes', 'Administra los puntos de respuesta del mapa.', 'stations', 'Ver retenes']];
    return [
      ['🚨', IMP, n === null ? 'Activa tu ubicación' : `${n} alerta(s) cerca de ti`, n === null ? 'Así te avisamos cuando pase algo dentro de tu radio.' : `Dentro de ${radius()} km de donde estás ahora.`, n === null ? '' : 'map', n === null ? 'Activar ubicación' : 'Ver en el mapa'],
      ['🗺️', QUICK, 'Mapa de alertas', 'Mira incidentes y retenes. Toca una calle para reportar.', 'map', 'Abrir mapa'],
      ['📋', QUICK, 'Mis reportes', `${mine.length} reporte(s) tuyos · ${mine.filter(A().isActive).length} siguen activos.`, 'my-reports', 'Ver mis reportes'],
      ['🔔', QUICK, 'Notificaciones', unread ? `Tienes ${unread} sin leer.` : 'Estás al día, no hay avisos pendientes.', 'notifications', 'Abrir avisos'],
      ['🔥', NEW, 'Mapa de calor', 'Descubre las zonas con más reportes en tu ciudad.', 'map', 'Ver zonas calientes'],
      ['🧭', NEW, 'Ruta hasta el incidente', 'Tu ubicación, distancia, minutos y pasos en español.', 'map', 'Probar rutas'],
      ['🔕', NEW, 'Silenciar temporalmente', 'Pausa los avisos 15 min, 1 h, 8 h o hasta mañana.', 'settings', 'Configurar']];
  }
  function heroHtml(S) {
    const sl = heroSlides(S); hero.i = Math.min(hero.i, sl.length - 1);
    return `<section class="av-hero" id="avHero" aria-roledescription="carrusel" aria-label="Novedades y accesos"><div class="av-slides" aria-live="off">${sl.map((s, k) => `<article class="av-slide g${k % 5} ${k === hero.i ? 'on' : ''}" role="group" aria-label="${k + 1} de ${sl.length}"><div class="av-sl-tx"><span class="av-tag">${s[1]}</span><h2>${s[2]}</h2><p>${s[3]}</p>${s[4] ? `<button class="btn" data-page="${s[4]}">${s[5]} <span>→</span></button>` : `<button class="btn" data-av="loc">${s[5]}</button>`}</div><div class="av-sl-art art-${ART[s[0]] || 'alerta'}" aria-hidden="true"></div></article>`).join('')}</div><button class="av-arrow av-prev" data-hero="-1" aria-label="Anterior">‹</button><button class="av-arrow av-next" data-hero="1" aria-label="Siguiente">›</button><div class="av-hero-ctl"><div class="av-dots">${sl.map((_, k) => `<button data-dot="${k}" class="${k === hero.i ? 'on' : ''}" aria-label="Ir a ${k + 1}"></button>`).join('')}</div></div><i class="av-prog"></i></section>`;
  }
  function goHero(k) {
    const h = $('#avHero'); if (!h) return; const sl = $$('.av-slide', h), n = sl.length, old = hero.i;
    hero.i = (k + n) % n; if (old === hero.i) return;
    sl[old].classList.add('out'); sl[old].classList.remove('on'); setTimeout(() => sl[old].classList.remove('out'), 700);
    sl[hero.i].classList.add('on'); $$('[data-dot]', h).forEach((d, j) => d.classList.toggle('on', j === hero.i));
    const p = $('.av-prog', h); p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
  }
  const heroAuto = () => prefs.motion;
  let heroTimer = setInterval(() => { if (heroAuto() && !document.hidden) goHero(hero.i + 1); }, 3000);
  const heroReset = () => { clearInterval(heroTimer); heroTimer = setInterval(() => { if (heroAuto() && !document.hidden) goHero(hero.i + 1); }, 3000); };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-hero],[data-dot]'); if (!b) return;
    if (b.dataset.dot) goHero(+b.dataset.dot);
    else goHero(hero.i + +b.dataset.hero);
    heroReset();
  });
  let sx = null; document.addEventListener('pointerdown', e => { sx = e.target.closest('#avHero') ? e.clientX : null; });
  document.addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 60 && !e.target.closest('button')) goHero(hero.i + (e.clientX < sx ? 1 : -1)); sx = null; });

  /* ---------- Animación suave al bajar (scroll) y al entrar a cada pantalla ---------- */
  const RV = '.page-heading,.welcome-card,.police-banner,.av-banner,.av-hero,.panel,.stat-card,.quick-action,.incident-row,.map-list-row,.notification-card,.toggle-row,.av-tools,tbody tr,.detail-item,.comment,.form-grid>*';
  let io, revPage = null;
  function reveal(S) {
    const fresh = S.page !== revPage; revPage = S.page;
    const on = fresh && prefs.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window;
    if (on) io = io || new IntersectionObserver(es => es.forEach(en => { if (!en.isIntersecting) return; const el = en.target; io.unobserve(el); el.classList.add('in'); setTimeout(() => el.classList.remove('av-rv', 'in'), 1300); }), { threshold: .06, rootMargin: '0px 0px -5% 0px' });
    $$(RV, $('#pageContent')).forEach(el => {
      if (el.dataset.rv) return; el.dataset.rv = 1; if (!on) return;
      const sib = [...el.parentElement.children].filter(x => x.matches(RV));
      el.style.setProperty('--d', Math.min(sib.indexOf(el), 6) * .08 + 's'); el.classList.add('av-rv'); io.observe(el);
    });
  }

  applyPrefs();
})();
