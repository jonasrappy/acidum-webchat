// Keep existing message identities compatible with locally saved history and bookmarks.
export function identityText(event, text) {
  switch (event.type) {
    case 'priv':
      return `${event.from?.name === event.me?.name ? `til ${event.to?.name || '?'}` : 'hvisker'}: ${event.text || ''}`;
    case 'join':
      return 'er kommet ind';
    case 'part':
      return `er gået til ${event.room?.name || event.room?.id || 'et andet rum'}`;
    case 'quit':
      return 'har forladt chatten';
    case 'room':
      return `Velkommen til ${event.room?.name || 'rummet'}${event.room?.id != null ? ` · ${event.room.id}` : ''}`;
    case 'log':
      return event.users?.length
        ? `Panic aktiveret af ${event.users.map((user) => user.name).join(', ')}`
        : 'Panic deaktiveret';
    default:
      return text;
  }
}

export function restoreMessage(message) {
  let text = message.text;
  switch (message.type) {
    case 'priv':
      text = text.replace(/^hvisker:/, 'whispers:').replace(/^til /, 'to ');
      break;
    case 'join':
      text = 'joined the room';
      break;
    case 'part':
      text =
        text === 'er gået til et andet rum'
          ? 'moved to another room'
          : text.replace(/^er gået til /, 'moved to ');
      break;
    case 'quit':
      text = 'left the chat';
      break;
    case 'room':
      text = text
        .replace(/^Velkommen til rummet(?= · |$)/, 'Welcome to the room')
        .replace(/^Velkommen til /, 'Welcome to ');
      break;
    case 'log':
      text = text
        .replace(/^Panic aktiveret af /, 'Panic activated by ')
        .replace(/^Panic deaktiveret$/, 'Panic deactivated');
      break;
  }
  return text === message.text ? message : { ...message, text };
}
