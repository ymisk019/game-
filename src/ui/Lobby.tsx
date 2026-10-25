// ===================== UI: غرفة الانتظار (Lobby) =====================
import { useEffect, useReducer, useState } from 'react';
import QRCode from 'qrcode';
import { t } from '../game/i18n';
import { gamepadSlots, getGamepads, onGamepadsChanged } from '../game/input';
import { net, type Slot } from '../game/network';
import type { Settings } from '../game/settings';
import { Btn, P_HEX, Panel } from './common';

export function Lobby({
  s,
  vsCpu,
  setVsCpu,
  split,
  setSplit,
  startBall,
  setStartBall,
  onStart,
  onBack,
}: {
  s: Settings;
  vsCpu: boolean;
  setVsCpu: (v: boolean) => void;
  split: boolean;
  setSplit: (v: boolean) => void;
  startBall: 0 | 1;
  setStartBall: (v: 0 | 1) => void;
  onStart: (mode: 'classic' | 'challenge' | 'tournament') => void;
  onBack: () => void;
}) {
  const L = s.lang;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [qr, setQr] = useState('');
  const [mode, setMode] = useState<'classic' | 'challenge' | 'tournament'>('classic');

  useEffect(() => {
    const a = net.subscribe(force);
    const b = onGamepadsChanged(force);
    const id = window.setInterval(force, 700);
    return () => {
      a();
      b();
      clearInterval(id);
    };
  }, []);

  const padUrl = net.url ? `${net.url}/pad?room=${net.code}` : '';
  useEffect(() => {
    if (!padUrl) return;
    QRCode.toDataURL(padUrl, { margin: 1, width: 320, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [padUrl]);

  const pads = getGamepads();
  const phones = Array.from(net.pads.values());

  const slotNames = ['player1', 'player2', 'player3', 'player4'] as const;
  const slotCard = (slot: Slot) => {
    const isCpu = vsCpu && slot === 1;
    const role = startBall === slot % 2 ? 'ball' : 'keeper';
    const myPads = pads.filter((g) => gamepadSlots.get(g.index) === slot);
    const myPhones = phones.filter((p) => p.slot === slot);
    return (
      <div className="flex-1 rounded-3xl border-4 bg-slate-900/80 p-5" style={{ borderColor: P_HEX[slot] }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-3xl font-black" style={{ color: P_HEX[slot] }}>
            {isCpu ? `🤖 ${t(L, 'cpu')}` : t(L, slotNames[slot])}
          </h3>
          <span className="rounded-full bg-white/10 px-4 py-1 text-xl font-bold">
            {t(L, 'startsAs')}: {role === 'ball' ? `⚽ ${t(L, 'ball')}` : `🧤 ${t(L, 'keeper')}`}
          </span>
        </div>
        {isCpu ? (
          <p className="text-xl text-slate-300">
            {t(L, 'cpuPlays')} — {t(L, s.difficulty)}
          </p>
        ) : (
          <ul className="space-y-2 text-lg">
            {slot < 2 && (
              <li className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                <span>⌨️</span>
                <span className="font-bold">{t(L, 'keyboard')}</span>
                <span className="ms-auto font-mono text-sm text-slate-300" dir="ltr">
                  {slot === 0 ? 'WASD · Space · E' : '← ↑ → ↓ · Enter · Shift'}
                </span>
              </li>
            )}
            {slot >= 2 && myPads.length === 0 && myPhones.length === 0 && (
              <li className="rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-300">🎮 📱 {t(L, 'gamepadHint')}</li>
            )}
            {myPads.map((g) => (
              <li key={g.index} className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2">
                <span>🎮</span>
                <span className="truncate font-bold">{t(L, 'gamepad')} {g.index + 1}</span>
                <span className="ms-auto text-sm text-emerald-300">● {t(L, 'connected')}</span>
              </li>
            ))}
            {myPhones.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${p.connected ? 'bg-violet-500/15' : 'bg-rose-500/15'}`}>
                <span>📱</span>
                <span className="truncate font-bold">{p.name}</span>
                <span className={`ms-auto text-sm ${p.connected ? 'text-emerald-300' : 'text-rose-300'}`}>
                  ● {t(L, p.connected ? 'connected' : 'disconnected')}
                </span>
                <button data-nav className="rounded-lg bg-white/10 px-2 py-1 text-sm hover:bg-white/20" onClick={() => net.setPadSlot(p.id, ((slot + 1) % (split ? 4 : 2)) as Slot)}>
                  ⇄
                </button>
                {!p.connected && (
                  <button data-nav className="rounded-lg bg-white/10 px-2 py-1 text-sm hover:bg-white/20" onClick={() => net.removePad(p.id)}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-4">
      <Panel className="my-2 w-full max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-4xl font-black text-amber-300">🏟️ {t(L, 'lobby')}</h2>
          <div className="flex gap-2">
            <button
              data-nav
              onClick={() => {
                setVsCpu(false);
                setSplit(false);
              }}
              className={`rounded-xl px-5 py-2 text-xl font-bold ${!vsCpu && !split ? 'bg-amber-400 text-slate-900' : 'bg-white/10'}`}
            >
              👥 {t(L, 'twoPlayers')}
            </button>
            <button
              data-nav
              onClick={() => {
                setVsCpu(false);
                setSplit(true);
              }}
              className={`rounded-xl px-5 py-2 text-xl font-bold ${split ? 'bg-amber-400 text-slate-900' : 'bg-white/10'}`}
            >
              👥👥 {t(L, 'fourPlayers')}
            </button>
            <button
              data-nav
              onClick={() => {
                setSplit(false);
                setVsCpu(true);
              }}
              className={`rounded-xl px-5 py-2 text-xl font-bold ${vsCpu ? 'bg-amber-400 text-slate-900' : 'bg-white/10'}`}
            >
              🤖 {t(L, 'vsCpu')}
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-3">
          <div className="mb-2 text-lg font-extrabold text-amber-100">{L === 'ar' ? '🏆 اختر نمط اللعب' : '🏆 Choose a game mode'}</div>
          <div className="flex flex-wrap gap-2">
            {([['classic', L === 'ar' ? '⚽ كلاسيكي' : '⚽ Classic'], ['challenge', L === 'ar' ? '⏱️ تحدي سريع' : '⏱️ Quick challenge'], ['tournament', L === 'ar' ? '🏆 بطولة' : '🏆 Tournament']] as const).map(([id, label]) => (
              <button data-nav key={id} onClick={() => setMode(id)} className={`rounded-xl px-4 py-2 font-bold ${mode === id ? 'bg-amber-400 text-slate-950' : 'bg-white/10 hover:bg-white/20'}`}>{label}</button>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-300">{mode === 'classic' ? (L === 'ar' ? `${s.rounds} جولات متوازنة مع هدف ذهبي عند التعادل.` : `${s.rounds} balanced rounds with golden goal on a tie.`) : mode === 'challenge' ? (L === 'ar' ? 'تحدٍ سريع: جولتان، 15 ثانية لكل جولة.' : 'Quick challenge: 2 rounds, 15 seconds each.') : (L === 'ar' ? 'بطولة طويلة: 10 جولات، 30 ثانية لكل جولة.' : 'Tournament format: 10 rounds, 30 seconds each.')}</p>
        </div>
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex flex-[2] flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row">
              {split && <div className="text-center text-xl font-black text-amber-200 md:hidden">{t(L, 'match1')}</div>}
              {slotCard(0)}
              {slotCard(1)}
            </div>
            {split && (
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="text-center text-xl font-black text-amber-200 md:hidden">{t(L, 'match2')}</div>
                {slotCard(2)}
                {slotCard(3)}
              </div>
            )}
            <p className="text-center text-lg text-slate-300">🎮 {t(L, 'gamepadHint')}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Btn variant="ghost" onClick={() => setStartBall((1 - startBall) as 0 | 1)}>⇄ {t(L, 'swapRoles')}</Btn>
              <Btn variant="ghost" onClick={onBack}>{t(L, 'back')}</Btn>
              <Btn autoFocus onClick={() => onStart(mode)} className="px-10 text-2xl">▶ {t(L, 'start')}</Btn>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center gap-3 rounded-3xl bg-white/5 p-5 text-center">
            <h3 className="text-2xl font-extrabold">📱 {t(L, 'phone')}</h3>
            {net.status === 'online' && padUrl ? (
              <>
                <p className="text-lg text-slate-300">{t(L, 'scanQr')}</p>
                <p className="max-w-sm rounded-xl bg-sky-500/10 p-3 text-sm text-sky-100">📶 {t(L, 'lanOnly')}</p>
                {qr && <img src={qr} alt="QR" className="h-56 w-56 rounded-2xl bg-white p-2" />}
                <div dir="ltr" className="break-all rounded-xl bg-black/40 px-3 py-2 font-mono text-lg text-amber-200">
                  {net.url}/pad
                </div>
                <div className="text-lg text-slate-300">{t(L, 'roomCode')}</div>
                <div dir="ltr" className="font-mono text-6xl font-black tracking-[0.3em] text-white">{net.code}</div>
              </>
            ) : net.status === 'connecting' ? (
              <p className="animate-pulse text-xl text-slate-300">{t(L, 'connecting')}</p>
            ) : (
              <p className="rounded-xl bg-rose-500/15 p-4 text-lg text-rose-200">⚠️ {t(L, 'serverOffline')}</p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
