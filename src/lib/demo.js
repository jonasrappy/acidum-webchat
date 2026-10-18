export function demoEvents(now = Date.now()) {
  const examples = [
    {
      account: 'Nova',
      type: 'room',
      room: { id: 12, name: 'Town Square' },
      users: [{ name: 'Nova' }, { name: 'Alma' }],
    },
    { account: 'Nova', user: 'Alma', text: 'Anyone up for a walk around town? ☀' },
    {
      account: 'Milo',
      type: 'room',
      room: { id: 7, name: 'Café' },
      users: [{ name: 'Milo' }, { name: 'Elliot' }],
    },
    { account: 'Nova', user: 'Nova', text: 'Yes! I just arrived at the square.' },
    { account: 'Milo', user: 'Elliot', text: 'There is fresh coffee. Come on over.' },
    { account: 'Nova', type: 'join', user: 'Luna' },
    { account: 'Nova', user: 'Luna', text: 'Hello everyone 👋' },
    { account: 'Milo', user: 'Milo', text: 'Sounds like a good plan.' },
    { account: 'Nova', user: 'Alma', text: 'Meet us by the fountain in five minutes.' },
  ];
  return examples.map((event, index) => ({
    me: { name: event.account },
    user: { name: event.user || event.account },
    type: event.type || 'text',
    text: event.text,
    room: event.room,
    users: event.users,
    time: now - (examples.length - index) * 60000,
  }));
}
