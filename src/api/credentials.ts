// The shared edit key and the editor's name live in this browser only (localStorage).
// They are conveniences, never schedule data. See docs/design.md §9.

const KEY = 'cogsworth:edit-key';
const NAME = 'cogsworth:editor-name';

function read(k: string): string {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
}

function write(k: string, v: string) {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    // Storage blocked: the value lasts until the tab closes.
  }
  memory[k] = v;
}

const memory: Record<string, string> = {};

export const credentials = {
  key: () => memory[KEY] ?? read(KEY),
  name: () => memory[NAME] ?? read(NAME),
  setKey: (v: string) => write(KEY, v.trim()),
  setName: (v: string) => write(NAME, v.trim()),
};
