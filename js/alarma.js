/* =========================================================================
   AlertaVecinal · Alarma por cercanía (versión WEB)
   Mientras la página esté abierta (aunque sea en otra pestaña o ventana minimizada):
   - sigue tu ubicación,
   - consulta cada 10 s si hay alertas cerca (función nearby_alerts de Supabase),
   - hace sonar una sirena hasta que pulses «Ya vi la alerta».
   En la app Android no actúa: allí lo hace el servicio nativo (window.AndroidBridge).
   ========================================================================= */
(function () {
  'use strict';
  if (window.AndroidBridge) return;

  var cfg = window.APP_CONFIG || {};
  var POLL_MS = 10000;
  var K_EN = 'av_alarm_enabled', K_ACT = 'av_alarm_active', K_SEEN = 'av_alarm_seen';
  var CAT = {
    robo: ['🚨', 'Robo / asalto'], sospechoso: ['👁️', 'Persona sospechosa'], violencia: ['⚠️', 'Violencia'],
    emergencia: ['🆘', 'Emergencia'], vandalismo: ['🔨', 'Vandalismo']
  };

  var st = {
    loc: null, watchId: null, perm: 'prompt', activated: false, leader: false, lockWanted: false, lockRelease: null,
    audio: null, osc: null, gain: null, sirenTimer: null, vibTimer: null, titleTimer: null, ringing: false,
    localTest: false, since: null, lastPoll: 0, polling: false, compact: false, lastIds: '', error: '',
    origTitle: document.title
  };

  /* ---------- utilidades ---------- */
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function enabled() { try { return localStorage.getItem(K_EN) !== '0'; } catch (e) { return true; } }
  function loggedIn() { var a = document.getElementById('appView'); return !!(a && !a.classList.contains('hidden')); }
  function isVecino() { var r = document.getElementById('sidebarRole'); return !!(r && /vecino/i.test(r.textContent)); }
  function sessionUser() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { var v = JSON.parse(localStorage.getItem(k)); if (v && v.user && v.user.id) return v.user.id; }
      }
    } catch (e) {}
    return '';
  }
  function ago(iso) {
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return isNaN(m) ? '' : (m < 1 ? 'hace instantes' : 'hace ' + m + ' min');
  }
  function active() { return jget(K_ACT, []); }

  /* ---------- sonido: sirena con Web Audio ---------- */
  function unlockAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!st.audio) st.audio = new AC();
      if (st.audio.state === 'suspended') st.audio.resume();
      var b = st.audio.createBuffer(1, 1, 22050), s = st.audio.createBufferSource();
      s.buffer = b; s.connect(st.audio.destination); s.start(0);
    } catch (e) {}
  }
  function audioReady() { return !!(st.audio && st.audio.state === 'running'); }
  function startSiren() {
    if (st.osc) return;
    try {
      unlockAudio();
      if (!st.audio) return;
      var o = st.audio.createOscillator(), g = st.audio.createGain();
      o.type = 'square'; o.frequency.value = 960; g.gain.value = 0.35;
      o.connect(g); g.connect(st.audio.destination); o.start();
      st.osc = o; st.gain = g;
      var hi = true;
      st.sirenTimer = setInterval(function () {
        hi = !hi;
        try { st.osc.frequency.setValueAtTime(hi ? 960 : 720, st.audio.currentTime); } catch (e) {}
        if (st.audio && st.audio.state === 'suspended') { try { st.audio.resume(); } catch (e) {} }
      }, 450);
    } catch (e) {}
  }
  function stopSiren() {
    clearInterval(st.sirenTimer); st.sirenTimer = null;
    try { if (st.osc) st.osc.stop(); } catch (e) {}
    try { if (st.osc) st.osc.disconnect(); } catch (e) {}
    st.osc = null; st.gain = null;
  }
  function ringStart() {
    if (st.ringing) return;
    st.ringing = true;
    startSiren();
    st.vibTimer = setInterval(function () { try { if (navigator.vibrate) navigator.vibrate([700, 350, 700]); } catch (e) {} }, 2500);
    var flip = false;
    st.titleTimer = setInterval(function () { flip = !flip; document.title = flip ? '🚨 ALERTA CERCA DE TI' : st.origTitle; }, 900);
  }
  function ringStop() {
    if (!st.ringing && !st.osc) return;
    st.ringing = false;
    stopSiren();
    clearInterval(st.vibTimer); st.vibTimer = null;
    clearInterval(st.titleTimer); st.titleTimer = null;
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
    document.title = st.origTitle;
  }
  function syncRinging() {
    var list = active();
    if (list.length && (st.leader || st.localTest)) ringStart(); else ringStop();
  }

  /* ---------- alertas activas ---------- */
  function notifyOS(a) {
    try {
      if (document.visibilityState === 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
      var c = CAT[a.category] || ['⚠️', 'Incidente'];
      var n = new Notification('🚨 Alerta cerca de ti', {
        body: c[1] + ' a ' + (a.distance_m || '?') + ' m' + (a.hot ? ' · zona caliente' : ''),
        tag: 'av-alarm', requireInteraction: true
      });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (e) {}
  }
  function trigger(a) {
    var list = active();
    for (var i = 0; i < list.length; i++) if (list[i].id === a.id) return;
    list.push(a); jset(K_ACT, list);
    notifyOS(a);
    renderOverlay(); syncRinging();
  }
  function ackAll() {
    jset(K_ACT, []); st.localTest = false; st.compact = false; st.lastIds = '';
    ringStop(); renderOverlay();
  }

  /* ---------- pantalla de alarma ---------- */
  var ov = document.createElement('div');
  ov.className = 'av-alarm'; ov.hidden = true;
  ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-live', 'assertive');
  document.documentElement.appendChild(ov);
  function renderOverlay(force) {
    var list = active();
    if (!list.length) { ov.hidden = true; ov.innerHTML = ''; st.lastIds = ''; return; }
    var ids = list.map(function (a) { return a.id; }).join(',');
    if (!force && ids === st.lastIds && !ov.hidden) return; // sin cambios: no redibujar
    if (ids !== st.lastIds) { st.lastIds = ids; st.compact = false; }
    ov.innerHTML = '';
    ov.classList.toggle('compact', st.compact);
    var card = el('div', 'av-alarm-card');
    card.appendChild(el('div', 'av-alarm-pulse', '🚨'));
    card.appendChild(el('h2', '', list.length > 1 ? list.length + ' ALERTAS CERCA DE TI' : 'ALERTA CERCA DE TI'));
    list.slice(-3).reverse().forEach(function (a) {
      var c = CAT[a.category] || ['⚠️', 'Incidente'];
      var row = el('div', 'av-alarm-row');
      row.appendChild(el('strong', '', c[0] + ' ' + c[1] + ' · a ' + (a.distance_m || '?') + ' m'));
      row.appendChild(el('small', '', [ago(a.created_at), a.hot ? 'zona caliente' : ''].filter(Boolean).join(' · ')));
      card.appendChild(row);
    });
    var ack = el('button', 'av-alarm-ack', '✔ Ya vi la alerta'); ack.type = 'button';
    ack.addEventListener('click', ackAll);
    card.appendChild(ack);
    if (!st.compact) {
      var map = el('button', 'av-alarm-map', 'Ver en el mapa'); map.type = 'button';
      map.addEventListener('click', function () {
        st.compact = true;
        var m = document.querySelector('[data-page=map]'); if (m) m.click();
        renderOverlay(true);
      });
      card.appendChild(map);
      card.appendChild(el('p', 'av-alarm-hint', 'La alarma seguirá sonando hasta que marques que ya viste la alerta.'));
    }
    ov.appendChild(card);
    ov.hidden = false;
  }

  /* ---------- ubicación ---------- */
  function startWatch() {
    if (st.watchId !== null || !navigator.geolocation) return;
    try {
      st.watchId = navigator.geolocation.watchPosition(function (p) {
        st.loc = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
        st.error = '';
      }, function (e) {
        st.error = e && e.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación';
        if (e && e.code === 1) { st.perm = 'denied'; stopWatch(); }
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    } catch (e) {}
  }
  function stopWatch() {
    if (st.watchId !== null) { try { navigator.geolocation.clearWatch(st.watchId); } catch (e) {} st.watchId = null; }
  }
  function readPerm() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (r) {
          st.perm = r.state; r.onchange = function () { st.perm = r.state; };
        });
      }
    } catch (e) {}
  }

  /* ---------- consulta al servidor ---------- */
  function seenHas(id) { return jget(K_SEEN, []).indexOf(id) >= 0; }
  function seenAdd(id) { var s = jget(K_SEEN, []); s.push(id); jset(K_SEEN, s.slice(-150)); }
  function poll() {
    if (st.polling || !st.leader || !st.loc || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
    if (Date.now() - st.loc.t > 10 * 60000) return;
    st.polling = true;
    var started = new Date();
    var body = {
      p_lat: st.loc.lat, p_lng: st.loc.lng,
      p_radius_km: parseFloat(localStorage.getItem('av_radius') || '1.5') || 1.5,
      p_since: st.since || new Date(started.getTime() - 600000).toISOString()
    };
    var u = sessionUser(); if (u) body.p_exclude = u;
    var headers = { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_ANON_KEY };
    if (/^eyJ/.test(cfg.SUPABASE_ANON_KEY)) headers.Authorization = 'Bearer ' + cfg.SUPABASE_ANON_KEY;
    fetch(cfg.SUPABASE_URL + '/rest/v1/rpc/nearby_alerts', { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (arr) {
        st.error = '';
        (arr || []).forEach(function (a) { if (a && a.id && !seenHas(a.id)) { seenAdd(a.id); trigger(a); } });
        st.since = new Date(started.getTime() - 90000).toISOString();
      })
      .catch(function (e) { st.error = 'Sin conexión con el servidor de alertas'; })
      .then(function () { st.polling = false; st.lastPoll = Date.now(); });
  }

  /* ---------- una sola pestaña vigila (Web Locks) ---------- */
  function wantLeader(on) {
    if (on) {
      if (st.lockWanted) return;
      st.lockWanted = true;
      if (navigator.locks && navigator.locks.request) {
        navigator.locks.request('av-alarm-leader', function () {
          if (!st.lockWanted) return undefined;
          st.leader = true;
          return new Promise(function (res) { st.lockRelease = res; });
        });
      } else { st.leader = true; }
    } else {
      st.lockWanted = false; st.leader = false;
      if (st.lockRelease) { st.lockRelease(); st.lockRelease = null; }
      stopWatch();
      if (!st.localTest) ringStop();
    }
  }

  /* ---------- activación (necesita un toque del usuario) ---------- */
  function activate() {
    st.activated = true;
    try { localStorage.setItem(K_EN, '1'); } catch (e) {}
    unlockAudio();
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        var p = Notification.requestPermission(function () {});
        if (p && p.then) p.then(function () {});
      }
    } catch (e) {}
    startWatch();
    readPerm();
    tick();
  }
  function testAlarm() {
    unlockAudio();
    st.localTest = true;
    trigger({ id: 'prueba-' + Date.now(), category: 'robo', distance_m: 120, hot: true, created_at: new Date().toISOString() });
  }

  /* ---------- interfaz: aviso de activación y panel en Preferencias ---------- */
  var banner = null;
  function ensureBanner(show) {
    if (!show) { if (banner) { banner.remove(); banner = null; } return; }
    if (banner) return;
    banner = el('div', 'av-alarm-banner');
    banner.appendChild(el('span', '', '🔔 Activa la alarma por cercanía para que suene si hay una alerta cerca de ti.'));
    var b = el('button', 'btn btn-primary btn-sm', 'Activar'); b.type = 'button';
    b.addEventListener('click', activate);
    var x = el('button', 'av-alarm-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Cerrar');
    x.addEventListener('click', function () { st.bannerOff = true; ensureBanner(false); });
    banner.appendChild(b); banner.appendChild(x);
    document.body.appendChild(banner);
  }
  function statusLines() {
    var notif = ('Notification' in window) ? Notification.permission : 'denied';
    return [
      [st.leader && st.watchId !== null, st.leader ? (st.watchId !== null ? 'Vigilando alertas cerca de ti' : 'Esperando permiso de ubicación') : 'Otra pestaña está vigilando (o la vigilancia está apagada)'],
      [st.perm === 'granted', 'Permiso de ubicación' + (st.loc ? ' · precisión ±' + Math.round(st.loc.acc) + ' m' : '')],
      [audioReady(), audioReady() ? 'Sonido listo' : 'Sonido: se activa con tu primer toque en la página'],
      [notif === 'granted', 'Avisos del navegador (para cuando la pestaña esté oculta)']
    ];
  }
  function ensurePanel() {
    var pc = document.getElementById('pageContent');
    var panel = document.getElementById('avAlarmPanel');
    var want = pc && pc.dataset.view === 'settings' && loggedIn() && isVecino();
    if (!want) return;
    if (!panel) {
      panel = el('section', 'panel'); panel.id = 'avAlarmPanel';
      var head = el('div', 'panel-header'); var hd = el('div');
      hd.appendChild(el('h2', 'panel-title', '🚨 Alarma por cercanía'));
      hd.appendChild(el('p', 'form-help', 'Si alguien reporta una alerta dentro de tu radio, esta página hace sonar una sirena hasta que marques «Ya vi la alerta». Funciona mientras la página siga abierta (también en segundo plano).'));
      head.appendChild(hd); panel.appendChild(head);
      var row = el('label', 'toggle-row');
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = enabled();
      cb.addEventListener('change', function () { try { localStorage.setItem(K_EN, cb.checked ? '1' : '0'); } catch (e) {} tick(); });
      row.appendChild(cb); row.appendChild(el('span', '', ' Activar alarma por cercanía'));
      panel.appendChild(row);
      panel.appendChild(el('ul', 'av-alarm-status'));
      var actions = el('div', 'heading-actions');
      var a1 = el('button', 'btn btn-primary btn-sm', 'Activar / revisar permisos'); a1.type = 'button'; a1.addEventListener('click', activate);
      var a2 = el('button', 'btn btn-outline btn-sm', 'Probar alarma'); a2.type = 'button'; a2.addEventListener('click', testAlarm);
      actions.appendChild(a1); actions.appendChild(a2); panel.appendChild(actions);
      panel.appendChild(el('p', 'form-help', 'Consejo: en el celular, la página se pausa al apagar la pantalla. Para que suene siempre usa la app Android.'));
      pc.appendChild(panel);
    }
    var ul = panel.querySelector('.av-alarm-status'); ul.innerHTML = '';
    statusLines().forEach(function (l) { ul.appendChild(el('li', l[0] ? 'ok' : 'bad', (l[0] ? '✔ ' : '✖ ') + l[1])); });
    if (st.error) ul.appendChild(el('li', 'bad', '✖ ' + st.error));
  }

  /* ---------- ciclo principal ---------- */
  var wasOn = false;
  function tick() {
    var on = loggedIn() && isVecino() && enabled();
    wantLeader(on);
    if (!on) {
      ensureBanner(false);
      ov.hidden = true; st.lastIds = ''; // nunca mostrar la alarma sobre el inicio de sesión
      if (!loggedIn()) {
        if (wasOn) ackAll(); // cerró sesión: se apaga la alarma
        st.since = null; st.activated = false;
      }
      wasOn = false;
      return;
    }
    wasOn = true;
    if (st.leader && (st.perm === 'granted' || st.activated)) startWatch();
    ensureBanner(!st.bannerOff && st.perm !== 'granted' && !st.activated);
    syncRinging();
    renderOverlay();
    ensurePanel();
    if (st.leader && Date.now() - st.lastPoll >= POLL_MS) poll();
  }

  // El navegador solo permite sonido tras un toque del usuario: se desbloquea con el primero.
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (!audioReady()) unlockAudio(); }, { passive: true });
  });
  // Si otra pestaña marca «Ya vi la alerta», aquí también se silencia
  window.addEventListener('storage', function (e) { if (e.key === K_ACT) { renderOverlay(); syncRinging(); } });
  window.addEventListener('pagehide', function () { ringStop(); });
  readPerm();
  setInterval(tick, 2000);
  setTimeout(tick, 600);

  // Ayuda para pruebas
  window.avAlarmWeb = {
    debug: function () { return { leader: st.leader, ringing: st.ringing, audio: st.audio && st.audio.state, loc: st.loc, perm: st.perm, active: active().length, error: st.error }; },
    test: testAlarm, ack: ackAll
  };
})();
