import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type {
  AbilityVfxPacket,
  CombatCrowdControlKind,
  CombatCrowdControlPacket,
  CombatEffectEvent,
  CombatHealRequest,
  CombatHitRequest,
  CombatNpcDamageRequest,
  CombatVitalsEvent,
  GenericAckResult,
  PlayerMotionPacket,
  PlayerPublicInfo,
  RemotePlayerStateUpdate,
  RemoteShieldKind,
  RoomAckResult,
  RoomSnapshot,
  ServerSummary,
  VampireAbsorbEvent,
  VampireAbsorbRequest,
} from './src/game/multiplayerTypes';
import type { MapId } from './src/game/maps';

const MIN_ROOM_PLAYERS = 2;
const MAX_ROOM_PLAYERS = 8;
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;
const LOBBY_SERVERS_ROOM = '__lobby_servers__';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_SESSIONS = 500;
const MAX_COINS = 1_000_000;
const MAX_STAMINA = 100;
const STAMINA_REGEN_DELAY_SEC = 1.0;

const CHARACTER_MAX_HP: Record<string, number> = {
  'scarlet-witch': 250,
  'phoenix-force': 250,
  'emma-frost': 250,
  hela: 250,
  magneto: 260,
  quicksilver: 240,
  'doctor-strange': 250,
  vision: 260,
  'agatha-harkness': 250,
  'invisible-woman': 250,
  vampire: 250,
  'captain-america': 260,
  thor: 270,
  'silver-surfer': 260,
  storm: 240,
};

const CHARACTER_SKIN_IDS: Record<string, ReadonlySet<string>> = {
  'scarlet-witch': new Set(['scarlet-default', 'supreme-sorceress', 'wanda-zombie']),
  'phoenix-force': new Set(['phoenix-default', 'dark-phoenix', 'white-phoenix']),
  'emma-frost': new Set(['emma-default', 'white-queen']),
  hela: new Set(['hela-default', 'white-hela']),
  magneto: new Set(),
  quicksilver: new Set(['quicksilver-default', 'speed']),
  'doctor-strange': new Set(['strange-default', 'ancient-one']),
  vision: new Set(),
  'agatha-harkness': new Set(),
  'invisible-woman': new Set(),
  vampire: new Set(),
  'captain-america': new Set(),
  thor: new Set(),
  'silver-surfer': new Set(),
  storm: new Set(),
};

const ALL_VALID_SKIN_IDS = new Set<string>([
  'scarlet-default',
  'supreme-sorceress',
  'wanda-zombie',
  'phoenix-default',
  'dark-phoenix',
  'white-phoenix',
  'emma-default',
  'white-queen',
  'hela-default',
  'white-hela',
  'quicksilver-default',
  'speed',
  'strange-default',
  'ancient-one',
]);

const SKIN_PRICES: Record<string, number> = {
  'dark-phoenix': 100,
};

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ACTIVE_ROOMS = 300;
const WORLD_POS_BOUND = 220;
const WORLD_VEL_BOUND = 110;
const VALID_SHIELD_KINDS = new Set<string>([
  'auto-shield',
  'agatha-auto-shield',
  'diamond-form',
  'mystic-shield',
  'forcefield-shield',
  'shield-defense',
  'agatha-shield',
  'magneto-shield',
  'silver-absorb',
]);

const SPAWN_PROTECTION_MS = 2800;
const VAMPIRE_STOLEN_DURATION_MS = 40_000;

const SHIELD_CAPACITIES: Record<string, number> = {
  'auto-shield': 100,
  'agatha-auto-shield': 100,
  'diamond-form': 150,
  'mystic-shield': 120,
  'forcefield-shield': 200,
  'shield-defense': 150,
  'agatha-shield': 9999,
  'magneto-shield': 9999,
  'silver-absorb': 9999,
};

const SHIELD_DURATIONS_MS: Record<string, number> = {
  'auto-shield': 10_000,
  'agatha-auto-shield': 10_000,
  'diamond-form': 15_000,
  'mystic-shield': 10_000,
  'forcefield-shield': 10_000,
  'shield-defense': 30_000,
  'agatha-shield': 6_500,
  'magneto-shield': 120_000,
  'silver-absorb': 120_000,
};

const SERVER_STEALABLE_POOLS: Record<string, readonly string[]> = {
  'scarlet-witch': ['chaos-bolt', 'darkhold', 'chaos-implosion'],
  'scarlet-witch:supreme-sorceress': ['supreme-ritual', 'chaos-drain', 'chaos-implosion'],
  'scarlet-witch:wanda-zombie': ['chaos-bolt', 'zombie-beam', 'zombie-stone-explosion'],
  'agatha-harkness': ['agatha-bolt', 'agatha-darkhold', 'agatha-shield'],
  'phoenix-force': ['phoenix-wave', 'phoenix-fireballs', 'pain-infliction'],
  'emma-frost': ['mental-attack', 'diamond-form', 'telepathic-wave'],
  'emma-frost:white-queen': ['mind-control', 'diamond-form', 'telepathic-wave'],
  hela: ['sword-summon', 'green-explosion', 'ground-sword'],
  magneto: ['metal-projectile', 'magnetic-meteor', 'metal-tornado'],
  quicksilver: ['rapid-punch-combo', 'wind-tornado', 'time-stop'],
  'quicksilver:speed': ['speed-blitz', 'wind-tornado', 'time-stop'],
  'doctor-strange': ['purgatory-grasp', 'mystic-clones', 'eldritch-discs'],
  'doctor-strange:ancient-one': ['astral-extraction', 'mystic-clones', 'eldritch-discs'],
  vision: ['mind-stone-laser', 'mind-stone-projectile', 'head-grip'],
  'invisible-woman': ['invisibility', 'forcefield-shield', 'forcefield-barrier'],
  vampire: ['vampire-bolt', 'ground-stomp'],
  'captain-america': ['shield-throw', 'shield-combo', 'shield-charge'],
  thor: ['mjolnir-combo', 'mjolnir-throw', 'lightning-storm-beam'],
  'silver-surfer': ['damage-absorption', 'cosmic-blast', 'dual-cosmic-beam'],
  storm: ['storm-tornado', 'ice-spear', 'wind-blast'],
};

function getServerStealablePool(characterId: string, skinId: string | null): readonly string[] {
  if (skinId) {
    const bySkin = SERVER_STEALABLE_POOLS[`${characterId}:${skinId}`];
    if (bySkin) return bySkin;
  }
  return SERVER_STEALABLE_POOLS[characterId] ?? SERVER_STEALABLE_POOLS['scarlet-witch'];
}

const VALID_VFX_KINDS = new Set<string>([
  'cast',
  'bolt',
  'explosion',
  'shockwave',
  'teleport',
  'lightning',
  'respawn',
  'death',
  'projectile',
  'beam',
  'tornado',
  'meteor',
  'slash',
  'shield',
  'aura',
  'slam',
  'ritual',
  'grab',
  'clones',
  'stomp',
  'freeze',
  'disc',
  'spear',
  'wind',
  'vampire-absorb',
  'dash',
]);

const VALID_CC_KINDS = new Set<string>([
  'external-control',
  'external-pose',
  'paralyze',
  'mind-control-paralyze',
  'pain',
  'clones',
  'forcefield',
  'clear',
]);

interface ActiveCcEntry {
  expiresAtMs: number;
  packet: CombatCrowdControlPacket;
}

interface ServerPlayer {
  playerId: string;
  reconnectToken: string;
  socketId: string;
  disconnectGraceTimer?: ReturnType<typeof setTimeout>;
  name: string;
  joinedAtMs: number;
  kills: number;
  characterId: string;
  skinId: string | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  inSelector: boolean;
  spawnProtected: boolean;
  spawnProtectedUntilMs: number;
  invulnerable: boolean;
  shieldKind: RemoteShieldKind;
  shieldRemaining: number;
  shieldExpiresAtMs: number;
  silverAbsorbEnergy: number;
  stolenAbilities: Array<{ id: string; expiresAtMs: number }>;
  pendingAbsorbTargetId: string | null;
  activeCcEntries: Map<string, ActiveCcEntry>;
  lastHitByTarget: Map<string, number>;
  lastSeq: number;
  serverSeq: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  lastStateAtMs: number;
  lastVfxAtMs: number;
  lastCombatHitAtMs: number;
  lastHealAtMs: number;
  lastAttackerId: string | null;
  lastAttackedAtMs: number;
  lastMotion: PlayerMotionPacket;
}

interface ServerRoom {
  roomId: string;
  code: string;
  mapId: MapId;
  maxPlayers: number;
  isPrivate: boolean;
  ownerPlayerId: string;
  npcsRemoved: boolean;
  createdAtMs: number;
  players: Map<string, ServerPlayer>;
}

const VAMPIRE_MAX_STOLEN_ABILITIES = 3;
const rooms = new Map<string, ServerRoom>();
const socketActionWindows = new Map<string, { windowStartMs: number; count: number }>();

function getActiveStolenAbilityIds(player: ServerPlayer, nowMs = Date.now()): string[] {
  if (player.stolenAbilities.length === 0) return [];
  const active = player.stolenAbilities.filter((entry) => entry.expiresAtMs > nowMs);
  if (active.length !== player.stolenAbilities.length) {
    player.stolenAbilities = active;
  }
  return active.map((entry) => entry.id);
}

function clearPlayerStolenAbilities(player: ServerPlayer): void {
  player.stolenAbilities = [];
}

function checkSocketActionRate(socketId: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = socketActionWindows.get(socketId);
  if (!entry || now - entry.windowStartMs >= windowMs) {
    socketActionWindows.set(socketId, { windowStartMs: now, count: 1 });
    return true;
  }
  if (entry.count >= maxPerWindow) {
    return false;
  }
  entry.count += 1;
  return true;
}

function sanitizePlayerName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return cleaned.length >= 1 ? cleaned : null;
}

function resolveValidCharacterId(raw: unknown): string {
  if (
    typeof raw === 'string' &&
    Object.prototype.hasOwnProperty.call(CHARACTER_MAX_HP, raw)
  ) {
    return raw;
  }
  return 'scarlet-witch';
}

function resolveValidSkinId(characterId: string, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (CHARACTER_SKIN_IDS[characterId]?.has(raw)) {
    return raw;
  }
  return null;
}

function resolveValidMapId(raw: unknown): MapId {
  return raw === 'test' ? 'test' : 'existing';
}

