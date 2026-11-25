/** История занятий — только на этом устройстве (localStorage). Никаких серверов. */
export type SessionRecord = { date: string; total: number; done: number; check: number };

const KEY = "seriq_sessions";

export function loadHistory(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveSession(rec: SessionRecord): SessionRecord[] {
  const list = [rec, ...loadHistory()].slice(0, 20);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* хранилище недоступно — просто не сохраняем */
  }
  return list;
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("seriq_lang");
  } catch {
    /* ничего страшного */
  }
}
