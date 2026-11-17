export const pl = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
export const zap = (n) => `${n} ${pl(n, 'запись', 'записи', 'записей')}`;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
export function linkify(text) {
  return String(text).split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    let host = part;
    try { host = new URL(part).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
    return `<a class="lnk" href="${esc(part)}" target="_blank" rel="noopener">${esc(host)}</a>`;
  }).join('');
}

export function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
