import { messageLinks } from './core.js';

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const calendar = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const formatTime = (time) => clock.format(time);
export const formatDay = (time) => calendar.format(time);
export const messageKey = (message) => JSON.stringify([message.account, message.key]);
export const badgeText = (count) => (count > 99 ? '99+' : String(count));

export function textParts(text) {
  const parts = [];
  let offset = 0;
  for (const link of messageLinks(text)) {
    const start = text.indexOf(link, offset);
    if (start < offset) continue;
    if (start > offset) parts.push({ text: text.slice(offset, start) });
    parts.push({ text: link, href: link });
    offset = start + link.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}
