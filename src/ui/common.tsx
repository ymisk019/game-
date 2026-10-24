// ===================== UI: عناصر مشتركة =====================
import type { ReactNode } from 'react';

export const P_HEX = ['#f97316', '#3b82f6'];

export function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
  autoFocus,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'soft';
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-gradient-to-b from-amber-400 to-orange-500 text-slate-900 shadow-lg shadow-orange-500/30 hover:brightness-110',
    ghost: 'bg-white/10 text-white hover:bg-white/20 border border-white/15',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
    soft: 'bg-slate-800/80 text-white hover:bg-slate-700 border border-white/10',
  }[variant];
  return (
    <button
      data-nav
      autoFocus={autoFocus}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-6 py-3 text-xl font-extrabold transition active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

export function Key({ k, wide }: { k: string; wide?: boolean }) {
  return (
    <span
      className={`inline-flex h-10 items-center justify-center rounded-lg border-b-4 border-slate-400 bg-slate-100 px-2 font-mono text-base font-bold text-slate-900 ${wide ? 'min-w-24' : 'min-w-10'}`}
    >
      {k}
    </span>
  );
}

/** رسم يد تحكم مبسطة */
export function GamepadArt() {
  return (
    <svg viewBox="0 0 260 150" className="w-full max-w-xs">
      <path d="M60 20 h140 a50 50 0 0 1 50 50 v10 a50 50 0 0 1 -90 30 h-60 a50 50 0 0 1 -90 -30 v-10 a50 50 0 0 1 50 -50z" fill="#1e293b" stroke="#64748b" strokeWidth="3" />
      <circle cx="75" cy="72" r="22" fill="#0f172a" stroke="#f97316" strokeWidth="3" />
      <circle cx="75" cy="72" r="10" fill="#334155" />
      <text x="75" y="112" fill="#fdba74" fontSize="12" textAnchor="middle" fontWeight="bold">L-Stick</text>
      <circle cx="200" cy="92" r="12" fill="#22c55e" />
      <text x="200" y="97" fontSize="12" textAnchor="middle" fontWeight="bold" fill="#052e16">A/✕</text>
      <circle cx="224" cy="68" r="12" fill="#ef4444" />
      <text x="224" y="73" fontSize="11" textAnchor="middle" fontWeight="bold" fill="#450a0a">B/○</text>
      <circle cx="176" cy="68" r="12" fill="#3b82f6" />
      <text x="176" y="73" fontSize="11" textAnchor="middle" fontWeight="bold" fill="#172554">X/□</text>
      <circle cx="200" cy="44" r="12" fill="#eab308" />
      <text x="200" y="49" fontSize="11" textAnchor="middle" fontWeight="bold" fill="#422006">Y/△</text>
      <rect x="120" y="40" width="20" height="10" rx="4" fill="#94a3b8" />
      <text x="130" y="65" fill="#cbd5e1" fontSize="10" textAnchor="middle">START</text>
    </svg>
  );
}

/** رسم تلفون مع واجهة اليد */
export function PhoneArt() {
  return (
    <svg viewBox="0 0 280 150" className="w-full max-w-xs">
      <rect x="5" y="10" width="270" height="130" rx="22" fill="#0f172a" stroke="#64748b" strokeWidth="3" />
      <circle cx="70" cy="80" r="40" fill="#1e293b" stroke="#f97316" strokeWidth="3" />
      <circle cx="80" cy="72" r="16" fill="#f97316" />
      <circle cx="215" cy="95" r="26" fill="#22c55e" />
      <text x="215" y="100" fontSize="12" textAnchor="middle" fontWeight="bold" fill="#052e16">SHOOT</text>
      <circle cx="160" cy="105" r="18" fill="#3b82f6" />
      <text x="160" y="109" fontSize="10" textAnchor="middle" fontWeight="bold" fill="white">DIVE</text>
      <circle cx="235" cy="45" r="18" fill="#ef4444" />
      <text x="235" y="49" fontSize="10" textAnchor="middle" fontWeight="bold" fill="white">JUMP</text>
    </svg>
  );
}
