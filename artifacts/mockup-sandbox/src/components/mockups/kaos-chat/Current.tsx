import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowDown, ArrowRight, CircleHelp, CornerDownLeft, RotateCcw, Send, Sparkles, Waypoints } from 'lucide-react';
import { advanceConversation, addUserMessage, CHARACTERS, createInitialConversation, generateReply, type ConversationState, type Message } from './engine';
import './_group.css';

const STORAGE_KEY = 'conversation-engine.session.v1';
const USER_ID = 'user';

function loadSession(): ConversationState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ConversationState;
      if (parsed && typeof parsed.topic === 'string' && Array.isArray(parsed.messages) && Array.isArray(parsed.memories)) return parsed;
    }
  } catch {
    // A corrupted or unavailable local session starts a clean conversation.
  }
  return createInitialConversation();
}

export function Current() {
  const [conversation, setConversation] = useState<ConversationState>(loadSession);
  const [topicDraft, setTopicDraft] = useState(conversation.topic);
  const [messageDraft, setMessageDraft] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const speakerMap = useMemo(() => new Map(CHARACTERS.map((character) => [character.id, character])), []);
  const messageCount = conversation.messages.length;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
    } catch {
      // The workbench remains usable when browser storage is unavailable.
    }
  }, [conversation]);

  useEffect(() => {
    setTopicDraft(conversation.topic);
  }, [conversation.topic]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messageCount]);

  const submitTopic = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const topic = topicDraft.trim();
    if (!topic) return;
    setConversation(createInitialConversation(topic));
    setMessageDraft('');
  };

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageDraft.trim();
    if (!text) return;
    setConversation((current) => addUserMessage(current, text));
    setMessageDraft('');
  };

  const runOne = () => setConversation((current) => generateReply(current));

  const runThirty = () => {
    if (isRunning) return;
    setIsRunning(true);
    window.setTimeout(() => {
      setConversation((current) => advanceConversation(current, 30));
      setIsRunning(false);
    }, 40);
  };

  const resetConversation = () => {
    setConversation(createInitialConversation(conversation.topic));
    setMessageDraft('');
  };

  const getSpeaker = (speakerId: string) => {
    if (speakerId === USER_ID) return { name: 'Sen', role: 'Katılımcı', initials: 'S', color: '#546e67' };
    return speakerMap.get(speakerId) ?? { name: 'Katılımcı', role: 'Karakter', initials: '?', color: '#75827b' };
  };

  const formatTime = (timestamp: number) => {
    try {
      return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
    } catch {
      return '';
    }
  };

  const progress = Math.max(0, Math.min(100, Number(conversation.progress) || 0));

  return (
    <main className="page-shell">
      <div className="relative z-[1] mx-auto max-w-[1440px] px-5 pb-12 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <Waypoints size={18} strokeWidth={1.8} />
            </div>
            <div>
              <div className="font-serif text-[19px] leading-none tracking-[-.03em]">Konuşma Motoru</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Yerel tartışma çalışma alanı</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
            Bu tarayıcıda çalışır
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] pt-8">
          <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-[650px]">
              <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.17em] text-[hsl(var(--primary))]">
                <span className="h-px w-6 bg-[hsl(var(--primary))]" />
                Bir fikrin etrafında
              </div>
              <h1 className="font-serif text-[40px] font-normal leading-[.98] tracking-[-.045em] sm:text-[52px]">
                Tartışma, <span className="italic text-[hsl(var(--primary))]">burada</span> şekillenir.
              </h1>
              <p className="mt-3 max-w-[500px] text-[13px] leading-6 text-[hsl(var(--muted-foreground))]">
                Bir konu aç, kendi düşünceni ekle; üç ayrı karakterin konuşmayı nasıl sürdürdüğünü izle.
              </p>
            </div>
            <button
              type="button"
              data-testid="button-reset"
              onClick={resetConversation}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 text-xs font-medium transition hover:bg-[hsl(var(--secondary))] md:self-end"
              aria-label="Konuşmayı sıfırla"
            >
              <RotateCcw size={14} /> Baştan başla
            </button>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_325px]">
            <section className="overflow-hidden rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]">
              <form onSubmit={submitTopic} className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.42)] px-5 py-4 sm:px-6">
                <label htmlFor="topic" className="mb-2 block font-mono text-[9px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">
                  Tartışma başlığı ya da açılış cümlesi
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="topic"
                    data-testid="input-topic"
                    value={topicDraft}
                    onChange={(event) => setTopicDraft(event.target.value)}
                    placeholder="Örn. Şehir merkezleri araçsız olmalı mı?"
                    maxLength={240}
                    className="h-11 min-w-0 flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 text-[13px] outline-none transition placeholder:text-[hsl(var(--muted-foreground)/.75)] focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.12)]"
                  />
                  <button type="submit" data-testid="button-set-topic" disabled={!topicDraft.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-xs font-semibold text-[hsl(var(--primary-foreground))] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45">
                    Konuyu başlat <ArrowRight size={14} />
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-3 sm:px-6">
                <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                  <span className="font-mono text-[10px] uppercase tracking-[.12em]">Katılımcılar</span>
                  <span className="mx-1 h-3 w-px bg-[hsl(var(--border))]" />
                  <div className="flex -space-x-1.5" aria-hidden="true">
                    {CHARACTERS.map((character) => (
                      <span key={character.id} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[hsl(var(--card))] text-[8px] font-semibold text-white" style={{ backgroundColor: character.color }}>{character.initials}</span>
                    ))}
                  </div>
                  <span>{CHARACTERS.length} karakter · sen</span>
                </div>
                <div className="font-mono text-[10px] tabular-nums text-[hsl(var(--muted-foreground))]" data-testid="status-message-count">
                  {messageCount} mesaj
                </div>
              </div>

              <div className="scrollbar-thin max-h-[min(56vh,680px)] min-h-[315px] overflow-y-auto px-5 py-5 sm:px-7 sm:py-7" aria-live="polite" aria-label="Konuşma mesajları">
                {conversation.messages.length === 0 ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--primary))]">
                      <ArrowDown size={19} strokeWidth={1.6} />
                    </div>
                    <h2 className="font-serif text-[23px] tracking-[-.02em]">İlk sözü sen söyle.</h2>
                    <p className="mt-2 max-w-[330px] text-xs leading-5 text-[hsl(var(--muted-foreground))]">Üstte bir tartışma başlat, ardından mesajını yaz ya da karakterlerden devam etmelerini iste.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {conversation.messages.map((message, index) => (
                      <MessageRow key={message.id} message={message} index={index} speaker={getSpeaker(message.speakerId)} time={formatTime(message.createdAt)} />
                    ))}
                    <div ref={endRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/.65)] p-4 sm:px-6 sm:py-5">
                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" data-testid="button-generate-reply" onClick={runOne} disabled={CHARACTERS.length === 0} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 text-[11px] font-semibold text-[hsl(var(--primary-foreground))] transition hover:brightness-95 disabled:opacity-50">
                    <Sparkles size={14} /> Bir yanıt üret
                  </button>
                  <button type="button" data-testid="button-run-coherence" onClick={runThirty} disabled={isRunning || CHARACTERS.length === 0} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 text-[11px] font-medium transition hover:bg-[hsl(var(--secondary))] disabled:cursor-wait disabled:opacity-55">
                    <Activity size={14} /> {isRunning ? '30 mesajlık tur hazırlanıyor…' : '30 mesajlık tutarlılık turu'}
                  </button>
                </div>
                <form onSubmit={submitMessage} className="flex items-end gap-2">
                  <label className="sr-only" htmlFor="message">Mesajını yaz</label>
                  <textarea
                    id="message"
                    data-testid="input-message"
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (messageDraft.trim()) setConversation((current) => addUserMessage(current, messageDraft.trim()));
                        setMessageDraft('');
                      }
                    }}
                    rows={2}
                    maxLength={1000}
                    placeholder="Düşünceni ekle…"
                    className="max-h-36 min-h-[48px] flex-1 resize-y rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-3 text-[13px] leading-5 outline-none placeholder:text-[hsl(var(--muted-foreground)/.75)] focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/.12)]"
                  />
                  <button type="submit" data-testid="button-send-message" disabled={!messageDraft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--foreground))] text-[hsl(var(--background))] transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Mesajı gönder">
                    <Send size={16} />
                  </button>
                </form>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                  <CornerDownLeft size={11} /> Göndermek için Enter · yeni satır için Shift + Enter
                </div>
              </div>
            </section>

            <aside className="space-y-4" aria-label="Motorun izlediği durum">
              <section className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)]">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-mono text-[10px] uppercase tracking-[.15em]">İzlenen durum</h2>
                  <Activity size={15} className="text-[hsl(var(--primary))]" />
                </div>
                <div className="rounded-xl bg-[hsl(var(--background))] p-3.5">
                  <div className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Aktif konu</div>
                  <p className="mt-1.5 break-words font-serif text-[18px] leading-[1.18] tracking-[-.02em]" data-testid="text-current-topic">{conversation.topic || 'Henüz konu belirlenmedi'}</p>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">İlerleme</div>
                    <div className="mt-1 font-serif text-[28px] leading-none">{progress}<span className="ml-1 text-sm text-[hsl(var(--muted-foreground))]">/ 100</span></div>
                  </div>
                  <span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.09em] text-[hsl(var(--secondary-foreground))]">{conversation.phase || 'başlangıç'}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--secondary))]" role="progressbar" aria-label="Konuşma ilerlemesi" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[hsl(var(--border))] pt-3 text-[11px]">
                  <span className="text-[hsl(var(--muted-foreground))]">Tekrar göstergesi</span>
                  <span className={`inline-flex items-center gap-1.5 font-mono ${conversation.repetitionCount > 0 ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}`} data-testid="status-repetition">
                    <span className={`h-1.5 w-1.5 rounded-full ${conversation.repetitionCount > 0 ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--primary))]'}`} />
                    {conversation.repetitionCount}
                  </span>
                </div>
                {conversation.lastPurpose && (
                  <div className="mt-3 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Son amaç: <span className="text-[hsl(var(--foreground))]">{conversation.lastPurpose}</span></div>
                )}
              </section>

              <section className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)]">
                <div className="mb-4 flex items-center gap-2">
                  <CircleHelp size={15} className="text-[hsl(var(--accent))]" />
                  <h2 className="font-mono text-[10px] uppercase tracking-[.15em]">Açık sorular</h2>
                  <span className="ml-auto font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{conversation.openQuestions.filter((question) => !question.answered).length}</span>
                </div>
                {conversation.openQuestions.length ? (
                  <ul className="space-y-3">
                    {conversation.openQuestions.map((question) => (
                      <li key={question.id} data-testid={`question-${question.id}`} className="border-l-2 border-[hsl(var(--accent)/.55)] pl-3">
                        <p className={`text-[12px] leading-[1.55] ${question.answered ? 'text-[hsl(var(--muted-foreground))] line-through decoration-[hsl(var(--border))]' : ''}`}>{question.text}</p>
                          <div className="mt-1 font-mono text-[9px] text-[hsl(var(--muted-foreground))]">{question.answered ? 'Yanıtlandı' : `Soruyu açan: ${getSpeaker(question.askedBy).name}`}</div>
                      </li>
                    ))}
                  </ul>
                ) : <QuietEmpty text="Konuşma ilerledikçe yanıt bekleyen sorular burada görünür." />}
              </section>

              <section className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)]">
                <div className="mb-4 flex items-center gap-2">
                  <Waypoints size={15} className="text-[hsl(var(--primary))]" />
                  <h2 className="font-mono text-[10px] uppercase tracking-[.15em]">Karakterlerin duruşu</h2>
                </div>
                {conversation.memories.length ? (
                  <div className="space-y-4">
                    {conversation.memories.map((memory) => {
                      const speaker = getSpeaker(memory.speakerId);
                      return (
                        <div key={memory.speakerId} className="border-b border-[hsl(var(--border))] pb-3 last:border-0 last:pb-0" data-testid={`memory-${memory.speakerId}`}>
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-semibold text-white" style={{ backgroundColor: speaker.color }}>{speaker.initials}</span>
                            <span className="text-[12px] font-semibold">{speaker.name}</span>
                            <span className="ml-auto font-mono text-[9px] text-[hsl(var(--muted-foreground))]">{memory.turns} tur</span>
                          </div>
                          <p className="text-[11px] leading-[1.5] text-[hsl(var(--foreground))]">{memory.position || 'Henüz belirgin bir duruş yok.'}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-[hsl(var(--muted-foreground))]">
                            <span>Duruş ekseni: {memory.positionScore > 0 ? '+' : ''}{Math.round(memory.positionScore * 100)}%</span>
                            {memory.previousPosition && <span>Önceki: {memory.previousPosition}</span>}
                          </div>
                          {memory.lastClaim && <p className="mt-2 text-[10px] leading-[1.5] text-[hsl(var(--muted-foreground))]"><span className="font-medium text-[hsl(var(--foreground))]">Son hatırlanan ifade:</span> {memory.lastClaim}</p>}
                          {memory.changeReason && <p className="mt-1.5 text-[10px] leading-4 text-[hsl(var(--accent))]">Değişim nedeni: {memory.changeReason}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : <QuietEmpty text="Karakterler söz aldığında duruşları burada izlenir." />}
              </section>

              <section className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-mono text-[10px] uppercase tracking-[.15em]">Çıkarılan iddialar</h2>
                  <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{conversation.claims.length}</span>
                </div>
                {conversation.claims.length ? (
                  <div className="max-h-64 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                    {[...conversation.claims].reverse().map((claim) => {
                      const speaker = getSpeaker(claim.speakerId);
                      const kindLabel: Record<string, string> = { fact: 'olgu iddiası', assumption: 'varsayım', opinion: 'görüş', joke: 'şaka' };
                      return (
                        <article key={claim.id} data-testid={`claim-${claim.id}`} className="rounded-lg bg-[hsl(var(--background))] p-3">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[10px] font-semibold">{speaker.name}</span>
                            <span className="shrink-0 rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[.05em] text-[hsl(var(--secondary-foreground))]">{kindLabel[claim.kind] ?? claim.kind}</span>
                          </div>
                          <p className="text-[11px] leading-[1.5]">{claim.text}</p>
                          <div className="mt-1.5 font-mono text-[9px] text-[hsl(var(--muted-foreground))]">Tur {claim.turn} · {claim.topic}</div>
                        </article>
                      );
                    })}
                  </div>
                ) : <QuietEmpty text="Konuşmadan çıkarılan iddialar burada listelenir." />}
                <p className="mt-3 border-t border-[hsl(var(--border))] pt-3 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Etiketler, motorun metni nasıl sınıflandırdığını gösterir; iddiaların doğruluğunu teyit etmez.</p>
              </section>
            </aside>
          </div>
          <footer className="mt-6 flex flex-col gap-2 border-t border-[hsl(var(--border))] pt-4 text-[10px] leading-5 text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
            <p>Konuşma Motoru yerel, kural tabanlı bir sistemdir; dil modeli değildir.</p>
            <p>Oturum yalnızca bu tarayıcıda saklanır.</p>
          </footer>
        </section>
      </div>
    </main>
  );
}

function MessageRow({ message, index, speaker, time }: { message: Message; index: number; speaker: { name: string; role: string; initials: string; color: string }; time: string }) {
  const isUser = message.speakerId === USER_ID;
  return (
    <article className={`fade-up flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`} style={{ animationDelay: `${Math.min(index % 5, 4) * 35}ms` }} data-testid={`message-${message.id}`}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: speaker.color }} aria-hidden="true">{speaker.initials}</div>
      <div className={`min-w-0 max-w-[88%] ${isUser ? 'text-right' : ''}`}>
        <div className={`mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ${isUser ? 'justify-end' : ''}`}>
          <span className="text-[12px] font-semibold">{speaker.name}</span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{speaker.role}</span>
          {message.label && <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[.06em] text-[hsl(var(--secondary-foreground))]">{message.label}</span>}
          {time && <time className="font-mono text-[9px] text-[hsl(var(--muted-foreground))]">{time}</time>}
        </div>
        <div className={`inline-block rounded-[3px_14px_14px_14px] px-3.5 py-3 text-left text-[13px] leading-[1.65] ${isUser ? 'rounded-[14px_3px_14px_14px] bg-[hsl(var(--primary)/.09)]' : 'bg-[hsl(var(--background))]'}`}>
          {message.text}
        </div>
        {message.purpose && <div className={`mt-1.5 font-mono text-[9px] text-[hsl(var(--muted-foreground))] ${isUser ? 'text-right' : ''}`}>Amaç · {message.purpose}</div>}
      </div>
    </article>
  );
}

function QuietEmpty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-[hsl(var(--border))] px-3 py-3 text-[11px] leading-[1.55] text-[hsl(var(--muted-foreground))]">{text}</p>;
}

