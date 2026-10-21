'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Y = require('../src/okie-system.js');

test('schedules and timers collect into one list, active first, soonest first', () => {
  const states = {
    'switch.schedule_a': { state: 'on', attributes: { name: 'Lights evening', entities: ['light.kitchen'], weekdays: ['mon', 'tue'], timeslots: ['18:30:00'], next_trigger: '2026-10-06T18:30:00Z' } },
    'switch.schedule_b': { state: 'off', attributes: { name: 'Paused one', entities: ['cover.x'], timeslots: ['07:00:00'] } },
    'switch.schedule_c': { state: 'on', attributes: { name: 'Sooner', entities: ['fan.x'], next_trigger: '2026-10-06T09:00:00Z' } },
    'timer.pasta': { state: 'active', attributes: { friendly_name: 'Pasta', remaining: '0:08:30', finishes_at: '2026-10-06T12:00:00Z' } },
    'light.kitchen': { state: 'on', attributes: {} },
  };
  const list = Y.collectSchedules(states);
  assert.equal(list.length, 4);
  assert.deepEqual(list.map(s => s.name), ['Sooner', 'Pasta', 'Lights evening', 'Paused one']);
  assert.equal(list[1].kind, 'timer'); assert.equal(list[1].remainingMs, 510000);
  assert.deepEqual(list[2].slots, ['18:30']); assert.equal(list[2].domain, 'light');
  assert.equal(list[3].enabled, false);
  assert.equal(Y.filterSchedules(list, 'timer').length, 1);
  assert.equal(Y.filterSchedules(list, 'schedule').length, 3);
  assert.equal(Y.filterSchedules(list, 'all').length, 4);
});

test('duration parsing', () => { assert.equal(Y.parseDuration('1:02:03'), 3723000); assert.equal(Y.parseDuration(''), 0); assert.equal(Y.parseDuration('x'), 0); });

test('markdown: headings, bold, italic, code, lists, links; HTML is escaped', () => {
  const html = Y.mdToHtml('# Title\nSome **bold** and *it* and `code`\n- one\n- two\n\n[site](https://example.com)');
  assert.ok(html.includes('<h3>Title</h3>'));
  assert.ok(html.includes('<strong>bold</strong>') && html.includes('<em>it</em>') && html.includes('<code>code</code>'));
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  assert.ok(html.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>'));
});

test('markdown cannot inject HTML or javascript links', () => {
  const html = Y.mdToHtml('<img src=x onerror=alert(1)> [x](javascript:alert(1)) **<b>hi</b>**');
  assert.ok(!html.includes('<img') && !html.includes('<b>'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(html.includes('&lt;img'));
});

test('assistant: pull the spoken answer out of both response shapes', () => {
  assert.equal(Y.speechOf({ response: { speech: { plain: { speech: 'The lights are on.' } } } }), 'The lights are on.');
  assert.equal(Y.speechOf({ speech: { plain: { speech: 'Hi' } } }), 'Hi');
  assert.equal(Y.speechOf({}), '');
  assert.equal(Y.speechOf(null), '');
});

test('news view: unread first filter and counts', () => {
  const entries = [{ title: 'A', link: 'http://a' }, { title: 'B' }, { title: 'C', link: 'http://c' }];
  const v = Y.newsView(entries, ['http://a'], 'unread');
  assert.deepEqual(v.list.map(e => e.title), ['B', 'C']); assert.equal(v.unread, 2);
  assert.equal(Y.newsView(entries, ['http://a'], 'all').list.length, 3);
  assert.equal(Y.newsView(null, [], 'all').unread, 0);
});

test('changelog entries are well formed', () => {
  assert.ok(Y.CHANGELOG.length >= 1);
  Y.CHANGELOG.forEach(c => { assert.match(c.v, /^\d+\.\d+\.\d+$/); assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(c.tags.length && c.md); });
});

test('assistant: the best language-model agent Home Assistant has answers, the built-in Assist is the last resort', () => {
  const S = require('../src/okie-system.js');
  const mk = (...ids) => Object.fromEntries(ids.map(id => [id, { state: 'x', attributes: {} }]));
  assert.equal(S.pickAgent(mk('conversation.home_assistant', 'conversation.chatgpt', 'conversation.claude_conversation')), 'conversation.claude_conversation');
  assert.equal(S.pickAgent(mk('conversation.home_assistant', 'conversation.chatgpt')), 'conversation.chatgpt');
  assert.equal(S.pickAgent(mk('conversation.home_assistant', 'conversation.google_generative_ai')), 'conversation.google_generative_ai');
  assert.equal(S.pickAgent(mk('conversation.home_assistant', 'conversation.my_agent')), 'conversation.my_agent');       // any other agent beats the plain one
  assert.equal(S.pickAgent(mk('conversation.home_assistant', 'light.kitchen')), '');                                     // only the built-in one: no agent_id, the default
  assert.equal(S.pickAgent({}), '');
  assert.equal(S.pickAgent(null), '');
});

test('assistant: a name in the settings always wins, also the plain built-in one', () => {
  const S = require('../src/okie-system.js');
  const states = { 'conversation.home_assistant': {}, 'conversation.claude_conversation': {} };
  assert.equal(S.pickAgent(states, 'conversation.home_assistant'), 'conversation.home_assistant');
  assert.equal(S.pickAgent(states, 'conversation.chatgpt'), 'conversation.chatgpt');
});
