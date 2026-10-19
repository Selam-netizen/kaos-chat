export type Character = {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  source: "openai" | "gemini" | "local";
};

export type Message = {
  id: string;
  speakerId: string;
  text: string;
  purpose: string;
  label: string;
  createdAt: number;
  source?: "user" | "openai" | "gemini" | "local";
};

export type Claim = {
  id: string;
  speakerId: string;
  text: string;
  kind: "fact" | "assumption" | "opinion" | "joke";
  topic: string;
  turn: number;
};

export type OpenQuestion = {
  id: string;
  text: string;
  askedBy: string;
  topic: string;
  answered: boolean;
};

export type SpeakerMemory = {
  speakerId: string;
  position: string;
  positionScore: number;
  previousPosition: string | null;
  changeReason: string | null;
  lastClaim: string;
  turns: number;
};

export type ConversationState = {
  topic: string;
  messages: Message[];
  claims: Claim[];
  openQuestions: OpenQuestion[];
  memories: SpeakerMemory[];
  progress: number;
  phase: string;
  repetitionCount: number;
  lastPurpose: string;
  turnCursor: number;
};

type ReasoningPurpose =
  | "Pozisyonunu açıklama"
  | "Açık soruyu yanıtlama"
  | "Argümanları karşılaştırma"
  | "Genellemeyi sınama"
  | "Varsayımı görünür kılma"
  | "Örnekle somutlaştırma"
  | "Ölçüt belirleme"
  | "Alternatif arama"
  | "Kanıt ile yorumu ayırma"
  | "Uygulama koşulunu değerlendirme"
  | "İlişkili soruya geçiş";

type SpeakerProfile = {
  character: Character;
  opening: string;
  position: string;
  positionScore: number;
  lens: string;
};

const PROFILES: SpeakerProfile[] = [
  {
    character: {
      id: "claude",
      name: "Claude",
      role: "Dikkatli ve analitik yerel karakter",
      initials: "CL",
      color: "#c7835a",
      source: "local",
    },
    opening:
      "Doğru koşullar kurulduğunda bu yaklaşımın gerçek bir fayda ve daha geniş erişim sağlayabileceğini düşünüyorum. Yine de faydanın kimlere ulaştığını görmeden herkes için aynı sonucu verdiğini varsaymam.",
    position: "Koşullar sağlanırsa destekliyor",
    positionScore: 1,
    lens: "erişim ve beklenen fayda",
  },
  {
    character: {
      id: "grok",
      name: "Grok",
      role: "Esprili, sorgulayıcı ve itirazcı yerel karakter",
      initials: "GR",
      color: "#f2a65a",
      source: "local",
    },
    opening:
      "Fayda ihtimali tek başına yeterli gerekçe değil; maliyetleri, kimin yük üstlendiğini ve dışarıda kalanları da hesaba katmak gerekir. İyi niyet, uygulamadaki yan etkileri kendiliğinden ortadan kaldırmaz.",
    position: "Sınırlar görülmeden ikna olmuyor",
    positionScore: -1,
    lens: "maliyet, risk ve dışarıda kalabilecek gruplar",
  },
  {
    character: {
      id: "deepseek",
      name: "DeepSeek",
      role: "Teknik ve sistematik yerel karakter",
      initials: "DS",
      color: "#5bc3d7",
      source: "local",
    },
    opening:
      "İki taraf da farklı bir ölçüte bakıyor olabilir. Sonuca varmadan önce beklenen faydayı uygulama bedeliyle ve aynı amaca ulaşabilecek alternatiflerle karşılaştırmayı öneriyorum.",
    position: "Sonucu ölçülebilir koşullara bağlıyor",
    positionScore: 0,
    lens: "ölçülebilir sonuçlar ve uygulanabilir seçenekler",
  },
];

const API_CHARACTERS: Character[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    role: "OpenAI API · yardımsever, mantıklı ve açıklayıcı",
    initials: "CG",
    color: "#72a7ff",
    source: "openai",
  },
  {
    id: "gemini",
    name: "Gemini",
    role: "Google Gemini API · yaratıcı ve farklı fikirler üreten",
    initials: "GE",
    color: "#8b8cff",
    source: "gemini",
  },
];

export const LOCAL_CHARACTERS: Character[] = PROFILES.map(
  ({ character }) => character,
);

export const CHARACTERS: Character[] = [
  ...API_CHARACTERS,
  ...LOCAL_CHARACTERS,
];

export const AUTOMATED_CHARACTER_ORDER = CHARACTERS.map(
  (character) => character.id,
);

export function getCharacter(speakerId: string): Character | undefined {
  return CHARACTERS.find((character) => character.id === speakerId);
}

const DEFAULT_TOPIC =
  "Şehirlerde otomobil kullanımını azaltmak, yaşam kalitesini artırabilir.";

const STOP_WORDS = new Set([
  "acaba",
  "ama",
  "ancak",
  "artık",
  "aslında",
  "az",
  "bazı",
  "ben",
  "bence",
  "benden",
  "beri",
  "beş",
  "bir",
  "birçok",
  "biri",
  "birkaç",
  "biz",
  "bu",
  "buna",
  "bunu",
  "bunun",
  "bütün",
  "da",
  "daha",
  "de",
  "defa",
  "değil",
  "diye",
  "dolayı",
  "en",
  "fakat",
  "gibi",
  "hem",
  "hep",
  "her",
  "hiç",
  "için",
  "ile",
  "ise",
  "kadar",
  "karşı",
  "ki",
  "kim",
  "mı",
  "mi",
  "mu",
  "mü",
  "ne",
  "neden",
  "nerede",
  "nasıl",
  "o",
  "olan",
  "olarak",
  "olduğu",
  "oldukça",
  "onlar",
  "önce",
  "sonra",
  "şey",
  "şu",
  "ve",
  "veya",
  "ya",
  "yani",
  "yine",
  "yok",
  "çok",
]);

