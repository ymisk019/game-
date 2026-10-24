// ===================== المحرك (Game + Camera/FX) =====================
// إدارة الحالة والجولات، تحديث الحارس والكرة، الكاميرا، المؤثرات، والإعادة
import * as THREE from 'three';
import { audio } from './audio';
import { AI, type AIView } from './ai';
import { consumeAny, consumePause, getInput, pollGamepads, rumble, type PlayerInput } from './input';
import { net } from './network';
import {
  BALL_R, BALL_SPAWN, FIELD, GOAL_H, GOAL_W, GRAVITY, KEEPER_Z,
  computeShot, isGoal, isOut, stepBall, type Ball, type Sphere,
} from './physics';
import { buildBall, buildKeeper, buildWorld, P_COLORS, type KeeperModel, type World } from './scene';
import type { Difficulty, Quality } from './settings';

export type Phase = 'idle' | 'countdown' | 'ready' | 'play' | 'outcome' | 'replay' | 'roundEnd' | 'gameOver';
export type Outcome = 'goal' | 'save' | 'miss' | 'post';

export interface Hud {
  phase: Phase;
  round: number;
  totalRounds: number;
  golden: boolean;
  scores: [number, number];
  timer: number;
  attacker: 0 | 1;
  countdown: number;
  go: boolean;
  banner: Outcome | null;
  power: number;
  charging: boolean;
  diveCd: number;
  paused: boolean;
  pauseReason: 'user' | 'disconnect' | null;
  lostSlot: number;
  resumeIn: number;
  winner: number;
  fps: number;
  vsCpu: boolean;
  canSkip: boolean;
}

export interface MatchOpts {
  vsCpu: boolean;
  startBall: 0 | 1;
  rounds: number;
  roundTime: number;
  difficulty: Difficulty;
}

interface KeeperState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'stand' | 'jump' | 'dive' | 'recover';
  diveDir: number;
  diveT: number;
  recT: number;
  roll: number;
  armUp: number;
  cooldown: number;
  high: boolean;
}

