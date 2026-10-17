import {ChatStore, parseToken, retryDelay} from './core.js?v=5';
import {scopeFor, archiveId, saveMessages, loadBefore, clearScope} from './archive.js?v=5';
const $ = id => document.getElementById(id);
let store = new ChatStore(), socket, token, retryTimer, retry = 0, generation = 0, intentional = false;
let lastChatAccount = '';
let active = '', logOnly = false, query = '', showSystems = true, pageSize = 250, frame = 0, demo = false, nearBottom = true;
let tabsSignature = '', notice = false, liveRenderTimer = 0, lastRenderAt = 0;
let archiveScope = '', archiveRows = [], archiveBefore = null, archiveMore = true, archiveLoading = false, archiveGeneration = 0;
let archivePending = [], archiveTimer, archiveWriting = Promise.resolve();
let historyEnabled = false;
try {historyEnabled = localStorage.getItem('acium-webchat-save-history') === 'yes';} catch {}
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
function savedTokenGet() {
  try {const saved=localStorage.getItem('acium-webchat-token');if(saved)return saved;} catch {}
  try {return sessionStorage.getItem('acium-webchat-token');} catch {return null;}
}
function savedTokenSet(value) {
  let persisted=false;
  try {value?localStorage.setItem('acium-webchat-token',value):localStorage.removeItem('acium-webchat-token');persisted=true;} catch {}
  try {
    if(value&&!persisted)sessionStorage.setItem('acium-webchat-token',value);
    else sessionStorage.removeItem('acium-webchat-token');
  } catch {}
}
let rejectedOpens=0;
function status(text, online = false) {
  $('status').textContent = text; $('status-dot').classList.toggle('online', online);
  $('mobile-connection').textContent = demo ? 'Eksempel' : online ? 'Online' : 'Offline';
  $('mobile-connection').classList.toggle('online',online); $('mobile-connection').title=text;
  $('settings-status').textContent=text; updateComposer();
}
function openWorkspace() { $('welcome').hidden = true; $('workspace').hidden = false; document.body.classList.add('chat-open'); updateViewport(); }
function isConnected() { return demo || socket?.readyState === WebSocket.OPEN; }
function updateComposer() {
  const name = $('send-as').value, ready = Boolean(name && isConnected());
  $('message').disabled = !name; $('send').disabled = !ready;
  $('send-hint').textContent = demo ? 'Eksempeltilstand · intet sendes til Netstationen.' : name ? `Du skriver som ${name}${isConnected() ? '' : ' · afventer forbindelse'}` : 'Vælg en bruger at skrive som.';
}
function choose(name, isLog = false) {
  active = name; logOnly = isLog; if(!isLog)lastChatAccount=name; resetArchiveView(); pageSize = 250; nearBottom = true; notice = false;
  if (name && store.tabs.has(name)) { store.tabs.get(name).unread = 0; $('send-as').value = name; }
  else if (!isLog) for (const tab of store.tabs.values()) tab.unread = 0;
  tabsSignature = ''; schedule(); updateComposer();
}
function accountButton(name) {
  const button = element('button', 'nav-item'); button.type = 'button';
  button.classList.toggle('active', active === name && !logOnly);
  const label=element('span','account-copy');label.append(element('span','account-name',name));
  const room=store.tabs.get(name)?.room;if(room?.name)label.append(element('span','account-room',room.name));
  button.append(element('span', 'avatar', name.slice(0,2).toUpperCase()),label);
  button.setAttribute('aria-pressed',String(active === name && !logOnly));
  const unread = store.tabs.get(name)?.unread;
  if (unread) button.append(element('span', 'badge', unread > 99 ? '99+' : String(unread)));
  button.addEventListener('click', () => choose(name)); return button;
}
function renderNavigation() {
  const signature = JSON.stringify([store.names, active, logOnly, [...store.tabs.values()].map(t => [t.unread,t.room?.name,t.room?.id])]);
  if (signature !== tabsSignature) {
    tabsSignature = signature;
    $('accounts').replaceChildren(...store.names.map(accountButton));
    const all = element('button', 'nav-item', 'Alle'); all.classList.toggle('active', !active && !logOnly); all.onclick = () => choose('');
    const log = element('button', 'nav-item', 'Log'); log.classList.toggle('active', logOnly); log.onclick = () => choose('', true);
    const scrollLeft=$('mobile-accounts').scrollLeft;
    $('mobile-accounts').replaceChildren(all, ...store.names.map(accountButton));
    $('mobile-accounts').scrollLeft=scrollLeft;
    $('all-button').classList.toggle('active', !active && !logOnly); $('log-button').classList.toggle('active', logOnly);
    $('account-count').textContent = store.names.length;
    const unread = [...store.tabs.values()].reduce((sum,t) => sum + t.unread, 0);
    $('total-unread').hidden = !unread; $('total-unread').textContent = unread > 99 ? '99+' : unread;
    document.title = `${unread ? `(${unread}) ` : ''}${active ? active+' · ' : ''}acium`;
    $('bottom-unread').hidden=!unread;
    for(const [id,selected] of [['bottom-chat',!logOnly],['bottom-log',logOnly]]) {
      $(id).classList.toggle('selected',selected);$(id).setAttribute('aria-pressed',String(selected));
    }
  }
  $('view-title').textContent = logOnly ? 'Hændelseslog' : active || 'Alle samtaler';
  $('view-caption').textContent = active ? 'DIN BRUGER' : 'DIT OVERBLIK';
  const room = store.tabs.get(active)?.room;
  if ($('rooms-dialog').open) renderRooms();
  $('view-subtitle').textContent = logOnly ? 'Markeringer og hændelser fra dine Acium-brugere.' : active ? room ? `${room.name}${room.id != null ? ` · Rum ${room.id}` : ''}` : '' : '';
  $('view-subtitle').hidden = !$('view-subtitle').textContent;
}
function schedule() { if (!document.hidden && !frame) frame = requestAnimationFrame(() => {frame = 0; render();}); }
function render() {
  lastRenderAt = performance.now();
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
      if (message.attention && (document.hidden || !visible || !nearBottom)) store.tab(message.account).unread++;
      if (visible && !nearBottom) notice = true;
    }
  }
  if(!document.hidden && !liveRenderTimer) liveRenderTimer=setTimeout(()=>{
    liveRenderTimer=0;if(document.hidden)return;
    if(nearBottom)schedule();
    else {lastRenderAt=performance.now();renderNavigation();$('new-messages').hidden=!notice;}
  },Math.max(0,120-(performance.now()-lastRenderAt)));
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
  let receivedData=false;
  socket.onopen = () => { if (current !== generation) return; status('Forbundet', true); };
  socket.onmessage = event => {
    if (current !== generation || typeof event.data !== 'string' || event.data.length > 8_000_000) return;
    try { const data = JSON.parse(event.data); receivedData=true; rejectedOpens=0; retry = 0; ingest(data); } catch { /* Ignore malformed protocol frames without logging private contents. */ }
  };
  socket.onerror = () => { if (current === generation) socket.close(); };
  socket.onclose = event => {
    if (current !== generation || intentional) return;
    if (!receivedData && event.code===1005 && ++rejectedOpens>=3) {
      disconnect(false);
      $('login-error').textContent='Ingen adgang til den gemte chat lige nu. Prøv igen eller indsæt et nyt link.';
      return;
    }
    if (!navigator.onLine) { status('Ingen internetforbindelse'); return; }
    const delay = retryDelay(retry++); status(`Afbrudt · prøver igen om ${Math.ceil(delay / 1000)} s`);
    retryTimer = setTimeout(connect, delay);
  };
}
function start(input) {
  const parsed = parseToken(input);
  demo = false; token = parsed; intentional = false; retry = 0; rejectedOpens=0; savedTokenSet(token); resetArchiveView();
  archiveScope = '';
  scopeFor(parsed).then(scope=>{if(token !== parsed)return; archiveScope = scope; if(historyEnabled) {for(const tab of store.tabs.values())for(const message of tab.messages)queueArchive(message);} schedule();});
  $('demo-label').hidden = true; $('chat-link').value = ''; $('login-error').textContent = '';
  openWorkspace(); connect(); schedule();
}
function disconnect(forget=true) {
  intentional = true; ++generation; clearTimeout(retryTimer); clearTimeout(liveRenderTimer); liveRenderTimer=0; if (socket) {socket.onclose = null; socket.close();} socket = null;
  flushArchive(); archiveScope = ''; resetArchiveView(); token = null; if(forget)savedTokenSet(null); $('resume-saved').hidden=!savedTokenGet(); store = new ChatStore(); active = ''; logOnly = false; query = ''; demo = false; tabsSignature = '';
  $('search').value = ''; $('message').value = ''; $('send-error').textContent = ''; $('workspace').hidden = true; $('welcome').hidden = false;
  document.title = 'acium · webchat'; document.body.classList.remove('chat-open'); for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close(); $('chat-link').focus();
}
$('connect-form').addEventListener('submit', event => {event.preventDefault(); try {start($('chat-link').value);} catch (error) {$('login-error').textContent = error.message;} });
$('disconnect').onclick = () => disconnect(); $('mobile-exit').onclick = () => disconnect();
$('resume-saved').onclick = () => {const saved=savedTokenGet();if(saved)start(saved);};
$('settings-reconnect').onclick = () => {retry=0;if(!demo)connect();};
$('reconnect').onclick = () => {retry = 0; if (!demo) connect();};
$('all-button').onclick = () => choose(''); $('log-button').onclick = () => choose('',true);
$('bottom-chat').onclick = () => choose(store.names.includes(lastChatAccount)?lastChatAccount:'',false);
$('bottom-log').onclick = () => choose('',true);
function openSheet(id) {
  if(id==='rooms-dialog')renderRooms();$(id).showModal();
  const button=$(id==='rooms-dialog'?'bottom-rooms':'bottom-settings');button.classList.add('selected');button.setAttribute('aria-pressed','true');
}
$('rooms-button').onclick = $('bottom-rooms').onclick = () => openSheet('rooms-dialog');
$('settings-button').onclick = $('bottom-settings').onclick = () => openSheet('settings-dialog');
for(const dialog of document.querySelectorAll('dialog.sheet')) {
  dialog.querySelector('.close-sheet').onclick = () => dialog.close();
  dialog.addEventListener('close',()=>{for(const id of ['bottom-rooms','bottom-settings']){$(id).classList.remove('selected');$(id).setAttribute('aria-pressed','false');}});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
}
$('search-toggle').onclick = () => {
  const open=$('workspace').classList.toggle('search-open');$('search-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('search').focus();
};
function updateViewport() {
  const height=Math.round(window.visualViewport?.height || window.innerHeight);
  document.documentElement.style.setProperty('--app-height',height+'px');
  document.body.classList.toggle('keyboard-open',Boolean(window.visualViewport && height < window.innerHeight-120));
  if(!$('workspace').hidden&&nearBottom)schedule();
}
window.visualViewport?.addEventListener('resize',updateViewport,{passive:true});
window.addEventListener('resize',updateViewport,{passive:true});
function renderRooms() {
  const initial=!$('room-cards').children.length, opened=new Set([...$('room-cards').querySelectorAll('details[open]')].map(el=>el.dataset.account));
  const cards=store.names.map(name=>{
    const tab=store.tabs.get(name), card=element('section','room-card'), header=element('div','room-card-header');
    const copy=element('div','room-card-copy');copy.append(element('strong','',name),element('span','',tab.room ? `${tab.room.name}${tab.room.id!=null?' · '+tab.room.id:''}` : 'Rumnavn afventes'));
    const open=element('button','soft-button','Åbn chat');open.onclick=()=>{choose(name);$('rooms-dialog').close();};
    header.append(element('span','avatar',name.slice(0,2).toUpperCase()),copy,open);card.append(header);
    const present=[...tab.presence.values()].filter(user=>user.present).sort((a,b)=>a.name.localeCompare(b.name,'da'));
    const details=element('details','room-people');details.dataset.account=name;details.open=opened.has(name)||(initial&&(active===name||store.names.length===1));
    details.append(element('summary','',`${tab.room?'Observeret i rummet':'Observeret i samtalen'} · ${present.length}`));
    const list=element('ul','people-list');
    for(const user of present) {
      const li=element('li'), copy=element('span','person-copy');copy.append(element('strong','',user.name),element('small','',user.name===name?'Din bruger':`Senest set ${timeFormat.format(user.time)}`));
      li.append(element('span','avatar',user.name.slice(0,2).toUpperCase()),copy);list.append(li);
    }
    if(!present.length)details.append(element('p','setting-note','Ingen brugere observeret endnu. Listen opdateres med nye beskeder og indgange.'));
    else details.append(list);
    card.append(details);return card;
  });
  $('room-cards').replaceChildren(...cards);
  if(!cards.length)$('room-cards').append(element('p','setting-note','Dine brugere vises, når Acium sender sine faner.'));
}
$('send-as').onchange = () => {if(active&&$('send-as').value!==active)choose($('send-as').value);else updateComposer();};
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
  if (nearBottom && notice) {notice = false; $('new-messages').hidden = true; for (const [name,tab] of store.tabs) if (!logOnly && (!active || name === active)) tab.unread = 0; renderNavigation();}
}, {passive:true});
$('new-messages').onclick = () => {nearBottom = true; notice = false; for (const [name,tab] of store.tabs) if (!logOnly && (!active || name === active)) tab.unread = 0; schedule();};
document.addEventListener('visibilitychange', () => {if (document.hidden) flushArchive(); if (!document.hidden) {if (nearBottom) for (const [name,tab] of store.tabs) if (!logOnly && (!active || name === active)) tab.unread = 0; schedule();}});
window.addEventListener('online', () => {retry = 0; connect();});
window.addEventListener('offline', () => {clearTimeout(retryTimer); status('Ingen internetforbindelse');});
window.addEventListener('pagehide', () => {flushArchive(); intentional = true; clearTimeout(retryTimer); socket?.close();});
window.addEventListener('pageshow', event => {if (event.persisted && token) {intentional = false; connect();}});
document.addEventListener('keydown', event => {if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('workspace').hidden) {event.preventDefault();$('workspace').classList.add('search-open');$('search-toggle').setAttribute('aria-expanded','true'); $('search').focus();}});
$('save-history').onchange = () => {
  historyEnabled = $('save-history').checked;
  try {localStorage.setItem('acium-webchat-save-history',historyEnabled?'yes':'no');} catch {}
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
function enterDemo() {resetArchiveView();
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
try {
  const saved=incoming||savedTokenGet();
  if(location.hash==='#demo'&&!saved)enterDemo();
  else if(saved)start(saved);
} catch {
  if(!incoming)savedTokenSet(null);
  $('resume-saved').hidden=!savedTokenGet();
  $('login-error').textContent='Linket kunne ikke åbnes. Indsæt dit webchat-link igen.';
}
