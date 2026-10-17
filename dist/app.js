import {ChatStore, parseToken, retryDelay, messageAttention, messageLinks, matchesMode} from './core.js?v=8';
import {LocalData, exportText} from './local-data.js?v=8';
import {viewportGeometry} from './viewport.js?v=10';
import {mentionQuery,mentionSuggestions,completeMention} from './mentions.js?v=10';
import {scopeFor, archiveId, saveMessages, loadBefore, clearScope} from './archive.js?v=8';
const $ = id => document.getElementById(id);
let store = new ChatStore(), socket, token, retryTimer, retry = 0, generation = 0, intentional = false;
let lastChatAccount = '', localData=null, draftAccount='', draftTimer;
let mode='all', person='', selectedPerson=null, selectedMessage=null;
const emptyTerms=[];
let active = '', logOnly = false, query = '', showSystems = true, pageSize = 250, frame = 0, demo = false, nearBottom = true;
let tabsSignature = '', notice = false, liveRenderTimer = 0, lastRenderAt = 0;
let incomingViewDirty=false,incomingNavDirty=false,filterSignature='',headerSignature='',roomsSignature='';
const renderedRows=new Map();
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
  if (mode==='saved' || !historyEnabled || !archiveScope || !archiveMore || demo) return;
  archiveLoading = true; const view = archiveGeneration;
  $('history-status').textContent = 'Henter ældre beskeder fra denne enhed…';
  try {
    await flushArchive();
    if (view !== archiveGeneration) return;
    if (!archiveBefore && retained.length) {
      const oldest = retained.reduce((a,b)=>a.time<b.time?a:b);
      archiveBefore = {time:oldest.time,archiveId:archiveId(archiveScope,oldest)};
    }
    const result = await loadBefore(archiveScope,active,archiveBefore,{logOnly:false,query,systems:showSystems,accept:viewAccept});
    if (view !== archiveGeneration) return;
    archiveBefore = result.before; archiveMore = result.hasMore;
    archiveRows = [...result.messages,...archiveRows].slice(-10000);
    pageSize += 250; nearBottom = false; loadingOlder = true;
    $('history-status').textContent = !archiveMore ? 'Begyndelsen af den lokalt gemte historik.' : '';
    schedule();
  } catch {if(view === archiveGeneration) $('history-status').textContent = 'Browseren kunne ikke hente den lokale historik.';}
  finally {if(view === archiveGeneration) archiveLoading = false;}
}
function termsFor(account){return localData?.triggers.get(account)||emptyTerms;}
function viewAccept(message){
  const terms=termsFor(message.account);
  if(logOnly&&!message.log&&!messageAttention(message,terms))return false;
  if(person&&message.name!==person)return false;
  if(mode==='saved'&&!localData?.isSaved(message))return false;
  return matchesMode(message,mode,terms);
}
function canClearAttention(){return ['all','mentions'].includes(mode)&&!person&&!query&&!document.querySelector('dialog[open]');}
function combinedMessages() {
  const current=store.messages(active,false,query,showSystems), seen=new Set(current.map(m=>m.account+'\0'+m.key));
  const archived=mode==='saved'?[...(localData?.saved.values()||[])]:archiveRows;
  const search=query.toLocaleLowerCase('da');
  return [...archived.filter(m=>!seen.has(m.account+'\0'+m.key)),...current]
    .filter(m=>(!active||m.account===active)&&(showSystems||!m.system)&&(!search||`${m.account} ${m.name} ${m.text}`.toLocaleLowerCase('da').includes(search))&&viewAccept(m))
    .sort((a,b)=>a.time-b.time||a.account.localeCompare(b.account)||a.key.localeCompare(b.key));
}
function saveDraft(){clearTimeout(draftTimer);if(localData&&draftAccount)localData.setDraft(draftAccount,$('message').value);}
function refreshLimit(){const length=$('message').value.length;$('message-limit').hidden=length<80;$('message-limit').textContent=length+'/100';}
function clearDraft(){hideMentions();$('message').value='';if(localData&&draftAccount)localData.setDraft(draftAccount,'');refreshLimit();}
function filterChanged(){resetArchiveView();pageSize=250;nearBottom=true;schedule();}
function renderFilters(){
  const signature=mode+'\0'+person;if(signature===filterSignature)return;filterSignature=signature;
  $('workspace').classList.toggle('filtered',mode!=='all'||Boolean(person));
  for(const button of document.querySelectorAll('#view-filters [data-mode]')){const selected=button.dataset.mode===mode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));}
  $('person-filter').hidden=!person;$('person-filter').textContent=person+' ×';
  $('search-toggle').classList.toggle('has-filter',mode!=='all'||Boolean(person));
}
function openPerson(name,account){selectedPerson={name,account};$('person-title').textContent=name;$('person-account').textContent=account;$('person-dialog').showModal();}
function openMessage(message){selectedMessage=message;$('message-preview').textContent=message.text;$('message-action-status').textContent='';$('save-message').textContent=localData?.isSaved(message)?'Fjern fra gemte':'Gem besked';$('message-dialog').showModal();}
function appendTextLinks(parent,text){
  let offset=0;
  for(const link of messageLinks(text)){const at=text.indexOf(link,offset);if(at<offset)continue;parent.append(document.createTextNode(text.slice(offset,at)));const a=element('a','',link);a.href=link;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);offset=at+link.length;}
  parent.append(document.createTextNode(text.slice(offset)));
}
function updateTriggerEditor(){const name=$('trigger-account').value;$('trigger-words').value=termsFor(name).join(', ');$('trigger-status').textContent='Gælder kun på denne enhed. Medsendte markeringer virker fortsat.';}
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
function openWorkspace() { $('welcome').hidden = true; $('workspace').hidden = false; document.body.classList.add('chat-open'); document.documentElement.classList.add('chat-open'); updateViewport(); }
function isConnected() { return demo || socket?.readyState === WebSocket.OPEN; }
function updateComposer() {
  const name = $('send-as').value, ready = Boolean(name && isConnected());
  if(draftAccount!==name){saveDraft();draftAccount=name;dismissedMention='';$('message').value=localData?.draft(name)||'';refreshLimit();hideMentions();}
  $('message').disabled = !name; $('send').disabled = !ready;
  $('send-hint').textContent = demo ? 'Eksempeltilstand · intet sendes til chatten.' : name ? `Du skriver som ${name}${isConnected() ? '' : ' · afventer forbindelse'}` : 'Vælg en bruger at skrive som.';
}
function choose(name, isLog = false) {
  saveDraft();if(isLog){mode='all';person='';}else if(active!==name)person='';
  active = name; logOnly = isLog; if(!isLog)lastChatAccount=name; resetArchiveView(); pageSize = 250; nearBottom = true; notice = false;
  if (name && store.tabs.has(name)) { if(canClearAttention())store.tabs.get(name).unread = 0; $('send-as').value = name; }
  else if (canClearAttention()) for (const tab of store.tabs.values()) tab.unread = 0;
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
  renderFilters();
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
    document.title = `${unread ? `(${unread}) ` : ''}${active ? active+' · ' : ''}acidum`;
    $('bottom-unread').hidden=!unread;
    for(const [id,selected] of [['bottom-chat',!logOnly],['bottom-log',logOnly]]) {
      $(id).classList.toggle('selected',selected);$(id).setAttribute('aria-pressed',String(selected));
    }
  }
  const room=store.tabs.get(active)?.room;
  const header=JSON.stringify([active,logOnly,room?.name,room?.id]);
  if(header!==headerSignature){
    headerSignature=header;
    $('view-title').textContent=logOnly?'Hændelseslog':active||'Alle samtaler';
    $('view-caption').textContent=active?'DIN BRUGER':'DIT OVERBLIK';
    $('view-subtitle').textContent=logOnly?'Markeringer og hændelser fra dine acidum-brugere.':room?`${room.name}${room.id!=null?' · Rum '+room.id:''}`:'';
    $('view-subtitle').hidden=!$('view-subtitle').textContent;
  }
  if($('rooms-dialog').open)renderRooms();
}
function schedule() { if (!document.hidden && !frame) frame = requestAnimationFrame(() => {frame = 0; render();}); }
function render() {
  lastRenderAt = performance.now();
  if(nearBottom&&canClearAttention())for(const [name,tab]of store.tabs)if(!active||active===name)tab.unread=0;
  renderNavigation();
  const timeline = $('timeline'), before = timeline.scrollHeight, top = timeline.scrollTop;
  const messages = combinedMessages(), visible = messages.slice(-pageSize);
  const desired=[];let day='';
  for(const message of visible){
    const nextDay=dateFormat.format(message.time);
    if(day!==nextDay){desired.push({key:'day:'+nextDay,day:nextDay});day=nextDay;}
    desired.push({key:JSON.stringify([message.account,message.key]),message});
  }
  const keys=new Set(desired.map(item=>item.key));
  // Drop only rows that leave the visible window. Unchanged rows keep their DOM and selection.
  for(const [key,node]of renderedRows)if(!keys.has(key)){node.remove();renderedRows.delete(key);}
  const container=$('messages');let cursor=container.firstChild;
  for(const item of desired){
    let node=renderedRows.get(item.key);
    if(!node){node=item.message?createMessageRow(item.message):element('div','day-divider',item.day);renderedRows.set(item.key,node);}
    if(item.message)patchMessageRow(node,item.message);
    if(node===cursor)cursor=cursor.nextSibling;else container.insertBefore(node,cursor);
  }
  $('empty').hidden=Boolean(visible.length);$('older').hidden=messages.length<=pageSize&&!(mode!=='saved'&&historyEnabled&&archiveScope&&archiveMore&&!demo);
  $('empty-text').textContent = query ? 'Ingen beskeder matcher din søgning i den indlæste historik.' : logOnly ? 'Ingen markerede hændelser endnu.' : !store.names.length ? 'Venter på brugerfaner fra acidum. Kontrollér, at programmet kører med webchat slået til.' : 'Dine beskeder vises, så snart acidum sender dem.';
  if (nearBottom) timeline.scrollTop = timeline.scrollHeight;
  else if (loadingOlder) timeline.scrollTop = top + timeline.scrollHeight - before;
  else timeline.scrollTop = top;
  loadingOlder = false;
  $('new-messages').hidden = !notice || nearBottom;
}
function createMessageRow(message){
  const row=element('article',`message${message.system?' system':''}${message.private?' private':''}`);row.dataset.id=message.id;
  row.append(element('span','avatar',message.system?'·':(message.name||'?').slice(0,2).toUpperCase()));
  const body=element('div'),head=element('div','message-head');
  if(message.name){const name=element('button','message-name',message.name);name.type='button';name.onclick=()=>openPerson(message.name,message.account);head.append(name);}
  const action=element('button','message-time');action.type='button';action.setAttribute('aria-label','Beskedhandlinger');
  const time=element('time','',timeFormat.format(message.time));time.dateTime=new Date(message.time).toISOString();action.append(time);action.onclick=()=>openMessage(message);
  const star=element('span','saved-marker','★'),account=element('span','message-account',message.account);
  head.append(action,star,account);row._star=star;row._account=account;
  const text=element('p','message-text');appendTextLinks(text,message.text);body.append(head,text);row.append(body);return row;
}
function patchMessageRow(row,message){
  row.classList.toggle('attention',messageAttention(message,termsFor(message.account)));
  const saved=Boolean(localData?.isSaved(message));if(row._star.hidden===saved)row._star.hidden=!saved;
  if(row._account.hidden!==Boolean(active))row._account.hidden=Boolean(active);
}
let loadingOlder = false;
function updateTabs(names) {
  store.setTabs(names);
  if (active && !store.names.includes(active)) active = '';
  const previous = $('send-as').value;
  $('send-as').replaceChildren(element('option', '', 'Vælg bruger'), ...store.names.map(name => {const option = element('option','',name); option.value = name; return option;}));
  $('send-as').firstElementChild.value = '';
  $('send-as').value = store.names.includes(previous) ? previous : store.names[0] || '';
  const triggerName=$('trigger-account').value;
  $('trigger-account').replaceChildren(...store.names.map(name=>{const option=element('option','',name);option.value=name;return option;}));
  $('trigger-account').value=store.names.includes(triggerName)?triggerName:store.names[0]||'';
  updateComposer();
}
function ingest(payload) {
  const events = Array.isArray(payload) ? payload : [payload];
  for (const event of events.slice(0,10000)) {
    if (Array.isArray(event?.tabs)) {
      updateTabs(event.tabs);incomingViewDirty=true;incomingNavDirty=true;
      for (const name of store.names) if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({name, lastLine: store.tab(name).lastLine}));
    } else {
      const message = store.add(event);
      if (!message) continue;
      queueArchive(message);
      const visible = !document.querySelector('dialog[open]') && (!active || active === message.account) && viewAccept(message) && (!query||`${message.account} ${message.name} ${message.text}`.toLocaleLowerCase('da').includes(query.toLocaleLowerCase('da')));
      if (message.attention && (document.hidden || !visible || !nearBottom)){store.tab(message.account).unread++;incomingNavDirty=true;}
      if(visible&&(showSystems||!message.system))incomingViewDirty=true;
      if(message.type==='room'||$('rooms-dialog').open)incomingNavDirty=true;
      if (visible && !nearBottom) notice = true;
    }
  }
  if(!document.hidden && !liveRenderTimer) liveRenderTimer=setTimeout(()=>{
    liveRenderTimer=0;if(document.hidden)return;
    const viewDirty=incomingViewDirty,navDirty=incomingNavDirty;incomingViewDirty=false;incomingNavDirty=false;
    if(viewDirty&&nearBottom)schedule();
    else {lastRenderAt=performance.now();if(navDirty)renderNavigation();$('new-messages').hidden=!notice;}
    if(!$('mention-menu').hidden)refreshMentions();
  },Math.max(0,80-(performance.now()-lastRenderAt)));
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
    for(const tab of store.tabs.values())tab.rosterComplete=false;
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
  localData=null;archiveScope = '';
  scopeFor(parsed).then(scope=>{if(token !== parsed)return; archiveScope = scope;
    let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw new Error('Unavailable');}};}
    localData=new LocalData(storage,scope);
    for(const [name,terms]of localData.triggers)store.setTriggers(name,terms);
    const current=$('send-as').value;if($('message').value)localData.setDraft(current,$('message').value);else $('message').value=localData.draft(current);refreshLimit();updateTriggerEditor(); if(historyEnabled) {for(const tab of store.tabs.values())for(const message of tab.messages)queueArchive(message);} schedule();});
  $('demo-label').hidden = true; $('chat-link').value = ''; $('login-error').textContent = '';
  openWorkspace(); connect(); schedule();
}
function disconnect(forget=true) {
  saveDraft();localData=null;draftAccount='';mode='all';person='';hideMentions();renderedRows.clear();$('messages').replaceChildren();$('room-cards').replaceChildren();roomsSignature='';headerSignature='';filterSignature='';selectedPerson=null;selectedMessage=null;$('message-preview').textContent='';incomingViewDirty=false;incomingNavDirty=false;
  intentional = true; ++generation; clearTimeout(retryTimer); clearTimeout(liveRenderTimer); liveRenderTimer=0; if (socket) {socket.onclose = null; socket.close();} socket = null;
  flushArchive(); archiveScope = ''; resetArchiveView(); token = null; if(forget)savedTokenSet(null); $('resume-saved').hidden=!savedTokenGet(); store = new ChatStore(); active = ''; logOnly = false; query = ''; demo = false; tabsSignature = '';
  $('search').value = ''; $('message').value = ''; $('send-error').textContent = ''; $('workspace').hidden = true; $('welcome').hidden = false;
  document.title = 'acidum · webchat'; document.body.classList.remove('chat-open','keyboard-open','compact-viewport'); document.documentElement.classList.remove('chat-open'); for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close(); $('chat-link').focus();
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
  if(id==='rooms-dialog')renderRooms();if(id==='settings-dialog'){if(active)$('trigger-account').value=active;updateTriggerEditor();}$(id).showModal();
  const button=$(id==='rooms-dialog'?'bottom-rooms':'bottom-settings');button.classList.add('selected');button.setAttribute('aria-pressed','true');
}
$('rooms-button').onclick = $('bottom-rooms').onclick = () => openSheet('rooms-dialog');
$('settings-button').onclick = $('bottom-settings').onclick = () => openSheet('settings-dialog');
for(const dialog of document.querySelectorAll('dialog.sheet')) {
  dialog.querySelector('.close-sheet').onclick = () => dialog.close();
  dialog.addEventListener('close',schedule);
  dialog.addEventListener('close',()=>{for(const id of ['bottom-rooms','bottom-settings']){$(id).classList.remove('selected');$(id).setAttribute('aria-pressed','false');}});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
}
$('search-toggle').onclick = () => {
  const open=$('workspace').classList.toggle('search-open');$('search-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('search').focus({preventScroll:true});
};
let viewportFrame=0, viewportSignature='', focusTimers=[], viewportBaseline=0, viewportWidth=0;
function isEditing(){return document.activeElement?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),[contenteditable=true]')||false;}
function updateViewport() {
  const viewport=window.visualViewport, editing=isEditing(), mobile=window.matchMedia('(max-width:700px)').matches;
  if(!editing||viewportWidth!==window.innerWidth){viewportBaseline=Math.max(window.innerHeight,document.documentElement.clientHeight);viewportWidth=window.innerWidth;}
  const layoutHeight=Math.max(window.innerHeight,document.documentElement.clientHeight,viewportBaseline);
  const geometry=viewportGeometry({height:viewport?.height||window.innerHeight,layoutHeight,offsetTop:viewport?.offsetTop||0,editing,mobile,scale:viewport?.scale||1});
  const signature=JSON.stringify(geometry);
  if(signature===viewportSignature)return;
  viewportSignature=signature;
  const style=document.documentElement.style;
  style.setProperty('--app-height',geometry.height+'px');
  style.setProperty('--viewport-top',geometry.top+'px');
  style.setProperty('--viewport-bottom',geometry.bottom+'px');
  document.body.classList.toggle('keyboard-open',geometry.keyboard);
  document.body.classList.toggle('compact-viewport',geometry.compact);
  if(!$('workspace').hidden&&nearBottom)requestAnimationFrame(()=>{$('timeline').scrollTop=$('timeline').scrollHeight;});
}
function queueViewport(){if(!viewportFrame)viewportFrame=requestAnimationFrame(()=>{viewportFrame=0;updateViewport();});}
function settleFocusViewport(){
  for(const timer of focusTimers)clearTimeout(timer);
  queueViewport();
  // Keyboard opening/closing is animated; a few bounded checks cover delayed events.
  focusTimers=[80,250,500].map(delay=>setTimeout(queueViewport,delay));
}
window.visualViewport?.addEventListener('resize',queueViewport,{passive:true});
window.visualViewport?.addEventListener('scroll',queueViewport,{passive:true});
window.addEventListener('resize',queueViewport,{passive:true});
window.addEventListener('orientationchange',()=>{viewportBaseline=0;settleFocusViewport();},{passive:true});
document.addEventListener('focusin',settleFocusViewport);
document.addEventListener('focusout',settleFocusViewport);
function renderRooms() {
  const signature=JSON.stringify([active,store.names,[...store.tabs.values()].map(tab=>[tab.presenceRevision,tab.rosterComplete,tab.room?.id,tab.roomSince])]);if(signature===roomsSignature)return;roomsSignature=signature;
  const initial=!$('room-cards').children.length, opened=new Set([...$('room-cards').querySelectorAll('details[open]')].map(el=>el.dataset.account));
  const cards=store.names.map(name=>{
    const tab=store.tabs.get(name), card=element('section','room-card'), header=element('div','room-card-header');
    const copy=element('div','room-card-copy');copy.append(element('strong','',name),element('span','',tab.room ? `${tab.room.name}${tab.room.id!=null?' · '+tab.room.id:''}` : 'Rumnavn afventes'));
    const open=element('button','soft-button','Åbn chat');open.onclick=()=>{choose(name);$('rooms-dialog').close();};
    header.append(element('span','avatar',name.slice(0,2).toUpperCase()),copy,open);card.append(header);
    const present=[...tab.presence.values()].filter(user=>user.present).sort((a,b)=>a.name.localeCompare(b.name,'da'));
    const details=element('details','room-people');details.dataset.account=name;details.open=opened.has(name)||(initial&&(active===name||store.names.length===1));
    details.append(element('summary','',`${tab.rosterComplete?'Deltagere':tab.room?'Observeret i rummet':'Observeret i samtalen'} · ${present.length}`));
    if(tab.rosterComplete)details.append(element('p','snapshot-note',`Deltagerliste fra rumskift ${timeFormat.format(tab.roomSince)} · opdateres løbende`));
    const list=element('ul','people-list');
    for(const user of present) {
      const li=element('li'), button=element('button','person-button'),copy=element('span','person-copy');copy.append(element('strong','',user.name),element('small','',user.name===name?'Din bruger':user.source==='snapshot'?'Med ved rumskift':`Senest set ${timeFormat.format(user.time)}`));
      button.append(element('span','avatar',user.name.slice(0,2).toUpperCase()),copy);button.onclick=()=>openPerson(user.name,name);li.append(button);list.append(li);
    }
    if(!present.length)details.append(element('p','setting-note','Ingen brugere observeret endnu. Listen opdateres med nye beskeder og indgange.'));
    else details.append(list);
    card.append(details);return card;
  });
  $('room-cards').replaceChildren(...cards);
  if(!cards.length)$('room-cards').append(element('p','setting-note','Dine brugere vises, når acidum sender sine faner.'));
}
$('send-as').onchange = () => {if(active&&$('send-as').value!==active)choose($('send-as').value);else updateComposer();};
$('composer').onsubmit = event => {
  event.preventDefault(); const name = $('send-as').value, text = $('message').value;
  if (!text.trim() || !store.names.includes(name)) return;
  if(text.length>100){$('send-error').textContent='Beskeden må højst være 100 tegn.';return;}
  $('send-error').textContent = '';
  if (demo) {ingest({me:{name}, user:{name}, type:'text', text, time:Date.now()}); clearDraft(); return;}
  if (!socket || socket.readyState !== WebSocket.OPEN) {$('send-error').textContent = 'Forbindelsen er afbrudt. Din besked er stadig i feltet.'; return;}
  try {socket.send(JSON.stringify({name,say:text})); clearDraft(); $('message').focus({preventScroll:true});}
  catch {$('send-error').textContent = 'Beskeden kunne ikke sendes. Prøv igen, når forbindelsen er tilbage.';}
};
let searchTimer;
$('search').oninput = () => {clearTimeout(searchTimer); searchTimer = setTimeout(() => {query = $('search').value.trim(); resetArchiveView(); pageSize = 250; nearBottom = true; $('clear-search').hidden = !query; schedule();},80);};
$('clear-search').onclick = () => {$('search').value = ''; $('search').dispatchEvent(new Event('input'));};
$('show-events').onchange = () => {showSystems = $('show-events').checked; resetArchiveView(); pageSize = 250; schedule();};
$('older').onclick = olderMessages;
$('timeline').addEventListener('scroll', () => {
  if ($('timeline').scrollTop < 100 && $('timeline').scrollHeight > $('timeline').clientHeight + 100) olderMessages();
  nearBottom = $('timeline').scrollHeight - $('timeline').scrollTop - $('timeline').clientHeight < 60;
  if (nearBottom && notice) {notice = false; $('new-messages').hidden = true; for (const [name,tab] of store.tabs) if (canClearAttention() && (!active || name === active)) tab.unread = 0; renderNavigation();}
}, {passive:true});
$('new-messages').onclick = () => {nearBottom = true; notice = false; for (const [name,tab] of store.tabs) if (canClearAttention() && (!active || name === active)) tab.unread = 0; schedule();};
document.addEventListener('visibilitychange', () => {if (document.hidden) {flushArchive();saveDraft();} if (!document.hidden) {if (nearBottom) for (const [name,tab] of store.tabs) if (canClearAttention() && (!active || name === active)) tab.unread = 0; schedule();}});
window.addEventListener('online', () => {retry = 0; connect();});
window.addEventListener('offline', () => {clearTimeout(retryTimer); status('Ingen internetforbindelse');});
window.addEventListener('pagehide', () => {flushArchive();saveDraft(); intentional = true; clearTimeout(retryTimer); socket?.close();});
window.addEventListener('pageshow', event => {if (event.persisted && token) {intentional = false; connect();}});
document.addEventListener('keydown', event => {if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('workspace').hidden) {event.preventDefault();$('workspace').classList.add('search-open');$('search-toggle').setAttribute('aria-expanded','true'); $('search').focus({preventScroll:true});}});
for(const button of document.querySelectorAll('#view-filters [data-mode]'))button.onclick=()=>{mode=button.dataset.mode;filterChanged();};
$('person-filter').onclick=()=>{person='';filterChanged();};
let mentionState={query:null,names:[],selected:-1,key:''}, dismissedMention='';
function hideMentions(){
  if($('mention-menu').hidden&&!mentionState.query&&!$('mention-suggestions').children.length)return;
  $('mention-menu').hidden=true;if($('mention-suggestions').children.length)$('mention-suggestions').replaceChildren();$('message').setAttribute('aria-expanded','false');$('message').removeAttribute('aria-activedescendant');
  mentionState={query:null,names:[],selected:-1,key:''};
}
function refreshMentions(){
  const input=$('message');if(document.activeElement!==input){hideMentions();return;}
  const query=mentionQuery(input.value,input.selectionStart??input.value.length), tab=store.tabs.get($('send-as').value);
  const key=query?query.start+':'+query.end+':'+query.prefix:'';
  if(!key||key===dismissedMention){hideMentions();return;}
  const names=mentionSuggestions([...(tab?.presence.values()||[])].filter(user=>user.present).map(user=>user.name),query);
  if(!names.length){hideMentions();return;}
  if(key!==mentionState.key)mentionState.selected=-1;
  mentionState={query,names,key,selected:Math.min(mentionState.selected,names.length-1)};
  $('mention-caption').textContent=tab?.rosterComplete?'I rummet':'Observerede brugere';
  $('mention-suggestions').replaceChildren(...names.map((name,index)=>{
    const button=element('button','mention-option',name);button.type='button';button.id='mention-option-'+index;button.tabIndex=-1;button.setAttribute('role','option');button.setAttribute('aria-selected',String(index===mentionState.selected));
    button.addEventListener('pointerdown',event=>event.preventDefault());button.onclick=()=>insertMention(index);return button;
  }));
  $('mention-menu').hidden=false;input.setAttribute('aria-expanded','true');
  if(mentionState.selected>=0){input.setAttribute('aria-activedescendant','mention-option-'+mentionState.selected);const option=$('mention-suggestions').children[mentionState.selected];const list=$('mention-suggestions');if(option.offsetTop<list.scrollTop)list.scrollTop=option.offsetTop;else if(option.offsetTop+option.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=option.offsetTop+option.offsetHeight-list.clientHeight;}
  else input.removeAttribute('aria-activedescendant');
}
function insertMention(index){
  const completion=completeMention($('message').value,mentionState.query,mentionState.names[index]);
  if(!completion){$('send-error').textContent='Der er ikke plads til navnet inden for 100 tegn.';return;}
  $('message').value=completion.text;$('message').setSelectionRange(completion.caret,completion.caret);hideMentions();saveDraft();refreshLimit();$('message').focus({preventScroll:true});
}
$('message').addEventListener('keydown',event=>{
  if(event.isComposing||$('mention-menu').hidden)return;
  if(event.key==='Escape'){event.preventDefault();dismissedMention=mentionState.key;hideMentions();}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const count=mentionState.names.length;mentionState.selected=event.key==='ArrowDown'?(mentionState.selected+1)%count:(mentionState.selected<0?count-1:(mentionState.selected+count-1)%count);refreshMentions();}
  else if((event.key==='Enter'||event.key==='Tab')&&mentionState.selected>=0){event.preventDefault();insertMention(mentionState.selected);}
});
$('message').addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'))refreshMentions();});
$('message').addEventListener('click',refreshMentions);
$('message').addEventListener('blur',hideMentions);
$('message').addEventListener('input',()=>{dismissedMention='';refreshLimit();refreshMentions();clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,200);});
$('trigger-account').onchange=updateTriggerEditor;
$('save-triggers').onclick=()=>{
  const account=$('trigger-account').value;if(!account||!localData)return;
  const terms=localData.setTriggers(account,$('trigger-words').value);store.setTriggers(account,terms);
  $('trigger-status').textContent='Gemt for '+account+' på denne enhed.';filterChanged();
};
$('person-mention').onclick=()=>{
  if(!selectedPerson)return;const {name,account}=selectedPerson;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  choose(account);const prefix='@'+name+' ';$('message').value=(prefix+$('message').value).slice(0,100);saveDraft();refreshLimit();$('message').focus({preventScroll:true});
};
$('person-messages').onclick=()=>{
  if(!selectedPerson)return;const {name,account}=selectedPerson;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  choose(account);person=name;mode='all';$('workspace').classList.add('search-open');$('search-toggle').setAttribute('aria-expanded','true');filterChanged();
};
$('save-message').onclick=()=>{
  if(!selectedMessage||!localData)return;
  const saved=localData.toggleSaved(selectedMessage);$('save-message').textContent=localData.isSaved(selectedMessage)?'Fjern fra gemte':'Gem besked';
  $('message-action-status').textContent=saved?'Opdateret på denne enhed.':'Browseren kunne ikke gemme permanent.';schedule();
};
$('copy-message').onclick=async()=>{
  if(!selectedMessage)return;
  try{await navigator.clipboard.writeText(selectedMessage.text);$('message-action-status').textContent='Kopieret.';}catch{$('message-action-status').textContent='Kopiering blev blokeret af browseren. Markér og kopiér teksten i stedet.';}
};
$('export-chat').onclick=()=>{
  const messages=combinedMessages();const blob=new Blob([exportText(messages)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=element('a');
  link.href=url;link.download='acidum-'+new Date().toISOString().slice(0,10)+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
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
function enterDemo() {resetArchiveView();localData=new LocalData({getItem:()=>null,setItem:()=>{}},'demo');draftAccount='';
  demo = true; intentional = true; store = new ChatStore(); updateTabs(['Nova','Milo']); openWorkspace(); $('demo-label').hidden = false; status('Eksempeltilstand',true);
  const now = Date.now();
  const examples = [
    {name:'Nova',type:'room',room:{id:12,name:'Torvet'},users:[{name:'Nova'},{name:'Alma'}]},
    {name:'Nova',user:'Alma',text:'Er der nogen, der er klar på en tur rundt i byen? ☀'},
    {name:'Milo',type:'room',room:{id:7,name:'Caféen'},users:[{name:'Milo'},{name:'Elliot'}]},
    {name:'Nova',user:'Nova',text:'Ja! Jeg er lige landet på torvet.'},
    {name:'Milo',user:'Elliot',text:'Der er kaffe på kanden. Bare kom forbi.'},
    {name:'Nova',type:'join',user:'Luna'},
    {name:'Nova',user:'Luna',text:'Hej alle sammen 👋'},
    {name:'Milo',user:'Milo',text:'Det lyder som en ret god plan.'},
    {name:'Nova',user:'Alma',text:'Vi mødes ved springvandet om fem minutter.'},
  ];
  ingest(examples.map((e,i) => ({me:{name:e.name},user:{name:e.user||e.name},type:e.type||'text',text:e.text,room:e.room,users:e.users,time:now-(examples.length-i)*60000})));
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