const ASSUMPTION_MARKERS = [
  "varsay",
  "diyelim",
  "farz ed",
  "eğer",
  "varsa",
  "olabilir",
  "muhtemelen",
  "sanırım",
  "galiba",
  "tahmin",
  "belki",
];
const OPINION_MARKERS = [
  "bence",
  "düşünüyorum",
  "kanaatim",
  "gerekir",
  "gereklidir",
  "önemli",
  "tercih",
  "destekliyorum",
  "karşıyım",
  "iyi olur",
  "olmalı",
  "olmalıydı",
];
const FACT_MARKERS = [
  "veri",
  "ölçüm",
  "istatistik",
  "araştırma",
  "rapor",
  "gözlem",
  "anket",
  "yüzde",
  "oranı",
  "kayıt",
];
const JOKE_MARKERS = [
  "şaka",
  "espri",
  "komik",
  "haha",
  "ahah",
  "güldüm",
  "şaka bir yana",
];

const POSITIVE_MARKERS = [
  "artır",
  "iyileş",
  "fayda",
  "yarar",
  "destek",
  "olumlu",
  "avantaj",
  "gerekli",
  "iyi",
  "verimli",
  "başarılı",
];
const NEGATIVE_MARKERS = [
  "azalt",
  "kötü",
  "zarar",
  "maliyet",
  "risk",
  "olumsuz",
  "sorun",
  "başarısız",
  "yetersiz",
  "dışarıda",
  "zor",
  "engelle",
];
const ABSOLUTE_MARKERS = [
  "her zaman",
  "asla",
  "kesinlikle",
  "herkes",
  "hiç kimse",
  "istisnasız",
  "daima",
];
const QUESTION_STARTERS = [
  "neden",
  "nasıl",
  "hangi",
  "kim",
  "ne zaman",
  "ne kadar",
  "nerede",
  "mümkün mü",
  "olur mu",
  "mi ",
  "mı ",
  "mu ",
  "mü ",
];
const TOPIC_CHANGE_MARKERS = [
  "konuyu değiştirelim",
  "konuyu değiştireyim",
  "başka bir konuya geç",
  "farklı bir konuya geç",
  "şimdi başka bir konu",
  "bu arada başka",
];

const ASPECTS = [
  "gerekçe",
  "uygulama koşulu",
  "maliyet",
  "alternatif",
  "ölçüm",
  "adalet",
  "zaman içindeki etki",
  "erişilebilirlik",
  "sorumluluk",
  "beklenmeyen sonuç",
];

const AGENDA: ReasoningPurpose[] = [
  "Örnekle somutlaştırma",
  "Ölçüt belirleme",
  "Varsayımı görünür kılma",
  "Alternatif arama",
  "Kanıt ile yorumu ayırma",
  "Uygulama koşulunu değerlendirme",
];

const PURPOSE_LABELS: Record<ReasoningPurpose, string> = {
  "Pozisyonunu açıklama": "Pozisyon",
  "Açık soruyu yanıtlama": "Yanıt",
  "Argümanları karşılaştırma": "Karşılaştırma",
  "Genellemeyi sınama": "Mantık denetimi",
  "Varsayımı görünür kılma": "Varsayım",
  "Örnekle somutlaştırma": "Örnek",
  "Ölçüt belirleme": "Ölçüt",
  "Alternatif arama": "Alternatif",
  "Kanıt ile yorumu ayırma": "Kanıt ve yorum",
  "Uygulama koşulunu değerlendirme": "Koşul",
  "İlişkili soruya geçiş": "Yeni bağlantı",
};

let idSequence = 0;

function nextId(prefix: string): string {
  idSequence += 1;
  return `${prefix}-${idSequence}`;
}

