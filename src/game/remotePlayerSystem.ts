import * as THREE from 'three';
import { AgathaVfxSystem } from './agathaAbilities';
import { CaptainAmericaVfxSystem } from './captainAmericaAbilities';
import { CharacterAnimator, CharacterMotionState } from './characterAnimator';
import { CharacterAppearance, CharacterArchetype, CharacterSkinId, PhoenixSkinVariant } from './characterConfig';
import { getCharacterById, resolveCharacterWithSkin } from './characters';
import { DoctorStrangeVfxSystem } from './doctorStrangeAbilities';
import { EmmaFrostVfxSystem } from './emmaFrostAbilities';
import { HelaVfxSystem } from './helaAbilities';
import { InvisibleWomanVfxSystem } from './invisibleWomanAbilities';
import { LandingDustSystem } from './landingDust';
import { MagnetoVfxSystem } from './magnetoAbilities';
import {
  AbilityVfxPacket,
  CombatCrowdControlPacket,
  CombatHealRequest,
  CombatHitRequest,
  CombatVitalsEvent,
  PlayerPublicInfo,
  RemotePlayerStateUpdate,
  RemoteShieldKind,
  SUSTAINED_FLAGS,
  VampireAbsorbEvent,
} from './multiplayerTypes';
import { NpcHudSnapshot } from './npcSystem';
import {
  HandFireAura,
  PhoenixVfxSystem,
  PhoenixWings,
} from './phoenixAbilities';
import { createContactShadowTexture } from './pixelTextures';
import { QuicksilverVfxSystem } from './quicksilverAbilities';
import { createR16Character, R16Rig } from './r16Character';
import { R16Ragdoll } from './ragdoll';
import { RockBreakVfxSystem } from './rockBreakVfx';
import {
  ChaosDrainBeamVfx,
  CombatTargetProbe,
  DarkholdBookVfx,
  HandChaosAura,
  ScarletShieldVfx,
  ScarletWitchVfxSystem,
  StoneChaosExplosionVfx,
  SupremeRitualVfx,
} from './scarletWitchAbilities';
import { ShieldHitVfxSystem } from './shieldHitVfx';
import { SilverSurferVfxSystem } from './silverSurferAbilities';
import { BlueOrbTransitionVfx } from './spawnEffectVfx';
import { StormVfxSystem } from './stormAbilities';
import { ThorVfxSystem } from './thorAbilities';
import { VampireVfxSystem } from './vampireAbilities';
import { VisionVfxSystem } from './visionAbilities';

export const REMOTE_PLAYER_ID_PREFIX = 'rp:';

export function toRemoteTargetId(playerId: string): string {
  return `${REMOTE_PLAYER_ID_PREFIX}${playerId}`;
}

export function fromRemoteTargetId(targetId: string): string | null {
  return targetId.startsWith(REMOTE_PLAYER_ID_PREFIX)
    ? targetId.slice(REMOTE_PLAYER_ID_PREFIX.length)
    : null;
}

const SHIELD_HEX_COLORS: Record<Exclude<RemoteShieldKind, null>, string> = {
  'auto-shield': '#FF2956',
  'agatha-auto-shield': '#B94EFF',
  'diamond-form': '#D8F5FF',
  'mystic-shield': '#F59E0B',
  'forcefield-shield': '#38BDF8',
  'shield-defense': '#38BDF8',
  'agatha-shield': '#9333EA',
  'magneto-shield': '#D946EF',
  'silver-absorb': '#E0F2FE',
};

const EMPTY_PROBES: ReadonlyArray<CombatTargetProbe> = [];
const NOOP = (): void => {};
const NEUTRAL_DECOY_MOTION: CharacterMotionState = {
  localForward: 0,
  localRight: 0,
  verticalVelocity: 0,
  turnVelocity: 0,
  grounded: true,
  justJumped: false,
  landImpactSpeed: 0,
  flying: false,
  sprinting: false,
  superSpeed: false,
};

function resolvePhoenixVariant(skinId: string | null): PhoenixSkinVariant {
  if (skinId === 'dark-phoenix') return 'dark-phoenix';
  if (skinId === 'white-phoenix') return 'white-phoenix';
  return 'phoenix';
}

interface BufferedSample {
  tMs: number;
  state: RemotePlayerStateUpdate;
}

interface RemoteVfxBank {
  scarlet?: ScarletWitchVfxSystem;
  scarletVariant?: 'default' | 'crimson-dark';
  handChaosLeft?: HandChaosAura;
  handChaosRight?: HandChaosAura;
  darkholdCrimson?: DarkholdBookVfx;
  darkholdPurple?: DarkholdBookVfx;
  scarletShield?: ScarletShieldVfx;
  agathaAutoShield?: ScarletShieldVfx;
  chaosDrain?: ChaosDrainBeamVfx;
  chaosDrainDark?: boolean;
  stoneChaos?: StoneChaosExplosionVfx;
  supremeRitual?: SupremeRitualVfx;
  agatha?: AgathaVfxSystem;
  phoenix?: PhoenixVfxSystem;
  phoenixVariant?: PhoenixSkinVariant;
  phoenixWings?: PhoenixWings;
  phoenixHandLeft?: HandFireAura;
  phoenixHandRight?: HandFireAura;
  emma?: EmmaFrostVfxSystem;
  astralDecoy?: { group: THREE.Group; rig: R16Rig; animator: CharacterAnimator };
  hela?: HelaVfxSystem;
  magneto?: MagnetoVfxSystem;
  quicksilver?: QuicksilverVfxSystem;
  strange?: DoctorStrangeVfxSystem;
  vision?: VisionVfxSystem;
  invisible?: InvisibleWomanVfxSystem;
  vampire?: VampireVfxSystem;
  cap?: CaptainAmericaVfxSystem;
  thor?: ThorVfxSystem;
  silver?: SilverSurferVfxSystem;
  storm?: StormVfxSystem;
  shieldHit?: ShieldHitVfxSystem;
  blueOrb?: BlueOrbTransitionVfx;
}

interface RemotePlayerActor {
  playerId: string;
  targetId: string;
  name: string;
  isOwner: boolean;
  characterId: string;
  skinId: string | null;
  archetype: CharacterArchetype;
  appearance: CharacterAppearance;
  rig: R16Rig;
  animator: CharacterAnimator;
  ragdoll: R16Ragdoll;
  vfx: RemoteVfxBank;
  shieldMesh: THREE.Mesh;
  shieldMat: THREE.MeshBasicMaterial;
  spawnOrbMesh: THREE.Mesh;
  spawnOrbMat: THREE.MeshBasicMaterial;
  samples: BufferedSample[];
  serverClockOffsetMs: number;
  hasClockOffset: boolean;
  lastSeq: number;
  lastServerTimeMs: number;
  lastConsumedSeq: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  turnVelocity: number;
  hp: number;
  maxHp: number;
  trailHp: number;
  trailHoldTimer: number;
  dead: boolean;
  inSelector: boolean;
  ragdollActive: boolean;
  wasRagdoll: boolean;
  spawnProtected: boolean;
  shieldKind: RemoteShieldKind;
  shieldRemaining: number;
  invisible: boolean;
  wasInvisible: boolean;
  cloakPhase: 'idle' | 'vanishing' | 'cloaked' | 'revealing';
  cloakTimer: number;
  teleportAlpha: number;
  teleportFadeDir: 0 | -1 | 1;
  teleportFadeTimer: number;
  blueOrbMode: 'none' | 'spawn';
  blueOrbTimer: number;
  darkholdOpen: boolean;
  crownMode: boolean;
  wingsVisible: boolean;
  swordHeld: boolean;
  ritualPhase: string;
  sustainedFlags: number;
  stolenAbilityId: string | null;
  stolenAbilityIds: string[];
  stolenSourceSkinId: string | null;
  targetIdRef: string | null;
  localForward: number;
  localRight: number;
  grounded: boolean;
  wasGrounded: boolean;
  pendingJustJumped: boolean;
  pendingLandImpactSpeed: number;
  sprinting: boolean;
  flying: boolean;
  superSpeed: boolean;
  hitFlashTimer: number;
  // Local / synced CC states
  localParalyzeTimer: number;
  localMindControlParalysis: boolean;
  localMindControlParalysisTimer: number;
  localMindControlImmune: boolean;
  localPainRestricted: boolean;
  localPainRestrictedTimer: number;
  localClonesRestricted: boolean;
  localClonesRestrictedTimer: number;
  localExternalControl: boolean;
  localExternalControlTimer: number;
  localExternalPos: THREE.Vector3;
  localExternalYaw: number;
  localExternalHeadache: boolean;
  localExternalLimp: boolean;
  localExternalVampireVictim: boolean;
  localExternalPitchX: number;
  localForcefieldTrapped: boolean;
  localForcefieldMode: 'idle' | 'choosing' | 'protection' | 'suffocation';
  localForcefieldTimer: number;
  localForcefieldShieldHp: number;
  localForcefieldShieldMaxHp: number;
  // Timed remote visual states
  chaosDrainActive: boolean;
  chaosDrainTimer: number;
  chaosDrainTargetId: string | null;
  chaosDrainTargetPos: THREE.Vector3;
  zombieBeamTimer: number;
  zombieBeamTargetId: string | null;
  zombieBeamTargetPos: THREE.Vector3;
  agathaDrainTimer: number;
  agathaDrainTargetId: string | null;
  visionLaserTimer: number;
  visionLaserTargetPos: THREE.Vector3;
  hasVisionLaserTarget: boolean;
  visionChargeTimer: number;
  thorStormChannelTimer: number;
  thorStormBeamTimer: number;
  thorStormBeamDir: THREE.Vector3;
  thorSlamPhase: 'idle' | 'ascend' | 'dive';
  thorSlamTimer: number;
  silverCosmicChargeTimer: number;
  silverDualBeamTimer: number;
  silverDualBeamDir: THREE.Vector3;
  stormIceCreateTimer: number;
  stormLightningRiseTimer: number;
  stormWindDir: THREE.Vector3;
  capShieldInFlight: boolean;
  capShieldFlightTimer: number;
  thorHammerInFlight: boolean;
  thorHammerFlightTimer: number;
  vampireAbsorbTargetId: string | null;
  vampireAbsorbTargetPos: THREE.Vector3;
  spinningLeapTimer: number;
  ritualEffectKind: 'none' | 'paralyze' | 'pain' | 'control';
  ritualEffectTimer: number;
  ritualEffectPos: THREE.Vector3;
  mindControlTargetPos: THREE.Vector3;
  hasMindControlTarget: boolean;
  qsWindTornadoActive: boolean;
  qsWindTornadoCenter: THREE.Vector3;
  astralExtractActive: boolean;
  astralExtractElapsed: number;
  astralExtractPos: THREE.Vector3;
  astralExtractYaw: number;
  astralExtractDir: THREE.Vector3;
  painTargetId: string | null;
  painTargetPos: THREE.Vector3;
  greenChargeActive: boolean;
  greenChargeElapsed: number;
  phoenixRevivePhase: 'none' | 'rising' | 'manifest';
  phoenixReviveElapsed: number;
  phoenixRevivePos: THREE.Vector3;
  damageDisplay: {
    active: boolean;
    total: number;
    timer: number;
    offsetX: number;
    offsetY: number;
    scale: number;
    opacity: number;
  };
  probe: CombatTargetProbe;
}

interface EphemeralVfx {
  mesh: THREE.Object3D;
  mat: THREE.MeshBasicMaterial;
  elapsed: number;
  duration: number;
  kind: 'bolt' | 'explosion' | 'shockwave' | 'lightning';
  vel?: THREE.Vector3;
  maxRadius?: number;
}

export class RemotePlayerSystem {
  public readonly group = new THREE.Group();
  private readonly actors = new Map<string, RemotePlayerActor>();
  private readonly actorsByPlayerId = new Map<string, RemotePlayerActor>();
  private readonly cachedProbes: CombatTargetProbe[] = [];
  private readonly cachedSnapshots: NpcHudSnapshot[] = [];
  private selectedTargetId: string | null = null;
  private onCombatHit?: (req: CombatHitRequest) => void;
  private onCombatCrowdControl?: (cc: CombatCrowdControlPacket) => void;
  private onCombatHeal?: (req: CombatHealRequest) => void;
  private readonly lastExternalPoseEmitByTarget = new Map<
    string,
    { atMs: number; pose?: string }
  >();
  private groundHeightProvider?: (x: number, z: number, refY?: number) => number;

  private readonly contactShadowGeo = new THREE.PlaneGeometry(1.18, 1.18);
  private readonly contactShadowMat: THREE.MeshBasicMaterial;
  private readonly contactShadowMesh: THREE.InstancedMesh;
  private readonly shadowDummy = new THREE.Object3D();