const DIVE_CD = 2;
const REC_MAX = 900;
const REC_STRIDE = 12;
const v2 = new THREE.Vector3();
const qa = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const GOAL_CENTER = new THREE.Vector3(0, 1.1, 0);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export interface EngineCallbacks {
  onHud: (h: Hud) => void;
  onAutoQuality: (q: Quality) => void;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  world: World;
  ballMesh: THREE.Mesh;
  ballShadow: THREE.Mesh;
  ring: THREE.Mesh;
  reticle: THREE.Mesh;
  keeper: KeeperModel;
  spheres: Sphere[];
  cb: EngineCallbacks;
  quality: Quality = 'medium';
  autoQuality = true;
  inLobby = false;

  ball: Ball = { pos: BALL_SPAWN.clone(), vel: new THREE.Vector3(), spin: 0 };
  k: KeeperState = this.freshKeeper();
  kVel = new THREE.Vector3();

  // ===== حالة المباراة (Game) =====
  phase: Phase = 'idle';
  opts: MatchOpts = { vsCpu: false, startBall: 0, rounds: 6, roundTime: 30, difficulty: 'normal' };
  round = 0;
  golden = false;
  goldenAttacker: 0 | 1 = 0;
  scores: [number, number] = [0, 0];
  timer = 30;
  cdT = 0;
  lastCd = 0;
  goT = 0;
  readyT = 0;
  outT = 0;
  roundEndT = 0;
  outcome: Outcome | null = null;
  winner = -1;
  charging = false;
  power = 0;
  reticlePos = new THREE.Vector2(0, 1.2);
  shootArmed = false;
  shotTaken = false;
  shotT = 0;
  shotPower = 0;
  keeperTouched = false;
  touchT = 0;
  postHit = false;
  stillT = 0;
  touchSoundT = 0;
  chargeSoundT = 0;
  paused = false;
  pauseReason: 'user' | 'disconnect' | null = null;
  lostSlot = -1;
  lostIds = new Set<string>();
  resumeT = 0;
  prevBtn = [
    { shoot: false, jump: false, dive: false },
    { shoot: false, jump: false, dive: false },
  ];
  ai = new AI();

  // ===== المؤثرات (FX) =====
  slowT = 0;
  shake = 0;
  celebrateT = 0;
  rippleAmp = 0;
  rippleT = 0;
  ripple = new THREE.Vector2();
  particles: THREE.Points;
  pVel: Float32Array;
  pLife = 0;
  P_COUNT = 450;

  // ===== الكاميرا =====
  camPos = new THREE.Vector3(0, 8, 30);
  camLook = new THREE.Vector3(0, 1, 0);
  camFov = 55;
  orbitA = 0;
  shotCamX = 0;

  // ===== الإعادة (Replay) =====
  rec = new Float32Array(REC_MAX * REC_STRIDE);
  recHead = 0;
  recCount = 0;
  simTime = 0;
  shotSimTime = 0;
  goalSimTime = 0;
  replayT = 0;
  replayStart = 0;
  replayEnd = 0;
  replayReal = 0;

  // ===== الأداء =====
  raf = 0;
  last = 0;
  fpsFrames = 0;
  fpsTime = 0;
  fps = 60;
  lowStreak = 0;
  hudLast = '';
  hudTime = 0;
  syncTime = 0;
  disposed = false;

  constructor(canvas: HTMLCanvasElement, quality: Quality, cb: EngineCallbacks) {
    this.cb = cb;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    this.world = buildWorld();
    const scene = this.world.scene;

    this.ballMesh = buildBall();
    scene.add(this.ballMesh);
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_R * 1.1, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    scene.add(this.ballShadow);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.5, 28),
      new THREE.MeshBasicMaterial({ color: P_COLORS[0], transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    scene.add(this.ring);
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.reticle.renderOrder = 10;
    this.reticle.visible = false;
    scene.add(this.reticle);

    this.keeper = buildKeeper();
    scene.add(this.keeper.root);
    this.spheres = this.keeper.markers.map((m) => ({ c: new THREE.Vector3(), r: m.r }));

    // جزيئات الاحتفال
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P_COUNT * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.P_COUNT * 3), 3));
    this.particles = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 1, depthWrite: false }),
    );
    this.particles.visible = false;
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    this.pVel = new Float32Array(this.P_COUNT * 3);

    this.applyQuality(quality);
    this.resize();
    window.addEventListener('resize', this.resize);

    // ربط أحداث الشبكة: إيقاف مؤقت عند انقطاع تلفون
    net.onPadLost = (p) => {
      if (!this.inMatch() || this.phase === 'gameOver') return;
      if (this.opts.vsCpu && p.slot === 1) return;
      this.lostIds.add(p.id);
      this.pause('disconnect', p.slot);
    };
    net.onPadBack = (p) => {
      this.lostIds.delete(p.id);
      if (this.paused && this.pauseReason === 'disconnect' && this.lostIds.size === 0) this.resume();
      this.syncPads(true);
    };

    net.onPadPause = () => {
      if (!this.inMatch() || this.phase === 'gameOver') return;
      if (this.paused) this.resume();
      else this.pause('user');
    };

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  freshKeeper(): KeeperState {
    return { x: 0, y: 0, vx: 0, vy: 0, state: 'stand', diveDir: 1, diveT: 0, recT: 0, roll: 0, armUp: 0, cooldown: 0, high: false };
  }

  resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** تطبيق مستوى الجودة: دقة البكسل، الظلال، عدد الجمهور، الجزيئات */
  applyQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(1, dpr) * 0.75 : q === 'medium' ? Math.min(1.25, dpr) : Math.min(2, dpr));
    const sun = this.world.sun;
    sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        (sun.shadow as unknown as { map: null }).map = null;
      }
    }
    const frac = q === 'low' ? 0.3 : q === 'medium' ? 0.7 : 1;
    this.world.crowd.meshes.forEach((m) => (m.count = Math.floor((m.userData.full as number) * frac)));
    this.P_COUNT = q === 'low' ? 150 : 450;
    this.resize();
  }

  inMatch() {
    return this.phase !== 'idle';
  }

  get attacker(): 0 | 1 {
    if (this.golden) return this.goldenAttacker;
    return (this.round % 2 === 0 ? this.opts.startBall : 1 - this.opts.startBall) as 0 | 1;
  }

  // ================= Game: الحالة والجولات =================
  startMatch(o: MatchOpts) {
    this.opts = o;
    this.ai.difficulty = o.difficulty;
    this.scores = [0, 0];
    this.round = 0;
    this.golden = false;
    this.winner = -1;
    this.paused = false;
    this.pauseReason = null;
    this.lostIds.clear();
    this.resumeT = 0;
    this.celebrateT = 0;
    this.startRound();
    audio.stopMusic();
    audio.setCrowd(0.22);
  }

  startRound() {
    this.timer = this.opts.roundTime;
    this.resetPositions();
    this.phase = 'countdown';
    this.cdT = 3.99;
    this.lastCd = 4;
    this.cutCamera();
    this.syncPads(true);
  }

  resetPositions() {
    this.ball.pos.copy(BALL_SPAWN);
    this.ball.vel.set(0, 0, 0);
    this.ball.spin = 0;
    this.k = this.freshKeeper();
    this.charging = false;
    this.power = 0;
    this.shotTaken = false;
    this.shootArmed = false;
    this.keeperTouched = false;
    this.postHit = false;
    this.outcome = null;
    this.stillT = 0;
    this.shotT = 0;
    this.reticle.visible = false;
    this.recCount = 0;
    this.ai.reset();
    const att = this.attacker;
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(P_COLORS[att]);
    (this.reticle.material as THREE.MeshBasicMaterial).color.setHex(P_COLORS[att]).lerp(new THREE.Color(0xffffff), 0.4);
    this.keeper.bodyMat.color.setHex(P_COLORS[1 - att]);
  }

  endRound() {
    audio.whistle(true);
    this.phase = 'roundEnd';
    this.roundEndT = 3.2;
    this.charging = false;
    this.reticle.visible = false;
    this.syncPads(true);
  }

  nextRound() {
    if (!this.golden && this.round + 1 < this.opts.rounds) {
      this.round++;
      this.startRound();
    } else if (this.scores[0] === this.scores[1]) {
      // تعادل: هدف ذهبي
      if (!this.golden) {
        this.golden = true;
        this.goldenAttacker = this.opts.startBall;
      }
      this.round++;
      this.startRound();
    } else {
      this.gameOver(this.scores[0] > this.scores[1] ? 0 : 1);
    }
  }

  gameOver(w: number) {
    this.phase = 'gameOver';
    this.winner = w;
    audio.whistle(true);
    window.setTimeout(() => audio.goal(), 900);
    this.burst(new THREE.Vector3(0, 2, 2), P_COLORS[w], 1.4);
    this.celebrateT = 6;
    this.syncPads(true);
    net.vibrate(w as 0 | 1, [200, 80, 200, 80, 400]);
  }

  afterAttempt() {
    if (this.golden && this.outcome === 'goal') {
      this.gameOver(this.attacker);
      return;
    }
    if (this.golden) this.goldenAttacker = (1 - this.goldenAttacker) as 0 | 1;
    this.resetPositions();
    this.cutCamera();
    this.syncPads(true);
    if (this.timer <= 0.05) this.endRound();
    else {
      this.phase = 'ready';
      this.readyT = 0.9;
    }
  }

  pause(reason: 'user' | 'disconnect', slot = -1) {
    if (!this.inMatch()) return;
    this.paused = true;
    this.pauseReason = reason;
    this.lostSlot = slot;
    audio.setCrowd(0.05);
    this.emitHud(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseReason = null;
    this.lostIds.clear();
    const active = this.phase === 'play' || this.phase === 'ready' || this.phase === 'countdown';
    this.resumeT = active && this.phase !== 'countdown' ? 3 : 0;
    audio.setCrowd(0.22);
    this.emitHud(true);
  }

  quitToMenu() {
    this.phase = 'idle';
    this.paused = false;
    this.pauseReason = null;
    this.golden = false;
    this.resumeT = 0;
    this.resetPositions();
    this.keeper.bodyMat.color.setHex(P_COLORS[1]);
    audio.setCrowd(0.12);
    this.syncPads(true);
    this.emitHud(true);
  }

  /** إرسال الدور والنتيجة للتلفونات */
  syncPads(force = false) {
    const now = performance.now();
    if (!force && now - this.syncTime < 1000) return;
    this.syncTime = now;
    const att = this.attacker;
    for (const s of [0, 1] as const) {
      net.sendToSlot(s, {
        t: 'state',
        role: this.phase === 'idle' ? 'lobby' : s === att ? 'ball' : 'keeper',
        score: this.scores,
        me: s,
        phase: this.phase,
        timer: Math.ceil(this.timer),
      });
    }
  }

  // ================= Input: مدخلات اللاعبين أو الكمبيوتر =================
  private aiView(): AIView {
    return {
      ball: this.ball,
      shotTaken: this.shotTaken,
      charging: this.charging,
      power: this.power,
      reticle: this.reticlePos,
      keeperX: this.k.x,
      keeperOnGround: this.k.y <= 0.001 && this.k.state === 'stand',
      diveReady: this.k.cooldown <= 0 && this.k.state === 'stand',
    };
  }

  private inputFor(slot: 0 | 1, role: 'ball' | 'keeper', dt: number): PlayerInput {
    if (this.opts.vsCpu && slot === 1) {
      return role === 'ball' ? this.ai.ballInput(this.aiView(), dt) : this.ai.keeperInput(this.aiView(), dt);
    }
    return getInput(slot);
  }

  // ================= Physics: الحارس =================
  private updateKeeper(inp: PlayerInput, dt: number, jumpEdge: boolean, diveEdge: boolean) {
    const k = this.k;
    const ease = (cur: number, to: number, r: number) => cur + (to - cur) * Math.min(1, dt * r);
    k.cooldown = Math.max(0, k.cooldown - dt);
    if (k.state === 'stand') {
      k.vx = ease(k.vx, inp.x * 6.2, 14);
      k.armUp = ease(k.armUp, 0, 8);
      k.roll = ease(k.roll, 0, 10);
      if (diveEdge && k.cooldown <= 0) {
        const dir = Math.abs(inp.x) > 0.3 ? Math.sign(inp.x) : 0;
        k.cooldown = DIVE_CD;
        if (dir === 0) {
          // بدون اتجاه: قفزة عالية بذراعين ممدودتين
          k.state = 'jump';
          k.vy = 5.0;
        } else {
          k.state = 'dive';
          k.diveDir = dir;
          k.diveT = 0;
          k.high = inp.y > 0.35;
          k.vy = k.high ? 4.6 : 2.4;
        }
      } else if (jumpEdge) {
        k.state = 'jump';
        k.vy = 4.4;
      }
    } else if (k.state === 'jump') {
      k.vx = ease(k.vx, inp.x * 3, 5);
      k.armUp = ease(k.armUp, 1, 14);
    } else if (k.state === 'dive') {
      k.diveT += dt;
      const sp = k.high ? 6.0 : 7.0;
      k.vx = k.diveDir * sp * Math.max(0, 1 - k.diveT / 0.6);
      const maxRoll = k.high ? 1.05 : 1.4;
      k.roll = -k.diveDir * maxRoll * Math.min(1, k.diveT / 0.2);
      k.armUp = ease(k.armUp, 1, 18);
      if (k.diveT > 1.0 && k.y <= 0.001) {
        k.state = 'recover';
        k.recT = 0;
      }
    } else {
      k.recT += dt;
      k.vx *= 0.8;
      k.roll = ease(k.roll, 0, 9);
      k.armUp = ease(k.armUp, 0, 6);
      if (k.recT > 0.4) k.state = 'stand';
    }
    k.x += k.vx * dt;
    const lim = GOAL_W / 2 + 0.6;
    if (Math.abs(k.x) > lim) {
      k.x = Math.sign(k.x) * lim;
      k.vx = 0;
    }
    if (k.state === 'jump' || k.state === 'dive' || k.y > 0) {
      k.vy -= GRAVITY * dt;
      k.y += k.vy * dt;
      if (k.y <= 0) {
        k.y = 0;
        k.vy = 0;
        if (k.state === 'jump') k.state = 'stand';
      }
    }
    this.kVel.set(k.vx, k.vy, 0);
  }

  /** تطبيق حالة الحارس على النموذج وتحديث كرات التصادم */
  private applyKeeperVisual(x: number, y: number, roll: number, armUp: number, idleT = 0) {
    const m = this.keeper;
    m.root.position.set(x, y, KEEPER_Z);
    m.root.rotation.z = roll;
    const a = 0.8 + armUp * 2.25 + Math.sin(idleT * 3) * 0.05;
    m.armL.rotation.z = -a;
    m.armR.rotation.z = a;
    m.root.updateMatrixWorld(true);
    for (let i = 0; i < m.markers.length; i++) m.markers[i].obj.getWorldPosition(this.spheres[i].c);
  }

  // ================= Physics: الكرة أثناء المراوغة =================
  private updateDribble(inp: PlayerInput, dt: number) {
    const b = this.ball;
    if (!inp.shoot) this.shootArmed = true;
    if (!this.charging) {
      const f = Math.min(1, dt * 5);
      b.vel.x += (inp.x * 7 - b.vel.x) * f;
      b.vel.z += (-inp.y * 7 - b.vel.z) * f;
      if (this.shootArmed && inp.shoot) {
        this.charging = true;
        this.power = 0;
        this.reticlePos.set(0, 1.0);
        this.reticle.visible = true;
        audio.click();
      }
    } else {
      b.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.power = Math.min(1, this.power + dt / 1.1);
      this.chargeSoundT -= dt;
      if (this.chargeSoundT <= 0 && this.power < 1) {
        audio.charge(this.power);
        this.chargeSoundT = 0.08;
      }
      this.reticlePos.x = THREE.MathUtils.clamp(this.reticlePos.x + inp.x * 5.5 * dt, -GOAL_W / 2 - 1.2, GOAL_W / 2 + 1.2);
      this.reticlePos.y = THREE.MathUtils.clamp(this.reticlePos.y + inp.y * 3.2 * dt, 0.15, GOAL_H + 0.9);
      if (!inp.shoot) this.shoot(inp);
    }
    if (!this.shotTaken) {
      b.pos.x += b.vel.x * dt;
      b.pos.z += b.vel.z * dt;
      b.pos.y = BALL_R;
      if (b.pos.x < FIELD.minX || b.pos.x > FIELD.maxX) {
        b.pos.x = THREE.MathUtils.clamp(b.pos.x, FIELD.minX, FIELD.maxX);
        b.vel.x = 0;
      }
      if (b.pos.z < FIELD.minZ || b.pos.z > FIELD.maxZ) {
        b.pos.z = THREE.MathUtils.clamp(b.pos.z, FIELD.minZ, FIELD.maxZ);
        b.vel.z = 0;
      }
      const sp = Math.hypot(b.vel.x, b.vel.z);
      this.touchSoundT -= dt * sp;
      if (sp > 1.5 && this.touchSoundT <= 0) {
        audio.touch();
        this.touchSoundT = 2.2;
      }
    }
  }

  /** التسديد: القوة + علامة التصويب + الانحناء حسب العصا لحظة الإفلات */
  private shoot(inp: PlayerInput) {
    const p = this.power;
    const speed = 13 + p * 19;
    const spread = 0.12 + p * p * p * 0.8;
    const target = new THREE.Vector3(
      this.reticlePos.x + gauss() * spread,
      Math.max(0.12, this.reticlePos.y + gauss() * spread * 0.6),
      0,
    );
    const spin = -inp.x * 3.0;
    this.ball.vel.copy(computeShot(this.ball.pos, target, speed, spin));
    this.ball.spin = spin;
    this.charging = false;
    this.reticle.visible = false;
    this.shotTaken = true;
    this.shotT = 0;
    this.shotPower = p;
    this.shotSimTime = this.simTime;
    this.shotCamX = this.camPos.x;
    audio.kick(p);
    const att = this.attacker;
    net.vibrate(att, Math.round(40 + p * 80));
    rumble(att, 0.4 + p * 0.6, 120);
    if (p > 0.8) this.slowT = 0.25;
  }

  private resolve(o: Outcome) {
    this.outcome = o;
    this.phase = 'outcome';
    const att = this.attacker;
    const kp = (1 - att) as 0 | 1;
    if (o === 'goal') {
      this.outT = 2.3;
      this.scores[att]++;
      this.goalSimTime = this.simTime;
      audio.goal();
      this.burst(new THREE.Vector3(this.ball.pos.x, 1.2, 0.5), P_COLORS[att], 1);
      this.rippleAmp = 0.5;
      this.rippleT = 0;
      this.ripple.set(this.ball.pos.x, this.ball.pos.y - GOAL_H / 2);
      this.celebrateT = 3;
      if (this.shotPower > 0.75) this.slowT = 0.6;
      net.vibrate(att, [120, 60, 250]);
      rumble(att, 1, 400);
    } else {
      this.outT = 1.6;
      if (o === 'save') {
        net.vibrate(kp, [80, 40, 120]);
        rumble(kp, 0.8, 200);
      } else audio.crowdSwell(0.35, 1.4);
    }
    this.syncPads(true);
  }

  // ================= التحديث الرئيسي =================
  private update(dt: number) {
    this.simTime += dt;
    const att = this.attacker;
    const kp = (1 - att) as 0 | 1;
    switch (this.phase) {
      case 'idle': {
        this.k.x = Math.sin(this.simTime * 0.7) * 1.2;
        break;
      }
      case 'countdown': {
        this.cdT -= dt;
        const c = Math.ceil(this.cdT);
        if (c !== this.lastCd && c > 0) {
          this.lastCd = c;
          audio.beep(false);
        }
        if (this.cdT <= 0) {
          this.phase = 'play';
          this.goT = 0.8;
          audio.beep(true);
          audio.whistle();
          this.syncPads(true);
        }
        break;
      }
      case 'ready': {
        this.readyT -= dt;
        if (this.readyT <= 0) {
          this.phase = 'play';
          audio.whistle();
        }
        break;
      }
      case 'play':
      case 'outcome': {
        const playing = this.phase === 'play';
        const inA = playing ? this.inputFor(att, 'ball', dt) : { x: 0, y: 0, shoot: false, jump: false, dive: false };
        const inK = this.inputFor(kp, 'keeper', dt);
        const pk = this.prevBtn[kp];
        this.updateKeeper(inK, dt, inK.jump && !pk.jump, inK.dive && !pk.dive);
        pk.jump = inK.jump;
        pk.dive = inK.dive;
        this.applyKeeperVisual(this.k.x, this.k.y, this.k.roll, this.k.armUp);
        if (playing && !this.shotTaken) {
          this.timer -= dt;
          this.updateDribble(inA, dt);
          if (this.timer <= 0 && !this.shotTaken) {
            this.timer = 0;
            this.endRound();
            return;
          }
        } else {
          const res = stepBall(this.ball, dt, this.spheres, this.kVel);
          if (res.bounce > 2) audio.bounce(res.bounce);
          if (res.post && !this.postHit) {
            this.postHit = true;
            audio.post();
            this.shake = Math.max(this.shake, 0.15);
          }
          if (res.keeper && !this.keeperTouched) {
            this.keeperTouched = true;
            this.touchT = 0;
            audio.save();
            this.shake = 0.4;
          }
          if (playing) {
            this.shotT += dt;
            const sp = this.ball.vel.length();
            this.stillT = sp < 0.5 ? this.stillT + dt : 0;
            if (isGoal(this.ball)) this.resolve('goal');
            else if (this.keeperTouched) {
              this.touchT += dt;
              if (this.touchT > 1.1 || isOut(this.ball) || this.stillT > 0.4) this.resolve('save');
            } else if (isOut(this.ball) || this.stillT > 0.6 || this.shotT > 5) {
              this.resolve(this.postHit ? 'post' : 'miss');
            }
          } else {
            this.outT -= dt;
            if (this.outT <= 0) {
              if (this.outcome === 'goal' && this.recCount > 10) this.startReplay();
              else this.afterAttempt();
            }
          }
        }
        this.record();
        break;
      }
      case 'roundEnd': {
        this.roundEndT -= dt;
        if (this.roundEndT <= 0) this.nextRound();
        break;
      }
      default:
        break;
    }
    if (this.phase !== 'play' && this.phase !== 'outcome' && this.phase !== 'replay') {
      this.applyKeeperVisual(this.k.x, this.k.y, this.k.roll, this.k.armUp, this.simTime);
    }
  }

  // ================= Replay: الإعادة =================
  private record() {
    const i = this.recHead * REC_STRIDE;
    const r = this.rec;
    const q = this.ballMesh.quaternion;
    r[i] = this.simTime;
    r[i + 1] = this.ball.pos.x;
    r[i + 2] = this.ball.pos.y;
    r[i + 3] = this.ball.pos.z;
    r[i + 4] = q.x;
    r[i + 5] = q.y;
    r[i + 6] = q.z;
    r[i + 7] = q.w;
    r[i + 8] = this.k.x;
    r[i + 9] = this.k.y;
    r[i + 10] = this.k.roll;
    r[i + 11] = this.k.armUp;
    this.recHead = (this.recHead + 1) % REC_MAX;
    this.recCount = Math.min(REC_MAX, this.recCount + 1);
  }

  private recAt(n: number) {
    // n = 0 أقدم إطار
    const idx = (this.recHead - this.recCount + n + REC_MAX) % REC_MAX;
    return idx * REC_STRIDE;
  }

  private startReplay() {
    const oldest = this.rec[this.recAt(0)];
    const newest = this.rec[this.recAt(this.recCount - 1)];
    this.replayStart = Math.max(oldest, this.shotSimTime - 0.7);
    this.replayEnd = Math.min(newest, this.goalSimTime + 0.9);
    this.replayT = this.replayStart;
    this.replayReal = 0;
    this.phase = 'replay';
    consumeAny();
    this.emitHud(true);
  }

  private updateReplay(realDt: number) {
    this.replayReal += realDt;
    this.replayT += realDt * 0.45;
    // البحث عن الإطار المناسب
    let lo = 0;
    let hi = this.recCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.rec[this.recAt(mid)] < this.replayT) lo = mid + 1;
      else hi = mid;
    }
    const i = this.recAt(lo);
    const r = this.rec;
    this.ball.pos.set(r[i + 1], r[i + 2], r[i + 3]);
    this.ballMesh.quaternion.set(r[i + 4], r[i + 5], r[i + 6], r[i + 7]);
    this.applyKeeperVisual(r[i + 8], r[i + 9], r[i + 10], r[i + 11]);
    const skip = this.replayReal > 0.6 && consumeAny();
    if (this.replayT >= this.replayEnd || skip) this.afterAttempt();
  }

  // ================= Camera/FX =================
  private cutCamera() {
    const p = new THREE.Vector3();
    const l = new THREE.Vector3();
    this.computeCamTarget(p, l);
    this.camPos.copy(p);
    this.camLook.copy(l);
  }

  private computeCamTarget(pos: THREE.Vector3, look: THREE.Vector3): number {
    const b = this.ball.pos;
    let fov = 55;
    const ph = this.phase;
    if (ph === 'idle' || ph === 'gameOver' || ph === 'roundEnd') {
      const r = ph === 'idle' ? 1 : 0.7;
      pos.set(Math.sin(this.orbitA) * 22 * r, 8 * r + 2, 12 + Math.cos(this.orbitA) * 14 * r);
      look.set(0, 1.2, 3);
      return 55;
    }
    if (ph === 'replay') {
      // كاميرا خلف الشبكة
      pos.set(b.x * 0.4 + 1.5, 1.3, -GOAL_W * 0.75);
      look.copy(b);
      return 50;
    }
    if (ph === 'outcome' && this.outcome === 'goal') {
      pos.set(b.x * 0.5 + 4, 2.2, 6.5);
      look.set(b.x, 1, -0.5);
      return 50;
    }
    if (this.shotTaken) {
      // تقريب الكاميرا نحو المرمى لحظة التسديد
      pos.set(b.x * 0.55 + this.shotCamX * 0.3, 1.9, Math.max(6.5, b.z + 5));
      look.set(b.x * 0.6, 1.2, Math.min(b.z, 0));
      return 46;
    }
    const dir = new THREE.Vector3(b.x, 0, b.z).normalize();
    const dist = this.charging ? 5 : 6.5;
    pos.copy(b).addScaledVector(dir, dist);
    pos.y = this.charging ? 2.0 : 2.6;
    look.copy(b).lerp(GOAL_CENTER, 0.55);
    if (this.charging) fov = 50 - this.power * 4;
    return fov;
  }

  private updateCamera(dt: number) {
    this.orbitA += dt * 0.08;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const fov = this.computeCamTarget(pos, look);
    const rate = this.phase === 'replay' ? 20 : this.shotTaken ? 5 : 4;
    const f = 1 - Math.exp(-dt * rate);
    this.camPos.lerp(pos, f);
    this.camLook.lerp(look, f);
    this.camFov += (fov - this.camFov) * f;
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.2);
    }
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - this.camFov) > 0.01) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** جزيئات احتفال */
  private burst(at: THREE.Vector3, color: number, scale: number) {
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.particles.geometry.attributes.color as THREE.BufferAttribute;
    const c1 = new THREE.Color(color);
    const c2 = new THREE.Color(0xffffff);
    const c3 = new THREE.Color(0xfacc15);
    for (let i = 0; i < this.P_COUNT; i++) {
      pos.setXYZ(i, at.x + (Math.random() - 0.5) * 4 * scale, at.y + Math.random(), at.z + (Math.random() - 0.5));
      const a = Math.random() * Math.PI * 2;
      const s = (2 + Math.random() * 5) * scale;
      this.pVel[i * 3] = Math.cos(a) * s;
      this.pVel[i * 3 + 1] = 4 + Math.random() * 7 * scale;
      this.pVel[i * 3 + 2] = Math.sin(a) * s * 0.6 + 2;
      const c = [c1, c2, c3][i % 3];
      col.setXYZ(i, c.r, c.g, c.b);
    }
    this.particles.geometry.setDrawRange(0, this.P_COUNT);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.pLife = 3;
    this.particles.visible = true;
  }

  private updateFx(dt: number) {
    // الجزيئات
    if (this.pLife > 0) {
      this.pLife -= dt;
      const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < this.P_COUNT; i++) {
        const j = i * 3;
        this.pVel[j + 1] -= 6 * dt;
        this.pVel[j] *= 1 - dt * 0.8;
        this.pVel[j + 2] *= 1 - dt * 0.8;
        arr[j] += this.pVel[j] * dt;
        arr[j + 1] = Math.max(0.05, arr[j + 1] + this.pVel[j + 1] * dt);
        arr[j + 2] += this.pVel[j + 2] * dt;
      }
      pos.needsUpdate = true;
      (this.particles.material as THREE.PointsMaterial).opacity = Math.min(1, this.pLife);
      if (this.pLife <= 0) this.particles.visible = false;
    }
    // تموج الشبكة
    if (this.rippleAmp > 0.003) {
      this.rippleT += dt;
      this.rippleAmp *= Math.exp(-dt * 2.2);
      const geo = this.world.goal.backNet.geometry;
      const p = geo.attributes.position as THREE.BufferAttribute;
      const base = this.world.goal.backBase;
      const osc = Math.cos(this.rippleT * 16);
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        const y = base[i * 3 + 1];
        const d2 = (x - this.ripple.x) ** 2 + (y - this.ripple.y) ** 2;
        p.setZ(i, -this.rippleAmp * Math.exp(-d2 / 0.9) * (0.6 + 0.4 * osc));
      }
      p.needsUpdate = true;
    }
    // الجمهور يقفز عند الاحتفال
    const meshes = this.world.crowd.meshes;
    if (this.celebrateT > 0) this.celebrateT -= dt;
    const amp = this.celebrateT > 0 ? 0.35 * Math.min(1, this.celebrateT) : 0.03;
    const sp = this.celebrateT > 0 ? 9 : 2;
    for (let i = 0; i < meshes.length; i++) meshes[i].position.y = Math.abs(Math.sin(this.simTime * sp + i * 2.1)) * amp;
    // الكرة: دوران بصري + الظل + الحلقة
    const b = this.ball;
    if (this.phase !== 'replay') {
      const hs = Math.hypot(b.vel.x, b.vel.z);
      if (hs > 0.01) {
        v2.set(b.vel.z, 0, -b.vel.x).normalize();
        qa.setFromAxisAngle(v2, (hs * dt) / BALL_R);
        this.ballMesh.quaternion.premultiply(qa);
      }
      if (b.spin) {
        qa.setFromAxisAngle(UP, b.spin * dt * 6);
        this.ballMesh.quaternion.premultiply(qa);
      }
    }
    this.ballMesh.position.copy(b.pos);
    this.ballShadow.position.set(b.pos.x, 0.012, b.pos.z);
    const hgt = Math.max(0, b.pos.y - BALL_R);
    this.ballShadow.scale.setScalar(1 + hgt * 0.4);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.35 / (1 + hgt);
    const showRing = !this.shotTaken && this.phase !== 'idle' && this.phase !== 'replay';
    this.ring.visible = showRing;
    if (showRing) {
      this.ring.position.set(b.pos.x, 0.015, b.pos.z);
      const s = 1 + Math.sin(this.simTime * 6) * 0.06;
      this.ring.scale.setScalar(s);
    }
    if (this.reticle.visible) {
      this.reticle.position.set(this.reticlePos.x, this.reticlePos.y, 0.15);
      this.reticle.scale.setScalar(1.2 - this.power * 0.4);
      this.reticle.rotation.z += dt * 3;
    }
  }

  // ================= HUD =================
  private emitHud(force = false) {
    const now = performance.now();
    if (!force && now - this.hudTime < 50) return;
    this.hudTime = now;
    const h: Hud = {
      phase: this.phase,
      round: this.round,
      totalRounds: this.opts.rounds,
      golden: this.golden,
      scores: [this.scores[0], this.scores[1]],
      timer: Math.ceil(this.timer),
      attacker: this.attacker,
      countdown: this.phase === 'countdown' ? Math.max(1, Math.ceil(this.cdT)) : this.resumeT > 0 ? Math.ceil(this.resumeT) : 0,
      go: this.goT > 0,
      banner: this.phase === 'outcome' ? this.outcome : null,
      power: Math.round(this.power * 50) / 50,
      charging: this.charging,
      diveCd: Math.round((this.k.cooldown / DIVE_CD) * 40) / 40,
      paused: this.paused,
      pauseReason: this.pauseReason,
      lostSlot: this.lostSlot,
      resumeIn: Math.ceil(this.resumeT),
      winner: this.winner,
      fps: Math.round(this.fps),
      vsCpu: this.opts.vsCpu,
      canSkip: this.phase === 'replay' && this.replayReal > 0.6,
    };
    const key = JSON.stringify(h);
    if (key !== this.hudLast) {
      this.hudLast = key;
      this.cb.onHud(h);
    }
  }

  // ================= الحلقة الرئيسية =================
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const realDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    pollGamepads(this.inLobby);

    // قياس الأداء وخفض الجودة تلقائياً
    this.fpsFrames++;
    this.fpsTime += realDt;
    if (this.fpsTime >= 2) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      if (this.autoQuality && this.fps < 42 && this.quality !== 'low' && !document.hidden) {
        this.lowStreak++;
        if (this.lowStreak >= 2) {
          const q: Quality = this.quality === 'high' ? 'medium' : 'low';
          this.applyQuality(q);
          this.cb.onAutoQuality(q);
          this.lowStreak = 0;
        }
      } else this.lowStreak = 0;
    }

    if (consumePause() && this.inMatch() && this.phase !== 'gameOver') {
      if (this.paused) this.resume();
      else this.pause('user');
    }

    let dt = realDt;
    if (!this.paused) {
      if (this.resumeT > 0) {
        this.resumeT -= realDt;
        dt = 0;
      } else {
        if (this.slowT > 0) {
          this.slowT -= realDt;
          dt *= 0.3;
        }
        if (this.goT > 0) this.goT -= realDt;
        if (this.phase === 'replay') this.updateReplay(realDt);
        else this.update(dt);
      }
      this.updateFx(this.phase === 'replay' ? realDt * 0.45 : dt);
    }
    this.syncPads();
    this.updateCamera(realDt);
    this.renderer.render(this.world.scene, this.camera);
    this.emitHud();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    net.onPadLost = null;
    net.onPadBack = null;
    this.renderer.dispose();
  }
}
