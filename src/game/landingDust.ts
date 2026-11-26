import * as THREE from 'three';

let cachedDustPuffTex: THREE.CanvasTexture | null = null;

function getSoftDustPuffTexture(): THREE.CanvasTexture {
  if (cachedDustPuffTex) return cachedDustPuffTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size * 0.5;

  // Multi-lobed organic feathered cloud silhouette (zero hard circle edges)
  const lobes = [
    { x: half, y: half, r: half * 0.72, a0: 0.72, a1: 0.34 },
    { x: half - 14, y: half + 4, r: half * 0.56, a0: 0.52, a1: 0.22 },
    { x: half + 15, y: half + 3, r: half * 0.54, a0: 0.48, a1: 0.2 },
    { x: half - 4, y: half - 13, r: half * 0.52, a0: 0.46, a1: 0.18 },
    { x: half + 6, y: half + 11, r: half * 0.48, a0: 0.42, a1: 0.16 },
  ];
  for (const l of lobes) {
    const grad = ctx.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.r);
    grad.addColorStop(0.0, `rgba(244, 249, 255, ${l.a0})`);
    grad.addColorStop(0.42, `rgba(218, 232, 248, ${l.a1})`);
    grad.addColorStop(1.0, 'rgba(195, 214, 240, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedDustPuffTex = tex;
  return tex;
}

interface DustPuff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  active: boolean;
  age: number;
  life: number;
  vel: THREE.Vector3;
  startScale: number;
  endScale: number;
  maxOpacity: number;
  rotSpeed: number;
  drag: number;
  lift: number;
  groundY: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  life: number;
  startScale: number;
  endScale: number;
  maxOpacity: number;
}

const TOTAL_PUFFS = 48;
const SPRINT_PUFF_START = 18;

/**
 * Stylized Cartoon landing dust cloud + subtle ground shockwave ring
 * + organic wispy ground dust trails during sprinting.
 */
export class LandingDustSystem {
  public readonly group = new THREE.Group();

  private readonly puffTex: THREE.CanvasTexture;
  private readonly ringGeo: THREE.RingGeometry;
  private readonly puffs: DustPuff[] = [];
  private readonly rings: ShockwaveRing[] = [];
  private sprintCursor = SPRINT_PUFF_START;

