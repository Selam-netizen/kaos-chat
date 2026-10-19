import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_STORAGE_KEY,
  createChatSession,
  deleteChatSession,
  exportChatJson,
  exportChatText,
  loadChatStore,
  renameChatSession,
  saveChatStore,
  updateSession,
} from "./chatStorage.ts";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("chat history survives save and reload and keeps separate sessions", () => {
  const storage = memoryStorage();
  const first = createChatSession("İlk sohbet", 1000);
  const second = createChatSession("İkinci sohbet", 2000);
  const store = {
    version: 2,
    sessions: [first, second],
    activeId: second.id,
  };
  saveChatStore(storage, store);
  const restored = loadChatStore(storage);
  assert.equal(restored.sessions.length, 2);
  assert.equal(restored.activeId, second.id);
  assert.deepEqual(restored.sessions.map((session) => session.title), ["İlk sohbet", "İkinci sohbet"]);
  assert.ok(storage.getItem(CHAT_STORAGE_KEY));
});

test("renaming and deleting one chat does not remove the other chats", () => {
  const first = createChatSession("Bir", 1000);
  const second = createChatSession("İki", 2000);
  let store = { version: 2, sessions: [first, second], activeId: first.id };
  store = renameChatSession(store, first.id, "Yeni başlık");
  assert.equal(store.sessions[0].title, "Yeni başlık");
  store = deleteChatSession(store, first.id);
  assert.equal(store.sessions.length, 1);
  assert.equal(store.sessions[0].id, second.id);
});

test("TXT and JSON exports include ordered messages, character metadata, and Turkish text", () => {
  const session = createChatSession("Türkçe sohbet", 1000);
  const state = {
    ...session.state,
    messages: [
      ...session.state.messages,
      {
        id: "m1",
        speakerId: "claude",
        text: "İçerik: ı, İ, ş, ğ, ü, ö, ç",
        purpose: "Örnek",
        label: "Yanıt",
        createdAt: 2000,
        source: "local",
      },
    ],
  };
  const updated = { ...session, state };
  const txt = exportChatText(updated);
  const json = JSON.parse(exportChatJson(updated));
  assert.match(txt, /Claude/u);
  assert.match(txt, /İçerik: ı, İ, ş, ğ, ü, ö, ç/u);
  assert.equal(json.messages[1].order, 2);
  assert.equal(json.messages[1].speakerName, "Claude");
  assert.match(json.messages[1].content, /İçerik/u);
});
