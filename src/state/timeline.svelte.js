import { messageAttention } from '../lib/core.js';
import { timelineGroups } from '../lib/timeline.js';
import { formatDay, formatTime, messageKey, textParts } from '../lib/format.js';

class MessageRow {
  message = $state.raw(null);
  saved = $state(false);
  attention = $derived(this.message ? messageAttention(this.message) : false);

  constructor(message) {
    this.key = messageKey(message);
    this.message = message;
    this.time = formatTime(message.time);
    this.datetime = new Date(message.time).toISOString();
    this.parts = textParts(message.text);
    this.movement = ['join', 'part', 'quit'].includes(message.type);
    this.entering = message.type === 'join';
  }

  update(message, saved) {
    const previous = this.message;
    const sources = message.sources || [message];
    const previousSources = previous.sources || [previous];
    if (
      sources.length !== previousSources.length ||
      sources.some((source, index) => source !== previousSources[index])
    ) {
      this.message = message;
    }
    this.saved = saved;
  }
}

class AuthorGroup {
  rows = $state.raw([]);
  accounts = $state.raw([]);
  alternate = $state(false);
  showDay = $state(false);
  attention = $derived(this.rows.some((row) => row.attention));

  constructor(key, group) {
    this.key = key;
    this.name = group.name;
    this.kind = group.kind;
    this.day = group.day;
  }
}

function sameItems(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export class TimelineWindow {
  groups = $state.raw([]);
  rows = new Map();
  serial = 0;

  update(messages, isSaved) {
    const previousGroups = new Map();
    for (const group of this.groups) {
      for (const row of group.rows) previousGroups.set(row.key, group);
    }
    const descriptions = timelineGroups(messages, formatDay);
    const used = new Set();
    const nextRows = new Map();
    let stripeOffset = 0;
    let anchored = false;
    let day = '';
    const groups = descriptions.map((description, index) => {
      let group;
      for (const message of description.messages) {
        const candidate = previousGroups.get(messageKey(message));
        if (candidate && !used.has(candidate)) {
          group = candidate;
          break;
        }
      }
      if (group && !anchored) {
        stripeOffset = Number(group.alternate) ^ (index % 2);
        anchored = true;
      }
      group ??= new AuthorGroup(++this.serial, description);
      used.add(group);
      return { group, description };
    });
    for (const [index, { group, description }] of groups.entries()) {
      const rows = description.messages.map((message) => {
        const key = messageKey(message);
        const row = this.rows.get(key) || new MessageRow(message);
        row.update(message, isSaved(message));
        nextRows.set(key, row);
        return row;
      });
      if (!sameItems(group.rows, rows)) group.rows = rows;
      if (!sameItems(group.accounts, description.accounts)) group.accounts = description.accounts;
      group.alternate = Boolean((index % 2) ^ stripeOffset);
      group.showDay = day !== description.day;
      day = description.day;
    }
    this.rows = nextRows;
    const nextGroups = groups.map(({ group }) => group);
    if (!sameItems(this.groups, nextGroups)) this.groups = nextGroups;
  }

  updateBookmarks(isSaved) {
    for (const row of this.rows.values()) row.saved = isSaved(row.message);
  }

  clear() {
    this.rows.clear();
    this.groups = [];
  }
}
