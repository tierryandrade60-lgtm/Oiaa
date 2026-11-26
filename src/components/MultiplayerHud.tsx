import { memo, useEffect, useMemo, useState } from 'react';
import type { ConnectionStatus, RoomSnapshot } from '../game/multiplayerTypes';
import type { MultiplayerToastEvent } from '../game/multiplayerClient';
import { useIsPc } from '../utils/platform';

const PURPLE_DOT_PATTERN =
  'radial-gradient(circle, rgba(142, 145, 218, 0.28) 1.3px, transparent 1.4px), radial-gradient(circle, rgba(142, 145, 218, 0.28) 1.3px, transparent 1.4px)';

function SkullIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M12 3.5C7.6 3.5 4.2 6.7 4.2 10.8C4.2 13.3 5.4 15.4 7.3 16.7V19.2C7.3 19.9 7.9 20.5 8.6 20.5H15.4C16.1 20.5 16.7 19.9 16.7 19.2V16.7C18.6 15.4 19.8 13.3 19.8 10.8C19.8 6.7 16.4 3.5 12 3.5Z"
        fill="#FFFFFF"
        stroke="#0B0D18"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="9.2" cy="11.1" r="1.45" fill="#0B0D18" />
      <circle cx="14.8" cy="11.1" r="1.45" fill="#0B0D18" />
      <path
        d="M10.2 20.4V17.9M13.8 20.4V17.9"
        stroke="#0B0D18"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CrownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#FFD147"
      stroke="#0B0D18"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-label="Owner"
      className="shrink-0"
    >
      <path d="M3 18H21L19 7L14 12L12 5L10 12L5 7L3 18Z" />
    </svg>
  );
}

interface ServerPanelTriggerButtonProps {
  isOwner: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
}

export const ServerPanelTriggerButton = memo(function ServerPanelTriggerButton({
  isOwner,
  panelOpen,
  onTogglePanel,
}: ServerPanelTriggerButtonProps) {
  const isPc = useIsPc();

  return (
    <button
      type="button"
      aria-label="Server Menu & Leaderboard"
      aria-expanded={panelOpen}
      title="Server Menu"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isPc) e.currentTarget.blur();
        onTogglePanel();
      }}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTogglePanel();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="flex items-center justify-center rounded-[5px] transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
      style={{
        width: isPc ? 'clamp(56px, 4.2vw, 66px)' : 'clamp(36px, 5.6vw, 42px)',
        height: isPc ? 'clamp(56px, 4.2vw, 66px)' : 'clamp(36px, 5.6vw, 42px)',
        backgroundColor: panelOpen ? '#474A88' : '#353664',
        backgroundImage: PURPLE_DOT_PATTERN,
        backgroundSize: '10px 10px',
        backgroundPosition: '0 0, 5px 5px',
        border: panelOpen
          ? '2.5px solid #FFD147'
          : isOwner
            ? '2.5px solid #0B0D18'
            : '2.5px solid #0B0D18',
        boxShadow: isOwner
          ? '2px 3px 0 rgba(8, 10, 18, 0.85), inset 0 0 0 1.5px rgba(255, 209, 71, 0.35)'
          : '2px 3px 0 rgba(8, 10, 18, 0.85), inset 0 0 0 1.5px rgba(155, 160, 230, 0.25)',
        touchAction: 'manipulation',
      }}
    >
      <svg
        width={isPc ? '28' : '19'}
        height={isPc ? '28' : '19'}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="3.5"
          y="4.5"
          width="17"
          height="6"
          rx="1.8"
          fill={isOwner ? '#FFD147' : '#A5B4FC'}
          stroke="#0B0D18"
          strokeWidth="2"
        />
        <rect
          x="3.5"
          y="13.5"
          width="17"
          height="6"
          rx="1.8"
          fill="#FFFFFF"
          stroke="#0B0D18"
          strokeWidth="2"
        />
        <circle cx="7.5" cy="7.5" r="1.2" fill="#0B0D18" />
        <circle cx="7.5" cy="16.5" r="1.2" fill="#0B0D18" />
        <path
          d="M11 7.5H17M11 16.5H17"
          stroke="#0B0D18"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
});

interface MultiplayerHudProps {
  room: RoomSnapshot;
  selfPlayerId: string | null;
  connectionStatus: ConnectionStatus;
  toasts: MultiplayerToastEvent[];
  panelOpen: boolean;
  togglingNpcs: boolean;
  rejoining: boolean;
  kickingPlayerId: string | null;
  onClosePanel: () => void;
  onToggleNpcs: (removed: boolean) => void;
  onKickPlayer: (targetPlayerId: string) => void;
  onRejoinServer: () => void;
  onLeaveServer: () => void;
}

