// Restore the original chat wording without changing saved identities or user-written content.
export function restoreMessage(message) {
  let text = message.text;
  switch (message.type) {
    case 'priv':
      text = text.replace(/^whispers:/, 'hvisker:').replace(/^to /, 'til ');
      break;
    case 'join':
      text = 'er kommet ind';
      break;
    case 'part':
      text =
        text === 'moved to another room'
          ? 'er gået til et andet rum'
          : text.replace(/^moved to /, 'er gået til ');
      break;
    case 'quit':
      text = 'har forladt chatten';
      break;
    case 'room':
      text = text
        .replace(/^Welcome to the room(?= · |$)/, 'Velkommen til rummet')
        .replace(/^Welcome to /, 'Velkommen til ');
      break;
    case 'log':
      text = text
        .replace(/^Panic activated by /, 'Panic aktiveret af ')
        .replace(/^Panic deactivated$/, 'Panic deaktiveret');
      break;
  }
  return text === message.text ? message : { ...message, text };
}
