const {chromium}=require('playwright-core');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||chromium.executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let socket,errors=[];page.on('pageerror',e=>errors.push(e.message));let time=1700000000000;
  const event=(account,type,extra={})=>({me:{name:account},type,time:++time,...extra});
  const fixture={Nova:[event('Nova','room',{room:{id:12,name:'Torvet'},users:[{name:'Quiet'},{name:'Alma'}]}),event('Nova','text',{user:{name:'Alma'},text:'Hej Nova!'}),event('Nova','text',{user:{name:'Alma'},text:'Se https://example.com.'}),event('Nova','priv',{from:{name:'Guest'},to:{name:'Nova'},text:'En privat besked'})],Milo:[event('Milo','room',{room:{id:7,name:'Cafe'},users:[{name:'Elliot'}]}),event('Milo','text',{user:{name:'Elliot'},text:'Hej alle'})]};
  await page.routeWebSocket('wss://ws0.acium.app/**',ws=>{socket=ws;ws.send(JSON.stringify({tabs:['Nova','Milo']}));ws.onMessage(raw=>{const data=JSON.parse(raw);if(data.lastLine===0)ws.send(JSON.stringify(fixture[data.name]||[]));});});
  await page.goto(process.env.ACIDUM_TEST_URL||'http://127.0.0.1:8765/');await page.locator('#chat-link').fill('synthetic_features_login_123');await page.locator('#connect-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>document.querySelectorAll('.message').length===6);
  await page.locator('#mobile-accounts button').nth(1).click();await page.locator('#bottom-rooms').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#room-cards summary')].every(e=>e.textContent.startsWith('Deltagere')));
  await page.locator('.person-button').filter({hasText:'Quiet'}).click();await page.locator('#person-mention').click();assert.equal(await page.locator('#message').inputValue(),'@Quiet ');
  await page.locator('#mobile-accounts button').nth(2).click();await page.locator('#message').fill('Milo draft');
  await page.locator('#mobile-accounts button').nth(1).click();assert.equal(await page.locator('#message').inputValue(),'@Quiet ');
  await page.locator('#mobile-accounts button').nth(2).click();assert.equal(await page.locator('#message').inputValue(),'Milo draft');
  console.log('Snapshot includes quiet users; participant mention and separate drafts pass');
  await page.locator('#bottom-settings').click();await page.locator('#trigger-account').selectOption('Nova');await page.locator('#trigger-words').fill('kaffe');await page.locator('#save-triggers').click();await page.locator('#settings-dialog .close-sheet').click();
  socket.send(JSON.stringify(event('Nova','text',{user:{name:'Alma'},text:'Er der kaffe?'})));await page.waitForTimeout(180);
  assert.equal(await page.locator('#mobile-accounts .badge').textContent(),'1');
  await page.locator('#mobile-accounts button').nth(1).click();await page.locator('#search-toggle').click();await page.locator('[data-mode="mentions"]').click();await page.waitForTimeout(50);assert.equal(await page.locator('.message').count(),2);
  await page.locator('[data-mode="private"]').click();await page.waitForTimeout(50);assert.equal(await page.locator('.message').count(),1);
  await page.locator('[data-mode="links"]').click();await page.waitForTimeout(50);assert.equal(await page.locator('.message').count(),1);assert.equal(await page.locator('.message-text a').getAttribute('href'),'https://example.com');
  await page.locator('.message-time').click();await page.locator('#save-message').click();await page.locator('#message-dialog .close-sheet').click();
  await page.locator('[data-mode="saved"]').click();await page.waitForTimeout(50);assert.equal(await page.locator('.message').count(),1);
  console.log('Local triggers, mention/private/link filters and saved messages pass');
  await page.locator('#bottom-settings').click();const downloadPromise=page.waitForEvent('download');await page.locator('#export-chat').click();const download=await downloadPromise;assert.ok(download.suggestedFilename().startsWith('acidum-'));await page.locator('#settings-dialog .close-sheet').click();
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.message').length>=6);assert.equal(await page.locator('#message').inputValue(),'@Quiet ');
  await page.locator('#search-toggle').click();await page.locator('[data-mode="saved"]').click();await page.waitForTimeout(50);assert.equal(await page.locator('.message').count(),1);
  await page.locator('[data-mode="all"]').click();await page.locator('#mobile-accounts button').nth(1).click();
  socket.send(JSON.stringify(event('Nova','quit',{user:{name:'Quiet'}})));await page.waitForTimeout(180);await page.locator('#bottom-rooms').click();assert.equal(await page.locator('.person-button').filter({hasText:'Quiet'}).count(),0);await page.locator('#rooms-dialog .close-sheet').click();
  await page.locator('.message-name').filter({hasText:'Alma'}).first().click();await page.locator('#person-messages').click();await page.waitForTimeout(50);assert.equal(await page.locator('#person-filter').textContent(),'Alma ×');
  assert.deepEqual(errors,[]);console.log('Export, persistent drafts/bookmarks, departing users and sender filter pass');
  await page.screenshot({path:'/tmp/acidum-feature-mobile.png'});
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
