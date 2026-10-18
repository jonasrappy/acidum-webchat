export function demoEvents(now = Date.now()) {
  const examples = [
    {
      account: 'Nova',
      type: 'room',
      room: { id: 12, name: 'Torvet' },
      users: [{ name: 'Nova' }, { name: 'Alma' }],
    },
    { account: 'Nova', user: 'Alma', text: 'Er der nogen, der er klar på en tur rundt i byen? ☀' },
    {
      account: 'Milo',
      type: 'room',
      room: { id: 7, name: 'Caféen' },
      users: [{ name: 'Milo' }, { name: 'Elliot' }],
    },
    { account: 'Nova', user: 'Nova', text: 'Ja! Jeg er lige landet på torvet.' },
    { account: 'Milo', user: 'Elliot', text: 'Der er kaffe på kanden. Bare kom forbi.' },
    { account: 'Nova', type: 'join', user: 'Luna' },
    { account: 'Nova', user: 'Luna', text: 'Hej alle sammen 👋' },
    { account: 'Milo', user: 'Milo', text: 'Det lyder som en ret god plan.' },
    { account: 'Nova', user: 'Alma', text: 'Vi mødes ved springvandet om fem minutter.' },
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
