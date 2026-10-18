import {test} from 'node:test';import assert from 'node:assert/strict';
import {mentionQuery,mentionSuggestions,completeMention} from '../dist/mentions.js';
test('mention suggestions match names without changing ordinary writing or email addresses',()=>{
 assert.equal(mentionQuery('mail@example.com'),null);assert.equal(mentionQuery('hej@d'),null);
 assert.deepEqual(mentionSuggestions(['Damm','daniel','Alma'],mentionQuery('Hej @DA')),['Damm','daniel']);
 assert.deepEqual(mentionSuggestions(['Søren','Alma'],mentionQuery('@SØ')),['Søren']);
 assert.equal(mentionQuery('@d skriver videre'),null);
});
test('completion replaces the current token, preserves surrounding text and respects the message limit',()=>{
 const text='Hej @d, kommer du?';const query=mentionQuery(text,6);
 assert.deepEqual(completeMention(text,query,'Damm'),{text:'Hej Damm, kommer du?',caret:8});
 assert.deepEqual(completeMention('@d',mentionQuery('@d'),'Damm'),{text:'Damm ',caret:5});
 assert.equal(completeMention('x'.repeat(97)+' @d',mentionQuery('x'.repeat(97)+' @d'),'Damm'),null);
});
