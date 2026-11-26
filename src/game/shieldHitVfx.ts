import * as THREE from 'three';

export type ShieldKind =
  | 'auto-shield'
  | 'agatha-auto-shield'
  | 'diamond-form'
  | 'mystic-shield'
  | 'forcefield-shield'
  | 'shield-defense';

export const SHIELD_MAX_DURABILITY: Record<ShieldKind, number> = {
  'auto-shield': 100,
  'agatha-auto-shield': 100,
  'diamond-form': 150,
  'mystic-shield': 120,
  'forcefield-shield': 200,
  'shield-defense': 150,
};

export const SHIELD_COLORS: Record<
  ShieldKind,
  { main: string; rim: string; disc: string }
> = {
  'auto-shield': {
    main: '#FF2956',
    rim: '#FF98B0',
    disc: '#FF3662',
  },
  'agatha-auto-shield': {
    main: '#A855F7',
    rim: '#E9D5FF',
    disc: '#9333EA',
  },
  'diamond-form': {
    main: '#8FE8FF',
    rim: '#EFFBFF',
    disc: '#9EF0FF',
  },
  'mystic-shield': {
    main: '#FF9426',
    rim: '#FFE084',
    disc: '#FF9D2E',
  },
  'forcefield-shield': {
    main: '#38BDF8',
    rim: '#BAE6FD',
    disc: '#60A5FA',
  },
  'shield-defense': {
    main: '#3B82F6',
    rim: '#DBEAFE',
    disc: '#EF4444',
  },
};

const MAX_SHIELD_WAVES = 10;
const MAX_PROTECTED_TAGS = 8;

interface ExpandingSphereWave {
  active: boolean;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  elapsed: number;
  duration: number;
}

export interface ProtectedTagRecord {
  id: number;
  worldPos: THREE.Vector3;
  color: string;
  elapsed: number;
  duration: number;
}

/**
 * Renders a semi-transparent, sphere-like horizontal energy wave around a shielded
 * character whenever a shield absorbs incoming damage, and tracks synchronized
 * "Protected" torso popup tags for projection onto the combat HUD overlay.
 */
export class ShieldHitVfxSystem {
  public readonly group = new THREE.Group();

  private readonly wavePool: ExpandingSphereWave[] = [];
  public readonly protectedTags: ProtectedTagRecord[] = [];
  private readonly tagFreePool: ProtectedTagRecord[] = [];
  private nextTagId = 1;

  private readonly sphereWaveGeo = new THREE.SphereGeometry(1, 36, 22);

