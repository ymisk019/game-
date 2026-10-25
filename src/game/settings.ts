// ===================== الإعدادات (Settings) =====================
// تُحفظ كل الإعدادات في localStorage حتى تبقى بعد إعادة التحميل

export type Lang = 'ar' | 'en';
export type Quality = 'low' | 'medium' | 'high';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type BallStyle = 'classic' | 'gold' | 'neon' | 'ocean';
export type GloveStyle = 'yellow' | 'white' | 'red' | 'cyan';

export interface Settings {
  lang: Lang;
  music: number; // 0..1
  sfx: number; // 0..1
  roundTime: number; // ثواني
  rounds: number; // عدد الجولات (زوجي)
  quality: Quality;
  autoQuality: boolean;
  difficulty: Difficulty;
  ballStyle: BallStyle;
  gloveStyle: GloveStyle;
  coins: number;
  ownedBallStyles: BallStyle[];
  ownedGloveStyles: GloveStyle[];
}

const KEY = 'bvk_settings_v1';

export const defaultSettings: Settings = {
  lang: 'ar',
  music: 0.4,
  sfx: 0.8,
  roundTime: 30,
  rounds: 6,
  quality: 'medium',
  autoQuality: true,
  difficulty: 'normal',
  ballStyle: 'classic',
  gloveStyle: 'yellow',
  coins: 300,
  ownedBallStyles: ['classic'],
  ownedGloveStyles: ['yellow'],
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const saved = JSON.parse(raw); return { ...defaultSettings, ...saved, coins: Number.isFinite(saved.coins) ? saved.coins : defaultSettings.coins, ownedBallStyles: Array.isArray(saved.ownedBallStyles) ? saved.ownedBallStyles : defaultSettings.ownedBallStyles, ownedGloveStyles: Array.isArray(saved.ownedGloveStyles) ? saved.ownedGloveStyles : defaultSettings.ownedGloveStyles }; }
  } catch {
    /* تجاهل */
  }
  return { ...defaultSettings };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* تجاهل */
  }
}