function generateUniqueRoomCode(): string | null {
  for (let attempt = 0; attempt < 64; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[crypto.randomInt(0, ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) {
      return code;
    }
  }
  return null;
}

function buildDefaultMotion(characterId: string, skinId: string | null): PlayerMotionPacket {
  const maxHp = CHARACTER_MAX_HP[characterId] ?? 250;
  return {
    characterId,
    skinId,
    x: 0,
    y: 0.4,
    z: 0,
    yaw: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    localForward: 0,
    localRight: 0,
    turnVelocity: 0,
    grounded: true,
    justJumped: false,
    landImpactSpeed: 0,
    sprinting: false,
    flying: false,
    superSpeed: false,
    hp: maxHp,
    maxHp,
    dead: false,
    ragdoll: false,
    inSelector: true,
    spawnProtected: true,
    invulnerable: true,
    shieldKind: null,
    invisible: false,
    darkholdOpen: false,
    crownMode: false,
    wingsVisible: false,
    swordHeld: false,
    ritualPhase: 'idle',
    sustainedFlags: 0,
    stolenAbilityId: null,
    stolenAbilityIds: [],
    targetId: null,
    seq: 0,
    clientTimeMs: Date.now(),
  };
}

function wrapYawRadians(yaw: number): number {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

function sanitizeMotionPacket(
  prev: ServerPlayer,
  raw: unknown,
): PlayerMotionPacket | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;

  const nums = [p.x, p.y, p.z, p.yaw, p.vx, p.vy, p.vz, p.hp];
  for (const n of nums) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  }

  const characterId = resolveValidCharacterId(p.characterId);
  const skinId = resolveValidSkinId(characterId, p.skinId);
  const maxHp = CHARACTER_MAX_HP[characterId] ?? 250;

  const x = clampFinite(p.x, -WORLD_POS_BOUND, WORLD_POS_BOUND, prev.x);
  const y = clampFinite(p.y, -20, 180, prev.y);
  const z = clampFinite(p.z, -WORLD_POS_BOUND, WORLD_POS_BOUND, prev.z);
  const yaw = wrapYawRadians(p.yaw as number);
  const vx = clampFinite(p.vx, -WORLD_VEL_BOUND, WORLD_VEL_BOUND, 0);
  const vy = clampFinite(p.vy, -WORLD_VEL_BOUND, WORLD_VEL_BOUND, 0);
  const vz = clampFinite(p.vz, -WORLD_VEL_BOUND, WORLD_VEL_BOUND, 0);
  const localForward = clampFinite(p.localForward, -3.5, 3.5, 0);
  const localRight = clampFinite(p.localRight, -3.5, 3.5, 0);
  const turnVelocity = clampFinite(p.turnVelocity, -35, 35, 0);
  const landImpactSpeed = clampFinite(p.landImpactSpeed, 0, 120, 0);
  const hp = Math.round(clampFinite(p.hp, 0, maxHp, prev.hp));
  const dead = Boolean(p.dead) || hp <= 0;
  const shieldKind: RemoteShieldKind =
    typeof p.shieldKind === 'string' && VALID_SHIELD_KINDS.has(p.shieldKind)
      ? (p.shieldKind as RemoteShieldKind)
      : null;

  const ritualPhase =
    typeof p.ritualPhase === 'string' && p.ritualPhase.length <= 24
      ? p.ritualPhase
      : 'idle';

  const targetId =
    typeof p.targetId === 'string' && p.targetId.length <= 64 ? p.targetId : null;

  return {
    characterId,
    skinId,
    x,
    y,
    z,
    yaw,
    vx,
    vy,
    vz,
    localForward,
    localRight,
    turnVelocity,
    grounded: Boolean(p.grounded),
    justJumped: Boolean(p.justJumped),
    landImpactSpeed,
    sprinting: Boolean(p.sprinting),
    flying: Boolean(p.flying),
    superSpeed: Boolean(p.superSpeed),
    hp,
    maxHp,
    dead,
    ragdoll: Boolean(p.ragdoll),
    inSelector: Boolean(p.inSelector),
    spawnProtected: Boolean(p.spawnProtected),
    invulnerable: Boolean(p.invulnerable),
    shieldKind,
    invisible: Boolean(p.invisible),
    darkholdOpen: Boolean(p.darkholdOpen),
    crownMode: Boolean(p.crownMode),
    wingsVisible: Boolean(p.wingsVisible),
    swordHeld: Boolean(p.swordHeld),
    ritualPhase,
    sustainedFlags:
      typeof p.sustainedFlags === 'number' && Number.isFinite(p.sustainedFlags)
        ? (p.sustainedFlags & 0xffff)
        : 0,
    stolenAbilityId: getActiveStolenAbilityIds(prev)[0] ?? null,
    stolenAbilityIds: getActiveStolenAbilityIds(prev),
    targetId,
    seq:
      typeof p.seq === 'number' && Number.isFinite(p.seq)
        ? Math.max(0, Math.floor(p.seq))
        : prev.lastMotion.seq + 1,
    clientTimeMs:
      typeof p.clientTimeMs === 'number' && Number.isFinite(p.clientTimeMs)
        ? p.clientTimeMs
        : Date.now(),
  };
}

function buildVitalsEvent(player: ServerPlayer, nowMs = Date.now()): CombatVitalsEvent {
  const activeStolenIds = getActiveStolenAbilityIds(player, nowMs);
  return {
    playerId: player.playerId,
    hp: Math.round(player.hp * 10) / 10,
    maxHp: player.maxHp,
    alive: player.alive,
    spawnProtected: nowMs < player.spawnProtectedUntilMs,
    shieldKind: player.shieldKind,
    shieldRemaining: Math.round(player.shieldRemaining * 10) / 10,
    silverAbsorbEnergy:
      player.characterId === 'silver-surfer' || activeStolenIds.includes('damage-absorption')
        ? Math.round(player.silverAbsorbEnergy)
        : undefined,
    lastAttackerId: player.lastAttackerId,
    serverTimeMs: nowMs,
  };
}

function applyServerDamage(
  io: SocketIOServer,
  room: ServerRoom,
  target: ServerPlayer,
  rawDamage: number,
  attacker: ServerPlayer | null,
  isBeam: boolean,
  nowMs: number,
): { appliedHpDamage: number; shieldBroken: boolean; killed: boolean } {
  if (!target.alive || target.inSelector || rawDamage <= 0) {
    return { appliedHpDamage: 0, shieldBroken: false, killed: false };
  }
  if (nowMs < target.spawnProtectedUntilMs || target.invulnerable) {
    return { appliedHpDamage: 0, shieldBroken: false, killed: false };
  }
  if (target.shieldKind === 'magneto-shield') {
    return { appliedHpDamage: 0, shieldBroken: false, killed: false };
  }

  let remainingDamage = rawDamage;
  let shieldBroken = false;

  if (
    target.shieldKind &&
    target.shieldKind !== 'agatha-shield' &&
    target.shieldKind !== 'silver-absorb' &&
    target.shieldRemaining > 0
  ) {
    const absorbed = Math.min(target.shieldRemaining, remainingDamage);
    target.shieldRemaining = Math.max(0, target.shieldRemaining - absorbed);
    remainingDamage -= absorbed;
    if (target.shieldRemaining <= 0) {
      target.shieldKind = null;
      target.shieldExpiresAtMs = 0;
      shieldBroken = true;
    }
  }

  if (
    remainingDamage > 0 &&
    target.shieldKind === 'silver-absorb' &&
    target.silverAbsorbEnergy < 80
  ) {
    remainingDamage *= 0.5;
    target.silverAbsorbEnergy = Math.min(
      100,
      target.silverAbsorbEnergy + Math.max(18, Math.round(rawDamage * 0.75)),
    );
  }

  if (remainingDamage > 0) {
    target.hp = Math.max(0, target.hp - remainingDamage);
  }

  let killed = false;
  if (target.hp <= 0 && target.alive) {
    target.hp = 0;
    target.alive = false;
    target.shieldKind = null;
    target.shieldRemaining = 0;
    clearPlayerStolenAbilities(target);
    target.lastMotion = {
      ...target.lastMotion,
      hp: 0,
      dead: true,
      ragdoll: true,
      shieldKind: null,
      stolenAbilityId: null,
      stolenAbilityIds: [],
    };
    killed = true;
    clearCasterCrowdControls(io, room, target);
    clearTargetCrowdControls(io, room, target.playerId);
    clearVampireAbsorbForPlayer(io, room, target.playerId);

    const killerId = attacker?.playerId ?? target.lastAttackerId;
    if (killerId && killerId !== target.playerId) {
      const killer = room.players.get(killerId);
      if (killer) {
        killer.kills += 1;
        if (killer.alive && killer.hp < killer.maxHp) {
          killer.hp = Math.min(killer.maxHp, killer.hp + 60);
          killer.lastMotion = { ...killer.lastMotion, hp: killer.hp };
          io.to(room.code).emit('combat:vitals', buildVitalsEvent(killer, nowMs));
        }
        io.to(killer.socketId).emit('combat:elimination', {
          victimPlayerId: target.playerId,
          victimName: target.name,
          rewardCoins: 25,
        });
      }
    }
    target.lastAttackerId = null;
  } else {
    target.lastMotion = {
      ...target.lastMotion,
      hp: target.hp,
      shieldKind: target.shieldKind,
    };
  }

  io.to(room.code).emit('combat:vitals', buildVitalsEvent(target, nowMs));
  if (killed || shieldBroken || isBeam) {
    if (killed) {
      io.to(room.code).emit('room:update', buildRoomSnapshot(room));
    }
  }

  return {
    appliedHpDamage: remainingDamage,
    shieldBroken,
    killed,
  };
}

function clearCasterCrowdControls(
  io: SocketIOServer,
  room: ServerRoom,
  caster: ServerPlayer,
): void {
  if (caster.activeCcEntries.size === 0) return;
  const nowMs = Date.now();
  const notifiedTargets = new Set<string>();
  for (const entry of caster.activeCcEntries.values()) {
    const targetPlayerId = entry.packet.targetPlayerId;
    if (notifiedTargets.has(targetPlayerId)) continue;
    notifiedTargets.add(targetPlayerId);
    const clearPacket: CombatCrowdControlPacket = {
      attackerPlayerId: caster.playerId,
      targetPlayerId,
      kind: 'clear',
      active: false,
      serverTimeMs: nowMs,
    };
    io.to(room.code).emit('combat:cc', clearPacket);
  }
  caster.activeCcEntries.clear();
}

function clearTargetCrowdControls(
  io: SocketIOServer,
  room: ServerRoom,
  targetPlayerId: string,
): void {
  const nowMs = Date.now();
  for (const other of room.players.values()) {
    if (other.activeCcEntries.size === 0) continue;
    let deletedAny = false;
    for (const [key, entry] of Array.from(other.activeCcEntries.entries())) {
      if (entry.packet.targetPlayerId === targetPlayerId) {
        other.activeCcEntries.delete(key);
        deletedAny = true;
      }
    }
    if (deletedAny) {
      io.to(room.code).emit('combat:cc', {
        attackerPlayerId: other.playerId,
        targetPlayerId,
        kind: 'clear',
        active: false,
        serverTimeMs: nowMs,
      } satisfies CombatCrowdControlPacket);
    }
  }
}

function clearVampireAbsorbForPlayer(
  io: SocketIOServer,
  room: ServerRoom,
  playerId: string,
): void {
  const nowMs = Date.now();
  for (const other of room.players.values()) {
    if (other.playerId === playerId && other.pendingAbsorbTargetId) {
      const target = room.players.get(other.pendingAbsorbTargetId);
      other.pendingAbsorbTargetId = null;
      io.to(room.code).emit('vampire:absorb', {
        vampirePlayerId: other.playerId,
        targetPlayerId: target?.playerId ?? '',
        phase: 'cancel',
        stolenAbilityId: null,
        sourceCharacterId: target?.characterId ?? 'scarlet-witch',
        sourceSkinId: target?.skinId ?? null,
        stolenDurationMs: 0,
        serverTimeMs: nowMs,
      } satisfies VampireAbsorbEvent);
    } else if (other.pendingAbsorbTargetId === playerId) {
      const target = room.players.get(playerId);
      other.pendingAbsorbTargetId = null;
      io.to(room.code).emit('vampire:absorb', {
        vampirePlayerId: other.playerId,
        targetPlayerId: playerId,
        phase: 'cancel',
        stolenAbilityId: null,
        sourceCharacterId: target?.characterId ?? 'scarlet-witch',
        sourceSkinId: target?.skinId ?? null,
        stolenDurationMs: 0,
        serverTimeMs: nowMs,
      } satisfies VampireAbsorbEvent);
    }
  }
}

