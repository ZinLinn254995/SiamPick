import { useState, type SyntheticEvent } from 'react';
import { Check, ChevronDown, Copy, Palette, RotateCcw } from 'lucide-react';
import {
  CORE_COLOR_PRESETS,
  DEFAULT_CORE_COLOR_THEME,
  type CoreColorTheme,
} from '../../core/coreTheme';

interface CoreColorPanelProps {
  theme: CoreColorTheme;
  open: boolean;
  dynamicColorEnabled: boolean;
  onToggleDynamicColor: () => void;
  onToggleOpen: () => void;
  onChange: (next: CoreColorTheme) => void;
  onReplayBirth: () => void;
  visible: boolean;
}

interface ColorSwatchInputProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

function ColorSwatchInput({ label, value, onChange }: ColorSwatchInputProps) {
  return (
    <label className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:border-purple-400/35 transition-colors cursor-pointer min-h-[44px]">
      <span className="relative w-6 h-6 rounded-lg overflow-hidden border border-white/25 shrink-0">
        <span
          className="block w-full h-full"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} color`}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </span>
      <span className="flex flex-col min-w-0 leading-tight">
        <span className="text-[11px] font-medium text-purple-100/90 whitespace-nowrap">
          {label}
        </span>
        <span className="text-[10px] font-mono tabular-nums text-purple-200/55 uppercase">
          {value}
        </span>
      </span>
    </label>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (val: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: SliderRowProps) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-purple-100/80 font-medium">{label}</span>
        <span className="font-mono tabular-nums text-purple-200/70">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-6 accent-fuchsia-500 cursor-pointer touch-pan-x"
      />
    </label>
  );
}

export function CoreColorPanel({
  theme,
  open,
  dynamicColorEnabled,
  onToggleDynamicColor,
  onToggleOpen,
  onChange,
  onReplayBirth,
  visible,
}: CoreColorPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const payload = JSON.stringify(theme, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be restricted in some embedded frames
    }
  };

  const handleReset = () => {
    onChange({ ...DEFAULT_CORE_COLOR_THEME });
  };

  const stopCanvasEvent = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      onPointerDown={stopCanvasEvent}
      onTouchStart={stopCanvasEvent}
      onTouchMove={stopCanvasEvent}
      className={`pointer-events-auto w-full max-w-[520px] mx-auto flex flex-col items-center gap-2 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Permanent Collapsible Core Color Studio (solid dark surface, zero backdrop-blur over WebGL) */}
      {open && (
        <section
          aria-label="Color Studio"
          className="w-full rounded-2xl bg-[#0B0619]/95 border border-purple-400/25 p-3.5 sm:p-4 text-purple-50 shadow-[0_18px_48px_rgba(0,0,0,0.75)] max-h-[52dvh] overflow-y-auto no-scrollbar"
        >
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                style={{
                  background: `linear-gradient(135deg, ${theme.deepHex}, ${theme.primaryHex}, ${theme.accentHex})`,
                }}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold tracking-wide text-purple-100 whitespace-nowrap">
                Color Studio
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-medium text-purple-100 whitespace-nowrap cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-medium text-purple-100 whitespace-nowrap cursor-pointer"
              >
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={onToggleOpen}
                aria-label="Collapse Color Studio"
                className="inline-flex items-center justify-center min-w-[34px] min-h-[34px] rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-purple-100 cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Preset Themes */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 mb-2.5 border-b border-white/10">
            {CORE_COLOR_PRESETS.map((preset) => {
              const isSelected =
                theme.deepHex.toLowerCase() === preset.theme.deepHex.toLowerCase() &&
                theme.primaryHex.toLowerCase() === preset.theme.primaryHex.toLowerCase() &&
                theme.accentHex.toLowerCase() === preset.theme.accentHex.toLowerCase() &&
                theme.hueShift === preset.theme.hueShift;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChange({ ...preset.theme })}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-purple-500/25 border-fuchsia-400/60 text-white'
                      : 'bg-white/[0.04] border-white/10 text-purple-100/75 hover:text-white hover:border-purple-400/35'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${preset.theme.deepHex}, ${preset.theme.primaryHex}, ${preset.theme.accentHex})`,
                    }}
                    aria-hidden="true"
                  />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>

          {/* 4 Live Color Pickers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <ColorSwatchInput
              label="Deep"
              value={theme.deepHex}
              onChange={(deepHex) => onChange({ ...theme, deepHex })}
            />
            <ColorSwatchInput
              label="Primary"
              value={theme.primaryHex}
              onChange={(primaryHex) => onChange({ ...theme, primaryHex })}
            />
            <ColorSwatchInput
              label="Accent"
              value={theme.accentHex}
              onChange={(accentHex) => onChange({ ...theme, accentHex })}
            />
            <ColorSwatchInput
              label="Backdrop"
              value={theme.backdropHex}
              onChange={(backdropHex) => onChange({ ...theme, backdropHex })}
            />
          </div>

          {/* 4 Real-Time Fine-Tuning Sliders */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <SliderRow
              label="Hue Shift"
              value={theme.hueShift}
              min={-180}
              max={180}
              step={1}
              displayValue={`${theme.hueShift > 0 ? '+' : ''}${Math.round(theme.hueShift)}°`}
              onChange={(hueShift) => onChange({ ...theme, hueShift })}
            />
            <SliderRow
              label="Saturation"
              value={theme.saturation}
              min={0.6}
              max={1.8}
              step={0.02}
              displayValue={`${Math.round(theme.saturation * 100)}%`}
              onChange={(saturation) => onChange({ ...theme, saturation })}
            />
            <SliderRow
              label="Glow"
              value={theme.bloom}
              min={0}
              max={1.4}
              step={0.02}
              displayValue={`${Math.round(theme.bloom * 100)}%`}
              onChange={(bloom) => onChange({ ...theme, bloom })}
            />
            <SliderRow
              label="Core White"
              value={theme.coreWhite}
              min={0.1}
              max={1.1}
              step={0.02}
              displayValue={`${Math.round(theme.coreWhite * 100)}%`}
              onChange={(coreWhite) => onChange({ ...theme, coreWhite })}
            />
          </div>
        </section>
      )}

      {/* Compact Bottom Action Dock */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={dynamicColorEnabled}
          aria-label="Dynamic color shift on zoom and rotate"
          onClick={onToggleDynamicColor}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl border text-xs font-medium tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
            dynamicColorEnabled
              ? 'bg-[#190D36]/95 border-fuchsia-400/50 text-white'
              : 'bg-[#0D0720]/90 border-purple-400/20 text-purple-100/75 hover:text-white hover:border-purple-400/40 hover:bg-[#170C33]/95'
          }`}
        >
          <span className="leading-none">Auto Color</span>
          <span
            aria-hidden="true"
            className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full border transition-colors duration-200 ${
              dynamicColorEnabled
                ? 'bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 border-white/30'
                : 'bg-white/10 border-white/15'
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                dynamicColorEnabled ? 'translate-x-[15px]' : 'translate-x-[1px]'
              }`}
            />
          </span>
          <span
            className={`text-[10px] font-mono font-semibold uppercase tracking-wider w-[22px] text-left ${
              dynamicColorEnabled ? 'text-fuchsia-200' : 'text-purple-200/50'
            }`}
          >
            {dynamicColorEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl border text-xs font-medium tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
            open
              ? 'bg-purple-600/35 border-fuchsia-400/50 text-white'
              : 'bg-[#0D0720]/90 border-purple-400/25 text-purple-100/85 hover:text-white hover:border-fuchsia-400/45 hover:bg-[#170C33]/95'
          }`}
        >
          <Palette className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="sm:hidden">{open ? 'Hide' : 'Colors'}</span>
          <span className="hidden sm:inline">{open ? 'Hide Colors' : 'Color Studio'}</span>
        </button>

        <button
          type="button"
          onClick={onReplayBirth}
          aria-label="Replay Core Birth"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#0D0720]/90 border border-purple-400/20 text-xs font-medium tracking-wide text-purple-100/80 hover:text-white hover:border-fuchsia-400/40 hover:bg-[#170C33]/95 active:scale-[0.98] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Replay</span>
        </button>
      </div>
    </div>
  );
}
