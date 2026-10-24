// ===================== الفيزياء (Physics) =====================
// كرة بسيطة: جاذبية، ارتداد، احتكاك، انحناء (ماغنوس)، تصادم مع القائمين والعارضة والحارس
import * as THREE from 'three';

export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const GOAL_D = 2.0;
export const POST_R = 0.09;
export const BALL_R = 0.22;
export const GRAVITY = 9.81;
export const KEEPER_Z = 0.55;
export const FIELD = { minX: -15, maxX: 15, minZ: 7, maxZ: 26 };
export const BALL_SPAWN = new THREE.Vector3(0, BALL_R, 17);

export type HitKind = 'none' | 'ground' | 'post' | 'keeper' | 'net';

export interface Ball {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number; // دوران حول المحور الرأسي (للانحناء)
}

export interface Sphere {
  c: THREE.Vector3;
  r: number;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const n = new THREE.Vector3();

/** أقرب نقطة على قطعة مستقيمة */
function closestOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) {
  const ab = tmp2.copy(b).sub(a);
  const tt = THREE.MathUtils.clamp(tmp.copy(p).sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return out.copy(a).addScaledVector(ab, tt);
}

const segs: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(-GOAL_W / 2, 0, 0), new THREE.Vector3(-GOAL_W / 2, GOAL_H, 0)],
  [new THREE.Vector3(GOAL_W / 2, 0, 0), new THREE.Vector3(GOAL_W / 2, GOAL_H, 0)],
  [new THREE.Vector3(-GOAL_W / 2, GOAL_H, 0), new THREE.Vector3(GOAL_W / 2, GOAL_H, 0)],
];
const cp = new THREE.Vector3();

/** تصادم الكرة مع القائمين والعارضة */
function collideFrame(b: Ball): boolean {
  let hit = false;
  for (const [a, c] of segs) {
    closestOnSegment(b.pos, a, c, cp);
    n.copy(b.pos).sub(cp);
    const d = n.length();
    const minD = BALL_R + POST_R;
    if (d < minD && d > 1e-5) {
      n.divideScalar(d);
      b.pos.copy(cp).addScaledVector(n, minD);
      const vn = b.vel.dot(n);
      if (vn < 0) {
        b.vel.addScaledVector(n, -1.7 * vn);
        b.vel.multiplyScalar(0.85);
        b.spin *= 0.3;
        hit = true;
      }
    }
  }
  return hit;
}

/** الشبكة: تحتوي الكرة داخل المرمى بعد الهدف */
function collideNet(b: Ball): boolean {
  if (b.pos.z > 0) return false;
  const inside = Math.abs(b.pos.x) < GOAL_W / 2 && b.pos.y < GOAL_H;
  if (!inside) return false;
  let hit = false;
  if (b.pos.z < -GOAL_D + BALL_R) {
    b.pos.z = -GOAL_D + BALL_R;
    if (b.vel.z < 0) {
      b.vel.z *= -0.12;
      b.vel.x *= 0.4;
      b.vel.y *= 0.5;
      hit = true;
    }
  }
  const lim = GOAL_W / 2 - BALL_R - POST_R;
  if (Math.abs(b.pos.x) > lim) {
    b.pos.x = Math.sign(b.pos.x) * lim;
    b.vel.x *= -0.2;
    hit = true;
  }
  if (b.pos.y > GOAL_H - BALL_R - POST_R) {
    b.pos.y = GOAL_H - BALL_R - POST_R;
    if (b.vel.y > 0) b.vel.y *= -0.2;
  }
  return hit;
}

/** تصادم الكرة مع كرات جسم الحارس */
function collideSpheres(b: Ball, spheres: Sphere[], kVel: THREE.Vector3): boolean {
  let hit = false;
  for (const s of spheres) {
    n.copy(b.pos).sub(s.c);
    const d = n.length();
    const minD = BALL_R + s.r;
    if (d < minD && d > 1e-5) {
      n.divideScalar(d);
      b.pos.copy(s.c).addScaledVector(n, minD);
      const rel = tmp.copy(b.vel).sub(kVel);
      const vn = rel.dot(n);
      if (vn < 0) {
        rel.addScaledVector(n, -1.45 * vn);
        rel.multiplyScalar(0.7);
        b.vel.copy(rel).addScaledVector(kVel, 0.5);
        b.spin *= 0.2;
        hit = true;
      }
    }
  }
  return hit;
}

