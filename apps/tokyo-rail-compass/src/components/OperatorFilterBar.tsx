import { Compass, Minus, Plus, Settings } from 'lucide-react';
import type { RailLine, RailwayKind } from '@rail-kit/engine';
import { locale } from '../locales/i18n';
import { TrackStyleSwatch } from './TrackStyleSwatch';

export const RAILWAY_KIND_LEGEND: Array<{ kind: RailwayKind; sampleColor: string }> = [
  { kind: 'subway', sampleColor: '#009BBF' },
  { kind: 'jr', sampleColor: '#80C241' },
  { kind: 'private', sampleColor: '#DD0077' },
  { kind: 'shinkansen', sampleColor: '#003399' },
  { kind: 'monorail', sampleColor: '#00A0DE' },
];

export interface RailwayKindStat {
  configured: number;
  active: number;
  total: number;
  isHidden: boolean;
}

export function computeRailwayKindStats(
  lines: RailLine[],
  configuredLineIds: ReadonlySet<string>,
  hiddenRailwayKinds: ReadonlySet<RailwayKind>
): Record<RailwayKind, RailwayKindStat> {
  const stats: Record<RailwayKind, RailwayKindStat> = {
    subway: { configured: 0, active: 0, total: 0, isHidden: hiddenRailwayKinds.has('subway') },
    jr: { configured: 0, active: 0, total: 0, isHidden: hiddenRailwayKinds.has('jr') },
    private: { configured: 0, active: 0, total: 0, isHidden: hiddenRailwayKinds.has('private') },
    shinkansen: {
      configured: 0,
      active: 0,
      total: 0,
      isHidden: hiddenRailwayKinds.has('shinkansen'),
    },
    monorail: { configured: 0, active: 0, total: 0, isHidden: hiddenRailwayKinds.has('monorail') },
  };
  for (const line of lines) {
    const kind = line.railwayKind ?? 'subway';
    stats[kind].total += 1;
    if (configuredLineIds.has(line.id)) {
      stats[kind].configured += 1;
      if (!hiddenRailwayKinds.has(kind)) {
        stats[kind].active += 1;
      }
    }
  }
  return stats;
}

interface OperatorFilterBarProps {
  lines: RailLine[];
  configuredLineIds: ReadonlySet<string>;
  hiddenRailwayKinds: ReadonlySet<RailwayKind>;
  onToggleRailwayKind: (kind: RailwayKind) => void;
  onOpenLineSettings?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
}

/**
 * Floating map controls pairing camera actions with a 5-tier track legend and quick visibility toggles.
 */
export function OperatorFilterBar({
  lines,
  configuredLineIds,
  hiddenRailwayKinds,
  onToggleRailwayKind,
  onOpenLineSettings,
  onZoomIn,
  onZoomOut,
  onResetCamera,
}: OperatorFilterBarProps) {
  const kindStats = computeRailwayKindStats(lines, configuredLineIds, hiddenRailwayKinds);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-col rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-glass overflow-hidden">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label={locale.controls.zoomIn}
          title={locale.controls.zoomIn}
          className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition border-b border-slate-200/70"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          aria-label={locale.controls.zoomOut}
          title={locale.controls.zoomOut}
          className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition border-b border-slate-200/70"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onResetCamera}
          aria-label={locale.controls.resetView}
          title={locale.controls.resetView}
          className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5 p-1.5 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-glass">
        {RAILWAY_KIND_LEGEND.map(({ kind, sampleColor }) => {
          const { configured, active } = kindStats[kind];
          const isUnconfigured = configured === 0;
          const isLit = active > 0;
          const badgeText = isLit
            ? String(configured)
            : configured > 0
              ? `0/${configured}`
              : '0';

          return (
            <button
              key={kind}
              type="button"
              disabled={isUnconfigured}
              title={isUnconfigured ? locale.settings.kindUnconfiguredHint : undefined}
              onClick={() => onToggleRailwayKind(kind)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition min-h-[34px] ${
                isLit
                  ? 'bg-slate-900 text-white shadow-sm'
                  : isUnconfigured
                    ? 'bg-slate-100/70 text-slate-300 cursor-not-allowed'
                    : 'bg-slate-100 text-slate-500 hover:text-slate-700'
              }`}
            >
              <TrackStyleSwatch
                kind={kind}
                color={sampleColor}
                compact
                className={isLit ? 'opacity-100' : isUnconfigured ? 'opacity-25' : 'opacity-45'}
              />
              <span>{locale.settings.railwayKindsShort[kind]}</span>
              <span
                className={`text-[10px] font-medium tabular-nums ${
                  isLit ? 'text-slate-300' : isUnconfigured ? 'text-slate-300' : 'text-slate-400'
                }`}
              >
                {badgeText}
              </span>
            </button>
          );
        })}

        {onOpenLineSettings && (
          <button
            type="button"
            onClick={onOpenLineSettings}
            aria-label={locale.settings.openLineSettingsAria}
            title={locale.settings.openLineSettingsAria}
            className="w-[34px] h-[34px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

