import * as THREE from 'three';
import { MapId, TEST_MAP_HALF_INNER } from './maps';
import {
  ARENA_PILLAR_COLLIDERS,
  BASEPLATE_HALF_INNER,
  getGroundSurfaceY,
} from './physics';
import { TEST_MAP_OBSTACLE_COLLIDERS } from './maps';

export const POTION_MAX_COUNT = 10;
export const POTION_RESPAWN_DELAY_SEC = 14;
export const POTION_INTERACT_RADIUS = 3.5;
export const POTION_HOLD_DURATION_SEC = 3.0;
export const POTION_HEAL_AMOUNT = 100;
export const POTION_COST_COINS = 300;

export interface PotionPromptSnapshot {
  visible: boolean;
  potionId: string | null;
  screenX: number;
  screenY: number;
  distance: number;
  progress: number;
  holding: boolean;
}

interface PotionBubble {
  mesh: THREE.Mesh;
  baseY: number;
  speed: number;
  phase: number;
  radius: number;
  angle: number;
}

interface PotionEntity {
  id: string;
  root: THREE.Group;
  hoverGroup: THREE.Group;
  ringMesh: THREE.Mesh;
  haloSprite: THREE.Sprite;
  bubbles: PotionBubble[];
  position: THREE.Vector3;
  phase: number;
}

interface SplashParticle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  elapsed: number;
  duration: number;
}

function createNeonHaloTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.04,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  grad.addColorStop(0, 'rgba(110, 255, 130, 0.85)');
  grad.addColorStop(0.32, 'rgba(57, 255, 20, 0.42)');
  grad.addColorStop(0.7, 'rgba(20, 220, 70, 0.12)');
  grad.addColorStop(1, 'rgba(0, 255, 60, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PotionSystem {
  public readonly group = new THREE.Group();

  private readonly mapId: MapId;
  private readonly potions: PotionEntity[] = [];
  private readonly pendingRespawns: number[] = [];
  private readonly splashParticles: SplashParticle[] = [];
  private nextId = 1;
  private elapsed = 0;

  private activePotionId: string | null = null;
  private holdElapsed = 0;

  // Shared geometries & materials for crisp cartoon rendering
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly haloTex: THREE.CanvasTexture;

  private readonly outlineMat: THREE.MeshBasicMaterial;
  private readonly glassMat: THREE.MeshStandardMaterial;
  private readonly liquidMat: THREE.MeshStandardMaterial;
  private readonly meniscusMat: THREE.MeshStandardMaterial;
  private readonly bubbleMat: THREE.MeshBasicMaterial;
  private readonly highlightMat: THREE.MeshBasicMaterial;
  private readonly corkMat: THREE.MeshStandardMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly haloMat: THREE.SpriteMaterial;

  private readonly bodyGeo: THREE.CylinderGeometry;
  private readonly bodyOutlineGeo: THREE.CylinderGeometry;
  private readonly bottomCapGeo: THREE.CylinderGeometry;
  private readonly bottomCapOutlineGeo: THREE.CylinderGeometry;
  private readonly shoulderGeo: THREE.CylinderGeometry;
  private readonly shoulderOutlineGeo: THREE.CylinderGeometry;
  private readonly neckGeo: THREE.CylinderGeometry;
  private readonly neckOutlineGeo: THREE.CylinderGeometry;
  private readonly lipGeo: THREE.TorusGeometry;
  private readonly lipOutlineGeo: THREE.TorusGeometry;
  private readonly corkGeo: THREE.CylinderGeometry;
  private readonly corkOutlineGeo: THREE.CylinderGeometry;
  private readonly liquidGeo: THREE.CylinderGeometry;
  private readonly meniscusGeo: THREE.CylinderGeometry;
  private readonly bubbleGeo: THREE.SphereGeometry;
  private readonly highlightGeo: THREE.BoxGeometry;
  private readonly highlightDotGeo: THREE.BoxGeometry;
  private readonly groundRingGeo: THREE.RingGeometry;
  private readonly splashGeo: THREE.SphereGeometry;

  private readonly _projVec = new THREE.Vector3();

  constructor(mapId: MapId) {
    this.mapId = mapId;
    this.haloTex = createNeonHaloTexture();

    this.outlineMat = new THREE.MeshBasicMaterial({
      color: 0x0b0d18,
      side: THREE.BackSide,
    });
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xe6fff2,
      transparent: true,
      opacity: 0.32,
      roughness: 0.12,
      metalness: 0.1,
      depthWrite: false,
    });
    this.liquidMat = new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x1eff48,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.05,
    });
    this.meniscusMat = new THREE.MeshStandardMaterial({
      color: 0xb8ff7a,
      emissive: 0x7eff3b,
      emissiveIntensity: 1.75,
      roughness: 0.15,
      metalness: 0.04,
    });
    this.bubbleMat = new THREE.MeshBasicMaterial({
      color: 0xd9ffb3,
      transparent: true,
      opacity: 0.9,
    });
    this.highlightMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
    });
    this.corkMat = new THREE.MeshStandardMaterial({
      color: 0xd69656,
      roughness: 0.78,
      metalness: 0.04,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.haloMat = new THREE.SpriteMaterial({
      map: this.haloTex,
      color: 0x6dff57,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.disposableMaterials.push(
      this.outlineMat,
      this.glassMat,
      this.liquidMat,
      this.meniscusMat,
      this.bubbleMat,
      this.highlightMat,
      this.corkMat,
      this.ringMat,
      this.haloMat,
    );

    // Cylinder flask geometry set
    this.bodyGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.62, 18);
    this.bodyOutlineGeo = new THREE.CylinderGeometry(0.268, 0.268, 0.66, 18);
    this.bottomCapGeo = new THREE.CylinderGeometry(0.245, 0.23, 0.06, 18);
    this.bottomCapOutlineGeo = new THREE.CylinderGeometry(0.272, 0.258, 0.09, 18);
    this.shoulderGeo = new THREE.CylinderGeometry(0.115, 0.24, 0.11, 18);
    this.shoulderOutlineGeo = new THREE.CylinderGeometry(0.142, 0.268, 0.13, 18);
    this.neckGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16);
    this.neckOutlineGeo = new THREE.CylinderGeometry(0.136, 0.136, 0.115, 16);
    this.lipGeo = new THREE.TorusGeometry(0.125, 0.028, 8, 18);
    this.lipOutlineGeo = new THREE.TorusGeometry(0.125, 0.048, 8, 18);
    this.corkGeo = new THREE.CylinderGeometry(0.096, 0.082, 0.15, 14);
    this.corkOutlineGeo = new THREE.CylinderGeometry(0.12, 0.104, 0.175, 14);

    this.liquidGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.43, 18);
    this.meniscusGeo = new THREE.CylinderGeometry(0.206, 0.206, 0.032, 18);
    this.bubbleGeo = new THREE.SphereGeometry(0.03, 8, 8);
    this.highlightGeo = new THREE.BoxGeometry(0.042, 0.36, 0.022);
    this.highlightDotGeo = new THREE.BoxGeometry(0.042, 0.055, 0.022);
    this.groundRingGeo = new THREE.RingGeometry(0.35, 0.49, 24);
    this.groundRingGeo.rotateX(-Math.PI / 2);
    this.splashGeo = new THREE.SphereGeometry(0.07, 8, 8);

    this.disposableGeometries.push(
      this.bodyGeo,
      this.bodyOutlineGeo,
      this.bottomCapGeo,
      this.bottomCapOutlineGeo,
      this.shoulderGeo,
      this.shoulderOutlineGeo,
      this.neckGeo,
      this.neckOutlineGeo,
      this.lipGeo,
      this.lipOutlineGeo,
      this.corkGeo,
      this.corkOutlineGeo,
      this.liquidGeo,
      this.meniscusGeo,
      this.bubbleGeo,
      this.highlightGeo,
      this.highlightDotGeo,
      this.groundRingGeo,
      this.splashGeo,
    );

    // Spawn up to POTION_MAX_COUNT (10) potions across the map at random valid spots
    for (let i = 0; i < POTION_MAX_COUNT; i++) {
      this.spawnRandomPotion();
    }
  }

  private isPositionValid(x: number, z: number): boolean {
    if (this.mapId === 'test') {
      if (Math.abs(x) > TEST_MAP_HALF_INNER - 2.2 || Math.abs(z) > TEST_MAP_HALF_INNER - 2.2) {
        return false;
      }
      // Avoid tall walls/cover blocks while allowing open ground & low platform tops
      for (const box of TEST_MAP_OBSTACLE_COLLIDERS) {
        if (box.maxY > 2.75) {
          if (
            x >= box.minX - 1.3 &&
            x <= box.maxX + 1.3 &&
            z >= box.minZ - 1.3 &&
            z <= box.maxZ + 1.3
          ) {
            return false;
          }
        }
      }
      // Keep minimum spacing between potions
      for (const p of this.potions) {
        const dx = p.position.x - x;
        const dz = p.position.z - z;
        if (dx * dx + dz * dz < 6.2 * 6.2) return false;
      }
      return true;
    }

    // Main map ('existing')
    if (Math.abs(x) > BASEPLATE_HALF_INNER - 8 || Math.abs(z) > BASEPLATE_HALF_INNER - 8) {
      return false;
    }
    for (const box of ARENA_PILLAR_COLLIDERS) {
      if (
        x >= box.minX - 1.6 &&
        x <= box.maxX + 1.6 &&
        z >= box.minZ - 1.6 &&
        z <= box.maxZ + 1.6
      ) {
        return false;
      }
    }
    for (const p of this.potions) {
      const dx = p.position.x - x;
      const dz = p.position.z - z;
      if (dx * dx + dz * dz < 11.5 * 11.5) return false;
    }
    return true;
  }

  private pickRandomPosition(): THREE.Vector3 {
    const maxSpan = this.mapId === 'test' ? TEST_MAP_HALF_INNER - 3.0 : 68;
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = (Math.random() * 2 - 1) * maxSpan;
      const z = (Math.random() * 2 - 1) * maxSpan;
      if (!this.isPositionValid(x, z)) continue;
      const y = this.mapId === 'test' ? getGroundSurfaceY(x, z, 2.8) : 0;
      return new THREE.Vector3(x, y, z);
    }
    const fallbackX = (Math.random() * 2 - 1) * (this.mapId === 'test' ? 14 : 26);
    const fallbackZ = (Math.random() * 2 - 1) * (this.mapId === 'test' ? 14 : 26);
    const fallbackY = this.mapId === 'test' ? getGroundSurfaceY(fallbackX, fallbackZ, 2.8) : 0;
    return new THREE.Vector3(fallbackX, fallbackY, fallbackZ);
  }

  private spawnRandomPotion(): void {
    if (this.potions.length >= POTION_MAX_COUNT) return;
    const pos = this.pickRandomPosition();
    const id = `potion-${this.nextId++}`;

    const root = new THREE.Group();
    root.position.copy(pos);

    // Ground neon ring beacon
    const ringMesh = new THREE.Mesh(this.groundRingGeo, this.ringMat);
    ringMesh.position.y = 0.025;
    root.add(ringMesh);

    // Hover & spin wrapper
    const hoverGroup = new THREE.Group();
    hoverGroup.position.y = 0.66;
    root.add(hoverGroup);

    // Halo behind/around the flask
    const haloSprite = new THREE.Sprite(this.haloMat);
    haloSprite.scale.set(1.55, 1.55, 1);
    haloSprite.position.set(0, -0.02, 0);
    hoverGroup.add(haloSprite);

    // Tilted cylindrical cartoon flask ("frasco cilindro com líquido verde neon inclinado")
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = -0.38;
    tiltGroup.rotation.x = 0.14;
    hoverGroup.add(tiltGroup);

    // Neon green glowing liquid inside
    const liquidMesh = new THREE.Mesh(this.liquidGeo, this.liquidMat);
    liquidMesh.position.y = -0.085;
    tiltGroup.add(liquidMesh);

    const meniscusMesh = new THREE.Mesh(this.meniscusGeo, this.meniscusMat);
    meniscusMesh.position.y = 0.13;
    tiltGroup.add(meniscusMesh);

    // Rising neon bubbles inside liquid
    const bubbles: PotionBubble[] = [];
    for (let i = 0; i < 3; i++) {
      const bubbleMesh = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
      const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.6;
      const radius = 0.055 + i * 0.032;
      const baseY = -0.22 + i * 0.1;
      bubbleMesh.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius);
      tiltGroup.add(bubbleMesh);
      bubbles.push({
        mesh: bubbleMesh,
        baseY,
        speed: 1.4 + i * 0.45,
        phase: Math.random() * Math.PI * 2,
        radius,
        angle,
      });
    }

    // Cartoon cylindrical glass body + outline
    const bodyMesh = new THREE.Mesh(this.bodyGeo, this.glassMat);
    bodyMesh.castShadow = true;
    const bodyOutline = new THREE.Mesh(this.bodyOutlineGeo, this.outlineMat);
    tiltGroup.add(bodyMesh, bodyOutline);

    // Bottom glass base + outline
    const bottomCap = new THREE.Mesh(this.bottomCapGeo, this.glassMat);
    bottomCap.position.y = -0.32;
    const bottomCapOutline = new THREE.Mesh(this.bottomCapOutlineGeo, this.outlineMat);
    bottomCapOutline.position.y = -0.32;
    tiltGroup.add(bottomCap, bottomCapOutline);

    // Shoulder + neck + lip + cartoon ink outlines
    const shoulder = new THREE.Mesh(this.shoulderGeo, this.glassMat);
    shoulder.position.y = 0.365;
    const shoulderOutline = new THREE.Mesh(this.shoulderOutlineGeo, this.outlineMat);
    shoulderOutline.position.y = 0.365;
    tiltGroup.add(shoulder, shoulderOutline);

    const neck = new THREE.Mesh(this.neckGeo, this.glassMat);
    neck.position.y = 0.455;
    const neckOutline = new THREE.Mesh(this.neckOutlineGeo, this.outlineMat);
    neckOutline.position.y = 0.455;
    tiltGroup.add(neck, neckOutline);

    const lip = new THREE.Mesh(this.lipGeo, this.glassMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.505;
    const lipOutline = new THREE.Mesh(this.lipOutlineGeo, this.outlineMat);
    lipOutline.rotation.x = Math.PI / 2;
    lipOutline.position.y = 0.505;
    tiltGroup.add(lip, lipOutline);

    // Cartoon cork stopper + outline
    const cork = new THREE.Mesh(this.corkGeo, this.corkMat);
    cork.position.y = 0.555;
    cork.castShadow = true;
    const corkOutline = new THREE.Mesh(this.corkOutlineGeo, this.outlineMat);
    corkOutline.position.y = 0.555;
    tiltGroup.add(cork, corkOutline);

    // Glossy cartoon specular highlight strip + dot
    const highlight = new THREE.Mesh(this.highlightGeo, this.highlightMat);
    highlight.position.set(-0.145, -0.04, 0.195);
    highlight.rotation.y = -0.58;
    const highlightDot = new THREE.Mesh(this.highlightDotGeo, this.highlightMat);
    highlightDot.position.set(-0.145, 0.21, 0.195);
    highlightDot.rotation.y = -0.58;
    tiltGroup.add(highlight, highlightDot);

    this.group.add(root);
    this.potions.push({
      id,
      root,
      hoverGroup,
      ringMesh,
      haloSprite,
      bubbles,
      position: pos,
      phase: Math.random() * Math.PI * 2,
    });
  }

  private spawnConsumeSplash(pos: THREE.Vector3): void {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x39ff14 : 0xb8ff7a,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(this.splashGeo, mat);
      mesh.position.set(pos.x, pos.y + 0.65, pos.z);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2.0 + Math.random() * 2.4;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 2.6,
        Math.sin(angle) * speed,
      );
      this.group.add(mesh);
      this.splashParticles.push({
        mesh,
        mat,
        vel,
        elapsed: 0,
        duration: 0.52 + Math.random() * 0.16,
      });
    }
  }

  public consumePotionById(id: string): boolean {
    const idx = this.potions.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    const [removed] = this.potions.splice(idx, 1);
    this.spawnConsumeSplash(removed.position);
    this.group.remove(removed.root);
    if (this.activePotionId === id) {
      this.activePotionId = null;
      this.holdElapsed = 0;
    }
    if (this.potions.length + this.pendingRespawns.length < POTION_MAX_COUNT) {
      this.pendingRespawns.push(POTION_RESPAWN_DELAY_SEC);
    }
    return true;
  }

  public resetHold(): void {
    this.holdElapsed = 0;
  }

  public update(
    dt: number,
    camera: THREE.Camera,
    playerPos: THREE.Vector3,
    vw: number,
    vh: number,
    canInteract: boolean,
    holdingInput: boolean,
    canSpendAndHeal: boolean,
    onCompleted?: (potionId: string) => boolean,
  ): PotionPromptSnapshot {
    this.elapsed += dt;

    // Handle pending respawns up to POTION_MAX_COUNT
    for (let i = this.pendingRespawns.length - 1; i >= 0; i--) {
      this.pendingRespawns[i] -= dt;
      if (this.pendingRespawns[i] <= 0) {
        this.pendingRespawns.splice(i, 1);
        this.spawnRandomPotion();
      }
    }

    // Animate active potions
    for (let i = 0; i < this.potions.length; i++) {
      const p = this.potions[i];
      const bob = Math.sin(this.elapsed * 2.3 + p.phase);
      p.hoverGroup.position.y = 0.66 + bob * 0.085;
      p.hoverGroup.rotation.y += dt * 0.95;

      const ringScale = 1 + Math.sin(this.elapsed * 3.1 + p.phase) * 0.08;
      p.ringMesh.scale.set(ringScale, 1, ringScale);

      const haloPulse = 1.5 + Math.sin(this.elapsed * 3.4 + p.phase) * 0.16;
      p.haloSprite.scale.set(haloPulse, haloPulse, 1);

      for (let b = 0; b < p.bubbles.length; b++) {
        const bubble = p.bubbles[b];
        const rise = ((this.elapsed * bubble.speed + bubble.phase) % 1) * 0.28;
        bubble.mesh.position.y = -0.22 + rise;
        const wobble = Math.sin(this.elapsed * 4.2 + bubble.phase) * 0.014;
        bubble.mesh.position.x = Math.cos(bubble.angle) * bubble.radius + wobble;
        bubble.mesh.position.z = Math.sin(bubble.angle) * bubble.radius - wobble;
      }
    }

    // Update splash particles
    for (let i = this.splashParticles.length - 1; i >= 0; i--) {
      const sp = this.splashParticles[i];
      sp.elapsed += dt;
      const t = sp.elapsed / sp.duration;
      if (t >= 1) {
        this.group.remove(sp.mesh);
        sp.mat.dispose();
        this.splashParticles.splice(i, 1);
        continue;
      }
      sp.vel.y -= 9.5 * dt;
      sp.mesh.position.addScaledVector(sp.vel, dt);
      const scale = Math.max(0.05, 1 - t * 0.85);
      sp.mesh.scale.setScalar(scale);
      sp.mat.opacity = (1 - t) * 0.95;
    }

    // Find closest potion within interaction radius
    let nearest: PotionEntity | null = null;
    let nearestDist = Infinity;
    if (canInteract) {
      const px = playerPos.x;
      const py = playerPos.y + 0.65;
      const pz = playerPos.z;
      const maxDistSq = POTION_INTERACT_RADIUS * POTION_INTERACT_RADIUS;
      for (let i = 0; i < this.potions.length; i++) {
        const p = this.potions[i];
        const dx = p.position.x - px;
        const dy = p.position.y + 0.65 - py;
        const dz = p.position.z - pz;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq <= maxDistSq && distSq < nearestDist) {
          nearestDist = distSq;
          nearest = p;
        }
      }
    }

    if (!nearest) {
      this.activePotionId = null;
      this.holdElapsed = 0;
      return {
        visible: false,
        potionId: null,
        screenX: 0,
        screenY: 0,
        distance: 0,
        progress: 0,
        holding: false,
      };
    }

    if (this.activePotionId !== nearest.id) {
      this.activePotionId = nearest.id;
      this.holdElapsed = 0;
    }

    const activeHold = holdingInput && canSpendAndHeal;
    if (activeHold) {
      this.holdElapsed = Math.min(POTION_HOLD_DURATION_SEC, this.holdElapsed + dt);
      if (this.holdElapsed >= POTION_HOLD_DURATION_SEC) {
        const consumedId = nearest.id;
        const accepted = onCompleted?.(consumedId) ?? false;
        if (accepted) {
          this.consumePotionById(consumedId);
          return {
            visible: false,
            potionId: null,
            screenX: 0,
            screenY: 0,
            distance: 0,
            progress: 0,
            holding: false,
          };
        }
        this.holdElapsed = 0;
      }
    } else {
      this.holdElapsed = 0;
    }

    // Project prompt anchor above the floating tilted flask
    this._projVec
      .set(nearest.position.x, nearest.position.y + 1.28, nearest.position.z)
      .project(camera);

    const inFront = this._projVec.z >= -1 && this._projVec.z <= 1;
    let screenX = (this._projVec.x * 0.5 + 0.5) * vw;
    let screenY = (-this._projVec.y * 0.5 + 0.5) * vh;

    if (!inFront) {
      screenX = vw * 0.5;
      screenY = vh * 0.62;
    } else {
      screenX = Math.max(76, Math.min(vw - 76, screenX));
      screenY = Math.max(120, Math.min(vh - 110, screenY));
    }

    return {
      visible: inFront || activeHold,
      potionId: nearest.id,
      screenX,
      screenY,
      distance: Math.sqrt(nearestDist),
      progress: Math.min(1, this.holdElapsed / POTION_HOLD_DURATION_SEC),
      holding: activeHold,
    };
  }

  public dispose(): void {
    for (const sp of this.splashParticles) {
      this.group.remove(sp.mesh);
      sp.mat.dispose();
    }
    this.splashParticles.length = 0;
    for (const p of this.potions) {
      this.group.remove(p.root);
    }
    this.potions.length = 0;
    this.pendingRespawns.length = 0;
    this.disposableGeometries.forEach((g) => g.dispose());
    this.disposableMaterials.forEach((m) => m.dispose());
    this.haloTex.dispose();
  }
}