  constructor() {
    for (let i = 0; i < MAX_SHIELD_WAVES; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uMainColor: { value: new THREE.Color('#FF3662') },
          uRimColor: { value: new THREE.Color('#FF98B0') },
          uProgress: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vLocalNormal;
          varying vec3 vViewNormal;
          varying vec3 vViewDir;

          void main() {
            vLocalNormal = normalize(position);
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            vViewNormal = normalize(normalMatrix * normal);
            vViewDir = normalize(-mvPos.xyz);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uMainColor;
          uniform vec3 uRimColor;
          uniform float uProgress;
          uniform float uOpacity;

          varying vec3 vLocalNormal;
          varying vec3 vViewNormal;
          varying vec3 vViewDir;

          void main() {
            float ny = abs(vLocalNormal.y);
            // Curved horizontal sphere-like equatorial wave fading smoothly toward poles
            float horizBand = pow(clamp(1.0 - ny * 1.12, 0.0, 1.0), 1.65);
            float crest = 0.65 + 0.35 * sin((1.0 - ny) * 9.0 - uProgress * 7.5);
            float fresnel = pow(1.0 - clamp(abs(dot(normalize(vViewNormal), normalize(vViewDir))), 0.0, 1.0), 1.45);
            float equatorCore = exp(-ny * ny * 7.5);

            vec3 col = mix(uMainColor, uRimColor, clamp(fresnel * 0.72 + equatorCore * 0.45, 0.0, 1.0));
            float alpha = horizBand * (0.28 + 0.56 * fresnel + 0.34 * equatorCore * crest) * uOpacity;
            gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
          }
        `,
      });

      const mesh = new THREE.Mesh(this.sphereWaveGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);

      this.wavePool.push({
        active: false,
        mesh,
        mat,
        elapsed: 0,
        duration: 0.36,
      });
    }

    for (let i = 0; i < MAX_PROTECTED_TAGS; i++) {
      this.tagFreePool.push({
        id: 0,
        worldPos: new THREE.Vector3(),
        color: '#FFFFFF',
        elapsed: 0,
        duration: 0.65,
      });
    }
  }

  public triggerAbsorb(
    characterBasePos: THREE.Vector3,
    kind: ShieldKind,
  ): void {
    const palette = SHIELD_COLORS[kind];
    const torsoY = characterBasePos.y + 1.08;

    // 1. Expanding semi-transparent sphere-like horizontal wave (reuse inactive or oldest active)
    let wave: ExpandingSphereWave | null = null;
    let oldestWave = this.wavePool[0];
    for (let i = 0; i < this.wavePool.length; i++) {
      const w = this.wavePool[i];
      if (!w.active) {
        wave = w;
        break;
      }
      if (w.elapsed > oldestWave.elapsed) {
        oldestWave = w;
      }
    }
    if (!wave) wave = oldestWave;

    wave.active = true;
    wave.elapsed = 0;
    wave.duration = 0.36;
    wave.mesh.position.set(characterBasePos.x, torsoY, characterBasePos.z);
    wave.mesh.scale.set(0.45, 0.58, 0.45);
    wave.mat.uniforms.uMainColor.value.set(palette.disc);
    wave.mat.uniforms.uRimColor.value.set(palette.rim);
    wave.mat.uniforms.uProgress.value = 0;
    wave.mat.uniforms.uOpacity.value = 0.55;
    wave.mesh.visible = true;

    // 2. Synchronized "Protected" torso tag
    let tag: ProtectedTagRecord | undefined;
    if (this.protectedTags.length >= MAX_PROTECTED_TAGS) {
      tag = this.protectedTags.shift();
    } else {
      tag = this.tagFreePool.pop();
    }
    if (!tag) {
      tag = {
        id: 0,
        worldPos: new THREE.Vector3(),
        color: palette.rim,
        elapsed: 0,
        duration: 0.65,
      };
    }
    tag.id = this.nextTagId++;
    tag.worldPos.set(characterBasePos.x, torsoY + 0.08, characterBasePos.z);
    tag.color = palette.rim;
    tag.elapsed = 0;
    tag.duration = 0.65;
    this.protectedTags.push(tag);
  }

  public update(dt: number): void {
    const safeDt = Math.min(dt, 0.05);

    for (let i = 0; i < this.wavePool.length; i++) {
      const w = this.wavePool[i];
      if (!w.active) continue;

      w.elapsed += safeDt;
      const t = Math.min(1, w.elapsed / w.duration);
      const easeOut = 1 - Math.pow(1 - t, 3);

      const radiusXZ = 0.45 + easeOut * 2.35;
      const radiusY = 0.58 + easeOut * 0.64;
      w.mesh.scale.set(radiusXZ, radiusY, radiusXZ);

      const fadeIn = Math.min(1, t / 0.12);
      const fadeOut = Math.pow(1 - t, 1.85);
      w.mat.uniforms.uProgress.value = t;
      w.mat.uniforms.uOpacity.value = 0.68 * fadeIn * fadeOut;

      if (w.elapsed >= w.duration) {
        w.active = false;
        w.mat.uniforms.uOpacity.value = 0;
        w.mesh.visible = false;
      }
    }

    for (let i = this.protectedTags.length - 1; i >= 0; i--) {
      const tag = this.protectedTags[i];
      tag.elapsed += safeDt;
      tag.worldPos.y += safeDt * 0.45;
      if (tag.elapsed >= tag.duration) {
        this.protectedTags.splice(i, 1);
        this.tagFreePool.push(tag);
      }
    }
  }

  public dispose(): void {
    for (const w of this.wavePool) {
      w.active = false;
      w.mesh.visible = false;
      w.mat.dispose();
    }
    this.wavePool.length = 0;
    this.protectedTags.length = 0;
    this.tagFreePool.length = 0;
    this.sphereWaveGeo.dispose();
  }
}
