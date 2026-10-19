import type {
  ChatProviderStatus,
  ChatTurnInput,
} from "@workspace/api-client-react";
import { getCharacter, type Character, type ConversationState } from "./engine";

export class ProviderClientError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ProviderClientError";
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchProviderStatus(
  signal?: AbortSignal,
): Promise<ChatProviderStatus> {
  const response = await fetch("/api/chat-status", { signal });
  const data = await readJson(response);
  if (!response.ok || !data || typeof data !== "object") {
    throw new ProviderClientError(
      "API durum bilgisi alınamadı.",
      response.status,
      "provider_error",
    );
  }
  return data as ChatProviderStatus;
}

export function buildProviderInput(
  character: Character,
  state: ConversationState,
): ChatTurnInput {
  const provider = character.source;
  if (provider === "local") {
    throw new ProviderClientError(
      "Yerel karakterler API isteği kullanmaz.",
      400,
      "invalid_request",
    );
  }

  const body: ChatTurnInput = {
    topic: state.topic.slice(0, 300),
    messages: state.messages.slice(-20).map((message) => ({
      role: message.speakerId === "user" ? "user" : "assistant",
      speakerName:
        message.speakerId === "user"
          ? "Kullanıcı"
          : getCharacter(message.speakerId)?.name ?? "Karakter",
      content: message.text.slice(0, 2000),
    })),
  };
  return body;
}

export async function fetchCharacterReply(
  character: Character,
  state: ConversationState,
  signal: AbortSignal,
): Promise<string> {
  const provider = character.source;
  const body = buildProviderInput(character, state);
  const path = provider === "openai" ? "/api/chatgpt" : "/api/gemini";
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await readJson(response);
  if (!response.ok) {
    const errorData =
      data && typeof data === "object"
        ? (data as { error?: unknown; code?: unknown })
        : null;
    throw new ProviderClientError(
      typeof errorData?.error === "string"
        ? errorData.error
        : `${character.name} yanıt veremedi. Sunucu durumunu kontrol edin.`,
      response.status,
      typeof errorData?.code === "string"
        ? errorData.code
        : "provider_error",
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as { text?: unknown }).text !== "string" ||
    !(data as { text: string }).text.trim()
  ) {
    throw new ProviderClientError(
      `${character.name} kullanılabilir bir yanıt döndürmedi.`,
      502,
      "empty_response",
    );
  }
  return (data as { text: string }).text.trim();
}
