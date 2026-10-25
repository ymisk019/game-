// ===================== التطبيق الرئيسي (UI + ربط المحرك) =====================
import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from './game/audio';
import { Engine, type Hud as HudT } from './game/engine';
import { initInput, getGamepads, gamepadSlots, setMaxPlayers } from './game/input';
import { net, type Slot } from './game/network';
import { t } from './game/i18n';
import { loadSettings, saveSettings, type Settings } from './game/settings';
import { Hud } from './ui/Hud';
import { Lobby } from './ui/Lobby';
import { HowTo, MainMenu, SettingsScreen, ShopScreen } from './ui/screens';

type Screen = 'menu' | 'howto' | 'settings' | 'shop' | 'lobby' | 'game';

let inputReady = false;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const engine2Ref = useRef<Engine | null>(null);
  const rewardedRef = useRef(false);
  const [s, setS] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>('menu');
  const [hud, setHud] = useState<HudT | null>(null);
  const [hud2, setHud2] = useState<HudT | null>(null);
  const [vsCpu, setVsCpu] = useState(false);
  const [split, setSplit] = useState(false);
  const [startBall, setStartBall] = useState<0 | 1>(0);
  const [matchMode, setMatchMode] = useState<'classic' | 'challenge' | 'tournament'>('classic');
  const startBallRef = useRef(startBall);
  const vsCpuRef = useRef(vsCpu);
  const splitRef = useRef(split);
  startBallRef.current = startBall;
  vsCpuRef.current = vsCpu;
  splitRef.current = split;

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
      const n = splitRef.current ? 4 : 2;
      const sb = startBallRef.current;
      const cands: Slot[] = [];
      for (let m = 0; m < n; m += 2) {
        if (pref === 'ball') cands.push((m + sb) as Slot);
        else if (pref === 'keeper') cands.push((m + 1 - sb) as Slot);
        else cands.push(m as Slot, (m + 1) as Slot);
      }
      const count = (sl: Slot) => Array.from(net.pads.values()).filter((p) => p.connected && p.slot === sl).length;
      let best = cands[0];
      for (const c of cands) if (count(c) < count(best)) best = c;
      return best;
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

  // ===== المحرك الثاني (شاشة مقسومة لـ4 لاعبين) =====
  useEffect(() => {
    setMaxPlayers(split ? 4 : 2);
    if (!split || !canvas2Ref.current || !engineRef.current) return;
    const first = engineRef.current;
    const eng2 = new Engine(canvas2Ref.current, loadSettings().quality, { onHud: setHud2, onAutoQuality: () => {} }, { slotBase: 2 });
    eng2.autoQuality = false;
    eng2.applyCustomization(s.ballStyle, s.gloveStyle);
    first.linked = eng2;
    eng2.linked = first;
    engine2Ref.current = eng2;
    return () => {
      eng2.dispose();
      engine2Ref.current = null;
      first.linked = null;
      setHud2(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split]);

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
      eng.applyCustomization(s.ballStyle, s.gloveStyle);
    }
    const eng2 = engine2Ref.current;
    if (eng2) {
      if (eng2.quality !== s.quality) eng2.applyQuality(s.quality);
      eng2.applyCustomization(s.ballStyle, s.gloveStyle);
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

  const startMatch = useCallback((mode: 'classic' | 'challenge' | 'tournament' = matchMode) => {
    setMatchMode(mode);
    rewardedRef.current = false;
    audio.unlock();
    const rounds = mode === 'challenge' ? 2 : mode === 'tournament' ? 10 : s.rounds;
    const roundTime = mode === 'challenge' ? 15 : mode === 'tournament' ? 30 : s.roundTime;
    const base = { startBall, rounds, roundTime, difficulty: s.difficulty };
    engineRef.current?.startMatch({ ...base, vsCpu: split ? false : vsCpu });
    if (split) engine2Ref.current?.startMatch({ ...base, vsCpu: false });
    setScreen('game');
  }, [vsCpu, split, startBall, s.rounds, s.roundTime, s.difficulty, matchMode]);

  const toMenu = useCallback(() => {
    engineRef.current?.quitToMenu();
    engine2Ref.current?.quitToMenu();
    setScreen('menu');
    audio.startMusic();
  }, []);

  // ===== التنقل في القوائم بيد التحكم (للتلفزيون) =====
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (screen === 'howto' || screen === 'settings' || screen === 'shop' || screen === 'lobby') setScreen('menu');
  };
  useEffect(() => {
    const isPlaying = () =>
      screen === 'game' &&
      !(hudRef.current?.paused || hudRef.current?.phase === 'gameOver' || (splitRef.current && (hud2Ref.current?.paused || hud2Ref.current?.phase === 'gameOver')));
    const moveFocus = (d: number) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-nav]')).filter((e) => e.offsetParent !== null);
      if (!els.length) return;
      const i = els.indexOf(document.activeElement as HTMLElement);
      els[(i + d + els.length) % els.length].focus();
    };
    // التنقل في القوائم من التلفون (أزرار ▲ ▼ OK ↩)
    const onPhoneNav = (k: string) => {
      if (isPlaying()) return;
      if (k === 'up') moveFocus(-1);
      else if (k === 'down') moveFocus(1);
      else if (k === 'ok') (document.activeElement as HTMLElement | null)?.click();
      else if (k === 'back') backRef.current();
    };
    net.navListeners.add(onPhoneNav);
    let prev = { up: false, down: false, a: false, b: false };
    const seen = new Set<number>();
    const id = window.setInterval(() => {
      if (isPlaying()) return;
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
      net.navListeners.delete(onPhoneNav);
      window.removeEventListener('keydown', onKey);
    };
  }, [screen]);
  const hudRef = useRef(hud);
  hudRef.current = hud;
  const hud2Ref = useRef(hud2);
  hud2Ref.current = hud2;
  useEffect(() => {
    if (hud?.phase === 'gameOver' && !rewardedRef.current) {
      rewardedRef.current = true;
      const reward = hud.winner >= 0 ? 80 : 30;
      setS((prev) => ({ ...prev, coins: prev.coins + reward }));
    }
  }, [hud?.phase, hud?.winner]);

  const L = s.lang;
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950 text-white" dir={L === 'ar' ? 'rtl' : 'ltr'}>
      {/* ملعب واحد، أو ملعبان جنباً إلى جنب (شاشة مقسومة) */}
      <div className={`absolute inset-0 grid ${split ? 'grid-cols-2 portrait:grid-cols-1 portrait:grid-rows-2' : ''}`} dir="ltr">
        <div className="relative min-h-0 min-w-0 overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>
        <div className={`relative min-h-0 min-w-0 overflow-hidden ${split ? 'border-s-4 border-white/40 portrait:border-s-0 portrait:border-t-4' : 'hidden'}`}>
          <canvas ref={canvas2Ref} className="absolute inset-0 h-full w-full" />
        </div>
      </div>
      {screen !== 'game' && <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/20 to-slate-950/70" />}
      <div className="absolute inset-0">
        {screen === 'menu' && (
          <MainMenu
            s={s}
            onPlay={() => setScreen('lobby')}
            onHow={() => setScreen('howto')}
            onShop={() => setScreen('shop')}
            onSettings={() => setScreen('settings')}
            onLang={() => update({ lang: L === 'ar' ? 'en' : 'ar' })}
          />
        )}
        {screen === 'howto' && <HowTo s={s} onBack={() => setScreen('menu')} />}
        {screen === 'settings' && <SettingsScreen s={s} onChange={update} onBack={() => setScreen('menu')} />}
        {screen === 'shop' && <ShopScreen s={s} onChange={update} onBack={() => setScreen('menu')} />}
        {screen === 'lobby' && (
          <Lobby
            s={s}
            vsCpu={vsCpu}
            setVsCpu={setVsCpu}
            startBall={startBall}
            setStartBall={setStartBall}
            split={split}
            setSplit={setSplit}
            onStart={startMatch}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'game' && !split && hud && hud.phase !== 'idle' && (
          <Hud
            h={hud}
            s={s}
            onPause={() => engineRef.current?.pause('user')}
            onResume={() => engineRef.current?.resume()}
            onQuit={toMenu}
            onRestart={startMatch}
          />
        )}
        {screen === 'game' && split && (
          <div className="absolute inset-0 grid grid-cols-2 portrait:grid-cols-1 portrait:grid-rows-2" dir="ltr">
            <div className="relative min-h-0 min-w-0 overflow-hidden" dir={L === 'ar' ? 'rtl' : 'ltr'}>
              {hud && hud.phase !== 'idle' && (
                <Hud
                  h={hud}
                  s={s}
                  slotBase={0}
                  label={t(L, 'match1')}
                  onPause={() => engineRef.current?.pause('user')}
                  onResume={() => engineRef.current?.resume()}
                  onQuit={toMenu}
                  onRestart={startMatch}
                />
              )}
            </div>
            <div className="relative min-h-0 min-w-0 overflow-hidden" dir={L === 'ar' ? 'rtl' : 'ltr'}>
              {hud2 && hud2.phase !== 'idle' && (
                <Hud
                  h={hud2}
                  s={s}
                  slotBase={2}
                  label={t(L, 'match2')}
                  onPause={() => engine2Ref.current?.pause('user')}
                  onResume={() => engine2Ref.current?.resume()}
                  onQuit={toMenu}
                  onRestart={startMatch}
                />
              )}
            </div>
          </div>
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