export interface StepResult {
  post: boolean;
  keeper: boolean;
  bounce: number; // سرعة الارتطام بالأرض
  net: boolean;
}

/** خطوة فيزياء واحدة للكرة الحرة (بعد التسديد) مع تقسيم داخلي لتجنب الاختراق */
export function stepBall(b: Ball, dt: number, spheres: Sphere[] | null, kVel: THREE.Vector3): StepResult {
  const res: StepResult = { post: false, keeper: false, bounce: 0, net: false };
  const speed = b.vel.length();
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.08));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    // جاذبية
    b.vel.y -= GRAVITY * h;
    // انحناء ماغنوس: a = spin × v
    b.vel.x += b.spin * b.vel.z * h * 0.11;
    b.vel.z += -b.spin * b.vel.x * h * 0.11 * 0.2;
    // مقاومة الهواء
    b.vel.multiplyScalar(1 - 0.06 * h);
    b.pos.addScaledVector(b.vel, h);
    // الأرض
    if (b.pos.y < BALL_R) {
      b.pos.y = BALL_R;
      if (b.vel.y < -1.2) {
        res.bounce = Math.max(res.bounce, -b.vel.y);
        b.vel.y = -b.vel.y * 0.55;
        b.vel.x *= 0.92;
        b.vel.z *= 0.92;
      } else {
        b.vel.y = 0;
        // احتكاك التدحرج
        const f = Math.max(0, 1 - 1.1 * h);
        b.vel.x *= f;
        b.vel.z *= f;
      }
      b.spin *= 1 - 2.5 * h;
    }
    if (collideFrame(b)) res.post = true;
    if (collideNet(b)) res.net = true;
    if (spheres && collideSpheres(b, spheres, kVel)) res.keeper = true;
  }
  return res;
}

/** هل عبرت الكرة خط المرمى بالكامل داخل الإطار؟ */
export function isGoal(b: Ball) {
  return b.pos.z < -BALL_R && Math.abs(b.pos.x) < GOAL_W / 2 - POST_R && b.pos.y < GOAL_H - POST_R;
}

/** هل خرجت الكرة من الملعب أو خلف خط المرمى خارج الإطار؟ */
export function isOut(b: Ball) {
  if (b.pos.z < -BALL_R && !(Math.abs(b.pos.x) < GOAL_W / 2 && b.pos.y < GOAL_H)) return true;
  if (b.pos.z < -GOAL_D - 1) return true;
  if (Math.abs(b.pos.x) > 24 || b.pos.z > 34) return true;
  return false;
}

/**
 * حساب سرعة التسديد للوصول لنقطة هدف (مع تعويض الانحناء حتى تنتهي الكرة قرب علامة التصويب)
 */
export function computeShot(from: THREE.Vector3, target: THREE.Vector3, speed: number, spin: number): THREE.Vector3 {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const tFlight = horiz / speed;
  // الإزاحة الجانبية المتوقعة من الانحناء: a ≈ spin * vz * 0.11
  const vz = (dz / horiz) * speed;
  const aLat = spin * vz * 0.11;
  const curveOffset = 0.5 * aLat * tFlight * tFlight;
  const tx = target.x - curveOffset;
  const ddx = tx - from.x;
  const h2 = Math.hypot(ddx, dz);
  const vx = (ddx / h2) * speed;
  const vzz = (dz / h2) * speed;
  const vy = (target.y - from.y + 0.5 * GRAVITY * tFlight * tFlight) / tFlight;
  return new THREE.Vector3(vx, vy, vzz);
}

/** توقع مكان عبور الكرة لخط الحارس (للكمبيوتر) */
export function predictCrossing(b: Ball, zLine: number): { x: number; y: number; t: number } | null {
  const sim: Ball = { pos: b.pos.clone(), vel: b.vel.clone(), spin: b.spin };
  const zero = new THREE.Vector3();
  let tt = 0;
  for (let i = 0; i < 240; i++) {
    if (sim.pos.z <= zLine) return { x: sim.pos.x, y: sim.pos.y, t: tt };
    stepBall(sim, 1 / 120, null, zero);
    tt += 1 / 120;
    if (sim.vel.z > -0.5) return null;
  }
  return null;
}