export const MultiplayerHud = memo(function MultiplayerHud({
  room,
  selfPlayerId,
  connectionStatus,
  toasts,
  panelOpen,
  togglingNpcs,
  rejoining,
  kickingPlayerId,
  onClosePanel,
  onToggleNpcs,
  onKickPlayer,
  onRejoinServer,
  onLeaveServer,
}: MultiplayerHudProps) {
  const isPc = useIsPc();
  const [copied, setCopied] = useState(false);

  const isOwner = Boolean(selfPlayerId && room.ownerPlayerId === selfPlayerId);

  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClosePanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelOpen, onClosePanel]);

  const sortedPlayers = useMemo(() => {
    return [...room.players].sort((a, b) => {
      const killDiff = (b.kills ?? 0) - (a.kills ?? 0);
      if (killDiff !== 0) return killDiff;
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [room.players]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback ignored safely in restricted contexts
    }
  };

  return (
    <>
      {/* Reconnecting / Disconnected Status Pill */}
      {(connectionStatus === 'reconnecting' || connectionStatus === 'disconnected') && (
        <div
          role="status"
          className="pointer-events-none fixed left-1/2 top-4 z-40 -translate-x-1/2 rounded-[7px] px-4 py-1.5 font-cartoon text-[12px] font-bold italic uppercase tracking-wide text-white"
          style={{
            backgroundColor: '#991B2C',
            border: '2px solid #0B0D18',
            boxShadow: '2px 3px 0 #0B0D18',
          }}
        >
          {connectionStatus === 'reconnecting'
            ? 'Reconnecting to Server...'
            : 'Disconnected from Server'}
        </div>
      )}

      {/* Join / Leave / Room Toast Notifications */}
      {toasts.length > 0 && (
        <div
          className="pointer-events-none fixed right-4 z-30 flex flex-col items-end gap-1.5"
          style={{
            top: isPc
              ? 'calc(max(20px, var(--stage-safe-top, 0px)) + 76px)'
              : 'calc(max(6px, var(--stage-safe-top, 0px)) + 48px)',
          }}
        >
          {toasts.slice(-3).map((t) => (
            <div
              key={t.id}
              className="animate-cartoon-pop-in rounded-[6px] px-3 py-1 font-cartoon text-[11px] font-bold italic uppercase tracking-wide text-white"
              style={{
                backgroundColor:
                  t.tone === 'error'
                    ? '#991B2C'
                    : t.tone === 'warning'
                      ? '#8A5200'
                      : t.tone === 'success'
                        ? '#176645'
                        : '#252957',
                border: '2px solid #0B0D18',
                boxShadow: '2px 2.5px 0 #0B0D18',
                textShadow: '0 1px 0 #0B0D18',
              }}
            >
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* Server Menu & Leaderboard Modal (Opened by button next to CoinHud) */}
      {panelOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isOwner ? 'Server Settings and Leaderboard' : 'Server Leaderboard'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-3 select-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) {
              onClosePanel();
            }
          }}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerCancel={(e) => e.stopPropagation()}
        >
          <div
            className={`animate-cartoon-pop-in flex flex-col overflow-hidden rounded-[12px] ${
              isPc ? 'w-[min(92vw,470px)] max-h-[82vh]' : 'w-[min(92vw,410px)] max-h-[86vh]'
            }`}
            style={{
              backgroundColor: '#1D2047',
              backgroundImage: PURPLE_DOT_PATTERN,
              backgroundSize: '11px 11px',
              backgroundPosition: '0 0, 5.5px 5.5px',
              border: '3px solid #0B0D18',
              boxShadow: '5px 6px 0 #0B0D18',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Top Bar: Title + Rejoin + Leave + Close */}
            <div
              className={`flex items-center justify-between gap-2 border-b-[2.5px] border-[#0B0D18] ${
                isPc ? 'px-4 py-3' : 'px-3 py-2'
              }`}
              style={{ backgroundColor: 'rgba(11, 13, 24, 0.42)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isOwner && <CrownIcon size={isPc ? 18 : 15} />}
                <h2
                  className={`font-cartoon font-extrabold italic uppercase tracking-wide text-white truncate ${
                    isPc ? 'text-[18px]' : 'text-[14px]'
                  }`}
                  style={{ textShadow: '0 1.5px 0 #0B0D18' }}
                >
                  {isOwner ? 'Server Menu' : 'Leaderboard'}
                </h2>
                <span
                  className={`rounded-[4px] px-1.5 py-0.5 font-cartoon font-bold uppercase tracking-wider ${
                    isPc ? 'text-[10px]' : 'text-[8.5px]'
                  }`}
                  style={{
                    backgroundColor: room.isPrivate ? '#7C2D12' : '#176645',
                    border: '1.5px solid #0B0D18',
                    color: '#FFFFFF',
                  }}
                >
                  {room.isPrivate ? 'Private' : 'Public'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={rejoining}
                  onClick={onRejoinServer}
                  className={`flex items-center gap-1 rounded-[6px] font-cartoon font-bold italic uppercase tracking-wide text-white transition-transform active:scale-95 disabled:opacity-60 cursor-pointer ${
                    isPc ? 'px-3 py-1.5 text-[12px]' : 'px-2 py-1 text-[10px]'
                  }`}
                  style={{
                    backgroundColor: '#2B4D9B',
                    border: '2px solid #0B0D18',
                    boxShadow: '2px 2.5px 0 #0B0D18',
                    textShadow: '0 1px 0 #0B0D18',
                  }}
                >
                  <svg
                    width={isPc ? '13' : '11'}
                    height={isPc ? '13' : '11'}
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M21 12A9 9 0 1 1 18.36 5.64M21 4V9H16"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{rejoining ? '...' : 'Rejoin'}</span>
                </button>

                <button
                  type="button"
                  onClick={onLeaveServer}
                  className={`flex items-center gap-1 rounded-[6px] font-cartoon font-bold italic uppercase tracking-wide text-white transition-transform active:scale-95 cursor-pointer ${
                    isPc ? 'px-3 py-1.5 text-[12px]' : 'px-2 py-1 text-[10px]'
                  }`}
                  style={{
                    backgroundColor: '#B91C3C',
                    border: '2px solid #0B0D18',
                    boxShadow: '2px 2.5px 0 #0B0D18',
                    textShadow: '0 1px 0 #0B0D18',
                  }}
                >
                  <svg
                    width={isPc ? '13' : '11'}
                    height={isPc ? '13' : '11'}
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3H9M16 17L21 12L16 7M21 12H9"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Leave</span>
                </button>

                <button
                  type="button"
                  aria-label="Close server menu"
                  onClick={onClosePanel}
                  className={`flex items-center justify-center rounded-[6px] font-cartoon font-extrabold text-white transition-transform active:scale-95 cursor-pointer ${
                    isPc ? 'h-[30px] w-[30px] text-[14px]' : 'h-[24px] w-[24px] text-[12px]'
                  }`}
                  style={{
                    backgroundColor: '#353664',
                    border: '2px solid #0B0D18',
                    boxShadow: '2px 2.5px 0 #0B0D18',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div
              className={`flex flex-col overflow-y-auto ${
                isPc ? 'gap-3 p-4' : 'gap-2 p-3'
              }`}
            >
              {/* Owner-Only Controls: Code + Copy + NPCs Toggle */}
              {isOwner && (
                <div
                  className={`flex flex-col rounded-[9px] ${
                    isPc ? 'gap-2.5 p-3' : 'gap-2 p-2.5'
                  }`}
                  style={{
                    backgroundColor: 'rgba(11, 13, 24, 0.4)',
                    border: '2px solid #0B0D18',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-cartoon font-bold uppercase tracking-wider text-indigo-200 ${
                        isPc ? 'text-[12px]' : 'text-[10.5px]'
                      }`}
                    >
                      Server Code
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-[5px] px-2.5 py-0.5 font-cartoon font-extrabold tracking-widest text-[#FFD147] ${
                          isPc ? 'text-[15px]' : 'text-[13px]'
                        }`}
                        style={{
                          backgroundColor: '#131632',
                          border: '1.5px solid #0B0D18',
                        }}
                      >
                        {room.code}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className={`rounded-[5px] font-cartoon font-bold uppercase tracking-wide text-[#0B0D18] transition-transform active:scale-95 cursor-pointer ${
                          isPc ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'
                        }`}
                        style={{
                          backgroundColor: copied ? '#4ADE80' : '#FFD147',
                          border: '2px solid #0B0D18',
                          boxShadow: '1.5px 2px 0 #0B0D18',
                        }}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="h-[1px] bg-white/10" />

                  {/* Exclusive Owner Command: Toggle AI NPCs On / Off */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span
                        className={`font-cartoon font-bold uppercase tracking-wider text-white ${
                          isPc ? 'text-[12.5px]' : 'text-[11px]'
                        }`}
                      >
                        AI Boss NPCs
                      </span>
                      <span
                        className={`font-cartoon font-semibold text-indigo-200/80 ${
                          isPc ? 'text-[10.5px]' : 'text-[9px]'
                        }`}
                      >
                        {room.npcsRemoved ? 'Removed from arena' : 'Active in arena'}
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={!room.npcsRemoved}
                      disabled={togglingNpcs}
                      onClick={() => onToggleNpcs(!room.npcsRemoved)}
                      className={`flex items-center gap-2 rounded-[6px] font-cartoon font-bold italic uppercase tracking-wide text-white transition-transform active:scale-95 disabled:opacity-60 cursor-pointer ${
                        isPc ? 'px-3 py-1.5 text-[11.5px]' : 'px-2.5 py-1 text-[10px]'
                      }`}
                      style={{
                        backgroundColor: room.npcsRemoved ? '#176645' : '#991B2C',
                        border: '2px solid #0B0D18',
                        boxShadow: '2px 2.5px 0 #0B0D18',
                        textShadow: '0 1px 0 #0B0D18',
                      }}
                    >
                      <span>
                        {togglingNpcs
                          ? 'Updating...'
                          : room.npcsRemoved
                            ? 'Add NPCs Back'
                            : 'Remove NPCs'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Players & Kills Leaderboard Header */}
              <div className="flex items-center justify-between px-1 pt-0.5">
                <span
                  className={`font-cartoon font-extrabold italic uppercase tracking-wider text-[#FFD147] ${
                    isPc ? 'text-[13px]' : 'text-[11px]'
                  }`}
                  style={{ textShadow: '0 1px 0 #0B0D18' }}
                >
                  Players ({room.players.length}/{room.maxPlayers})
                </span>

                <div
                  className={`flex items-center gap-1 font-cartoon font-extrabold italic uppercase tracking-wider text-[#FFD147] ${
                    isOwner ? (isPc ? 'pr-[58px]' : 'pr-[46px]') : 'pr-1'
                  } ${isPc ? 'text-[13px]' : 'text-[11px]'}`}
                  style={{ textShadow: '0 1px 0 #0B0D18' }}
                >
                  <SkullIcon size={isPc ? 14 : 12} />
                  <span>Kill</span>
                </div>
              </div>

              {/* Player Cards */}
              <ul className="flex max-h-[270px] flex-col gap-1.5 overflow-y-auto pr-0.5">
                {sortedPlayers.map((p) => {
                  const isSelf = p.playerId === selfPlayerId;
                  const canKick = isOwner && !isSelf;
                  const isKicking = kickingPlayerId === p.playerId;

                  return (
                    <li
                      key={p.playerId}
                      className={`flex items-center justify-between gap-2 rounded-[8px] ${
                        isPc ? 'px-3 py-2' : 'px-2.5 py-1.5'
                      }`}
                      style={{
                        backgroundColor: isSelf
                          ? 'rgba(255, 209, 71, 0.16)'
                          : 'rgba(11, 13, 24, 0.42)',
                        border: isSelf
                          ? '2px solid rgba(255, 209, 71, 0.72)'
                          : '2px solid #0B0D18',
                        boxShadow: '1.5px 2px 0 rgba(8, 10, 18, 0.75)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {p.isOwner && <CrownIcon size={isPc ? 15 : 13} />}
                        <span
                          className={`font-cartoon font-bold text-white truncate ${
                            isPc ? 'text-[13.5px]' : 'text-[11.5px]'
                          }`}
                          style={{ textShadow: '0 1px 0 #0B0D18' }}
                        >
                          {p.name}
                        </span>
                        {p.inSelector && (
                          <span
                            className={`rounded-[4px] px-1.5 py-0.5 font-cartoon font-bold uppercase text-[#93C5FD] ${
                              isPc ? 'text-[9.5px]' : 'text-[8px]'
                            }`}
                            style={{ backgroundColor: 'rgba(30, 58, 138, 0.45)' }}
                          >
                            Menu
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div
                          className={`flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 font-cartoon font-extrabold tabular-nums text-white ${
                            isPc ? 'text-[13px]' : 'text-[11px]'
                          }`}
                          style={{
                            backgroundColor: '#252957',
                            border: '1.5px solid #0B0D18',
                          }}
                        >
                          <span>{p.kills ?? 0}</span>
                          <SkullIcon size={isPc ? 14 : 12} />
                        </div>

                        {canKick && (
                          <button
                            type="button"
                            disabled={isKicking}
                            onClick={() => onKickPlayer(p.playerId)}
                            className={`rounded-[5px] font-cartoon font-bold italic uppercase tracking-wide text-white transition-transform active:scale-95 disabled:opacity-60 cursor-pointer ${
                              isPc ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[9.5px]'
                            }`}
                            style={{
                              backgroundColor: '#991B2C',
                              border: '2px solid #0B0D18',
                              boxShadow: '1.5px 2px 0 #0B0D18',
                              textShadow: '0 1px 0 #0B0D18',
                            }}
                          >
                            {isKicking ? '...' : 'Kick'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
