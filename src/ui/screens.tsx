// ===================== UI: القائمة والتعليمات والإعدادات =====================
import { t } from '../game/i18n';
import type { BallStyle, Difficulty, GloveStyle, Quality, Settings } from '../game/settings';
import { Btn, GamepadArt, Key, Panel, PhoneArt } from './common';

export function MainMenu({ s, onPlay, onHow, onShop, onSettings, onLang }: { s: Settings; onPlay: () => void; onHow: () => void; onShop: () => void; onSettings: () => void; onLang: () => void }) {
  const L = s.lang;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <div className="mb-2 text-7xl drop-shadow-lg">⚽🧤</div>
        <h1 className="bg-gradient-to-b from-white to-amber-300 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow-xl sm:text-7xl">
          {t(L, 'title')}
        </h1>
        {L === 'ar' && <div className="mt-1 text-2xl font-black tracking-widest text-amber-200/80">BALL VS KEEPER</div>}
        <p className="mt-3 text-xl text-slate-200/90">{t(L, 'subtitle')}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Btn autoFocus onClick={onPlay} className="py-5 text-3xl">▶ {t(L, 'play')}</Btn>
        <Btn variant="ghost" onClick={onHow} className="text-2xl">📖 {t(L, 'howto')}</Btn>
        <Btn variant="ghost" onClick={onShop} className="text-2xl">🛍️ {L === 'ar' ? 'المتجر' : 'Shop'}</Btn>
        <Btn variant="ghost" onClick={onSettings} className="text-2xl">⚙️ {t(L, 'settings')}</Btn>
        <Btn variant="soft" onClick={onLang} className="text-xl">🌐 {L === 'ar' ? 'English' : 'العربية'}</Btn>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3">
      <span className="text-xl font-bold text-slate-100">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Choice<T extends string | number>({ value, options, onChange, labels }: { value: T; options: T[]; onChange: (v: T) => void; labels?: (v: T) => string }) {
  return (
    <>
      {options.map((o) => (
        <button
          data-nav
          key={String(o)}
          onClick={() => onChange(o)}
          className={`min-w-14 rounded-xl px-4 py-2 text-lg font-bold outline-none transition focus-visible:ring-4 focus-visible:ring-yellow-300 ${value === o ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          {labels ? labels(o) : String(o)}
        </button>
      ))}
    </>
  );
}

export function SettingsScreen({ s, onChange, onBack }: { s: Settings; onChange: (p: Partial<Settings>) => void; onBack: () => void }) {
  const L = s.lang;
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-4">
      <Panel className="w-full max-w-2xl">
        <h2 className="mb-4 text-4xl font-black text-amber-300">⚙️ {t(L, 'settings')}</h2>
        <Row label={`🎵 ${t(L, 'music')}`}>
          <input data-nav type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => onChange({ music: +e.target.value })} className="w-48 accent-amber-400" />
          <span className="w-12 text-center font-mono">{Math.round(s.music * 100)}</span>
        </Row>
        <Row label={`🔊 ${t(L, 'sfx')}`}>
          <input data-nav type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => onChange({ sfx: +e.target.value })} className="w-48 accent-amber-400" />
          <span className="w-12 text-center font-mono">{Math.round(s.sfx * 100)}</span>
        </Row>
        <Row label={`🌐 ${t(L, 'language')}`}>
          <Choice value={s.lang} options={['ar', 'en']} labels={(v) => (v === 'ar' ? 'العربية' : 'English')} onChange={(v) => onChange({ lang: v })} />
        </Row>
        <Row label={`⏱️ ${t(L, 'roundTime')}`}>
          <Choice value={s.roundTime} options={[15, 20, 30, 45, 60, 90]} onChange={(v) => onChange({ roundTime: v })} />
        </Row>
        <Row label={`🔁 ${t(L, 'roundsCount')}`}>
          <Choice value={s.rounds} options={[2, 4, 6, 8, 10]} onChange={(v) => onChange({ rounds: v })} />
        </Row>
        <Row label={`✨ ${t(L, 'quality')}`}>
          <Choice<Quality> value={s.quality} options={['low', 'medium', 'high']} labels={(v) => t(L, v)} onChange={(v) => onChange({ quality: v })} />
        </Row>
        <Row label={`📉 ${t(L, 'autoQuality')}`}>
          <Choice value={s.autoQuality ? 'on' : 'off'} options={['on', 'off']} labels={(v) => t(L, v as 'on' | 'off')} onChange={(v) => onChange({ autoQuality: v === 'on' })} />
        </Row>
        <Row label={`🤖 ${t(L, 'difficulty')}`}>
          <Choice<Difficulty> value={s.difficulty} options={['easy', 'normal', 'hard']} labels={(v) => t(L, v)} onChange={(v) => onChange({ difficulty: v })} />
        </Row>
        <Row label={L === 'ar' ? '⚽ شكل الكرة' : '⚽ Ball skin'}>
          <Choice<BallStyle> value={s.ballStyle} options={s.ownedBallStyles} labels={(v) => ({ classic: L === 'ar' ? 'كلاسيكية' : 'Classic', gold: L === 'ar' ? 'ذهبية' : 'Gold', neon: 'Neon', ocean: L === 'ar' ? 'محيط' : 'Ocean' }[v])} onChange={(v) => onChange({ ballStyle: v })} />
        </Row>
        <Row label={L === 'ar' ? '🧤 لون القفازات' : '🧤 Glove color'}>
          <Choice<GloveStyle> value={s.gloveStyle} options={s.ownedGloveStyles} labels={(v) => ({ yellow: L === 'ar' ? 'أصفر' : 'Yellow', white: L === 'ar' ? 'أبيض' : 'White', red: L === 'ar' ? 'أحمر' : 'Red', cyan: 'Cyan' }[v])} onChange={(v) => onChange({ gloveStyle: v })} />
        </Row>
        <div className="mt-6 flex justify-center">
          <Btn autoFocus onClick={onBack}>{t(L, 'back')}</Btn>
        </div>
      </Panel>
    </div>
  );
}

export function ShopScreen({ s, onChange, onBack }: { s: Settings; onChange: (p: Partial<Settings>) => void; onBack: () => void }) {
  const L = s.lang;
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-4">
      <Panel className="w-full max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-4xl font-black text-amber-300">🛍️ {L === 'ar' ? 'المتجر' : 'Shop'}</h2>
          <span className="rounded-full bg-amber-300/15 px-4 py-2 text-lg font-black text-amber-100">🪙 {s.coins}</span>
        </div>
        <p className="mb-5 text-slate-300">{L === 'ar' ? 'اشترِ مظاهر جديدة للكرة والقفازات باستخدام العملات التي تجمعها من المباريات.' : 'Unlock new ball and glove styles using coins earned from matches.'}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['ball','gold',100],['ball','neon',150],['ball','ocean',120],['glove','white',60],['glove','red',80],['glove','cyan',100]] as const).map(([kind, style, price]) => {
            const owned = kind === 'ball' ? s.ownedBallStyles.includes(style as BallStyle) : s.ownedGloveStyles.includes(style as GloveStyle);
            const label = ({ gold: L === 'ar' ? 'كرة ذهبية' : 'Gold ball', neon: 'Neon ball', ocean: L === 'ar' ? 'كرة المحيط' : 'Ocean ball', white: L === 'ar' ? 'قفازات بيضاء' : 'White gloves', red: L === 'ar' ? 'قفازات حمراء' : 'Red gloves', cyan: 'Cyan gloves' } as Record<string,string>)[style];
            return <div key={`${kind}-${style}`} className="flex items-center justify-between gap-2 rounded-xl bg-slate-950/60 p-3"><span className="font-bold">{kind === 'ball' ? '⚽' : '🧤'} {label}</span><button data-nav disabled={owned || s.coins < price} onClick={() => onChange(kind === 'ball' ? { coins: s.coins-price, ownedBallStyles: [...s.ownedBallStyles, style as BallStyle], ballStyle: style as BallStyle } : { coins: s.coins-price, ownedGloveStyles: [...s.ownedGloveStyles, style as GloveStyle], gloveStyle: style as GloveStyle })} className={`rounded-lg px-3 py-2 text-sm font-extrabold ${owned ? 'bg-emerald-500/20 text-emerald-200' : s.coins < price ? 'bg-white/5 text-slate-500' : 'bg-amber-400 text-slate-950'}`}>{owned ? (L === 'ar' ? 'مملوك' : 'Owned') : `🪙 ${price}`}</button></div>;
          })}
        </div>
        <div className="mt-6 flex justify-center"><Btn autoFocus onClick={onBack}>{t(L, 'back')}</Btn></div>
      </Panel>
    </div>
  );
}

export function HowTo({ s, onBack }: { s: Settings; onBack: () => void }) {
  const L = s.lang;
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-4">
      <Panel className="my-4 w-full max-w-5xl">
        <h2 className="mb-4 text-4xl font-black text-amber-300">📖 {t(L, 'howto')}</h2>
        <div className="mb-5 grid gap-3 text-lg leading-relaxed md:grid-cols-3">
          <p className="rounded-2xl bg-orange-500/15 p-4">⚽ {t(L, 'howBall')}</p>
          <p className="rounded-2xl bg-blue-500/15 p-4">🧤 {t(L, 'howKeeper')}</p>
          <p className="rounded-2xl bg-emerald-500/15 p-4">🏆 {t(L, 'howRules')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-4">
            <h3 className="mb-3 text-2xl font-extrabold text-orange-300">⌨️ {t(L, 'kbP1')}</h3>
            <div className="flex flex-col items-start gap-2" dir="ltr">
              <div className="flex gap-1 ps-11"><Key k="W" /></div>
              <div className="flex gap-1"><Key k="A" /><Key k="S" /><Key k="D" /> <span className="ms-2 self-center text-slate-300">{t(L, 'move')}</span></div>
              <div className="flex items-center gap-2"><Key k="Space" wide /> <span className="text-slate-300">{t(L, 'shoot')} / {t(L, 'jump')}</span></div>
              <div className="flex items-center gap-2"><Key k="E" /> <span className="text-slate-300">{t(L, 'dive')}</span></div>
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <h3 className="mb-3 text-2xl font-extrabold text-blue-300">⌨️ {t(L, 'kbP2')}</h3>
            <div className="flex flex-col items-start gap-2" dir="ltr">
              <div className="flex gap-1 ps-11"><Key k="↑" /></div>
              <div className="flex gap-1"><Key k="←" /><Key k="↓" /><Key k="→" /> <span className="ms-2 self-center text-slate-300">{t(L, 'move')}</span></div>
              <div className="flex items-center gap-2"><Key k="Enter" wide /> <span className="text-slate-300">{t(L, 'shoot')} / {t(L, 'jump')}</span></div>
              <div className="flex items-center gap-2"><Key k="Shift" wide /> <span className="text-slate-300">{t(L, 'dive')}</span></div>
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <h3 className="mb-2 text-2xl font-extrabold text-emerald-300">🎮 {t(L, 'pad')}</h3>
            <GamepadArt />
            <ul className="mt-2 space-y-1 text-lg text-slate-200">
              <li>🕹️ L-Stick / D-Pad: {t(L, 'move')}</li>
              <li>🟢 A / ✕: {t(L, 'shoot')}</li>
              <li>🔴 B / ○: {t(L, 'jump')}</li>
              <li>🔵 X / □: {t(L, 'dive')}</li>
              <li>⏸️ Start: {t(L, 'pause')}</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <h3 className="mb-2 text-2xl font-extrabold text-violet-300">📱 {t(L, 'phonePad')}</h3>
            <PhoneArt />
            <p className="mt-2 text-lg text-slate-200">
              {L === 'ar'
                ? 'امسح رمز QR في غرفة الانتظار. العصا على اليسار، والأزرار الكبيرة على اليمين. الأزرار تتغير حسب دورك. ⏸️ لإيقاف اللعبة.'
                : 'Scan the QR code in the lobby. Stick on the left, big buttons on the right. Buttons adapt to your role. ⏸️ pauses the game.'}
            </p>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-amber-400/10 p-3 text-lg text-amber-100">
          💡 {L === 'ar' ? 'للغطس العالي: ادفع العصا للأعلى مع الاتجاه وقت الغطس. وللإيقاف المؤقت: Esc أو P.' : 'High dive: push the stick up with a direction when diving. Pause: Esc or P.'}
        </p>
        <div className="mt-6 flex justify-center">
          <Btn autoFocus onClick={onBack}>{t(L, 'back')}</Btn>
        </div>
      </Panel>
    </div>
  );
}
