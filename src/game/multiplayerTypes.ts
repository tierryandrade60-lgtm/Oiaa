import type { MapId } from './maps';

export const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;
export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 8;

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type RemoteShieldKind =
  | 'auto-shield'
  | 'agatha-auto-shield'
  | 'diamond-form'
  | 'mystic-shield'
  | 'forcefield-shield'
  | 'shield-defense'
  | 'agatha-shield'
  | 'magneto-shield'
  | 'silver-absorb'
  | null;

export interface PlayerPublicInfo {
  playerId: string;
  name: string;
  characterId: string;
  skinId: string | null;
  isOwner: boolean;
  kills: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  inSelector?: boolean;
  stolenAbilityId?: string | null;
  stolenAbilityIds?: string[];
}

export interface RoomSnapshot {
  roomId: string;
  code: string;
  mapId: MapId;
  maxPlayers: number;
  isPrivate: boolean;
  ownerPlayerId: string;
  npcsRemoved: boolean;
  players: PlayerPublicInfo[];
}

export interface ServerSummary {
  roomId: string;
  ownerName: string;
  playerCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  mapId: MapId;
  createdAtMs: number;
}

export interface PlayerMotionPacket {
  characterId: string;
  skinId: string | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  localForward: number;
  localRight: number;
  turnVelocity?: number;
  grounded: boolean;
  justJumped?: boolean;
  landImpactSpeed?: number;
  sprinting: boolean;
  flying: boolean;
  superSpeed: boolean;
  hp: number;
  maxHp: number;
  dead: boolean;
  ragdoll: boolean;
  inSelector?: boolean;
  spawnProtected: boolean;
  invulnerable?: boolean;
  shieldKind: RemoteShieldKind;
  invisible: boolean;
  darkholdOpen: boolean;
  crownMode: boolean;
  wingsVisible: boolean;
  swordHeld: boolean;
  ritualPhase: string;
  sustainedFlags: number;
  stolenAbilityId?: string | null;
  stolenAbilityIds?: string[];
  targetId?: string | null;
  seq: number;
  clientTimeMs: number;
}

export type SustainedFlagMask = {
  painChannel: number;
  telepathicWave: number;
  metalTornado: number;
  rapidPunch: number;
  headGrip: number;
  mindLaser: number;
  agathaAbsorb: number;
  supremeDrain: number;
  zombieBeam: number;
  vampireAbsorb: number;
  capShieldCharge: number;
  silverAbsorb: number;
  silverDualBeam: number;
  stormTornado: number;
  stormWindBlast: number;
};

export const SUSTAINED_FLAGS: SustainedFlagMask = {
  painChannel: 1 << 0,
  telepathicWave: 1 << 1,
  metalTornado: 1 << 2,
  rapidPunch: 1 << 3,
  headGrip: 1 << 4,
  mindLaser: 1 << 5,
  agathaAbsorb: 1 << 6,
  supremeDrain: 1 << 7,
  zombieBeam: 1 << 8,
  vampireAbsorb: 1 << 9,
  capShieldCharge: 1 << 10,
  silverAbsorb: 1 << 11,
  silverDualBeam: 1 << 12,
  stormTornado: 1 << 13,
  stormWindBlast: 1 << 14,
};

export type AbilityVfxKind =
  | 'cast'
  | 'bolt'
  | 'explosion'
  | 'shockwave'
  | 'teleport'
  | 'lightning'
  | 'respawn'
  | 'death'
  | 'projectile'
  | 'beam'
  | 'tornado'
  | 'meteor'
  | 'slash'
  | 'shield'
  | 'aura'
  | 'slam'
  | 'ritual'
  | 'grab'
  | 'clones'
  | 'stomp'
  | 'freeze'
  | 'disc'
  | 'spear'
  | 'wind'
  | 'vampire-absorb'
  | 'dash';

