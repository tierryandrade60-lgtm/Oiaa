import { io, type Socket } from 'socket.io-client';
import type { MapId } from './maps';
import {
  ROOM_CODE_REGEX,
  type AbilityVfxPacket,
  type CombatCrowdControlPacket,
  type CombatEffectEvent,
  type CombatHealRequest,
  type CombatHitRequest,
  type CombatNpcDamageRequest,
  type CombatVitalsEvent,
  type ConnectionStatus,
  type GenericAckResult,
  type PlayerMotionPacket,
  type RemotePlayerStateUpdate,
  type RoomAckResult,
  type RoomSnapshot,
  type ServerSummary,
  type VampireAbsorbEvent,
  type VampireAbsorbRequest,
} from './multiplayerTypes';

export async function fetchActiveServers(): Promise<ServerSummary[]> {
  const res = await fetch('/api/servers', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Unable to load server list.');
  }
  const data = (await res.json()) as { ok?: boolean; servers?: ServerSummary[] };
  return Array.isArray(data?.servers) ? data.servers : [];
}

export interface MultiplayerToastEvent {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface MultiplayerEliminationEvent {
  victimPlayerId: string;
  victimName: string;
  rewardCoins: number;
}

export interface MultiplayerListeners {
  onStatusChange?: (status: ConnectionStatus) => void;
  onRoomChange?: (room: RoomSnapshot | null, selfPlayerId: string | null) => void;
  onRemoteState?: (state: RemotePlayerStateUpdate) => void;
  onRemoteAbilityVfx?: (vfx: AbilityVfxPacket) => void;
  onCombatEffect?: (effect: CombatEffectEvent) => void;
  onCombatVitals?: (vitals: CombatVitalsEvent) => void;
  onCombatCrowdControl?: (cc: CombatCrowdControlPacket) => void;
  onVampireAbsorb?: (evt: VampireAbsorbEvent) => void;
  onCombatElimination?: (elim: MultiplayerEliminationEvent) => void;
  onNpcsRemoved?: (removed: boolean) => void;
  onKicked?: (reason: string) => void;
  onDisconnected?: (reason: string) => void;
  onToast?: (toast: MultiplayerToastEvent) => void;
  onLobbyServers?: (servers: ServerSummary[]) => void;
}

function resolveSocketUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export class MultiplayerClient {
  private socket: Socket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private room: RoomSnapshot | null = null;
  private selfPlayerId: string | null = null;
  private reconnectToken: string | null = null;
  private lastRoomCode: string | null = null;
  private listeners: MultiplayerListeners = {};
  private lastStateSentAtMs = 0;
  private toastSeq = 0;
  private lobbySubscribed = false;

  public setListeners(next: MultiplayerListeners): void {
    this.listeners = next;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getRoom(): RoomSnapshot | null {
    return this.room;
  }

  public getSelfPlayerId(): string | null {
    return this.selfPlayerId;
  }

  public isOwner(): boolean {
    return Boolean(this.room && this.selfPlayerId && this.room.ownerPlayerId === this.selfPlayerId);
  }

  private emitToast(
    text: string,
    tone: MultiplayerToastEvent['tone'] = 'info',
  ): void {
    this.toastSeq += 1;
    this.listeners.onToast?.({ id: this.toastSeq, text, tone });
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.listeners.onStatusChange?.(next);
  }

  private ensureSocketConnected(timeoutMs = 15000): Promise<Socket> {
    if (this.socket && this.socket.connected) {
      return Promise.resolve(this.socket);
    }

    if (!this.socket) {
      const url = resolveSocketUrl();
      this.setStatus('connecting');
      const socket = io(url, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 30,
        reconnectionDelay: 600,
        reconnectionDelayMax: 3500,
        timeout: 20000,
      });

      socket.on('connect', () => {
        this.setStatus('connected');
        if (this.lobbySubscribed && !this.room) {
          socket.emit('lobby:subscribe');
        }
        if (this.lastRoomCode && this.selfPlayerId && this.reconnectToken) {
          socket.timeout(5000).emit(
            'room:rejoin',
            {
              code: this.lastRoomCode,
              playerId: this.selfPlayerId,
              reconnectToken: this.reconnectToken,
            },
            (err: Error | null, res?: RoomAckResult) => {
              if (!err && res?.ok) {
                this.room = res.room;
                this.selfPlayerId = res.playerId;
                this.reconnectToken = res.reconnectToken;
                this.listeners.onRoomChange?.(res.room, this.selfPlayerId);
              } else if (!err && res && !res.ok) {
                const sock = this.socket;
                this.room = null;
                this.selfPlayerId = null;
                this.reconnectToken = null;
                this.lastRoomCode = null;
                this.listeners.onRoomChange?.(null, null);
                if (sock) {
                  sock.disconnect();
                  this.socket = null;
                }
                this.setStatus('disconnected');
                this.listeners.onDisconnected?.(res.message);
              }
            },
          );
        }
      });

      socket.io.on('reconnect_attempt', () => {
        if (this.room) {
          this.setStatus('reconnecting');
        } else {
          this.setStatus('connecting');
        }
      });

      socket.io.on('reconnect_failed', () => {
        this.sendBeaconLeaveWith(this.lastRoomCode, this.selfPlayerId, this.reconnectToken);
        const hadRoom = Boolean(this.room || this.lastRoomCode);
        const sock = this.socket;
        this.room = null;
        this.selfPlayerId = null;
        this.reconnectToken = null;
        this.lastRoomCode = null;
        this.listeners.onRoomChange?.(null, null);
        if (sock) {
          sock.disconnect();
          this.socket = null;
        }
        this.setStatus('disconnected');
        if (hadRoom) {
          this.listeners.onDisconnected?.('Lost connection to the server.');
        }
      });

      socket.on('disconnect', () => {
        if (this.room) {
          this.setStatus('reconnecting');
        } else {
          this.setStatus('disconnected');
        }
      });

      socket.on('lobby:servers', (servers: ServerSummary[]) => {
        if (Array.isArray(servers)) {
          this.listeners.onLobbyServers?.(servers);
        }
      });

      socket.on('room:update', (snapshot: RoomSnapshot) => {
        this.room = snapshot;
        this.listeners.onRoomChange?.(snapshot, this.selfPlayerId);
      });

      socket.on(
        'room:playerJoined',
        (payload: { playerId: string; playerName: string; room: RoomSnapshot }) => {
          this.room = payload.room;
          this.listeners.onRoomChange?.(payload.room, this.selfPlayerId);
          if (payload.playerId !== this.selfPlayerId) {
            this.emitToast(`${payload.playerName} joined the server`, 'success');
          }
        },
      );

      socket.on(
        'room:playerLeft',
        (payload: {
          playerId: string;
          playerName: string;
          newOwnerPlayerId: string | null;
          kicked?: boolean;
          room: RoomSnapshot;
        }) => {
          this.room = payload.room;
          this.listeners.onRoomChange?.(payload.room, this.selfPlayerId);
          if (payload.playerId !== this.selfPlayerId) {
            this.emitToast(
              payload.kicked
                ? `${payload.playerName} was kicked`
                : `${payload.playerName} left the server`,
              payload.kicked ? 'warning' : 'info',
            );
          }
          if (payload.newOwnerPlayerId && payload.newOwnerPlayerId === this.selfPlayerId) {
            this.emitToast('You are now the Server Owner', 'warning');
          }
        },
      );

      socket.on('room:kicked', (payload?: { reason?: string }) => {
        const reason = payload?.reason || 'You were kicked by the server owner.';
        const sock = this.socket;
        this.room = null;
        this.selfPlayerId = null;
        this.reconnectToken = null;
        this.lastRoomCode = null;
        this.listeners.onRoomChange?.(null, null);
        this.listeners.onKicked?.(reason);
        if (sock) {
          sock.disconnect();
          this.socket = null;
        }
        this.setStatus('disconnected');
      });

      socket.on(
        'room:npcsRemoved',
        (payload: { removed: boolean; byPlayerId: string; room: RoomSnapshot }) => {
          const removed = Boolean(payload.removed);
          this.room = payload.room;
          this.listeners.onRoomChange?.(payload.room, this.selfPlayerId);
          this.listeners.onNpcsRemoved?.(removed);
          this.emitToast(
            removed ? 'Owner removed AI NPCs' : 'Owner added AI NPCs back',
            'warning',
          );
        },
      );

      socket.on('player:state', (state: RemotePlayerStateUpdate) => {
        if (!state || state.playerId === this.selfPlayerId) return;
        this.listeners.onRemoteState?.(state);
      });

      socket.on('player:abilityVfx', (vfx: AbilityVfxPacket) => {
        if (!vfx || vfx.playerId === this.selfPlayerId) return;
        this.listeners.onRemoteAbilityVfx?.(vfx);
      });

      socket.on('combat:effect', (effect: CombatEffectEvent) => {
        if (!effect || effect.targetPlayerId !== this.selfPlayerId) return;
        this.listeners.onCombatEffect?.(effect);
      });

      socket.on('combat:vitals', (vitals: CombatVitalsEvent) => {
        if (!vitals) return;
        this.listeners.onCombatVitals?.(vitals);
      });

      socket.on('combat:cc', (cc: CombatCrowdControlPacket) => {
        if (!cc) return;
        this.listeners.onCombatCrowdControl?.(cc);
      });

      socket.on('vampire:absorb', (evt: VampireAbsorbEvent) => {
        if (!evt) return;
        this.listeners.onVampireAbsorb?.(evt);
      });

      socket.on('combat:elimination', (elim: MultiplayerEliminationEvent) => {
        if (!elim) return;
        this.listeners.onCombatElimination?.(elim);
        this.emitToast(`Eliminated ${elim.victimName}! +${elim.rewardCoins} coins`, 'success');
      });

      this.socket = socket;
    } else if (!this.socket.connected) {
      this.setStatus('connecting');
      this.socket.connect();
    }

    const activeSocket = this.socket;
    return new Promise<Socket>((resolve, reject) => {
      if (activeSocket.connected) {
        resolve(activeSocket);
        return;
      }
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Unable to reach multiplayer server. Please try again.'));
      }, timeoutMs);

      const onConnect = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(activeSocket);
      };

      const onErr = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Multiplayer server is unavailable or disconnected.'));
      };

