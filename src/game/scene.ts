// ===================== بناء المشهد (Scene) =====================
// أشكال هندسية بسيطة ملونة بدون موديلات ثقيلة
import * as THREE from 'three';
import { BALL_R, GOAL_D, GOAL_H, GOAL_W, POST_R, KEEPER_Z } from './physics';

export const P_COLORS = [0xf97316, 0x3b82f6];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** أرضية الملعب مع الخطوط وخطوط القص */
function buildPitch(): THREE.Mesh {
  const S = 2048;
  const W = 70;
  const ox = 35;
  const oz = 12;
  const tex = canvasTex(S, S, (g) => {
    const px = (x: number) => ((x + ox) / W) * S;
    const pz = (z: number) => ((z + oz) / W) * S;
    // خطوط عشب متناوبة
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? '#2f8a3a' : '#35963f';
      g.fillRect(0, (i * S) / 14, S, S / 14 + 1);
    }
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = (0.12 / W) * S;
    const rect = (x1: number, z1: number, x2: number, z2: number) => g.strokeRect(px(x1), pz(z1), px(x2) - px(x1), pz(z2) - pz(z1));
    g.beginPath();
    g.moveTo(px(-34), pz(0));
    g.lineTo(px(34), pz(0));
    g.stroke();
    rect(-9.16, 0, 9.16, 5.5);
    rect(-20.16, 0, 20.16, 16.5);
    // نقطة الجزاء
    g.fillStyle = 'white';
    g.beginPath();
    g.arc(px(0), pz(11), (0.2 / W) * S, 0, Math.PI * 2);
    g.fill();
    // قوس منطقة الجزاء
    g.beginPath();
    const r = (9.15 / W) * S;
    const a = Math.acos(5.5 / 9.15);
    g.arc(px(0), pz(11), r, Math.PI / 2 - a, Math.PI / 2 + a);
    g.stroke();
    // خطوط جانبية
    g.beginPath();
    g.moveTo(px(-34), pz(0));
    g.lineTo(px(-34), pz(58));
    g.moveTo(px(34), pz(0));
    g.lineTo(px(34), pz(58));
    g.stroke();
    // أقواس الركنية
    g.beginPath();
    g.arc(px(-34), pz(0), (1 / W) * S, 0, Math.PI / 2);
    g.stroke();
    g.beginPath();
    g.arc(px(34), pz(0), (1 / W) * S, Math.PI / 2, Math.PI);
    g.stroke();
  });
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0, W / 2 - oz);
  m.receiveShadow = true;
  return m;
}

export interface GoalParts {
  group: THREE.Group;
  backNet: THREE.Mesh;
  backBase: Float32Array;
}

function buildGoal(): GoalParts {
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, GOAL_H + POST_R, 10);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, white);
    p.position.set((s * GOAL_W) / 2, (GOAL_H + POST_R) / 2, 0);
    p.castShadow = true;
    group.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, GOAL_W + POST_R * 2, 10), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL_H, 0);
  bar.castShadow = true;
  group.add(bar);
  // دعامات خلفية
  const thin = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(GOAL_D, GOAL_H), 6), thin);
    b.position.set((s * GOAL_W) / 2, GOAL_H / 2, -GOAL_D / 2);
    b.rotation.x = Math.atan2(GOAL_D, GOAL_H);
    group.add(b);
  }
  // الشبكة (شبكة سلكية خفيفة)
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 });
  const backNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_H, 24, 8), netMat);
  backNet.position.set(0, GOAL_H / 2, -GOAL_D);
  group.add(backNet);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, GOAL_D, 24, 6), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, GOAL_H, -GOAL_D / 2);
  group.add(top);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_H, 6, 8), netMat);
    side.rotation.y = Math.PI / 2;
    side.position.set((s * GOAL_W) / 2, GOAL_H / 2, -GOAL_D / 2);
    group.add(side);
  }
  const backBase = Float32Array.from(backNet.geometry.attributes.position.array as Float32Array);
  return { group, backNet, backBase };
}

export interface Crowd {
  meshes: THREE.InstancedMesh[];
  max: number;
}