function normalize(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[’‘]/gu, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function hasMarker(text: string, markers: string[]): boolean {
  const normalized = normalize(text);
  return markers.some((marker) => normalized.includes(normalize(marker)));
}

function isQuestion(text: string): boolean {
  const normalized = normalize(text);
  return (
    /[?][”"')\]]*\s*$/u.test(text.trim()) ||
    QUESTION_STARTERS.some((starter) => normalized.startsWith(starter)) ||
    /(?:^|\s)(?:mı|mi|mu|mü)(?:\s|$)/u.test(normalized)
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function classifyClaim(text: string): Claim["kind"] {
  if (hasMarker(text, JOKE_MARKERS) || /(?:[:;]-?[)D]|😂|😄)/u.test(text)) {
    return "joke";
  }
  if (hasMarker(text, ASSUMPTION_MARKERS)) {
    return "assumption";
  }
  if (
    hasMarker(text, FACT_MARKERS) ||
    /\b\d+(?:[.,]\d+)?\s*(?:%|yüzde|kişi|saat|gün|ay|yıl)\b/u.test(
      normalize(text),
    )
  ) {
    return "fact";
  }
  if (hasMarker(text, OPINION_MARKERS)) {
    return "opinion";
  }
  return "opinion";
}

function extractClaims(
  text: string,
  speakerId: string,
  topic: string,
  turn: number,
): Claim[] {
  return splitSentences(text)
    .filter((sentence) => sentence.length >= 18 && !isQuestion(sentence))
    .slice(0, 3)
    .map((sentence) => ({
      id: nextId("claim"),
      speakerId,
      text: sentence,
      kind: classifyClaim(sentence),
      topic,
      turn,
    }));
}

function extractQuestions(
  text: string,
  askedBy: string,
  topic: string,
): OpenQuestion[] {
  return splitSentences(text)
    .filter((sentence) => isQuestion(sentence))
    .slice(0, 2)
    .map((sentence) => ({
      id: nextId("question"),
      text: sentence,
      askedBy,
      topic,
      answered: false,
    }));
}

function makeMessage(
  speakerId: string,
  text: string,
  purpose: string,
  label: string,
): Message {
  return {
    id: nextId("message"),
    speakerId,
    text,
    purpose,
    label,
    createdAt: Date.now(),
    source:
      speakerId === "user" ? "user" : (getCharacter(speakerId)?.source ?? "local"),
  };
}

function createMemories(): SpeakerMemory[] {
  return CHARACTERS.map((character) => {
    const profile = findProfile(character.id);
    return {
      speakerId: character.id,
      position: profile?.position ?? `${character.name} henüz bir pozisyon bildirmedi`,
      positionScore: profile?.positionScore ?? 0,
      previousPosition: null,
      changeReason: null,
      lastClaim: "",
      turns: 0,
    };
  });
}

function phaseFor(progress: number): string {
  if (progress < 3) return "Farklı bakışları kurma";
  if (progress < 8) return "Gerekçe ve itirazları sınama";
  if (progress < 15) return "Argümanları karşılaştırma";
  if (progress < 23) return "Koşul ve örnekleri değerlendirme";
  if (progress < 30) return "Sonuçları ve ölçütleri netleştirme";
  return "İlişkili sorularla derinleştirme";
}

function trimExcerpt(text: string, maxLength = 105): string {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function findProfile(speakerId: string): SpeakerProfile | undefined {
  return PROFILES.find(({ character }) => character.id === speakerId);
}

function cursorAfterSpeaker(speakerId: string, currentCursor: number): number {
  const index = AUTOMATED_CHARACTER_ORDER.indexOf(speakerId);
  return index < 0 ? currentCursor : (index + 1) % AUTOMATED_CHARACTER_ORDER.length;
}

export function advanceTurnCursor(
  state: ConversationState,
  count = 1,
): ConversationState {
  const amount = Math.max(0, Math.floor(count));
  return {
    ...state,
    turnCursor:
      (state.turnCursor + amount) % AUTOMATED_CHARACTER_ORDER.length,
  };
}

export function nextAutomatedCharacter(
  state: ConversationState,
  enabledCharacterIds: string[],
): { character: Character; skipped: number } | null {
  const enabled = new Set(enabledCharacterIds);
  const start =
    ((Math.floor(state.turnCursor) % AUTOMATED_CHARACTER_ORDER.length) +
      AUTOMATED_CHARACTER_ORDER.length) %
    AUTOMATED_CHARACTER_ORDER.length;

  for (let skipped = 0; skipped < AUTOMATED_CHARACTER_ORDER.length; skipped += 1) {
    const id =
      AUTOMATED_CHARACTER_ORDER[
        (start + skipped) % AUTOMATED_CHARACTER_ORDER.length
      ];
    const character = getCharacter(id);
    if (character && enabled.has(id)) return { character, skipped };
  }
  return null;
}

function findMemory(
  memories: SpeakerMemory[],
  speakerId: string,
): SpeakerMemory | undefined {
  return memories.find((memory) => memory.speakerId === speakerId);
}

function claimPolarity(text: string): number {
  const normalized = normalize(text);
  const positive = POSITIVE_MARKERS.filter((marker) =>
    normalized.includes(normalize(marker)),
  ).length;
  const negative = NEGATIVE_MARKERS.filter((marker) =>
    normalized.includes(normalize(marker)),
  ).length;
  let score = positive - negative;
  if (/\b(değil|yok|azaltmaz|artmaz)\b/u.test(normalized)) {
    score *= -1;
  }
  return Math.max(-2, Math.min(2, score));
}

function latestClaimBy(
  claims: Claim[],
  speakerId: string,
): Claim | undefined {
  return [...claims].reverse().find((claim) => claim.speakerId === speakerId);
}

function sharedTopicTerms(first: Claim, second: Claim): number {
  const firstTerms = new Set(tokenize(first.text));
  return new Set(tokenize(second.text).filter((word) => firstTerms.has(word)))
    .size;
}

function isMetaClaim(text: string): boolean {
  const normalized = normalize(text);
  return [
    "ben özellikle",
    "kararı netleştirecek ayrım",
    "buradaki iddiaları iki ayrı katmanda",
    "bu görüşün ikna edici olması",
    "bir varsayımsal örnekle somutlaştıralım",
    "bu turda başka bir açı ekleyeyim",
  ].some((marker) => normalized.startsWith(normalize(marker)));
}

function latestOpposingClaims(
  claims: Claim[],
  currentSpeakerId: string,
): [Claim, Claim] | null {
  const candidates = claims.slice(-32).filter((claim) => !isMetaClaim(claim.text));
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const recent = candidates[i];
    if (recent.speakerId === currentSpeakerId) continue;
    const recentPolarity = claimPolarity(recent.text);
    if (!recentPolarity) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      const earlier = candidates[j];
      if (earlier.speakerId === recent.speakerId) continue;
      if (earlier.topic !== recent.topic) continue;
      if (sharedTopicTerms(earlier, recent) < 2) continue;
      if (claimPolarity(earlier.text) * recentPolarity < 0) {
        return [earlier, recent];
      }
    }
  }
  return null;
}

function mostRecentOtherMessage(
  messages: Message[],
  speakerId: string,
): Message | undefined {
  return [...messages]
    .reverse()
    .find((message) => message.speakerId !== speakerId);
}

function nextSpeaker(state: ConversationState): SpeakerProfile {
  const turnsBySpeaker = new Map(
    state.memories.map((memory) => [memory.speakerId, memory.turns]),
  );
  return [...PROFILES].sort((first, second) => {
    const difference =
      (turnsBySpeaker.get(first.character.id) ?? 0) -
      (turnsBySpeaker.get(second.character.id) ?? 0);
    if (difference !== 0) return difference;
    return (
      PROFILES.indexOf(first) -
      PROFILES.indexOf(second)
    );
  })[0];
}

function pendingQuestionFor(
  state: ConversationState,
  speakerId: string,
): OpenQuestion | undefined {
  return state.openQuestions.find(
    (question) => !question.answered && question.askedBy !== speakerId,
  );
}

function nextAspect(progress: number): string {
  return ASPECTS[progress % ASPECTS.length];
}

function choosePurpose(
  state: ConversationState,
  speakerId: string,
  pendingQuestion: OpenQuestion | undefined,
): ReasoningPurpose {
  const lastIncoming = mostRecentOtherMessage(state.messages, speakerId);
  const incomingClaim = latestClaimBy(
    state.claims,
    lastIncoming?.speakerId ?? "",
  );
  // Respond to a user's latest absolute claim before resurfacing an older question.
  if (
    lastIncoming?.speakerId === "user" &&
    incomingClaim &&
    hasMarker(incomingClaim.text, ABSOLUTE_MARKERS)
  ) {
    return "Genellemeyi sınama";
  }
  if (pendingQuestion) return "Açık soruyu yanıtlama";
  if (state.progress < 3) return "Pozisyonunu açıklama";
  const hasComparedPositions = state.messages.some(
    (message) => message.purpose === "Argümanları karşılaştırma",
  );
  if (!hasComparedPositions) return "Argümanları karşılaştırma";
  if (state.progress >= 30) return "İlişkili soruya geçiş";

  const opposing = latestOpposingClaims(state.claims, speakerId);
  const comparedRecently = state.messages
    .slice(-12)
    .some((message) => message.purpose === "Argümanları karşılaştırma");
  if (opposing && !comparedRecently) {
    return "Argümanları karşılaştırma";
  }

  if (
    lastIncoming?.speakerId === "user" &&
    incomingClaim?.kind === "assumption"
  ) {
    return "Varsayımı görünür kılma";
  }

  return AGENDA[(state.progress - 3) % AGENDA.length];
}

function answerConclusion(
  score: number,
  questionText: string,
  aspect: string,
): string {
  const question = normalize(questionText);
  if (
    question.includes("ölçüt") ||
    question.includes("değerlendir") ||
    question.includes("kanıt")
  ) {
    if (score > 0) {
      return `Ölçütte, faydanın kimlere ulaştığını ve hangi değişimin gözlendiğini ayrı tutarım; erişim gerçekten artıyorsa desteklerim. ${aspect} sonucu değiştirebilecek ayrı bir ölçü olarak izlenmeli.`;
    }
    if (score < 0) {
      return `Önce maliyet, yan etki ve kimin fayda gördüğüne ilişkin kanıt gerekir; bu ölçümler olmadan olumlu sonucu genellemem. ${aspect} ayrıca izlenmeli.`;
    }
    return `Beklenen faydayı, uygulama maliyetini ve gruplar arasındaki dağılımı ayrı ayrı ölçmek gerekir. ${aspect} bu karşılaştırmanın hangi yönde sonuç vereceğini belirleyebilir.`;
  }
  if (score > 0) {
    return "Koşullar erişimi genişletip faydayı farklı gruplara ulaştırıyorsa desteklerim; aksi durumda olumlu beklentiyi genellemem.";
  }
  if (score < 0) {
    return "Maliyet ve yan etkiler için kanıt görmeden kabul etmem; bu bilgiler olmadan önerinin herkese yararlı olduğunu söylemek erken olur.";
  }
  return `Yanıt, beklenen faydayı maliyet ve farklı gruplara etkilerle birlikte tartmaya bağlı; özellikle ${aspect} bu sonucu değiştirebilir.`;
}

function claimExcerpt(text: string, maxLength = 70): string {
  return trimExcerpt(
    text
      .replace(/[“”"]/gu, "'")
      .replace(/\s+/gu, " ")
      .trim(),
    maxLength,
  );
}

function questionForAspect(topic: string, aspect: string): string {
  const questions: Record<string, string> = {
    gerekçe: `“${trimExcerpt(topic, 70)}” için ileri sürülen gerekçeyi hangi kanıt destekler?`,
    "uygulama koşulu":
      "Bu yaklaşımın işe yaraması için hangi koşulun mutlaka sağlanması gerekir?",
    maliyet:
      "Beklenen faydayı uygulama maliyetiyle karşılaştırmak için hangi bilgiyi bilmeliyiz?",
    alternatif:
      "Aynı amaca daha az maliyetle ulaşabilecek bir alternatif var mı?",
    ölçüm:
      "Bu önerinin işe yarayıp yaramadığını hangi ölçütle değerlendirelim?",
    adalet:
      "Fayda ve yük farklı gruplara nasıl dağılıyor; bunu nasıl adil biçimde tartarız?",
    "zaman içindeki etki":
      "Kısa vadeli sonuçla uzun vadeli etkiyi nasıl birbirinden ayırabiliriz?",
    erişilebilirlik:
      "Bu seçeneğe kimler erişebilir, kimler dışarıda kalabilir?",
    sorumluluk:
      "Uygulamada ortaya çıkabilecek yan etkilerin sorumluluğunu kim üstlenmeli?",
    "beklenmeyen sonuç":
      "İyi niyetli bir uygulamanın beklenmeyen olumsuz bir sonucu ne olabilir?",
  };
  return questions[aspect] ?? questions.ölçüm;
}

function buildResponse(
  state: ConversationState,
  profile: SpeakerProfile,
  purpose: ReasoningPurpose,
  turn: number,
  question: OpenQuestion | undefined,
): string {
  const { character } = profile;
  const memory = findMemory(state.memories, character.id);
  const topic = trimExcerpt(state.topic, 96);
  const otherMessage = mostRecentOtherMessage(state.messages, character.id);
  const otherCharacter = otherMessage
    ? getCharacter(otherMessage.speakerId)?.name
    : undefined;
  const lastOtherClaim = latestClaimBy(
    state.claims,
    otherMessage?.speakerId ?? "",
  );
  const opposing = latestOpposingClaims(state.claims, character.id);
  const aspect = nextAspect(turn);
  const latestContext = lastOtherClaim
    ? `“${trimExcerpt(lastOtherClaim.text, 84)}”`
    : `“${topic}”`;
  const openingPrefix =
    character.id === "claude"
      ? "Benim için önemli nokta"
      : character.id === "grok"
        ? "Burada temkinli olmamın nedeni"
        : "Kararı netleştirecek ayrım";

  switch (purpose) {
    case "Pozisyonunu açıklama":
      return `“${topic}” konusunda ${profile.opening} Ben özellikle ${profile.lens} ölçütüne bakıyorum.`;

    case "Açık soruyu yanıtlama":
      return `${question ? `“${claimExcerpt(question.text, 72)}” sorusunu şöyle anlıyorum: ` : ""}${answerConclusion(profile.positionScore, question?.text ?? "", aspect)}`;

    case "Argümanları karşılaştırma": {
      const first = opposing?.[0];
      const second = opposing?.[1];
      if (first && second) {
        const firstName = getCharacter(first.speakerId)?.name ?? "Bir kişi";
        const secondName =
          getCharacter(second.speakerId)?.name ?? "Diğeri";
        return `${firstName}'in önceki iddiası “${claimExcerpt(first.text, 58)}” yönünde; ${secondName} ise “${claimExcerpt(second.text, 58)}” diyerek farklı bir sonuca varıyor. İkisini aynı anda doğru ya da yanlış ilan etmek yerine, hangi koşulda hangisinin geçerli olduğunu ve hangi kanıtın ayrımı çözeceğini bulmalıyız.`;
      }
      const optimistic = PROFILES.find((item) => item.positionScore > 0)!;
      const cautious = PROFILES.find((item) => item.positionScore < 0)!;
      const conditional = PROFILES.find((item) => item.positionScore === 0)!;
      const openingClaim = state.claims.find(
        (claim) => claim.speakerId === "user",
      );
      return `${openingClaim ? `Başlangıçtaki “${claimExcerpt(openingClaim.text, 68)}” ifadesi bir olasılık ortaya koyuyor. ` : ""}${optimistic.character.name} ${optimistic.position.toLocaleLowerCase("tr-TR")}; ${cautious.character.name} ise ${cautious.position.toLocaleLowerCase("tr-TR")}. Bu iki görüş zorunlu olarak çelişmiyor: biri beklenen faydayı, diğeri bu faydanın kanıt ve bedelini sorguluyor. ${conditional.character.name} bu ayrımı ${aspect} ölçütüyle sınamayı öneriyor.`;
    }

    case "Genellemeyi sınama": {
      const absolutePhrase =
        ABSOLUTE_MARKERS.find((marker) =>
          normalize(lastOtherClaim?.text ?? "").includes(normalize(marker)),
        ) ?? "kesin ifade";
      return `${otherCharacter ?? "Önceki konuşmacı"} “${claimExcerpt(lastOtherClaim?.text ?? "", 74)}” derken “${absolutePhrase}” gibi kapsamı çok geniş bir ifade kullanıyor. Tek bir örnek ya da olasılık, herkes ve her durum hakkında bu kadar geniş bir sonucu kanıtlamaz; istisnaları ve karşı örnekleri de sınamak gerekir.`;
    }

    case "Varsayımı görünür kılma":
      if (character.id === "claude") {
        return `“${claimExcerpt(lastOtherClaim?.text ?? state.topic, 76)}” ifadesi, faydanın ${aspect} koşuluna bağlı olduğu kabulünü taşıyor. Bu koşul gerçekleşirse olumlu sonuç makul olabilir; önce hangi gruplar için gerçekleştiğini sınamalıyız.`;
      }
      if (character.id === "grok") {
        return `Önce öncülü sonuçtan ayıralım: “${claimExcerpt(lastOtherClaim?.text ?? state.topic, 74)}” ifadesi, ${aspect} başlığında yeterli koşul bulunduğunu varsayıyor. Bu öncül yanlış çıkarsa sonuç da değişir; onu sınamak için ${aspect} hakkında karşı örnek ya da ölçüm aramalıyız.`;
      }
      return `“${claimExcerpt(lastOtherClaim?.text ?? state.topic, 75)}” sonucuna varmadan önce, dayandığı öncülün ${aspect} bakımından doğru olup olmadığını ölçmek gerekir. Öncül doğrulanmadan sonuç, olgu değil koşullu bir çıkarım olarak kalır.`;

    case "Örnekle somutlaştırma":
      if (character.id === "claude") {
        return `Varsayımsal olarak, “${topic}” seçeneğinin farklı mahallelerde erişilebilir hâle geldiğini düşünelim. ${aspect} bakımından fayda yalnızca toplam kullanımda değil, daha önce seçeneğe ulaşamayan kişilerin erişiminde de görülmeli. Bu bir gözlem değil, test edilecek örneğin çerçevesi.`;
      }
      if (character.id === "grok") {
        return `Karşı örnek olasılığını da kuralım: “${topic}” uygulanırken başka seçeneği olmayan bir grup ek maliyet ya da zaman yükü üstlenirse, ortalama sonuç iyi görünse bile zarar eşitsiz dağılabilir. Bu varsayımsal senaryo gerçek veri değildir; ${aspect} başlığını özellikle sınamak gerekir.`;
      }
      return `İki benzer durumu varsayımsal olarak karşılaştıralım: birinde “${topic}” uygulanıyor, diğerinde mevcut yöntem sürüyor. ${aspect} ve farklı gruplara etkiyi aynı zaman aralığında ölçmek, değişimin gerçekten uygulamadan kaynaklanıp kaynaklanmadığını anlamaya yardım eder.`;

    case "Ölçüt belirleme":
      return `${openingPrefix}, “${topic}” için ${aspect} başlığını baştan ölçülebilir kılmak. Bu ölçütü beklenen fayda, uygulama bedeli ve farklı gruplara etkilerle birlikte izlersek kanaat ile gözlemlenebilir sonucu birbirine karıştırmayız.`;

    case "Alternatif arama":
      if (character.id === "claude") {
        return `“${topic}” hedefini koruyup erişimi artıran başka bir uygulama biçimi de düşünülebilir. Kapsamı küçültmek, faydayı daha fazla kişiye ulaştırırken kimlerin hâlâ dışarıda kaldığını görmeye imkân verir.`;
      }
      if (character.id === "grok") {
        return `Kararı ertelemek tek seçenek değil: önce daha düşük maliyetli ve geri alınabilir bir deneme yapılabilir. Böylece “${topic}” tüm gruplara yayılmadan önce riskli noktalar görünür olur.`;
      }
      return `Üçüncü bir seçenek, mevcut uygulamayla önerilen yaklaşım arasında sınırlı bir deneme kurmak. “${topic}” için aynı ölçütleri seçenekler arasında kullanırsak tercih, kişisel kanaatten çok karşılaştırılabilir sonuçlara dayanır.`;

    case "Kanıt ile yorumu ayırma":
      if (character.id === "claude") {
        return `Bir ölçüm, “${topic}” sonrasında kimin erişiminin veya beklenen faydasının değiştiğini gösterebilir; değişimin iyi sayılıp sayılmadığı ise ayrı bir değer yargısıdır. Önce sonucu kimlerin yaşadığını, sonra bu sonucu nasıl değerlendirdiğimizi konuşalım.`;
      }
      if (character.id === "grok") {
        return `Bir sayı ya da araştırma anılsa bile örneklemin kimi kapsadığını ve kimin dışarıda kaldığını bilmeden genelleme yapamayız. “${topic}” lehindeki ya da aleyhindeki olgusal iddia doğrulanmalı; tercih edilen hedef ise ayrıca tartışılmalı.`;
      }
      return `Kararı sınamak için başlangıç durumunu, sonrasındaki sonucu ve karşılaştırma grubunu ayrı kaydetmek gerekir. Bunlar “${topic}” hakkında gözlemlenebilir kanıt sağlar; verinin ne kadar önemli olduğu yine ayrıca tartışılan bir tercihtir.`;

    case "Uygulama koşulunu değerlendirme":
      return `Bu görüşün ikna edici olması, en çok ${aspect} başlığında ne olduğuna bağlı. Koşul sağlanmıyorsa beklenen fayda gerçekleşmeyebilir; sağlanıyorsa önceki itirazın ağırlığı azalabilir. Bu nedenle konumumu korurken sonucu koşula bağlı tutuyorum.`;

    case "İlişkili soruya geçiş":
      if (character.id === "claude") {
        return `“${topic}” üzerindeki ana görüşler netleşti. Şimdi, zaman içinde kimlerin bu seçeneğe erişebildiğini ve faydanın hangi mahallelere ulaştığını nasıl izleyeceğimizi konuşalım; böylece ilk hedefin gerçekten gerçekleşip gerçekleşmediğini görürüz.`;
      }
      if (character.id === "grok") {
        return `“${topic}” tartışmasını aynı itirazlarla sürdürmek yerine, uygulamanın maliyetini kimlerin taşıyacağına ve geri dönüş seçeneğinin bulunup bulunmadığına bakalım. Bu iki yanıt, riskin kabul edilebilir olup olmadığını değiştirir.`;
      }
      return `“${topic}” için bir sonraki bağlantı, kısa dönem sonuçları uzun dönem sonuçlarla karşılaştırmak. Hangi göstergeyi başta kaydedip sonra yeniden ölçeceğimizi belirlersek konuşma somut bir değerlendirme yöntemine ulaşır.`;
  }
}

function shouldAskFollowUp(
  state: ConversationState,
  purpose: ReasoningPurpose,
  nextProgress: number,
): boolean {
  const hasUnanswered = state.openQuestions.some((question) => !question.answered);
  return (
    !hasUnanswered &&
    purpose !== "Açık soruyu yanıtlama" &&
    purpose !== "İlişkili soruya geçiş" &&
    nextProgress >= 4 &&
    nextProgress % 5 === 0
  );
}

function addFollowUpQuestion(
  text: string,
  speakerId: string,
  topic: string,
  progress: number,
): { text: string; question: OpenQuestion } {
  const questionText = questionForAspect(
    topic,
    ASPECTS[progress % ASPECTS.length],
  );
  const question: OpenQuestion = {
    id: nextId("question"),
    text: questionText,
    askedBy: speakerId,
    topic,
    answered: false,
  };
  return { text: `${text} ${questionText}`, question };
}

function messageSimilarity(first: string, second: string): number {
  const bigrams = (text: string): Set<string> => {
    const words = tokenize(text);
    const result = new Set<string>();
    for (let index = 0; index < words.length - 1; index += 1) {
      result.add(`${words[index]} ${words[index + 1]}`);
    }
    if (result.size === 0) {
      for (const word of words) result.add(word);
    }
    return result;
  };
  const firstSet = bigrams(first);
  const secondSet = bigrams(second);
  if (firstSet.size === 0 || secondSet.size === 0) return 0;
  const intersection = [...firstSet].filter((item) => secondSet.has(item)).length;
  return intersection / (firstSet.size + secondSet.size - intersection);
}

function closestRecentMessage(
  text: string,
  messages: Message[],
): number {
  return Math.max(
    0,
    ...messages.map((message) => messageSimilarity(text, message.text)),
  );
}

const REPETITION_ALTERNATIVES: ReasoningPurpose[] = [
  "Ölçüt belirleme",
  "Alternatif arama",
  "Kanıt ile yorumu ayırma",
  "Örnekle somutlaştırma",
  "Uygulama koşulunu değerlendirme",
  "Varsayımı görünür kılma",
];

function chooseLessSimilarResponse(
  state: ConversationState,
  profile: SpeakerProfile,
  initialPurpose: ReasoningPurpose,
  turn: number,
  pendingQuestion: OpenQuestion | undefined,
): { purpose: ReasoningPurpose; text: string; similarity: number } {
  const recentMessages = state.messages.slice(-80);
  const initialText = buildResponse(
    state,
    profile,
    initialPurpose,
    turn,
    pendingQuestion,
  );
  let best = {
    purpose: initialPurpose,
    text: initialText,
    similarity: closestRecentMessage(initialText, recentMessages),
  };

  if (
    initialPurpose === "Açık soruyu yanıtlama" ||
    best.similarity < 0.78
  ) {
    return best;
  }

  const startIndex = turn % REPETITION_ALTERNATIVES.length;
  for (let offset = 0; offset < REPETITION_ALTERNATIVES.length; offset += 1) {
    const alternativePurpose =
      REPETITION_ALTERNATIVES[
        (startIndex + offset) % REPETITION_ALTERNATIVES.length
      ];
    if (alternativePurpose === initialPurpose) continue;

    const alternativeText = buildResponse(
      state,
      profile,
      alternativePurpose,
      turn,
      undefined,
    );
    const similarity = closestRecentMessage(
      alternativeText,
      recentMessages,
    );
    if (similarity < best.similarity) {
      best = {
        purpose: alternativePurpose,
        text: alternativeText,
        similarity,
      };
    }
    if (best.similarity < 0.65) break;
  }
  return best;
}

function topicFromShift(text: string): string | null {
  const normalized = normalize(text);
  const marker = TOPIC_CHANGE_MARKERS.find((candidate) =>
    normalized.includes(normalize(candidate)),
  );
  if (!marker) return null;
  const markerIndex = normalized.indexOf(normalize(marker));
  const originalRemainder = text.slice(markerIndex + marker.length).trim();
  const cleaned = originalRemainder
    .replace(/^[\s,:;—-]+/u, "")
    .replace(/^(konu(?:su)?|hakkında)\s*/iu, "")
    .trim();
  return cleaned.length >= 5 ? cleaned : null;
}

export function createInitialConversation(
  topic = DEFAULT_TOPIC,
): ConversationState {
  const cleanTopic = topic.trim() || DEFAULT_TOPIC;
  const state: ConversationState = {
    topic: cleanTopic,
    messages: [],
    claims: [],
    openQuestions: [],
    memories: createMemories(),
    progress: 0,
    phase: phaseFor(0),
    repetitionCount: 0,
    lastPurpose: "",
    turnCursor: 0,
  };

  const starter = makeMessage("user", cleanTopic, "Konuşma konusu", "Konu");
  const claims = cleanTopic.length >= 28 && !isQuestion(cleanTopic)
    ? extractClaims(cleanTopic, "user", cleanTopic, 0)
    : [];
  const questions = extractQuestions(cleanTopic, "user", cleanTopic);
  return { ...state, messages: [starter], claims, openQuestions: questions };
}

export function addUserMessage(
  state: ConversationState,
  text: string,
): ConversationState {
  const cleanText = text.trim();
  if (!cleanText) return state;

  const shiftedTopic = topicFromShift(cleanText);
  const topic = shiftedTopic ?? state.topic;
  const message = makeMessage("user", cleanText, "Kullanıcı katkısı", "Sen");
  const claims = extractClaims(
    cleanText,
    "user",
    topic,
    state.progress,
  );
  const questions = extractQuestions(cleanText, "user", topic);

  return {
    ...state,
    topic,
    messages: [...state.messages, message],
    claims: [...state.claims, ...claims].slice(-160),
    openQuestions: [...state.openQuestions, ...questions].slice(-80),
    phase: phaseFor(state.progress),
  };
}

const LEGACY_SPEAKER_IDS: Record<string, string> = {
  aylin: "claude",
  mert: "grok",
  deniz: "deepseek",
};

function migratedSpeakerId(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  return LEGACY_SPEAKER_IDS[value] ?? value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function restoreConversationState(
  raw: unknown,
): ConversationState | null {
  if (!isRecord(raw) || typeof raw.topic !== "string") return null;
  if (!Array.isArray(raw.messages)) return null;

  try {
    const topic = raw.topic.trim().slice(0, 300);
    const initial = createInitialConversation(topic);
    const messages: Message[] = raw.messages
      .filter(
        (
          message,
        ): message is Record<string, unknown> & {
          text: string;
          speakerId: string;
        } =>
          isRecord(message) &&
          typeof message.text === "string" &&
          typeof message.speakerId === "string",
      )
      .map((message) => {
        const speakerId = migratedSpeakerId(message.speakerId);
        const source =
          speakerId === "user"
            ? "user"
            : getCharacter(speakerId)?.source ?? "local";
        return {
          id:
            typeof message.id === "string"
              ? message.id
              : nextId("restored"),
          speakerId,
          text: message.text.slice(0, 6000),
          purpose:
            typeof message.purpose === "string"
              ? message.purpose
              : "Önceki konuşmadan aktarıldı",
          label: typeof message.label === "string" ? message.label : "Mesaj",
          createdAt:
            typeof message.createdAt === "number" &&
            Number.isFinite(message.createdAt)
              ? message.createdAt
              : Date.now(),
          source,
        };
      });

    const claims: Claim[] = Array.isArray(raw.claims)
      ? raw.claims
          .filter(
            (
              claim,
            ): claim is Record<string, unknown> & {
              text: string;
              speakerId: string;
              topic: string;
            } =>
              isRecord(claim) &&
              typeof claim.text === "string" &&
              typeof claim.speakerId === "string" &&
              typeof claim.topic === "string",
          )
          .map((claim) => ({
            id: typeof claim.id === "string" ? claim.id : nextId("claim"),
            speakerId: migratedSpeakerId(claim.speakerId),
            text: claim.text.slice(0, 2000),
            kind:
              claim.kind === "fact" ||
              claim.kind === "assumption" ||
              claim.kind === "opinion" ||
              claim.kind === "joke"
                ? claim.kind
                : "opinion",
            topic: claim.topic.slice(0, 300),
            turn:
              typeof claim.turn === "number" && Number.isFinite(claim.turn)
                ? claim.turn
                : 0,
          }))
      : initial.claims;

    const openQuestions: OpenQuestion[] = Array.isArray(raw.openQuestions)
      ? raw.openQuestions
          .filter(
            (
              question,
            ): question is Record<string, unknown> & {
              text: string;
              askedBy: string;
              topic: string;
            } =>
              isRecord(question) &&
              typeof question.text === "string" &&
              typeof question.askedBy === "string" &&
              typeof question.topic === "string",
          )
          .map((question) => ({
            id:
              typeof question.id === "string"
                ? question.id
                : nextId("question"),
            text: question.text.slice(0, 500),
            askedBy: migratedSpeakerId(question.askedBy),
            topic: question.topic.slice(0, 300),
            answered: question.answered === true,
          }))
      : initial.openQuestions;

    const storedMemories = Array.isArray(raw.memories)
      ? raw.memories.filter(
          (memory): memory is Record<string, unknown> =>
            isRecord(memory) && typeof memory.speakerId === "string",
        )
      : [];
    const memoryById = new Map(
      storedMemories.map((memory) => [
        migratedSpeakerId(memory.speakerId),
        memory,
      ]),
    );
    const memories = initial.memories.map((fallback) => {
      const stored = memoryById.get(fallback.speakerId);
      if (!stored) return fallback;
      return {
        ...fallback,
        position:
          typeof stored.position === "string"
            ? stored.position.slice(0, 300)
            : fallback.position,
        positionScore:
          typeof stored.positionScore === "number" &&
          Number.isFinite(stored.positionScore)
            ? Math.max(-2, Math.min(2, stored.positionScore))
            : fallback.positionScore,
        previousPosition:
          typeof stored.previousPosition === "string"
            ? stored.previousPosition.slice(0, 300)
            : null,
        changeReason:
          typeof stored.changeReason === "string"
            ? stored.changeReason.slice(0, 500)
            : null,
        lastClaim:
          typeof stored.lastClaim === "string"
            ? stored.lastClaim.slice(0, 1000)
            : "",
        turns:
          typeof stored.turns === "number" && Number.isFinite(stored.turns)
            ? Math.max(0, Math.floor(stored.turns))
            : 0,
      };
    });

    const characterMessages = messages.filter(
      (message) => message.speakerId !== "user",
    ).length;
    return {
      ...initial,
      topic: topic || initial.topic,
      messages: messages.length > 0 ? messages : initial.messages,
      claims,
      openQuestions,
      memories,
      progress:
        typeof raw.progress === "number" && Number.isFinite(raw.progress)
          ? Math.max(0, Math.floor(raw.progress))
          : characterMessages,
      phase:
        typeof raw.phase === "string"
          ? raw.phase.slice(0, 100)
          : phaseFor(characterMessages),
      repetitionCount:
        typeof raw.repetitionCount === "number" &&
        Number.isFinite(raw.repetitionCount)
          ? Math.max(0, Math.floor(raw.repetitionCount))
          : 0,
      lastPurpose:
        typeof raw.lastPurpose === "string"
          ? raw.lastPurpose.slice(0, 120)
          : "",
      turnCursor:
        typeof raw.turnCursor === "number" && Number.isFinite(raw.turnCursor)
          ? Math.abs(Math.floor(raw.turnCursor)) %
            AUTOMATED_CHARACTER_ORDER.length
          : characterMessages % AUTOMATED_CHARACTER_ORDER.length,
    };
  } catch {
    return null;
  }
}

function styleLocalResponse(
  profile: SpeakerProfile,
  text: string,
  purpose: string,
  turn: number,
): string {
  if (profile.character.id === "claude" && turn % 3 === 0) {
    return `${text} Bu çıkarımın hangi varsayımda değişebileceğini de açık tutalım.`;
  }
  if (profile.character.id === "grok") {
    const challenge =
      turn % 2 === 0 ? "Bir noktaya itirazım var: " : "Şüpheci bir not: ";
    const joke =
      turn % 5 === 0
        ? " Kısa şaka: ortalama, bazen kenar vakaları halının altına süpürüyor."
        : "";
    return `${challenge}${text}${joke}`;
  }
  if (profile.character.id === "deepseek") {
    const check =
      turn % 2 === 0
        ? `Teknik kontrol: ${nextAspect(turn)} değişkenini uygulama öncesi ve sonrasında aynı ölçekte izleyelim.`
        : `Nedensellik kontrolü: ${purpose.toLocaleLowerCase("tr-TR")} için başlangıç ölçümünü ve karşılaştırma grubunu ayrı tutalım.`;
    return `${text} ${check}`;
  }
  return text;
}

function commitSpeakerMessage(
  state: ConversationState,
  speakerId: string,
  text: string,
  purpose: string,
  pendingQuestionId?: string,
): ConversationState {
  const cleanText = text.trim();
  if (!cleanText) return state;

  const nextProgress = state.progress + 1;
  const similarity = closestRecentMessage(cleanText, state.messages.slice(-80));
  const label =
    (PURPOSE_LABELS as Record<string, string>)[purpose] ??
    "Önceki mesaja yanıt";
  const message = makeMessage(speakerId, cleanText, purpose, label);
  const claims = extractClaims(
    cleanText,
    speakerId,
    state.topic,
    nextProgress,
  );
  const questions = extractQuestions(cleanText, speakerId, state.topic);
  const memories = state.memories.map((memory) => {
    if (memory.speakerId !== speakerId) return memory;
    return {
      ...memory,
      lastClaim: claims.at(-1)?.text ?? memory.lastClaim,
      turns: memory.turns + 1,
    };
  });
  const openQuestions = [
    ...state.openQuestions.map((question) =>
      pendingQuestionId === question.id
        ? { ...question, answered: true }
        : question,
    ),
    ...questions,
  ].slice(-80);

  return {
    ...state,
    messages: [...state.messages, message].slice(-240),
    claims: [...state.claims, ...claims].slice(-160),
    openQuestions,
    memories,
    progress: nextProgress,
    phase: phaseFor(nextProgress),
    repetitionCount: state.repetitionCount + (similarity >= 0.8 ? 1 : 0),
    lastPurpose: purpose,
    turnCursor: cursorAfterSpeaker(speakerId, state.turnCursor),
  };
}

export function isDuplicateReply(
  state: ConversationState,
  text: string,
): boolean {
  const cleanText = text.trim();
  if (cleanText.length < 20) return !cleanText;
  return closestRecentMessage(cleanText, state.messages.slice(-80)) >= 0.8;
}

export function appendCharacterReply(
  state: ConversationState,
  speakerId: string,
  text: string,
): ConversationState {
  if (!getCharacter(speakerId) || speakerId === "user") return state;
  const cleanText = text.trim();
  if (!cleanText) return state;
  if (isDuplicateReply(state, cleanText)) {
    return { ...state, repetitionCount: state.repetitionCount + 1 };
  }
  const pendingQuestion = pendingQuestionFor(state, speakerId);
  const purpose = pendingQuestion
    ? "Açık soruyu yanıtlama"
    : "Önceki mesaja yanıt";
  return commitSpeakerMessage(
    state,
    speakerId,
    cleanText,
    purpose,
    pendingQuestion?.id,
  );
}

export function generateReplyForSpeaker(
  state: ConversationState,
  speakerId: string,
): ConversationState {
  const profile = findProfile(speakerId);
  if (!profile) return state;

  const pendingQuestion = pendingQuestionFor(state, speakerId);
  const plannedPurpose = choosePurpose(state, speakerId, pendingQuestion);
  const nextProgress = state.progress + 1;
  const selected = chooseLessSimilarResponse(
    state,
    profile,
    plannedPurpose,
    nextProgress,
    pendingQuestion,
  );
  let text = selected.text;

  if (shouldAskFollowUp(state, selected.purpose, nextProgress)) {
    const followUp = addFollowUpQuestion(
      text,
      speakerId,
      state.topic,
      nextProgress,
    );
    text = followUp.text;
  }
  text = styleLocalResponse(profile, text, selected.purpose, nextProgress);
  return commitSpeakerMessage(
    state,
    speakerId,
    text,
    selected.purpose,
    selected.purpose === "Açık soruyu yanıtlama" ? pendingQuestion?.id : undefined,
  );
}

export function generateReply(state: ConversationState): ConversationState {
  return generateReplyForSpeaker(state, nextSpeaker(state).character.id);
}

export function advanceConversation(
  state: ConversationState,
  count: number,
): ConversationState {
  const safeCount = Math.max(0, Math.min(100, Math.floor(count)));
  let next = state;
  for (let index = 0; index < safeCount; index += 1) {
    next = generateReply(next);
  }
  return next;
}
