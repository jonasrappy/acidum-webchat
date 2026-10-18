import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timelineGroups} from '../dist/timeline.js';
const event=(type,extra={})=>({type,account:'Nova',name:'hej',time:1,...extra});
const dayFor=time=>time<100?'today':'tomorrow';
test('consecutive movements and text share one author group in their original order',()=>{
 const messages=[event('join'),event('quit'),event('join'),event('text',{text:'heysa'})];
 const groups=timelineGroups(messages,dayFor);
 assert.equal(groups.length,1);assert.deepEqual(groups[0].messages,messages);assert.equal(groups[0].name,'hej');
});
test('another author, account, day, private channel or room event starts a new group',()=>{
 for(const middle of [event('text',{name:'Alma'}),event('text',{account:'Milo'}),event('text',{time:100}),event('priv'),event('room',{name:''}),event('log',{name:''})]){
  const messages=[event('text'),middle,event('text')];
  assert.equal(timelineGroups(messages,dayFor).length,3,JSON.stringify(middle));
 }
 assert.deepEqual(timelineGroups([event('priv'),event('priv'),event('text')],dayFor).map(g=>g.messages.length),[2,1]);
 assert.equal(timelineGroups([event('room',{name:''}),event('room',{name:''})],dayFor).length,2);
});
