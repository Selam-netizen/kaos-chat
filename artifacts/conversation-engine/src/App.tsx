import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Activity, ArrowDown, ArrowUpRight, Check, ChevronDown, CircleHelp, Download, FileJson2, FileText, MessageSquarePlus, MoreHorizontal, Pause, Play, Plus, Send, Settings2, Sparkles, Trash2, Waypoints, X } from 'lucide-react';
import { createChatGptReply, createGeminiReply, useCreateChatGptReply, useCreateGeminiReply, useGetChatProviderStatus } from '@workspace/api-client-react';
import { addUserMessage, appendCharacterReply, CHARACTERS, createInitialConversation, getCharacter, generateReplyForSpeaker, type Character, type ConversationState, type Message } from './engine';
import { AutomaticConversationController } from './automation';
import { buildProviderInput } from './providerClient';
import { createChatSession, deleteChatSession, exportChatJson, exportChatText, loadChatStore, renameChatSession, saveChatStore, updateSession, type ChatSession, type ChatStore } from './chatStorage';

const USER_ID = 'user';
const DEFAULT_LIMIT = 10;
const LIMITS = [3, 5, 10, 20] as const;

function loadStore(): ChatStore {
  try {
    return loadChatStore(window.localStorage);
  } catch {
    return { version: 2, sessions: [createChatSession()], activeId: '' };
  }
}

