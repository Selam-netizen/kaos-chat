import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceConversation,
  addUserMessage,
  CHARACTERS,
  LOCAL_CHARACTERS,
  createInitialConversation,
  generateReply,
} from "./engine.ts";

const STOP_WORDS = new Set(
  "acaba ama ancak artık aslında az bazı ben bence beri bir biz bu bütün da daha de değil diye dolayı en fakat gibi hem hep her hiç için ile ise kadar karşı ki mı mi mu mü ne neden nerede nasıl o olan olarak önce sonra şu ve veya ya yani yine yok çok".split(
    " ",
  ),
);

function messageSimilarity(first, second) {
  const shingles = (text) => {
    const words = text
      .toLocaleLowerCase("tr-TR")
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
    const result = new Set();
    for (let index = 0; index < words.length - 1; index += 1) {
      result.add(`${words[index]} ${words[index + 1]}`);
    }
    return result;
  };
  const firstSet = shingles(first);
  const secondSet = shingles(second);
  if (!firstSet.size || !secondSet.size) return 0;
  const overlap = [...firstSet].filter((item) => secondSet.has(item)).length;
  return overlap / (firstSet.size + secondSet.size - overlap);
}

test("registers all five characters with the correct provider sources", () => {
  assert.equal(CHARACTERS.length, 5);
  assert.deepEqual(
    CHARACTERS.map(({ id, source }) => [id, source]),
    [
      ["chatgpt", "openai"],
      ["gemini", "gemini"],
      ["claude", "local"],
      ["grok", "local"],
      ["deepseek", "local"],
    ],
  );
});

test("answers a user question and records that the question was addressed", () => {
  const initial = createInitialConversation(
    "Uzaktan çalışma şehir hayatını iyileştirir mi?",
  );

  assert.equal(initial.openQuestions.length, 1);
  const answered = generateReply(initial);
  const reply = answered.messages.at(-1);

  assert.equal(reply.purpose, "Açık soruyu yanıtlama");
  assert.match(reply.text, /sorusunu şöyle anlıyorum/u);
  assert.equal(answered.openQuestions[0].answered, true);
});

test("labels evidence, assumptions, opinions, and jokes as inferred categories", () => {
  let state = createInitialConversation("Şehirlerde ulaşım seçenekleri");
  state = addUserMessage(
    state,
    "Bir araştırma, katılımcıların yüzde 62'sinin otobüs kullandığını bildirdi.",
  );
  state = addUserMessage(
    state,
    "Belki daha sık sefer olursa insanlar özel araçlarını daha az kullanabilir.",
  );
  state = addUserMessage(
    state,
    "Bence toplu taşıma herkes için daha erişilebilir olmalı.",
  );
  state = addUserMessage(state, "Otobüs durağı da bana kahve ısmarlasın, şaka.");

  assert.deepEqual(
    state.claims.slice(-4).map((claim) => claim.kind),
    ["fact", "assumption", "opinion", "joke"],
  );
  assert.equal(state.claims.at(-4).speakerId, "user");
});

test("a 30-turn discussion stays contextual, non-repetitive, and keeps distinct positions", () => {
  let state = createInitialConversation(
    "Şehirlerde otomobil kullanımını azaltmak, yaşam kalitesini artırabilir.",
  );
  assert.equal(state.openQuestions.length, 0);
  state = advanceConversation(state, 3);

  assert.deepEqual(
    CHARACTERS.map((character) => character.id),
    ["chatgpt", "gemini", "claude", "grok", "deepseek"],
    "all five characters should be registered for the UI and async controller",
  );
  assert.deepEqual(
    state.messages.slice(-3).map((message) => message.speakerId),
    LOCAL_CHARACTERS.map((character) => character.id),
    "the synchronous engine only generates local simulated characters",
  );
  assert.match(state.messages.at(-3).text, /fayda|erişim/u);
  assert.match(state.messages.at(-2).text, /maliyet|yük|yan etki/u);
  assert.match(state.messages.at(-1).text, /ölçüt|karşılaştır/u);

  state = addUserMessage(
    state,
    "Herkes bu uygulamadan aynı ölçüde fayda görür.",
  );
  const challenged = generateReply(state);
  assert.equal(challenged.lastPurpose, "Genellemeyi sınama");
  assert.match(challenged.messages.at(-1).text, /herkes|kesin ifade/u);
  state = addUserMessage(
    challenged,
    "Bu sonucu hangi ölçütle değerlendirelim?",
  );

  const before = state.messages.length;
  state = advanceConversation(state, 30);
  const generated = state.messages.slice(before);
  const generatedTexts = generated.map((message) => message.text);

  assert.equal(generated.length, 30);
  assert.equal(state.progress, 34);
  assert.equal(new Set(generatedTexts).size, 30, "replies should be unique");
  assert.equal(state.repetitionCount, 0, "no repeated replies should be recorded");
  const closestPair = generatedTexts.flatMap((message, index) =>
    generatedTexts.slice(index + 1).map((laterMessage) =>
      messageSimilarity(message, laterMessage),
    ),
  );
  assert.ok(
    Math.max(...closestPair) < 0.8,
    "no two generated replies should be near-duplicates",
  );
  assert.ok(
    new Set(generated.map((message) => message.purpose)).size >= 5,
    "the reasoning goals should develop instead of looping",
  );
  const purposes = new Set(generated.map((message) => message.purpose));
  assert.ok(
    purposes.has("Argümanları karşılaştırma"),
    "characters should compare the different positions",
  );
  assert.ok(
    purposes.has("Alternatif arama"),
    "the discussion should consider other ways to reach its goal",
  );
  assert.ok(
    generated.every((message) => message.text.length > 80),
    "each message should add a substantive response",
  );
  assert.ok(
    generated.every((message) => message.speakerId !== "user"),
    "the 30-message run should be consecutive character messages",
  );

  const memoryTurns = state.memories
    .filter((memory) => LOCAL_CHARACTERS.some((character) => character.id === memory.speakerId))
    .map((memory) => memory.turns);
  assert.deepEqual(memoryTurns, [12, 11, 11]);
  const localMemories = state.memories.filter((memory) =>
    LOCAL_CHARACTERS.some((character) => character.id === memory.speakerId),
  );
  assert.equal(new Set(localMemories.map((memory) => memory.position)).size, 3);
  assert.ok(localMemories.every((memory) => memory.lastClaim.length > 0));
  assert.ok(
    state.messages
      .slice(-30)
      .some((message) => /herkes|ölçüt|otomobil/u.test(message.text)),
    "later replies should retain topic and earlier claims",
  );
  assert.ok(
    state.openQuestions.some((question) => question.answered),
    "the engine should track questions through to an answer",
  );
});

test("an explicit topic change updates the topic without discarding conversation history", () => {
  const initial = createInitialConversation("Şehir içi ulaşım");
  const next = addUserMessage(
    initial,
    "Konuyu değiştirelim: Mahalle kütüphanelerinin geleceği.",
  );

  assert.match(next.topic, /Mahalle kütüphanelerinin geleceği/u);
  assert.equal(next.messages.length, 2);
  assert.equal(next.messages[0].text, initial.topic);
  assert.equal(next.messages[1].speakerId, "user");
});