export interface AbilityVfxPacket {
  playerId?: string;
  kind: AbilityVfxKind;
  abilityId?: string;
  characterId?: string;
  skinId?: string | null;
  stage?: string;
  hand?: 'left' | 'right' | 'both';
  targetPlayerId?: string;
  castName?: string;
  castDuration?: number;
  duration?: number;
  scale?: number;
  originX: number;
  originY: number;
  originZ: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  colorHex?: string;
  radius?: number;
}

export interface CombatHitRequest {
  targetPlayerId: string;
  damage: number;
  hitDirX: number;
  hitDirY: number;
  hitDirZ: number;
  ragdollSec?: number;
  knockX?: number;
  knockY?: number;
  knockZ?: number;
  kind?: 'weapon' | 'punch' | 'pistol' | 'ai-ability';
  isBeam?: boolean;
  burnSec?: number;
  burnDps?: number;
  paralyzeSec?: number;
  headacheSec?: number;
  pushOnly?: boolean;
}

export interface CombatEffectEvent {
  attackerPlayerId: string;
  targetPlayerId: string;
  damage: number;
  serverAppliedDamage?: number;
  remainingHp?: number;
  hitDirX: number;
  hitDirY: number;
  hitDirZ: number;
  ragdollSec: number;
  knockX: number;
  knockY: number;
  knockZ: number;
  kind: 'weapon' | 'punch' | 'pistol' | 'ai-ability';
  isBeam: boolean;
  burnSec: number;
  burnDps: number;
  paralyzeSec: number;
  headacheSec: number;
  pushOnly: boolean;
}

export interface CombatVitalsEvent {
  playerId: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  spawnProtected: boolean;
  shieldKind: RemoteShieldKind;
  shieldRemaining: number;
  silverAbsorbEnergy?: number;
  lastAttackerId?: string | null;
  serverTimeMs: number;
}

export type CombatCrowdControlKind =
  | 'external-control'
  | 'external-pose'
  | 'paralyze'
  | 'mind-control-paralyze'
  | 'pain'
  | 'clones'
  | 'forcefield'
  | 'clear';

export interface CombatCrowdControlPacket {
  attackerPlayerId?: string;
  targetPlayerId: string;
  kind: CombatCrowdControlKind;
  active: boolean;
  durationMs?: number;
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pose?: 'kneel' | 'hang' | 'grabbed';
  forcefieldMode?: 'locked' | 'protection' | 'suffocation' | 'none';
  forcefieldShieldHp?: number;
  seq?: number;
  serverTimeMs?: number;
}

export interface CombatHealRequest {
  amount: number;
  source?: string;
  targetPlayerId?: string;
}

export interface CombatNpcDamageRequest {
  damage: number;
  knockX?: number;
  knockY?: number;
  knockZ?: number;
  ragdollSec?: number;
  paralyzeSec?: number;
  burnSec?: number;
  burnDps?: number;
  isBeam?: boolean;
  source?: string;
}

export interface VampireAbsorbRequest {
  targetPlayerId: string;
  phase: 'start' | 'complete' | 'cancel';
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  targetYaw?: number;
}

export interface VampireAbsorbEvent {
  vampirePlayerId: string;
  targetPlayerId: string;
  phase: 'start' | 'complete' | 'cancel';
  stolenAbilityId: string | null;
  sourceCharacterId: string;
  sourceSkinId: string | null;
  stolenDurationMs: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  targetYaw?: number;
  serverTimeMs: number;
}

export interface RemotePlayerStateUpdate extends PlayerMotionPacket {
  playerId: string;
  serverTimeMs: number;
}

export type RoomAckResult =
  | {
      ok: true;
      playerId: string;
      reconnectToken: string;
      room: RoomSnapshot;
    }
  | {
      ok: false;
      code:
        | 'INVALID_CODE'
        | 'INVALID_NAME'
        | 'ROOM_NOT_FOUND'
        | 'ROOM_FULL'
        | 'RATE_LIMITED'
        | 'UNAUTHORIZED'
        | 'SERVER_ERROR';
      message: string;
    };

export type GenericAckResult =
  | { ok: true }
  | { ok: false; code: string; message: string };
