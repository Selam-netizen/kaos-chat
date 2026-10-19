import {
  CreateChatGptReplyBody,
  CreateChatGptReplyResponse,
  CreateGeminiReplyBody,
  CreateGeminiReplyResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ProviderRequestError,
  requestProviderReply,
  type ChatProvider,
} from "../providers";

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 30;
const requestBuckets = new Map<string, { startedAt: number; count: number }>();

function hasRequestCapacity(key: string): boolean {
  const now = Date.now();
  const current = requestBuckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

function requestSchema(provider: ChatProvider) {
  return provider === "openai" ? CreateChatGptReplyBody : CreateGeminiReplyBody;
}

function responseSchema(provider: ChatProvider) {
  return provider === "openai"
    ? CreateChatGptReplyResponse
    : CreateGeminiReplyResponse;
}

function providerName(provider: ChatProvider): string {
  return provider === "openai" ? "ChatGPT" : "Gemini";
}

export function createProviderRouter(provider: ChatProvider): IRouter {
  const router: IRouter = Router();
  const schema = requestSchema(provider);
  const replySchema = responseSchema(provider);

  router.post(`/${provider === "openai" ? "chatgpt" : "gemini"}`, async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "İstek biçimi geçersiz. Konu ve son konuşma mesajlarını kontrol edin.",
        code: "invalid_request",
      });
      return;
    }

    const bucket = `${req.ip ?? "unknown"}:${provider}`;
    if (!hasRequestCapacity(bucket)) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({
        error: `${providerName(provider)} için istek sınırına ulaşıldı. Biraz bekleyip yeniden deneyin.`,
        code: "rate_limited",
      });
      return;
    }

    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    req.once("aborted", abortRequest);
    res.once("close", () => {
      if (!res.writableEnded) abortRequest();
    });

    try {
      const result = await requestProviderReply(provider, parsed.data, {
        signal: controller.signal,
      });
      const checked = replySchema.safeParse(result);
      if (!checked.success) {
        res.status(502).json({
          error: `${providerName(provider)} kullanılabilir bir metin yanıtı döndürmedi.`,
          code: "empty_response",
        });
        return;
      }
      res.json(checked.data);
    } catch (error) {
      if (req.aborted || res.destroyed) return;

      if (error instanceof ProviderRequestError) {
        req.log.warn(
          { provider, statusCode: error.statusCode, code: error.code },
          "Provider request failed",
        );
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      req.log.warn({ provider }, "Unexpected provider request failure");
      res.status(502).json({
        error: `${providerName(provider)} isteği tamamlanamadı.`,
        code: "provider_error",
      });
    } finally {
      req.off("aborted", abortRequest);
    }
  });

  return router;
}
