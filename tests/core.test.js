import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChatStore, parseToken, retryDelay} from '../dist/core.js';
const event = (i, name='Test') => ({type:'text',me:{name},user:{name:'Guest'},text:`message ${i}`,time:1700000000000+i});
test('tokens accept the official link and reject other hosts, missing tokens and arbitrary URL strings', () => {
 assert.equal(parseToken('https://acium.app/chat?token=example_token_123#log'),'example_token_123');
 for (const link of ['https://evil.test/chat?token=example_token_123','https://acium.app.evil.test/chat?token=example_token_123','https://acium.app/chat','javascript:alert(1)','short']) assert.throws(() => parseToken(link));
});
test('long sessions retain a bounded history, deduplicate replays, and resume from newest timestamp', () => {
 const s=new ChatStore(700);s.setTabs(['Test']);
 for(let i=0;i<20000;i++)s.add(event(i));
 assert.equal(s.tab('Test').messages.length,700);assert.equal(s.tab('Test').keys.size,700);
 assert.equal(s.tab('Test').lastLine,event(19999).time);assert.equal(s.add(event(19999)),null);
 assert.equal(s.tab('Test').messages[0].text,'message 19300');
});
test('accounts stay separate, chronological overview and filters work, disconnected tabs are discarded', () => {
 const s=new ChatStore();s.setTabs(['Test','Other']);s.add(event(2));s.add({...event(1,'Other'),notify:true});
 assert.deepEqual(s.messages('').map(e=>e.account),['Other','Test']);assert.equal(s.messages('',true).length,1);
 assert.equal(s.messages('Test',false,'MESSAGE 2').length,1);assert.equal(s.messages('Other',false,'no match').length,0);
 s.setTabs(['Test']);assert.equal(s.tabs.size,1);assert.equal(s.add(event(3,'Other')),null);
});
test('malformed and unsupported messages are ignored, user text stays plain text', () => {
 const s=new ChatStore();s.setTabs(['Test']);
 for(const value of [null,{}, {...event(1),time:'bad'}, {...event(1),time:1e30}, {...event(1),type:'unknown'}])assert.equal(s.add(value),null);
 assert.equal(s.add({...event(2),text:'<img src=x onerror=alert(1)>'}).text,'<img src=x onerror=alert(1)>');
});
test('retry intervals back off with jitter and remain bounded', () => {
 assert.equal(retryDelay(0,()=>.5),1000);assert.equal(retryDelay(1,()=>.5),2000);assert.equal(retryDelay(999,()=>.5),30000);
 assert.ok(retryDelay(4,()=>0)<retryDelay(4,()=>1));assert.ok(retryDelay(999,()=>1)<=36000);
});