  constructor() {
    this.puffTex = getSoftDustPuffTexture();
    this.ringGeo = new THREE.RingGeometry(0.68, 1.0, 28);
    this.ringGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < TOTAL_PUFFS; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.puffTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({
        sprite,
        mat,
        active: false,
        age: 0,
        life: 0.42,
        vel: new THREE.Vector3(),
        startScale: 0.24,
        endScale: 0.56,
        maxOpacity: 0.58,
        rotSpeed: 0,
        drag: 5.5,
        lift: 0,
        groundY: 0,
      });
    }

    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xdbeafe,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({
        mesh,
        active: false,
        age: 0,
        life: 0.34,
        startScale: 0.28,
        endScale: 1.05,
        maxOpacity: 0.46,
      });
    }
  }

  public spawn(feetPos: THREE.Vector3, groundY: number, intensity = 1.0): void {
    const strength = THREE.MathUtils.clamp(intensity, 0.55, 1.5);
    const puffCount = Math.round(6 + strength * 2);

    let spawned = 0;
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < SPRINT_PUFF_START && spawned < puffCount; i++) {
      const p = this.puffs[i];
      if (p.active) continue;
      const angle = baseAngle + (spawned / puffCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const rad = 0.16 + Math.random() * 0.14;
      const speed = (1.35 + Math.random() * 0.85) * strength;
      p.active = true;
      p.age = 0;
      p.life = 0.34 + Math.random() * 0.14;
      p.groundY = groundY;
      p.drag = 5.8;
      p.lift = 0;
      p.rotSpeed = (Math.random() - 0.5) * 1.6;
      p.mat.rotation = Math.random() * Math.PI * 2;
      p.mat.color.setHex(0xeef6ff);
      p.sprite.position.set(
        feetPos.x + Math.cos(angle) * rad,
        groundY + 0.08 + Math.random() * 0.05,
        feetPos.z + Math.sin(angle) * rad,
      );
      p.vel.set(
        Math.cos(angle) * speed,
        0.38 + Math.random() * 0.34,
        Math.sin(angle) * speed,
      );
      p.startScale = 0.22 * strength;
      p.endScale = (0.48 + Math.random() * 0.18) * strength;
      p.maxOpacity = 0.44 + 0.12 * strength;
      p.sprite.scale.setScalar(p.startScale);
      p.sprite.visible = true;
      spawned++;
    }

    let ring: ShockwaveRing = this.rings[0];
    for (let i = 0; i < this.rings.length; i++) {
      if (!this.rings[i].active) {
        ring = this.rings[i];
        break;
      }
    }
    ring.active = true;
    ring.age = 0;
    ring.life = 0.32;
    ring.startScale = 0.26 * strength;
    ring.endScale = 0.96 * strength;
    ring.maxOpacity = 0.38 * Math.min(1.2, strength);
    ring.mesh.position.set(feetPos.x, groundY + 0.025, feetPos.z);
    ring.mesh.scale.setScalar(ring.startScale);
    ring.mesh.visible = true;
  }

  public spawnSprintTrailPuff(
    feetPos: THREE.Vector3,
    groundY: number,
    forwardX: number,
    forwardZ: number,
    sideSign: number,
  ): void {
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const sprintPoolCount = this.puffs.length - SPRINT_PUFF_START;

    // Spawn 2 staggered natural dust wisps per foot-kick using a ring buffer (zero GC, guaranteed availability)
    for (let w = 0; w < 2; w++) {
      let chosen: DustPuff | null = null;
      for (let step = 0; step < sprintPoolCount; step++) {
        const idx = SPRINT_PUFF_START + ((this.sprintCursor - SPRINT_PUFF_START + step) % sprintPoolCount);
        if (!this.puffs[idx].active) {
          chosen = this.puffs[idx];
          this.sprintCursor = SPRINT_PUFF_START + ((idx - SPRINT_PUFF_START + 1) % sprintPoolCount);
          break;
        }
      }
      if (!chosen) {
        chosen = this.puffs[this.sprintCursor];
        this.sprintCursor =
          SPRINT_PUFF_START + ((this.sprintCursor - SPRINT_PUFF_START + 1) % sprintPoolCount);
      }

      const lateral = sideSign * (0.11 + Math.random() * 0.08) + (Math.random() - 0.5) * 0.08;
      const back = 0.2 + w * 0.12 + Math.random() * 0.09;
      const backSpeed = 0.72 + Math.random() * 0.45;
      const sideSpeed = sideSign * (0.14 + Math.random() * 0.16) + (Math.random() - 0.5) * 0.14;

      chosen.active = true;
      chosen.age = 0;
      chosen.life = 0.38 + w * 0.08 + Math.random() * 0.12;
      chosen.groundY = groundY;
      chosen.drag = 3.1;
      chosen.lift = 0.42 + Math.random() * 0.25;
      chosen.rotSpeed = (Math.random() - 0.5) * 2.1;
      chosen.mat.rotation = Math.random() * Math.PI * 2;
      chosen.mat.color.setRGB(
        0.86 + Math.random() * 0.08,
        0.91 + Math.random() * 0.06,
        0.97 + Math.random() * 0.03,
      );
      chosen.sprite.position.set(
        feetPos.x - forwardX * back + rightX * lateral,
        groundY + 0.055 + Math.random() * 0.04,
        feetPos.z - forwardZ * back + rightZ * lateral,
      );
      chosen.vel.set(
        -forwardX * backSpeed + rightX * sideSpeed,
        0.18 + Math.random() * 0.18,
        -forwardZ * backSpeed + rightZ * sideSpeed,
      );
      chosen.startScale = 0.15 + w * 0.03;
      chosen.endScale = 0.44 + w * 0.1 + Math.random() * 0.1;
      chosen.maxOpacity = w === 0 ? 0.26 : 0.19;
      chosen.sprite.scale.setScalar(chosen.startScale);
      chosen.sprite.visible = true;
    }
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);

    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (!p.active) continue;
      p.age += safeDt;
      if (p.age >= p.life) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      const t = p.age / p.life;
      p.vel.y += p.lift * safeDt;
      p.sprite.position.addScaledVector(p.vel, safeDt);
      if (p.sprite.position.y < p.groundY + 0.045) {
        p.sprite.position.y = p.groundY + 0.045;
      }
      p.vel.multiplyScalar(Math.exp(-p.drag * safeDt));
      p.vel.y *= Math.exp(-2.6 * safeDt);
      p.mat.rotation += p.rotSpeed * safeDt;

      const easeOut = 1 - Math.pow(1 - t, 2.35);
      const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, easeOut);
      p.sprite.scale.setScalar(scale);

      const fadeIn = Math.sin(Math.min(1, t * 3.0) * Math.PI * 0.5);
      const fadeOut = Math.pow(1 - t, 1.45);
      p.mat.opacity = p.maxOpacity * fadeIn * fadeOut;
    }

    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!r.active) continue;
      r.age += safeDt;
      if (r.age >= r.life) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const t = r.age / r.life;
      const ease = 1 - Math.pow(1 - t, 2.5);
      r.mesh.scale.setScalar(THREE.MathUtils.lerp(r.startScale, r.endScale, ease));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity =
        r.maxOpacity * (1 - t) * (1 - t);
    }
  }

  public clear(): void {
    for (const p of this.puffs) {
      p.active = false;
      p.sprite.visible = false;
    }
    for (const r of this.rings) {
      r.active = false;
      r.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.clear();
    for (const p of this.puffs) {
      p.mat.dispose();
    }
    for (const r of this.rings) {
      (r.mesh.material as THREE.Material).dispose();
    }
    this.ringGeo.dispose();
  }
}
