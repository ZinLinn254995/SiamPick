export interface CoreColorTheme {
  /** Deep electric blue / indigo shadow base */
  deepHex: string;
  /** Primary vivid violet / purple energy */
  primaryHex: string;
  /** Luminous neon magenta / pink / accent rim */
  accentHex: string;
  /** Deep obsidian backdrop color */
  backdropHex: string;
  /** Chromatic richness multiplier [0.6 .. 1.8] */
  saturation: number;
  /** Post-processing bloom glow intensity [0.0 .. 1.4] */
  bloom: number;
  /** Central white-hot highlight level [0.15 .. 1.1] */
  coreWhite: number;
  /** Global hue rotation offset in degrees [-180 .. 180] */
  hueShift: number;
}

export interface CoreColorPreset {
  id: string;
  label: string;
  theme: CoreColorTheme;
}

/**
 * Tuned default matching deep obsidian + electric blue + vivid royal violet + neon magenta-pink
 * with rich core contrast (prevents center white blowout).
 */
export const DEFAULT_CORE_COLOR_THEME: CoreColorTheme = {
  deepHex: '#2532FF',
  primaryHex: '#7A1BFF',
  accentHex: '#FF2EE8',
  backdropHex: '#04010B',
  saturation: 1.28,
  bloom: 0.46,
  coreWhite: 0.36,
  hueShift: 0,
};

export const CORE_COLOR_PRESETS: CoreColorPreset[] = [
  {
    id: 'electric-violet',
    label: 'Electric Violet',
    theme: { ...DEFAULT_CORE_COLOR_THEME },
  },
  {
    id: 'neon-orchid',
    label: 'Neon Orchid',
    theme: {
      deepHex: '#3B12CC',
      primaryHex: '#9C1EFF',
      accentHex: '#FF38D4',
      backdropHex: '#05010E',
      saturation: 1.32,
      bloom: 0.52,
      coreWhite: 0.4,
      hueShift: 0,
    },
  },
  {
    id: 'iridescent-orb',
    label: 'Violet + Cyan',
    theme: {
      deepHex: '#00C8FF',
      primaryHex: '#7C22FF',
      accentHex: '#FF28E6',
      backdropHex: '#04020D',
      saturation: 1.26,
      bloom: 0.48,
      coreWhite: 0.38,
      hueShift: 0,
    },
  },
  {
    id: 'electric-cyan',
    label: 'Original Cyan',
    theme: {
      deepHex: '#0A45E8',
      primaryHex: '#12B8FF',
      accentHex: '#7B3FE4',
      backdropHex: '#020308',
      saturation: 1.15,
      bloom: 0.55,
      coreWhite: 0.52,
      hueShift: 0,
    },
  },
];

const STORAGE_KEY = 'siampick_core_color_theme_v1';
const LEGACY_STORAGE_KEY = 'siampick_core_color_tune_v1';

function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function loadSavedCoreColorTheme(): CoreColorTheme {
  if (typeof window === 'undefined') return { ...DEFAULT_CORE_COLOR_THEME };
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CORE_COLOR_THEME };
    const parsed = JSON.parse(raw) as Partial<CoreColorTheme>;
    return {
      deepHex: isValidHex(parsed.deepHex) ? parsed.deepHex : DEFAULT_CORE_COLOR_THEME.deepHex,
      primaryHex: isValidHex(parsed.primaryHex)
        ? parsed.primaryHex
        : DEFAULT_CORE_COLOR_THEME.primaryHex,
      accentHex: isValidHex(parsed.accentHex)
        ? parsed.accentHex
        : DEFAULT_CORE_COLOR_THEME.accentHex,
      backdropHex: isValidHex(parsed.backdropHex)
        ? parsed.backdropHex
        : DEFAULT_CORE_COLOR_THEME.backdropHex,
      saturation: clampNum(parsed.saturation, 0.6, 1.8, DEFAULT_CORE_COLOR_THEME.saturation),
      bloom: clampNum(parsed.bloom, 0, 1.4, DEFAULT_CORE_COLOR_THEME.bloom),
      coreWhite: clampNum(parsed.coreWhite, 0.1, 1.1, DEFAULT_CORE_COLOR_THEME.coreWhite),
      hueShift: clampNum(parsed.hueShift, -180, 180, DEFAULT_CORE_COLOR_THEME.hueShift),
    };
  } catch {
    return { ...DEFAULT_CORE_COLOR_THEME };
  }
}

export function saveCoreColorTheme(theme: CoreColorTheme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Ignore storage quota / private mode issues
  }
}
