// ===================== الإعدادات (Settings) =====================
// تُحفظ كل الإعدادات في localStorage حتى تبقى بعد إعادة التحميل

export type Lang = 'ar' | 'en';
export type Quality = 'low' | 'medium' | 'high';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  lang: Lang;
  music: number; // 0..1
  sfx: number; // 0..1
  roundTime: number; // ثواني
  rounds: number; // عدد الجولات (زوجي)
  quality: Quality;
  autoQuality: boolean;
  difficulty: Difficulty;
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
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
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
