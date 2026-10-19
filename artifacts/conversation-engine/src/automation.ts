import {
  advanceTurnCursor,
  appendCharacterReply,
  generateReplyForSpeaker,
  isDuplicateReply,
  nextAutomatedCharacter,
  type Character,
  type ConversationState,
} from "./engine.ts";

export type AutomaticRunPort = {
  getEnabledCharacterIds: (sessionId: string) => string[];
  getState: (sessionId: string) => ConversationState | null;
  setState: (sessionId: string, next: ConversationState) => boolean;
  isCurrentSession: (sessionId: string) => boolean;
  requestProviderReply: (
    character: Character,
    state: ConversationState,
    signal: AbortSignal,
  ) => Promise<string>;
  onTyping: (speakerId: string | null) => void;
  onError: (message: string) => void;
  onNoActiveCharacters: () => void;
  onRunningChange?: (running: boolean) => void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  intervalMs?: number;
};

function waitForInterval(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class AutomaticConversationController {
  private active = false;
  private runId = 0;
  private runController: AbortController | null = null;
  private requestController: AbortController | null = null;
  private retryInterruptedTurn = false;
  private runPromise: Promise<void> = Promise.resolve();
  private readonly port: AutomaticRunPort;

  constructor(port: AutomaticRunPort) {
    this.port = port;
  }

  get isRunning(): boolean {
    return this.active;
  }

  start(sessionId: string, messageLimit: number | null): boolean {
    if (this.active) return false;
    const safeLimit =
      messageLimit === null
        ? null
        : Math.max(1, Math.min(1000, Math.floor(messageLimit)));
    const runId = ++this.runId;
    const controller = new AbortController();
    this.runController = controller;
    this.active = true;
    this.retryInterruptedTurn = false;
    this.port.onRunningChange?.(true);

    this.runPromise = this.run(sessionId, safeLimit, runId, controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        this.port.onError(
          error instanceof Error
            ? error.message
            : "Otomatik sohbet sırasında beklenmeyen bir hata oluştu.",
        );
      })
      .finally(() => {
        if (this.runId !== runId) return;
        this.active = false;
        this.requestController = null;
        this.runController = null;
        this.retryInterruptedTurn = false;
        this.port.onTyping(null);
        this.port.onRunningChange?.(false);
      });
    return true;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.runId += 1;
    this.retryInterruptedTurn = false;
    this.requestController?.abort();
    this.runController?.abort();
    this.requestController = null;
    this.runController = null;
    this.port.onTyping(null);
    this.port.onRunningChange?.(false);
  }

  cancelCurrentTurnForNewMessage(): void {
    if (!this.active || !this.requestController) return;
    this.retryInterruptedTurn = true;
    this.requestController.abort();
  }

  async waitForCurrentRun(): Promise<void> {
    await this.runPromise;
  }

  private isLive(sessionId: string, runId: number, signal: AbortSignal) {
    return (
      this.active &&
      this.runId === runId &&
      !signal.aborted &&
      this.port.isCurrentSession(sessionId)
    );
  }

  private async run(
    sessionId: string,
    messageLimit: number | null,
    runId: number,
    signal: AbortSignal,
  ): Promise<void> {
    let generatedMessages = 0;
    let consecutiveDuplicates = 0;
    const wait = this.port.wait ?? waitForInterval;

    while (
      this.isLive(sessionId, runId, signal) &&
      (messageLimit === null || generatedMessages < messageLimit)
    ) {
      let state = this.port.getState(sessionId);
      if (!state) return;

      const next = nextAutomatedCharacter(
        state,
        this.port.getEnabledCharacterIds(sessionId),
      );
      if (!next) {
        this.port.onNoActiveCharacters();
        return;
      }
      if (next.skipped > 0) {
        state = advanceTurnCursor(state, next.skipped);
        if (!this.port.setState(sessionId, state)) return;
      }

      const { character } = next;
      const contextMessageCount = state.messages.length;
      const contextLastMessageId = state.messages.at(-1)?.id;
      this.port.onTyping(character.id);

      try {
        let text: string;
        if (character.source === "local") {
          const generated = generateReplyForSpeaker(state, character.id);
          text = generated.messages.at(-1)?.text ?? "";
        } else {
          const controller = new AbortController();
          this.requestController = controller;
          const abortFromRun = () => controller.abort(signal.reason);
          signal.addEventListener("abort", abortFromRun, { once: true });
          try {
            text = await this.port.requestProviderReply(
              character,
              state,
              controller.signal,
            );
          } finally {
            signal.removeEventListener("abort", abortFromRun);
            if (this.requestController === controller) {
              this.requestController = null;
            }
          }
        }

        if (!this.isLive(sessionId, runId, signal)) return;
        const currentState = this.port.getState(sessionId);
        if (!currentState) return;
        const contextChanged =
          currentState.messages.length !== contextMessageCount ||
          currentState.messages.at(-1)?.id !== contextLastMessageId;
        if (contextChanged) {
          if (character.source !== "local") this.retryInterruptedTurn = false;
          continue;
        }

        if (isDuplicateReply(currentState, text)) {
          const skipped = appendCharacterReply(
            currentState,
            character.id,
            text,
          );
          const advanced = advanceTurnCursor(skipped, 1);
          if (!this.port.setState(sessionId, advanced)) return;
          consecutiveDuplicates += 1;
          if (consecutiveDuplicates >= 3) {
            this.port.onError(
              "Üç yinelenen yanıt atlandı. Otomatik sohbet tekrar döngüsünü önlemek için durduruldu.",
            );
            return;
          }
        } else {
          const nextState =
            character.source === "local"
              ? generateReplyForSpeaker(currentState, character.id)
              : appendCharacterReply(currentState, character.id, text);
          if (nextState.messages.length === currentState.messages.length) {
            const advanced = advanceTurnCursor(nextState, 1);
            if (!this.port.setState(sessionId, advanced)) return;
            consecutiveDuplicates += 1;
            if (consecutiveDuplicates >= 3) {
              this.port.onError(
                "Tekrarlanan yanıtlar otomatik sohbeti durdurdu.",
              );
              return;
            }
          } else {
            if (!this.port.setState(sessionId, nextState)) return;
            generatedMessages += 1;
            consecutiveDuplicates = 0;
          }
        }
      } catch (error) {
        if (!this.isLive(sessionId, runId, signal)) return;
        if (this.retryInterruptedTurn) {
          this.retryInterruptedTurn = false;
          continue;
        }
        this.port.onError(
          error instanceof Error
            ? error.message
            : `${character.name} yanıt veremedi.`,
        );
        return;
      } finally {
        if (this.isLive(sessionId, runId, signal)) this.port.onTyping(null);
      }

      if (
        messageLimit !== null &&
        generatedMessages >= messageLimit
      ) {
        return;
      }

      try {
        await wait(this.port.intervalMs ?? 1000, signal);
      } catch {
        return;
      }
    }
  }
}
