export const INITIAL_VISIBLE_POSTS = 24;

export function uniqueStrings(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function visibleItems(items = [], limit = INITIAL_VISIBLE_POSTS) {
  return items.slice(0, Math.max(0, limit));
}
