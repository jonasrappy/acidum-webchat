import {ChatStore, parseToken, retryDelay} from './core.js';
import {scopeFor, archiveId, saveMessages, loadBefore, clearScope} from './archive.js';
const $ = id => document.getElementById(id);
let store = new ChatStore(), socket, token, retryTimer, retry = 0, generation = 0, intentional = false;
let active = '', logOnly = false, query = '', showSystems = true, pageSize = 250, frame = 0, demo = false, nearBottom = true;
let tabsSignature = '', notice = false;
let archiveScope = '', archiveRows = [], archiveBefore = null, archiveMore = true, archiveLoading = false, archiveGeneration = 0;
let archivePending = [], archiveTimer, archiveWriting = Promise.resolve();
let historyEnabled = false;
try {historyEnabled = localStorage.getItem('stuen-save-history') === 'yes';} catch {}
$('save-history').checked = historyEnabled;
$('clear-history').hidden = !historyEnabled;
function resetArchiveView() {archiveRows = []; archiveBefore = null; archiveMore = true; archiveLoading = false; ++archiveGeneration; $('history-status').textContent = '';}
function queueArchive(message) {
  if (!historyEnabled || !archiveScope || demo) return;
  archivePending.push(message);
  if (archivePending.length >= 250) flushArchive();
  else if (!archiveTimer) archiveTimer = setTimeout(flushArchive, 500);
}
function flushArchive() {
  clearTimeout(archiveTimer); archiveTimer = null;
  const batch = archivePending.splice(0), scope = archiveScope;
  if (!scope || !batch.length) return archiveWriting;
  archiveWriting = archiveWriting.catch(()=>{}).then(()=>saveMessages(scope,batch)).catch(()=>{$('history-status').textContent = 'Lokal historik kunne ikke gemmes. Chatten fortsætter.';});
  return archiveWriting;
}
async function olderMessages() {
  if (archiveLoading || loadingOlder) return;
  const retained = combinedMessages();
  if (retained.length > pageSize) {pageSize += 250; nearBottom = false; loadingOlder = true; schedule(); return;}
  if (!historyEnabled || !archiveScope || !archiveMore || demo) return;
  archiveLoading = true; const view = archiveGeneration;
  $('history-status').textContent = 'Henter ældre beskeder fra denne enhed…';
  try {
    await flushArchive();
    if (view !== archiveGeneration) return;
    if (!archiveBefore && retained.length) {
      const oldest = retained.reduce((a,b)=>a.time<b.time?a:b);
      archiveBefore = {time:oldest.time,archiveId:archiveId(archiveScope,oldest)};
    }
    const result = await loadBefore(archiveScope,active,archiveBefore,{logOnly,query,systems:showSystems});
    if (view !== archiveGeneration) return;
    archiveBefore = result.before; archiveMore = result.hasMore;
    archiveRows = [...result.messages,...archiveRows].slice(-10000);
    pageSize += 250; nearBottom = false; loadingOlder = true;
    $('history-status').textContent = !archiveMore ? 'Begyndelsen af den lokalt gemte historik.' : '';
    schedule();
  } catch {if(view === archiveGeneration) $('history-status').textContent = 'Browseren kunne ikke hente den lokale historik.';}
  finally {if(view === archiveGeneration) archiveLoading = false;}
}
function combinedMessages() {
  const current = store.messages(active,logOnly,query,showSystems), seen = new Set(current.map(m=>m.account+'\0'+m.key));
  return [...archiveRows.filter(m=>!seen.has(m.account+'\0'+m.key)),...current].sort((a,b)=>a.time-b.time||a.account.localeCompare(b.account)||a.key.localeCompare(b.key));
}
const timeFormat = new Intl.DateTimeFormat('da-DK', {hour: '2-digit', minute: '2-digit'});
const dateFormat = new Intl.DateTimeFormat('da-DK', {day: 'numeric', month: 'long', year: 'numeric'});
function element(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
function sessionGet() { try { return sessionStorage.getItem('stuen-token'); } catch { return null; } }
function sessionSet(value) { try { value ? sessionStorage.setItem('stuen-token', value) : sessionStorage.removeItem('stuen-token'); } catch {} }
function status(text, online = false) { $('status').textContent = text; $('status-dot').classList.toggle('online', online); updateComposer(); }
function openWorkspace() { $('welcome').hidden = true; $('workspace').hidden = false; }
function isConnected() { return demo || socket?.readyState === WebSocket.OPEN; }
function updateComposer() {
  const name = $('send-as').value, ready = Boolean(name && isConnected());
  $('message').disabled = !ready; $('send').disabled = !ready;
  $('send-hint').textContent = demo ? 'Eksempeltilstand · intet sendes til Netstationen.' : name ? `Du skriver som ${name}${isConnected() ? '' : ' · afventer forbindelse'}` : 'Vælg en bruger at skrive som.';
}
function choose(name, isLog = false) {
  active = name; logOnly = isLog; resetArchiveView(); pageSize = 250; nearBottom = true; notice = false;
  if (name && store.tabs.has(name)) { store.tabs.get(name).unread = 0; $('send-as').value = name; }
  else if (!isLog) for (const tab of store.tabs.values()) tab.unread = 0;
  tabsSignature = ''; schedule(); updateComposer();
}
function accountButton(name) {
  const button = element('button', 'nav-item'); button.type = 'button';
  button.classList.toggle('active', active === name && !logOnly);
  button.append(element('span', 'avatar', name.slice(0,2).toUpperCase()), element('span', '', name));
  const unread = store.tabs.get(name)?.unread;
  if (unread) button.append(element('span', 'badge', unread > 99 ? '99+' : String(unread)));
  button.addEventListener('click', () => choose(name)); return button;
}
function renderNavigation() {
  const signature = JSON.stringify([store.names, active, logOnly, [...store.tabs.values()].map(t => t.unread)]);
  if (signature !== tabsSignature) {
    tabsSignature = signature;
    $('accounts').replaceChildren(...store.names.map(accountButton));
    const all = element('button', 'nav-item', 'Alle'); all.classList.toggle('active', !active && !logOnly); all.onclick = () => choose('');
    const log = element('button', 'nav-item', 'Log'); log.classList.toggle('active', logOnly); log.onclick = () => choose('', true);
    $('mobile-accounts').replaceChildren(all, log, ...store.names.map(accountButton));
    $('all-button').classList.toggle('active', !active && !logOnly); $('log-button').classList.toggle('active', logOnly);
    $('account-count').textContent = store.names.length;
    const unread = [...store.tabs.values()].reduce((sum,t) => sum + t.unread, 0);
    $('total-unread').hidden = !unread; $('total-unread').textContent = unread > 99 ? '99+' : unread;
    document.title = `${unread ? `(${unread}) ` : ''}${active || 'Stuen'} · Let webchat`;
  }
  $('view-title').textContent = logOnly ? 'Hændelseslog' : active || 'Alle samtaler';
  $('view-caption').textContent = active ? 'DIN BRUGER' : 'DIT OVERBLIK';
  const room = store.tabs.get(active)?.room;
  $('view-subtitle').textContent = logOnly ? 'Markeringer og hændelser fra dine Acium-brugere.' : active ? room ? `${room.name}${room.id != null ? ` · Rum ${room.id}` : ''}` : 'Samtalen for denne bruger.' : 'Beskeder fra alle dine brugere, samlet ét sted.';
}
function schedule() { if (!document.hidden && !frame) frame = requestAnimationFrame(() => {frame = 0; render();}); }
function render() {
  renderNavigation();
  const timeline = $('timeline'), before = timeline.scrollHeight, top = timeline.scrollTop;
  const messages = combinedMessages(), visible = messages.slice(-pageSize);
  const fragment = document.createDocumentFragment(); let day = '';
  for (const message of visible) {
    const nextDay = dateFormat.format(message.time);
    if (day !== nextDay) { fragment.append(element('div','day-divider', nextDay)); day = nextDay; }
    const row = element('article', `message${message.system ? ' system' : ''}${message.private ? ' private' : ''}`);
    row.dataset.id = message.id;
    row.append(element('span','avatar',message.system ? '·' : (message.name || '?').slice(0,2).toUpperCase()));
    const body = element('div'), head = element('div','message-head');
    if (message.name) head.append(element('span','message-name',message.name));
    const time = element('time', '', timeFormat.format(message.time)); time.dateTime = new Date(message.time).toISOString(); head.append(time);
    if (!active) head.append(element('span','message-account',message.account));
    body.append(head,element('p','message-text',message.text)); row.append(body); fragment.append(row);
  }
  // Replace only the visible, bounded window; never build a hidden DOM for each account.
  $('messages').replaceChildren(fragment); $('empty').hidden = Boolean(visible.length); $('older').hidden = messages.length <= pageSize && !(historyEnabled && archiveScope && archiveMore && !demo);
  $('empty-text').textContent = query ? 'Ingen beskeder matcher din søgning i den indlæste historik.' : logOnly ? 'Ingen markerede hændelser endnu.' : !store.names.length ? 'Venter på brugerfaner fra Acium. Kontrollér, at programmet kører med webchat slået til.' : 'Dine beskeder vises, så snart Acium sender dem.';
  if (nearBottom) timeline.scrollTop = timeline.scrollHeight;
  else if (loadingOlder) timeline.scrollTop = top + timeline.scrollHeight - before;
  else timeline.scrollTop = top;
  loadingOlder = false;
  $('new-messages').hidden = !notice || nearBottom;
}
let loadingOlder = false;
function updateTabs(names) {
  store.setTabs(names);
  if (active && !store.names.includes(active)) active = '';
  const previous = $('send-as').value;
  $('send-as').replaceChildren(element('option', '', 'Vælg bruger'), ...store.names.map(name => {const option = element('option','',name); option.value = name; return option;}));
  $('send-as').firstElementChild.value = '';
  $('send-as').value = store.names.includes(previous) ? previous : store.names[0] || '';
  updateComposer();
}
function ingest(payload) {
  const events = Array.isArray(payload) ? payload : [payload];
  for (const event of events.slice(0,10000)) {
    if (Array.isArray(event?.tabs)) {
      updateTabs(event.tabs);
      for (const name of store.names) if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({name, lastLine: store.tab(name).lastLine}));
    } else {
      const message = store.add(event);
      if (!message) continue;
      queueArchive(message);
      const visible = (!active || active === message.account) && (!logOnly || message.log);
      if (document.hidden || !visible || !nearBottom) store.tab(message.account).unread++;
      if (visible && !nearBottom) notice = true;
    }
  }
  if (nearBottom) schedule();
  else if (!document.hidden) {renderNavigation(); $('new-messages').hidden = !notice;}
}
function connect() {
  if (!token || intentional || demo) return;
  clearTimeout(retryTimer);
  if (!navigator.onLine) { status('Ingen internetforbindelse'); return; }
  const current = ++generation;
  if (socket) { socket.onclose = null; socket.close(); }
  status(retry ? 'Forbinder igen…' : 'Forbinder…');
  try { socket = new WebSocket(`wss://ws0.acium.app/chat/ws?token=${encodeURIComponent(token)}`); }
  catch { status('Kunne ikke starte forbindelsen'); return; }
  socket.onopen = () => { if (current !== generation) return; status('Forbundet', true); };
  socket.onmessage = event => {
    if (current !== generation || typeof event.data !== 'string' || event.data.length > 8_000_000) return;
    try { const data = JSON.parse(event.data); retry = 0; ingest(data); } catch { /* Ignore malformed protocol frames without logging private contents. */ }
  };
  socket.onerror = () => { if (current === generation) socket.close(); };
  socket.onclose = () => {
    if (current !== generation || intentional) return;
    if (!navigator.onLine) { status('Ingen internetforbindelse'); return; }
    const delay = retryDelay(retry++); status(`Afbrudt · prøver igen om ${Math.ceil(delay / 1000)} s`);
    retryTimer = setTimeout(connect, delay);
  };
}
function start(input) {
  const parsed = parseToken(input);
  demo = false; token = parsed; intentional = false; retry = 0; sessionSet(token); resetArchiveView();
  archiveScope = '';
  scopeFor(parsed).then(scope=>{if(token !== parsed)return; archiveScope = scope; if(historyEnabled) {for(const tab of store.tabs.values())for(const message of tab.messages)queueArchive(message);} schedule();});
  $('demo-label').hidden = true; $('chat-link').value = ''; $('login-error').textContent = '';
  openWorkspace(); connect(); schedule();
}
function disconnect() {
  intentional = true; ++generation; clearTimeout(retryTimer); if (socket) {socket.onclose = null; socket.close();} socket = null;
  flushArchive(); archiveScope = ''; resetArchiveView(); token = null; sessionSet(null); store = new ChatStore(); active = ''; logOnly = false; query = ''; demo = false; tabsSignature = '';
  $('search').value = ''; $('message').value = ''; $('send-error').textContent = ''; $('workspace').hidden = true; $('welcome').hidden = false;
  document.title = 'Stuen · Let webchat'; $('chat-link').focus();
}
$('connect-form').addEventListener('submit', event => {event.preventDefault(); try {start($('chat-link').value);} catch (error) {$('login-error').textContent = error.message;} });
$('disconnect').onclick = disconnect; $('mobile-exit').onclick = disconnect;
$('reconnect').onclick = () => {retry = 0; if (!demo) connect();};
$('all-button').onclick = () => choose(''); $('log-button').onclick = () => choose('',true);
$('send-as').onchange = updateComposer;
$('composer').onsubmit = event => {
  event.preventDefault(); const name = $('send-as').value, text = $('message').value;
  if (!text.trim() || !store.names.includes(name)) return;
  $('send-error').textContent = '';
  if (demo) {ingest({me:{name}, user:{name}, type:'text', text, time:Date.now()}); $('message').value = ''; return;}
  if (!socket || socket.readyState !== WebSocket.OPEN) {$('send-error').textContent = 'Forbindelsen er afbrudt. Din besked er stadig i feltet.'; return;}
  try {socket.send(JSON.stringify({name,say:text})); $('message').value = ''; $('message').focus();}
  catch {$('send-error').textContent = 'Beskeden kunne ikke sendes. Prøv igen, når forbindelsen er tilbage.';}
};
let searchTimer;
$('search').oninput = () => {clearTimeout(searchTimer); searchTimer = setTimeout(() => {query = $('search').value.trim(); resetArchiveView(); pageSize = 250; nearBottom = true; $('clear-search').hidden = !query; schedule();},120);};
$('clear-search').onclick = () => {$('search').value = ''; $('search').dispatchEvent(new Event('input'));};
$('show-events').onchange = () => {showSystems = $('show-events').checked; resetArchiveView(); pageSize = 250; schedule();};
$('older').onclick = olderMessages;
$('timeline').addEventListener('scroll', () => {
  if ($('timeline').scrollTop < 100 && $('timeline').scrollHeight > $('timeline').clientHeight + 100) olderMessages();
  nearBottom = $('timeline').scrollHeight - $('timeline').scrollTop - $('timeline').clientHeight < 60;
  if (nearBottom && notice) {notice = false; $('new-messages').hidden = true; for (const [name,tab] of store.tabs) if (!active || name === active) tab.unread = 0; renderNavigation();}
}, {passive:true});
$('new-messages').onclick = () => {nearBottom = true; notice = false; for (const [name,tab] of store.tabs) if (!active || name === active) tab.unread = 0; schedule();};
document.addEventListener('visibilitychange', () => {if (document.hidden) flushArchive(); if (!document.hidden) {if (nearBottom) for (const [name,tab] of store.tabs) if (!active || name === active) tab.unread = 0; schedule();}});
window.addEventListener('online', () => {retry = 0; connect();});
window.addEventListener('offline', () => {clearTimeout(retryTimer); status('Ingen internetforbindelse');});
window.addEventListener('pagehide', () => {flushArchive(); intentional = true; clearTimeout(retryTimer); socket?.close();});
window.addEventListener('pageshow', event => {if (event.persisted && token) {intentional = false; connect();}});
document.addEventListener('keydown', event => {if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('workspace').hidden) {event.preventDefault(); $('search').focus();}});
// The token travels in the URL fragment, which is never sent to the hosting server.
const appURL = new URL('./', location.href); appURL.hash = ''; appURL.search = '';
const bookmarkCode = `(()=>{if(location.hostname!=='acium.app'||location.pathname!=='/chat'){alert('Åbn din Acium-webchat først.');return}const t=new URLSearchParams(location.search).get('token');if(!t){alert('Denne side mangler et webchat-token.');return}window.open(${JSON.stringify(appURL.href)}+'#token='+encodeURIComponent(t),'_blank','noopener,noreferrer')})()`;
$('bookmarklet').href = 'javascript:' + encodeURIComponent(bookmarkCode);
$('bookmarklet').onclick = event => {event.preventDefault(); $('bookmarklet').textContent = 'Træk genvejen til bogmærkelinjen ↑';};
$('save-history').onchange = () => {
  historyEnabled = $('save-history').checked;
  try {localStorage.setItem('stuen-save-history',historyEnabled?'yes':'no');} catch {}
  $('clear-history').hidden = !historyEnabled; resetArchiveView();
  if (historyEnabled) {for(const tab of store.tabs.values())for(const message of tab.messages)queueArchive(message);}
  else {clearTimeout(archiveTimer);archiveTimer=null;archivePending=[];}
  schedule();
};
$('clear-history').onclick = async () => {
  if (!archiveScope || demo) return;
  $('clear-history').disabled = true;
  try {await flushArchive(); await clearScope(archiveScope); resetArchiveView(); $('history-status').textContent = 'Den gemte historik er slettet. Nye beskeder gemmes, hvis “Gem historik” er valgt.';schedule();}
  catch {$('history-status').textContent = 'Historikken kunne ikke slettes.';}
  finally {$('clear-history').disabled = false;}
};
$('demo-button').onclick = () => {resetArchiveView();
  demo = true; intentional = true; store = new ChatStore(); updateTabs(['Nova','Milo']); openWorkspace(); $('demo-label').hidden = false; status('Eksempeltilstand',true);
  const now = Date.now();
  const examples = [
    {name:'Nova',type:'room',room:{id:12,name:'Torvet'}},
    {name:'Nova',user:'Alma',text:'Er der nogen, der er klar på en tur rundt i byen? ☀'},
    {name:'Milo',type:'room',room:{id:7,name:'Caféen'}},
    {name:'Nova',user:'Nova',text:'Ja! Jeg er lige landet på torvet.'},
    {name:'Milo',user:'Elliot',text:'Der er kaffe på kanden. Bare kom forbi.'},
    {name:'Nova',type:'join',user:'Luna'},
    {name:'Nova',user:'Luna',text:'Hej alle sammen 👋'},
    {name:'Milo',user:'Milo',text:'Det lyder som en ret god plan.'},
    {name:'Nova',user:'Alma',text:'Vi mødes ved springvandet om fem minutter.'},
  ];
  ingest(examples.map((e,i) => ({me:{name:e.name},user:{name:e.user||e.name},type:e.type||'text',text:e.text,room:e.room,time:now-(examples.length-i)*60000})));
};
const fragment = new URLSearchParams(location.hash.slice(1)), incoming = fragment.get('token');
if (incoming) history.replaceState(null,'',location.pathname + location.search);
try {const saved = incoming || sessionGet(); if (saved) start(saved);} catch {sessionSet(null); $('login-error').textContent = 'Linket kunne ikke åbnes. Indsæt dit webchat-link igen.';}
