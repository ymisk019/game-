// ===================== UI: واجهة اللعب (HUD) =====================
import type { Hud as HudT } from '../game/engine';
import { t } from '../game/i18n';
import type { Settings } from '../game/settings';
import { Btn, P_HEX, Panel } from './common';

export function Hud({
  h,
  s,
  onPause,
  onResume,
  onQuit,
  onRestart,
}: {
  h: HudT;
  s: Settings;
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
  onRestart: () => void;
}) {
  const L = s.lang;
  const name = (slot: number) => (h.vsCpu && slot === 1 ? `🤖 ${t(L, 'cpu')}` : t(L, slot === 0 ? 'player1' : 'player2'));
  const att = h.attacker;
  const kp = 1 - att;
  const roleIcon = (slot: number) => (slot === att ? '⚽' : '🧤');
  const lowTime = h.timer <= 5 && h.phase === 'play';

  const banners = {
    goal: { text: t(L, 'goal'), cls: 'from-amber-300 to-orange-500 text-slate-900' },
    save: { text: t(L, 'save'), cls: 'from-sky-300 to-blue-600 text-white' },
    miss: { text: t(L, 'miss'), cls: 'from-slate-300 to-slate-500 text-slate-900' },
    post: { text: t(L, 'post'), cls: 'from-zinc-100 to-zinc-400 text-slate-900' },
  };

  const hint = (slot: number) => {
    if (h.vsCpu && slot === 1) return null;
    const isBall = slot === att;
    if (slot === 0) return isBall ? 'WASD · Space ⏺' : 'A/D · Space ⤒ · E ↘';
    return isBall ? '←↑→↓ · Enter ⏺' : '←→ · Enter ⤒ · Shift ↘';
  };

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* لوحة النتيجة */}
      <div className="absolute inset-x-0 top-3 flex justify-center px-2">
        <div className="flex items-stretch overflow-hidden rounded-2xl border border-white/15 bg-slate-950/80 shadow-2xl backdrop-blur" dir="ltr">
          {[0, 1].map((slot) => (
            <div key={slot} className={`flex items-center gap-3 px-4 py-2 sm:px-6 ${slot === 1 ? 'order-3' : ''}`} style={{ background: `${P_HEX[slot]}33` }}>
              <div className={`text-center ${slot === 1 ? 'order-2' : ''}`}>
                <div className="text-sm font-bold opacity-90 sm:text-lg" style={{ color: P_HEX[slot] }}>
                  {roleIcon(slot)} {name(slot)}
                </div>
              </div>
              <div className="text-4xl font-black tabular-nums sm:text-5xl">{h.scores[slot]}</div>
            </div>
          ))}
          <div className="order-2 flex min-w-28 flex-col items-center justify-center bg-black/40 px-4 py-1">
            <div className={`text-4xl font-black tabular-nums sm:text-5xl ${lowTime ? 'animate-pulse text-rose-400' : 'text-white'}`}>
              {h.timer}
            </div>
            <div className="text-xs font-bold text-amber-200 sm:text-sm" dir={L === 'ar' ? 'rtl' : 'ltr'}>
              {h.golden ? `⭐ ${t(L, 'goldenGoal')}` : `${t(L, 'round')} ${h.round + 1} ${t(L, 'of')} ${h.totalRounds}`}
            </div>
          </div>
        </div>
      </div>

      {/* زر الإيقاف (للشاشات اللمسية) */}
      <button
        className="pointer-events-auto absolute end-3 top-3 rounded-xl bg-slate-900/70 px-3 py-2 text-2xl hover:bg-slate-800"
        onClick={onPause}
        aria-label="pause"
      >
        ⏸️
      </button>
      <div className="absolute start-3 top-3 rounded-lg bg-black/40 px-2 py-1 font-mono text-xs text-slate-300">
        {h.fps} {t(L, 'fps')}
      </div>

      {/* أشرطة القوة والغطس */}
      {(h.phase === 'play' || h.phase === 'ready') && (
        <div className="absolute inset-x-0 bottom-4 flex flex-wrap items-end justify-center gap-4 px-3">
          <div className="w-64 rounded-2xl bg-slate-950/75 p-3 backdrop-blur">
            <div className="mb-1 flex justify-between text-sm font-bold" style={{ color: P_HEX[att] }}>
              <span>⚽ {t(L, 'power')}</span>
              <span className="font-mono text-slate-300">{hint(att)}</span>
            </div>
            <div className="h-5 overflow-hidden rounded-full bg-white/10" dir="ltr">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${h.power * 100}%`,
                  background: `linear-gradient(90deg, #22c55e, #eab308 60%, #ef4444)`,
                  opacity: h.charging ? 1 : 0.35,
                }}
              />
            </div>
          </div>
          <div className="w-64 rounded-2xl bg-slate-950/75 p-3 backdrop-blur">
            <div className="mb-1 flex justify-between text-sm font-bold" style={{ color: P_HEX[kp] }}>
              <span>🧤 {t(L, 'diveCd')}</span>
              <span className="font-mono text-slate-300">{hint(kp)}</span>
            </div>
            <div className="h-5 overflow-hidden rounded-full bg-white/10" dir="ltr">
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{ width: `${(1 - h.diveCd) * 100}%`, background: h.diveCd > 0 ? '#64748b' : P_HEX[kp] }}
              />
            </div>
          </div>
        </div>
      )}

      {/* العد التنازلي */}
      {h.countdown > 0 && !h.paused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {h.phase === 'countdown' && (
            <div className="mb-4 rounded-2xl bg-slate-950/70 px-6 py-3 text-center text-2xl font-bold">
              <span style={{ color: P_HEX[att] }}>⚽ {name(att)}</span>
              <span className="mx-3 text-slate-400">vs</span>
              <span style={{ color: P_HEX[kp] }}>🧤 {name(kp)}</span>
              {h.golden && <div className="mt-1 text-lg text-amber-300">{t(L, 'goldenGoalHint')}</div>}
            </div>
          )}
          <div key={h.countdown} className="bvk-pop text-[10rem] font-black leading-none text-white drop-shadow-[0_8px_0_rgba(0,0,0,0.4)]">
            {h.countdown}
          </div>
        </div>
      )}
      {h.go && h.countdown === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bvk-pop text-8xl font-black text-emerald-300 drop-shadow-[0_6px_0_rgba(0,0,0,0.4)]">{t(L, 'go')}</div>
        </div>
      )}
      {h.phase === 'ready' && (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <div className="rounded-2xl bg-slate-950/60 px-8 py-3 text-4xl font-black text-white">{t(L, 'ready')}</div>
        </div>
      )}

      {/* لافتة النتيجة */}
      {h.banner && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`bvk-pop rounded-3xl bg-gradient-to-b px-12 py-6 text-7xl font-black shadow-2xl sm:text-9xl ${banners[h.banner].cls}`}>
            {banners[h.banner].text}
          </div>
        </div>
      )}

      {/* الإعادة */}
      {h.phase === 'replay' && (
        <>
          <div className="absolute start-6 top-24 flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-2xl font-black">
            <span className="h-3 w-3 animate-pulse rounded-full bg-white" /> {t(L, 'replay')}
          </div>
          <div className="pointer-events-none absolute inset-0 border-[10px] border-rose-600/40" />
          {h.canSkip && <div className="absolute inset-x-0 bottom-6 text-center text-xl text-white/80">{t(L, 'skip')}</div>}
        </>
      )}

      {/* نهاية الجولة */}
      {h.phase === 'roundEnd' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Panel className="bvk-pop text-center">
            <div className="text-4xl font-black text-amber-300">{t(L, 'roundOver')}</div>
            <div className="my-4 flex items-center justify-center gap-6 text-6xl font-black" dir="ltr">
              <span style={{ color: P_HEX[0] }}>{h.scores[0]}</span>
              <span className="text-slate-500">-</span>
              <span style={{ color: P_HEX[1] }}>{h.scores[1]}</span>
            </div>
            <div className="text-2xl text-slate-200">🔄 {t(L, 'nextRound')}</div>
          </Panel>
        </div>
      )}

      {/* نهاية اللعبة */}
      {h.phase === 'gameOver' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/40 p-4">
          <Panel className="bvk-pop w-full max-w-lg text-center">
            <div className="text-6xl">🏆</div>
            <div className="text-2xl font-bold text-slate-300">{t(L, 'winner')}</div>
            <div className="my-2 text-6xl font-black" style={{ color: P_HEX[h.winner] ?? '#fff' }}>
              {name(h.winner)}
            </div>
            <div className="my-3 flex items-center justify-center gap-6 text-5xl font-black" dir="ltr">
              <span style={{ color: P_HEX[0] }}>{h.scores[0]}</span>
              <span className="text-slate-500">-</span>
              <span style={{ color: P_HEX[1] }}>{h.scores[1]}</span>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Btn autoFocus onClick={onRestart}>🔁 {t(L, 'playAgain')}</Btn>
              <Btn variant="ghost" onClick={onQuit}>🏠 {t(L, 'mainMenu')}</Btn>
            </div>
          </Panel>
        </div>
      )}

      {/* الإيقاف المؤقت */}
      {h.paused && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 p-4">
          <Panel className="w-full max-w-md text-center">
            {h.pauseReason === 'disconnect' ? (
              <>
                <div className="text-6xl">📵</div>
                <div className="mt-2 text-3xl font-black text-rose-300">{t(L, 'controllerLost')}</div>
                <div className="mt-1 text-xl" style={{ color: P_HEX[h.lostSlot] ?? '#fff' }}>
                  {h.lostSlot >= 0 ? name(h.lostSlot) : ''}
                </div>
                <div className="mt-3 animate-pulse text-xl text-slate-300">{t(L, 'waitingReconnect')}</div>
              </>
            ) : (
              <div className="text-5xl font-black text-amber-300">⏸️ {t(L, 'paused')}</div>
            )}
            <div className="mt-6 flex flex-col gap-3">
              <Btn autoFocus onClick={onResume}>▶ {h.pauseReason === 'disconnect' ? t(L, 'resumeAnyway') : t(L, 'resume')}</Btn>
              <Btn variant="danger" onClick={onQuit}>{t(L, 'quit')}</Btn>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