function buildRoomSnapshot(room: ServerRoom): RoomSnapshot {
  const players: PlayerPublicInfo[] = [];
  const nowMs = Date.now();
  for (const player of room.players.values()) {
    const stolenIds = getActiveStolenAbilityIds(player, nowMs);
    players.push({
      playerId: player.playerId,
      name: player.name,
      characterId: player.characterId,
      skinId: player.skinId,
      isOwner: player.playerId === room.ownerPlayerId,
      kills: player.kills,
      hp: Math.round(player.hp),
      maxHp: player.maxHp,
      alive: player.alive,
      inSelector: player.inSelector,
      stolenAbilityId: stolenIds[0] ?? null,
      stolenAbilityIds: stolenIds,
    });
  }
  return {
    roomId: room.roomId,
    code: room.code,
    mapId: room.mapId,
    maxPlayers: room.maxPlayers,
    isPrivate: room.isPrivate,
    ownerPlayerId: room.ownerPlayerId,
    npcsRemoved: room.npcsRemoved,
    players,
  };
}

function findRoomById(roomId: string): ServerRoom | undefined {
  for (const room of rooms.values()) {
    if (room.roomId === roomId) {
      return room;
    }
  }
  return undefined;
}

function resolveValidMaxPlayers(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return MAX_ROOM_PLAYERS;
  }
  return Math.min(MAX_ROOM_PLAYERS, Math.max(MIN_ROOM_PLAYERS, Math.floor(raw)));
}

function buildServerList(): ServerSummary[] {
  const list: ServerSummary[] = [];
  for (const room of rooms.values()) {
    const owner = room.players.get(room.ownerPlayerId);
    list.push({
      roomId: room.roomId,
      ownerName: owner?.name ?? 'Host',
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      mapId: room.mapId,
      createdAtMs: room.createdAtMs,
    });
  }
  list.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return list;
}

function broadcastServerList(io: SocketIOServer): void {
  io.to(LOBBY_SERVERS_ROOM).emit('lobby:servers', buildServerList());
}

function removePlayerFromRoomById(
  io: SocketIOServer,
  roomCode: string,
  playerId: string,
): boolean {
  const room = rooms.get(roomCode);
  if (!room) return false;

  const departing = room.players.get(playerId);
  if (!departing) return false;
  if (departing.disconnectGraceTimer) {
    clearTimeout(departing.disconnectGraceTimer);
    departing.disconnectGraceTimer = undefined;
  }
  clearCasterCrowdControls(io, room, departing);
  clearTargetCrowdControls(io, room, playerId);
  clearVampireAbsorbForPlayer(io, room, playerId);
  room.players.delete(playerId);

  if (room.players.size === 0) {
    rooms.delete(roomCode);
    broadcastServerList(io);
    return true;
  }

  let newOwnerPlayerId: string | null = null;
  if (room.ownerPlayerId === playerId) {
    let nextOwner: ServerPlayer | undefined;
    for (const candidate of room.players.values()) {
      if (!nextOwner || candidate.joinedAtMs < nextOwner.joinedAtMs) {
        nextOwner = candidate;
      }
    }
    if (nextOwner) {
      room.ownerPlayerId = nextOwner.playerId;
      newOwnerPlayerId = nextOwner.playerId;
    }
  }

  const snapshot = buildRoomSnapshot(room);
  io.to(roomCode).emit('room:playerLeft', {
    playerId,
    playerName: departing.name,
    newOwnerPlayerId,
    room: snapshot,
  });
  io.to(roomCode).emit('room:update', snapshot);
  broadcastServerList(io);
  return true;
}

function removePlayerFromCurrentRoom(
  io: SocketIOServer,
  socket: Socket,
): void {
  const roomCode = socket.data.roomCode as string | undefined;
  const playerId = socket.data.playerId as string | undefined;
  if (!roomCode || !playerId) return;

  socket.data.roomCode = undefined;
  socket.data.playerId = undefined;
  void socket.leave(roomCode);

  removePlayerFromRoomById(io, roomCode, playerId);
}

function parseAllowedOrigins(): string[] | true {
  return true;
}

export interface ValidatedGameState {
  selectedCharacterId: string;
  selectedSkinsByChar: Record<string, string>;
  unlockedSkins: string[];
  coins: number;
  stamina: number;
  maxStamina: number;
  staminaRegenDelayRemaining: number;
  sprintEnabled: boolean;
  flightEnabled: boolean;
  hp: number;
  maxHp: number;
  killStreak: number;
  activeAbilityLocked: boolean;
  invisibilityActive: boolean;
  forcefieldActive: boolean;
  updatedAtMs: number;
}

interface SessionRecord {
  sessionId: string;
  state: ValidatedGameState;
  lastTouchedMs: number;
}

