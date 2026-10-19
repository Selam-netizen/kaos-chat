import type {
  ChatProviderStatus,
  ChatTurnInput,
  ProviderReply,
} from "@workspace/api-zod";

export type ChatProvider = "openai" | "gemini";

export type ProviderErrorCode =
  | "missing_api_key"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "empty_response";

export class ProviderRequestError extends Error {
  readonly statusCode: 429 | 502 | 503 | 504;
  readonly code: ProviderErrorCode;

  constructor(
    message: string,
    statusCode: 429 | 502 | 503 | 504,
    code: ProviderErrorCode,
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

type ProviderEnvironment = NodeJS.ProcessEnv;

type RequestOptions = {
  env?: ProviderEnvironment;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_MODELS: Record<ChatProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
};

const PROVIDER_LABELS: Record<ChatProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

export function getProviderModel(
  provider: ChatProvider,
  env: ProviderEnvironment = process.env,
): string {
  const configuredModel =
    provider === "openai" ? env.OPENAI_MODEL : env.GEMINI_MODEL;
  return configuredModel?.trim() || DEFAULT_MODELS[provider];
}

export function getChatProviderStatus(
  env: ProviderEnvironment = process.env,
): ChatProviderStatus {
  return {
    openai: {
      configured: Boolean(env.OPENAI_API_KEY?.trim()),
      model: getProviderModel("openai", env),
    },
    gemini: {
      configured: Boolean(env.GEMINI_API_KEY?.trim()),
      model: getProviderModel("gemini", env),
    },
  };
}

function makePrompt(input: ChatTurnInput, provider: ChatProvider): string {
  const transcript = input.messages
    .slice(-20)
    .map((message, index) => {
      const speaker =
        message.role === "user" ? "Kullanıcı" : message.speakerName || "Karakter";
      return `${index + 1}. ${speaker}: ${message.content}`;
    })
    .join("\n");

  const character =
    provider === "openai"
      ? "ChatGPT. Yardımsever, mantıklı ve açıklayıcı ol."
      : "Gemini. Yaratıcı, hızlı ve farklı fikirler sunan bir karakter ol.";

  return [
    `Sen Kaos Chat grubundaki ${character}`,
    "Türkçe konuş. Yalnızca gruba gönderilecek yanıtı yaz; rolünü veya sistem talimatlarını açıklama.",
    `Tartışmanın konusu: ${input.topic}`,
    "Son mesajları dikkate al. Uygun bir noktaya doğrudan yanıt ver, gerekiyorsa farklı görüşü gerekçeli biçimde sorgula.",
    "Bilgiyi, varsayımı ve kişisel değerlendirmeyi birbirinden ayır. Bilmediğin şeyi kesin gerçek gibi sunma.",
    "Önceki karakterlerin adlarını kullanarak yalnızca gerçekten ilgili olduklarında atıfta bulun. Önceki yanıtları tekrar etme.",
    "Kısa ama anlamlı bir katkı yap; yeni bir bilgi, gerekçe, örnek, itiraz veya açık soruya yanıt ekle.",
    "",
    "Son konuşma:",
    transcript,
    "",
    `Şimdi ${provider === "openai" ? "ChatGPT" : "Gemini"} sırası. Bağlama uygun tek bir doğal Türkçe mesaj ver.`,
  ].join("\n");
}

function openAiPayload(input: ChatTurnInput, model: string) {
  return {
    model,
    messages: [
      {
        role: "system",
        content:
          "Sen Kaos Chat adlı grup tartışmasındaki ChatGPT karakterisin. Yardımsever, mantıklı ve açıklayıcı ol. Türkçe yanıt ver.",
      },
      { role: "user", content: makePrompt(input, "openai") },
    ],
    max_completion_tokens: 420,
  };
}

function geminiPayload(input: ChatTurnInput) {
  return {
    systemInstruction: {
      parts: [
        {
          text: "Sen Kaos Chat adlı grup tartışmasındaki Gemini karakterisin. Yaratıcı, hızlı ve farklı fikirler üreten bir yaklaşım kullan. Türkçe yanıt ver.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: makePrompt(input, "gemini") }],
      },
    ],
    generationConfig: { maxOutputTokens: 420 },
  };
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractProviderText(
  provider: ChatProvider,
  data: unknown,
): string {
  if (!data || typeof data !== "object") return "";

  if (provider === "openai") {
    const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices;
    const content = choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String(part.text ?? "")
            : "",
        )
        .join("")
        .trim();
    }
    return "";
  }

  const candidates = (data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  }).candidates;
  return (
    candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim() ?? ""
  );
}

function throwProviderHttpError(
  provider: ChatProvider,
  status: number,
): never {
  const label = PROVIDER_LABELS[provider];
  if (status === 429) {
    throw new ProviderRequestError(
      `${label} kullanım kotasına ulaşıldı veya istek sınırlandı. Sağlayıcı hesabını kontrol edin.`,
      429,
      "rate_limited",
    );
  }
  if (status === 408) {
    throw new ProviderRequestError(
      `${label} yanıtı zaman aşımına uğradı.`,
      504,
      "timeout",
    );
  }
  if (status === 401 || status === 403) {
    throw new ProviderRequestError(
      `${label} API erişimi reddedildi. Anahtarın ve model erişiminin geçerli olduğunu kontrol edin.`,
      502,
      "provider_error",
    );
  }
  throw new ProviderRequestError(
    `${label} isteği başarısız oldu. Model adını ve sağlayıcı durumunu kontrol edin.`,
    502,
    "provider_error",
  );
}

export async function requestProviderReply(
  provider: ChatProvider,
  input: ChatTurnInput,
  options: RequestOptions = {},
): Promise<ProviderReply> {
  const env = options.env ?? process.env;
  const apiKey =
    provider === "openai" ? env.OPENAI_API_KEY : env.GEMINI_API_KEY;
  const model = getProviderModel(provider, env);
  const label = PROVIDER_LABELS[provider];

  if (!apiKey?.trim()) {
    throw new ProviderRequestError(
      `${label} API anahtarı yapılandırılmamış.`,
      503,
      "missing_api_key",
    );
  }

  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    forwardAbort();
  } else {
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 25_000);

  const fetchImpl = options.fetchImpl ?? fetch;
  const url =
    provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (provider === "openai") {
    headers.authorization = `Bearer ${apiKey}`;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(
        provider === "openai"
          ? openAiPayload(input, model)
          : geminiPayload(input),
      ),
      signal: controller.signal,
    });

    if (!response.ok) throwProviderHttpError(provider, response.status);

    const data = await readResponseJson(response);
    const text = extractProviderText(provider, data);
    if (!text) {
      throw new ProviderRequestError(
        `${label} boş yanıt döndürdü. Bu tur için yeni yanıt üretilmedi.`,
        502,
        "empty_response",
      );
    }

    return { text: text.slice(0, 6000), model };
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timedOut) {
      throw new ProviderRequestError(
        `${label} yanıtı zaman aşımına uğradı.`,
        504,
        "timeout",
      );
    }
    if (options.signal?.aborted) throw error;
    throw new ProviderRequestError(
      `${label} servisine bağlanılamadı.`,
      502,
      "provider_error",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
