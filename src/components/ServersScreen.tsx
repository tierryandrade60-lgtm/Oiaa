import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchActiveServers } from '../game/multiplayerClient';
import {
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  ROOM_CODE_REGEX,
  type ServerSummary,
} from '../game/multiplayerTypes';
import { useIsPc } from '../utils/platform';

const PURPLE_DOT_PATTERN =
  'radial-gradient(circle, rgba(142, 145, 218, 0.34) 1.45px, transparent 1.55px), radial-gradient(circle, rgba(142, 145, 218, 0.34) 1.45px, transparent 1.55px)';

const YELLOW_DOT_PATTERN =
  'radial-gradient(circle, rgba(217, 134, 0, 0.34) 1.45px, transparent 1.55px), radial-gradient(circle, rgba(217, 134, 0, 0.34) 1.45px, transparent 1.55px)';

const PLAYER_LIMIT_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

interface ServersScreenProps {
  busy: boolean;
  errorMessage: string | null;
  playerName: string;
  liveServers: ServerSummary[] | null;
  onSubscribeServers: () => void;
  onUnsubscribeServers: () => void;
  onPlayerNameChange: (name: string) => void;
  onCreateServer: (params: {
    playerName: string;
    maxPlayers: number;
    isPrivate: boolean;
  }) => void;
  onJoinPublicServer: (roomId: string, playerName: string) => void;
  onJoinPrivateServer: (roomId: string, code: string, playerName: string) => Promise<boolean>;
  onClearError: () => void;
  onBack: () => void;
}

