import { ArrowUpDown, RotateCcw, X } from 'lucide-react';
import type { StationGroup } from '@rail-kit/engine';
import { locale } from '../locales/i18n';

interface StationPillSelectorProps {
  origin: StationGroup | null;
  destination: StationGroup | null;
  compact?: boolean;
  onSwap: () => void;
  onClearDestination: () => void;
  onReset: () => void;
}

/**
 * Displays the selected origin and destination stations with swap, clear, and reset actions.
 */
export function StationPillSelector({
  origin,
  destination,
  compact = false,
  onSwap,
  onClearDestination,
  onReset,
}: StationPillSelectorProps) {
  const originCode = origin?.platforms[0]?.code ?? '';
  const destCode = destination?.platforms[0]?.code ?? '';

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-glass text-sm">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
          <span className="font-semibold truncate text-slate-900">
            {origin ? `${originCode} ${origin.name}` : locale.selector.selectOriginPlaceholder}
          </span>
          {origin && (
            <>
              <span className="text-slate-400 shrink-0">→</span>
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  destination ? 'bg-orange-600' : 'bg-slate-300'
                }`}
              />
              <span
                className={`truncate ${
                  destination ? 'font-semibold text-slate-900' : 'text-slate-400 text-xs'
                }`}
              >
                {destination
                  ? `${destCode} ${destination.name}`
                  : locale.selector.selectDestinationPlaceholder}
              </span>
            </>
          )}
        </div>

        {origin && destination && (
          <button
            type="button"
            onClick={onSwap}
            aria-label={locale.selector.swapAria}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        )}

        {origin && (
          <button
            type="button"
            onClick={onReset}
            aria-label={locale.selector.resetAria}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-50/90 border border-slate-200/80 p-2.5 flex items-center gap-2">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
          <span className="text-xs font-medium text-slate-400 shrink-0">
            {locale.selector.originLabel}
          </span>
          {origin ? (
            <span className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-mono text-xs">
                {originCode}
              </span>
              <span>{origin.name}</span>
            </span>
          ) : (
            <span className="text-xs text-slate-400 truncate">
              {locale.selector.selectOriginPlaceholder}
            </span>
          )}
        </div>

        <div className="border-t border-slate-200/70 ml-4" />

        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              destination ? 'bg-orange-600' : 'bg-slate-300'
            }`}
          />
          <span className="text-xs font-medium text-slate-400 shrink-0">
            {locale.selector.destinationLabel}
          </span>
          {destination ? (
            <div className="flex items-center justify-between flex-1 min-w-0 gap-1">
              <span className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-mono text-xs">
                  {destCode}
                </span>
                <span>{destination.name}</span>
              </span>
              <button
                type="button"
                onClick={onClearDestination}
                aria-label={locale.selector.clearDestinationAria}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400 truncate">
              {locale.selector.selectDestinationPlaceholder}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 shrink-0">
        {origin && destination && (
          <button
            type="button"
            onClick={onSwap}
            aria-label={locale.selector.swapAria}
            title={locale.selector.swapAria}
            className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        )}
        {origin && (
          <button
            type="button"
            onClick={onReset}
            aria-label={locale.selector.resetAria}
            title={locale.selector.resetAria}
            className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

