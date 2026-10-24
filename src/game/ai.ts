// ===================== الذكاء الاصطناعي (AI) =====================
// الكمبيوتر يُنتج مدخلات مثل اللاعب البشري تماماً (عصا + أزرار)
import * as THREE from 'three';
import type { PlayerInput } from './input';
import { emptyInput } from './input';
import type { Difficulty } from './settings';
import { GOAL_W, GOAL_H, KEEPER_Z, predictCrossing, type Ball } from './physics';

export interface AIView {
  ball: Ball;
  shotTaken: boolean;
  charging: boolean;
  power: number;
  reticle: THREE.Vector2;
  keeperX: number;
  keeperOnGround: boolean;
  diveReady: boolean;
}

const cfg = {
  easy: { react: 0.38, err: 1.3, aimErr: 0.9, think: [2.5, 4.5], power: [0.45, 0.75] },
  normal: { react: 0.24, err: 0.65, aimErr: 0.5, think: [1.6, 3.2], power: [0.55, 0.9] },
  hard: { react: 0.13, err: 0.28, aimErr: 0.2, think: [1.0, 2.2], power: [0.65, 1.0] },
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class AI {
  difficulty: Difficulty = 'normal';
  // حالة المهاجم
  private moveTarget = new THREE.Vector2(0, 17);
  private thinkT = 2;
  private aim = new THREE.Vector2();
  private wantPower = 0.8;
  private curve = 0;
  private releasing = false;
  // حالة الحارس
  private sinceShot = 0;
  private plan: { x: number; y: number; t: number } | null = null;
  private acted = false;
  private jitter = 0;

  reset() {
    const c = cfg[this.difficulty];
    this.moveTarget.set(rnd(-8, 8), rnd(10, 20));
    this.thinkT = rnd(c.think[0], c.think[1]);
    this.releasing = false;
    this.sinceShot = 0;
    this.plan = null;
    this.acted = false;
    this.jitter = rnd(-0.4, 0.4);
  }

  /** الكمبيوتر كمهاجم (الكرة) */
  ballInput(v: AIView, dt: number): PlayerInput {
    const c = cfg[this.difficulty];
    const out = emptyInput();
    if (v.shotTaken) return out;
    if (!v.charging) {
      if (this.releasing) {
        this.releasing = false;
        return out;
      }
      this.thinkT -= dt;
      const dx = this.moveTarget.x - v.ball.pos.x;
      const dz = this.moveTarget.y - v.ball.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.6) {
        out.x = THREE.MathUtils.clamp(dx / 2, -1, 1);
        out.y = THREE.MathUtils.clamp(-dz / 2, -1, 1);
      } else if (Math.random() < dt * 0.6) {
        this.moveTarget.set(rnd(-8, 8), rnd(10, 20));
      }
      if (this.thinkT <= 0) {
        // قرار التسديد: اختيار زاوية وقوة وانحناء
        const side = Math.random() < 0.5 ? -1 : 1;
        const smart = this.difficulty === 'hard' ? 0.75 : this.difficulty === 'normal' ? 0.55 : 0.3;
        const ax = Math.random() < smart ? side * rnd(GOAL_W / 2 - 1.3, GOAL_W / 2 - 0.4) : rnd(-2.5, 2.5);
        const ay = Math.random() < 0.5 ? rnd(0.3, 0.9) : rnd(1.3, GOAL_H - 0.3);
        this.aim.set(ax + rnd(-c.aimErr, c.aimErr), ay + rnd(-c.aimErr, c.aimErr) * 0.5);
        this.wantPower = rnd(c.power[0], c.power[1]);
        this.curve = Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 1) : 0;
        out.shoot = true;
      }
      return out;
    }
    // أثناء الشحن: حرّك علامة التصويب نحو الهدف
    out.shoot = true;
    const ex = this.aim.x - v.reticle.x;
    const ey = this.aim.y - v.reticle.y;
    out.x = THREE.MathUtils.clamp(ex * 2.5, -1, 1);
    out.y = THREE.MathUtils.clamp(ey * 2.5, -1, 1);
    if (v.power >= this.wantPower && Math.abs(ex) < 0.25 && Math.abs(ey) < 0.25) {
      out.shoot = false;
      out.x = this.curve;
      out.y = 0;
      this.releasing = true;
      this.thinkT = rnd(c.think[0], c.think[1]);
    } else if (v.power >= 1 && Math.random() < dt * 2) {
      out.shoot = false;
      out.x = this.curve;
      this.releasing = true;
      this.thinkT = rnd(c.think[0], c.think[1]);
    }
    return out;
  }

  /** الكمبيوتر كحارس */
  keeperInput(v: AIView, dt: number): PlayerInput {
    const c = cfg[this.difficulty];
    const out = emptyInput();
    let targetX: number;
    if (!v.shotTaken) {
      this.sinceShot = 0;
      this.plan = null;
      this.acted = false;
      // الوقوف على منصف الزاوية
      targetX = THREE.MathUtils.clamp(v.ball.pos.x * 0.32 + this.jitter, -2.2, 2.2);
    } else {
      this.sinceShot += dt;
      if (this.sinceShot < c.react) {
        targetX = v.keeperX;
      } else {
        if (!this.plan) {
          const p = predictCrossing(v.ball, KEEPER_Z);
          if (p) this.plan = { x: p.x + rnd(-c.err, c.err), y: p.y + rnd(-c.err, c.err) * 0.4, t: p.t };
          else this.plan = { x: v.keeperX, y: 0, t: 9 };
        }
        this.plan.t -= dt;
        targetX = this.plan.x;
        const dx = this.plan.x - v.keeperX;
        if (!this.acted && Math.abs(this.plan.x) < GOAL_W / 2 + 0.6) {
          if (Math.abs(dx) > 1.1 && this.plan.t < 0.55 && v.diveReady) {
            out.dive = true;
            out.x = Math.sign(dx);
            out.y = this.plan.y > 1.3 ? 1 : 0;
            this.acted = true;
          } else if (Math.abs(dx) <= 1.1 && this.plan.y > 1.75 && this.plan.t < 0.4 && v.keeperOnGround) {
            out.jump = true;
            this.acted = true;
          }
        }
      }
    }
    if (!out.dive) {
      const dx = targetX - v.keeperX;
      out.x = Math.abs(dx) > 0.08 ? THREE.MathUtils.clamp(dx * 2, -1, 1) : 0;
    }
    return out;
  }
}