  private readonly shieldGeo = new THREE.SphereGeometry(1.22, 18, 14);
  private readonly spawnOrbGeo = new THREE.SphereGeometry(1.15, 16, 12);
  private readonly vfxSphereGeo = new THREE.SphereGeometry(0.28, 12, 10);
  private readonly vfxRingGeo = new THREE.RingGeometry(0.75, 1.0, 28);
  private readonly vfxBoltGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.0, 10);
  private readonly activeVfx: EphemeralVfx[] = [];
  private readonly rockBreakVfx = new RockBreakVfxSystem();
  private readonly landingDust = new LandingDustSystem();

  private readonly _proj = new THREE.Vector3();
  private readonly _tmpA = new THREE.Vector3();
  private readonly _tmpB = new THREE.Vector3();
  private readonly _tmpC = new THREE.Vector3();
  private readonly _tmpD = new THREE.Vector3();
  private readonly _tmpHandL = new THREE.Vector3();
  private readonly _tmpHandR = new THREE.Vector3();
  private readonly _tmpHead = new THREE.Vector3();
  private readonly _tmpChest = new THREE.Vector3();
  private readonly _motion: CharacterMotionState = {
    localForward: 0,
    localRight: 0,
    verticalVelocity: 0,
    turnVelocity: 0,
    grounded: true,
    justJumped: false,
    landImpactSpeed: 0,
    flying: false,
    sprinting: false,
    superSpeed: false,
  };

  constructor(onCombatHit?: (req: CombatHitRequest) => void) {
    this.onCombatHit = onCombatHit;
    const shadowTex = createContactShadowTexture();
    this.contactShadowGeo.rotateX(-Math.PI / 2);
    this.contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    this.contactShadowMesh = new THREE.InstancedMesh(
      this.contactShadowGeo,
      this.contactShadowMat,
      32,
    );
    this.contactShadowMesh.count = 0;
    this.contactShadowMesh.frustumCulled = false;
    this.group.add(this.contactShadowMesh);
    this.group.add(this.rockBreakVfx.group, this.landingDust.group);
  }

  public setOnCombatHit(cb?: (req: CombatHitRequest) => void): void {
    this.onCombatHit = cb;
  }

  public setOnCombatCrowdControl(cb?: (cc: CombatCrowdControlPacket) => void): void {
    this.onCombatCrowdControl = cb;
  }

  public setOnCombatHeal(cb?: (req: CombatHealRequest) => void): void {
    this.onCombatHeal = cb;
  }

  public setGroundHeightProvider(
    fn?: (x: number, z: number, refY?: number) => number,
  ): void {
    this.groundHeightProvider = fn;
  }

  // ---- Lazy per-actor VFX Bank ----

  private ensureScarlet(
    a: RemotePlayerActor,
    variant: 'default' | 'crimson-dark' = 'default',
  ): ScarletWitchVfxSystem {
    if (!a.vfx.scarlet || a.vfx.scarletVariant !== variant) {
      if (a.vfx.scarlet) {
        this.group.remove(a.vfx.scarlet.group);
        a.vfx.scarlet.dispose();
      }
      const sys = new ScarletWitchVfxSystem(variant);
      this.group.add(sys.group);
      a.vfx.scarlet = sys;
      a.vfx.scarletVariant = variant;
    }
    return a.vfx.scarlet;
  }

  private ensureDarkhold(
    a: RemotePlayerActor,
    variant: 'crimson' | 'purple',
  ): DarkholdBookVfx {
    if (variant === 'purple') {
      if (!a.vfx.darkholdPurple) {
        const book = new DarkholdBookVfx('purple');
        this.group.add(book.group);
        a.vfx.darkholdPurple = book;
      }
      return a.vfx.darkholdPurple;
    }
    if (!a.vfx.darkholdCrimson) {
      const book = new DarkholdBookVfx('crimson');
      this.group.add(book.group);
      a.vfx.darkholdCrimson = book;
    }
    return a.vfx.darkholdCrimson;
  }

  private ensureScarletShield(
    a: RemotePlayerActor,
    variant: 'crimson' | 'purple',
  ): ScarletShieldVfx {
    if (variant === 'purple') {
      if (!a.vfx.agathaAutoShield) {
        const sh = new ScarletShieldVfx('purple');
        this.group.add(sh.group);
        a.vfx.agathaAutoShield = sh;
      }
      return a.vfx.agathaAutoShield;
    }
    if (!a.vfx.scarletShield) {
      const sh = new ScarletShieldVfx('crimson');
      this.group.add(sh.group);
      a.vfx.scarletShield = sh;
    }
    return a.vfx.scarletShield;
  }

  private ensureChaosDrain(a: RemotePlayerActor, darkCrimson: boolean): ChaosDrainBeamVfx {
    if (!a.vfx.chaosDrain || a.vfx.chaosDrainDark !== darkCrimson) {
      if (a.vfx.chaosDrain) {
        this.group.remove(a.vfx.chaosDrain.group);
        a.vfx.chaosDrain.dispose();
      }
      const b = new ChaosDrainBeamVfx(darkCrimson);
      this.group.add(b.group);
      a.vfx.chaosDrain = b;
      a.vfx.chaosDrainDark = darkCrimson;
    }
    return a.vfx.chaosDrain;
  }

  private ensureStoneChaos(a: RemotePlayerActor): StoneChaosExplosionVfx {
    if (!a.vfx.stoneChaos) {
      const s = new StoneChaosExplosionVfx();
      this.group.add(s.group);
      a.vfx.stoneChaos = s;
    }
    return a.vfx.stoneChaos;
  }

  private ensureSupremeRitual(a: RemotePlayerActor): SupremeRitualVfx {
    if (!a.vfx.supremeRitual) {
      const r = new SupremeRitualVfx();
      this.group.add(r.group);
      a.vfx.supremeRitual = r;
    }
    return a.vfx.supremeRitual;
  }

  private ensureAgatha(a: RemotePlayerActor): AgathaVfxSystem {
    if (!a.vfx.agatha) {
      const sys = new AgathaVfxSystem();
      this.group.add(sys.group);
      a.vfx.agatha = sys;
    }
    return a.vfx.agatha;
  }

  private ensurePhoenix(a: RemotePlayerActor, variant?: PhoenixSkinVariant): PhoenixVfxSystem {
    const v = variant ?? resolvePhoenixVariant(a.skinId);
    if (!a.vfx.phoenix || a.vfx.phoenixVariant !== v) {
      if (a.vfx.phoenix) {
        this.group.remove(a.vfx.phoenix.group);
        a.vfx.phoenix.dispose();
      }
      const sys = new PhoenixVfxSystem(v);
      this.group.add(sys.group);
      a.vfx.phoenix = sys;
      a.vfx.phoenixVariant = v;
    }
    return a.vfx.phoenix;
  }

  private ensurePhoenixRigAttachments(a: RemotePlayerActor): void {
    const v = resolvePhoenixVariant(a.skinId);
    if (!a.vfx.phoenixWings) {
      const wings = new PhoenixWings(v);
      a.rig.chest.add(wings.group);
      a.vfx.phoenixWings = wings;
    }
    if (!a.vfx.phoenixHandLeft) {
      const hL = new HandFireAura(v, 0.24);
      hL.group.position.set(0, -0.09, -0.06);
      a.rig.leftHand.add(hL.group);
      a.vfx.phoenixHandLeft = hL;
    }
    if (!a.vfx.phoenixHandRight) {
      const hR = new HandFireAura(v, 0.24);
      hR.group.position.set(0, -0.09, -0.06);
      a.rig.rightHand.add(hR.group);
      a.vfx.phoenixHandRight = hR;
    }
  }

  private ensureEmma(a: RemotePlayerActor): EmmaFrostVfxSystem {
    if (!a.vfx.emma) {
      const sys = new EmmaFrostVfxSystem();
      this.group.add(sys.group);
      a.vfx.emma = sys;
    }
    return a.vfx.emma;
  }

  private ensureHela(a: RemotePlayerActor): HelaVfxSystem {
    if (!a.vfx.hela) {
      const sys = new HelaVfxSystem();
      this.group.add(sys.group);
      a.vfx.hela = sys;
    }
    return a.vfx.hela;
  }

  private ensureMagneto(a: RemotePlayerActor): MagnetoVfxSystem {
    if (!a.vfx.magneto) {
      const sys = new MagnetoVfxSystem();
      this.group.add(sys.group);
      a.vfx.magneto = sys;
    }
    return a.vfx.magneto;
  }

  private ensureQuicksilver(a: RemotePlayerActor, palette?: 'blue' | 'green'): QuicksilverVfxSystem {
    const pal = palette ?? (a.skinId === 'speed' ? 'green' : 'blue');
    if (!a.vfx.quicksilver) {
      const sys = new QuicksilverVfxSystem(pal);
      this.group.add(sys.group);
      a.vfx.quicksilver = sys;
    } else if (palette) {
      a.vfx.quicksilver.setPalette(pal);
    }
    return a.vfx.quicksilver;
  }

  private ensureStrange(a: RemotePlayerActor): DoctorStrangeVfxSystem {
    if (!a.vfx.strange) {
      const sys = new DoctorStrangeVfxSystem(a.appearance);
      this.group.add(sys.group);
      a.vfx.strange = sys;
    }
    return a.vfx.strange;
  }

  private ensureVision(a: RemotePlayerActor): VisionVfxSystem {
    if (!a.vfx.vision) {
      const sys = new VisionVfxSystem();
      this.group.add(sys.group);
      a.vfx.vision = sys;
    }
    return a.vfx.vision;
  }

  private ensureInvisible(a: RemotePlayerActor): InvisibleWomanVfxSystem {
    if (!a.vfx.invisible) {
      const sys = new InvisibleWomanVfxSystem();
      this.group.add(sys.group);
      a.vfx.invisible = sys;
    }
    return a.vfx.invisible;
  }

  private ensureVampire(a: RemotePlayerActor): VampireVfxSystem {
    if (!a.vfx.vampire) {
      const sys = new VampireVfxSystem();
      this.group.add(sys.group);
      a.vfx.vampire = sys;
    }
    return a.vfx.vampire;
  }

  private ensureCap(a: RemotePlayerActor): CaptainAmericaVfxSystem {
    if (!a.vfx.cap) {
      const sys = new CaptainAmericaVfxSystem();
      this.group.add(sys.group);
      a.vfx.cap = sys;
    }
    return a.vfx.cap;
  }

  private ensureThor(a: RemotePlayerActor): ThorVfxSystem {
    if (!a.vfx.thor) {
      const sys = new ThorVfxSystem();
      this.group.add(sys.group);
      a.vfx.thor = sys;
    }
    return a.vfx.thor;
  }

  private ensureSilver(a: RemotePlayerActor): SilverSurferVfxSystem {
    if (!a.vfx.silver) {
      const sys = new SilverSurferVfxSystem();
      this.group.add(sys.group);
      a.vfx.silver = sys;
    }
    return a.vfx.silver;
  }

  private ensureStorm(a: RemotePlayerActor): StormVfxSystem {
    if (!a.vfx.storm) {
      const sys = new StormVfxSystem();
      this.group.add(sys.group);
      a.vfx.storm = sys;
    }
    return a.vfx.storm;
  }

  private ensureShieldHit(a: RemotePlayerActor): ShieldHitVfxSystem {
    if (!a.vfx.shieldHit) {
      const sys = new ShieldHitVfxSystem();
      this.group.add(sys.group);
      a.vfx.shieldHit = sys;
    }
    return a.vfx.shieldHit;
  }

  private ensureBlueOrb(a: RemotePlayerActor): BlueOrbTransitionVfx {
    if (!a.vfx.blueOrb) {
      const orb = new BlueOrbTransitionVfx();
      this.group.add(orb.group);
      a.vfx.blueOrb = orb;
    }
    return a.vfx.blueOrb;
  }

  private pushEphemeralVfx(fx: EphemeralVfx): void {
    while (this.activeVfx.length >= 80) {
      const oldest = this.activeVfx.shift();
      if (oldest) {
        this.group.remove(oldest.mesh);
        oldest.mat.dispose();
      }
    }
    this.activeVfx.push(fx);
  }

  private clearAstralDecoy(a: RemotePlayerActor): void {
    const decoy = a.vfx.astralDecoy;
    if (!decoy) return;
    this.group.remove(decoy.group);
    decoy.rig.dispose();
    a.vfx.astralDecoy = undefined;
  }

  private resetActorTransientVisuals(
    a: RemotePlayerActor,
    clearVfxInstances = false,
  ): void {
    a.localParalyzeTimer = 0;
    a.localMindControlParalysis = false;
    a.localMindControlParalysisTimer = 0;
    a.localMindControlImmune = false;
    a.localPainRestricted = false;
    a.localPainRestrictedTimer = 0;
    a.localClonesRestricted = false;
    a.localClonesRestrictedTimer = 0;
    a.localExternalControl = false;
    a.localExternalControlTimer = 0;
    a.localExternalHeadache = false;
    a.localExternalLimp = false;
    a.localExternalVampireVictim = false;
    a.localExternalPitchX = 0;
    a.localForcefieldTrapped = false;
    a.localForcefieldMode = 'idle';
    a.localForcefieldTimer = 0;
    a.localForcefieldShieldHp = 0;
    a.chaosDrainActive = false;
    a.chaosDrainTimer = 0;
    a.chaosDrainTargetId = null;
    a.zombieBeamTimer = 0;
    a.zombieBeamTargetId = null;
    a.agathaDrainTimer = 0;
    a.agathaDrainTargetId = null;
    a.visionLaserTimer = 0;
    a.hasVisionLaserTarget = false;
    a.visionChargeTimer = 0;
    a.thorStormChannelTimer = 0;
    a.thorStormBeamTimer = 0;
    a.thorSlamPhase = 'idle';
    a.thorSlamTimer = 0;
    a.silverCosmicChargeTimer = 0;
    a.silverDualBeamTimer = 0;
    a.stormIceCreateTimer = 0;
    a.stormLightningRiseTimer = 0;
    a.capShieldInFlight = false;
    a.capShieldFlightTimer = 0;
    a.thorHammerInFlight = false;
    a.thorHammerFlightTimer = 0;
    a.vampireAbsorbTargetId = null;
    a.spinningLeapTimer = 0;
    a.ritualEffectKind = 'none';
    a.ritualEffectTimer = 0;
    a.hasMindControlTarget = false;
    a.qsWindTornadoActive = false;
    a.astralExtractActive = false;
    a.painTargetId = null;
    a.greenChargeActive = false;
    a.phoenixRevivePhase = 'none';
    a.teleportAlpha = 1;
    a.teleportFadeDir = 0;
    a.teleportFadeTimer = 0;
    a.rig.setWhiteOutline(false);
    a.rig.setAstralProjection(false);
    a.rig.setEyesClosed(false);
    if (clearVfxInstances) {
      this.clearAstralDecoy(a);
      a.blueOrbMode = 'none';
      a.blueOrbTimer = 0;
      a.vfx.blueOrb?.hide();
      a.vfx.chaosDrain?.setActive(false);
      a.vfx.emma?.setMindControlBeam(false);
      a.vfx.vision?.setLaserActive(false);
      a.vfx.supremeRitual?.stop();
      a.vfx.strange?.stopAstralExtractionSoul();
      a.vfx.quicksilver?.setWindTornado(false);
      a.vfx.magneto?.setTornadoActive(false);
      a.vfx.agatha?.updateAbsorptionShield(false, a.position, 0);
      a.vfx.phoenix?.updatePainTelekinetic(false, null, null, 0);
      a.vfx.phoenix?.updateSpecialRevival(0, 'none', null, null, a.yaw, 0, 4.0);
    }
  }

  private disposeActorVfx(a: RemotePlayerActor): void {
    this.clearAstralDecoy(a);
    const bank = a.vfx;
    const removeFromGroup = (sys?: { group: THREE.Group; dispose: () => void }) => {
      if (!sys) return;
      this.group.remove(sys.group);
      sys.dispose();
    };
    const removeChildAttachment = (sys?: { group: THREE.Group; dispose: () => void }) => {
      if (!sys) return;
      sys.group.parent?.remove(sys.group);
      sys.dispose();
    };
    removeFromGroup(bank.scarlet);
    removeChildAttachment(bank.handChaosLeft);
    removeChildAttachment(bank.handChaosRight);
    removeFromGroup(bank.darkholdCrimson);
    removeFromGroup(bank.darkholdPurple);
    removeFromGroup(bank.scarletShield);
    removeFromGroup(bank.agathaAutoShield);
    removeFromGroup(bank.chaosDrain);
    removeFromGroup(bank.stoneChaos);
    removeFromGroup(bank.supremeRitual);
    removeFromGroup(bank.agatha);
    removeFromGroup(bank.phoenix);
    removeChildAttachment(bank.phoenixWings);
    removeChildAttachment(bank.phoenixHandLeft);
    removeChildAttachment(bank.phoenixHandRight);
    removeFromGroup(bank.emma);
    removeFromGroup(bank.hela);
    removeFromGroup(bank.magneto);
    removeFromGroup(bank.quicksilver);
    removeFromGroup(bank.strange);
    removeFromGroup(bank.vision);
    removeFromGroup(bank.invisible);
    removeFromGroup(bank.vampire);
    removeFromGroup(bank.cap);
    removeFromGroup(bank.thor);
    removeFromGroup(bank.silver);
    removeFromGroup(bank.storm);
    removeFromGroup(bank.shieldHit);
    removeFromGroup(bank.blueOrb);
    a.vfx = {};
  }

  private createActor(info: PlayerPublicInfo): RemotePlayerActor {
    const def = getCharacterById(info.characterId);
    const resolved = resolveCharacterWithSkin(def, info.skinId);
    const rig = createR16Character(resolved.appearance);
    const animator = new CharacterAnimator(
      rig,
      resolved.appearance.archetype ?? 'standard',
      resolved.appearance.skinId,
    );
    const ragdoll = new R16Ragdoll(rig);

    const shieldMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shieldMesh = new THREE.Mesh(this.shieldGeo, shieldMat);
    shieldMesh.position.set(0, 1.05, 0);
    shieldMesh.visible = false;
    rig.root.add(shieldMesh);

    const spawnOrbMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const spawnOrbMesh = new THREE.Mesh(this.spawnOrbGeo, spawnOrbMat);
    spawnOrbMesh.position.set(0, 1.0, 0);
    spawnOrbMesh.visible = false;
    rig.root.add(spawnOrbMesh);

    rig.root.visible = !Boolean(info.inSelector);
    this.group.add(rig.root);

    const targetId = toRemoteTargetId(info.playerId);
    const actor: RemotePlayerActor = {
      playerId: info.playerId,
      targetId,
      name: info.isOwner ? `${info.name} [HOST]` : info.name,
      isOwner: info.isOwner,
      characterId: info.characterId,
      skinId: info.skinId,
      archetype: resolved.appearance.archetype ?? 'standard',
      appearance: resolved.appearance,
      rig,
      animator,
      ragdoll,
      vfx: {},
      shieldMesh,
      shieldMat,
      spawnOrbMesh,
      spawnOrbMat,
      samples: [],
      serverClockOffsetMs: 0,
      hasClockOffset: false,
      lastSeq: 0,
      lastServerTimeMs: 0,
      lastConsumedSeq: 0,
      position: new THREE.Vector3(0, 0.4, 0),
      velocity: new THREE.Vector3(),
      yaw: 0,
      turnVelocity: 0,
      hp: info.hp,
      maxHp: info.maxHp,
      trailHp: info.hp,
      trailHoldTimer: 0,
      dead: !info.alive,
      inSelector: Boolean(info.inSelector),
      ragdollActive: false,
      wasRagdoll: false,
      spawnProtected: true,
      shieldKind: null,
      shieldRemaining: 0,
      invisible: false,
      wasInvisible: false,
      cloakPhase: 'idle',
      cloakTimer: 0,
      teleportAlpha: 1,
      teleportFadeDir: 0,
      teleportFadeTimer: 0,
      blueOrbMode: 'none',
      blueOrbTimer: 0,
      darkholdOpen: false,
      crownMode: false,
      wingsVisible: false,
      swordHeld: false,
      ritualPhase: 'none',
      sustainedFlags: 0,
      stolenAbilityId: info.stolenAbilityId ?? info.stolenAbilityIds?.[0] ?? null,
      stolenAbilityIds: info.stolenAbilityIds
        ? [...info.stolenAbilityIds]
        : info.stolenAbilityId
          ? [info.stolenAbilityId]
          : [],
      stolenSourceSkinId: null,
      targetIdRef: null,
      localForward: 0,
      localRight: 0,
      grounded: true,
      wasGrounded: true,
      pendingJustJumped: false,
      pendingLandImpactSpeed: 0,
      sprinting: false,
      flying: false,
      superSpeed: false,
      hitFlashTimer: 0,
      localParalyzeTimer: 0,
      localMindControlParalysis: false,
      localMindControlParalysisTimer: 0,
      localMindControlImmune: false,
      localPainRestricted: false,
      localPainRestrictedTimer: 0,
      localClonesRestricted: false,
      localClonesRestrictedTimer: 0,
      localExternalControl: false,
      localExternalControlTimer: 0,
      localExternalPos: new THREE.Vector3(),
      localExternalYaw: 0,
      localExternalHeadache: false,
      localExternalLimp: false,
      localExternalVampireVictim: false,
      localExternalPitchX: 0,
      localForcefieldTrapped: false,
      localForcefieldMode: 'idle',
      localForcefieldTimer: 0,
      localForcefieldShieldHp: 0,
      localForcefieldShieldMaxHp: 0,
      chaosDrainActive: false,
      chaosDrainTimer: 0,
      chaosDrainTargetId: null,
      chaosDrainTargetPos: new THREE.Vector3(),
      zombieBeamTimer: 0,
      zombieBeamTargetId: null,
      zombieBeamTargetPos: new THREE.Vector3(),
      agathaDrainTimer: 0,
      agathaDrainTargetId: null,
      visionLaserTimer: 0,
      visionLaserTargetPos: new THREE.Vector3(),
      hasVisionLaserTarget: false,
      visionChargeTimer: 0,
      thorStormChannelTimer: 0,
      thorStormBeamTimer: 0,
      thorStormBeamDir: new THREE.Vector3(0, 0, -1),
      thorSlamPhase: 'idle',
      thorSlamTimer: 0,
      silverCosmicChargeTimer: 0,
      silverDualBeamTimer: 0,
      silverDualBeamDir: new THREE.Vector3(0, 0, -1),
      stormIceCreateTimer: 0,
      stormLightningRiseTimer: 0,
      stormWindDir: new THREE.Vector3(0, 0, -1),
      capShieldInFlight: false,
      capShieldFlightTimer: 0,
      thorHammerInFlight: false,
      thorHammerFlightTimer: 0,
      vampireAbsorbTargetId: null,
      vampireAbsorbTargetPos: new THREE.Vector3(),
      spinningLeapTimer: 0,
      ritualEffectKind: 'none',
      ritualEffectTimer: 0,
      ritualEffectPos: new THREE.Vector3(),
      mindControlTargetPos: new THREE.Vector3(),
      hasMindControlTarget: false,
      qsWindTornadoActive: false,
      qsWindTornadoCenter: new THREE.Vector3(),
      astralExtractActive: false,
      astralExtractElapsed: 0,
      astralExtractPos: new THREE.Vector3(),
      astralExtractYaw: 0,
      astralExtractDir: new THREE.Vector3(0, 0, -1),
      painTargetId: null,
      painTargetPos: new THREE.Vector3(),
      greenChargeActive: false,
      greenChargeElapsed: 0,
      phoenixRevivePhase: 'none',
      phoenixReviveElapsed: 0,
      phoenixRevivePos: new THREE.Vector3(),
      damageDisplay: {
        active: false,
        total: 0,
        timer: 0,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        opacity: 0,
      },
      probe: {
        id: targetId,
        position: new THREE.Vector3(0, 0.4, 0),
        radius: 0.65,
        height: 2.0,
      },
    };
    return actor;
  }

  private rebuildActorRig(
    actor: RemotePlayerActor,
    characterId: string,
    skinId: string | null,
  ): void {
    actor.ragdoll.reset();
    this.disposeActorVfx(actor);
    this.group.remove(actor.rig.root);
    actor.rig.dispose();

    const def = getCharacterById(characterId);
    const resolved = resolveCharacterWithSkin(def, skinId);
    const rig = createR16Character(resolved.appearance);
    const animator = new CharacterAnimator(
      rig,
      resolved.appearance.archetype ?? 'standard',
      resolved.appearance.skinId,
    );
    const ragdoll = new R16Ragdoll(rig);

    rig.root.add(actor.shieldMesh);
    rig.root.add(actor.spawnOrbMesh);
    rig.root.position.copy(actor.position);
    rig.root.rotation.set(0, actor.yaw, 0);
    this.group.add(rig.root);

    actor.characterId = characterId;
    actor.skinId = skinId;
    actor.archetype = resolved.appearance.archetype ?? 'standard';
    actor.appearance = resolved.appearance;
    actor.rig = rig;
    actor.animator = animator;
    actor.ragdoll = ragdoll;
    actor.wasRagdoll = false;
    actor.capShieldInFlight = false;
    actor.capShieldFlightTimer = 0;
    actor.thorHammerInFlight = false;
    actor.thorHammerFlightTimer = 0;
    actor.astralExtractActive = false;
    actor.hasMindControlTarget = false;
    actor.qsWindTornadoActive = false;
    actor.painTargetId = null;
    actor.greenChargeActive = false;
    actor.phoenixRevivePhase = 'none';
  }

  private destroyActor(actor: RemotePlayerActor): void {
    actor.ragdoll.reset();
    this.disposeActorVfx(actor);
    this.group.remove(actor.rig.root);
    actor.rig.dispose();
    actor.shieldMat.dispose();
    actor.spawnOrbMat.dispose();
    this.lastExternalPoseEmitByTarget.delete(actor.targetId);
    this.actors.delete(actor.targetId);
    this.actorsByPlayerId.delete(actor.playerId);
  }

  public syncRoster(players: PlayerPublicInfo[], selfPlayerId: string | null): void {
    const activeIds = new Set<string>();
    for (const info of players) {
      if (selfPlayerId && info.playerId === selfPlayerId) continue;
      activeIds.add(info.playerId);

      const existing = this.actorsByPlayerId.get(info.playerId);
      if (!existing) {
        const created = this.createActor(info);
        this.actors.set(created.targetId, created);
        this.actorsByPlayerId.set(info.playerId, created);
      } else {
        existing.isOwner = info.isOwner;
        existing.name = info.isOwner ? `${info.name} [HOST]` : info.name;
        existing.maxHp = info.maxHp;
        const wasInSelector = existing.inSelector;
        existing.inSelector = Boolean(info.inSelector);
        if (info.stolenAbilityIds !== undefined) {
          existing.stolenAbilityIds = [...info.stolenAbilityIds];
          existing.stolenAbilityId = info.stolenAbilityIds[0] ?? null;
        } else if (info.stolenAbilityId !== undefined) {
          existing.stolenAbilityId = info.stolenAbilityId;
          existing.stolenAbilityIds = info.stolenAbilityId ? [info.stolenAbilityId] : [];
        }
        if (
          existing.characterId !== info.characterId ||
          existing.skinId !== info.skinId
        ) {
          this.rebuildActorRig(existing, info.characterId, info.skinId);
        }
        if (existing.inSelector) {
          existing.rig.root.visible = false;
          existing.shieldMesh.visible = false;
          existing.spawnOrbMesh.visible = false;
          existing.samples.length = 0;
          this.resetActorTransientVisuals(existing, true);
        } else if (wasInSelector && info.alive) {
          existing.dead = false;
          existing.hp = info.hp;
          existing.trailHp = info.hp;
          existing.ragdollActive = false;
          existing.wasRagdoll = false;
          existing.ragdoll.reset();
          this.resetActorTransientVisuals(existing, true);
          existing.rig.root.visible = true;
          existing.rig.setOpacity(existing.invisible ? 0.06 : 1);
          existing.animator.reset(
            existing.rig,
            existing.archetype,
            (existing.skinId as CharacterSkinId | null) ?? undefined,
          );
        } else if (!existing.dead && !info.alive) {
          existing.dead = true;
          existing.ragdollActive = true;
          this.resetActorTransientVisuals(existing, false);
        } else if (existing.dead && info.alive) {
          existing.dead = false;
          existing.hp = info.hp;
          existing.trailHp = info.hp;
          existing.ragdollActive = false;
          existing.wasRagdoll = false;
          existing.ragdoll.reset();
          this.resetActorTransientVisuals(existing, true);
          existing.rig.root.visible = true;
          existing.rig.setOpacity(existing.invisible ? 0.06 : 1);
          existing.animator.reset(
            existing.rig,
            existing.archetype,
            (existing.skinId as CharacterSkinId | null) ?? undefined,
          );
        }
      }
    }

    for (const [playerId, actor] of Array.from(this.actorsByPlayerId.entries())) {
      if (!activeIds.has(playerId)) {
        this.destroyActor(actor);
      }
    }
  }

  public clearAll(): void {
    for (const actor of Array.from(this.actorsByPlayerId.values())) {
      this.destroyActor(actor);
    }
    this.selectedTargetId = null;
    this.lastExternalPoseEmitByTarget.clear();
    this.contactShadowMesh.count = 0;
    this.contactShadowMesh.instanceMatrix.needsUpdate = true;
    this.landingDust.clear();
    while (this.activeVfx.length > 0) {
      const fx = this.activeVfx.pop();
      if (fx) {
        this.group.remove(fx.mesh);
        fx.mat.dispose();
      }
    }
  }

  public applyRemoteState(
    state: RemotePlayerStateUpdate,
    receivedAtMs?: number,
  ): void {
    let actor = this.actorsByPlayerId.get(state.playerId);
    if (!actor) {
      actor = this.createActor({
        playerId: state.playerId,
        name: 'Hero',
        characterId: state.characterId,
        skinId: state.skinId,
        isOwner: false,
        kills: 0,
        hp: state.hp,
        maxHp: state.maxHp,
        alive: !state.dead,
        inSelector: Boolean(state.inSelector),
        stolenAbilityId: state.stolenAbilityId ?? null,
        stolenAbilityIds: state.stolenAbilityIds ?? [],
      });
      this.actors.set(actor.targetId, actor);
      this.actorsByPlayerId.set(state.playerId, actor);
    }

    if (state.inSelector !== undefined) {
      actor.inSelector = Boolean(state.inSelector);
    }
    if (actor.inSelector) {
      actor.rig.root.visible = false;
      actor.shieldMesh.visible = false;
      actor.spawnOrbMesh.visible = false;
      actor.samples.length = 0;
      this.resetActorTransientVisuals(actor, true);
      return;
    }

    if (
      actor.characterId !== state.characterId ||
      actor.skinId !== state.skinId
    ) {
      this.rebuildActorRig(actor, state.characterId, state.skinId);
      actor.samples.length = 0;
      actor.lastSeq = 0;
    }

    // Reject stale out-of-order packets while allowing respawn/rejoin/time-advance resets
    const serverTimeAdvanced =
      actor.lastServerTimeMs > 0 &&
      state.serverTimeMs > actor.lastServerTimeMs + 1500;
    if (
      !serverTimeAdvanced &&
      state.seq > 2 &&
      actor.lastSeq > 0 &&
      state.seq <= actor.lastSeq &&
      actor.lastSeq - state.seq < 1000
    ) {
      return;
    }
    actor.lastSeq = state.seq;
    actor.lastServerTimeMs = state.serverTimeMs;

    const arrivalNowMs = receivedAtMs ?? performance.now();
    const rawOffset = arrivalNowMs - state.serverTimeMs;
    if (!actor.hasClockOffset) {
      actor.serverClockOffsetMs = rawOffset;
      actor.hasClockOffset = true;
    } else {
      const diff = rawOffset - actor.serverClockOffsetMs;
      if (diff < -60) {
        // Previous offset was inflated by latency spike or buffered replay: snap fast downward
        const step = diff * 0.65;
        actor.serverClockOffsetMs += step;
        for (let i = 0; i < actor.samples.length; i++) {
          actor.samples[i].tMs += step;
        }
      } else if (diff < 0) {
        // Lower-latency packet reveals closer baseline offset: converge briskly downward
        actor.serverClockOffsetMs += diff * 0.35;
      } else {
        // Delayed jitter packet: absorb gently so sample timestamps don't drift into future
        actor.serverClockOffsetMs += Math.min(diff, 25) * 0.04;
      }
    }

    const wrappedYaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
    const normalizedState: RemotePlayerStateUpdate =
      wrappedYaw === state.yaw ? state : { ...state, yaw: wrappedYaw };

    let sampleTimeMs = normalizedState.serverTimeMs + actor.serverClockOffsetMs;
    const lastSample = actor.samples[actor.samples.length - 1];
    if (lastSample) {
      if (sampleTimeMs <= lastSample.tMs) {
        sampleTimeMs = lastSample.tMs + 1;
      }
      // Snap only on genuine teleports (> 22m) or death -> respawn transitions
      const jumpDist = Math.hypot(
        normalizedState.x - lastSample.state.x,
        normalizedState.y - lastSample.state.y,
        normalizedState.z - lastSample.state.z,
      );
      const respawned = lastSample.state.dead && !normalizedState.dead;
      if (jumpDist > 22 || respawned) {
        actor.samples.length = 0;
        actor.position.set(normalizedState.x, normalizedState.y, normalizedState.z);
        actor.yaw = wrappedYaw;
        actor.rig.root.position.copy(actor.position);
        actor.rig.root.rotation.set(actor.localExternalPitchX, actor.yaw, 0);
        if (respawned) {
          actor.ragdollActive = false;
          actor.wasRagdoll = false;
          actor.ragdoll.reset();
          actor.animator.reset(
            actor.rig,
            actor.archetype,
            (actor.skinId as CharacterSkinId | null) ?? undefined,
          );
        }
      }
    } else {
      actor.position.set(normalizedState.x, normalizedState.y, normalizedState.z);
      actor.yaw = wrappedYaw;
      actor.rig.root.position.copy(actor.position);
      actor.rig.root.rotation.set(actor.localExternalPitchX, actor.yaw, 0);
    }

    actor.samples.push({ tMs: sampleTimeMs, state: normalizedState });
    if (actor.samples.length > 18) {
      actor.samples.shift();
    }

    // Latch 1-frame jump & landing edges directly on arrival so fast buffer consumption never drops them
    if (state.justJumped) {
      actor.pendingJustJumped = true;
    }
    if ((state.landImpactSpeed ?? 0) > 0) {
      actor.pendingLandImpactSpeed = Math.max(
        actor.pendingLandImpactSpeed,
        state.landImpactSpeed ?? 0,
      );
    }

    if (state.hp < actor.hp && !state.dead) {
      actor.trailHoldTimer = 0.25;
      actor.hitFlashTimer = 0.14;
    } else if (state.hp > actor.hp || (!state.dead && actor.dead)) {
      actor.trailHp = state.hp;
    }
    const justRespawned = actor.dead && !state.dead;
    actor.hp = state.hp;
    actor.maxHp = state.maxHp;
    actor.dead = state.dead;
    actor.ragdollActive = state.ragdoll || state.dead;
    if (!state.dead) {
      actor.ragdollActive = false;
      actor.wasRagdoll = false;
      actor.rig.root.visible = true;
      actor.rig.setOpacity(actor.invisible ? 0.06 : 1);
      if (justRespawned) {
        actor.ragdoll.reset();
        this.resetActorTransientVisuals(actor, true);
        actor.animator.reset(
          actor.rig,
          actor.archetype,
          (actor.skinId as CharacterSkinId | null) ?? undefined,
        );
      }
    }
    actor.spawnProtected = state.spawnProtected;
    actor.shieldKind = state.shieldKind;
    actor.invisible = state.invisible;
    actor.darkholdOpen = state.darkholdOpen;
    actor.crownMode = state.crownMode;
    actor.wingsVisible = state.wingsVisible;
    actor.swordHeld = state.swordHeld;
    actor.ritualPhase = state.ritualPhase || 'none';
    actor.sustainedFlags = state.sustainedFlags;
    if (state.stolenAbilityIds !== undefined) {
      actor.stolenAbilityIds = [...state.stolenAbilityIds];
      actor.stolenAbilityId = state.stolenAbilityIds[0] ?? null;
      if (state.stolenAbilityIds.length === 0) {
        actor.stolenSourceSkinId = null;
      }
    } else if (state.stolenAbilityId !== undefined) {
      actor.stolenAbilityId = state.stolenAbilityId;
      actor.stolenAbilityIds = state.stolenAbilityId ? [state.stolenAbilityId] : [];
      if (!state.stolenAbilityId) {
        actor.stolenSourceSkinId = null;
      }
    }
    if (state.targetId !== undefined) {
      actor.targetIdRef = state.targetId;
    }
  }

  public applyRemoteVitals(vitals: CombatVitalsEvent): void {
    const a = this.actorsByPlayerId.get(vitals.playerId);
    if (!a) return;
    const isDurabilityShield =
      a.shieldKind === 'auto-shield' ||
      a.shieldKind === 'agatha-auto-shield' ||
      a.shieldKind === 'diamond-form' ||
      a.shieldKind === 'mystic-shield' ||
      a.shieldKind === 'forcefield-shield' ||
      a.shieldKind === 'shield-defense';

    if (vitals.alive) {
      const shieldDamaged =
        isDurabilityShield &&
        ((a.shieldRemaining > 0 && vitals.shieldRemaining < a.shieldRemaining) ||
          vitals.shieldKind === null);
      if (shieldDamaged && a.shieldKind) {
        this.ensureShieldHit(a).triggerAbsorb(a.position, a.shieldKind as any);
      }
    }

    if (a.inSelector) {
      a.hp = vitals.hp;
      a.maxHp = vitals.maxHp;
      a.dead = false;
      a.ragdollActive = false;
      a.rig.root.visible = false;
      a.shieldMesh.visible = false;
      a.spawnOrbMesh.visible = false;
      this.resetActorTransientVisuals(a, true);
      return;
    }

    const wasDead = a.dead || !a.hp || a.hp <= 0;
    a.hp = vitals.hp;
    a.maxHp = vitals.maxHp;
    a.dead = !vitals.alive;
    a.spawnProtected = vitals.spawnProtected;
    a.shieldKind = vitals.shieldKind;
    a.shieldRemaining = vitals.shieldRemaining;
    if (!vitals.alive) {
      this.resetActorTransientVisuals(a, true);
      a.ragdollActive = true;
      a.shieldRemaining = 0;
    } else if (wasDead && vitals.alive) {
      a.ragdollActive = false;
      a.wasRagdoll = false;
      a.ragdoll.reset();
      this.resetActorTransientVisuals(a, true);
      a.rig.root.visible = !a.inSelector;
      a.animator.reset(
        a.rig,
        a.archetype,
        (a.skinId as CharacterSkinId | null) ?? undefined,
      );
    }
  }

  public applyRemoteCrowdControl(cc: CombatCrowdControlPacket): void {
    const a = this.actorsByPlayerId.get(cc.targetPlayerId);
    if (!a) return;

    if (cc.kind === 'clear' || !cc.active) {
      if (
        cc.kind === 'clear' ||
        cc.kind === 'external-control' ||
        cc.kind === 'external-pose'
      ) {
        a.localExternalControl = false;
        a.localExternalControlTimer = 0;
        a.localExternalHeadache = false;
        a.localExternalLimp = false;
        a.localExternalVampireVictim = false;
        a.localExternalPitchX = 0;
      }
      if (cc.kind === 'clear' || cc.kind === 'paralyze') {
        a.localParalyzeTimer = 0;
      }
      if (cc.kind === 'clear' || cc.kind === 'mind-control-paralyze') {
        a.localMindControlParalysis = false;
        a.localMindControlParalysisTimer = 0;
      }
      if (cc.kind === 'clear' || cc.kind === 'pain') {
        a.localPainRestricted = false;
        a.localPainRestrictedTimer = 0;
      }
      if (cc.kind === 'clear' || cc.kind === 'clones') {
        a.localClonesRestricted = false;
        a.localClonesRestrictedTimer = 0;
      }
      if (cc.kind === 'forcefield' || cc.kind === 'clear') {
        a.localForcefieldTrapped = false;
        a.localForcefieldMode = 'idle';
        a.localForcefieldTimer = 0;
        a.localForcefieldShieldHp = 0;
      }
      return;
    }

    if (cc.kind === 'external-control' || cc.kind === 'external-pose') {
      a.localExternalControl = true;
      a.localExternalControlTimer = (cc.durationMs ?? 5500) / 1000;
      if (cc.x !== undefined && cc.y !== undefined && cc.z !== undefined) {
        a.localExternalPos.set(cc.x, cc.y, cc.z);
      } else {
        a.localExternalPos.copy(a.position);
      }
      a.localExternalYaw = cc.yaw ?? a.yaw;
      a.localExternalVampireVictim = cc.pose === 'grabbed';
      a.localExternalLimp = cc.pose === 'hang';
      a.localExternalHeadache = cc.pose === 'kneel';
    } else if (cc.kind === 'paralyze') {
      a.localParalyzeTimer = (cc.durationMs ?? 4000) / 1000;
    } else if (cc.kind === 'mind-control-paralyze') {
      a.localMindControlParalysis = true;
      a.localMindControlParalysisTimer = (cc.durationMs ?? 5000) / 1000;
    } else if (cc.kind === 'pain') {
      a.localPainRestricted = true;
      a.localPainRestrictedTimer = (cc.durationMs ?? 5000) / 1000;
    } else if (cc.kind === 'clones') {
      a.localClonesRestricted = true;
      a.localClonesRestrictedTimer = (cc.durationMs ?? 4000) / 1000;
    } else if (cc.kind === 'forcefield') {
      a.localForcefieldTrapped =
        cc.forcefieldMode === 'locked' || cc.forcefieldMode === 'suffocation';
      a.localForcefieldMode =
        cc.forcefieldMode === 'protection'
          ? 'protection'
          : cc.forcefieldMode === 'suffocation'
            ? 'suffocation'
            : cc.forcefieldMode === 'locked'
              ? 'choosing'
              : 'idle';
      a.localForcefieldTimer = (cc.durationMs ?? 4200) / 1000;
      if (cc.forcefieldShieldHp !== undefined) {
        a.localForcefieldShieldHp = cc.forcefieldShieldHp;
      }
    }
  }

  public applyRemoteVampireAbsorb(evt: VampireAbsorbEvent): void {
    const vamp = this.actorsByPlayerId.get(evt.vampirePlayerId);
    const victim = this.actorsByPlayerId.get(evt.targetPlayerId);

    if (evt.phase === 'start') {
      if (vamp) {
        vamp.vampireAbsorbTargetId = evt.targetPlayerId;
        if (
          evt.targetX !== undefined &&
          evt.targetY !== undefined &&
          evt.targetZ !== undefined
        ) {
          vamp.vampireAbsorbTargetPos.set(evt.targetX, evt.targetY, evt.targetZ);
        } else if (victim) {
          vamp.vampireAbsorbTargetPos.copy(victim.position);
        }
      }
      if (victim) {
        victim.localExternalControl = true;
        victim.localExternalVampireVictim = true;
        if (
          evt.targetX !== undefined &&
          evt.targetY !== undefined &&
          evt.targetZ !== undefined
        ) {
          victim.localExternalPos.set(evt.targetX, evt.targetY, evt.targetZ);
        } else {
          victim.localExternalPos.copy(victim.position);
        }
        victim.localExternalYaw = evt.targetYaw ?? victim.yaw;
      }
      return;
    }

    if (evt.phase === 'cancel') {
      if (vamp) {
        vamp.vampireAbsorbTargetId = null;
      }
      if (victim) {
        victim.localExternalControl = false;
        victim.localExternalVampireVictim = false;
      }
      return;
    }

    if (evt.phase === 'complete') {
      if (vamp) {
        vamp.vampireAbsorbTargetId = null;
        if (evt.stolenAbilityId) {
          if (!vamp.stolenAbilityIds.includes(evt.stolenAbilityId)) {
            vamp.stolenAbilityIds = [...vamp.stolenAbilityIds, evt.stolenAbilityId].slice(0, 3);
          }
          vamp.stolenAbilityId = vamp.stolenAbilityIds[0] ?? evt.stolenAbilityId;
        }
        vamp.stolenSourceSkinId = evt.sourceSkinId ?? vamp.stolenSourceSkinId;
        this.ensureVampire(vamp).spawnProjectileImpact(
          vamp.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
        );
      }
      if (victim) {
        victim.localExternalControl = false;
        victim.localExternalVampireVictim = false;
      }
    }
  }

  public applyRemoteAbilityVfx(vfx: AbilityVfxPacket): void {
    if (!vfx.playerId) return;
    let actor = this.actorsByPlayerId.get(vfx.playerId);
    if (!actor) {
      actor = this.createActor({
        playerId: vfx.playerId,
        name: 'Hero',
        characterId: vfx.characterId || 'scarlet-witch',
        skinId: vfx.skinId ?? null,
        isOwner: false,
        kills: 0,
        hp: 250,
        maxHp: 250,
        alive: true,
        stolenAbilityId: null,
      });
      this.actors.set(actor.targetId, actor);
      this.actorsByPlayerId.set(vfx.playerId, actor);
    }
    if (actor.inSelector) return;

    if (vfx.castName) {
      try {
        actor.animator.triggerCast(
          vfx.castName as Parameters<CharacterAnimator['triggerCast']>[0],
          vfx.castDuration ?? 0.35,
        );
      } catch {
        // Ignore unrecognized cast kind safely
      }
      if (vfx.kind === 'cast' && !vfx.abilityId) {
        return;
      }
    }

    const origin = this._tmpA.set(vfx.originX, vfx.originY, vfx.originZ);
    const defaultTargetZ = actor
      ? origin.z - Math.cos(actor.yaw) * 18
      : origin.z - 14;
    const defaultTargetX = actor
      ? origin.x - Math.sin(actor.yaw) * 18
      : origin.x;
    const target = this._tmpB.set(
      vfx.targetX ?? defaultTargetX,
      vfx.targetY ?? origin.y,
      vfx.targetZ ?? defaultTargetZ,
    );
    const forward = this._tmpC.copy(target).sub(origin);
    if (forward.lengthSq() < 0.0001) {
      if (actor) {
        forward.set(-Math.sin(actor.yaw), 0, -Math.cos(actor.yaw));
      } else {
        forward.set(0, 0, -1);
      }
    } else {
      forward.normalize();
    }

    if (actor) {
      const abilityId = vfx.abilityId;
      switch (abilityId) {
        case 'chaos-bolt': {
          const variant =
            vfx.skinId === 'wanda-zombie' || vfx.skinId === 'supreme-sorceress'
              ? 'crimson-dark'
              : 'default';
          if (vfx.stage === 'supreme-bolt') {
            this.ensureScarlet(actor, 'crimson-dark').spawnSupremeBeamBolt(
              origin.clone(),
              target.clone(),
            );
          } else {
            this.ensureScarlet(actor, variant).spawnChaosBolt(
              origin.clone(),
              target.clone(),
            );
          }
          return;
        }
        case 'chaos-implosion': {
          this.ensureScarlet(
            actor,
            vfx.skinId === 'supreme-sorceress' ? 'crimson-dark' : 'default',
          ).spawnChaosImplosion(origin.clone(), target.clone());
          this.rockBreakVfx.spawnImpact(
            target,
            1.45,
            vfx.skinId === 'supreme-sorceress' ? '#8A0F24' : '#FF3860',
          );
          return;
        }
        case 'telekinetic-explosion': {
          this.ensureScarlet(actor).spawnTelekineticExplosion(origin.clone());
          return;
        }
        case 'teleport':
        case 'agatha-teleport': {
          if (vfx.stage === 'arrive') {
            actor.teleportAlpha = 0;
            actor.teleportFadeDir = 1;
            actor.teleportFadeTimer = 0.24;
          } else {
            actor.teleportAlpha = 1;
            actor.teleportFadeDir = -1;
            actor.teleportFadeTimer = 0.22;
          }
          if (abilityId === 'agatha-teleport' || actor.characterId === 'agatha-harkness') {
            this.ensureAgatha(actor).spawnSmokeExplosion(origin.clone(), vfx.radius ?? 2.2);
          } else {
            this.ensureScarlet(
              actor,
              vfx.skinId === 'supreme-sorceress' || vfx.skinId === 'wanda-zombie'
                ? 'crimson-dark'
                : 'default',
            ).spawnBodyMistCloud(origin.clone());
          }
          return;
        }
        case 'scarlet-flight-cancel': {
          this.ensureScarlet(
            actor,
            vfx.skinId === 'wanda-zombie' || vfx.skinId === 'supreme-sorceress'
              ? 'crimson-dark'
              : 'default',
          ).spawnFlightCancelShockwave(origin.clone());
          return;
        }
        case 'chaos-drain':
        case 'supreme-drain': {
          if (vfx.stage === 'bolt') {
            this.ensureScarlet(actor, 'crimson-dark').spawnSupremeBeamBolt(
              origin.clone(),
              target.clone(),
            );
          } else if (vfx.stage === 'start') {
            actor.chaosDrainActive = true;
            actor.chaosDrainTimer = vfx.duration ?? 2.5;
            actor.chaosDrainTargetId = vfx.targetPlayerId ?? null;
            actor.chaosDrainTargetPos.copy(target);
            this.ensureChaosDrain(actor, true).setActive(true);
          } else if (vfx.stage === 'aim') {
            actor.chaosDrainActive = true;
            actor.chaosDrainTargetId = vfx.targetPlayerId ?? actor.chaosDrainTargetId;
            actor.chaosDrainTargetPos.copy(target);
          } else if (vfx.stage === 'stop') {
            actor.chaosDrainActive = false;
            actor.chaosDrainTimer = 0;
            this.ensureChaosDrain(actor, true).setActive(false);
          }
          return;
        }
        case 'zombie-beam': {
          if (vfx.stage === 'start') {
            actor.zombieBeamTimer = vfx.duration ?? 3.0;
            actor.zombieBeamTargetId = vfx.targetPlayerId ?? null;
            actor.zombieBeamTargetPos.copy(target);
            this.ensureChaosDrain(actor, false).setActive(true);
          } else if (vfx.stage === 'aim') {
            actor.zombieBeamTargetId = vfx.targetPlayerId ?? actor.zombieBeamTargetId;
            actor.zombieBeamTargetPos.copy(target);
          } else if (vfx.stage === 'stop') {
            actor.zombieBeamTimer = 0;
            this.ensureChaosDrain(actor, false).setActive(false);
          }
          return;
        }
        case 'zombie-stone-explosion': {
          const sc = this.ensureStoneChaos(actor);
          if (vfx.stage === 'blast') {
            sc.triggerBlast(origin.clone());
            this.rockBreakVfx.spawnImpact(origin, 1.8, '#8A0F24');
          } else {
            sc.start(origin.clone(), vfx.duration ?? 1.35);
          }
          return;
        }
        case 'supreme-ritual': {
          const sr = this.ensureSupremeRitual(actor);
          if (vfx.stage === 'start') {
            sr.start(origin.clone());
          } else if (vfx.stage === 'ignite') {
            actor.ritualPhase = 'ignite-gesture';
            actor.animator.setRitualPhase('ignite-gesture');
          } else if (vfx.stage === 'stop') {
            sr.stop();
            actor.ritualEffectKind = 'none';
            actor.ritualEffectTimer = 0;
          } else if (vfx.stage === 'effect') {
            actor.ritualEffectKind =
              vfx.castName === 'paralyze'
                ? 'paralyze'
                : vfx.castName === 'pain'
                  ? 'pain'
                  : vfx.castName === 'control'
                    ? 'control'
                    : 'none';
            actor.ritualEffectTimer = vfx.duration ?? 3.5;
            actor.ritualEffectPos.copy(target);
          }
          return;
        }
        case 'agatha-bolt': {
          this.ensureAgatha(actor).spawnPurpleBolt(origin.clone(), target.clone());
          return;
        }
        case 'agatha-darkhold': {
          this.ensureAgatha(actor).spawnSmokeExplosion(
            origin.clone(),
            vfx.radius ?? 2.2,
          );
          return;
        }
        case 'agatha-darkhold-blast': {
          this.ensureAgatha(actor).spawnSmokeExplosion(
            origin.clone(),
            vfx.radius ?? 4.8,
          );
          this.rockBreakVfx.spawnImpact(origin, 1.35, '#9333EA');
          return;
        }
        case 'agatha-shield': {
          const ag = this.ensureAgatha(actor);
          if (vfx.stage === 'absorb') {
            const targetId = vfx.targetPlayerId
              ? toRemoteTargetId(vfx.targetPlayerId)
              : actor.targetId;
            ag.startAbsorbTendrils(actor.targetId, targetId, 1.4);
          }
          return;
        }
        case 'phoenix-fireballs': {
          const pv = resolvePhoenixVariant(vfx.skinId ?? actor.skinId);
          this.ensurePhoenix(actor, pv).spawnFireball(
            origin.clone(),
            target.clone(),
          );
          return;
        }
        case 'phoenix-wave': {
          const pv = resolvePhoenixVariant(vfx.skinId ?? actor.skinId);
          const stepIdx = vfx.hand === 'left' ? 1 : vfx.hand === 'both' ? 2 : 0;
          this.ensurePhoenix(actor, pv).spawnPhoenixWaveExplosion(
            origin.clone(),
            stepIdx,
            forward.clone(),
          );
          return;
        }
        case 'pain-infliction': {
          const pv = resolvePhoenixVariant(vfx.skinId ?? actor.skinId);
          if (vfx.stage === 'start') {
            actor.painTargetId = vfx.targetPlayerId ?? null;
            actor.painTargetPos.copy(target);
          } else if (vfx.stage === 'stop') {
            actor.painTargetId = null;
          } else {
            actor.painTargetId = null;
            this.ensurePhoenix(actor, pv).spawnTelekineticShockwave(origin.clone());
          }
          return;
        }
        case 'phoenix-dive': {
          const pv = resolvePhoenixVariant(vfx.skinId ?? actor.skinId);
          const pSys = this.ensurePhoenix(actor, pv);
          if (vfx.stage === 'impact') {
            pSys.spawnPhoenixDiveExplosion(origin.clone());
            this.rockBreakVfx.spawnImpact(origin, 2.1, '#FF8C1A');
          } else if (vfx.stage === 'launch') {
            pSys.spawnFlightDiveLaunchBurst(origin.clone(), forward.clone());
          } else {
            actor.animator.triggerAerialSpin(0.35);
          }
          return;
        }
        case 'phoenix-flight': {
          if (vfx.stage === 'spin') {
            actor.animator.triggerAerialSpin(0.45);
          } else if (vfx.stage === 'revive') {
            const pv = resolvePhoenixVariant(vfx.skinId ?? actor.skinId);
            this.ensurePhoenix(actor, pv).spawnRevivalBurst(origin.clone(), forward.clone());
          }
          return;
        }
        case 'phoenix-revive': {
          if (vfx.stage === 'rising') {
            actor.phoenixRevivePhase = 'rising';
            actor.phoenixReviveElapsed = 0;
            actor.phoenixRevivePos.copy(origin);
          } else if (vfx.stage === 'manifest') {
            actor.phoenixRevivePhase = 'manifest';
            actor.phoenixReviveElapsed = 0;
            actor.phoenixRevivePos.copy(origin);
          } else {
            actor.phoenixRevivePhase = 'none';
            actor.phoenixReviveElapsed = 0;
          }
          return;
        }
        case 'mind-control': {
          if (vfx.stage === 'beam' || vfx.stage === 'aim') {
            actor.hasMindControlTarget = true;
            actor.mindControlTargetPos.copy(target);
          } else if (vfx.stage === 'blast') {
            actor.hasMindControlTarget = false;
            this.ensureEmma(actor).spawnMentalHeadExplosion(target.clone());
          } else {
            actor.hasMindControlTarget = false;
            this.ensureEmma(actor).setMindControlBeam(false);
          }
          return;
        }
        case 'astral-projection': {
          if (vfx.stage === 'start') {
            this.clearAstralDecoy(actor);
            const decoyRig = createR16Character(actor.appearance);
            decoyRig.root.position.copy(origin);
            decoyRig.root.rotation.set(0, actor.yaw, 0);
            this.group.add(decoyRig.root);
            const decoyAnim = new CharacterAnimator(decoyRig, 'emma-frost');
            actor.vfx.astralDecoy = {
              group: decoyRig.root,
              rig: decoyRig,
              animator: decoyAnim,
            };
            actor.rig.setAstralProjection(true);
          } else if (vfx.stage === 'stop') {
            this.clearAstralDecoy(actor);
            actor.rig.setAstralProjection(false);
          }
          return;
        }
        case 'mental-attack': {
          const em = this.ensureEmma(actor);
          if (vfx.stage === 'head') {
            em.spawnMentalHeadExplosion(target.clone());
          } else {
            em.spawnMentalAttack(origin.clone(), target.clone(), null, NOOP);
          }
          return;
        }
        case 'diamond-projectile': {
          this.ensureEmma(actor).spawnDiamondProjectile(
            origin.clone(),
            target.clone(),
          );
          return;
        }
        case 'telepathic-wave': {
          this.ensureEmma(actor).spawnTelepathicWaveRing(origin.clone(), forward.clone());
          return;
        }
        case 'sword-summon':
        case 'throw-sword': {
          if (abilityId === 'sword-summon') return;
          this.ensureHela(actor).spawnThrownSword(origin.clone(), target.clone(), 25);
          return;
        }
        case 'sword-slash': {
          this.ensureHela(actor).spawnSwordSlashTrail(
            origin.clone(),
            forward.clone(),
            vfx.hand === 'both' ? 'dual' : (vfx.hand ?? 'right'),
          );
          return;
        }
        case 'green-explosion': {
          if (vfx.stage === 'charge') {
            actor.greenChargeActive = true;
            actor.greenChargeElapsed = 0;
          } else {
            actor.greenChargeActive = false;
            this.ensureHela(actor).spawnGreenExplosion(
              origin.clone(),
              vfx.radius ?? 7.5,
            );
            this.rockBreakVfx.spawnImpact(origin, 1.85, '#3CE66B');
          }
          return;
        }
        case 'ground-sword': {
          this.ensureHela(actor).spawnGroundSword(target.clone());
          return;
        }
        case 'spinning-leap': {
          if (vfx.stage === 'end') {
            actor.spinningLeapTimer = 0;
            actor.animator.setSpinningLeap(false);
          } else {
            actor.spinningLeapTimer = vfx.duration ?? 0.9;
            actor.animator.setSpinningLeap(true);
          }
          return;
        }
        case 'metal-projectile': {
          this.ensureMagneto(actor).spawnMetalProjectile(
            origin.clone(),
            target.clone(),
          );
          return;
        }
        case 'magnetic-meteor': {
          this.ensureMagneto(actor).startMeteorSequence(
            origin.clone(),
            target.clone(),
          );
          this.rockBreakVfx.spawnImpact(target, 2.0, '#D946EF');
          return;
        }
        case 'rapid-punch-combo':
        case 'speed-blitz': {
          if (vfx.stage === 'start' || vfx.stage === 'stop') return;
          const pal = (vfx.skinId ?? actor.skinId) === 'speed' ? 'green' : 'blue';
          const qs = this.ensureQuicksilver(actor, pal);
          if (vfx.stage === 'dash') {
            qs.spawnBlitzDash(origin.clone(), target.clone(), actor.yaw);
          } else {
            qs.spawnPunchImpact(target.clone(), vfx.stage === 'finisher');
          }
          return;
        }
        case 'wind-tornado': {
          const pal = (vfx.skinId ?? actor.skinId) === 'speed' ? 'green' : 'blue';
          const qs = this.ensureQuicksilver(actor, pal);
          if (vfx.stage === 'stop') {
            actor.qsWindTornadoActive = false;
            qs.setWindTornado(false);
          } else {
            actor.qsWindTornadoActive = true;
            actor.qsWindTornadoCenter.copy(origin);
            qs.setWindTornado(true, actor.qsWindTornadoCenter);
          }
          return;
        }
        case 'time-stop': {
          const pal = (vfx.skinId ?? actor.skinId) === 'speed' ? 'green' : 'blue';
          this.ensureQuicksilver(actor, pal).spawnTimeStop(origin.clone());
          return;
        }
        case 'purgatory-grasp': {
          if (vfx.stage === 'precast') return;
          const st = this.ensureStrange(actor);
          if (vfx.stage === 'slam') {
            st.triggerPurgatoryGroundSlam(target.clone());
            this.rockBreakVfx.spawnImpact(target, 1.5, '#FB923C');
          } else {
            st.addPurgatoryTarget(
              vfx.targetPlayerId ? toRemoteTargetId(vfx.targetPlayerId) : `${actor.targetId}:pg`,
              target.clone(),
            );
          }
          return;
        }
        case 'mystic-clones': {
          if (vfx.stage === 'precast') return;
          const targetId = vfx.targetPlayerId
            ? toRemoteTargetId(vfx.targetPlayerId)
            : `${actor.targetId}:clones`;
          const targetActor = vfx.targetPlayerId
            ? this.actorsByPlayerId.get(vfx.targetPlayerId)
            : undefined;
          this.ensureStrange(actor).spawnMysticClones(
            targetId,
            target.clone(),
            targetActor?.appearance ?? actor.appearance,
          );
          return;
        }
        case 'eldritch-discs': {
          this.ensureStrange(actor).spawnEldritchDisc(
            origin.clone(),
            target.clone(),
          );
          return;
        }
        case 'astral-extraction': {
          const st = this.ensureStrange(actor);
          if (vfx.stage === 'stop') {
            actor.astralExtractActive = false;
            st.stopAstralExtractionSoul();
          } else {
            const targetActor = vfx.targetPlayerId
              ? this.actorsByPlayerId.get(vfx.targetPlayerId)
              : undefined;
            actor.astralExtractActive = true;
            actor.astralExtractElapsed = 0;
            actor.astralExtractPos.copy(target);
            actor.astralExtractYaw = targetActor?.yaw ?? actor.yaw;
            actor.astralExtractDir.copy(forward);
            st.startAstralExtractionSoul(targetActor?.appearance ?? actor.appearance);
          }
          return;
        }
        case 'mind-stone-laser': {
          actor.hasVisionLaserTarget = vfx.stage !== 'stop';
          if (vfx.stage !== 'aim') {
            actor.visionLaserTimer = vfx.stage === 'stop' ? 0 : (vfx.duration ?? 3.6);
          }
          actor.visionLaserTargetPos.copy(target);
          this.ensureVision(actor).setLaserActive(vfx.stage !== 'stop');
          return;
        }
        case 'mind-stone-projectile': {
          const vis = this.ensureVision(actor);
          if (vfx.stage === 'charge') {
            actor.visionChargeTimer = vfx.duration ?? 0.52;
          } else if (vfx.stage === 'big') {
            actor.visionChargeTimer = 0;
            vis.spawnMindBolt(origin.clone(), target.clone());
          } else {
            vis.spawnSmallMindBolt(origin.clone(), target.clone());
          }
          return;
        }
        case 'head-grip': {
          if (vfx.stage === 'slam') {
            this.rockBreakVfx.spawnImpact(origin, 1.4, '#FACC15');
            this.ensureVampire(actor).spawnProjectileImpact(origin.clone());
          }
          return;
        }
        case 'forcefield-barrier': {
          this.ensureInvisible(actor).spawnBarrierDisc(
            origin.clone(),
            forward.clone(),
          );
          return;
        }
        case 'vampire-bolt': {
          this.ensureVampire(actor).spawnEnergyProjectile(
            origin.clone(),
            target.clone(),
            0,
          );
          return;
        }
        case 'bandit-gun': {
          this.ensureVampire(actor).spawnBanditBullet(
            origin.clone(),
            target.clone(),
            0,
          );
          return;
        }
        case 'ground-stomp': {
          if (vfx.stage === 'dive') return;
          this.ensureVampire(actor).spawnGroundStompImpact(origin.clone());
          this.rockBreakVfx.spawnImpact(origin, 1.65, '#FBBF24');
          return;
        }
        case 'shield-throw': {
          if (vfx.stage === 'catch') {
            actor.capShieldInFlight = false;
            actor.capShieldFlightTimer = 0;
            return;
          }
          actor.capShieldInFlight = true;
          actor.capShieldFlightTimer = 3.5;
          this.ensureCap(actor).launchShieldThrow(
            origin.clone(),
            target.clone(),
            vfx.targetPlayerId ? toRemoteTargetId(vfx.targetPlayerId) : null,
          );
          return;
        }
        case 'shield-combo': {
          this.ensureCap(actor).spawnComboStrike(
            origin.clone(),
            forward.clone(),
            vfx.stage === 'finisher',
          );
          if (vfx.stage === 'finisher') {
            this.rockBreakVfx.spawnImpact(origin, 1.1, '#60A5FA');
          }
          return;
        }
        case 'shield-charge': {
          if (vfx.stage === 'bump') {
            const cap = this.ensureCap(actor);
            cap.spawnShockwave(origin.clone(), '#60A5FA', 2.4);
            cap.spawnSparks(origin.clone(), 16, '#E0F2FE', 8.5);
          }
          return;
        }
        case 'mjolnir-throw': {
          if (vfx.stage === 'catch') {
            actor.thorHammerInFlight = false;
            actor.thorHammerFlightTimer = 0;
            return;
          }
          if (vfx.stage === 'summon') {
            this.ensureCap(actor).spawnSparks(origin.clone(), 10, '#7CE4FF', 6.5);
            return;
          }
          actor.thorHammerInFlight = true;
          actor.thorHammerFlightTimer = 3.5;
          this.ensureThor(actor).launchMjolnirThrow(
            origin.clone(),
            target.clone(),
            vfx.targetPlayerId ? toRemoteTargetId(vfx.targetPlayerId) : null,
          );
          return;
        }
        case 'mjolnir-combo': {
          const step: 1 | 2 | 3 =
            vfx.stage === '3' ? 3 : vfx.stage === '2' ? 2 : 1;
          this.ensureThor(actor).spawnComboSlash(
            origin.clone(),
            forward.clone(),
            step,
          );
          if (step === 3) {
            this.rockBreakVfx.spawnImpact(origin, 1.2, '#38BDF8');
          }
          return;
        }
        case 'lightning-slam': {
          const th = this.ensureThor(actor);
          if (vfx.stage === 'ascend') {
            actor.thorSlamPhase = 'ascend';
            actor.thorSlamTimer = 0.65;
          } else if (vfx.stage === 'ground-bolt') {
            th.spawnGroundToThorBolt(origin.clone(), target.clone());
          } else if (vfx.stage === 'dive') {
            actor.thorSlamPhase = 'dive';
            actor.thorSlamTimer = 0.9;
          } else if (vfx.stage === 'sky-bolt') {
            th.spawnSkyToTargetBolt(target.clone());
          } else {
            actor.thorSlamPhase = 'idle';
            actor.thorSlamTimer = 0;
            th.spawnSlamImpact(origin.clone(), vfx.radius ?? 6.5);
            this.rockBreakVfx.spawnImpact(origin, 1.85, '#38BDF8');
          }
          return;
        }
        case 'lightning-storm-beam': {
          const th = this.ensureThor(actor);
          if (vfx.stage === 'channel') {
            actor.thorStormChannelTimer = vfx.duration ?? 1.05;
            th.spawnSkyChannelBolt(origin.clone());
          } else if (vfx.stage === 'beam') {
            actor.thorStormChannelTimer = 0;
            actor.thorStormBeamTimer = vfx.duration ?? 2.4;
            actor.thorStormBeamDir.copy(forward);
          } else if (vfx.stage === 'aim') {
            actor.thorStormBeamDir.copy(forward);
          } else if (vfx.stage === 'stop') {
            actor.thorStormChannelTimer = 0;
            actor.thorStormBeamTimer = 0;
          } else if (vfx.stage === 'bolt') {
            th.spawnSkyToTargetBolt(target.clone());
          }
          return;
        }
        case 'cosmic-blast': {
          const ss = this.ensureSilver(actor);
          if (vfx.stage === 'charge') {
            actor.silverCosmicChargeTimer = vfx.duration ?? 0.55;
          } else if (vfx.stage === 'impact') {
            ss.spawnCosmicExplosion(origin.clone(), vfx.radius ?? 4.0);
            this.rockBreakVfx.spawnImpact(origin, 1.55, '#7DD3FC');
          } else {
            actor.silverCosmicChargeTimer = 0;
            ss.spawnCosmicBlast(origin.clone(), target.clone());
          }
          return;
        }
        case 'sonic-blast': {
          this.ensureSilver(actor).spawnSonicBlast(origin.clone(), forward.clone());
          return;
        }
        case 'dual-cosmic-beam': {
          if (vfx.stage !== 'aim') {
            actor.silverDualBeamTimer = vfx.stage === 'stop' ? 0 : (vfx.duration ?? 5.0);
          }
          actor.silverDualBeamDir.copy(forward);
          return;
        }
        case 'lightning-strike': {
          if (vfx.stage === 'rise') {
            actor.stormLightningRiseTimer = vfx.duration ?? 0.55;
          } else {
            actor.stormLightningRiseTimer = 0;
            this.ensureStorm(actor).spawnLightningStrike(
              origin.clone(),
              target.clone(),
            );
            this.rockBreakVfx.spawnImpact(target, 1.35, '#FDE047');
          }
          return;
        }
        case 'ice-spear': {
          const st = this.ensureStorm(actor);
          if (vfx.stage === 'create') {
            actor.stormIceCreateTimer = vfx.duration ?? 0.5;
          } else if (vfx.stage === 'shatter') {
            st.spawnIceShatter(origin.clone());
          } else {
            actor.stormIceCreateTimer = 0;
            st.spawnIceSpear(origin.clone(), target.clone());
          }
          return;
        }
        case 'wind-blast': {
          if (vfx.stage === 'aim' || vfx.stage === 'start') {
            actor.stormWindDir.copy(forward);
          }
          return;
        }
        case 'auto-shield':
        case 'agatha-auto-shield':
        case 'diamond-form':
        case 'crown-form':
        case 'mystic-shield':
        case 'prisoner-punch':
          return;
        default:
          break;
      }
    }

    if (vfx.kind === 'respawn' && actor) {
      actor.blueOrbMode = 'spawn';
      actor.blueOrbTimer = 1.0;
    }

    // Fallback simple VFX for generic packets (`respawn`, `death`, `bolt`, `explosion`, `shockwave`, `lightning`, `teleport`)
    const color = vfx.colorHex || '#FF3B5C';
    if (vfx.kind === 'bolt' || vfx.kind === 'projectile') {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(this.vfxSphereGeo, mat);
      mesh.position.set(vfx.originX, vfx.originY, vfx.originZ);
      const vel = forward.clone().multiplyScalar(32);
      this.group.add(mesh);
      this.pushEphemeralVfx({
        mesh,
        mat,
        elapsed: 0,
        duration: 0.55,
        kind: 'bolt',
        vel,
      });
      return;
    }

    if (
      vfx.kind === 'explosion' ||
      vfx.kind === 'shockwave' ||
      vfx.kind === 'teleport' ||
      vfx.kind === 'respawn'
    ) {
      const mat = new THREE.MeshBasicMaterial({
        color: vfx.kind === 'teleport' ? '#FF4D79' : color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.vfxRingGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(vfx.originX, vfx.originY + 0.25, vfx.originZ);
      this.group.add(mesh);
      this.pushEphemeralVfx({
        mesh,
        mat,
        elapsed: 0,
        duration: vfx.kind === 'teleport' ? 0.35 : 0.45,
        kind: vfx.kind === 'explosion' ? 'explosion' : 'shockwave',
        maxRadius: vfx.radius ?? 4.2,
      });
      return;
    }

    if (vfx.kind === 'lightning') {
      const mat = new THREE.MeshBasicMaterial({
        color: vfx.colorHex || '#7DD3FC',
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.vfxBoltGeo, mat);
      mesh.scale.set(1.2, 16, 1.2);
      mesh.position.set(vfx.originX, vfx.originY + 8, vfx.originZ);
      this.group.add(mesh);
      this.pushEphemeralVfx({
        mesh,
        mat,
        elapsed: 0,
        duration: 0.32,
        kind: 'lightning',
      });
    }
  }

  // ---- Unified Target Contract ----

  public ownsTargetId(targetId: string): boolean {
    return this.actors.has(targetId);
  }

  public getTargetCharacterInfo(
    targetId: string,
  ): { characterId: string; skinId: string | null; spawnProtected: boolean } | null {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.hp <= 0) return null;
    return {
      characterId: a.characterId,
      skinId: a.skinId,
      spawnProtected: a.spawnProtected,
    };
  }

  public getTargetProbes(): CombatTargetProbe[] {
    this.cachedProbes.length = 0;
    for (const a of this.actors.values()) {
      if (a.inSelector || a.dead || a.hp <= 0 || a.invisible) continue;
      this.cachedProbes.push(a.probe);
    }
    return this.cachedProbes;
  }

  public getSelectedTargetId(): string | null {
    if (!this.selectedTargetId) return null;
    const a = this.actors.get(this.selectedTargetId);
    if (!a || a.inSelector || a.dead || a.hp <= 0 || a.invisible) return null;
    return a.targetId;
  }

  public findClosestTargetId(origin: THREE.Vector3, maxDistance: number): string | null {
    let bestId: string | null = null;
    let bestSq = maxDistance * maxDistance;
    for (const a of this.actors.values()) {
      if (a.inSelector || a.dead || a.hp <= 0 || a.invisible) continue;
      const dSq = a.position.distanceToSquared(origin);
      if (dSq <= bestSq) {
        bestSq = dSq;
        bestId = a.targetId;
      }
    }
    return bestId;
  }

  public isTargetAlive(targetId: string): boolean {
    const a = this.actors.get(targetId);
    return Boolean(a && !a.inSelector && !a.dead && a.hp > 0);
  }

  public getTargetTorsoPosition(targetId: string, out: THREE.Vector3): boolean {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.hp <= 0) return false;
    out.set(a.position.x, a.position.y + 1.1, a.position.z);
    return true;
  }

  public getTargetHeadPosition(targetId: string, out: THREE.Vector3): boolean {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.hp <= 0) return false;
    a.rig.head.getWorldPosition(out);
    return true;
  }

  public getNpcSwordEmbedPose(
    targetId: string,
    outPos: THREE.Vector3,
  ): { alive: boolean; facingYaw: number } {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.hp <= 0) return { alive: false, facingYaw: 0 };
    outPos.copy(a.position);
    return { alive: true, facingYaw: a.yaw };
  }

  public getTargetAppearance(targetId: string): CharacterAppearance | null {
    const a = this.actors.get(targetId);
    return a ? a.appearance : null;
  }

  public setPainRestricted(targetId: string, restricted: boolean): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    a.localPainRestricted = restricted;
    this.onCombatCrowdControl?.({
      targetPlayerId: a.playerId,
      kind: 'pain',
      active: restricted,
      durationMs: 5000,
    });
  }

  public setParalyzed(targetId: string, active: boolean): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    a.localParalyzeTimer = active ? 4.0 : 0;
    this.onCombatCrowdControl?.({
      targetPlayerId: a.playerId,
      kind: 'paralyze',
      active,
      durationMs: active ? 4000 : 0,
    });
  }

  public setMindControlParalysis(targetId: string, active: boolean): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    a.localMindControlParalysis = active;
    this.onCombatCrowdControl?.({
      targetPlayerId: a.playerId,
      kind: 'mind-control-paralyze',
      active,
      durationMs: active ? 5000 : 0,
    });
  }

  public setMindControlImmune(targetId: string, active: boolean): void {
    const a = this.actors.get(targetId);
    if (a) a.localMindControlImmune = active;
  }

  public setRitualHighlight(
    targetId: string,
    mode: 'none' | 'nearby' | 'selected',
  ): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    a.rig.setWhiteOutline(mode === 'selected');
  }

  public setClonesRestricted(targetId: string, active: boolean): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    a.localClonesRestricted = active;
    this.onCombatCrowdControl?.({
      targetPlayerId: a.playerId,
      kind: 'clones',
      active,
      durationMs: active ? 4000 : 0,
    });
  }

  public setAgathaDrainVictim(_targetId: string, _active: boolean): void {
    // Visual handled via Agatha drain beam
  }

  public setExternalControl(targetId: string, active: boolean): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    a.localExternalControl = active;
    if (active) {
      a.localExternalPos.copy(a.position);
      a.localExternalYaw = a.yaw;
    } else {
      a.localExternalHeadache = false;
      a.localExternalLimp = false;
      a.localExternalVampireVictim = false;
      a.localExternalPitchX = 0;
    }
    this.onCombatCrowdControl?.({
      targetPlayerId: a.playerId,
      kind: 'external-control',
      active,
      x: a.localExternalPos.x,
      y: a.localExternalPos.y,
      z: a.localExternalPos.z,
      yaw: a.localExternalYaw,
      durationMs: active ? 5500 : 0,
    });
  }

  public setExternalPose(
    targetId: string,
    pos: THREE.Vector3,
    yaw: number,
    options?: {
      headache?: boolean;
      limp?: boolean;
      vampireVictim?: boolean;
      pitchX?: number;
      moving?: boolean;
      sprinting?: boolean;
      grounded?: boolean;
      verticalVelocity?: number;
    },
  ): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    a.localExternalPos.copy(pos);
    a.localExternalYaw = yaw;
    a.localExternalHeadache = Boolean(options?.headache);
    a.localExternalLimp = Boolean(options?.limp);
    a.localExternalVampireVictim = Boolean(options?.vampireVictim);
    a.localExternalPitchX = options?.pitchX ?? 0;

    const pose = options?.vampireVictim
      ? 'grabbed'
      : options?.limp
        ? 'hang'
        : options?.headache
          ? 'kneel'
          : undefined;
    const nowMs = performance.now();
    const prevEmit = this.lastExternalPoseEmitByTarget.get(targetId);
    if (!prevEmit || prevEmit.pose !== pose || nowMs - prevEmit.atMs >= 50) {
      this.lastExternalPoseEmitByTarget.set(targetId, { atMs: nowMs, pose });
      this.onCombatCrowdControl?.({
        targetPlayerId: a.playerId,
        kind: 'external-pose',
        active: true,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw,
        pose,
        durationMs: 2500,
      });
    }
  }

  public setForcefieldState(
    targetId: string,
    state: {
      trapped?: boolean;
      abilitiesLocked?: boolean;
      externalImmune?: boolean;
      shieldHp?: number;
      shieldMaxHp?: number;
    } | null,
  ): void {
    const a = this.actors.get(targetId);
    if (!a) return;
    if (!state) {
      a.localForcefieldTrapped = false;
      a.localForcefieldMode = 'idle';
      a.localForcefieldShieldHp = 0;
      a.localForcefieldShieldMaxHp = 0;
      this.onCombatCrowdControl?.({
        targetPlayerId: a.playerId,
        kind: 'forcefield',
        active: false,
        forcefieldMode: 'none',
        forcefieldShieldHp: 0,
      });
      return;
    }
    a.localForcefieldTrapped = Boolean(state.trapped);
    a.localForcefieldShieldHp = state.shieldHp ?? a.localForcefieldShieldHp;
    a.localForcefieldShieldMaxHp = state.shieldMaxHp ?? a.localForcefieldShieldMaxHp;
    const mode =
      state.trapped && state.externalImmune
        ? 'suffocation'
        : state.trapped
          ? 'locked'
          : state.externalImmune
            ? 'protection'
            : 'none';
    a.localForcefieldMode =
      mode === 'protection'
        ? 'protection'
        : mode === 'suffocation'
          ? 'suffocation'
          : mode === 'locked'
            ? 'choosing'
            : 'idle';
    this.onCombatCrowdControl?.({
      targetPlayerId: a.playerId,
      kind: 'forcefield',
      active: mode !== 'none',
      forcefieldMode: mode,
      forcefieldShieldHp: a.localForcefieldShieldHp,
      durationMs: 4200,
    });
  }

  public getForcefieldShieldRemaining(targetId: string): number {
    const a = this.actors.get(targetId);
    return a ? a.localForcefieldShieldHp : 0;
  }

  public applyHeal(targetId: string, amount: number): number {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || amount <= 0) return 0;
    this.onCombatHeal?.({
      targetPlayerId: a.playerId,
      amount,
      source: 'forcefield-protection',
    });
    return amount;
  }

  public clearAllCrowdControl(): void {
    this.lastExternalPoseEmitByTarget.clear();
    for (const a of this.actors.values()) {
      if (
        a.localExternalControl ||
        a.localPainRestricted ||
        a.localParalyzeTimer > 0 ||
        a.localMindControlParalysis ||
        a.localClonesRestricted ||
        a.localForcefieldTrapped ||
        a.localForcefieldMode !== 'idle'
      ) {
        this.onCombatCrowdControl?.({
          targetPlayerId: a.playerId,
          kind: 'clear',
          active: false,
        });
      }
      this.resetActorTransientVisuals(a, false);
    }
  }

  public applyHeadache(targetId: string, durationSec: number): void {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead) return;
    this.onCombatHit?.({
      targetPlayerId: a.playerId,
      damage: 0,
      hitDirX: 0,
      hitDirY: 0,
      hitDirZ: -1,
      headacheSec: durationSec,
      kind: 'ai-ability',
    });
  }

  public applyBurn(targetId: string, durationSec: number, dps = 2): void {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.spawnProtected) return;
    this.onCombatHit?.({
      targetPlayerId: a.playerId,
      damage: 0,
      hitDirX: 0,
      hitDirY: 1,
      hitDirZ: 0,
      burnSec: durationSec,
      burnDps: dps,
      kind: 'ai-ability',
    });
  }

  public triggerTargetRagdoll(
    targetId: string,
    durationSec: number,
    velocity?: THREE.Vector3,
  ): void {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.spawnProtected) return;
    this.onCombatHit?.({
      targetPlayerId: a.playerId,
      damage: 0,
      hitDirX: 0,
      hitDirY: 1,
      hitDirZ: 0,
      ragdollSec: durationSec,
      knockX: velocity?.x ?? 0,
      knockY: velocity?.y ?? 0,
      knockZ: velocity?.z ?? 0,
      kind: 'ai-ability',
    });
  }

  public applyDamage(
    targetId: string,
    amount: number,
    hitDir: THREE.Vector3,
    ragdollSec = 0,
    knockImpulse?: THREE.Vector3,
    options?: {
      noAggro?: boolean;
      bypassMindControlImmunity?: boolean;
      bypassExternalImmunity?: boolean;
      bypassShield?: boolean;
      isBeam?: boolean;
      pushOnly?: boolean;
    },
  ): boolean {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.hp <= 0 || a.spawnProtected) return false;
    if (options?.pushOnly && amount <= 0 && !knockImpulse && ragdollSec <= 0) {
      return false;
    }

    a.hitFlashTimer = 0.14;
    if (amount > 0 && !options?.pushOnly) {
      a.damageDisplay.active = true;
      a.damageDisplay.total += amount;
      a.damageDisplay.timer = 1.05;
      a.damageDisplay.opacity = 1;
      a.damageDisplay.scale = 1.15;
    }

    const dirLen = hitDir.length() || 1;
    this.onCombatHit?.({
      targetPlayerId: a.playerId,
      damage: Math.max(0, amount),
      hitDirX: hitDir.x / dirLen,
      hitDirY: hitDir.y / dirLen,
      hitDirZ: hitDir.z / dirLen,
      ragdollSec: Math.max(0, ragdollSec),
      knockX: knockImpulse?.x ?? 0,
      knockY: knockImpulse?.y ?? 0,
      knockZ: knockImpulse?.z ?? 0,
      kind: 'ai-ability',
      isBeam: Boolean(options?.isBeam),
      pushOnly: Boolean(options?.pushOnly),
    });
    return true;
  }

  public pushTarget(
    targetId: string,
    displacement: THREE.Vector3,
    stunHit = false,
  ): boolean {
    const a = this.actors.get(targetId);
    if (!a || a.inSelector || a.dead || a.spawnProtected) return false;
    const len = displacement.length() || 1;
    this.onCombatHit?.({
      targetPlayerId: a.playerId,
      damage: 0,
      hitDirX: displacement.x / len,
      hitDirY: displacement.y / len,
      hitDirZ: displacement.z / len,
      knockX: displacement.x * 4.5,
      knockY: displacement.y * 4.5,
      knockZ: displacement.z * 4.5,
      paralyzeSec: stunHit ? 0.45 : 0,
      pushOnly: true,
      kind: 'ai-ability',
    });
    return true;
  }

  public applyAreaImplosion(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    ragdollSec: number,
  ): number {
    let hits = 0;
    const rSq = radius * radius;
    for (const a of this.actors.values()) {
      if (a.inSelector || a.dead || a.hp <= 0 || a.spawnProtected) continue;
      if (a.position.distanceToSquared(center) > rSq) continue;
      const pull = this._tmpA.subVectors(center, a.position).normalize().multiplyScalar(8);
      pull.y = 4;
      if (
        this.applyDamage(
          a.targetId,
          damage,
          this._tmpB.copy(pull).normalize(),
          ragdollSec,
          pull,
        )
      ) {
        hits += 1;
      }
    }
    return hits;
  }

  public applyAreaFireExplosion(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    ragdollSec: number,
    pushStrength: number,
    burnDurationSec = 0,
    burnDps = 2,
  ): number {
    let hits = 0;
    const rSq = radius * radius;
    for (const a of this.actors.values()) {
      if (a.inSelector || a.dead || a.hp <= 0 || a.spawnProtected) continue;
      if (a.position.distanceToSquared(center) > rSq) continue;
      const dir = this._tmpA.subVectors(a.position, center);
      dir.y = 0;
      if (dir.lengthSq() < 0.001) dir.set(0, 0, -1);
      dir.normalize();
      const knock = this._tmpB.copy(dir).multiplyScalar(pushStrength);
      knock.y = Math.min(8, Math.max(2.5, pushStrength * 0.45));
      if (this.applyDamage(a.targetId, damage, dir, ragdollSec, knock)) {
        hits += 1;
        if (burnDurationSec > 0) {
          this.applyBurn(a.targetId, burnDurationSec, burnDps);
        }
      }
    }
    return hits;
  }

  public applyGlobalDamage(amount: number): number {
    let hits = 0;
    const dir = this._tmpA.set(0, 0, -1);
    for (const a of this.actors.values()) {
      if (a.inSelector || a.dead || a.hp <= 0 || a.spawnProtected) continue;
      if (this.applyDamage(a.targetId, amount, dir, 0.3)) {
        hits += 1;
      }
    }
    return hits;
  }

  private updateActorVfx(a: RemotePlayerActor, safeDt: number): void {
    const v = a.vfx;
    a.rig.root.updateMatrixWorld(true);
    a.rig.leftHand.getWorldPosition(this._tmpHandL);
    a.rig.rightHand.getWorldPosition(this._tmpHandR);
    a.rig.head.getWorldPosition(this._tmpHead);
    a.rig.chest.getWorldPosition(this._tmpChest);

    const fwdX = -Math.sin(a.yaw);
    const fwdZ = -Math.cos(a.yaw);

    // 1. Props visibility on R16Rig (Cap shield, Thor Mjolnir, Surfer board, Hela crown/swords)
    if (a.capShieldInFlight) {
      a.capShieldFlightTimer = Math.max(0, a.capShieldFlightTimer - safeDt);
      if (a.capShieldFlightTimer === 0) a.capShieldInFlight = false;
    }
    if (a.thorHammerInFlight) {
      a.thorHammerFlightTimer = Math.max(0, a.thorHammerFlightTimer - safeDt);
      if (a.thorHammerFlightTimer === 0) a.thorHammerInFlight = false;
    }
    const hasStolen = (id: string): boolean =>
      a.stolenAbilityId === id || a.stolenAbilityIds.includes(id);

    const hasCapKit =
      a.characterId === 'captain-america' ||
      hasStolen('shield-throw') ||
      hasStolen('shield-defense') ||
      hasStolen('shield-combo') ||
      hasStolen('shield-charge');
    a.rig.setCapShieldVisible(hasCapKit && !a.dead && !a.capShieldInFlight);

    const hasThorKit =
      a.characterId === 'thor' ||
      hasStolen('mjolnir-combo') ||
      hasStolen('mjolnir-throw') ||
      hasStolen('lightning-storm-beam') ||
      hasStolen('lightning-slam');
    a.rig.setThorHammerVisible(hasThorKit && !a.dead && !a.thorHammerInFlight);

    a.rig.setHelaCrownMode(a.crownMode);
    a.rig.setHelaHandSwords(a.swordHeld, a.swordHeld);
    a.rig.setSurferBoardProgress(
      a.characterId === 'silver-surfer' && a.flying && !a.dead ? 1 : 0,
      -a.localRight * 0.16,
      a.localForward * 0.12,
    );

    // 2. Invisible Woman cloak fade & shader transition
    if (a.invisible && !a.wasInvisible) {
      a.wasInvisible = true;
      a.cloakPhase = 'vanishing';
      a.cloakTimer = 0;
      this.ensureInvisible(a).spawnCloakParticles(a.position, 1.8, 'down', 6);
    } else if (!a.invisible && a.wasInvisible) {
      a.wasInvisible = false;
      a.cloakPhase = 'revealing';
      a.cloakTimer = 0;
      this.ensureInvisible(a).spawnCloakParticles(a.position, 0.2, 'up', 6);
    }

    let cutY = 2.4;
    if (a.cloakPhase === 'vanishing') {
      a.cloakTimer += safeDt;
      const p = THREE.MathUtils.clamp(a.cloakTimer / 0.45, 0, 1);
      cutY = THREE.MathUtils.lerp(2.3, -0.1, p);
      if (p >= 1) a.cloakPhase = 'cloaked';
    } else if (a.cloakPhase === 'cloaked') {
      cutY = -0.1;
    } else if (a.cloakPhase === 'revealing') {
      a.cloakTimer += safeDt;
      const p = THREE.MathUtils.clamp(a.cloakTimer / 0.4, 0, 1);
      cutY = THREE.MathUtils.lerp(-0.1, 2.3, p);
      if (p >= 1) a.cloakPhase = 'idle';
    }
    a.rig.setInvisibilityCloak(a.cloakPhase !== 'idle', cutY, a.position.y, 0.06);

    if (a.teleportFadeDir === -1) {
      a.teleportFadeTimer += safeDt;
      a.teleportAlpha = Math.max(0, 1 - a.teleportFadeTimer / 0.22);
      if (a.teleportFadeTimer >= 0.22) {
        a.teleportFadeDir = 0;
      }
    } else if (a.teleportFadeDir === 1) {
      a.teleportFadeTimer += safeDt;
      a.teleportAlpha = Math.min(1, a.teleportFadeTimer / 0.24);
      if (a.teleportFadeTimer >= 0.24) {
        a.teleportAlpha = 1;
        a.teleportFadeDir = 0;
      }
    }

    let spawnAlpha = 1;
    if (a.blueOrbMode === 'spawn' && a.blueOrbTimer > 0) {
      a.blueOrbTimer = Math.max(0, a.blueOrbTimer - safeDt);
      const p = 1 - a.blueOrbTimer / 1.0;
      this.ensureBlueOrb(a).update(
        'spawn',
        p,
        safeDt,
        a.position.x,
        a.position.y + 1.0,
        a.position.z,
      );
      spawnAlpha = THREE.MathUtils.clamp((p - 0.15) / 0.55, 0, 1);
      if (a.blueOrbTimer === 0) {
        a.blueOrbMode = 'none';
        v.blueOrb?.hide();
      }
    }

    const baseAlpha = a.invisible ? 0.06 : 1;
    a.rig.setOpacity(Math.min(baseAlpha, a.teleportAlpha, spawnAlpha));

    // 3. Darkhold Books (Scarlet crimson & Agatha purple)
    const isAgatha = a.characterId === 'agatha-harkness' || hasStolen('agatha-darkhold');
    if (a.darkholdOpen && !a.dead) {
      const book = this.ensureDarkhold(a, isAgatha ? 'purple' : 'crimson');
      book.setOpen(true);
      book.update(safeDt, a.position, a.yaw, false);
      if (v.darkholdCrimson && isAgatha) v.darkholdCrimson.setOpen(false);
      if (v.darkholdPurple && !isAgatha) v.darkholdPurple.setOpen(false);
    } else {
      v.darkholdCrimson?.setOpen(false);
      v.darkholdCrimson?.update(safeDt, a.position, a.yaw, false);
      v.darkholdPurple?.setOpen(false);
      v.darkholdPurple?.update(safeDt, a.position, a.yaw, false);
    }

    // 4. Phoenix Wings & Hand Fire Auras
    const isPhoenix = a.characterId === 'phoenix-force' || a.wingsVisible;
    if (isPhoenix && !a.dead) {
      this.ensurePhoenixRigAttachments(a);
      this.ensurePhoenix(a);
    }
    const speedNorm = THREE.MathUtils.clamp(
      Math.hypot(a.velocity.x, a.velocity.z) / 14,
      0,
      1,
    );
    v.phoenixWings?.update(safeDt, a.wingsVisible && !a.dead, a.flying, speedNorm, 0);
    const fireIntensity = a.flying || (a.sustainedFlags & SUSTAINED_FLAGS.painChannel) !== 0 ? 1.0 : 0.45;
    v.phoenixHandLeft?.update(safeDt, isPhoenix && !a.dead ? fireIntensity : 0, 0.24);
    v.phoenixHandRight?.update(safeDt, isPhoenix && !a.dead ? fireIntensity : 0, 0.24);

    // 5. Real Hero Shields (fall back to simple shieldMesh only when hero VFX shield isn't used)
    let usesHeroVfxShield = false;
    if (!a.dead && a.shieldKind === 'auto-shield') {
      usesHeroVfxShield = true;
      this.ensureScarletShield(a, 'crimson').update(safeDt, true, a.position, 1);
    } else {
      v.scarletShield?.update(safeDt, false, a.position, 0);
    }

    if (!a.dead && a.shieldKind === 'agatha-auto-shield') {
      usesHeroVfxShield = true;
      this.ensureScarletShield(a, 'purple').update(safeDt, true, a.position, 1);
    } else {
      v.agathaAutoShield?.update(safeDt, false, a.position, 0);
    }

    if (!a.dead && a.shieldKind === 'mystic-shield') {
      usesHeroVfxShield = true;
      this.ensureStrange(a).setShieldActive(true);
    } else if (v.strange) {
      v.strange.setShieldActive(false);
    }

    if (!a.dead && a.shieldKind === 'magneto-shield') {
      usesHeroVfxShield = true;
      this.ensureMagneto(a).setShieldActive(true);
    } else if (v.magneto) {
      v.magneto.setShieldActive(false);
    }

    if (!a.dead && a.shieldKind === 'agatha-shield') {
      usesHeroVfxShield = true;
      this.ensureAgatha(a).updateAbsorptionShield(true, a.position, safeDt);
    } else if (v.agatha) {
      v.agatha.updateAbsorptionShield(false, a.position, safeDt);
    }

    const forcefieldOwnerActive = !a.dead && a.shieldKind === 'forcefield-shield';
    const forcefieldTargetActive =
      !a.dead && (a.localForcefieldTrapped || a.localForcefieldMode !== 'idle');
    if (forcefieldOwnerActive) usesHeroVfxShield = true;
    const invisPlatform = a.characterId === 'invisible-woman' && a.flying && !a.dead;
    if (
      invisPlatform ||
      forcefieldOwnerActive ||
      forcefieldTargetActive ||
      a.cloakPhase !== 'idle' ||
      v.invisible
    ) {
      this.ensureInvisible(a).update(
        safeDt,
        a.position,
        invisPlatform,
        forcefieldOwnerActive,
        { active: a.cloakPhase !== 'idle', phase: a.cloakPhase, cutLocalY: cutY },
        {
          active: forcefieldTargetActive,
          mode: a.localForcefieldMode,
          torsoPos: this._tmpChest,
          headPos: this._tmpHead,
          hasTarget: forcefieldTargetActive,
        },
        EMPTY_PROBES,
        NOOP,
      );
    }

    if (a.shieldKind === 'diamond-form' || a.shieldKind === 'shield-defense' || a.shieldKind === 'silver-absorb') {
      usesHeroVfxShield = true;
    }

    if (a.shieldKind && !a.dead && !usesHeroVfxShield) {
      a.shieldMesh.visible = true;
      a.shieldMat.color.set(SHIELD_HEX_COLORS[a.shieldKind]);
      a.shieldMesh.rotation.y += safeDt * 1.1;
    } else {
      a.shieldMesh.visible = false;
    }

    // 6. Sustained Beams / Channels / Tornadoes
    // Chaos Drain & Zombie Beam
    if (a.chaosDrainTimer > 0) {
      a.chaosDrainTimer = Math.max(0, a.chaosDrainTimer - safeDt);
      if (a.chaosDrainTimer === 0) a.chaosDrainActive = false;
    }
    const supremeDrainFlag = (a.sustainedFlags & SUSTAINED_FLAGS.supremeDrain) !== 0;
    const zombieBeamFlag = (a.sustainedFlags & SUSTAINED_FLAGS.zombieBeam) !== 0;
    if (supremeDrainFlag || a.chaosDrainActive || zombieBeamFlag || a.zombieBeamTimer > 0) {
      const darkCrimson = supremeDrainFlag || a.chaosDrainActive;
      const beam = this.ensureChaosDrain(a, darkCrimson);
      beam.setActive(true);
      const tPos = this._tmpD.set(
        a.position.x + fwdX * 12,
        a.position.y + 1.15,
        a.position.z + fwdZ * 12,
      );
      if (a.targetIdRef) {
        const tgt = this.actorsByPlayerId.get(a.targetIdRef);
        if (tgt) tPos.set(tgt.position.x, tgt.position.y + 1.1, tgt.position.z);
      } else if (a.chaosDrainActive) {
        tPos.copy(a.chaosDrainTargetPos);
      } else if (a.zombieBeamTimer > 0) {
        tPos.copy(a.zombieBeamTargetPos);
      }
      beam.update(safeDt, this._tmpHandR, tPos);
    } else if (v.chaosDrain) {
      v.chaosDrain.setActive(false);
    }
    if (a.zombieBeamTimer > 0) {
      a.zombieBeamTimer = Math.max(0, a.zombieBeamTimer - safeDt);
    }

    // Vision Mind Stone Laser & Charge
    const mindLaserOn = (a.sustainedFlags & SUSTAINED_FLAGS.mindLaser) !== 0 || a.visionLaserTimer > 0;
    if (a.visionLaserTimer > 0) a.visionLaserTimer = Math.max(0, a.visionLaserTimer - safeDt);
    if (a.visionChargeTimer > 0) a.visionChargeTimer = Math.max(0, a.visionChargeTimer - safeDt);
    if (mindLaserOn || v.vision || a.visionChargeTimer > 0) {
      const vis = this.ensureVision(a);
      vis.setLaserActive(mindLaserOn);
      vis.setBoltCharging(a.visionChargeTimer > 0, 1 - a.visionChargeTimer / 0.52);
      const laserEnd = a.hasVisionLaserTarget
        ? this._tmpD.copy(a.visionLaserTargetPos)
        : this._tmpD.set(
            this._tmpHead.x + fwdX * 26,
            this._tmpHead.y,
            this._tmpHead.z + fwdZ * 26,
          );
      vis.update(safeDt, this._tmpHead, laserEnd, EMPTY_PROBES, {});
    }

    // Supreme Ritual VFX
    if (a.ritualEffectTimer > 0) {
      a.ritualEffectTimer = Math.max(0, a.ritualEffectTimer - safeDt);
      if (a.ritualEffectTimer === 0) a.ritualEffectKind = 'none';
    }
    if ((a.ritualPhase !== 'none' && a.ritualPhase !== 'idle') || v.supremeRitual) {
      this.ensureSupremeRitual(a).update(
        safeDt,
        a.ritualPhase === 'kneel-summon' ||
          a.ritualPhase === 'ignite-gesture' ||
          a.ritualPhase === 'meditate'
          ? (a.ritualPhase === 'meditate' ? 'selecting' : a.ritualPhase)
          : 'idle',
        0.5,
        0.9,
        0.6,
        EMPTY_PROBES as unknown as THREE.Vector3[],
        a.ritualEffectTimer > 0 ? a.ritualEffectPos : null,
        {
          kind: a.ritualEffectKind,
          pos: a.ritualEffectTimer > 0 ? a.ritualEffectPos : null,
          remaining: a.ritualEffectTimer,
        },
      );
    }

    // Magneto Tornado + Projectiles/Meteors
    const magTornadoOn = (a.sustainedFlags & SUSTAINED_FLAGS.metalTornado) !== 0;
    if (magTornadoOn || v.magneto) {
      const mag = this.ensureMagneto(a);
      mag.setTornadoActive(magTornadoOn);
      mag.update(safeDt, a.position, EMPTY_PROBES, {
        onProjectileHit: NOOP,
        onMeteorImpact: NOOP,
      });
    }

    // Quicksilver Wind Tornado & Super Speed lightning (works for Quicksilver or Rogue stolen Quicksilver powers)
    const hasStolenQs =
      hasStolen('super-speed') ||
      hasStolen('rapid-punch-combo') ||
      hasStolen('speed-blitz') ||
      hasStolen('wind-tornado') ||
      hasStolen('time-stop');
    const qsTornadoOn =
      (a.sustainedFlags & SUSTAINED_FLAGS.stormTornado) === 0 &&
      (a.characterId === 'quicksilver' || hasStolenQs) &&
      a.superSpeed;
    if (a.characterId === 'quicksilver' || hasStolenQs || v.quicksilver) {
      const qsPal: 'blue' | 'green' =
        (a.characterId === 'quicksilver' ? a.skinId : a.stolenSourceSkinId) === 'speed'
          ? 'green'
          : 'blue';
      const qs = this.ensureQuicksilver(a, qsPal);
      if ((a.sustainedFlags & SUSTAINED_FLAGS.rapidPunch) !== 0) {
        a.qsWindTornadoActive = false;
        qs.setWindTornado(false);
      } else if (a.qsWindTornadoActive) {
        qs.setWindTornado(true, a.position);
      }
      const horizSpeed = Math.hypot(a.velocity.x, a.velocity.z);
      qs.update(
        safeDt,
        a.position,
        a.yaw,
        horizSpeed,
        a.superSpeed || qsTornadoOn,
        EMPTY_PROBES,
        {},
      );
    }

    // Thor Mjolnir, Slam & Storm Beam
    if (a.thorStormChannelTimer > 0) {
      a.thorStormChannelTimer = Math.max(0, a.thorStormChannelTimer - safeDt);
    }
    if (a.thorStormBeamTimer > 0) {
      a.thorStormBeamTimer = Math.max(0, a.thorStormBeamTimer - safeDt);
    }
    if (a.thorSlamTimer > 0) {
      a.thorSlamTimer = Math.max(0, a.thorSlamTimer - safeDt);
      if (a.thorSlamTimer === 0) a.thorSlamPhase = 'idle';
    }
    if (a.characterId === 'thor' || v.thor || a.thorStormBeamTimer > 0) {
      const th = this.ensureThor(a);
      th.updateStormBeam(
        a.thorStormBeamTimer > 0,
        this._tmpChest,
        a.thorStormBeamDir,
        36,
        safeDt,
      );
      th.update(
        safeDt,
        a.position,
        this._tmpHandR,
        a.flying || a.thorStormChannelTimer > 0 || a.thorStormBeamTimer > 0,
        EMPTY_PROBES,
        NOOP,
        NOOP,
        () => {
          a.thorHammerInFlight = false;
        },
      );
    }

    // Captain America Shield Throw & Charge
    const capChargeOn = (a.sustainedFlags & SUSTAINED_FLAGS.capShieldCharge) !== 0;
    if (a.characterId === 'captain-america' || v.cap || capChargeOn) {
      this.ensureCap(a).update(
        safeDt,
        this._tmpHandL,
        a.position,
        a.yaw,
        capChargeOn,
        EMPTY_PROBES,
        NOOP,
        () => {
          a.capShieldInFlight = false;
        },
      );
    }

    // Silver Surfer Flight Trail, Absorption Aura, Cosmic Charge, Dual Cosmic Beam
    const silverAbsorbOn =
      (a.sustainedFlags & SUSTAINED_FLAGS.silverAbsorb) !== 0 ||
      a.shieldKind === 'silver-absorb';
    const silverDualBeamOn =
      (a.sustainedFlags & SUSTAINED_FLAGS.silverDualBeam) !== 0 ||
      a.silverDualBeamTimer > 0;
    if (a.silverDualBeamTimer > 0) {
      a.silverDualBeamTimer = Math.max(0, a.silverDualBeamTimer - safeDt);
    }
    if (a.silverCosmicChargeTimer > 0) {
      a.silverCosmicChargeTimer = Math.max(0, a.silverCosmicChargeTimer - safeDt);
    }
    if (a.characterId === 'silver-surfer' || v.silver || silverAbsorbOn || silverDualBeamOn) {
      const ss = this.ensureSilver(a);
      ss.updateCosmicFlightTrail(
        a.flying && !a.dead,
        a.position,
        this._tmpD.set(fwdX, 0, fwdZ),
        Math.hypot(a.velocity.x, a.velocity.z),
        safeDt,
      );
      ss.updateAbsorptionAura(
        silverAbsorbOn,
        this._tmpChest,
        silverAbsorbOn ? 0.65 : 0,
        safeDt,
      );
      ss.updateCosmicCharge(
        a.silverCosmicChargeTimer > 0,
        this._tmpChest,
        a.silverCosmicChargeTimer > 0 ? Math.min(1, 1 - a.silverCosmicChargeTimer / 1.2) : 0,
      );
      const beamAim = this._tmpD.set(
        this._tmpChest.x + a.silverDualBeamDir.x * 28,
        this._tmpChest.y + a.silverDualBeamDir.y * 28,
        this._tmpChest.z + a.silverDualBeamDir.z * 28,
      );
      ss.updateDualCosmicBeam(
        silverDualBeamOn,
        this._tmpHandL,
        this._tmpHandR,
        beamAim,
        safeDt,
      );
      ss.update(safeDt, EMPTY_PROBES, NOOP, NOOP);
    }

    // Storm Tornado, Ice Spear Create, Wind Blast & Flight Wind
    const stormTornadoOn = (a.sustainedFlags & SUSTAINED_FLAGS.stormTornado) !== 0;
    const stormWindOn = (a.sustainedFlags & SUSTAINED_FLAGS.stormWindBlast) !== 0;
    if (a.stormIceCreateTimer > 0) {
      a.stormIceCreateTimer = Math.max(0, a.stormIceCreateTimer - safeDt);
    }
    if (a.stormLightningRiseTimer > 0) {
      a.stormLightningRiseTimer = Math.max(0, a.stormLightningRiseTimer - safeDt);
    }
    if (
      a.characterId === 'storm' ||
      v.storm ||
      stormTornadoOn ||
      stormWindOn ||
      a.stormIceCreateTimer > 0
    ) {
      const st = this.ensureStorm(a);
      st.updateFlightWind(
        a.flying && !a.dead,
        a.position,
        Math.hypot(a.velocity.x, a.velocity.z),
        safeDt,
      );
      st.updateTornado(stormTornadoOn, a.position, safeDt, EMPTY_PROBES, NOOP, NOOP);
      st.updateIceSpearCreation(
        a.stormIceCreateTimer > 0,
        this._tmpHandR,
        this._tmpD.set(this._tmpHandR.x + fwdX * 8, this._tmpHandR.y, this._tmpHandR.z + fwdZ * 8),
        a.stormIceCreateTimer > 0 ? 1 : 0,
      );
      const wDir =
        a.stormWindDir.lengthSq() > 0.01
          ? a.stormWindDir
          : this._tmpD.set(fwdX, 0, fwdZ);
      st.updateWindBlast(stormWindOn, this._tmpChest, wDir, safeDt, EMPTY_PROBES, NOOP);
      st.update(safeDt, EMPTY_PROBES, NOOP);
    }

    // Vampire Wind Trails + Neck-Grip Siphon + Projectiles
    const vampAbsorbOn =
      (a.sustainedFlags & SUSTAINED_FLAGS.vampireAbsorb) !== 0 ||
      Boolean(a.vampireAbsorbTargetId);
    const vampFlyOn = a.characterId === 'vampire' && a.flying && !a.dead;
    if (vampFlyOn || vampAbsorbOn || v.vampire) {
      const vTarget = a.vampireAbsorbTargetId
        ? this.actorsByPlayerId.get(a.vampireAbsorbTargetId)
        : undefined;
      const tWorld = this._tmpD.copy(
        vTarget ? vTarget.position : a.vampireAbsorbTargetPos,
      );
      tWorld.y += 1.25;
      this.ensureVampire(a).update(
        safeDt,
        a.position,
        a.velocity,
        vampFlyOn,
        false,
        {
          active: vampAbsorbOn,
          handWorld: this._tmpHandR,
          targetWorld: tWorld,
          healerPos: this._tmpChest,
        },
        EMPTY_PROBES,
        NOOP,
      );
    }

    // Phoenix Pain Telekinetic & Special Revival
    const painActive =
      !a.dead &&
      ((a.sustainedFlags & SUSTAINED_FLAGS.painChannel) !== 0 || Boolean(a.painTargetId));
    if (painActive) {
      const tgtId = a.painTargetId ?? a.targetIdRef;
      const tgt = tgtId ? this.actorsByPlayerId.get(tgtId) : undefined;
      if (tgt) {
        tgt.rig.head.getWorldPosition(this._tmpD);
      } else if (a.painTargetPos.lengthSq() > 0.01) {
        this._tmpD.copy(a.painTargetPos);
      } else {
        this._tmpD.set(a.position.x + fwdX * 8, a.position.y + 1.65, a.position.z + fwdZ * 8);
      }
      this.ensurePhoenix(a).updatePainTelekinetic(true, this._tmpHead, this._tmpD, safeDt);
    } else if (v.phoenix) {
      v.phoenix.updatePainTelekinetic(false, null, null, safeDt);
    }

    if (a.phoenixRevivePhase !== 'none') {
      a.phoenixReviveElapsed += safeDt;
      const revSphere = this._tmpD.set(
        a.phoenixRevivePos.x,
        a.phoenixRevivePos.y + 1.0 + Math.min(1.0, a.phoenixReviveElapsed / 1.2) * 14,
        a.phoenixRevivePos.z,
      );
      this.ensurePhoenix(a).updateSpecialRevival(
        safeDt,
        a.phoenixRevivePhase,
        revSphere,
        a.phoenixRevivePos,
        a.yaw,
        a.phoenixReviveElapsed,
        4.0,
      );
      if (a.phoenixRevivePhase === 'manifest' && a.phoenixReviveElapsed >= 4.4) {
        a.phoenixRevivePhase = 'none';
      }
    } else if (v.phoenix) {
      v.phoenix.updateSpecialRevival(safeDt, 'none', null, null, a.yaw, 0, 4.0);
    }

    // Emma Frost Mind Control Beam
    if (a.hasMindControlTarget && !a.dead) {
      const tgt = a.targetIdRef ? this.actorsByPlayerId.get(a.targetIdRef) : undefined;
      const mcPos = tgt ? this._tmpD.set(tgt.position.x, tgt.position.y + 1.65, tgt.position.z) : a.mindControlTargetPos;
      this.ensureEmma(a).setMindControlBeam(true, this._tmpHead, mcPos);
    } else if (v.emma) {
      v.emma.setMindControlBeam(false);
    }

    // Hela Green Explosion Hand Gather
    if (a.greenChargeActive && !a.dead) {
      a.greenChargeElapsed += safeDt;
      this.ensureHela(a).updateHandGather(
        safeDt,
        true,
        this._tmpHandR,
        Math.min(1, a.greenChargeElapsed / 0.65),
      );
      if (a.greenChargeElapsed >= 1.2) {
        a.greenChargeActive = false;
      }
    } else if (v.hela) {
      v.hela.updateHandGather(safeDt, false, null, 0);
    }

    // Doctor Strange Astral Extraction Soul
    if (a.astralExtractActive) {
      a.astralExtractElapsed += safeDt;
      this.ensureStrange(a).updateAstralExtractionSoul(
        safeDt,
        a.astralExtractElapsed,
        a.astralExtractPos,
        a.astralExtractYaw,
        a.astralExtractDir,
      );
      if (a.astralExtractElapsed >= 2.25) {
        a.astralExtractActive = false;
        v.strange?.stopAstralExtractionSoul();
      }
    }

    // Update other active per-actor VFX emitters
    v.scarlet?.update(safeDt, a.position, a.characterId === 'scarlet-witch' && a.flying, EMPTY_PROBES, NOOP, NOOP);
    v.stoneChaos?.update(safeDt, a.position);
    v.agatha?.update(safeDt, a.position, a.characterId === 'agatha-harkness' && a.flying, EMPTY_PROBES, NOOP);
    v.phoenix?.update(safeDt, a.position, a.characterId === 'phoenix-force' && a.flying, EMPTY_PROBES, NOOP);
    v.emma?.update(safeDt, EMPTY_PROBES, NOOP);
    v.hela?.update(safeDt, EMPTY_PROBES, () => ({ alive: false, facingYaw: 0 }), NOOP);
    v.strange?.update(safeDt, a.position, a.yaw, EMPTY_PROBES, {});
    v.shieldHit?.update(safeDt);

    if (v.astralDecoy) {
      v.astralDecoy.animator.update(safeDt, NEUTRAL_DECOY_MOTION);
    }

    if (a.spinningLeapTimer > 0) {
      a.spinningLeapTimer = Math.max(0, a.spinningLeapTimer - safeDt);
      if (a.spinningLeapTimer === 0) {
        a.animator.setSpinningLeap(false);
      }
    }
  }

  public update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    reticleNdcX: number,
    reticleNdcY: number,
    viewportWidth: number,
    viewportHeight: number,
    maxReticleDist = 0.34,
  ): NpcHudSnapshot[] {
    const safeDt = Math.min(dt, 0.05);
    const nowMs = performance.now();
    const renderTimeMs = nowMs - 85; // ~85ms interpolation buffer (2.55 intervals at 30 Hz)
    this.cachedSnapshots.length = 0;

    let bestTargetId: string | null = null;
    let bestReticleDist = maxReticleDist;
    let shadowIdx = 0;

    for (const a of this.actors.values()) {
      if (a.inSelector) {
        a.rig.root.visible = false;
        a.shieldMesh.visible = false;
        a.spawnOrbMesh.visible = false;
        a.samples.length = 0;
        this.resetActorTransientVisuals(a, true);
        continue;
      }

      if (!a.localExternalControl && a.samples.length > 0) {
        const samples = a.samples;
        // Drop consumed samples behind the active interpolation window
        while (samples.length >= 2 && samples[1].tMs <= renderTimeMs) {
          samples.shift();
        }

        if (renderTimeMs < samples[0].tMs) {
          // Self-heal if clock offset pushed samples too far into the future
          const aheadMs = samples[0].tMs - renderTimeMs;
          if (aheadMs > 160) {
            const shift = aheadMs - 40;
            a.serverClockOffsetMs -= shift;
            for (let i = 0; i < samples.length; i++) {
              samples[i].tMs -= shift;
            }
          }
          const s0 = samples[0].state;
          a.position.set(s0.x, s0.y, s0.z);
          a.velocity.set(s0.vx, s0.vy, s0.vz);
          a.yaw = s0.yaw;
          a.turnVelocity = s0.turnVelocity ?? 0;
          a.localForward = s0.localForward;
          a.localRight = s0.localRight;
          a.grounded = s0.grounded;
          a.sprinting = s0.sprinting;
          a.flying = s0.flying;
          a.superSpeed = s0.superSpeed;
        } else if (samples.length >= 2 && renderTimeMs <= samples[1].tMs) {
          const s0 = samples[0];
          const s1 = samples[1];
          const span = Math.max(1, s1.tMs - s0.tMs);
          const alpha = THREE.MathUtils.clamp((renderTimeMs - s0.tMs) / span, 0, 1);
          a.position.set(
            THREE.MathUtils.lerp(s0.state.x, s1.state.x, alpha),
            THREE.MathUtils.lerp(s0.state.y, s1.state.y, alpha),
            THREE.MathUtils.lerp(s0.state.z, s1.state.z, alpha),
          );
          a.velocity.set(
            THREE.MathUtils.lerp(s0.state.vx, s1.state.vx, alpha),
            THREE.MathUtils.lerp(s0.state.vy, s1.state.vy, alpha),
            THREE.MathUtils.lerp(s0.state.vz, s1.state.vz, alpha),
          );
          const dy = Math.atan2(
            Math.sin(s1.state.yaw - s0.state.yaw),
            Math.cos(s1.state.yaw - s0.state.yaw),
          );
          a.yaw = Math.atan2(
            Math.sin(s0.state.yaw + dy * alpha),
            Math.cos(s0.state.yaw + dy * alpha),
          );
          a.turnVelocity = THREE.MathUtils.lerp(
            s0.state.turnVelocity ?? 0,
            s1.state.turnVelocity ?? 0,
            alpha,
          );
          a.localForward = THREE.MathUtils.lerp(
            s0.state.localForward,
            s1.state.localForward,
            alpha,
          );
          a.localRight = THREE.MathUtils.lerp(
            s0.state.localRight,
            s1.state.localRight,
            alpha,
          );
          a.grounded = alpha < 0.5 ? s0.state.grounded : s1.state.grounded;
          a.sprinting = alpha < 0.5 ? s0.state.sprinting : s1.state.sprinting;
          a.flying = alpha < 0.5 ? s0.state.flying : s1.state.flying;
          a.superSpeed = alpha < 0.5 ? s0.state.superSpeed : s1.state.superSpeed;
        } else {
          // Bounded extrapolation when packet arrives slightly after buffer window
          const s1 = samples[samples.length - 1];
          const gapSec = Math.max(0, (renderTimeMs - s1.tMs) / 1000);
          const extrapSec = Math.min(0.18, gapSec);
          const vertExtrap = s1.state.grounded ? 0 : Math.min(0.10, gapSec);
          const damp = gapSec > 0.06 ? Math.max(0.25, 1 - (gapSec - 0.06) * 3.2) : 1;
          a.position.set(
            s1.state.x + s1.state.vx * extrapSec * damp,
            s1.state.y + s1.state.vy * vertExtrap,
            s1.state.z + s1.state.vz * extrapSec * damp,
          );
          a.velocity.set(
            s1.state.vx * damp,
            s1.state.vy,
            s1.state.vz * damp,
          );
          const turnVel = s1.state.turnVelocity ?? 0;
          const yawExtrap = Math.min(0.08, gapSec);
          const rawExtrapYaw = s1.state.yaw + turnVel * yawExtrap;
          a.yaw = Math.atan2(Math.sin(rawExtrapYaw), Math.cos(rawExtrapYaw));
          a.turnVelocity = gapSec > 0.14 ? 0 : turnVel;

          if (gapSec > 0.24) {
            a.localForward = THREE.MathUtils.damp(a.localForward, 0, 10, safeDt);
            a.localRight = THREE.MathUtils.damp(a.localRight, 0, 10, safeDt);
          } else {
            a.localForward = s1.state.localForward;
            a.localRight = s1.state.localRight;
          }
          a.grounded = s1.state.grounded;
          a.sprinting = s1.state.sprinting;
          a.flying = s1.state.flying;
          a.superSpeed = s1.state.superSpeed;
        }
      }

      if (a.localExternalControl) {
        a.position.copy(a.localExternalPos);
        a.yaw = a.localExternalYaw;
      }

      a.probe.position.copy(a.position);

      if (!a.dead && a.hp > 0) {
        if (a.ragdollActive) {
          a.ragdollActive = false;
          a.wasRagdoll = false;
          a.ragdoll.reset();
        }
        a.rig.root.visible = true;
        a.rig.setOpacity(a.invisible ? 0.06 : 1);
      }

      // Edge-detect jump/landing transitions cleanly
      const jumpedNow = a.pendingJustJumped || (a.wasGrounded && !a.grounded && a.velocity.y > 1.2);
      const landedNow =
        a.pendingLandImpactSpeed > 0
          ? a.pendingLandImpactSpeed
          : !a.wasGrounded && a.grounded && a.velocity.y < -1.5
            ? Math.abs(a.velocity.y)
            : 0;
      a.pendingJustJumped = false;
      a.pendingLandImpactSpeed = 0;
      a.wasGrounded = a.grounded;

      // Ragdoll vs Animated Character
      if (a.ragdollActive) {
        if (!a.wasRagdoll) {
          a.wasRagdoll = true;
          a.ragdoll.trigger(a.position, a.velocity, a.yaw);
        }
        a.rig.setEyesClosed(true);
        a.ragdoll.update(safeDt);
      } else {
        if (a.wasRagdoll) {
          a.wasRagdoll = false;
          a.ragdoll.reset();
          a.animator.reset(
            a.rig,
            a.archetype,
            (a.skinId as CharacterSkinId | null) ?? undefined,
          );
        }

        a.rig.root.position.copy(a.position);
        a.rig.root.rotation.set(a.localExternalPitchX, a.yaw, 0);

        if (a.localParalyzeTimer > 0) {
          a.localParalyzeTimer = Math.max(0, a.localParalyzeTimer - safeDt);
        }
        if (a.localMindControlParalysisTimer > 0) {
          a.localMindControlParalysisTimer = Math.max(
            0,
            a.localMindControlParalysisTimer - safeDt,
          );
          if (a.localMindControlParalysisTimer === 0) {
            a.localMindControlParalysis = false;
          }
        }
        if (a.localPainRestrictedTimer > 0) {
          a.localPainRestrictedTimer = Math.max(0, a.localPainRestrictedTimer - safeDt);
          if (a.localPainRestrictedTimer === 0) {
            a.localPainRestricted = false;
          }
        }
        if (a.localClonesRestrictedTimer > 0) {
          a.localClonesRestrictedTimer = Math.max(0, a.localClonesRestrictedTimer - safeDt);
          if (a.localClonesRestrictedTimer === 0) {
            a.localClonesRestricted = false;
          }
        }
        if (a.localExternalControlTimer > 0) {
          a.localExternalControlTimer = Math.max(0, a.localExternalControlTimer - safeDt);
          if (a.localExternalControlTimer === 0) {
            a.localExternalControl = false;
            a.localExternalHeadache = false;
            a.localExternalLimp = false;
            a.localExternalVampireVictim = false;
            a.localExternalPitchX = 0;
          }
        }
        if (a.localForcefieldTimer > 0) {
          a.localForcefieldTimer = Math.max(0, a.localForcefieldTimer - safeDt);
          if (a.localForcefieldTimer === 0) {
            a.localForcefieldTrapped = false;
            a.localForcefieldMode = 'idle';
            a.localForcefieldShieldHp = 0;
          }
        }

        const isMotionLocked =
          a.localParalyzeTimer > 0 ||
          a.localMindControlParalysis ||
          a.localPainRestricted ||
          a.localClonesRestricted ||
          a.localForcefieldTrapped;

        if (isMotionLocked) {
          this._motion.localForward = 0;
          this._motion.localRight = 0;
        } else {
          this._motion.localForward = a.localForward;
          this._motion.localRight = a.localRight;
        }
        this._motion.verticalVelocity = a.velocity.y;
        this._motion.turnVelocity = a.turnVelocity;
        this._motion.grounded = a.grounded;
        this._motion.justJumped = jumpedNow;
        this._motion.landImpactSpeed = landedNow;
        this._motion.flying = a.flying;
        this._motion.sprinting = a.sprinting;
        this._motion.superSpeed = a.superSpeed;

        a.animator.setPainChanneling((a.sustainedFlags & SUSTAINED_FLAGS.painChannel) !== 0);
        a.animator.setTelepathicWave((a.sustainedFlags & SUSTAINED_FLAGS.telepathicWave) !== 0);
        a.animator.setMetalTornado((a.sustainedFlags & SUSTAINED_FLAGS.metalTornado) !== 0);
        a.animator.setRapidPunch((a.sustainedFlags & SUSTAINED_FLAGS.rapidPunch) !== 0);
        a.animator.setHeadGrip((a.sustainedFlags & SUSTAINED_FLAGS.headGrip) !== 0);
        a.animator.setMindLaser((a.sustainedFlags & SUSTAINED_FLAGS.mindLaser) !== 0);
        a.animator.setAgathaAbsorb((a.sustainedFlags & SUSTAINED_FLAGS.agathaAbsorb) !== 0);
        a.animator.setSupremeDrain((a.sustainedFlags & SUSTAINED_FLAGS.supremeDrain) !== 0);
        a.animator.setZombieBeam((a.sustainedFlags & SUSTAINED_FLAGS.zombieBeam) !== 0);
        a.animator.setVampireAbsorb((a.sustainedFlags & SUSTAINED_FLAGS.vampireAbsorb) !== 0);
        a.animator.setCapShieldCharge((a.sustainedFlags & SUSTAINED_FLAGS.capShieldCharge) !== 0);
        a.animator.setSilverAbsorb((a.sustainedFlags & SUSTAINED_FLAGS.silverAbsorb) !== 0);
        a.animator.setSilverDualBeam((a.sustainedFlags & SUSTAINED_FLAGS.silverDualBeam) !== 0);
        a.animator.setStormTornado((a.sustainedFlags & SUSTAINED_FLAGS.stormTornado) !== 0);
        a.animator.setStormWindBlast((a.sustainedFlags & SUSTAINED_FLAGS.stormWindBlast) !== 0);
        a.animator.setSwordHeld(a.swordHeld);
        a.animator.setCapShieldDefense(a.shieldKind === 'shield-defense');
        a.animator.setForcefieldShield(a.shieldKind === 'forcefield-shield');
        a.animator.setSilverCosmicCharge(a.silverCosmicChargeTimer > 0);
        a.animator.setVisionBoltCharge(a.visionChargeTimer > 0);
        a.animator.setStormLightningRise(a.stormLightningRiseTimer > 0);
        a.animator.setThorSlamPhase(a.thorSlamPhase);
        a.animator.setThorStormBeamPhase(
          a.thorStormChannelTimer > 0
            ? 'channel'
            : a.thorStormBeamTimer > 0
              ? 'beam'
              : 'idle',
        );
        a.animator.setHeadache(
          a.localExternalHeadache ||
            a.localPainRestricted ||
            a.localParalyzeTimer > 0 ||
            a.localMindControlParalysis,
        );
        a.animator.setAstralLimp(a.localExternalLimp);
        a.animator.setVampireVictim(a.localExternalVampireVictim);
        const validRitualPhase =
          a.ritualPhase === 'kneel-summon' ||
          a.ritualPhase === 'ignite-gesture' ||
          a.ritualPhase === 'meditate'
            ? a.ritualPhase
            : 'none';
        a.animator.setRitualPhase(validRitualPhase);
        a.rig.setEyesClosed(validRitualPhase !== 'none');

        a.animator.update(safeDt, this._motion);
      }

      // Character visual states & real 3D VFX
      a.rig.setDiamondForm(a.shieldKind === 'diamond-form' ? 1 : 0);
      this.updateActorVfx(a, safeDt);

      a.spawnOrbMesh.visible = a.spawnProtected && !a.dead;
      if (a.spawnOrbMesh.visible) {
        const pulse = 1 + Math.sin(nowMs * 0.01) * 0.08;
        a.spawnOrbMesh.scale.setScalar(pulse);
      }

      if (a.hitFlashTimer > 0) {
        a.hitFlashTimer = Math.max(0, a.hitFlashTimer - safeDt);
        a.rig.setHitFlash(a.hitFlashTimer / 0.14);
      } else {
        a.rig.setHitFlash(0);
      }

      if (a.trailHoldTimer > 0) {
        a.trailHoldTimer = Math.max(0, a.trailHoldTimer - safeDt);
      } else if (a.trailHp > a.hp) {
        a.trailHp = Math.max(a.hp, a.trailHp - 85 * safeDt);
      }

      if (a.damageDisplay.active) {
        a.damageDisplay.timer -= safeDt;
        a.damageDisplay.offsetY -= 24 * safeDt;
        a.damageDisplay.opacity = THREE.MathUtils.clamp(
          a.damageDisplay.timer / 0.35,
          0,
          1,
        );
        a.damageDisplay.scale = Math.max(1, a.damageDisplay.scale - safeDt * 0.6);
        if (a.damageDisplay.timer <= 0) {
          a.damageDisplay.active = false;
          a.damageDisplay.total = 0;
          a.damageDisplay.offsetY = 0;
        }
      }

      // Landing dust & heavy impact cracks synced for remote players
      const groundY = this.groundHeightProvider
        ? this.groundHeightProvider(a.position.x, a.position.z, a.position.y + 0.6)
        : 0;
      if (landedNow > 1.2 && !a.dead && !a.invisible) {
        this.landingDust.spawn(
          a.position,
          groundY,
          THREE.MathUtils.clamp(landedNow / 14, 0.55, 1.45),
        );
        if (landedNow > 19) {
          this.rockBreakVfx.spawnImpact(
            a.position,
            THREE.MathUtils.clamp((landedNow - 15) / 14, 0.85, 1.9),
          );
        }
      }

      // Contact shadow anchored to actual terrain/platform height
      if (!a.dead && !a.invisible && shadowIdx < 32) {
        const height = Math.max(0, a.position.y - groundY);
        const sScale = THREE.MathUtils.clamp(1.12 - height * 0.06, 0.35, 1.12);
        this.shadowDummy.position.set(a.position.x, groundY + 0.03, a.position.z);
        this.shadowDummy.rotation.set(0, 0, 0);
        this.shadowDummy.scale.setScalar(sScale);
        this.shadowDummy.updateMatrix();
        this.contactShadowMesh.setMatrixAt(shadowIdx, this.shadowDummy.matrix);
        shadowIdx += 1;
      }

      // HUD Projection
      this._proj.set(a.position.x, a.position.y + 2.35, a.position.z).project(camera);
      const visible =
        !a.invisible &&
        this._proj.z >= -1 &&
        this._proj.z <= 1 &&
        Math.abs(this._proj.x) <= 1.08 &&
        Math.abs(this._proj.y) <= 1.08;
      const sx = (this._proj.x * 0.5 + 0.5) * viewportWidth;
      const sy = (-this._proj.y * 0.5 + 0.5) * viewportHeight;

      if (visible && !a.dead && a.hp > 0) {
        const dNdc = Math.hypot(
          this._proj.x - reticleNdcX,
          this._proj.y - reticleNdcY,
        );
        if (dNdc < bestReticleDist) {
          bestReticleDist = dNdc;
          bestTargetId = a.targetId;
        }
      }

      const distCam = camera.position.distanceTo(a.position);
      const hudScale = THREE.MathUtils.clamp(14 / Math.max(6, distCam), 0.55, 1.08);
      this.cachedSnapshots.push({
        id: a.targetId,
        name: a.name,
        category: 'ai-hero',
        visible,
        screenX: sx,
        screenY: sy,
        scale: hudScale,
        hp: a.hp,
        maxHp: a.maxHp,
        trailHp: a.trailHp,
        isTargeted: false,
        damageNumber: {
          active: a.damageDisplay.active,
          total: a.damageDisplay.total,
          offsetX: a.damageDisplay.offsetX,
          offsetY: a.damageDisplay.offsetY,
          scale: a.damageDisplay.scale,
          opacity: a.damageDisplay.opacity,
        },
      });
    }

    this.selectedTargetId = bestTargetId;
    for (let i = 0; i < this.cachedSnapshots.length; i++) {
      this.cachedSnapshots[i].isTargeted =
        this.cachedSnapshots[i].id === bestTargetId;
    }

    this.contactShadowMesh.count = shadowIdx;
    this.contactShadowMesh.instanceMatrix.needsUpdate = true;

    this.rockBreakVfx.update(safeDt);
    this.landingDust.update(safeDt);

    // Update fallback ephemeral remote VFX
    for (let i = this.activeVfx.length - 1; i >= 0; i--) {
      const fx = this.activeVfx[i];
      fx.elapsed += safeDt;
      const t = fx.elapsed / fx.duration;
      if (t >= 1) {
        this.group.remove(fx.mesh);
        fx.mat.dispose();
        this.activeVfx.splice(i, 1);
        continue;
      }
      if (fx.kind === 'bolt' && fx.vel) {
        fx.mesh.position.addScaledVector(fx.vel, safeDt);
        fx.mat.opacity = 1 - t * 0.7;
      } else if (fx.kind === 'explosion' || fx.kind === 'shockwave') {
        const s = 0.5 + (fx.maxRadius ?? 4) * t;
        fx.mesh.scale.setScalar(s);
        fx.mat.opacity = (1 - t) * 0.85;
      } else if (fx.kind === 'lightning') {
        fx.mat.opacity = (1 - t) * 0.92;
      }
    }

    return this.cachedSnapshots;
  }

  public dispose(): void {
    this.clearAll();
    this.rockBreakVfx.dispose();
    this.landingDust.dispose();
    this.contactShadowMesh.dispose();
    this.contactShadowGeo.dispose();
    this.contactShadowMat.dispose();
    this.shieldGeo.dispose();
    this.spawnOrbGeo.dispose();
    this.vfxSphereGeo.dispose();
    this.vfxRingGeo.dispose();
    this.vfxBoltGeo.dispose();
  }
}