const sessionStore = new Map<string, SessionRecord>();
const ttsAudioCache = new Map<string, Buffer>();
const ttsInFlight = new Map<string, Promise<Buffer | null>>();
const CHARACTER_NAME_PATTERN = /^[a-zA-Z0-9 .'\-&]{1,60}$/;
async function synthesizeCharacterNameWav(_name: string): Promise<Buffer | null> {
  return null;
}

function createDefaultState(): ValidatedGameState {
  return {
    selectedCharacterId: 'scarlet-witch',
    selectedSkinsByChar: {},
    unlockedSkins: [],
    coins: 0,
    stamina: MAX_STAMINA,
    maxStamina: MAX_STAMINA,
    staminaRegenDelayRemaining: 0,
    sprintEnabled: false,
    flightEnabled: false,
    hp: 250,
    maxHp: 250,
    killStreak: 0,
    activeAbilityLocked: false,
    invisibilityActive: false,
    forcefieldActive: false,
    updatedAtMs: Date.now(),
  };
}

function resolveSessionId(req: Request): string {
  const headerVal = req.header('x-session-id');
  if (headerVal && SESSION_ID_PATTERN.test(headerVal)) {
    return headerVal;
  }
  return crypto.randomUUID();
}

function getOrCreateSession(sessionId: string): SessionRecord {
  const existing = sessionStore.get(sessionId);
  if (existing) {
    existing.lastTouchedMs = Date.now();
    return existing;
  }
  if (sessionStore.size >= MAX_SESSIONS) {
    const oldestKey = sessionStore.keys().next().value;
    if (oldestKey) {
      sessionStore.delete(oldestKey);
    }
  }
  const created: SessionRecord = {
    sessionId,
    state: createDefaultState(),
    lastTouchedMs: Date.now(),
  };
  sessionStore.set(sessionId, created);
  return created;
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function validateAndMergeState(
  prev: ValidatedGameState,
  payload: unknown,
): ValidatedGameState {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return prev;
  }
  const input = payload as Record<string, unknown>;

  const nextCharId =
    typeof input.selectedCharacterId === 'string' &&
    Object.prototype.hasOwnProperty.call(CHARACTER_MAX_HP, input.selectedCharacterId)
      ? input.selectedCharacterId
      : prev.selectedCharacterId;

  const maxHp = CHARACTER_MAX_HP[nextCharId] ?? 250;

  const nextUnlockedSet = new Set<string>(prev.unlockedSkins);
  if (Array.isArray(input.unlockedSkins)) {
    for (const skin of input.unlockedSkins) {
      if (typeof skin === 'string' && ALL_VALID_SKIN_IDS.has(skin)) {
        nextUnlockedSet.add(skin);
      }
    }
  }

  let nextCoins = prev.coins;
  if (typeof input.coins === 'number' && Number.isFinite(input.coins)) {
    const requestedCoins = Math.floor(clampFinite(input.coins, 0, MAX_COINS, prev.coins));
    // Guard against abrupt unearned coin inflation while allowing legitimate kill payouts & purchases
    const delta = requestedCoins - prev.coins;
    if (delta <= 1000) {
      nextCoins = requestedCoins;
    } else if (prev.coins === 0 && requestedCoins <= 5000) {
      // Initial client localStorage restore on fresh session boot
      nextCoins = requestedCoins;
    }
  }

  // Enforce skin purchase deduction if a priced skin was just unlocked
  if (typeof input.purchaseSkinId === 'string' && ALL_VALID_SKIN_IDS.has(input.purchaseSkinId)) {
    const price = SKIN_PRICES[input.purchaseSkinId] ?? 0;
    if (!prev.unlockedSkins.includes(input.purchaseSkinId) && prev.coins >= price) {
      nextCoins = Math.max(0, prev.coins - price);
      nextUnlockedSet.add(input.purchaseSkinId);
    }
  }

  const nextSkinsByChar: Record<string, string> = { ...prev.selectedSkinsByChar };
  if (
    input.selectedSkinsByChar &&
    typeof input.selectedSkinsByChar === 'object' &&
    !Array.isArray(input.selectedSkinsByChar)
  ) {
    for (const [charId, skinId] of Object.entries(
      input.selectedSkinsByChar as Record<string, unknown>,
    )) {
      if (
        typeof skinId === 'string' &&
        CHARACTER_SKIN_IDS[charId]?.has(skinId)
      ) {
        const price = SKIN_PRICES[skinId] ?? 0;
        if (price === 0 || nextUnlockedSet.has(skinId)) {
          nextSkinsByChar[charId] = skinId;
        }
      }
    }
  }

  const nextStamina = clampFinite(input.stamina, 0, MAX_STAMINA, prev.stamina);
  const nextRegenDelay = clampFinite(
    input.staminaRegenDelayRemaining,
    0,
    STAMINA_REGEN_DELAY_SEC,
    prev.staminaRegenDelayRemaining,
  );
  // Stamina 0 forces sprint disabled
  const requestedSprint =
    typeof input.sprintEnabled === 'boolean' ? input.sprintEnabled : prev.sprintEnabled;
  const nextSprint = nextStamina > 0 ? requestedSprint : false;

  const nextFlight =
    typeof input.flightEnabled === 'boolean' ? input.flightEnabled : prev.flightEnabled;

  // Enforce Magneto flight rule: offensive ground abilities cannot coexist with flight shield
  const activeAbilityLocked =
    nextCharId === 'magneto'
      ? nextFlight
      : typeof input.activeAbilityLocked === 'boolean'
        ? input.activeAbilityLocked
        : prev.activeAbilityLocked;

  const nextHp = Math.round(clampFinite(input.hp, 0, maxHp, prev.hp));
  const nextStreak = Math.floor(clampFinite(input.killStreak, 0, 9999, prev.killStreak));

  // Enforce Invisible Woman rules: Invisibility works grounded or flying and cannot coexist with active Forcefield abilities
  const requestedForcefield =
    nextCharId === 'invisible-woman'
      ? typeof input.forcefieldActive === 'boolean'
        ? input.forcefieldActive
        : prev.forcefieldActive
      : false;
  const requestedInvisibility =
    nextCharId === 'invisible-woman' && !requestedForcefield
      ? typeof input.invisibilityActive === 'boolean'
        ? input.invisibilityActive
        : prev.invisibilityActive
      : false;

  return {
    selectedCharacterId: nextCharId,
    selectedSkinsByChar: nextSkinsByChar,
    unlockedSkins: Array.from(nextUnlockedSet),
    coins: nextCoins,
    stamina: Number(nextStamina.toFixed(2)),
    maxStamina: MAX_STAMINA,
    staminaRegenDelayRemaining: Number(nextRegenDelay.toFixed(3)),
    sprintEnabled: nextSprint,
    flightEnabled: nextFlight,
    hp: nextHp,
    maxHp,
    killStreak: nextStreak,
    activeAbilityLocked,
    invisibilityActive: requestedInvisibility,
    forcefieldActive: requestedForcefield,
    updatedAtMs: Date.now(),
  };
}

function attachMultiplayerSocketServer(httpServer: http.Server): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 60000,
    connectTimeout: 45000,
    maxHttpBufferSize: 128 * 1024,
    cors: {
      origin: parseAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: false,
    },
  });

  io.on('connection', (socket: Socket) => {
    socket.on('lobby:subscribe', () => {
      void socket.join(LOBBY_SERVERS_ROOM);
      socket.emit('lobby:servers', buildServerList());
    });

    socket.on('lobby:unsubscribe', () => {
      void socket.leave(LOBBY_SERVERS_ROOM);
    });

    socket.on(
      'room:create',
      (
        payload: {
          playerName?: string;
          characterId?: string;
          skinId?: string | null;
          mapId?: MapId;
          maxPlayers?: number;
          isPrivate?: boolean;
        },
        ack?: (res: RoomAckResult) => void,
      ) => {
        if (!checkSocketActionRate(socket.id, 10, 10_000)) {
          ack?.({
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Too many requests. Wait a moment and try again.',
          });
          return;
        }
        if (rooms.size >= MAX_ACTIVE_ROOMS) {
          ack?.({
            ok: false,
            code: 'SERVER_ERROR',
            message: 'Server room capacity reached. Try again shortly.',
          });
          return;
        }

        const playerName = sanitizePlayerName(payload?.playerName);
        if (!playerName) {
          ack?.({
            ok: false,
            code: 'INVALID_NAME',
            message: 'Enter a name before creating a server.',
          });
          return;
        }

        removePlayerFromCurrentRoom(io, socket);

        const code = generateUniqueRoomCode();
        if (!code) {
          ack?.({
            ok: false,
            code: 'SERVER_ERROR',
            message: 'Could not allocate a unique room code.',
          });
          return;
        }

        const roomId = crypto.randomUUID();
        const playerId = crypto.randomUUID();
        const reconnectToken = crypto.randomBytes(24).toString('hex');
        const characterId = resolveValidCharacterId(payload?.characterId);
        const skinId = resolveValidSkinId(characterId, payload?.skinId);
        const maxHp = CHARACTER_MAX_HP[characterId] ?? 250;
        const mapId = resolveValidMapId(payload?.mapId);
        const maxPlayers = resolveValidMaxPlayers(payload?.maxPlayers);
        const isPrivate = Boolean(payload?.isPrivate);

        const now = Date.now();
        const player: ServerPlayer = {
          playerId,
          reconnectToken,
          socketId: socket.id,
          name: playerName,
          joinedAtMs: now,
          kills: 0,
          characterId,
          skinId,
          hp: maxHp,
          maxHp,
          alive: false,
          inSelector: true,
          spawnProtected: true,
          spawnProtectedUntilMs: now + SPAWN_PROTECTION_MS,
          invulnerable: true,
          shieldKind: null,
          shieldRemaining: 0,
          shieldExpiresAtMs: 0,
          silverAbsorbEnergy: 0,
          stolenAbilities: [],
          pendingAbsorbTargetId: null,
          activeCcEntries: new Map<string, ActiveCcEntry>(),
          lastHitByTarget: new Map<string, number>(),
          lastSeq: 0,
          serverSeq: 0,
          x: 0,
          y: 0.4,
          z: 0,
          yaw: 0,
          lastStateAtMs: 0,
          lastVfxAtMs: 0,
          lastCombatHitAtMs: 0,
          lastHealAtMs: 0,
          lastAttackerId: null,
          lastAttackedAtMs: 0,
          lastMotion: buildDefaultMotion(characterId, skinId),
        };

        const room: ServerRoom = {
          roomId,
          code,
          mapId,
          maxPlayers,
          isPrivate,
          ownerPlayerId: playerId,
          npcsRemoved: false,
          createdAtMs: now,
          players: new Map([[playerId, player]]),
        };
        rooms.set(code, room);

        socket.data.roomCode = code;
        socket.data.playerId = playerId;
        void socket.leave(LOBBY_SERVERS_ROOM);
        void socket.join(code);

        ack?.({
          ok: true,
          playerId,
          reconnectToken,
          room: buildRoomSnapshot(room),
        });
        socket.emit('combat:vitals', buildVitalsEvent(player, now));
        broadcastServerList(io);
      },
    );

    socket.on(
      'room:join',
      (
        payload: {
          roomId?: string;
          code?: string;
          playerName?: string;
          characterId?: string;
          skinId?: string | null;
        },
        ack?: (res: RoomAckResult) => void,
      ) => {
        if (!checkSocketActionRate(socket.id, 15, 10_000)) {
          ack?.({
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Too many join attempts. Please wait a second.',
          });
          return;
        }

        const playerName = sanitizePlayerName(payload?.playerName);
        if (!playerName) {
          ack?.({
            ok: false,
            code: 'INVALID_NAME',
            message: 'Enter a name before joining a server.',
          });
          return;
        }

        const requestedRoomId =
          typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
        const normalizedCode =
          typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : '';

        let room: ServerRoom | undefined;
        if (requestedRoomId) {
          room = findRoomById(requestedRoomId);
          if (!room) {
            ack?.({
              ok: false,
              code: 'ROOM_NOT_FOUND',
              message: 'Server no longer exists.',
            });
            return;
          }
          if (room.isPrivate) {
            if (!ROOM_CODE_REGEX.test(normalizedCode)) {
              ack?.({
                ok: false,
                code: 'INVALID_CODE',
                message: 'Enter a valid 6-character server code.',
              });
              return;
            }
            if (room.code !== normalizedCode) {
              ack?.({
                ok: false,
                code: 'INVALID_CODE',
                message: 'Incorrect server code.',
              });
              return;
            }
          }
        } else {
          if (!ROOM_CODE_REGEX.test(normalizedCode)) {
            ack?.({
              ok: false,
              code: 'INVALID_CODE',
              message: 'Enter a valid 6-character server code.',
            });
            return;
          }
          room = rooms.get(normalizedCode);
          if (!room) {
            ack?.({
              ok: false,
              code: 'ROOM_NOT_FOUND',
              message: 'Server code not found or no longer active.',
            });
            return;
          }
        }

        const existingRoomCode = socket.data.roomCode as string | undefined;
        if (existingRoomCode) {
          removePlayerFromCurrentRoom(io, socket);
        }

        if (room.players.size >= room.maxPlayers) {
          ack?.({
            ok: false,
            code: 'ROOM_FULL',
            message: `This server is full (${room.maxPlayers}/${room.maxPlayers} players).`,
          });
          return;
        }

        const playerId = crypto.randomUUID();
        const reconnectToken = crypto.randomBytes(24).toString('hex');
        const characterId = resolveValidCharacterId(payload?.characterId);
        const skinId = resolveValidSkinId(characterId, payload?.skinId);
        const maxHp = CHARACTER_MAX_HP[characterId] ?? 250;
        const now = Date.now();

        const player: ServerPlayer = {
          playerId,
          reconnectToken,
          socketId: socket.id,
          name: playerName,
          joinedAtMs: now,
          kills: 0,
          characterId,
          skinId,
          hp: maxHp,
          maxHp,
          alive: false,
          inSelector: true,
          spawnProtected: true,
          spawnProtectedUntilMs: now + SPAWN_PROTECTION_MS,
          invulnerable: true,
          shieldKind: null,
          shieldRemaining: 0,
          shieldExpiresAtMs: 0,
          silverAbsorbEnergy: 0,
          stolenAbilities: [],
          pendingAbsorbTargetId: null,
          activeCcEntries: new Map<string, ActiveCcEntry>(),
          lastHitByTarget: new Map<string, number>(),
          lastSeq: 0,
          serverSeq: 0,
          x: 0,
          y: 0.4,
          z: 0,
          yaw: 0,
          lastStateAtMs: 0,
          lastVfxAtMs: 0,
          lastCombatHitAtMs: 0,
          lastHealAtMs: 0,
          lastAttackerId: null,
          lastAttackedAtMs: 0,
          lastMotion: buildDefaultMotion(characterId, skinId),
        };
        room.players.set(playerId, player);

        socket.data.roomCode = room.code;
        socket.data.playerId = playerId;
        void socket.leave(LOBBY_SERVERS_ROOM);
        void socket.join(room.code);

        const snapshot = buildRoomSnapshot(room);
        ack?.({
          ok: true,
          playerId,
          reconnectToken,
          room: snapshot,
        });

        socket.to(room.code).emit('room:playerJoined', {
          playerId,
          playerName: player.name,
          room: snapshot,
        });
        io.to(room.code).emit('room:update', snapshot);
        socket.emit('combat:vitals', buildVitalsEvent(player, now));
        broadcastServerList(io);

        for (const existingPlayer of room.players.values()) {
          if (existingPlayer.playerId === playerId) continue;
          existingPlayer.serverSeq += 1;
          const stateMsg: RemotePlayerStateUpdate = {
            ...existingPlayer.lastMotion,
            justJumped: false,
            landImpactSpeed: 0,
            hp: existingPlayer.hp,
            maxHp: existingPlayer.maxHp,
            dead: !existingPlayer.inSelector && !existingPlayer.alive,
            ragdoll: !existingPlayer.inSelector && existingPlayer.lastMotion.ragdoll,
            inSelector: existingPlayer.inSelector,
            spawnProtected: now < existingPlayer.spawnProtectedUntilMs,
            shieldKind: existingPlayer.shieldKind,
            stolenAbilityId: getActiveStolenAbilityIds(existingPlayer, now)[0] ?? null,
            stolenAbilityIds: getActiveStolenAbilityIds(existingPlayer, now),
            seq: existingPlayer.serverSeq,
            playerId: existingPlayer.playerId,
            serverTimeMs: now,
          };
          socket.emit('player:state', stateMsg);
          socket.emit('combat:vitals', buildVitalsEvent(existingPlayer, now));
          for (const entry of existingPlayer.activeCcEntries.values()) {
            if (entry.expiresAtMs > now) {
              socket.emit('combat:cc', entry.packet);
            }
          }
        }
      },
    );

    socket.on(
      'room:rejoin',
      (
        payload: { code?: string; playerId?: string; reconnectToken?: string },
        ack?: (res: RoomAckResult) => void,
      ) => {
        const normalizedCode =
          typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : '';
        const playerId = typeof payload?.playerId === 'string' ? payload.playerId : '';
        const reconnectToken =
          typeof payload?.reconnectToken === 'string' ? payload.reconnectToken : '';
        if (!ROOM_CODE_REGEX.test(normalizedCode) || !playerId || !reconnectToken) {
          ack?.({
            ok: false,
            code: 'INVALID_CODE',
            message: 'Missing reconnect credentials.',
          });
          return;
        }
        const room = rooms.get(normalizedCode);
        const existing = room?.players.get(playerId);
        if (!room || !existing || existing.reconnectToken !== reconnectToken) {
          ack?.({
            ok: false,
            code: 'ROOM_NOT_FOUND',
            message: 'Session expired. Rejoin with the server code.',
          });
          return;
        }

        if (existing.disconnectGraceTimer) {
          clearTimeout(existing.disconnectGraceTimer);
          existing.disconnectGraceTimer = undefined;
        }
        existing.socketId = socket.id;
        existing.lastSeq = 0;
        socket.data.roomCode = room.code;
        socket.data.playerId = existing.playerId;
        void socket.join(room.code);

        const now = Date.now();
        const snapshot = buildRoomSnapshot(room);
        ack?.({
          ok: true,
          playerId: existing.playerId,
          reconnectToken: existing.reconnectToken,
          room: snapshot,
        });
        io.to(room.code).emit('room:update', snapshot);
        socket.emit('combat:vitals', buildVitalsEvent(existing, now));
        for (const other of room.players.values()) {
          if (other.playerId === existing.playerId) continue;
          other.serverSeq += 1;
          socket.emit('player:state', {
            ...other.lastMotion,
            justJumped: false,
            landImpactSpeed: 0,
            hp: other.hp,
            maxHp: other.maxHp,
            dead: !other.inSelector && !other.alive,
            ragdoll: !other.inSelector && other.lastMotion.ragdoll,
            inSelector: other.inSelector,
            spawnProtected: now < other.spawnProtectedUntilMs,
            shieldKind: other.shieldKind,
            stolenAbilityId: getActiveStolenAbilityIds(other, now)[0] ?? null,
            stolenAbilityIds: getActiveStolenAbilityIds(other, now),
            seq: other.serverSeq,
            playerId: other.playerId,
            serverTimeMs: now,
          });
          socket.emit('combat:vitals', buildVitalsEvent(other, now));
          for (const entry of other.activeCcEntries.values()) {
            if (entry.expiresAtMs > now) {
              socket.emit('combat:cc', entry.packet);
            }
          }
        }
      },
    );

    socket.on('room:leave', (ack?: (res: GenericAckResult) => void) => {
      removePlayerFromCurrentRoom(io, socket);
      ack?.({ ok: true });
    });

    socket.on(
      'room:reenter',
      (
        ack?: (res: { ok: true; room: RoomSnapshot } | { ok: false; message: string }) => void,
      ) => {
        const roomCode = socket.data.roomCode as string | undefined;
        const playerId = socket.data.playerId as string | undefined;
        if (!roomCode || !playerId) {
          ack?.({ ok: false, message: 'Not in a server room.' });
          return;
        }
        const room = rooms.get(roomCode);
        const player = room?.players.get(playerId);
        if (!room || !player || player.socketId !== socket.id) {
          ack?.({ ok: false, message: 'Server session not found.' });
          return;
        }

        const now = Date.now();
        clearCasterCrowdControls(io, room, player);
        clearTargetCrowdControls(io, room, player.playerId);
        clearVampireAbsorbForPlayer(io, room, player.playerId);

        player.inSelector = true;
        player.alive = false;
        player.kills = 0;
        player.hp = player.maxHp;
        player.spawnProtected = true;
        player.spawnProtectedUntilMs = now + SPAWN_PROTECTION_MS;
        player.invulnerable = true;
        player.shieldKind = null;
        player.shieldRemaining = 0;
        player.shieldExpiresAtMs = 0;
        player.silverAbsorbEnergy = 0;
        clearPlayerStolenAbilities(player);
        player.pendingAbsorbTargetId = null;
        player.lastAttackerId = null;
        player.lastSeq = 0;
        player.serverSeq += 1;
        player.lastMotion = {
          ...buildDefaultMotion(player.characterId, player.skinId),
          seq: player.serverSeq,
        };

        socket.to(room.code).emit('player:state', {
          ...player.lastMotion,
          justJumped: false,
          landImpactSpeed: 0,
          playerId: player.playerId,
          serverTimeMs: now,
        });
        io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));

        const snapshot = buildRoomSnapshot(room);
        io.to(room.code).emit('room:update', snapshot);
        ack?.({ ok: true, room: snapshot });
      },
    );

    socket.on(
      'room:kick',
      (
        rawPayload: unknown,
        ack?: (res: GenericAckResult) => void,
      ) => {
        const roomCode = socket.data.roomCode as string | undefined;
        const playerId = socket.data.playerId as string | undefined;
        if (!roomCode || !playerId) {
          ack?.({ ok: false, code: 'UNAUTHORIZED', message: 'Not in a server room.' });
          return;
        }
        const room = rooms.get(roomCode);
        if (!room) {
          ack?.({ ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
          return;
        }
        if (room.ownerPlayerId !== playerId) {
          ack?.({
            ok: false,
            code: 'UNAUTHORIZED',
            message: 'Only the server owner can kick players.',
          });
          return;
        }

        const targetPlayerId =
          rawPayload &&
          typeof rawPayload === 'object' &&
          !Array.isArray(rawPayload) &&
          typeof (rawPayload as { targetPlayerId?: unknown }).targetPlayerId === 'string'
            ? (rawPayload as { targetPlayerId: string }).targetPlayerId.trim()
            : '';

        if (!targetPlayerId || targetPlayerId === playerId) {
          ack?.({ ok: false, code: 'INVALID_TARGET', message: 'Invalid player to kick.' });
          return;
        }

        const target = room.players.get(targetPlayerId);
        if (!target) {
          ack?.({ ok: false, code: 'NOT_FOUND', message: 'Player is no longer in the server.' });
          return;
        }

        clearCasterCrowdControls(io, room, target);
        clearTargetCrowdControls(io, room, target.playerId);
        clearVampireAbsorbForPlayer(io, room, target.playerId);

        const targetSocket = io.sockets.sockets.get(target.socketId);
        room.players.delete(targetPlayerId);

        if (targetSocket) {
          targetSocket.data.roomCode = undefined;
          targetSocket.data.playerId = undefined;
          void targetSocket.leave(room.code);
          targetSocket.emit('room:kicked', {
            roomId: room.roomId,
            reason: 'You were kicked by the server owner.',
          });
        }

        const snapshot = buildRoomSnapshot(room);
        io.to(room.code).emit('room:playerLeft', {
          playerId: target.playerId,
          playerName: target.name,
          newOwnerPlayerId: null,
          kicked: true,
          room: snapshot,
        });
        io.to(room.code).emit('room:update', snapshot);
        broadcastServerList(io);
        ack?.({ ok: true });
      },
    );

    const handleSetNpcsRemoved = (
      desiredRemoved: boolean,
      ack?: (res: GenericAckResult) => void,
    ) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) {
        ack?.({ ok: false, code: 'UNAUTHORIZED', message: 'Not in a server room.' });
        return;
      }
      const room = rooms.get(roomCode);
      if (!room) {
        ack?.({ ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
        return;
      }
      if (room.ownerPlayerId !== playerId) {
        ack?.({
          ok: false,
          code: 'UNAUTHORIZED',
          message: 'Only the server owner can manage NPCs.',
        });
        return;
      }

      room.npcsRemoved = desiredRemoved;
      const snapshot = buildRoomSnapshot(room);
      io.to(room.code).emit('room:npcsRemoved', {
        removed: room.npcsRemoved,
        byPlayerId: playerId,
        room: snapshot,
      });
      io.to(room.code).emit('room:update', snapshot);
      ack?.({ ok: true });
    };

    socket.on('room:removeNpcs', (ack?: (res: GenericAckResult) => void) => {
      handleSetNpcsRemoved(true, ack);
    });

    socket.on(
      'room:toggleNpcs',
      (rawPayload: unknown, ack?: (res: GenericAckResult) => void) => {
        const roomCode = socket.data.roomCode as string | undefined;
        const room = roomCode ? rooms.get(roomCode) : undefined;
        const explicit =
          rawPayload &&
          typeof rawPayload === 'object' &&
          !Array.isArray(rawPayload) &&
          typeof (rawPayload as { removed?: unknown }).removed === 'boolean'
            ? (rawPayload as { removed: boolean }).removed
            : room
              ? !room.npcsRemoved
              : true;
        handleSetNpcsRemoved(explicit, ack);
      },
    );

    socket.on('player:selecting', (rawPayload: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.get(playerId);
      if (!room || !player || player.socketId !== socket.id) return;

      const selecting = Boolean(
        rawPayload &&
          typeof rawPayload === 'object' &&
          !Array.isArray(rawPayload) &&
          (rawPayload as { selecting?: unknown }).selecting,
      );
      const now = Date.now();

      clearCasterCrowdControls(io, room, player);
      clearTargetCrowdControls(io, room, player.playerId);
      clearVampireAbsorbForPlayer(io, room, player.playerId);

      if (selecting) {
        player.inSelector = true;
        player.alive = false;
        player.invulnerable = true;
        player.shieldKind = null;
        player.shieldRemaining = 0;
        player.shieldExpiresAtMs = 0;
        player.silverAbsorbEnergy = 0;
        clearPlayerStolenAbilities(player);
        player.pendingAbsorbTargetId = null;
        player.lastAttackerId = null;
        player.serverSeq += 1;
        player.lastMotion = {
          ...player.lastMotion,
          dead: false,
          ragdoll: false,
          inSelector: true,
          shieldKind: null,
          stolenAbilityId: null,
          stolenAbilityIds: [],
          seq: player.serverSeq,
        };
        socket.to(room.code).emit('player:state', {
          ...player.lastMotion,
          justJumped: false,
          landImpactSpeed: 0,
          playerId: player.playerId,
          serverTimeMs: now,
        });
      } else {
        player.inSelector = false;
        player.alive = true;
        player.hp = player.maxHp;
        player.spawnProtected = true;
        player.spawnProtectedUntilMs = now + SPAWN_PROTECTION_MS;
        player.invulnerable = false;
        player.shieldKind = null;
        player.shieldRemaining = 0;
        player.shieldExpiresAtMs = 0;
        player.silverAbsorbEnergy = 0;
        clearPlayerStolenAbilities(player);
        player.pendingAbsorbTargetId = null;
        player.lastAttackerId = null;
        player.lastSeq = 0;
        player.serverSeq += 1;
        player.lastMotion = {
          ...player.lastMotion,
          hp: player.maxHp,
          dead: false,
          ragdoll: false,
          inSelector: false,
          spawnProtected: true,
          shieldKind: null,
          stolenAbilityId: null,
          stolenAbilityIds: [],
          seq: player.serverSeq,
        };
        socket.to(room.code).emit('player:state', {
          ...player.lastMotion,
          justJumped: false,
          landImpactSpeed: 0,
          playerId: player.playerId,
          serverTimeMs: now,
        });
      }

      io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
      io.to(room.code).emit('room:update', buildRoomSnapshot(room));
    });

    socket.on('player:state', (rawPacket: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player || player.socketId !== socket.id) return;
      if (player.inSelector) return;

      const now = Date.now();
      const sanitized = sanitizeMotionPacket(player, rawPacket);
      if (!sanitized) return;

      const nextInSelector = Boolean(sanitized.inSelector);
      const isUrgentEdge =
        Boolean(sanitized.justJumped) ||
        (sanitized.landImpactSpeed ?? 0) > 0 ||
        sanitized.grounded !== player.lastMotion.grounded ||
        sanitized.flying !== player.lastMotion.flying ||
        sanitized.sprinting !== player.lastMotion.sprinting ||
        sanitized.superSpeed !== player.lastMotion.superSpeed ||
        sanitized.dead !== player.lastMotion.dead ||
        sanitized.ragdoll !== player.lastMotion.ragdoll ||
        nextInSelector !== player.inSelector ||
        sanitized.shieldKind !== player.shieldKind;

      if (!isUrgentEdge && now - player.lastStateAtMs < 12) return;

      // Drop out-of-order stale packets while allowing respawn/remount/time-advance resets
      const clientAdvancedReset =
        sanitized.clientTimeMs > player.lastMotion.clientTimeMs + 1200;
      if (
        !clientAdvancedReset &&
        sanitized.seq > 2 &&
        player.lastSeq > 0 &&
        sanitized.seq <= player.lastSeq &&
        player.lastSeq - sanitized.seq < 1000
      ) {
        return;
      }
      player.lastSeq = sanitized.seq;

      const characterChanged =
        player.characterId !== sanitized.characterId ||
        player.skinId !== sanitized.skinId;
      const returnedFromSelector = player.inSelector && !nextInSelector;
      const enteredSelector = !player.inSelector && nextInSelector;

      if (enteredSelector) {
        clearCasterCrowdControls(io, room, player);
        clearTargetCrowdControls(io, room, player.playerId);
        clearVampireAbsorbForPlayer(io, room, player.playerId);
        player.inSelector = true;
        player.alive = false;
        player.invulnerable = true;
        player.shieldKind = null;
        player.shieldRemaining = 0;
        player.shieldExpiresAtMs = 0;
        player.silverAbsorbEnergy = 0;
        clearPlayerStolenAbilities(player);
        player.pendingAbsorbTargetId = null;
        player.lastAttackerId = null;
        io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
      } else if (characterChanged || returnedFromSelector) {
        clearCasterCrowdControls(io, room, player);
        clearTargetCrowdControls(io, room, player.playerId);
        clearVampireAbsorbForPlayer(io, room, player.playerId);
        player.inSelector = false;
        player.characterId = sanitized.characterId;
        player.skinId = sanitized.skinId;
        player.maxHp = sanitized.maxHp;
        player.hp = sanitized.maxHp;
        player.alive = true;
        player.spawnProtectedUntilMs = now + SPAWN_PROTECTION_MS;
        player.shieldKind = null;
        player.shieldRemaining = 0;
        player.shieldExpiresAtMs = 0;
        player.silverAbsorbEnergy = 0;
        clearPlayerStolenAbilities(player);
        player.pendingAbsorbTargetId = null;
        player.lastAttackerId = null;
        io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
      } else {
        // Server tracks shield activation/deactivation and enforces capacity
        if (sanitized.shieldKind !== player.shieldKind) {
          if (sanitized.shieldKind) {
            player.shieldKind = sanitized.shieldKind;
            player.shieldRemaining = SHIELD_CAPACITIES[sanitized.shieldKind] ?? 100;
            player.shieldExpiresAtMs =
              now + (SHIELD_DURATIONS_MS[sanitized.shieldKind] ?? 12_000);
            if (sanitized.shieldKind === 'silver-absorb') {
              player.silverAbsorbEnergy = 0;
            }
          } else {
            player.shieldKind = null;
            player.shieldRemaining = 0;
            player.shieldExpiresAtMs = 0;
            if (player.silverAbsorbEnergy > 0) {
              player.silverAbsorbEnergy = 0;
            }
          }
          io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
        } else if (
          player.shieldKind &&
          player.shieldExpiresAtMs > 0 &&
          now > player.shieldExpiresAtMs
        ) {
          player.shieldKind = null;
          player.shieldRemaining = 0;
          player.shieldExpiresAtMs = 0;
          io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
        }
      }

      const activeStolenIds = getActiveStolenAbilityIds(player, now);

      player.lastStateAtMs = now;
      player.x = sanitized.x;
      player.y = sanitized.y;
      player.z = sanitized.z;
      player.yaw = sanitized.yaw;
      player.invulnerable = player.inSelector ? true : Boolean(sanitized.invulnerable);
      player.spawnProtected = now < player.spawnProtectedUntilMs;

      // Authoritative fields override client values before storing/relaying
      player.serverSeq += 1;
      const authoritativeMotion: PlayerMotionPacket = {
        ...sanitized,
        justJumped: false,
        landImpactSpeed: 0,
        hp: player.hp,
        maxHp: player.maxHp,
        dead: !player.inSelector && !player.alive,
        ragdoll: !player.inSelector && sanitized.ragdoll,
        inSelector: player.inSelector,
        spawnProtected: player.spawnProtected,
        shieldKind: player.shieldKind,
        stolenAbilityId: activeStolenIds[0] ?? null,
        stolenAbilityIds: activeStolenIds,
        seq: player.serverSeq,
      };
      player.lastMotion = authoritativeMotion;

      const relay: RemotePlayerStateUpdate = {
        ...authoritativeMotion,
        justJumped: Boolean(sanitized.justJumped),
        landImpactSpeed: sanitized.landImpactSpeed ?? 0,
        playerId,
        serverTimeMs: now,
      };
      socket.to(room.code).emit('player:state', relay);

      if (characterChanged || returnedFromSelector || enteredSelector) {
        io.to(room.code).emit('room:update', buildRoomSnapshot(room));
      }
    });

    socket.on('player:abilityVfx', (rawVfx: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player) return;

      const now = Date.now();
      if (!checkSocketActionRate(`vfx:${socket.id}`, 120, 1000)) return;
      if (!rawVfx || typeof rawVfx !== 'object' || Array.isArray(rawVfx)) return;
      const v = rawVfx as Partial<AbilityVfxPacket>;
      if (player.inSelector && v.kind !== 'respawn') return;

      if (
        typeof v.originX !== 'number' ||
        !Number.isFinite(v.originX) ||
        typeof v.originY !== 'number' ||
        !Number.isFinite(v.originY) ||
        typeof v.originZ !== 'number' ||
        !Number.isFinite(v.originZ)
      ) {
        return;
      }

      if (typeof v.kind !== 'string' || !VALID_VFX_KINDS.has(v.kind)) return;

      player.lastVfxAtMs = now;
      const packet: AbilityVfxPacket = {
        playerId,
        kind: v.kind,
        abilityId: typeof v.abilityId === 'string' ? v.abilityId.slice(0, 40) : undefined,
        characterId:
          typeof v.characterId === 'string'
            ? resolveValidCharacterId(v.characterId)
            : player.characterId,
        skinId:
          v.skinId === null
            ? null
            : typeof v.skinId === 'string' && ALL_VALID_SKIN_IDS.has(v.skinId)
              ? v.skinId
              : player.skinId,
        stage: typeof v.stage === 'string' ? v.stage.slice(0, 32) : undefined,
        hand:
          v.hand === 'left' || v.hand === 'right' || v.hand === 'both'
            ? v.hand
            : undefined,
        targetPlayerId:
          typeof v.targetPlayerId === 'string' ? v.targetPlayerId.slice(0, 64) : undefined,
        castName: typeof v.castName === 'string' ? v.castName.slice(0, 40) : undefined,
        castDuration:
          typeof v.castDuration === 'number' && Number.isFinite(v.castDuration)
            ? clampFinite(v.castDuration, 0.05, 5.0, 0.35)
            : undefined,
        duration:
          typeof v.duration === 'number' && Number.isFinite(v.duration)
            ? clampFinite(v.duration, 0.05, 16.0, 1.0)
            : undefined,
        scale:
          typeof v.scale === 'number' && Number.isFinite(v.scale)
            ? clampFinite(v.scale, 0.2, 5.0, 1.0)
            : undefined,
        originX: clampFinite(v.originX, -WORLD_POS_BOUND, WORLD_POS_BOUND, player.x),
        originY: clampFinite(v.originY, -20, 180, player.y),
        originZ: clampFinite(v.originZ, -WORLD_POS_BOUND, WORLD_POS_BOUND, player.z),
        targetX:
          typeof v.targetX === 'number' && Number.isFinite(v.targetX)
            ? clampFinite(v.targetX, -WORLD_POS_BOUND, WORLD_POS_BOUND, player.x)
            : undefined,
        targetY:
          typeof v.targetY === 'number' && Number.isFinite(v.targetY)
            ? clampFinite(v.targetY, -20, 180, player.y)
            : undefined,
        targetZ:
          typeof v.targetZ === 'number' && Number.isFinite(v.targetZ)
            ? clampFinite(v.targetZ, -WORLD_POS_BOUND, WORLD_POS_BOUND, player.z)
            : undefined,
        colorHex:
          typeof v.colorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.colorHex)
            ? v.colorHex
            : undefined,
        radius:
          typeof v.radius === 'number' && Number.isFinite(v.radius)
            ? clampFinite(v.radius, 0.4, 28, 3.5)
            : undefined,
      };
      socket.to(room.code).emit('player:abilityVfx', packet);
    });

    socket.on('combat:hit', (rawHit: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      const attacker = room.players.get(playerId);
      if (!attacker || !attacker.alive || attacker.inSelector) return;

      const now = Date.now();
      if (!checkSocketActionRate(`hit:${socket.id}`, 120, 1000)) return;
      if (!rawHit || typeof rawHit !== 'object' || Array.isArray(rawHit)) return;
      const hit = rawHit as Partial<CombatHitRequest>;

      if (typeof hit.targetPlayerId !== 'string' || hit.targetPlayerId === playerId) {
        return;
      }
      const target = room.players.get(hit.targetPlayerId);
      if (!target || !target.alive || target.inSelector || now < target.spawnProtectedUntilMs) return;
      const lastTargetHit = attacker.lastHitByTarget.get(target.playerId) ?? 0;
      if (now - lastTargetHit < 20) return;

      const numericCheck = [hit.damage, hit.hitDirX, hit.hitDirY, hit.hitDirZ];
      for (const val of numericCheck) {
        if (typeof val !== 'number' || !Number.isFinite(val)) return;
      }

      const rawDamage = clampFinite(hit.damage, 0, 110, 0);
      const ragdollSec = clampFinite(hit.ragdollSec, 0, 4.5, 0);
      const knockX = clampFinite(hit.knockX, -28, 28, 0);
      const knockY = clampFinite(hit.knockY, -28, 28, 0);
      const knockZ = clampFinite(hit.knockZ, -28, 28, 0);
      const burnSec = clampFinite(hit.burnSec, 0, 6, 0);
      const burnDps = clampFinite(hit.burnDps, 0, 15, 0);
      const paralyzeSec = clampFinite(hit.paralyzeSec, 0, 4.5, 0);
      const headacheSec = clampFinite(hit.headacheSec, 0, 4.0, 0);
      const pushOnly = Boolean(hit.pushOnly);
      const isBeam = Boolean(hit.isBeam);

      if (
        rawDamage <= 0 &&
        ragdollSec <= 0 &&
        paralyzeSec <= 0 &&
        headacheSec <= 0 &&
        Math.hypot(knockX, knockY, knockZ) <= 0.05
      ) {
        return;
      }

      attacker.lastCombatHitAtMs = now;
      attacker.lastHitByTarget.set(target.playerId, now);
      target.lastAttackerId = attacker.playerId;
      target.lastAttackedAtMs = now;

      let serverAppliedDamage = 0;
      if (!pushOnly && rawDamage > 0) {
        const res = applyServerDamage(
          io,
          room,
          target,
          rawDamage,
          attacker,
          isBeam,
          now,
        );
        serverAppliedDamage = res.appliedHpDamage;
      }

      const dirLen = Math.hypot(hit.hitDirX!, hit.hitDirY!, hit.hitDirZ!) || 1;
      const effect: CombatEffectEvent = {
        attackerPlayerId: attacker.playerId,
        targetPlayerId: target.playerId,
        damage: Math.round(rawDamage * 10) / 10,
        serverAppliedDamage: Math.round(serverAppliedDamage * 10) / 10,
        remainingHp: Math.round(target.hp * 10) / 10,
        hitDirX: hit.hitDirX! / dirLen,
        hitDirY: hit.hitDirY! / dirLen,
        hitDirZ: hit.hitDirZ! / dirLen,
        ragdollSec,
        knockX,
        knockY,
        knockZ,
        kind:
          hit.kind === 'weapon' ||
          hit.kind === 'punch' ||
          hit.kind === 'pistol' ||
          hit.kind === 'ai-ability'
            ? hit.kind
            : 'ai-ability',
        isBeam,
        burnSec,
        burnDps,
        paralyzeSec,
        headacheSec,
        pushOnly,
      };

      io.to(target.socketId).emit('combat:effect', effect);
    });

    socket.on('combat:heal', (rawHeal: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.get(playerId);
      if (!room || !player || !player.alive) return;
      const now = Date.now();
      if (now - player.lastHealAtMs < 60) return;
      if (!rawHeal || typeof rawHeal !== 'object' || Array.isArray(rawHeal)) return;
      const req = rawHeal as Partial<CombatHealRequest>;
      const target =
        typeof req.targetPlayerId === 'string' && req.targetPlayerId !== playerId
          ? room.players.get(req.targetPlayerId)
          : player;
      if (!target || !target.alive) return;
      const amount = clampFinite(req.amount, 0, target.maxHp, 0);
      if (amount <= 0) return;
      player.lastHealAtMs = now;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      target.lastMotion = { ...target.lastMotion, hp: target.hp };
      io.to(room.code).emit('combat:vitals', buildVitalsEvent(target, now));
    });

    socket.on('combat:npcDamage', (rawDmg: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.get(playerId);
      if (!room || !player || !player.alive) return;
      if (!rawDmg || typeof rawDmg !== 'object' || Array.isArray(rawDmg)) return;
      const req = rawDmg as Partial<CombatNpcDamageRequest>;
      const amount = clampFinite(req.damage, 0, 110, 0);
      if (amount <= 0) return;
      applyServerDamage(io, room, player, amount, null, Boolean(req.isBeam), Date.now());
    });

    socket.on('combat:cc', (rawCc: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const caster = room?.players.get(playerId);
      if (!room || !caster) return;
      if (!rawCc || typeof rawCc !== 'object' || Array.isArray(rawCc)) return;
      const cc = rawCc as Partial<CombatCrowdControlPacket>;
      if (
        typeof cc.targetPlayerId !== 'string' ||
        cc.targetPlayerId === playerId ||
        typeof cc.kind !== 'string' ||
        !VALID_CC_KINDS.has(cc.kind)
      ) {
        return;
      }
      const target = room.players.get(cc.targetPlayerId);
      if (!target) return;
      const now = Date.now();
      const active = Boolean(cc.active) && cc.kind !== 'clear';
      if (
        active &&
        (!caster.alive ||
          caster.inSelector ||
          !target.alive ||
          target.inSelector ||
          now < target.spawnProtectedUntilMs)
      ) {
        return;
      }

      const durationMs =
        typeof cc.durationMs === 'number' && Number.isFinite(cc.durationMs)
          ? clampFinite(cc.durationMs, 0, 10_000, 3000)
          : undefined;

      const packet: CombatCrowdControlPacket = {
        attackerPlayerId: caster.playerId,
        targetPlayerId: target.playerId,
        kind: cc.kind as CombatCrowdControlKind,
        active,
        durationMs,
        x:
          typeof cc.x === 'number' && Number.isFinite(cc.x)
            ? clampFinite(cc.x, -WORLD_POS_BOUND, WORLD_POS_BOUND, target.x)
            : undefined,
        y:
          typeof cc.y === 'number' && Number.isFinite(cc.y)
            ? clampFinite(cc.y, -20, 180, target.y)
            : undefined,
        z:
          typeof cc.z === 'number' && Number.isFinite(cc.z)
            ? clampFinite(cc.z, -WORLD_POS_BOUND, WORLD_POS_BOUND, target.z)
            : undefined,
        yaw:
          typeof cc.yaw === 'number' && Number.isFinite(cc.yaw)
            ? wrapYawRadians(cc.yaw)
            : undefined,
        pose:
          cc.pose === 'kneel' || cc.pose === 'hang' || cc.pose === 'grabbed'
            ? cc.pose
            : undefined,
        forcefieldMode:
          cc.forcefieldMode === 'locked' ||
          cc.forcefieldMode === 'protection' ||
          cc.forcefieldMode === 'suffocation' ||
          cc.forcefieldMode === 'none'
            ? cc.forcefieldMode
            : undefined,
        seq:
          typeof cc.seq === 'number' && Number.isFinite(cc.seq) ? cc.seq : undefined,
        serverTimeMs: now,
      };

      const ccKey = `${target.playerId}:${cc.kind}`;
      if (active) {
        const defaultExpiry = cc.kind === 'external-pose' ? 2800 : 5500;
        caster.activeCcEntries.set(ccKey, {
          expiresAtMs: now + Math.max(400, durationMs ?? defaultExpiry),
          packet,
        });
      } else if (cc.kind === 'clear') {
        for (const key of Array.from(caster.activeCcEntries.keys())) {
          if (key.startsWith(`${target.playerId}:`)) {
            caster.activeCcEntries.delete(key);
          }
        }
      } else {
        caster.activeCcEntries.delete(ccKey);
        if (cc.kind === 'external-control') {
          caster.activeCcEntries.delete(`${target.playerId}:external-pose`);
        }
      }

      io.to(room.code).emit('combat:cc', packet);
    });

    socket.on('vampire:absorb', (rawReq: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const vampire = room?.players.get(playerId);
      if (!room || !vampire || vampire.characterId !== 'vampire') return;
      if (!rawReq || typeof rawReq !== 'object' || Array.isArray(rawReq)) return;
      const req = rawReq as Partial<VampireAbsorbRequest>;
      if (typeof req.targetPlayerId !== 'string' || req.targetPlayerId === playerId) {
        return;
      }
      const target = room.players.get(req.targetPlayerId);
      if (!target) return;
      const now = Date.now();

      if (req.phase === 'start') {
        if (!vampire.alive || !target.alive || now < target.spawnProtectedUntilMs) return;
        const dist = Math.hypot(
          target.x - vampire.x,
          target.y - vampire.y,
          target.z - vampire.z,
        );
        if (dist > 10.5) return;
        vampire.pendingAbsorbTargetId = target.playerId;
        const evt: VampireAbsorbEvent = {
          vampirePlayerId: vampire.playerId,
          targetPlayerId: target.playerId,
          phase: 'start',
          stolenAbilityId: null,
          sourceCharacterId: target.characterId,
          sourceSkinId: target.skinId,
          stolenDurationMs: VAMPIRE_STOLEN_DURATION_MS,
          targetX:
            typeof req.targetX === 'number' && Number.isFinite(req.targetX)
              ? clampFinite(req.targetX, -WORLD_POS_BOUND, WORLD_POS_BOUND, target.x)
              : target.x,
          targetY:
            typeof req.targetY === 'number' && Number.isFinite(req.targetY)
              ? clampFinite(req.targetY, -20, 180, target.y)
              : target.y,
          targetZ:
            typeof req.targetZ === 'number' && Number.isFinite(req.targetZ)
              ? clampFinite(req.targetZ, -WORLD_POS_BOUND, WORLD_POS_BOUND, target.z)
              : target.z,
          targetYaw:
            typeof req.targetYaw === 'number' && Number.isFinite(req.targetYaw)
              ? wrapYawRadians(req.targetYaw)
              : target.yaw,
          serverTimeMs: now,
        };
        io.to(room.code).emit('vampire:absorb', evt);
        return;
      }

      if (req.phase === 'cancel') {
        vampire.pendingAbsorbTargetId = null;
        const evt: VampireAbsorbEvent = {
          vampirePlayerId: vampire.playerId,
          targetPlayerId: target.playerId,
          phase: 'cancel',
          stolenAbilityId: null,
          sourceCharacterId: target.characterId,
          sourceSkinId: target.skinId,
          stolenDurationMs: 0,
          serverTimeMs: now,
        };
        io.to(room.code).emit('vampire:absorb', evt);
        return;
      }

      if (req.phase === 'complete') {
        if (!vampire.alive) return;
        vampire.pendingAbsorbTargetId = null;
        const activeIds = getActiveStolenAbilityIds(vampire, now);
        let pickedAbilityId: string | null = null;
        if (activeIds.length < VAMPIRE_MAX_STOLEN_ABILITIES) {
          const ownedSet = new Set(activeIds);
          const pool = getServerStealablePool(target.characterId, target.skinId).filter(
            (id) => !ownedSet.has(id),
          );
          if (pool.length > 0) {
            pickedAbilityId = pool[crypto.randomInt(0, pool.length)] ?? null;
            if (pickedAbilityId) {
              vampire.stolenAbilities.push({
                id: pickedAbilityId,
                expiresAtMs: now + VAMPIRE_STOLEN_DURATION_MS,
              });
            }
          }
        }
        const nextActiveIds = getActiveStolenAbilityIds(vampire, now);
        vampire.lastMotion = {
          ...vampire.lastMotion,
          stolenAbilityId: nextActiveIds[0] ?? null,
          stolenAbilityIds: nextActiveIds,
        };

        // Heal Rogue +15 HP authoritatively
        vampire.hp = Math.min(vampire.maxHp, vampire.hp + 15);
        vampire.lastMotion.hp = vampire.hp;
        io.to(room.code).emit('combat:vitals', buildVitalsEvent(vampire, now));

        const evt: VampireAbsorbEvent = {
          vampirePlayerId: vampire.playerId,
          targetPlayerId: target.playerId,
          phase: 'complete',
          stolenAbilityId: pickedAbilityId,
          sourceCharacterId: target.characterId,
          sourceSkinId: target.skinId,
          stolenDurationMs: VAMPIRE_STOLEN_DURATION_MS,
          serverTimeMs: now,
        };
        io.to(room.code).emit('vampire:absorb', evt);
        io.to(room.code).emit('room:update', buildRoomSnapshot(room));
      }
    });

    socket.on('vampire:removeStolen', (rawReq: unknown) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      const player = room?.players.get(playerId);
      if (!room || !player || player.characterId !== 'vampire') return;
      if (!rawReq || typeof rawReq !== 'object' || Array.isArray(rawReq)) return;
      const abilityId =
        typeof (rawReq as { abilityId?: unknown }).abilityId === 'string'
          ? (rawReq as { abilityId: string }).abilityId.trim()
          : '';
      if (!abilityId) return;

      const beforeLen = player.stolenAbilities.length;
      player.stolenAbilities = player.stolenAbilities.filter((entry) => entry.id !== abilityId);
      if (player.stolenAbilities.length === beforeLen) return;

      const now = Date.now();
      const nextActiveIds = getActiveStolenAbilityIds(player, now);
      player.lastMotion = {
        ...player.lastMotion,
        stolenAbilityId: nextActiveIds[0] ?? null,
        stolenAbilityIds: nextActiveIds,
      };
      io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
      io.to(room.code).emit('room:update', buildRoomSnapshot(room));
    });

    socket.on('combat:death', () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      const victim = room.players.get(playerId);
      if (!victim) return;

      const wasAlive = victim.alive;
      victim.alive = false;
      victim.hp = 0;
      victim.shieldKind = null;
      victim.shieldRemaining = 0;
      clearPlayerStolenAbilities(victim);
      victim.pendingAbsorbTargetId = null;
      victim.lastMotion = {
        ...victim.lastMotion,
        dead: true,
        hp: 0,
        ragdoll: true,
        shieldKind: null,
        stolenAbilityId: null,
        stolenAbilityIds: [],
      };
      clearCasterCrowdControls(io, room, victim);
      clearTargetCrowdControls(io, room, victim.playerId);
      clearVampireAbsorbForPlayer(io, room, victim.playerId);

      const now = Date.now();
      if (
        wasAlive &&
        victim.lastAttackerId &&
        now - victim.lastAttackedAtMs <= 8000
      ) {
        const killer = room.players.get(victim.lastAttackerId);
        if (killer && killer.playerId !== victim.playerId) {
          killer.kills += 1;
          if (killer.alive && killer.hp < killer.maxHp) {
            killer.hp = Math.min(killer.maxHp, killer.hp + 60);
            killer.lastMotion = { ...killer.lastMotion, hp: killer.hp };
            io.to(room.code).emit('combat:vitals', buildVitalsEvent(killer, now));
          }
          io.to(killer.socketId).emit('combat:elimination', {
            victimPlayerId: victim.playerId,
            victimName: victim.name,
            rewardCoins: 25,
          });
        }
      }
      victim.lastAttackerId = null;

      io.to(room.code).emit('combat:vitals', buildVitalsEvent(victim, now));
      io.to(room.code).emit('room:update', buildRoomSnapshot(room));
    });

    socket.on('combat:respawn', () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;
      const room = rooms.get(roomCode);
      if (!room) return;
      const player = room.players.get(playerId);
      if (!player) return;

      const now = Date.now();
      clearCasterCrowdControls(io, room, player);
      clearTargetCrowdControls(io, room, player.playerId);
      clearVampireAbsorbForPlayer(io, room, player.playerId);

      player.inSelector = false;
      player.alive = true;
      player.hp = player.maxHp;
      player.spawnProtected = true;
      player.spawnProtectedUntilMs = now + SPAWN_PROTECTION_MS;
      player.invulnerable = false;
      player.shieldKind = null;
      player.shieldRemaining = 0;
      player.shieldExpiresAtMs = 0;
      player.silverAbsorbEnergy = 0;
      clearPlayerStolenAbilities(player);
      player.pendingAbsorbTargetId = null;
      player.lastSeq = 0;
      player.serverSeq += 1;
      player.lastAttackerId = null;
      player.lastMotion = {
        ...player.lastMotion,
        dead: false,
        hp: player.maxHp,
        ragdoll: false,
        inSelector: false,
        spawnProtected: true,
        shieldKind: null,
        stolenAbilityId: null,
        stolenAbilityIds: [],
        seq: player.serverSeq,
      };
      socket.to(room.code).emit('player:state', {
        ...player.lastMotion,
        justJumped: false,
        landImpactSpeed: 0,
        playerId: player.playerId,
        serverTimeMs: now,
      });
      io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
      io.to(room.code).emit('room:update', buildRoomSnapshot(room));
    });

    socket.on('disconnect', (reason) => {
      socketActionWindows.delete(socket.id);
      socketActionWindows.delete(`vfx:${socket.id}`);
      socketActionWindows.delete(`hit:${socket.id}`);

      const roomCode = socket.data.roomCode as string | undefined;
      const playerId = socket.data.playerId as string | undefined;
      if (!roomCode || !playerId) return;

      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;

      if (
        reason === 'client namespace disconnect' ||
        reason === 'server namespace disconnect'
      ) {
        removePlayerFromRoomById(io, roomCode, playerId);
        return;
      }

      const room = rooms.get(roomCode);
      const player = room?.players.get(playerId);
      if (!room || !player) return;

      clearCasterCrowdControls(io, room, player);
      clearTargetCrowdControls(io, room, playerId);
      clearVampireAbsorbForPlayer(io, room, playerId);

      if (player.disconnectGraceTimer) {
        clearTimeout(player.disconnectGraceTimer);
      }
      const disconnectedSocketId = socket.id;
      player.disconnectGraceTimer = setTimeout(() => {
        const currentRoom = rooms.get(roomCode);
        const currentPlayer = currentRoom?.players.get(playerId);
        if (currentRoom && currentPlayer && currentPlayer.socketId === disconnectedSocketId) {
          removePlayerFromRoomById(io, roomCode, playerId);
        }
      }, 25_000);
    });
  });

  const maintenanceInterval = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      for (const player of room.players.values()) {
        if (player.activeCcEntries.size > 0) {
          for (const [key, entry] of Array.from(player.activeCcEntries.entries())) {
            if (now >= entry.expiresAtMs) {
              player.activeCcEntries.delete(key);
              io.to(room.code).emit('combat:cc', {
                attackerPlayerId: player.playerId,
                targetPlayerId: entry.packet.targetPlayerId,
                kind: entry.packet.kind,
                active: false,
                forcefieldMode:
                  entry.packet.kind === 'forcefield' ? 'none' : undefined,
                serverTimeMs: now,
              } satisfies CombatCrowdControlPacket);
            }
          }
        }

        if (
          player.shieldKind &&
          player.shieldExpiresAtMs > 0 &&
          now >= player.shieldExpiresAtMs
        ) {
          player.shieldKind = null;
          player.shieldRemaining = 0;
          player.shieldExpiresAtMs = 0;
          player.lastMotion = { ...player.lastMotion, shieldKind: null };
          io.to(room.code).emit('combat:vitals', buildVitalsEvent(player, now));
        }

        if (player.stolenAbilities.length > 0) {
          const prevLen = player.stolenAbilities.length;
          const activeIds = getActiveStolenAbilityIds(player, now);
          if (activeIds.length !== prevLen) {
            player.lastMotion = {
              ...player.lastMotion,
              stolenAbilityId: activeIds[0] ?? null,
              stolenAbilityIds: activeIds,
            };
          }
        }
      }
    }

    for (const [key, entry] of Array.from(socketActionWindows.entries())) {
      if (now - entry.windowStartMs > 30_000) {
        socketActionWindows.delete(key);
      }
    }
  }, 500);

  httpServer.once('close', () => {
    clearInterval(maintenanceInterval);
  });

  return io;
}