function App() {
  const [store, setStore] = useState<ChatStore>(loadStore);
  const [topicDraft, setTopicDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [typingSpeaker, setTypingSpeaker] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState<number | null>(DEFAULT_LIMIT);
  const [runError, setRunError] = useState('');
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef(store);
  const activeIdRef = useRef(store.activeId || store.sessions[0]?.id || '');
  const requestSignalRef = useRef<{ openai?: AbortSignal; gemini?: AbortSignal }>({});

  const { data: providerStatus, isLoading: statusLoading, isError: statusError } = useGetChatProviderStatus();
  const gptMutation = useCreateChatGptReply({
    mutation: {
      mutationFn: ({ data }) => createChatGptReply(data, { signal: requestSignalRef.current.openai }),
    },
  });
  const geminiMutation = useCreateGeminiReply({
    mutation: {
      mutationFn: ({ data }) => createGeminiReply(data, { signal: requestSignalRef.current.gemini }),
    },
  });
  const gptMutateRef = useRef(gptMutation.mutateAsync);
  const geminiMutateRef = useRef(geminiMutation.mutateAsync);
  gptMutateRef.current = gptMutation.mutateAsync;
  geminiMutateRef.current = geminiMutation.mutateAsync;

  const commitStore = useCallback((next: ChatStore) => {
    storeRef.current = next;
    activeIdRef.current = next.activeId;
    setStore(next);
  }, []);
  const mutateStore = useCallback((mutator: (current: ChatStore) => ChatStore) => {
    commitStore(mutator(storeRef.current));
  }, [commitStore]);
  const activeSession = store.sessions.find((session) => session.id === store.activeId) ?? store.sessions[0];
  const conversation = activeSession?.state;
  const speakerMap = useMemo(() => new Map(CHARACTERS.map((character) => [character.id, character])), []);
  const activeId = activeSession?.id ?? '';

  useEffect(() => {
    try { saveChatStore(window.localStorage, store); } catch { /* Storage can be unavailable; the active thread remains usable. */ }
  }, [store]);
  useEffect(() => {
    storeRef.current = store;
    activeIdRef.current = store.activeId;
  }, [store]);
  useEffect(() => {
    setTopicDraft(conversation?.topic ?? '');
    setMessageDraft('');
    setRunError('');
  }, [activeId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation?.messages.length]);

  const controllerRef = useRef<AutomaticConversationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new AutomaticConversationController({
      getEnabledCharacterIds: (sessionId) => storeRef.current.sessions.find((session) => session.id === sessionId)?.enabledCharacterIds ?? [],
      getState: (sessionId) => storeRef.current.sessions.find((session) => session.id === sessionId)?.state ?? null,
      setState: (sessionId, nextState) => {
        const exists = storeRef.current.sessions.some((session) => session.id === sessionId);
        if (!exists) return false;
        mutateStore((current) => updateSession(current, sessionId, (session) => ({ ...session, state: nextState, updatedAt: Date.now() })));
        return true;
      },
      isCurrentSession: (sessionId) => activeIdRef.current === sessionId,
      requestProviderReply: async (character, state, signal) => {
        const input = buildProviderInput(character, state);
        const provider = character.source === 'openai' ? 'openai' : 'gemini';
        requestSignalRef.current[provider] = signal;
        try {
          const result = provider === 'openai'
            ? await gptMutateRef.current({ data: input })
            : await geminiMutateRef.current({ data: input });
          setVerified((current) => ({ ...current, [provider]: true }));
          setProviderErrors((current) => ({ ...current, [provider]: '' }));
          return result.text;
        } catch (error) {
          if (!signal.aborted) {
            const message = error instanceof Error ? error.message : `${character.name} yanıt veremedi.`;
            setProviderErrors((current) => ({ ...current, [provider]: message }));
          }
          throw error;
        } finally {
          if (requestSignalRef.current[provider] === signal) requestSignalRef.current[provider] = undefined;
        }
      },
      onTyping: setTypingSpeaker,
      onError: (message) => setRunError(message),
      onNoActiveCharacters: () => setRunError('Devam etmek için en az bir karakteri etkinleştir.'),
      onRunningChange: setRunning,
      intervalMs: 1000,
    });
  }
  const controller = controllerRef.current;

  const getSpeaker = (speakerId: string): Character =>
    speakerId === USER_ID
      ? { id: USER_ID, name: 'Sen', role: 'Katılımcı', initials: 'S', color: '#91a6c4', source: 'local' }
      : speakerMap.get(speakerId) ?? { id: 'unknown', name: 'Katılımcı', role: 'Karakter', initials: '?', color: '#8290a3', source: 'local' };
  const formatTime = (timestamp: number) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);

  const startRun = (count = limit) => {
    if (!activeSession || controller.isRunning) return;
    setRunError('');
    mutateStore((current) => updateSession(current, activeSession.id, (session) => ({ ...session, autoStopped: false })));
    controller.start(activeSession.id, count);
  };
  const stopRun = () => {
    if (!activeSession) return;
    controller.stop();
    mutateStore((current) => updateSession(current, activeSession.id, (session) => ({ ...session, autoStopped: true, updatedAt: Date.now() })));
  };
  const updateConversation = (sessionId: string, updater: (current: ConversationState) => ConversationState) => {
    mutateStore((current) => updateSession(current, sessionId, (session) => ({ ...session, state: updater(session.state), updatedAt: Date.now() })));
  };
  const addMessage = (text: string) => {
    if (!activeSession || !text.trim()) return;
    controller.cancelCurrentTurnForNewMessage();
    updateConversation(activeSession.id, (current) => addUserMessage(current, text.trim()));
  };
  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!messageDraft.trim()) return;
    addMessage(messageDraft);
    setMessageDraft('');
  };
  const handleMessageKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (messageDraft.trim()) {
        addMessage(messageDraft);
        setMessageDraft('');
      }
    }
  };
  const newSession = (topic?: string) => {
    controller.stop();
    const session = createChatSession(topic);
    const next: ChatStore = { ...storeRef.current, sessions: [session, ...storeRef.current.sessions], activeId: session.id };
    commitStore(next);
    setMobileHistoryOpen(false);
    setRunError('');
  };
  const selectSession = (sessionId: string) => {
    if (sessionId === activeIdRef.current) return;
    controller.stop();
    mutateStore((current) => ({ ...current, activeId: sessionId }));
    setMobileHistoryOpen(false);
  };
  const submitTopic = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (topicDraft.trim()) newSession(topicDraft.trim());
  };
  const toggleCharacter = (characterId: string) => {
    if (!activeSession) return;
    mutateStore((current) => updateSession(current, activeSession.id, (session) => ({
      ...session,
      enabledCharacterIds: session.enabledCharacterIds.includes(characterId)
        ? session.enabledCharacterIds.filter((id) => id !== characterId)
        : [...session.enabledCharacterIds, characterId],
      updatedAt: Date.now(),
    })));
  };
  const renameSession = (session: ChatSession) => {
    const title = window.prompt('Sohbet başlığını düzenle', session.title);
    if (title?.trim()) mutateStore((current) => renameChatSession(current, session.id, title));
  };
  const removeSession = (session: ChatSession) => {
    if (!window.confirm(`“${session.title}” sohbeti silinsin mi? Bu işlem geri alınamaz.`)) return;
    controller.stop();
    const next = deleteChatSession(storeRef.current, session.id);
    commitStore(next);
  };
  const download = (type: 'txt' | 'json') => {
    if (!activeSession) return;
    const body = type === 'json' ? exportChatJson(activeSession) : exportChatText(activeSession);
    const blob = new Blob([body], { type: type === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSession.title.replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 50) || 'sohbet'}.${type}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const setTopicForActive = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSession || !topicDraft.trim()) return;
    const nextTopic = topicDraft.trim();
    updateConversation(activeSession.id, (current) => ({ ...current, topic: nextTopic }));
    mutateStore((current) => renameChatSession(current, activeSession.id, nextTopic.slice(0, 80)));
  };

  const progress = Math.max(0, Math.min(100, Number(conversation?.progress) || 0));
  const enabledIds = activeSession?.enabledCharacterIds ?? [];
  const newestMessages = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of conversation?.messages ?? []) map.set(message.speakerId, message);
    return map;
  }, [conversation?.messages]);

  const providerBadge = (character: Character) => {
    if (character.source === 'local') return { label: 'Yerel simülasyon', tone: 'local' };
    const key = character.source === 'openai' ? 'openai' : 'gemini';
    const configured = key === 'openai' ? providerStatus?.openai.configured : providerStatus?.gemini.configured;
    if (statusLoading) return { label: 'Durum bekleniyor', tone: 'waiting' };
    if (statusError) return { label: 'Durum alınamadı', tone: 'error' };
    if (!configured) return { label: 'Anahtar eksik', tone: 'missing' };
    if (providerErrors[key]) return { label: 'Bağlantı hatası', tone: 'error' };
    if (verified[key]) return { label: 'Bağlantı doğrulandı', tone: 'verified' };
    return { label: 'Anahtar var · doğrulanmadı', tone: 'unverified' };
  };

  if (!activeSession || !conversation) {
    return <main className="page-shell min-h-[100dvh] p-6"><div className="mx-auto max-w-4xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">Sohbetler yükleniyor…</div></main>;
  }

  return (
    <main className="page-shell min-h-[100dvh]">
      <div className="relative z-[1] mx-auto flex min-h-[100dvh] max-w-[1680px] flex-col px-3 pb-4 pt-3 sm:px-5 sm:pt-5 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Waypoints size={19} /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="font-serif text-[18px] font-extrabold tracking-[-.045em]">Kaos Chat</span><span className="hidden rounded-full border border-[hsl(var(--border))] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))] sm:inline-flex">Konuşma konsolu</span></div>
              <div className="mt-0.5 truncate text-[10px] text-[hsl(var(--muted-foreground))]">Beş farklı ses. Tek bir düşünce alanı.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => download('txt')} data-testid="button-export-txt" className="quiet-button hidden sm:inline-flex"><FileText size={14} /> TXT</button>
            <button type="button" onClick={() => download('json')} data-testid="button-export-json" className="quiet-button hidden sm:inline-flex"><FileJson2 size={14} /> JSON</button>
            <button type="button" onClick={() => newSession()} data-testid="button-new-chat" className="primary-button"><Plus size={15} /><span className="hidden sm:inline">Yeni sohbet</span><span className="sm:hidden">Yeni</span></button>
          </div>
        </header>

        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[hsl(var(--accent)/.23)] bg-[hsl(var(--accent)/.07)] px-3.5 py-3 sm:px-4">
          <span className="mt-1 block h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--accent))]" />
          <p className="text-[11px] leading-[1.55] text-[hsl(var(--foreground)/.82)]"><strong className="font-semibold text-[hsl(var(--accent))]">Maliyet notu</strong><span className="mx-1.5 text-[hsl(var(--muted-foreground))]">/</span>ChatGPT ve Gemini yanıtları ücretli API kullanımı oluşturabilir. Yerel karakterler simülasyondur; sağlayıcı yanıtı gelmeden gerçek API yanıtı gösterilmez.</p>
        </div>

        <div className="grid flex-1 items-start gap-4 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
          <aside className={`history-panel ${mobileHistoryOpen ? 'mobile-history-open' : ''}`}>
            <div className="mb-3 flex items-center justify-between">
              <div><div className="eyebrow">Arşiv</div><div className="mt-1 font-serif text-[17px] font-bold">Sohbet geçmişi</div></div>
              <button type="button" className="icon-button lg:hidden" aria-label="Geçmişi kapat" onClick={() => setMobileHistoryOpen(false)}><X size={16} /></button>
            </div>
            <button type="button" onClick={() => newSession()} data-testid="button-sidebar-new" className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[hsl(var(--border))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))] transition hover:border-[hsl(var(--primary)/.5)] hover:text-[hsl(var(--foreground))]"><MessageSquarePlus size={14} /> Yeni tartışma aç</button>
            <div className="max-h-[28vh] space-y-1 overflow-y-auto pr-1 scrollbar-thin lg:max-h-[calc(100dvh-300px)]">
              {store.sessions.map((session) => (
                <div key={session.id} className={`group relative rounded-lg border transition ${session.id === activeSession.id ? 'border-[hsl(var(--primary)/.28)] bg-[hsl(var(--primary)/.08)]' : 'border-transparent hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary)/.55)]'}`}>
                  <button type="button" onClick={() => selectSession(session.id)} data-testid={`button-select-session-${session.id}`} className="w-full min-w-0 px-3 py-2.5 text-left">
                    <div className="truncate pr-6 text-[11px] font-semibold">{session.title || 'Yeni sohbet'}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-[9px] text-[hsl(var(--muted-foreground))]"><span>{new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(session.updatedAt)}</span><span className="h-1 w-1 rounded-full bg-[hsl(var(--border))]" /><span>{session.state.messages.length} mesaj</span></div>
                  </button>
                  <button type="button" className="history-menu-trigger" aria-label={`${session.title} seçenekleri`} data-testid={`button-session-menu-${session.id}`} onClick={() => {
                    const action = window.prompt('Başlık değiştir veya sohbeti sil: başlık / sil', 'başlık');
                    if (action === 'başlık') renameSession(session);
                    if (action === 'sil') removeSession(session);
                  }}><MoreHorizontal size={14} /></button>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-[hsl(var(--border))] pt-4">
              <div className="mb-3 flex items-center justify-between"><span className="eyebrow">Katılımcılar</span><Settings2 size={13} className="text-[hsl(var(--muted-foreground))]" /></div>
              <div className="space-y-1.5">
                {CHARACTERS.map((character) => {
                  const status = providerBadge(character);
                  const checked = enabledIds.includes(character.id);
                  return <label key={character.id} className={`participant-toggle ${checked ? 'participant-on' : ''}`} data-testid={`toggle-character-${character.id}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleCharacter(character.id)} aria-label={`${character.name} katılımı`} />
                    <span className="participant-avatar" style={{ backgroundColor: character.color }}>{character.initials}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold">{character.name}</span><span className={`block truncate text-[8px] ${status.tone}`}>{status.label}</span></span>
                    <span className={`source-mark ${character.source === 'local' ? 'source-local' : 'source-api'}`}>{character.source === 'local' ? 'YEREL' : 'API'}</span>
                  </label>;
                })}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.6)] p-3 text-[9px] leading-[1.55] text-[hsl(var(--muted-foreground))]">Yerel simülasyonlar bir sağlayıcıya bağlanmaz. API anahtarı durumu yalnızca yapılandırmayı gösterir; doğrulama, ilk başarılı yanıttan sonra yapılır.</div>
          </aside>

          <section className="conversation-panel panel-edge overflow-hidden rounded-[17px] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="border-b border-[hsl(var(--border))] px-4 py-4 sm:px-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" className="icon-button lg:hidden" aria-label="Sohbet geçmişini aç" onClick={() => setMobileHistoryOpen(true)}><ChevronDown size={15} /></button>
                  <div className="min-w-0"><div className="eyebrow">Canlı tartışma</div><div className="mt-1 truncate font-serif text-[16px] font-bold tracking-[-.02em]">{activeSession.title}</div></div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => renameSession(activeSession)} className="quiet-button hidden sm:inline-flex" data-testid="button-rename-session">Başlığı düzenle</button>
                  <span className={`run-state ${running ? 'run-state-active' : ''}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{running ? 'Çalışıyor' : activeSession.autoStopped ? 'Durduruldu' : 'Hazır'}</span>
                </div>
              </div>
              <form onSubmit={setTopicForActive} className="flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="topic">Tartışma konusu</label>
                <input id="topic" data-testid="input-topic" value={topicDraft} onChange={(event) => setTopicDraft(event.target.value)} maxLength={240} placeholder="Bir konu ya da açılış cümlesi yaz…" className="field-control h-10 min-w-0 flex-1" />
                <button type="submit" data-testid="button-set-topic" disabled={!topicDraft.trim()} className="quiet-button h-10 justify-center disabled:opacity-40"><ArrowUpRight size={14} /> Konuyu güncelle</button>
              </form>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.32)] px-4 py-2.5 sm:px-6">
              <div className="flex items-center gap-2.5"><div className="flex -space-x-1.5" aria-hidden="true">{CHARACTERS.map((character) => <span key={character.id} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[hsl(var(--card))] text-[7px] font-bold text-white" style={{ backgroundColor: character.color }}>{character.initials}</span>)}</div><span className="text-[10px] text-[hsl(var(--muted-foreground))]">5 ses <span className="mx-1 text-[hsl(var(--border))]">/</span> {conversation.messages.length} mesaj</span></div>
              <div className="flex items-center gap-2"><label className="text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]" htmlFor="run-limit">Otomatik tur</label><select id="run-limit" value={limit === null ? 'unlimited' : String(limit)} onChange={(event) => setLimit(event.target.value === 'unlimited' ? null : Number(event.target.value))} className="select-control" data-testid="select-run-limit">{LIMITS.map((value) => <option key={value} value={value}>{value} mesaj</option>)}<option value="unlimited">Sınırsız</option></select></div>
            </div>
            <div className="message-scroll scrollbar-thin" aria-live="polite" aria-label="Konuşma mesajları">
              {conversation.messages.length === 0 ? <div className="flex min-h-[330px] flex-col items-center justify-center px-6 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/.22)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]"><Waypoints size={19} /></div><h2 className="font-serif text-[22px] font-bold tracking-[-.03em]">Konuşma için alan açıldı.</h2><p className="mt-2 max-w-[350px] text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">Bir konu belirle veya ilk mesajını yaz. Katılımcıların her biri kendi kaynağı ve bakış açısıyla söz alır.</p></div> : <div className="space-y-5">
                {conversation.messages.map((message, index) => <MessageRow key={message.id} message={message} index={index} speaker={getSpeaker(message.speakerId)} time={formatTime(message.createdAt)} />)}
                {typingSpeaker && <TypingIndicator speaker={getSpeaker(typingSpeaker)} />}
                <div ref={endRef} />
              </div>}
            </div>
            <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background)/.55)] p-3.5 sm:px-5 sm:py-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {running ? <button type="button" onClick={stopRun} data-testid="button-stop-run" className="danger-button"><Pause size={13} /> Durdur</button> : <button type="button" onClick={() => startRun()} data-testid="button-start-run" className="primary-button"><Play size={13} /> {activeSession.autoStopped ? 'Devam et' : 'Otomatik başlat'}</button>}
                <button type="button" onClick={() => startRun(1)} disabled={running} data-testid="button-one-turn" className="quiet-button disabled:opacity-40"><Sparkles size={13} /> Tek yanıt</button>
                {running && <span className="ml-auto flex items-center gap-1.5 text-[9px] text-[hsl(var(--muted-foreground))]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--primary))]" /> Bir sonraki söz sırası bekleniyor</span>}
              </div>
              {runError && <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-[hsl(var(--destructive)/.28)] bg-[hsl(var(--destructive)/.08)] px-3 py-2 text-[10px] leading-4 text-[hsl(var(--destructive))]" role="alert"><span>{runError}</span><button type="button" onClick={() => setRunError('')} aria-label="Uyarıyı kapat"><X size={13} /></button></div>}
              <form onSubmit={submitMessage} className="flex items-end gap-2">
                <label className="sr-only" htmlFor="message">Mesajını yaz</label>
                <textarea id="message" data-testid="input-message" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} onKeyDown={handleMessageKey} rows={2} maxLength={1000} placeholder="Düşünceni ekle; otomatik tur sürerken de yazabilirsin…" className="field-control max-h-36 min-h-[48px] flex-1 resize-y py-3 leading-5" />
                <button type="submit" data-testid="button-send-message" disabled={!messageDraft.trim()} className="send-button" aria-label="Mesajı gönder"><Send size={16} /></button>
              </form>
              <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-[hsl(var(--muted-foreground))]"><span>Enter gönderir · Shift + Enter yeni satır</span><span>{messageDraft.length}/1000</span></div>
              <div className="mt-2 flex gap-2 sm:hidden"><button type="button" onClick={() => download('txt')} className="quiet-button flex-1 justify-center"><FileText size={13} /> TXT dışa aktar</button><button type="button" onClick={() => download('json')} className="quiet-button flex-1 justify-center"><FileJson2 size={13} /> JSON dışa aktar</button></div>
            </div>
          </section>

          <aside className="insights-column space-y-3" aria-label="Tartışma durumu ve akıl yürütme">
            <section className="panel-edge rounded-[15px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Activity size={14} className="text-[hsl(var(--primary))]" /><h2 className="eyebrow">Tartışma sinyalleri</h2></div><span className="text-[9px] text-[hsl(var(--muted-foreground))]">{progress}%</span></div>
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background)/.7)] p-3"><div className="eyebrow">Şu an konuşulan</div><p className="mt-1.5 break-words text-[12px] font-semibold leading-[1.45]" data-testid="text-current-topic">{conversation.topic || 'Henüz konu belirlenmedi'}</p></div>
              <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[9px] uppercase tracking-[.09em] text-[hsl(var(--muted-foreground))]">Aşama</span><span className="rounded-md bg-[hsl(var(--secondary))] px-2 py-1 text-right text-[9px] font-medium text-[hsl(var(--secondary-foreground))]">{conversation.phase || 'Başlangıç'}</span></div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[hsl(var(--secondary))]" role="progressbar" aria-label="Konuşma ilerlemesi" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${progress}%` }} /></div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[hsl(var(--background)/.7)] p-2.5"><div className="text-[8px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Yinelenme</div><div className={`mt-1 font-mono text-[14px] ${conversation.repetitionCount ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}`} data-testid="status-repetition">{conversation.repetitionCount}</div></div>
                <div className="rounded-lg bg-[hsl(var(--background)/.7)] p-2.5"><div className="text-[8px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Açık soru</div><div className="mt-1 font-mono text-[14px]">{conversation.openQuestions.filter((question) => !question.answered).length}</div></div>
              </div>
              {conversation.lastPurpose && <div className="mt-3 border-t border-[hsl(var(--border))] pt-2.5 text-[9px] text-[hsl(var(--muted-foreground))]">Son akıl yürütme amacı <span className="ml-1 text-[hsl(var(--foreground))]">{conversation.lastPurpose}</span></div>}
            </section>

            <section className="rounded-[15px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="mb-3 flex items-center gap-2"><CircleHelp size={14} className="text-[hsl(var(--accent))]" /><h2 className="eyebrow">Açık sorular</h2><span className="ml-auto font-mono text-[9px] text-[hsl(var(--muted-foreground))]">{conversation.openQuestions.filter((question) => !question.answered).length}</span></div>
              {conversation.openQuestions.length ? <ul className="space-y-3">{[...conversation.openQuestions].reverse().slice(0, 5).map((question) => <li key={question.id} className="border-l border-[hsl(var(--accent)/.62)] pl-2.5"><p className={`text-[10px] leading-[1.55] ${question.answered ? 'text-[hsl(var(--muted-foreground))] line-through' : ''}`}>{question.text}</p><div className="mt-1 text-[8px] text-[hsl(var(--muted-foreground))]">{question.answered ? 'Yanıtlandı' : `Soruyu açan: ${getSpeaker(question.askedBy).name}`}</div></li>)}</ul> : <QuietEmpty text="Yanıt bekleyen sorular konuşma ilerledikçe burada belirir." />}
            </section>

            <section className="rounded-[15px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Waypoints size={14} className="text-[hsl(var(--primary))]" /><h2 className="eyebrow">Son sözler ve duruşlar</h2></div><span className="text-[8px] text-[hsl(var(--muted-foreground))]">Katılımcı başına</span></div>
              <div className="space-y-2.5">{CHARACTERS.map((character) => {
                const latest = newestMessages.get(character.id);
                const memory = conversation.memories.find((item) => item.speakerId === character.id);
                return <div key={character.id} className="border-b border-[hsl(var(--border))] pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2"><span className="participant-avatar h-5 w-5 text-[7px]" style={{ backgroundColor: character.color }}>{character.initials}</span><span className="text-[9px] font-semibold">{character.name}</span><span className={`ml-auto text-[7px] uppercase tracking-[.08em] ${character.source === 'local' ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--primary))]'}`}>{character.source === 'local' ? 'Simülasyon' : 'API'}</span></div>
                  <p className="mt-1.5 line-clamp-2 text-[9px] leading-[1.5] text-[hsl(var(--muted-foreground))]">{latest?.text ?? memory?.position ?? 'Henüz söz almadı.'}</p>
                  {memory?.lastClaim && <div className="mt-1 truncate text-[8px] text-[hsl(var(--foreground)/.65)]">Hatırlanan: {memory.lastClaim}</div>}
                </div>;
              })}</div>
            </section>

            <section className="rounded-[15px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="mb-3 flex items-center justify-between"><h2 className="eyebrow">Çıkarılan iddialar</h2><span className="font-mono text-[9px] text-[hsl(var(--muted-foreground))]">{conversation.claims.length}</span></div>
              {conversation.claims.length ? <div className="max-h-52 space-y-2 overflow-y-auto pr-1 scrollbar-thin">{[...conversation.claims].reverse().slice(0, 12).map((claim) => {
                const kinds: Record<string, string> = { fact: 'olgu iddiası', assumption: 'varsayım', opinion: 'görüş', joke: 'şaka' };
                return <article key={claim.id} className="rounded-lg bg-[hsl(var(--background)/.72)] p-2.5"><div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-[9px] font-semibold">{getSpeaker(claim.speakerId).name}</span><span className="shrink-0 text-[7px] uppercase tracking-[.06em] text-[hsl(var(--accent))]">{kinds[claim.kind] ?? claim.kind}</span></div><p className="text-[9px] leading-[1.5]">{claim.text}</p><div className="mt-1.5 font-mono text-[7px] text-[hsl(var(--muted-foreground))]">Tur {claim.turn} · {claim.topic}</div></article>;
              })}</div> : <QuietEmpty text="Konuşmadan çıkarılan iddialar burada görünür." />}
              <p className="mt-2.5 border-t border-[hsl(var(--border))] pt-2 text-[8px] leading-[1.5] text-[hsl(var(--muted-foreground))]">Etiketler metin sınıflandırmasıdır; doğruluk teyidi değildir.</p>
            </section>
          </aside>
        </div>
        <footer className="flex flex-col gap-1.5 border-t border-[hsl(var(--border))] pt-3 text-[8px] leading-4 text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between"><span>Sohbetler bu tarayıcıda saklanır ve dışa aktarılabilir.</span><span>Gerçek sağlayıcı yanıtları yalnızca başarılı API isteğiyle eklenir.</span></footer>
      </div>
      {mobileHistoryOpen && <button type="button" className="mobile-scrim lg:hidden" aria-label="Geçmiş panelini kapat" onClick={() => setMobileHistoryOpen(false)} />}
    </main>
  );
}

