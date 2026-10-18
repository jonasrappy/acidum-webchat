import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timelineGroups,mergeRoomCopies} from '../dist/timeline.js';
import {messageAttention,ChatStore} from '../dist/core.js';
const event=(type,extra={})=>({type,account:'Nova',name:'hej',time:1,...extra});
const dayFor=time=>time<100?'today':'tomorrow';
test('consecutive movements and text share one author group in their original order',()=>{
 const messages=[event('join'),event('quit'),event('join'),event('text',{text:'heysa'})];
 const groups=timelineGroups(messages,dayFor);
 assert.equal(groups.length,1);assert.deepEqual(groups[0].messages,messages);assert.equal(groups[0].name,'hej');
});
test('copies in the same room become one line with every receiving account and its attention flags',()=>{
 const source=(account,time,extra={})=>Object.freeze(event('text',{key:account+time,account,time,roomKey:'id:12',text:'Hej Milo',serverMarked:false,...extra}));
 const nova=source('Nova',100),milo=source('Milo',109,{log:true,serverMarked:true});
 const merged=mergeRoomCopies([nova,milo]);assert.equal(merged.length,1);assert.deepEqual(merged[0].accounts,['Milo','Nova']);assert.equal(messageAttention(merged[0]),true);assert.equal(merged[0].log,true);
 assert.equal(nova.accounts,undefined);assert.equal(merged[0].sources[0],nova);
 assert.equal(messageAttention(mergeRoomCopies([nova,source('Milo',110)])[0]),true);
 assert.equal(mergeRoomCopies([nova])[0],nova);
});
test('repeated text stays repeated and different rooms, private messages and uncertain times stay separate',()=>{
 const text=(account,time,roomKey='id:12',extra={})=>event('text',{key:account+time,account,time,roomKey,text:'echo',...extra});
 const repeated=mergeRoomCopies([text('Nova',100),text('Milo',110),text('Nova',120),text('Milo',130)]);
 assert.equal(repeated.length,2);assert.ok(repeated.every(m=>m.sources.length===2));
 assert.equal(mergeRoomCopies([text('Nova',100),text('Milo',100,'id:7')]).length,2);
 assert.equal(mergeRoomCopies([text('Nova',100),text('Milo',100,'id:12',{type:'priv'})]).length,2);
 assert.equal(mergeRoomCopies([text('Nova',100),text('Milo',1200)]).length,2);
 assert.equal(mergeRoomCopies([text('Nova',100,''),text('Milo',101,'')]).length,2);
 assert.equal(mergeRoomCopies([text('Nova',100,''),text('Milo',100,'')]).length,1);
 const partial=mergeRoomCopies([text('Nova',100),text('Nova',150),text('Milo',159)]);assert.equal(partial[0].accounts,undefined);assert.deepEqual(partial[1].accounts,['Milo','Nova']);
 assert.equal(mergeRoomCopies([text('Nova',100,'id:12',{type:'priv'}),text('Milo',100,'id:12',{type:'priv'})]).length,2);
 const welcome=mergeRoomCopies([text('Nova',100,'id:12',{type:'room',name:''}),text('Milo',105,'id:12',{type:'room',name:''})]);assert.equal(welcome.length,1);assert.deepEqual(welcome[0].accounts,['Milo','Nova']);
});
test('historical room identity survives later room changes and departures use their source room',()=>{
 const store=new ChatStore();store.setTabs(['Nova','Milo']);
 for(const account of store.names)store.add({type:'room',time:1,me:{name:account},room:{id:12,name:'Torvet'}});
 const event=(account,time,type='text',extra={})=>({me:{name:account},user:{name:'Guest'},time,type,text:'hej',...extra});
 const old=store.add(event('Nova',100));const departure=store.add(event('Nova',110,'part',{room:{id:7,name:'Cafe'}}));
 store.add({type:'room',time:120,me:{name:'Nova'},room:{id:7,name:'Cafe'}});
 const newer=store.add(event('Nova',200)),other=store.add(event('Milo',200));
 assert.equal(old.roomKey,'id:12');assert.equal(departure.roomKey,'id:12');assert.equal(newer.roomKey,'id:7');assert.equal(mergeRoomCopies([newer,other]).length,2);
});
test('another author, account, day, private channel or room event starts a new group',()=>{
 for(const middle of [event('text',{name:'Alma'}),event('text',{account:'Milo'}),event('text',{time:100}),event('priv'),event('room',{name:''}),event('log',{name:''})]){
  const messages=[event('text'),middle,event('text')];
  assert.equal(timelineGroups(messages,dayFor).length,3,JSON.stringify(middle));
 }
 assert.deepEqual(timelineGroups([event('priv'),event('priv'),event('text')],dayFor).map(g=>g.messages.length),[2,1]);
 assert.equal(timelineGroups([event('room',{name:''}),event('room',{name:''})],dayFor).length,2);
});