async function startServer(): Promise<void> {
  const app = express();
  let io: SocketIOServer | null = null;
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const allowed = parseAllowedOrigins();
    const requestOrigin = req.header('origin')?.replace(/\/+$/, '');
    if (allowed === true) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
    } else if (requestOrigin && allowed.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-id');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const healthHandler = (_req: Request, res: Response) => {
    res.json({
      ok: true,
      serverTimeMs: Date.now(),
      activeRooms: rooms.size,
    });
  };
  app.get('/api/health', healthHandler);
  app.get('/healthz', healthHandler);

  app.get('/api/servers', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      servers: buildServerList(),
      serverTimeMs: Date.now(),
    });
  });

  app.get('/api/tts/character', async (req: Request, res: Response) => {
    const rawName = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!rawName || !CHARACTER_NAME_PATTERN.test(rawName)) {
      res.status(400).json({ ok: false, error: 'Invalid character name' });
      return;
    }
    const wav = await synthesizeCharacterNameWav(rawName);
    if (!wav) {
      res.status(204).end();
      return;
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(wav);
  });

  app.get('/api/session/restore', (req: Request, res: Response) => {
    const sessionId = resolveSessionId(req);
    const record = getOrCreateSession(sessionId);
    res.json({
      ok: true,
      sessionId: record.sessionId,
      state: record.state,
      serverTimeMs: Date.now(),
    });
  });

  app.post('/api/session/validate', (req: Request, res: Response) => {
    const sessionId = resolveSessionId(req);
    const record = getOrCreateSession(sessionId);
    record.state = validateAndMergeState(record.state, req.body);
    record.lastTouchedMs = Date.now();
    res.json({
      ok: true,
      sessionId: record.sessionId,
      state: record.state,
      serverTimeMs: Date.now(),
    });
  });

  app.use('/api/room/leave', express.text({ type: 'text/plain', limit: '4kb' }));
  app.post('/api/room/leave', (req: Request, res: Response) => {
    let payload: { code?: unknown; playerId?: unknown; reconnectToken?: unknown } = {};
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') payload = parsed;
      } catch {
        res.status(400).json({ ok: false });
        return;
      }
    } else if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      payload = req.body as Record<string, unknown>;
    }

    const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
    const playerId = typeof payload.playerId === 'string' ? payload.playerId.trim() : '';
    const reconnectToken =
      typeof payload.reconnectToken === 'string' ? payload.reconnectToken.trim() : '';

    if (io && ROOM_CODE_REGEX.test(code) && playerId && reconnectToken) {
      const room = rooms.get(code);
      const player = room?.players.get(playerId);
      if (room && player && player.reconnectToken === reconnectToken) {
        const sock = io.sockets.sockets.get(player.socketId);
        if (sock) {
          sock.data.roomCode = undefined;
          sock.data.playerId = undefined;
          void sock.leave(code);
        }
        removePlayerFromRoomById(io, code, playerId);
      }
    }
    res.json({ ok: true });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  if (!IS_PROD) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR, { index: false }));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      const indexPath = path.resolve(DIST_DIR, 'index.html');
      if (!indexPath.startsWith(DIST_DIR + path.sep) || !fs.existsSync(indexPath)) {
        if (req.path === '/') {
          res.json({
            ok: true,
            service: 'multiplayer-server',
            activeRooms: rooms.size,
          });
          return;
        }
        next();
        return;
      }
      res.sendFile(indexPath);
    });
  }

  const httpServer = http.createServer(app);
  io = attachMultiplayerSocketServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