export const ServersScreen = memo(function ServersScreen({
  busy,
  errorMessage,
  playerName,
  liveServers,
  onSubscribeServers,
  onUnsubscribeServers,
  onPlayerNameChange,
  onCreateServer,
  onJoinPublicServer,
  onJoinPrivateServer,
  onClearError,
  onBack,
}: ServersScreenProps) {
  const isPc = useIsPc();
  const [polledServers, setPolledServers] = useState<ServerSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Server (+) Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMaxPlayers, setCreateMaxPlayers] = useState<number>(MAX_ROOM_PLAYERS);
  const [createIsPrivate, setCreateIsPrivate] = useState<boolean>(false);

  // Private Server Code Prompt state (only when clicking Join on a Private server)
  const [privateTarget, setPrivateTarget] = useState<ServerSummary | null>(null);
  const [privateCodeInput, setPrivateCodeInput] = useState('');
  const [privateModalError, setPrivateModalError] = useState<string | null>(null);

  // Brief Name-Required Alert & Highlight
  const [nameAlertText, setNameAlertText] = useState<string | null>(null);
  const [nameHighlight, setNameHighlight] = useState(false);
  const nameAlertTimerRef = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedName = playerName.replace(/\s+/g, ' ').trim();
  const hasValidName = normalizedName.length >= 1;

  const servers = liveServers ?? polledServers;

  const loadServers = useCallback(async (isInitial = false) => {
    try {
      const list = await fetchActiveServers();
      setPolledServers(list);
      setListError(null);
    } catch {
      if (isInitial) {
        setListError('Could not load servers right now.');
      }
    } finally {
      if (isInitial) {
        setLoadingList(false);
      }
    }
  }, []);

  useEffect(() => {
    onSubscribeServers();
    void loadServers(true);
    const intervalId = window.setInterval(() => {
      void loadServers(false);
    }, 2000);
    return () => {
      onUnsubscribeServers();
      window.clearInterval(intervalId);
      if (nameAlertTimerRef.current !== null) {
        window.clearTimeout(nameAlertTimerRef.current);
      }
    };
  }, [loadServers, onSubscribeServers, onUnsubscribeServers]);

  useEffect(() => {
    if (liveServers !== null) {
      setLoadingList(false);
      setListError(null);
    }
  }, [liveServers]);

  const triggerNameRequiredAlert = useCallback((actionLabel: 'create' | 'join') => {
    const message =
      actionLabel === 'create'
        ? 'Enter your name first before creating a server!'
        : 'Enter your name first before joining a server!';

    setNameAlertText(message);
    setNameHighlight(true);
    if (nameAlertTimerRef.current !== null) {
      window.clearTimeout(nameAlertTimerRef.current);
    }
    nameAlertTimerRef.current = window.setTimeout(() => {
      setNameAlertText(null);
      setNameHighlight(false);
      nameAlertTimerRef.current = null;
    }, 3200);

    setCreateModalOpen(false);
    setPrivateTarget(null);
    setPrivateModalError(null);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  }, []);

  const handleNameChange = (nextRaw: string) => {
    const cleaned = nextRaw.replace(/[\r\n<>]/g, '').slice(0, 20);
    onPlayerNameChange(cleaned);
    if (errorMessage) onClearError();
    if (cleaned.trim().length >= 1) {
      setNameAlertText(null);
      setNameHighlight(false);
      if (nameAlertTimerRef.current !== null) {
        window.clearTimeout(nameAlertTimerRef.current);
        nameAlertTimerRef.current = null;
      }
    }
  };

  const handleJoinRowClick = (server: ServerSummary) => {
    if (busy) return;
    if (errorMessage) onClearError();
    if (!hasValidName) {
      triggerNameRequiredAlert('join');
      return;
    }
    if (server.playerCount >= server.maxPlayers) {
      return;
    }
    if (server.isPrivate) {
      setPrivateTarget(server);
      setPrivateCodeInput('');
      setPrivateModalError(null);
      return;
    }
    onJoinPublicServer(server.roomId, normalizedName);
  };

  const handleCreateSubmit = () => {
    if (busy) return;
    if (errorMessage) onClearError();
    if (!hasValidName) {
      triggerNameRequiredAlert('create');
      return;
    }
    const clampedMax = Math.min(
      MAX_ROOM_PLAYERS,
      Math.max(MIN_ROOM_PLAYERS, createMaxPlayers),
    );
    onCreateServer({
      playerName: normalizedName,
      maxPlayers: clampedMax,
      isPrivate: createIsPrivate,
    });
  };

  const handlePrivateJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !privateTarget) return;
    if (errorMessage) onClearError();
    setPrivateModalError(null);
    if (!hasValidName) {
      triggerNameRequiredAlert('join');
      return;
    }
    const normalizedCode = privateCodeInput.trim().toUpperCase();
    if (!ROOM_CODE_REGEX.test(normalizedCode)) {
      setPrivateModalError('Enter a valid 6-character server code.');
      return;
    }
    const ok = await onJoinPrivateServer(
      privateTarget.roomId,
      normalizedCode,
      normalizedName,
    );
    if (!ok) {
      setPrivateModalError('Incorrect server code or server unavailable.');
    }
  };

  const filteredServers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter((s) => s.ownerName.toLowerCase().includes(q));
  }, [servers, searchQuery]);

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(circle at 45% 42%, #7BC1FF 0%, #4281D6 56%, #23437D 100%)',
        paddingTop: isPc
          ? 'max(22px, var(--stage-safe-top, 0px))'
          : 'max(10px, var(--stage-safe-top, 0px))',
        paddingBottom: isPc
          ? 'max(22px, var(--stage-safe-bottom, 0px))'
          : 'max(10px, var(--stage-safe-bottom, 0px))',
        paddingLeft: isPc
          ? 'max(32px, var(--stage-safe-left, 0px))'
          : 'max(14px, var(--stage-safe-left, 0px))',
        paddingRight: isPc
          ? 'max(32px, var(--stage-safe-right, 0px))'
          : 'max(14px, var(--stage-safe-right, 0px))',
        touchAction: 'manipulation',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Subtle Radial Sky Rings */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.45) 0, rgba(255,255,255,0.45) 140px, transparent 141px), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.25) 0, rgba(255,255,255,0.25) 265px, transparent 266px)',
        }}
      />

      {/* Top Header: Back + Servers Title on Left | Dedicated Name Input on Right */}
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
        <div className={`flex items-center ${isPc ? 'gap-3.5' : 'gap-2'}`}>
          <button
            type="button"
            disabled={busy}
            onClick={onBack}
            className={`inline-flex items-center gap-2 rounded-[8px] font-cartoon font-bold italic uppercase tracking-wide text-white transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0 ${
              isPc ? 'px-5 py-2.5' : 'px-3 py-1.5'
            }`}
            style={{
              backgroundColor: '#3E4182',
              backgroundImage: PURPLE_DOT_PATTERN,
              backgroundSize: '10px 10px',
              backgroundPosition: '0 0, 5px 5px',
              border: '2.5px solid #0B0D18',
              boxShadow: '2px 3px 0 rgba(8, 10, 18, 0.85)',
              fontSize: isPc ? '17px' : '12px',
              textShadow: '0 1.5px 0 rgba(8, 10, 18, 0.9)',
            }}
          >
            <svg
              width={isPc ? '19' : '14'}
              height={isPc ? '19' : '14'}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M15 6L9 12L15 18"
                stroke="#FFFFFF"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Back</span>
          </button>

          <div
            className={`inline-flex items-center rounded-[8px] whitespace-nowrap shrink-0 ${
              isPc ? 'px-5 py-2.5' : 'px-3.5 py-1.5'
            }`}
            style={{
              backgroundColor: '#2B2D5C',
              backgroundImage: PURPLE_DOT_PATTERN,
              backgroundSize: '11px 11px',
              backgroundPosition: '0 0, 5.5px 5.5px',
              border: '2.5px solid #0B0D18',
              boxShadow: '2px 3px 0 rgba(8, 10, 18, 0.85)',
            }}
          >
            <span
              className="font-cartoon font-bold italic uppercase tracking-wide text-white"
              style={{
                fontSize: isPc ? '18px' : '12.5px',
                textShadow: '0 1.5px 0 rgba(8, 10, 18, 0.9)',
              }}
            >
              Servers
            </span>
          </div>
        </div>

        {/* Dedicated Player Name Box */}
        <div
          className={`flex items-center gap-2 rounded-[9px] transition-transform duration-150 ${
            isPc ? 'px-3 py-1.5' : 'px-2.5 py-1'
          }`}
          style={{
            backgroundColor: nameHighlight ? '#5C1B28' : '#232856',
            border: nameHighlight ? '2.5px solid #FFD147' : '2.5px solid #0B0D18',
            boxShadow: nameHighlight
              ? '2px 3px 0 #0B0D18, 0 0 0 3px rgba(255, 209, 71, 0.45)'
              : '2px 3px 0 rgba(8, 10, 18, 0.85)',
          }}
        >
          <label
            htmlFor="servers-player-name"
            className="font-cartoon font-bold uppercase tracking-wide text-[#FFD147] whitespace-nowrap shrink-0"
            style={{
              fontSize: isPc ? '13px' : '11px',
              textShadow: '0 1px 0 #0B0D18',
            }}
          >
            Name
          </label>
          <input
            ref={nameInputRef}
            id="servers-player-name"
            type="text"
            value={playerName}
            maxLength={20}
            disabled={busy}
            placeholder="Enter your name..."
            aria-label="Your Name"
            onChange={(e) => handleNameChange(e.target.value)}
            className={`select-text rounded-[6px] px-2.5 py-1 font-cartoon font-bold text-white placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD147] disabled:opacity-60 ${
              isPc ? 'w-[210px] text-[14px]' : 'w-[146px] text-[12px]'
            }`}
            style={{
              backgroundColor: '#121633',
              border: '2px solid #0B0D18',
              boxShadow: 'inset 0 2px 0 rgba(0, 0, 0, 0.4)',
            }}
          />
        </div>
      </header>

      {/* Brief Alert / Warning Banner (Name Required or Server Error) */}
      {(nameAlertText || (errorMessage && !privateTarget)) && (
        <div
          role="alert"
          aria-live="assertive"
          className="relative z-40 mx-auto mt-2.5 flex w-full items-center justify-center gap-2 rounded-[8px] px-4 py-2 text-center font-cartoon font-bold uppercase tracking-wide text-white animate-cartoon-pop-in"
          style={{
            maxWidth: isPc ? '620px' : '500px',
            backgroundColor: nameAlertText ? '#B45309' : '#991B2C',
            border: '2.5px solid #0B0D18',
            boxShadow: '3px 4px 0 #0B0D18',
            fontSize: isPc ? '13.5px' : '11.5px',
            textShadow: '0 1px 0 #0B0D18',
          }}
        >
          <svg
            width={isPc ? '18' : '15'}
            height={isPc ? '18' : '15'}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M12 3L2.5 20H21.5L12 3Z"
              fill="#FFD147"
              stroke="#0B0D18"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M12 9.5V14"
              stroke="#0B0D18"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="12" cy="17" r="1.2" fill="#0B0D18" />
          </svg>
          <span>{nameAlertText ?? errorMessage}</span>
        </div>
      )}

      {/* Main Content Wrapper */}
      <main
        className={`relative z-10 mx-auto flex w-full flex-1 min-h-0 flex-col ${
          isPc ? 'mt-5 gap-3.5' : 'mt-2.5 gap-2.5'
        }`}
        style={{ maxWidth: isPc ? '920px' : '680px' }}
      >
        {/* Top Straight Container: Search Box (Owner Name Only) + Plus (+) Button */}
        <div
          className={`flex shrink-0 items-center gap-2.5 rounded-[10px] ${
            isPc ? 'p-2.5' : 'p-1.5'
          }`}
          style={{
            backgroundColor: '#232856',
            backgroundImage: PURPLE_DOT_PATTERN,
            backgroundSize: '12px 12px',
            backgroundPosition: '0 0, 6px 6px',
            border: '2.5px solid #0B0D18',
            boxShadow: '3px 4px 0 rgba(8, 10, 18, 0.9)',
          }}
        >
          <div
            className="relative flex flex-1 items-center rounded-[7px]"
            style={{
              backgroundColor: '#121633',
              border: '2px solid #0B0D18',
              boxShadow: 'inset 0 2px 0 rgba(0, 0, 0, 0.45)',
            }}
          >
            <svg
              width={isPc ? '18' : '15'}
              height={isPc ? '18' : '15'}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="pointer-events-none ml-3 shrink-0 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
              <path
                d="M16.5 16.5L21 21"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              placeholder="Search player name..."
              aria-label="Search servers by player name"
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full select-text bg-transparent px-2.5 font-cartoon font-bold text-white placeholder:text-slate-400 focus:outline-none ${
                isPc ? 'py-2.5 text-[15px]' : 'py-2 text-[12.5px]'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6L18 18M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            aria-label="Create server"
            title="Create server"
            onClick={() => {
              if (errorMessage) onClearError();
              setCreateModalOpen(true);
            }}
            className={`flex shrink-0 items-center justify-center rounded-[8px] font-cartoon font-bold text-[#0B0D18] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60 cursor-pointer ${
              isPc ? 'h-[44px] w-[48px]' : 'h-[38px] w-[42px]'
            }`}
            style={{
              backgroundColor: '#FFCC33',
              backgroundImage: YELLOW_DOT_PATTERN,
              backgroundSize: '10px 10px',
              backgroundPosition: '0 0, 5px 5px',
              border: '2.5px solid #0B0D18',
              boxShadow:
                'inset 0 -2.5px 0 #D99B00, inset 0 2px 0 rgba(255, 248, 205, 0.72), 2px 3px 0 #0B0D18',
            }}
          >
            <svg
              width={isPc ? '24' : '20'}
              height={isPc ? '24' : '20'}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 5V19M5 12H19"
                stroke="#0B0D18"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Servers List Panel */}
        <section
          aria-label="Available Servers"
          className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-[12px]"
          style={{
            backgroundColor: '#1E234D',
            backgroundImage: PURPLE_DOT_PATTERN,
            backgroundSize: '12px 12px',
            backgroundPosition: '0 0, 6px 6px',
            border: '2.5px solid #0B0D18',
            boxShadow: '4px 5px 0 rgba(8, 10, 18, 0.9)',
          }}
        >
          {/* Subtle Column Header */}
          <div
            className={`flex shrink-0 items-center justify-between border-b border-white/10 font-cartoon font-bold uppercase tracking-wider text-slate-300 ${
              isPc ? 'px-5 py-2.5 text-[12px]' : 'px-3.5 py-2 text-[10.5px]'
            }`}
            style={{ backgroundColor: 'rgba(11, 13, 24, 0.35)' }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="min-w-0 flex-1">Owner</span>
              <span className={isPc ? 'w-[76px]' : 'w-[54px]'}>Players</span>
              <span className={isPc ? 'w-[96px]' : 'w-[76px]'}>Access</span>
            </div>
            <span className={isPc ? 'w-[100px] text-right' : 'w-[76px] text-right'}>
              Action
            </span>
          </div>

          {/* Scrollable List Body */}
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex h-full min-h-[160px] items-center justify-center px-4 text-center font-cartoon text-[15px] font-bold uppercase tracking-wide text-slate-300">
                Loading servers...
              </div>
            ) : listError && servers.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 px-4 text-center">
                <p className="font-cartoon text-[14px] font-bold uppercase tracking-wide text-rose-300">
                  {listError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadServers(true)}
                  className="rounded-[8px] px-4 py-2 font-cartoon text-[13px] font-bold uppercase text-[#0B0D18] cursor-pointer"
                  style={{
                    backgroundColor: '#FFCC33',
                    border: '2px solid #0B0D18',
                    boxShadow: '2px 3px 0 #0B0D18',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1.5 px-4 text-center">
                <p
                  className="font-cartoon font-bold uppercase tracking-wide text-white"
                  style={{
                    fontSize: isPc ? '17px' : '14px',
                    textShadow: '0 1.5px 0 #0B0D18',
                  }}
                >
                  {searchQuery.trim()
                    ? 'No servers match that player name'
                    : 'No active servers yet'}
                </p>
                <p className="font-cartoon text-[12.5px] font-semibold text-slate-300">
                  {searchQuery.trim()
                    ? 'Try another owner name.'
                    : 'Press the + button above to create a server.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-white/10">
                {filteredServers.map((server) => {
                  const isFull = server.playerCount >= server.maxPlayers;
                  return (
                    <li
                      key={server.roomId}
                      className={`flex items-center justify-between gap-3 transition-colors hover:bg-white/[0.04] ${
                        isPc ? 'px-5 py-3' : 'px-3.5 py-2.5'
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        {/* Left Corner: Current Server Owner Name */}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <svg
                            width={isPc ? '16' : '13'}
                            height={isPc ? '16' : '13'}
                            viewBox="0 0 24 24"
                            fill="#FFD147"
                            aria-hidden="true"
                            className="shrink-0"
                          >
                            <path d="M3 18H21L19 7L14 12L12 5L10 12L5 7L3 18Z" />
                          </svg>
                          <span
                            className={`truncate font-cartoon font-bold text-white ${
                              isPc ? 'text-[17px]' : 'text-[13.5px]'
                            }`}
                            style={{ textShadow: '0 1px 0 #0B0D18' }}
                          >
                            {server.ownerName}
                          </span>
                        </div>

                        {/* Player Count (e.g. 1/8) */}
                        <span
                          className={`shrink-0 font-cartoon font-bold tabular-nums ${
                            isFull ? 'text-rose-300' : 'text-slate-100'
                          } ${isPc ? 'w-[76px] text-[15px]' : 'w-[54px] text-[12.5px]'}`}
                        >
                          {server.playerCount}/{server.maxPlayers}
                        </span>

                        {/* Public / Private Indicator */}
                        <span
                          className={`flex shrink-0 items-center gap-1.5 font-cartoon font-bold uppercase tracking-wide ${
                            server.isPrivate ? 'text-amber-300' : 'text-emerald-300'
                          } ${isPc ? 'w-[96px] text-[13px]' : 'w-[76px] text-[11px]'}`}
                          style={{ textShadow: '0 1px 0 #0B0D18' }}
                        >
                          {server.isPrivate ? (
                            <svg
                              width={isPc ? '14' : '12'}
                              height={isPc ? '14' : '12'}
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                              className="shrink-0"
                            >
                              <rect
                                x="5"
                                y="11"
                                width="14"
                                height="10"
                                rx="2"
                                stroke="currentColor"
                                strokeWidth="2.3"
                              />
                              <path
                                d="M8 11V7.5C8 5.3 9.8 3.5 12 3.5C14.2 3.5 16 5.3 16 7.5V11"
                                stroke="currentColor"
                                strokeWidth="2.3"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : (
                            <svg
                              width={isPc ? '14' : '12'}
                              height={isPc ? '14' : '12'}
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                              className="shrink-0"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="9"
                                stroke="currentColor"
                                strokeWidth="2.2"
                              />
                              <path
                                d="M3.5 12H20.5M12 3C14.6 5.6 15.8 8.7 15.8 12C15.8 15.3 14.6 18.4 12 21C9.4 18.4 8.2 15.3 8.2 12C8.2 8.7 9.4 5.6 12 3Z"
                                stroke="currentColor"
                                strokeWidth="1.9"
                              />
                            </svg>
                          )}
                          <span>{server.isPrivate ? 'Private' : 'Public'}</span>
                        </span>
                      </div>

                      {/* Right Side: Join Button */}
                      <div
                        className={`flex shrink-0 justify-end ${
                          isPc ? 'w-[100px]' : 'w-[76px]'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={busy || isFull}
                          onClick={() => handleJoinRowClick(server)}
                          className={`rounded-[7px] font-cartoon font-bold italic uppercase tracking-wide transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0 ${
                            isPc ? 'px-5 py-2 text-[14px]' : 'px-3.5 py-1.5 text-[12px]'
                          }`}
                          style={{
                            backgroundColor: isFull
                              ? '#33385C'
                              : server.isPrivate
                                ? '#B45309'
                                : '#1E7A8C',
                            color: '#FFFFFF',
                            border: '2px solid #0B0D18',
                            boxShadow: isFull
                              ? 'none'
                              : server.isPrivate
                                ? 'inset 0 -2px 0 #78350F, 2px 2.5px 0 #0B0D18'
                                : 'inset 0 -2px 0 #114D59, 2px 2.5px 0 #0B0D18',
                            textShadow: '0 1px 0 #0B0D18',
                          }}
                        >
                          {isFull ? 'Full' : 'Join'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* Plus (+) Modal: Create Server Only (Public/Private + Max Players 2..8, NO Code Entry) */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(8, 12, 28, 0.76)' }}
          onClick={() => {
            if (!busy) {
              setCreateModalOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-server-modal-title"
            className="relative w-full max-w-[390px] rounded-[14px] p-5 animate-cartoon-pop-in"
            style={{
              backgroundColor: '#232856',
              backgroundImage: PURPLE_DOT_PATTERN,
              backgroundSize: '12px 12px',
              backgroundPosition: '0 0, 6px 6px',
              border: '3px solid #0B0D18',
              boxShadow: '7px 8px 0 #0B0D18, inset 0 2px 0 rgba(190, 198, 255, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="create-server-modal-title"
              className="mb-4 text-center font-cartoon text-[22px] font-bold italic uppercase tracking-wider text-[#FFD147]"
              style={{
                WebkitTextStroke: '3px #0B0D18',
                paintOrder: 'stroke fill',
                textShadow: '0 2px 0 #0B0D18',
              }}
            >
              Create Server
            </h2>

            {/* Public / Private Visibility Toggle */}
            <div className="mb-4 flex flex-col gap-1.5">
              <span
                className="font-cartoon text-[12px] font-bold uppercase tracking-wider text-slate-200"
                style={{ textShadow: '0 1px 0 #0B0D18' }}
              >
                Access
              </span>
              <div
                className="grid grid-cols-2 gap-2 rounded-[9px] p-1.5"
                style={{
                  backgroundColor: '#121633',
                  border: '2px solid #0B0D18',
                }}
              >
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={!createIsPrivate}
                  onClick={() => setCreateIsPrivate(false)}
                  className="rounded-[7px] px-3 py-2 font-cartoon text-[14px] font-bold italic uppercase tracking-wide transition-colors cursor-pointer"
                  style={{
                    backgroundColor: !createIsPrivate ? '#1E7A8C' : 'transparent',
                    color: !createIsPrivate ? '#FFFFFF' : '#94A3B8',
                    border: !createIsPrivate
                      ? '2px solid #0B0D18'
                      : '2px solid transparent',
                    textShadow: !createIsPrivate ? '0 1px 0 #0B0D18' : 'none',
                  }}
                >
                  Public
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={createIsPrivate}
                  onClick={() => setCreateIsPrivate(true)}
                  className="rounded-[7px] px-3 py-2 font-cartoon text-[14px] font-bold italic uppercase tracking-wide transition-colors cursor-pointer"
                  style={{
                    backgroundColor: createIsPrivate ? '#B45309' : 'transparent',
                    color: createIsPrivate ? '#FFFFFF' : '#94A3B8',
                    border: createIsPrivate
                      ? '2px solid #0B0D18'
                      : '2px solid transparent',
                    textShadow: createIsPrivate ? '0 1px 0 #0B0D18' : 'none',
                  }}
                >
                  Private
                </button>
              </div>
              <p className="px-0.5 font-cartoon text-[11.5px] font-semibold text-slate-300">
                {createIsPrivate
                  ? 'Players must enter the server code to join.'
                  : 'Anyone in the list can join directly.'}
              </p>
            </div>

            {/* Max Players Selector (2 to 8) */}
            <div className="mb-5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span
                  className="font-cartoon text-[12px] font-bold uppercase tracking-wider text-slate-200"
                  style={{ textShadow: '0 1px 0 #0B0D18' }}
                >
                  Max Players
                </span>
                <span className="font-cartoon text-[13px] font-extrabold tabular-nums text-[#FFD147]">
                  {createMaxPlayers} / {MAX_ROOM_PLAYERS}
                </span>
              </div>
              <div
                className="grid grid-cols-7 gap-1.5 rounded-[9px] p-1.5"
                style={{
                  backgroundColor: '#121633',
                  border: '2px solid #0B0D18',
                }}
              >
                {PLAYER_LIMIT_OPTIONS.map((count) => {
                  const selected = createMaxPlayers === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      disabled={busy}
                      aria-pressed={selected}
                      onClick={() => setCreateMaxPlayers(count)}
                      className="h-9 rounded-[6px] font-cartoon text-[15px] font-extrabold tabular-nums transition-transform active:scale-95 cursor-pointer"
                      style={{
                        backgroundColor: selected ? '#FFCC33' : '#232856',
                        color: selected ? '#0B0D18' : '#E2E8F0',
                        border: selected
                          ? '2px solid #0B0D18'
                          : '1.5px solid #0B0D18',
                        boxShadow: selected ? 'inset 0 -2px 0 #D99B00' : 'none',
                      }}
                    >
                      {count}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cancel & Create Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCreateModalOpen(false)}
                className="flex-1 rounded-[9px] px-4 py-2.5 font-cartoon text-[14.5px] font-bold italic uppercase tracking-wider text-white transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-60 cursor-pointer"
                style={{
                  backgroundColor: '#353875',
                  border: '2.5px solid #0B0D18',
                  boxShadow:
                    'inset 0 -2px 0 #1F214C, inset 0 2px 0 rgba(185, 192, 250, 0.25), 2px 3px 0 #0B0D18',
                  textShadow: '0 1px 0 #0B0D18',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleCreateSubmit}
                className="flex-1 rounded-[9px] px-4 py-2.5 font-cartoon text-[15.5px] font-bold italic uppercase tracking-wider text-[#0B0D18] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-60 cursor-pointer"
                style={{
                  backgroundColor: '#FFCC33',
                  backgroundImage: YELLOW_DOT_PATTERN,
                  backgroundSize: '10px 10px',
                  backgroundPosition: '0 0, 5px 5px',
                  border: '2.5px solid #0B0D18',
                  boxShadow:
                    'inset 0 -3px 0 #D99B00, inset 0 2px 0 rgba(255, 248, 205, 0.72), 2px 3px 0 #0B0D18',
                }}
              >
                {busy ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Private Server Join Code Modal (triggered only when clicking Join on a Private row) */}
      {privateTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(8, 12, 28, 0.76)' }}
          onClick={() => {
            if (!busy) {
              setPrivateTarget(null);
              setPrivateModalError(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="private-join-modal-title"
            className="relative w-full max-w-[370px] rounded-[14px] p-5 animate-cartoon-pop-in"
            style={{
              backgroundColor: '#232856',
              backgroundImage: PURPLE_DOT_PATTERN,
              backgroundSize: '12px 12px',
              backgroundPosition: '0 0, 6px 6px',
              border: '3px solid #0B0D18',
              boxShadow: '7px 8px 0 #0B0D18, inset 0 2px 0 rgba(190, 198, 255, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="private-join-modal-title"
              className="mb-1 text-center font-cartoon text-[21px] font-bold italic uppercase tracking-wider text-[#FFD147]"
              style={{
                WebkitTextStroke: '3px #0B0D18',
                paintOrder: 'stroke fill',
                textShadow: '0 2px 0 #0B0D18',
              }}
            >
              Private Server
            </h2>
            <p className="mb-4 text-center font-cartoon text-[13px] font-bold text-slate-200 truncate">
              Host: {privateTarget.ownerName}
            </p>

            {(privateModalError || errorMessage) && (
              <div
                role="alert"
                className="mb-3.5 rounded-[8px] px-3 py-2 text-center font-cartoon text-[12.5px] font-bold uppercase tracking-wide text-white"
                style={{
                  backgroundColor: '#991B2C',
                  border: '2px solid #0B0D18',
                  boxShadow: '2px 3px 0 #0B0D18',
                }}
              >
                {privateModalError ?? errorMessage}
              </div>
            )}

            <form onSubmit={handlePrivateJoinSubmit} className="flex flex-col gap-3.5">
              <input
                type="text"
                value={privateCodeInput}
                maxLength={6}
                autoFocus={isPc}
                disabled={busy}
                placeholder="ENTER 6-CHAR CODE"
                aria-label="Private Server Code"
                onChange={(e) => {
                  if (privateModalError) setPrivateModalError(null);
                  if (errorMessage) onClearError();
                  const cleaned = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6);
                  setPrivateCodeInput(cleaned);
                }}
                className="w-full select-text rounded-[9px] px-4 py-2.5 text-center font-cartoon text-[20px] font-extrabold uppercase tracking-[0.26em] text-[#FFD147] placeholder:text-[12.5px] placeholder:tracking-widest placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD147] disabled:opacity-60"
                style={{
                  backgroundColor: '#121633',
                  border: '2.5px solid #0B0D18',
                  boxShadow: 'inset 0 3px 0 rgba(0, 0, 0, 0.45)',
                }}
              />

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPrivateTarget(null);
                    setPrivateModalError(null);
                    if (errorMessage) onClearError();
                  }}
                  className="flex-1 rounded-[9px] px-4 py-2.5 font-cartoon text-[14.5px] font-bold italic uppercase tracking-wider text-white transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-60 cursor-pointer"
                  style={{
                    backgroundColor: '#353875',
                    border: '2.5px solid #0B0D18',
                    boxShadow:
                      'inset 0 -2px 0 #1F214C, inset 0 2px 0 rgba(185, 192, 250, 0.25), 2px 3px 0 #0B0D18',
                    textShadow: '0 1px 0 #0B0D18',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-[9px] px-4 py-2.5 font-cartoon text-[15.5px] font-bold italic uppercase tracking-wider text-[#0B0D18] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-60 cursor-pointer"
                  style={{
                    backgroundColor: '#FFCC33',
                    backgroundImage: YELLOW_DOT_PATTERN,
                    backgroundSize: '10px 10px',
                    backgroundPosition: '0 0, 5px 5px',
                    border: '2.5px solid #0B0D18',
                    boxShadow:
                      'inset 0 -3px 0 #D99B00, inset 0 2px 0 rgba(255, 248, 205, 0.72), 2px 3px 0 #0B0D18',
                  }}
                >
                  {busy ? 'Joining...' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});
