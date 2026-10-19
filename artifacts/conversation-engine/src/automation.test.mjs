import assert from "node:assert/strict";
import test from "node:test";
import { AutomaticConversationController } from "./automation.ts";
import { CHARACTERS, createInitialConversation } from "./engine.ts";

function makePort({ wait = async () => {}, onState } = {}) {
  const sessionId = "test-session";
  let state = createInitialConversation("Toplu taşıma şehirleri nasıl etkiler?");
  const enabled = CHARACTERS.map((character) => character.id);
  const apiCalls = [];
  const errors = [];
  const port = {
    getEnabledCharacterIds: () => enabled,
    getState: () => state,
    setState: (_id, next) => {
      state = next;
      onState?.(state);
      return true;
    },
    isCurrentSession: (id) => id === sessionId,
    requestProviderReply: async (character, currentState, signal) => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      apiCalls.push(character.id);
      return `${character.name} API yanıtı, tur ${currentState.progress + 1}.`;
    },
    onTyping: () => {},
    onError: (message) => errors.push(message),
    onNoActiveCharacters: () => errors.push("no-active-characters"),
    onRunningChange: () => {},
    wait,
  };
  return { port, sessionId, getState: () => state, apiCalls, errors };
}

test("a five-message automatic run adds exactly five messages across the five characters", async () => {
  const fixture = makePort();
  const controller = new AutomaticConversationController({
    ...fixture.port,
    intervalMs: 0,
  });
  assert.equal(controller.start(fixture.sessionId, 5), true);
  await controller.waitForCurrentRun();

  const generated = fixture.getState().messages.slice(1);
  assert.equal(generated.length, 5);
  assert.deepEqual(
    generated.map((message) => message.speakerId),
    ["chatgpt", "gemini", "claude", "grok", "deepseek"],
  );
  assert.equal(controller.isRunning, false);
  assert.deepEqual(fixture.errors, []);
});

test("repeated start calls do not create a second automatic loop", async () => {
  let releaseWait;
  const wait = (_ms, signal) => new Promise((resolve, reject) => {
    releaseWait = resolve;
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const fixture = makePort({ wait });
  const controller = new AutomaticConversationController(fixture.port);
  assert.equal(controller.start(fixture.sessionId, 5), true);
  assert.equal(controller.start(fixture.sessionId, 5), false);

  // Let the first turn complete, then stop while the loop is waiting.
  while (fixture.getState().messages.length < 2) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  controller.stop();
  releaseWait?.();
  await controller.waitForCurrentRun();
  assert.equal(fixture.getState().messages.length, 2);
  assert.equal(controller.isRunning, false);
});

test("no enabled characters produces a clear warning and no generated messages", async () => {
  const fixture = makePort();
  fixture.port.getEnabledCharacterIds = () => [];
  const controller = new AutomaticConversationController(fixture.port);
  controller.start(fixture.sessionId, 5);
  await controller.waitForCurrentRun();
  assert.equal(fixture.getState().messages.length, 1);
  assert.deepEqual(fixture.errors, ["no-active-characters"]);
});

test("stop aborts an in-flight provider request without appending a late reply", async () => {
  let requestStarted;
  const started = new Promise((resolve) => { requestStarted = resolve; });
  const fixture = makePort();
  fixture.port.requestProviderReply = (_character, _state, signal) => new Promise((resolve, reject) => {
    requestStarted();
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const controller = new AutomaticConversationController(fixture.port);
  controller.start(fixture.sessionId, 5);
  await started;
  controller.stop();
  await controller.waitForCurrentRun();
  assert.equal(fixture.getState().messages.length, 1);
  assert.equal(controller.isRunning, false);
});
