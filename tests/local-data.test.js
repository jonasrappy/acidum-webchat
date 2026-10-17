import {test} from 'node:test';import assert from 'node:assert/strict';
import {LocalData,exportText} from '../dist/local-data.js';
import {matchesMode,messageLinks} from '../dist/core.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};
const message=(i=1)=>({account:'Test',key:String(i),time:1700000000000+i,name:'Guest',type:'text',text:'Hej Test'});
test('drafts, saved messages and triggers survive reopening, stay scoped and obey limits',()=>{
 const disk=storage(), data=new LocalData(disk,'one');data.setDraft('Test','hello');data.setDraft('Other','different');
 data.setTriggers('Test','kaffe, kaffe, mønt');for(let i=0;i<205;i++)data.toggleSaved(message(i));
 const reopened=new LocalData(disk,'one');assert.equal(reopened.draft('Test'),'hello');assert.equal(reopened.draft('Other'),'different');assert.deepEqual(reopened.triggers.get('Test'),['kaffe','mønt']);
 assert.equal(reopened.saved.size,200);assert.equal(reopened.isSaved(message(0)),false);assert.equal(reopened.isSaved(message(204)),true);
 assert.equal(new LocalData(disk,'two').draft('Test'),'');assert.equal(new LocalData(disk,'two').saved.size,0);
 reopened.toggleSaved(message(204));assert.equal(reopened.isSaved(message(204)),false);
 reopened.setDraft('Test','x'.repeat(150));assert.equal(reopened.draft('Test').length,100);
});
test('invalid storage and blocked writes do not crash the chat',()=>{
 const data=new LocalData({getItem:()=>'{bad',setItem:()=>{throw Error('blocked');}},'one');
 assert.equal(data.setDraft('Test','draft'),false);assert.equal(data.draft('Test'),'draft');
});
test('message filters and link extraction handle private, mention and URL data',()=>{
 assert.equal(matchesMode(message(),'mentions'),true);assert.equal(matchesMode({...message(),text:'plain'},'mentions'),false);
 assert.equal(matchesMode({...message(),type:'priv'},'private'),true);assert.equal(matchesMode(message(),'private'),false);
 assert.deepEqual(messageLinks('Se https://example.com/test. og http://example.org/?x=2!'),['https://example.com/test','http://example.org/?x=2']);
 assert.equal(matchesMode({...message(),text:'https://example.com'},'links'),true);
 assert.equal(matchesMode({...message(),text:'javascript:alert(1)'},'links'),false);
 assert.ok(exportText([message()]).includes('[Test] Guest: Hej Test'));
});
