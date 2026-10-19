import {
  CHARACTERS,
  createInitialConversation,
  getCharacter,
  restoreConversationState,
  type ConversationState,
} from "./engine.ts";

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  state: ConversationState;
  enabledCharacterIds: string[];
  autoStopped: boolean;
};

export type ChatStore = {
  version: 2;
  sessions: ChatSession[];
  activeId: string;
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export const CHAT_STORAGE_KEY = "kaos-chat.sessions.v2";
export const LEGACY_STORAGE_KEY = "conversation-engine.session.v1";

const ENABLED_BY_DEFAULT = CHARACTERS.map((character) => character.id);
let fallbackIdSequence = 0;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  fallbackIdSequence += 1;
  return `chat-${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}`;
}

export function createChatSession(
  topic?: string,
  now = Date.now(),
): ChatSession {
  const state = createInitialConversation(topic);
  return {
    id: createId(),
    title: state.topic.slice(0, 80) || "Yeni sohbet",
    createdAt: now,
    updatedAt: now,
    state,
    enabledCharacterIds: [...ENABLED_BY_DEFAULT],
    autoStopped: false,
  };
}

function parseSession(raw: unknown): ChatSession | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.title !== "string"
  ) {
    return null;
  }
  const state = restoreConversationState(value.state);
  if (!state) return null;
  const enabledCharacterIds = Array.isArray(value.enabledCharacterIds)
    ? [...new Set(value.enabledCharacterIds)]
        .filter(
          (id): id is string =>
            typeof id === "string" && getCharacter(id) !== undefined,
        )
        .slice(0, CHARACTERS.length)
    : [...ENABLED_BY_DEFAULT];
  return {
    id: value.id.slice(0, 100),
    title: value.title.trim().slice(0, 80) || state.topic.slice(0, 80),
    createdAt:
      typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
        ? value.createdAt
        : Date.now(),
    updatedAt:
      typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : Date.now(),
    state,
    enabledCharacterIds,
    autoStopped: value.autoStopped === true,
  };
}

function createStore(sessions: ChatSession[]): ChatStore {
  const uniqueSessions = sessions.filter(
    (session, index, all) =>
      all.findIndex((candidate) => candidate.id === session.id) === index,
  );
  const safeSessions =
    uniqueSessions.length > 0 ? uniqueSessions : [createChatSession()];
  return {
    version: 2,
    sessions: safeSessions,
    activeId: safeSessions[0].id,
  };
}

function loadLegacy(storage: StorageLike): ChatStore | null {
  try {
    const raw = storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const state = restoreConversationState(JSON.parse(raw));
    if (!state) return null;
    const now = Date.now();
    const session: ChatSession = {
      id: createId(),
      title: state.topic.slice(0, 80) || "Önceki sohbet",
      createdAt: state.messages[0]?.createdAt ?? now,
      updatedAt: state.messages.at(-1)?.createdAt ?? now,
      state,
      enabledCharacterIds: [...ENABLED_BY_DEFAULT],
      autoStopped: false,
    };
    return { version: 2, sessions: [session], activeId: session.id };
  } catch {
    return null;
  }
}

export function loadChatStore(storage: StorageLike): ChatStore {
  try {
    const raw = storage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>).version === 2 &&
        Array.isArray((parsed as Record<string, unknown>).sessions)
      ) {
        const candidate = parsed as {
          sessions: unknown[];
          activeId?: unknown;
        };
        const sessions = candidate.sessions
          .map(parseSession)
          .filter((session): session is ChatSession => session !== null);
        const store = createStore(sessions);
        const activeId =
          typeof candidate.activeId === "string" &&
          store.sessions.some((session) => session.id === candidate.activeId)
            ? candidate.activeId
            : store.sessions[0].id;
        return { ...store, activeId };
      }
    }
  } catch {
    // Ignore broken localStorage records and recover with a fresh session.
  }
  return loadLegacy(storage) ?? createStore([]);
}

export function saveChatStore(
  storage: StorageLike,
  store: ChatStore,
): void {
  storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(store));
}

export function renameChatSession(
  store: ChatStore,
  sessionId: string,
  title: string,
  now = Date.now(),
): ChatStore {
  const cleanTitle = title.trim().slice(0, 80);
  if (!cleanTitle) return store;
  return {
    ...store,
    sessions: store.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, title: cleanTitle, updatedAt: now }
        : session,
    ),
  };
}

export function deleteChatSession(
  store: ChatStore,
  sessionId: string,
  now = Date.now(),
): ChatStore {
  const sessions = store.sessions.filter((session) => session.id !== sessionId);
  if (sessions.length === 0) {
    const replacement = createChatSession(undefined, now);
    return {
      version: 2,
      sessions: [replacement],
      activeId: replacement.id,
    };
  }
  return {
    version: 2,
    sessions,
    activeId:
      store.activeId === sessionId
        ? sessions[0].id
        : store.activeId,
  };
}

export function exportChatJson(session: ChatSession): string {
  const characters = CHARACTERS.map((character) => ({
    id: character.id,
    name: character.name,
    personality: character.role,
    source:
      character.source === "local"
        ? "Yerel simülasyon"
        : character.source === "openai"
          ? "OpenAI API"
          : "Google Gemini API",
  }));
  const messages = session.state.messages.map((message, index) => ({
    order: index + 1,
    speakerId: message.speakerId,
    speakerName:
      message.speakerId === "user"
        ? "Sen"
        : getCharacter(message.speakerId)?.name ?? "Bilinmeyen karakter",
    source: message.source ?? "local",
    content: message.text,
    purpose: message.purpose,
    sentAt: message.createdAt,
    sentAtIso: new Date(message.createdAt).toISOString(),
  }));
  return JSON.stringify(
    {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      topic: session.state.topic,
      characters,
      messages,
    },
    null,
    2,
  );
}

export function exportChatText(session: ChatSession): string {
  const lines = [
    `Kaos Chat — ${session.title}`,
    `Sohbet kimliği: ${session.id}`,
    `Konu: ${session.state.topic}`,
    `Oluşturulma: ${new Date(session.createdAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`,
    "",
  ];
  session.state.messages.forEach((message, index) => {
    const speaker =
      message.speakerId === "user"
        ? "Sen"
        : getCharacter(message.speakerId)?.name ?? "Bilinmeyen karakter";
    const timestamp = new Date(message.createdAt).toLocaleString("tr-TR", {
      timeZone: "Europe/Istanbul",
      dateStyle: "short",
      timeStyle: "medium",
    });
    lines.push(`${index + 1}. [${timestamp}] ${speaker}:`);
    lines.push(message.text);
    lines.push("");
  });
  return lines.join("\n");
}

export function updateSession(
  store: ChatStore,
  sessionId: string,
  update: (session: ChatSession) => ChatSession,
): ChatStore {
  return {
    ...store,
    sessions: store.sessions.map((session) =>
      session.id === sessionId ? update(session) : session,
    ),
  };
}
