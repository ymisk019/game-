// ===================== التطبيق الرئيسي (UI + ربط المحرك) =====================
import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from './game/audio';
import { Engine, type Hud as HudT } from './game/engine';
import { initInput, getGamepads, gamepadSlots } from './game/input';
import { net } from './game/network';
import { loadSettings, saveSettings, type Settings } from './game/settings';
import { Hud } from './ui/Hud';
import { Lobby } from './ui/Lobby';
import { HowTo, MainMenu, SettingsScreen } from './ui/screens';

type Screen = 'menu' | 'howto' | 'settings' | 'lobby' | 'game';

let inputReady = false;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [s, setS] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>('menu');
  const [hud, setHud] = useState<HudT | null>(null);
  const [vsCpu, setVsCpu] = useState(false);
  const [startBall, setStartBall] = useState<0 | 1>(0);
  const startBallRef = useRef(startBall);
  const vsCpuRef = useRef(vsCpu);
  startBallRef.current = startBall;
  vsCpuRef.current = vsCpu;

  // ===== تهيئة المحرك مرة واحدة =====
  useEffect(() => {
    if (!inputReady) {
      initInput();
      inputReady = true;
    }
    const eng = new Engine(canvasRef.current!, loadSettings().quality, {
      onHud: setHud,
      onAutoQuality: (q) => setS((prev) => ({ ...prev, quality: q })),
    });
    engineRef.current = eng;
    // اختيار اللاعب للتلفون الجديد حسب الدور المطلوب
    net.pickSlot = (pref) => {
      if (vsCpuRef.current) return 0;
      if (pref === 'ball') return startBallRef.current;
      if (pref === 'keeper') return (1 - startBallRef.current) as 0 | 1;
      const c = [0, 0];
      net.pads.forEach((p) => p.connected && c[p.slot]++);
      return c[0] <= c[1] ? 0 : 1;
    };
    net.start();
    // تشغيل الصوت بعد أول تفاعل
    const unlock = () => {
      audio.unlock();
      const st = loadSettings();
      audio.setVolumes(st.sfx, st.music);
      if (engineRef.current?.phase === 'idle') {
        audio.startMusic();
        audio.setCrowd(0.12);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  // ===== حفظ وتطبيق الإعدادات =====
  useEffect(() => {
    saveSettings(s);
    document.documentElement.lang = s.lang;
    document.documentElement.dir = s.lang === 'ar' ? 'rtl' : 'ltr';
    audio.setVolumes(s.sfx, s.music);
    const eng = engineRef.current;
    if (eng) {
      eng.autoQuality = s.autoQuality;
      if (eng.quality !== s.quality) eng.applyQuality(s.quality);
    }
    net.broadcast({ t: 'lang', lang: s.lang });
  }, [s]);

  // أثناء اللعب الفعلي: نمنع سلوك المتصفح لمفاتيح اللعب ونزيل التركيز عن الأزرار
  const activePlay = screen === 'game' && !!hud && !hud.paused && hud.phase !== 'gameOver';
  useEffect(() => {
    document.body.dataset.playing = activePlay ? '1' : '0';
    if (activePlay) (document.activeElement as HTMLElement | null)?.blur?.();
  }, [activePlay]);
  useEffect(() => {
    if (engineRef.current) engineRef.current.inLobby = screen === 'lobby';
  }, [screen]);

  const update = (p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p }));

  const startMatch = useCallback(() => {
    audio.unlock();
    engineRef.current?.startMatch({
      vsCpu,
      startBall,
      rounds: s.rounds,
      roundTime: s.roundTime,
      difficulty: s.difficulty,
    });
    setScreen('game');
  }, [vsCpu, startBall, s.rounds, s.roundTime, s.difficulty]);

  const toMenu = useCallback(() => {
    engineRef.current?.quitToMenu();
    setScreen('menu');
    audio.startMusic();
  }, []);

  // ===== التنقل في القوائم بيد التحكم (للتلفزيون) =====
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (screen === 'howto' || screen === 'settings' || screen === 'lobby') setScreen('menu');
  };
  useEffect(() => {
    let prev = { up: false, down: false, a: false, b: false };
    const seen = new Set<number>();
    const id = window.setInterval(() => {
      const inGame = screen === 'game' && !(hudRef.current?.paused || hudRef.current?.phase === 'gameOver');
      if (inGame) return;
      let up = false;
      let down = false;
      let a = false;
      let b = false;
      for (const g of getGamepads()) {
        if (!seen.has(g.index)) {
          // أول ضغطة من يد جديدة تُستعمل للانضمام فقط
          if (g.buttons.some((x) => x.pressed)) continue;
          if (gamepadSlots.has(g.index) || screen !== 'lobby') seen.add(g.index);
          continue;
        }
        up ||= !!g.buttons[12]?.pressed || (g.axes[1] ?? 0) < -0.6;
        down ||= !!g.buttons[13]?.pressed || (g.axes[1] ?? 0) > 0.6;
        a ||= !!g.buttons[0]?.pressed;
        b ||= !!g.buttons[1]?.pressed;
      }
      const move = (d: number) => {
        const els = Array.from(document.querySelectorAll<HTMLElement>('[data-nav]')).filter((e) => e.offsetParent !== null);
        if (!els.length) return;
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + d + els.length) % els.length].focus();
      };
      if (up && !prev.up) move(-1);
      if (down && !prev.down) move(1);
      if (a && !prev.a) (document.activeElement as HTMLElement | null)?.click();
      if (b && !prev.b) backRef.current();
      prev = { up, down, a, b };
    }, 50);
    // ريموت التلفزيون / الأسهم: التنقل بين الأزرار
    const onKey = (e: KeyboardEvent) => {
      if (document.body.dataset.playing === '1') return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Backspace') return;
      if (e.key === 'Backspace') {
        backRef.current();
        return;
      }
      e.preventDefault();
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-nav]')).filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const i = els.indexOf(document.activeElement as HTMLElement);
      els[(i + (e.key === 'ArrowUp' ? -1 : 1) + els.length) % els.length].focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [screen]);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  const L = s.lang;
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950 text-white" dir={L === 'ar' ? 'rtl' : 'ltr'}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {screen !== 'game' && <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/20 to-slate-950/70" />}
      <div className="absolute inset-0">
        {screen === 'menu' && (
          <MainMenu
            s={s}
            onPlay={() => setScreen('lobby')}
            onHow={() => setScreen('howto')}
            onSettings={() => setScreen('settings')}
            onLang={() => update({ lang: L === 'ar' ? 'en' : 'ar' })}
          />
        )}
        {screen === 'howto' && <HowTo s={s} onBack={() => setScreen('menu')} />}
        {screen === 'settings' && <SettingsScreen s={s} onChange={update} onBack={() => setScreen('menu')} />}
        {screen === 'lobby' && (
          <Lobby
            s={s}
            vsCpu={vsCpu}
            setVsCpu={setVsCpu}
            startBall={startBall}
            setStartBall={setStartBall}
            onStart={startMatch}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'game' && hud && hud.phase !== 'idle' && (
          <Hud
            h={hud}
            s={s}
            onPause={() => engineRef.current?.pause('user')}
            onResume={() => engineRef.current?.resume()}
            onQuit={toMenu}
            onRestart={startMatch}
          />
        )}
      </div>
      {screen !== 'game' && (
        <button
          onClick={() => update({ lang: L === 'ar' ? 'en' : 'ar' })}
          className="absolute end-4 top-4 rounded-xl bg-white/10 px-4 py-2 text-lg font-bold backdrop-blur hover:bg-white/20"
        >
          🌐 {L === 'ar' ? 'EN' : 'ع'}
        </button>
      )}
    </div>
  );
}
