const {chromium}=require('playwright-core');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||chromium.executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let socket,time=1700000000000;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const event=(type,extra={})=>({me:{name:'Nova'},type,user:{name:'hej'},time:time+=60000,...extra});
  const fixtures={Nova:[event('room',{room:{id:12,name:'Torvet'},users:[{name:'hej'}]}),event('join'),event('quit'),event('join')],Milo:[event('room',{me:{name:'Milo'},room:{id:7,name:'Cafe'}})]};
  await page.routeWebSocket('wss://ws0.acium.app/**',ws=>{socket=ws;ws.send(JSON.stringify({tabs:['Nova','Milo']}));ws.onMessage(raw=>{const data=JSON.parse(raw);if(data.lastLine===0)ws.send(JSON.stringify(fixtures[data.name]||[]));});});
  await page.goto(process.env.ACIDUM_TEST_URL||'http://127.0.0.1:8765/');await page.locator('#chat-link').fill('synthetic_grouping_login_123');await page.locator('#connect-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>document.querySelectorAll('.message').length===5);
  const accountTags=page.locator('.message-account');assert.ok((await accountTags.allTextContents()).every(text=>['Nova','Milo'].includes(text)));
  assert.equal(await page.locator('.account-tag-label').count(),0);
  assert.equal(await page.locator('.message-group-author .message-account').count(),0);
  assert.equal(await page.locator('.message-accounts').first().evaluate(el=>Math.abs(el.getBoundingClientRect().top-el.closest('.message-group').getBoundingClientRect().top)<1),true);
  await page.locator('#mobile-accounts button').nth(1).click();
  await page.waitForFunction(()=>document.querySelectorAll('.message').length===4);
  await page.evaluate(()=>{window.firstAuthorGroup=document.querySelector('.message-name').closest('.message-group');window.firstAuthorHeader=window.firstAuthorGroup.querySelector('.message-group-head');});
  socket.send(JSON.stringify(event('text',{text:'heysa'})));await page.waitForFunction(()=>document.querySelectorAll('.message').length===5);
  const group=page.locator('.message-group').filter({hasText:'heysa'});
  assert.equal(await group.count(),1);
  const alignment=await group.evaluate(el=>({name:el.querySelector('.message-name').getBoundingClientRect().left,lines:[...el.querySelectorAll('.message')].map(row=>({text:row.querySelector('.message-content').getBoundingClientRect().left,textRight:row.querySelector('.message-content').getBoundingClientRect().right,time:row.querySelector('time').getBoundingClientRect().left}))}));assert.ok(alignment.lines.every(row=>Math.abs(row.text-alignment.name)<1&&row.time>row.textRight));
  assert.equal(await group.locator('.message').count(),4);assert.equal(await group.locator('.message-name').count(),1);assert.equal(await group.locator('.avatar').count(),0);assert.equal(await group.locator('time').count(),4);
  assert.deepEqual(await group.locator('.movement-icon').allTextContents(),['→','←','→']);
  const movementColors=await group.locator('.movement-icon').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));assert.equal(movementColors[0],movementColors[2]);assert.notEqual(movementColors[0],movementColors[1]);
  assert.deepEqual(await group.locator('.message-text').allTextContents(),['er kommet ind','har forladt chatten','er kommet ind','heysa']);
  assert.equal(new Set(await group.locator('time').evaluateAll(nodes=>nodes.map(n=>n.dateTime))).size,4);
  assert.equal(await page.evaluate(()=>document.querySelector('.message-name').closest('.message-group')===window.firstAuthorGroup&&window.firstAuthorHeader.isConnected),true);
  assert.equal(await group.locator('.message-text').last().evaluate(el=>getComputedStyle(el).fontSize),'16px');
  await group.locator('.message-time').nth(1).click();assert.equal(await page.locator('#message-preview').textContent(),'har forladt chatten');await page.locator('#save-message').click();await page.locator('#message-dialog .close-sheet').click();
  for(const data of [event('text',{user:{name:'Alma'},text:'Hej med dig'}),event('text',{text:'Jeg er tilbage igen'}),event('priv',{from:{name:'hej'},to:{name:'Nova'},text:'En privat besked'})])socket.send(JSON.stringify(data));
  await page.waitForFunction(()=>document.querySelectorAll('.message-group').length===5);
  assert.deepEqual(await page.locator('.message-group').evaluateAll(nodes=>nodes.map(n=>n.querySelectorAll('.message').length)),[1,4,1,1,1]);
  assert.equal(await page.locator('.private-label').textContent(),'Hvisken');
  const colors=await page.locator('.message-group').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));assert.ok(colors.every((color,i)=>color!=='rgba(0, 0, 0, 0)'&&(!i||color!==colors[i-1])));
  await page.screenshot({path:'/tmp/acidum-grouped-mobile.png'});
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'/tmp/acidum-grouped-desktop.png'});await page.setViewportSize({width:390,height:844});
  socket.send(JSON.stringify(event('part',{room:{id:7,name:'Cafe'}})));await page.waitForFunction(()=>document.querySelectorAll('.movement-icon.leave').length===2);
  const exits=await page.locator('.movement-icon.leave').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));assert.equal(exits[0],exits[1]);
  await page.locator('#bottom-settings').click();await page.locator('#show-events').uncheck();await page.waitForFunction(()=>document.querySelectorAll('.message.system').length===0);assert.equal(await page.locator('.message-group').count(),4);await page.locator('#show-events').check();await page.waitForFunction(()=>document.querySelectorAll('.message').length===9);
  await page.locator('#text-size').focus();await page.locator('#text-size').press('ArrowRight');
  assert.equal(await page.locator('#text-size-value').textContent(),'17 px');assert.equal(await page.locator('.font-preview').evaluate(el=>getComputedStyle(el).fontSize),'17px');
  await page.locator('#text-size').press('Home');assert.equal(await page.locator('#text-size-value').textContent(),'10 px');assert.equal(await group.locator('.message-text').last().evaluate(el=>getComputedStyle(el).fontSize),'10px');assert.equal(await page.locator('#message').evaluate(el=>getComputedStyle(el).fontSize),'16px');
  await page.locator('#text-size').press('End');assert.equal(await page.locator('#text-size-value').textContent(),'30 px');await page.locator('#settings-dialog .close-sheet').click();
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('.message-text').filter({hasText:'heysa'}).evaluate(el=>getComputedStyle(el).fontSize),'30px');
   assert.equal(await page.locator('#timeline').evaluate(el=>el.scrollWidth>el.clientWidth),false);
   assert.equal(await page.locator('#message').evaluate(el=>getComputedStyle(el).fontSize),'30px');
   const timeEdges=await group.locator('time').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().right));assert.ok(Math.max(...timeEdges)-Math.min(...timeEdges)<1);
   const clipped=await page.locator('.message-group').evaluateAll(groups=>groups.flatMap(group=>[...group.querySelectorAll('time')].filter(time=>time.getBoundingClientRect().left<group.getBoundingClientRect().left).map(time=>({time:time.textContent,left:time.getBoundingClientRect().left,group:group.getBoundingClientRect().left,gutter:getComputedStyle(group.querySelector('.message')).gridTemplateColumns,meta:getComputedStyle(time.closest('.message-meta')).fontSize}))));assert.deepEqual(clipped,[],String(width));
  }
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.message').length===5);
  await page.locator('#settings-button').click();assert.equal(await page.locator('#text-size').inputValue(),'30');assert.equal(await page.locator('#text-size-value').textContent(),'30 px');await page.locator('#settings-dialog .close-sheet').click();
  assert.deepEqual(errors,[]);console.log('Join, quit, rejoin and speech share one persistent author block; per-line actions, group boundaries and adjustable persistent text size pass');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
