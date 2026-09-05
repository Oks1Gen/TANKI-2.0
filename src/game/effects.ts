import * as THREE from 'three';
import { Weather } from './config';

// ================== Частицы (единый Points-буфер) ==================
const SCRATCH_COLOR = new THREE.Color();

export class ParticleSystem {
  readonly cap: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grow: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private alpha: Float32Array;
  private geo: THREE.BufferGeometry;
  points: THREE.Points;
  private cursor = 0;
  private colorDirty = true;

  constructor(cap = 3000) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main(){
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c);
          if(d>0.5) discard;
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.geo.setDrawRange(0, cap);
  }

  emit(o: { x: number; y: number; z: number; vx?: number; vy?: number; vz?: number; spread?: number; color: number; life: number; size: number; grow?: number; gravity?: number; drag?: number; alpha?: number; count?: number; colorVar?: number }) {
    const n = o.count ?? 1;
    const c = SCRATCH_COLOR.setHex(o.color);
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      const sp = o.spread ?? 0;
      this.pos[i * 3] = o.x + (Math.random() - 0.5) * sp * 0.5;
      this.pos[i * 3 + 1] = o.y + (Math.random() - 0.5) * sp * 0.5;
      this.pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * sp * 0.5;
      this.vel[i * 3] = (o.vx ?? 0) + (Math.random() - 0.5) * sp;
      this.vel[i * 3 + 1] = (o.vy ?? 0) + (Math.random() - 0.5) * sp;
      this.vel[i * 3 + 2] = (o.vz ?? 0) + (Math.random() - 0.5) * sp;
      const cv = o.colorVar ?? 0;
      this.col[i * 3] = Math.min(1, Math.max(0, c.r + (Math.random() - 0.5) * cv));
      this.col[i * 3 + 1] = Math.min(1, Math.max(0, c.g + (Math.random() - 0.5) * cv));
      this.col[i * 3 + 2] = Math.min(1, Math.max(0, c.b + (Math.random() - 0.5) * cv));
      const l = o.life * (0.7 + Math.random() * 0.6);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.size[i] = o.size * (0.7 + Math.random() * 0.6);
      this.grow[i] = o.grow ?? 0;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
      this.alpha[i] = o.alpha ?? 1;
    }
    this.colorDirty = true;
  }

  update(dt: number) {
    const { pos, vel, life, maxLife, size, grow, grav, drag, alpha } = this;
    let anyAlive = false;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) {
        // мёртвая частица обязана иметь size=0, иначе она всё равно растеризуется
        // (прозрачный квад во весь экран × 2500 штук — жрёт fill-rate)
        if (alpha[i] !== 0) alpha[i] = 0;
        if (size[i] !== 0) size[i] = 0;
        continue;
      }
      anyAlive = true;
      life[i] -= dt;
      const t = life[i] / maxLife[i];
      const d = 1 - drag[i] * dt;
      vel[i * 3] *= d;
      vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt;
      vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.05) {
        pos[i * 3 + 1] = 0.05;
        vel[i * 3 + 1] = 0;
      }
      size[i] += grow[i] * dt;
      alpha[i] = Math.min(1, t * 2) * (life[i] > 0 ? 1 : 0);
    }
    if (!anyAlive) return;
    this.geo.attributes.position.needsUpdate = true;
    // цвет статичен между emit — не гоняем 3 floats на частицу каждый кадр
    if (this.colorDirty) {
      this.geo.attributes.aColor.needsUpdate = true;
      this.colorDirty = false;
    }
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// ================== Обломки ==================
interface Debris {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
  active: boolean;
}

export class DebrisSystem {
  private pool: Debris[] = [];
  private geo = new THREE.BoxGeometry(1, 1, 1);
  private mat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.9, metalness: 0.4 });
  private coloredMats = new Map<number, THREE.MeshStandardMaterial>();
  private cursor = 0;
  constructor(private scene: THREE.Scene, count = 60) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.visible = false;
      m.castShadow = false; // мелкий мусор не должен удваивать shadow-pass
      m.receiveShadow = false;
      scene.add(m);
      this.pool.push({ mesh: m, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, life: 0, active: false });
    }
  }
  burst(x: number, y: number, z: number, n: number, power: number, color?: number, scale = 1) {
    for (let k = 0; k < n; k++) {
      const d = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      d.active = true;
      d.mesh.visible = true;
      d.mesh.position.set(x, y + 0.5, z);
      d.mesh.scale.set((0.3 + Math.random() * 0.7) * scale, (0.2 + Math.random() * 0.5) * scale, (0.3 + Math.random() * 0.9) * scale);
      d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      if (color !== undefined) {
        let m = this.coloredMats.get(color);
        if (!m) {
          m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
          this.coloredMats.set(color, m);
        }
        d.mesh.material = m;
      } else d.mesh.material = this.mat;
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.8);
      d.vx = Math.cos(a) * sp;
      d.vz = Math.sin(a) * sp;
      d.vy = power * (0.8 + Math.random() * 0.9);
      d.rx = (Math.random() - 0.5) * 10;
      d.ry = (Math.random() - 0.5) * 10;
      d.life = 6 + Math.random() * 4;
    }
  }
  update(dt: number) {
    for (const d of this.pool) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      d.vy -= 22 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      if (d.mesh.position.y < d.mesh.scale.y / 2) {
        d.mesh.position.y = d.mesh.scale.y / 2;
        d.vy *= -0.3;
        d.vx *= 0.6;
        d.vz *= 0.6;
        d.rx *= 0.5;
        d.ry *= 0.5;
      } else {
        d.mesh.rotation.x += d.rx * dt;
        d.mesh.rotation.y += d.ry * dt;
      }
    }
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.coloredMats.forEach((m) => m.dispose());
    this.coloredMats.clear();
    this.pool.forEach((d) => this.scene.remove(d.mesh));
  }
}

