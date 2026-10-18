const {chromium}=require('playwright-core');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||chromium.executablePath(),headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   window.permissionRequests=0;window.systemAlerts=[];
   window.Notification=class {static permission='default';static async requestPermission(){window.permissionRequests++;this.permission='granted';return 'granted';}};
   ServiceWorkerRegistration.prototype.showNotification=async function(title,options){window.systemAlerts.push({title,options});};
  });
  const page=await context.newPage();let socket,time=Date.now();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const event=(extra={})=>({me:{name:'Nova'},type:'text',user:{name:'Alma'},text:'En markeret besked',time:++time,...extra});
  await page.routeWebSocket('wss://ws0.acium.app/**',ws=>{socket=ws;ws.send(JSON.stringify({tabs:['Nova','Milo']}));ws.onMessage(raw=>{const data=JSON.parse(raw);if(data.lastLine===0&&data.name==='Nova')ws.send(JSON.stringify([event({notify:true})]));});});
  const url=process.env.ACIDUM_TEST_URL||'http://127.0.0.1:8765/';await page.goto(url);
  const manifest=await page.locator('link[rel=manifest]').getAttribute('href');const manifestData=await (await page.request.get(new URL(manifest,url).href)).json();assert.equal(manifestData.name,'acidum');
  await page.locator('#chat-link').fill('synthetic_notification_login_123');await page.locator('#connect-form').evaluate(f=>f.requestSubmit());
  await page.locator('.message.attention').waitFor();assert.equal(await page.locator('#alert-banner').isVisible(),false);assert.equal(await page.evaluate(()=>permissionRequests),0);
  await page.locator('#mobile-accounts button').nth(2).click();await page.locator('#bottom-settings').click();
  assert.equal(await page.locator('#trigger-words').count(),0);await page.locator('#enable-notifications').click();
  await page.waitForFunction(()=>document.querySelector('#enable-notifications').textContent.includes('fra'));assert.equal(await page.evaluate(()=>permissionRequests),1);
  await page.locator('#settings-dialog .close-sheet').click();
  socket.send(JSON.stringify(event({notify:true,text:'Et triggerord fra programmet'})));
  await page.locator('#alert-banner').waitFor();await page.waitForFunction(()=>systemAlerts.length===1);
  assert.equal(await page.locator('#alert-body').textContent(),'Et triggerord fra programmet');assert.equal(await page.locator('#mobile-accounts .badge').textContent(),'1');
  assert.equal(await page.evaluate(()=>systemAlerts[0].options.data.account),'Nova');
  await page.locator('#alert-banner').click();await page.waitForFunction(()=>document.querySelector('#view-title').textContent==='Nova');assert.equal(await page.locator('.message.attention').count(),2);
  await page.locator('#mobile-accounts button').nth(2).click();
  socket.send(JSON.stringify(event({log:true,text:'Kun markering'})));await page.waitForTimeout(120);assert.equal(await page.locator('#alert-banner').isVisible(),false);
  socket.send(JSON.stringify(event({text:'Hej NOVA!'})));await page.waitForTimeout(120);assert.equal(await page.locator('#alert-banner').isVisible(),false);
  socket.send(JSON.stringify(event({notify:true,time:Date.now()-120000,text:'Gammel gentagelse'})));await page.waitForTimeout(120);assert.equal(await page.locator('#alert-banner').isVisible(),false);assert.equal(await page.evaluate(()=>systemAlerts.length),1);
  await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'acidum-open-account',account:'Nova'}})));await page.waitForFunction(()=>document.querySelector('#view-title').textContent==='Nova');
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/notifications-sw.js')),true);
  assert.deepEqual(errors,[]);console.log('Program markers, permission opt-in, live alerts, silent history, worker registration and correct account navigation pass');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
