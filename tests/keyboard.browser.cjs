const {chromium}=require('playwright-core');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||chromium.executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{const viewport=new EventTarget();Object.assign(viewport,{height:844,width:390,offsetTop:0,offsetLeft:0,scale:1});window.testViewport=viewport;Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});});
  const page=await context.newPage();let socket;const sent=[],errors=[];page.on('pageerror',e=>errors.push(e.message));let time=1700000000000;
  const event=(account,type,extra={})=>({me:{name:account},type,time:++time,...extra});
  const fixtures={Nova:[event('Nova','room',{room:{id:12,name:'Torvet'},users:[{name:'Damm'},{name:'Daniel'},{name:'David'}]}),...Array.from({length:250},(_,i)=>event('Nova','text',{user:{name:'Alma'},text:'Message '+i}))],Milo:[event('Milo','room',{room:{id:7,name:'Cafe'},users:[{name:'Dorte'}]})]};
  await page.routeWebSocket('wss://ws0.acium.app/**',ws=>{socket=ws;ws.send(JSON.stringify({tabs:['Nova','Milo']}));ws.onMessage(raw=>{const data=JSON.parse(raw);if(data.say!==undefined)sent.push(data);else if(data.lastLine===0)ws.send(JSON.stringify(fixtures[data.name]||[]));});});
  await page.goto(process.env.ACIDUM_TEST_URL||'http://127.0.0.1:8765/');await page.locator('#chat-link').fill('synthetic_keyboard_login_123');await page.locator('#connect-form').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>document.querySelectorAll('.message').length===250);await page.locator('#mobile-accounts button').nth(1).click();await page.waitForTimeout(150);
  assert.equal(await page.locator('.message-group').count(),1);assert.equal(await page.locator('.message-name').count(),1);assert.equal(await page.locator('.message time').count(),250);
  assert.equal(await page.locator('.message-text').first().evaluate(el=>getComputedStyle(el).fontSize),'19px');
  await page.evaluate(()=>{window.savedRow=document.querySelector('#messages .message:last-child');window.savedGroup=window.savedRow.closest('.message-group');window.savedStripe=window.savedGroup.classList.contains('alternate');window.mutations={added:0,removed:0};new MutationObserver(records=>{for(const r of records){window.mutations.added+=r.addedNodes.length;window.mutations.removed+=r.removedNodes.length;}}).observe(document.querySelector('#messages'),{childList:true,subtree:true});});
  socket.send(JSON.stringify(event('Milo','text',{user:{name:'Elliot'},text:'Other room traffic'})));await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(()=>window.mutations),{added:0,removed:0});
  await page.locator('#message').fill('@d');assert.equal(await page.locator('.mention-option').count(),3);
  await page.evaluate(()=>{Object.assign(window.testViewport,{height:440,offsetTop:130});window.testViewport.dispatchEvent(new Event('resize'));window.testViewport.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(80);
  const bounds=await page.evaluate(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {shell:box('workspace'),composer:document.querySelector('.composer-wrap').getBoundingClientRect().bottom,conversation:box('timeline'),scrollY,keyboard:document.body.classList.contains('keyboard-open')};});
  assert.equal(bounds.shell.top,130);assert.equal(bounds.shell.height,440);assert.ok(Math.abs(bounds.composer-570)<1);assert.ok(bounds.conversation.height>150);assert.equal(bounds.keyboard,true);assert.equal(bounds.scrollY,0);
  assert.deepEqual(await page.evaluate(()=>window.mutations),{added:0,removed:0});
  await page.locator('.mention-option').filter({hasText:'Damm'}).click();assert.equal(await page.locator('#message').inputValue(),'Damm ');assert.equal(await page.locator('#message').evaluate(el=>document.activeElement===el),true);assert.equal(sent.length,0);
  await page.locator('#message').fill('@d');await page.locator('#message').press('ArrowDown');await page.locator('#message').press('Enter');assert.equal(await page.locator('#message').inputValue(),'Damm ');assert.equal(sent.length,0);
  await page.locator('#message').fill('@d');await page.locator('#message').press('Enter');await page.waitForTimeout(20);assert.equal(sent.at(-1).say,'@d');
  await page.locator('#message').fill('hej @d bare almindelig tekst');assert.equal(await page.locator('#mention-menu').isVisible(),false);
  await page.locator('#message').fill('mail@example.com');assert.equal(await page.locator('#mention-menu').isVisible(),false);
  await page.locator('#message').fill('@d');await page.locator('#message').press('Escape');assert.equal(await page.locator('#mention-menu').isVisible(),false);
  console.log('Keyboard resize/pan, visible conversation and optional mention selection pass');
  await page.locator('#message').evaluate(el=>el.blur());await page.evaluate(()=>{Object.assign(window.testViewport,{height:844,offsetTop:130});window.testViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(80);
  assert.equal(await page.locator('#workspace').evaluate(el=>el.getBoundingClientRect().top),0);assert.equal(await page.locator('.bottom-nav').isVisible(),true);
  socket.send(JSON.stringify(event('Nova','text',{user:{name:'Alma'},text:'New message'})));await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.savedRow.isConnected),true);
  assert.equal(await page.evaluate(()=>window.savedRow.closest('.message-group')===window.savedGroup&&window.savedGroup.classList.contains('alternate')===window.savedStripe),true);
  const mutations=await page.evaluate(()=>window.mutations);assert.ok(mutations.added<=2&&mutations.removed<=2,JSON.stringify(mutations));console.log('One new message reuses existing rows:',JSON.stringify(mutations));
  await page.locator('#mobile-accounts button').nth(2).click();await page.locator('#message').fill('@d');assert.equal(await page.locator('.mention-option').textContent(),'Dorte');
  assert.deepEqual(errors,[]);console.log('Restored viewport and separate room suggestions pass');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