// ================== Следы гусениц ==================
export class TrackMarks {
  private mesh: THREE.InstancedMesh;
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private count: number;
  constructor(scene: THREE.Scene, count = 400, color = 0x000000) {
    this.count = count;
    const geo = new THREE.PlaneGeometry(0.9, 1.4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < count; i++) {
      this.dummy.position.set(0, -10, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    scene.add(this.mesh);
  }
  stamp(x: number, z: number, yaw: number) {
    this.dummy.position.set(x, 0.04, z);
    this.dummy.rotation.set(-Math.PI / 2, 0, -yaw);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.cursor, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = (this.cursor + 1) % this.count;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

// ================== Погода ==================
export class WeatherSystem {
  private obj: THREE.Object3D | null = null;
  private positions: Float32Array | null = null;
  private n = 0;
  private kind: Weather;
  private box = { w: 70, h: 40 };
  private speeds: Float32Array | null = null;
  constructor(private scene: THREE.Scene, weather: Weather) {
    this.kind = weather;
    if (weather === 'rain' || weather === 'storm') {
      this.n = weather === 'storm' ? 900 : 600;
      const pos = new Float32Array(this.n * 6);
      const geo = new THREE.BufferGeometry();
      for (let i = 0; i < this.n; i++) {
        const x = (Math.random() - 0.5) * this.box.w;
        const y = Math.random() * this.box.h;
        const z = (Math.random() - 0.5) * this.box.w;
        pos.set([x, y, z, x + 0.1, y + 1.2, z], i * 6);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xa8c4e0, transparent: true, opacity: weather === 'storm' ? 0.4 : 0.3 });
      this.obj = new THREE.LineSegments(geo, mat);
      this.positions = pos;
    } else if (weather === 'snow') {
      this.n = 700;
      const pos = new Float32Array(this.n * 3);
      this.speeds = new Float32Array(this.n);
      for (let i = 0; i < this.n; i++) {
        pos.set([(Math.random() - 0.5) * this.box.w, Math.random() * this.box.h, (Math.random() - 0.5) * this.box.w], i * 3);
        this.speeds[i] = 2 + Math.random() * 3;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.85, sizeAttenuation: true });
      this.obj = new THREE.Points(geo, mat);
      this.positions = pos;
    }
    if (this.obj) {
      this.obj.frustumCulled = false;
      scene.add(this.obj);
    }
  }
  update(dt: number, cx: number, cz: number, time: number) {
    if (!this.obj || !this.positions) return;
    this.obj.position.set(cx, 0, cz);
    const p = this.positions;
    const { w, h } = this.box;
    if (this.kind === 'rain' || this.kind === 'storm') {
      const fall = (this.kind === 'storm' ? 55 : 40) * dt;
      const wind = (this.kind === 'storm' ? 14 : 4) * dt;
      for (let i = 0; i < this.n; i++) {
        const b = i * 6;
        p[b + 1] -= fall;
        p[b + 4] -= fall;
        p[b] += wind;
        p[b + 3] += wind;
        if (p[b + 1] < 0) {
          const x = (Math.random() - 0.5) * w;
          const z = (Math.random() - 0.5) * w;
          p[b] = x;
          p[b + 1] = h;
          p[b + 2] = z;
          p[b + 3] = x + 0.1;
          p[b + 4] = h + 1.2;
          p[b + 5] = z;
        }
        if (p[b] > w / 2) {
          p[b] -= w;
          p[b + 3] -= w;
        }
      }
    } else {
      for (let i = 0; i < this.n; i++) {
        const b = i * 3;
        p[b + 1] -= this.speeds![i] * dt;
        p[b] += Math.sin(time * 0.8 + i) * 0.6 * dt;
        p[b + 2] += Math.cos(time * 0.6 + i * 0.3) * 0.6 * dt;
        if (p[b + 1] < 0) {
          p[b] = (Math.random() - 0.5) * w;
          p[b + 1] = h;
          p[b + 2] = (Math.random() - 0.5) * w;
        }
      }
    }
    ((this.obj as THREE.Points).geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() {
    if (!this.obj) return;
    (this.obj as THREE.Points).geometry.dispose();
    ((this.obj as THREE.Points).material as THREE.Material).dispose();
    this.scene.remove(this.obj);
  }
}