function MessageRow({ message, index, speaker, time }: { message: Message; index: number; speaker: Character; time: string }) {
  const isUser = message.speakerId === USER_ID;
  return <article className={`fade-up message-row ${isUser ? 'message-user' : ''}`} style={{ animationDelay: `${Math.min(index % 6, 5) * 28}ms` }} data-testid={`message-${message.id}`}>
    <div className="message-avatar" style={{ backgroundColor: speaker.color }} aria-hidden="true">{speaker.initials}</div>
    <div className="message-body">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[10px] font-semibold">{speaker.name}</span><span className="text-[8px] text-[hsl(var(--muted-foreground))]">{speaker.role}</span>{message.source && message.source !== 'user' && <span className={`source-chip ${message.source === 'local' ? 'source-chip-local' : 'source-chip-api'}`}>{message.source === 'local' ? 'Yerel simülasyon' : 'API yanıtı'}</span>}{message.label && <span className="rounded bg-[hsl(var(--secondary))] px-1.5 py-0.5 text-[7px] uppercase tracking-[.07em] text-[hsl(var(--secondary-foreground))]">{message.label}</span>}<time className="ml-auto font-mono text-[8px] text-[hsl(var(--muted-foreground))]">{time}</time></div>
      <div className={`message-bubble ${isUser ? 'message-bubble-user' : ''}`}>{message.text}</div>
      {message.purpose && <div className="mt-1.5 text-[8px] text-[hsl(var(--muted-foreground))]">Akıl yürütme · {message.purpose}</div>}
    </div>
  </article>;
}

function TypingIndicator({ speaker }: { speaker: Character }) {
  return <div className="message-row fade-up" role="status" aria-live="polite"><div className="message-avatar" style={{ backgroundColor: speaker.color }}>{speaker.initials}</div><div className="message-body"><div className="mb-2 text-[10px] font-semibold">{speaker.name}<span className="ml-2 text-[8px] font-normal text-[hsl(var(--muted-foreground))]">yanıt hazırlıyor</span></div><div className="typing-dots"><i /><i /><i /></div></div></div>;
}

function QuietEmpty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-[hsl(var(--border))] px-3 py-3 text-[9px] leading-[1.55] text-[hsl(var(--muted-foreground))]">{text}</p>;
}

export default App;