      const cleanup = () => {
        window.clearTimeout(timer);
        activeSocket.off('connect', onConnect);
        activeSocket.off('connect_error', onErr);
      };

      activeSocket.on('connect', onConnect);
      activeSocket.on('connect_error', onErr);
    });
  }

  public async subscribeLobbyServers(): Promise<void> {
    this.lobbySubscribed = true;
    try {
      const socket = await this.ensureSocketConnected();
      if (this.lobbySubscribed) {
        socket.emit('lobby:subscribe');
      }
    } catch {
      // HTTP polling fallback handles server list when socket cannot connect yet
    }
  }

  public unsubscribeLobbyServers(): void {
    this.lobbySubscribed = false;
    if (this.socket && this.socket.connected) {
      this.socket.emit('lobby:unsubscribe');
    }
  }

  public async createServer(params: {
    playerName: string;
    characterId: string;
    skinId: string | null;
    mapId: MapId;
    maxPlayers: number;
    isPrivate: boolean;
  }): Promise<RoomSnapshot> {
    const trimmedName = params.playerName.trim();
    if (!trimmedName) {
      throw new Error('Enter a name before creating a server.');
    }
    const maxPlayers = Math.min(8, Math.max(2, Math.floor(params.maxPlayers)));
    const socket = await this.ensureSocketConnected();
    return new Promise<RoomSnapshot>((resolve, reject) => {
      socket.timeout(6000).emit(
        'room:create',
        {
          ...params,
          playerName: trimmedName,
          maxPlayers,
          isPrivate: Boolean(params.isPrivate),
        },
        (err: Error | null, res?: RoomAckResult) => {
          if (err || !res) {
            reject(new Error('Server did not respond in time. Please try again.'));
            return;
          }
          if (!res.ok) {
            reject(new Error(res.message));
            return;
          }
          this.lobbySubscribed = false;
          this.selfPlayerId = res.playerId;
          this.reconnectToken = res.reconnectToken;
          this.lastRoomCode = res.room.code;
          this.room = res.room;
          this.setStatus('connected');
          this.listeners.onRoomChange?.(res.room, this.selfPlayerId);
          resolve(res.room);
        },
      );
    });
  }

  public async joinServer(params: {
    roomId?: string;
    code?: string;
    playerName: string;
    characterId: string;
    skinId: string | null;
  }): Promise<RoomSnapshot> {
    const trimmedName = params.playerName.trim();
    if (!trimmedName) {
      throw new Error('Enter a name before joining a server.');
    }
    const normalizedCode = params.code ? params.code.trim().toUpperCase() : '';
    if (!params.roomId && !ROOM_CODE_REGEX.test(normalizedCode)) {
      throw new Error('Enter a valid 6-character server code.');
    }
    if (normalizedCode && !ROOM_CODE_REGEX.test(normalizedCode)) {
      throw new Error('Enter a valid 6-character server code.');
    }
    const socket = await this.ensureSocketConnected();
    return new Promise<RoomSnapshot>((resolve, reject) => {
      socket.timeout(6000).emit(
        'room:join',
        {
          roomId: params.roomId,
          code: normalizedCode || undefined,
          playerName: trimmedName,
          characterId: params.characterId,
          skinId: params.skinId,
        },
        (err: Error | null, res?: RoomAckResult) => {
          if (err || !res) {
            reject(new Error('Server did not respond in time. Please try again.'));
            return;
          }
          if (!res.ok) {
            reject(new Error(res.message));
            return;
          }
          this.lobbySubscribed = false;
          this.selfPlayerId = res.playerId;
          this.reconnectToken = res.reconnectToken;
          this.lastRoomCode = res.room.code;
          this.room = res.room;
          this.setStatus('connected');
          this.listeners.onRoomChange?.(res.room, this.selfPlayerId);
          resolve(res.room);
        },
      );
    });
  }

  private sendBeaconLeaveWith(
    code: string | null,
    playerId: string | null,
    reconnectToken: string | null,
  ): void {
    if (!code || !playerId || !reconnectToken) return;
    if (typeof window === 'undefined') return;
    const body = JSON.stringify({ code, playerId, reconnectToken });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(
        '/api/room/leave',
        new Blob([body], { type: 'application/json' }),
      );
      if (sent) return;
    }
    void fetch('/api/room/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  public sendBeaconLeave(): void {
    this.sendBeaconLeaveWith(this.lastRoomCode, this.selfPlayerId, this.reconnectToken);
  }

  public async leaveServer(): Promise<void> {
    const sock = this.socket;
    const prevCode = this.lastRoomCode;
    const prevPlayerId = this.selfPlayerId;
    const prevToken = this.reconnectToken;
    this.room = null;
    this.selfPlayerId = null;
    this.reconnectToken = null;
    this.lastRoomCode = null;
    this.listeners.onRoomChange?.(null, null);

    let acked = false;
    if (sock && sock.connected) {
      acked = await new Promise<boolean>((resolve) => {
        sock.timeout(1500).emit('room:leave', (err: Error | null) => {
          resolve(!err);
        });
      });
    }
    if (!acked) {
      this.sendBeaconLeaveWith(prevCode, prevPlayerId, prevToken);
    }
    if (sock) {
      sock.disconnect();
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  public async toggleNpcs(removed: boolean): Promise<void> {
    if (!this.socket || !this.socket.connected || !this.room) {
      throw new Error('Not connected to a multiplayer server.');
    }
    return new Promise<void>((resolve, reject) => {
      this.socket!.timeout(5000).emit(
        'room:toggleNpcs',
        { removed },
        (err: Error | null, res?: GenericAckResult) => {
          if (err || !res) {
            reject(new Error('Could not reach server to update NPCs.'));
            return;
          }
          if (!res.ok) {
            reject(new Error(res.message));
            return;
          }
          resolve();
        },
      );
    });
  }

  public async kickPlayer(targetPlayerId: string): Promise<void> {
    if (!this.socket || !this.socket.connected || !this.room) {
      throw new Error('Not connected to a multiplayer server.');
    }
    return new Promise<void>((resolve, reject) => {
      this.socket!.timeout(5000).emit(
        'room:kick',
        { targetPlayerId },
        (err: Error | null, res?: GenericAckResult) => {
          if (err || !res) {
            reject(new Error('Could not reach server to kick player.'));
            return;
          }
          if (!res.ok) {
            reject(new Error(res.message));
            return;
          }
          resolve();
        },
      );
    });
  }

  public async reenterServer(): Promise<RoomSnapshot> {
    if (!this.socket || !this.socket.connected || !this.room) {
      throw new Error('Not connected to a multiplayer server.');
    }
    return new Promise<RoomSnapshot>((resolve, reject) => {
      this.socket!.timeout(5000).emit(
        'room:reenter',
        (
          err: Error | null,
          res?: { ok: true; room: RoomSnapshot } | { ok: false; message: string },
        ) => {
          if (err || !res) {
            reject(new Error('Could not reach server to rejoin.'));
            return;
          }
          if (!res.ok) {
            reject(new Error(res.message));
            return;
          }
          this.room = res.room;
          this.listeners.onRoomChange?.(res.room, this.selfPlayerId);
          resolve(res.room);
        },
      );
    });
  }

  public getLastStateSentAtMs(): number {
    return this.lastStateSentAtMs;
  }

  public sendPlayerState(packet: PlayerMotionPacket, force = false): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    const now = performance.now();
    if (!force && now - this.lastStateSentAtMs < 20) return; // Allows steady 30 Hz without timer-jitter drops
    this.lastStateSentAtMs = now;
    this.socket.emit('player:state', packet);
  }

  public sendAbilityVfx(vfx: AbilityVfxPacket): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('player:abilityVfx', {
      ...vfx,
      playerId: vfx.playerId ?? this.selfPlayerId ?? undefined,
    });
  }

  public sendCombatHit(hit: CombatHitRequest): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('combat:hit', hit);
  }

  public sendCombatHeal(heal: CombatHealRequest): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('combat:heal', heal);
  }

  public sendNpcDamage(dmg: CombatNpcDamageRequest): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('combat:npcDamage', dmg);
  }

  public sendCrowdControl(cc: CombatCrowdControlPacket): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('combat:cc', {
      ...cc,
      attackerPlayerId: cc.attackerPlayerId ?? this.selfPlayerId ?? undefined,
    });
  }

  public sendVampireAbsorb(req: VampireAbsorbRequest): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('vampire:absorb', req);
  }

  public sendRemoveStolenAbility(abilityId: string): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('vampire:removeStolen', { abilityId });
  }

  public notifyDeath(): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('combat:death');
  }

  public notifyRespawn(): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('combat:respawn');
  }

  public setSelecting(selecting: boolean): void {
    if (!this.socket || !this.socket.connected || !this.room) return;
    this.socket.emit('player:selecting', { selecting: Boolean(selecting) });
  }
}
