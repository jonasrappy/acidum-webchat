const publicTypes = new Set(['text', 'join', 'part', 'quit']);
// Input is chronological. Match one copy per account, never repeated lines from the same account.
export function mergeRoomCopies(messages) {
  const result = [],
    buckets = new Map();
  for (const message of messages) {
    if (!(
      (publicTypes.has(message.type) && message.name) ||
      (message.type === 'room' && message.roomKey)
    )) {
      result.push(message);
      continue;
    }
    const signature = JSON.stringify([message.type, message.name, message.text]);
    let bucket = buckets.get(signature);
    if (!bucket) {
      bucket = [];
      buckets.set(signature, bucket);
    }
    while (bucket.length && message.time - bucket[0].time > 1000) bucket.shift();
    const match = bucket.reduce((best, item) => {
      if (
        item.accounts.has(message.account) ||
        (item.roomKey && message.roomKey && item.roomKey !== message.roomKey) ||
        (item.time !== message.time && !(item.roomKey && message.roomKey))
      )
        return best;
      return !best || Math.abs(message.time - item.time) < Math.abs(message.time - best.time)
        ? item
        : best;
    }, null);
    if (!match) {
      bucket.push({
        time: message.time,
        roomKey: message.roomKey,
        accounts: new Set([message.account]),
        sources: [message],
        index: result.length,
      });
      result.push(message);
      continue;
    }
    match.accounts.add(message.account);
    match.sources.push(message);
    const first = match.sources[0];
    result[match.index] = {
      ...first,
      accounts: [...match.accounts].sort(),
      sources: match.sources,
      roomKey: match.roomKey || message.roomKey,
      log: match.sources.some((m) => m.log),
      serverMarked: match.sources.some((m) => m.serverMarked ?? m.log),
      serverNotify: match.sources.some((m) => m.serverNotify),
    };
    match.roomKey ??= message.roomKey;
  }
  return result;
}
export function timelineGroups(messages, dayFor) {
  const groups = [];
  for (const message of messages) {
    const day = dayFor(message.time),
      kind = publicTypes.has(message.type) ? 'public' : message.type === 'priv' ? 'private' : '';
    const accounts = message.accounts || [message.account],
      context = JSON.stringify([message.roomKey || '', accounts]);
    let group = groups.at(-1);
    if (
      !group ||
      !kind ||
      !message.name ||
      group.day !== day ||
      group.context !== context ||
      group.name !== message.name ||
      group.kind !== kind
    ) {
      group = {
        day,
        kind,
        name: message.name,
        account: message.account,
        accounts,
        context,
        messages: [],
      };
      groups.push(group);
    }
    group.messages.push(message);
  }
  return groups;
}
