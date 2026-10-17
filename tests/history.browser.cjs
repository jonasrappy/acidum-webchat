const {chromium}=require('playwright-core');const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || chromium.executablePath(),headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.routeWebSocket('wss://ws0.acium.app/**',ws=>{ws.send(JSON.stringify({tabs:['Fixture']}));ws.onMessage(data=>{if(JSON.parse(data).lastLine===0)ws.send(JSON.stringify(Array.from({length:2000},(_,i)=>({time:1700000000000+i,me:{name:'Fixture'},user:{name:'Example'},type:'text',text:'Saved message '+i}))));});});
await page.addInitScript(()=>localStorage.setItem('acium-webchat-save-history','yes'));await page.goto(process.env.ACIDUM_TEST_URL || 'http://127.0.0.1:8765/');
await page.locator('#chat-link').fill('test_history_token_123');await page.locator('#connect-form').evaluate(f=>f.requestSubmit());
await page.waitForFunction(()=>document.querySelectorAll('.message').length===250);
await page.waitForFunction(async()=>{const {scopeFor,loadBefore}=await import('/archive.js');return (await loadBefore(await scopeFor('test_history_token_123'),'',null,{limit:3000})).messages.length===2000;});
console.log('Initial DOM / archived records: 250 / 2000');
for(const count of [500,700,950]){await page.locator('#timeline').evaluate(el=>{el.scrollTop=0;});await page.waitForFunction(n=>document.querySelectorAll('.message').length===n,count);assert.ok(await page.locator('#timeline').evaluate(el=>el.scrollTop>0));console.log('Scroll-up lazy load count:',count,'anchor preserved');}
await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.message').length===250);console.log('Session reload initially renders only 250 rows');
const isolated=await page.evaluate(async()=>{const {scopeFor,loadBefore}=await import('/archive.js');return (await loadBefore(await scopeFor('different_history_token'),'',null)).messages.length;});assert.equal(isolated,0);
console.log('Different login archive isolated:',isolated===0);
await page.locator('#settings-button').click();await page.locator('#clear-history').click();await page.waitForFunction(()=>document.querySelector('#history-status').textContent.includes('slettet'));
const cleared=await page.evaluate(async()=>{const {scopeFor,loadBefore}=await import('/archive.js');return (await loadBefore(await scopeFor('test_history_token_123'),'',null)).messages.length;});assert.equal(cleared,0);
console.log('Clear archive:',cleared===0);
const cap = await page.evaluate(async()=>{
 const {saveMessages,loadBefore,clearScope}=await import('/archive.js');
 const scope='synthetic-cap-check';
 await saveMessages(scope,Array.from({length:10020},(_,i)=>({account:'Fixture',key:String(i),time:1700000000000+i,type:'text',name:'Example',text:'Cap fixture '+i})));
 const count=(await loadBefore(scope,'',null,{limit:11000})).messages.length;
 await clearScope(scope);return count;
});assert.equal(cap,10000);console.log('Archive cap:',cap);assert.deepEqual(errors,[]);console.log('Browser errors: none');
await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
