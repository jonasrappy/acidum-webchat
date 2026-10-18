import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentionQuery, mentionSuggestions, completeMention } from '../src/lib/mentions.js';
test('mention suggestions match names without changing ordinary writing or email addresses', () => {
  assert.equal(mentionQuery('mail@example.com'), null);
  assert.equal(mentionQuery('hello@d'), null);
  assert.deepEqual(mentionSuggestions(['Damm', 'daniel', 'Alma'], mentionQuery('Hello @DA')), [
    'Damm',
    'daniel',
  ]);
  assert.deepEqual(mentionSuggestions(['Søren', 'Alma'], mentionQuery('@SØ')), ['Søren']);
  assert.equal(mentionQuery('@d keeps typing'), null);
});
test('completion replaces the current token, preserves surrounding text and respects the message limit', () => {
  const text = 'Hello @d, are you coming?';
  const query = mentionQuery(text, 8);
  assert.deepEqual(completeMention(text, query, 'Damm'), {
    text: 'Hello Damm, are you coming?',
    caret: 10,
  });
  assert.deepEqual(completeMention('@d', mentionQuery('@d'), 'Damm'), { text: 'Damm ', caret: 5 });
  assert.equal(
    completeMention('x'.repeat(97) + ' @d', mentionQuery('x'.repeat(97) + ' @d'), 'Damm'),
    null,
  );
});