/** المدرجات والجمهور (InstancedMesh لتقليل استدعاءات الرسم) */
function buildStands(scene: THREE.Scene): Crowd {
  const standMat = new THREE.MeshLambertMaterial({ color: 0x2a3142 });
  const stands: { x: number; z: number; w: number; d: number; rotY: number }[] = [
    { x: 0, z: -14, w: 70, d: 12, rotY: 0 },
    { x: -40, z: 18, w: 64, d: 12, rotY: Math.PI / 2 },
    { x: 40, z: 18, w: 64, d: 12, rotY: -Math.PI / 2 },
  ];
  const steps = 6;
  const groups = 3;
  const per = 1400;
  const fanGeo = new THREE.BoxGeometry(0.5, 0.8, 0.4);
  const meshes: THREE.InstancedMesh[] = [];
  for (let gi = 0; gi < groups; gi++) {
    const im = new THREE.InstancedMesh(fanGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), per);
    im.count = 0;
    meshes.push(im);
    scene.add(im);
  }
  const palette = [0xf97316, 0x3b82f6, 0xffffff, 0xfacc15, 0xef4444, 0x22c55e, 0x1e293b, 0xa855f7];
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const q = new THREE.Quaternion();
  const counts = [0, 0, 0];
  for (const s of stands) {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rotY;
    for (let i = 0; i < steps; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(s.w, 1.2 * (i + 1), s.d / steps), standMat);
      step.position.set(0, 0.6 * (i + 1), -((i + 0.5) * s.d) / steps + s.d / 2);
      g.add(step);
    }
    scene.add(g);
    g.updateMatrixWorld(true);
    q.setFromEuler(new THREE.Euler(0, s.rotY, 0));
    for (let i = 0; i < steps; i++) {
      for (let x = -s.w / 2 + 0.6; x < s.w / 2 - 0.6; x += 0.85) {
        if (Math.random() < 0.18) continue;
        const gi = Math.floor(Math.random() * groups);
        if (counts[gi] >= per) continue;
        const local = new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, 1.2 * (i + 1) + 0.4, -((i + 0.5) * s.d) / steps + s.d / 2);
        g.localToWorld(local);
        m4.compose(local, q, new THREE.Vector3(1, 0.8 + Math.random() * 0.4, 1));
        meshes[gi].setMatrixAt(counts[gi], m4);
        col.setHex(palette[Math.floor(Math.random() * palette.length)]);
        meshes[gi].setColorAt(counts[gi], col);
        counts[gi]++;
      }
    }
  }
  meshes.forEach((m, i) => {
    m.count = counts[i];
    m.userData.full = counts[i];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return { meshes, max: counts.reduce((a, b) => a + b, 0) };
}

function buildBoards(scene: THREE.Scene) {
  const tex = canvasTex(1024, 64, (g) => {
    const cols = ['#f97316', '#1d4ed8', '#111827', '#16a34a'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = cols[i];
      g.fillRect(i * 256, 0, 256, 64);
      g.fillStyle = 'white';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center';
      g.fillText(i % 2 ? 'الكرة ضد الحارس' : 'BALL VS KEEPER', i * 256 + 128, 44);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const back = new THREE.Mesh(new THREE.BoxGeometry(60, 0.9, 0.2), mat);
  back.position.set(0, 0.45, -5);
  scene.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(50, 0.9, 0.2), mat);
    side.rotation.y = Math.PI / 2;
    side.position.set(s * 33, 0.45, 20);
    scene.add(side);
  }
}

function buildLights(scene: THREE.Scene) {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
  for (const [x, z] of [[-34, -10], [34, -10], [-34, 45], [34, 45]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 26, 6), poleMat);
    pole.position.set(x, 13, z);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), lampMat);
    lamp.position.set(x, 26.5, z);
    lamp.lookAt(0, 0, 12);
    scene.add(lamp);
  }
}

/** نموذج الحارس: مجموعة أشكال بسيطة + نقاط تصادم */
export interface KeeperModel {
  root: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  bodyMat: THREE.MeshLambertMaterial;
  markers: { obj: THREE.Object3D; r: number }[];
}

export function buildKeeper(): KeeperModel {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: P_COLORS[1] });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x111827 });
  const glove = new THREE.MeshLambertMaterial({ color: 0xfef08a });
  const markers: { obj: THREE.Object3D; r: number }[] = [];
  const mark = (parent: THREE.Object3D, x: number, y: number, z: number, r: number) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    markers.push({ obj: o, r });
  };
  // الساقين
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.22), dark);
    leg.position.set(s * 0.13, 0.45, 0);
    leg.castShadow = true;
    root.add(leg);
    mark(root, s * 0.13, 0.25, 0, 0.14);
    mark(root, s * 0.13, 0.65, 0, 0.15);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), bodyMat);
  torso.position.y = 1.23;
  torso.castShadow = true;
  root.add(torso);
  mark(root, 0, 1.05, 0, 0.27);
  mark(root, 0, 1.38, 0, 0.27);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  root.add(head);
  mark(root, 0, 1.72, 0, 0.17);
  // الذراعين بمفصل الكتف
  const mkArm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.3, 1.5, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), bodyMat);
    arm.position.y = -0.31;
    arm.castShadow = true;
    g.add(arm);
    const gl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), glove);
    gl.position.y = -0.7;
    gl.castShadow = true;
    g.add(gl);
    mark(g, 0, -0.32, 0, 0.12);
    mark(g, 0, -0.7, 0, 0.19);
    root.add(g);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  root.position.set(0, 0, KEEPER_Z);
  return { root, armL, armR, bodyMat, markers };
}

/** الكرة مع نسيج بخماسيات */
export function buildBall(): THREE.Mesh {
  const tex = canvasTex(512, 256, (g) => {
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#111827';
    const pts: [number, number][] = [[0, 90], [0, -90]];
    const lat = (Math.atan(0.5) * 180) / Math.PI;
    for (let i = 0; i < 5; i++) {
      pts.push([i * 72, lat]);
      pts.push([i * 72 + 36, -lat]);
    }
    for (const [lo, la] of pts) {
      const y = ((90 - la) / 180) * 256;
      const sx = 1 / Math.max(0.2, Math.cos((la * Math.PI) / 180));
      for (const off of [-512, 0, 512]) {
        g.save();
        g.translate(((lo + 180) / 360) * 512 + off, y);
        g.scale(sx, 1);
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
        }
        g.closePath();
        g.fill();
        g.restore();
      }
    }
    if (pts.length) {
      g.fillRect(0, 0, 512, 10);
      g.fillRect(0, 246, 512, 10);
    }
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: tex }));
  ball.castShadow = true;
  return ball;
}

function skyTexture() {
  return canvasTex(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#050b1f');
    gr.addColorStop(0.55, '#16285a');
    gr.addColorStop(1, '#3f5f99');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
  });
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  goal: GoalParts;
  crowd: Crowd;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0x16285a, 60, 140);
  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x2f5f2f, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-12, 30, 22);
  sun.target.position.set(0, 0, 8);
  scene.add(sun.target);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  // أرض خارجية
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x24692c }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  scene.add(outer);
  scene.add(buildPitch());
  const goal = buildGoal();
  scene.add(goal.group);
  const crowd = buildStands(scene);
  buildBoards(scene);
  buildLights(scene);
  return { scene, sun, goal, crowd };
}
