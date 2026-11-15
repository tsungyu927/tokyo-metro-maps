import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, RotateCcw, Search, X } from 'lucide-react';
import type { Operator, RailLine, RailwayKind } from '@rail-kit/engine';
import {
  computePresetLineIds,
  type LinePresetKey,
} from '../hooks/useEnabledLines';
import { formatMessage, locale } from '../locales/i18n';
import { TrackStyleSwatch } from './TrackStyleSwatch';

export interface LineLayersSettingsViewProps {
  operators: Operator[];
  lines: RailLine[];
  enabledLineIds: ReadonlySet<string>;
  effectiveEnabledCount?: number;
  onShowAllConfiguredKinds?: () => void;
  onToggleLine: (lineId: string) => void;
  onSetGroupEnabled: (lineIds: string[], enabled: boolean) => void;
  onApplyPreset: (preset: LinePresetKey) => void;
}

const PRESET_KEYS: LinePresetKey[] = [
  'recommended',
  'withPrivateHubs',
  'subwayOnly',
  'all',
];

const LEGEND_KINDS: Array<{ kind: RailwayKind; sampleColor: string }> = [
  { kind: 'subway', sampleColor: '#009BBF' },
  { kind: 'jr', sampleColor: '#80C241' },
  { kind: 'private', sampleColor: '#DD0077' },
  { kind: 'shinkansen', sampleColor: '#003399' },
  { kind: 'monorail', sampleColor: '#00A0DE' },
];

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Operator-grouped line toggle tab coupled to both map layer visibility and route search.
 */
export function LineLayersSettingsView({
  operators,
  lines,
  enabledLineIds,
  effectiveEnabledCount,
  onShowAllConfiguredKinds,
  onToggleLine,
  onSetGroupEnabled,
  onApplyPreset,
}: LineLayersSettingsViewProps) {
  const [query, setQuery] = useState('');
  const [showLegend, setShowLegend] = useState(true);
  const [expandedOperators, setExpandedOperators] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const line of lines) {
      if (line.defaultEnabled !== false) {
        initial.add(line.operatorId);
      }
    }
    return initial;
  });

  const normalizedQuery = query.trim().toLowerCase();

  const presetSets = useMemo(() => {
    return {
      recommended: computePresetLineIds(lines, 'recommended'),
      withPrivateHubs: computePresetLineIds(lines, 'withPrivateHubs'),
      subwayOnly: computePresetLineIds(lines, 'subwayOnly'),
      all: computePresetLineIds(lines, 'all'),
    };
  }, [lines]);

  const operatorGroups = useMemo(() => {
    const linesByOperator = new Map<string, RailLine[]>();
    for (const line of lines) {
      const list = linesByOperator.get(line.operatorId) ?? [];
      list.push(line);
      linesByOperator.set(line.operatorId, list);
    }

    return operators
      .map((operator) => {
        const allOpLines = linesByOperator.get(operator.id) ?? [];
        const operatorMatches =
          !normalizedQuery ||
          operator.name.toLowerCase().includes(normalizedQuery) ||
          operator.shortName.toLowerCase().includes(normalizedQuery);

        const visibleOpLines = operatorMatches
          ? allOpLines
          : allOpLines.filter((line) => {
              const kindLabel =
                locale.settings.railwayKinds[line.railwayKind ?? 'subway'] ?? '';
              return (
                line.name.toLowerCase().includes(normalizedQuery) ||
                line.code.toLowerCase().includes(normalizedQuery) ||
                line.id.toLowerCase().includes(normalizedQuery) ||
                kindLabel.toLowerCase().includes(normalizedQuery)
              );
            });

        return {
          operator,
          allOpLines,
          visibleOpLines,
        };
      })
      .filter((group) => group.allOpLines.length > 0 && group.visibleOpLines.length > 0);
  }, [lines, operators, normalizedQuery]);

  const toggleExpanded = (operatorId: string) => {
    setExpandedOperators((prev) => {
      const next = new Set(prev);
      if (next.has(operatorId)) {
        next.delete(operatorId);
      } else {
        next.add(operatorId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            {locale.settings.title}
          </h2>
          <span className="inline-flex items-center rounded-full bg-slate-900 text-white px-2.5 py-0.5 text-[11px] font-semibold tabular-nums">
            {formatMessage(locale.settings.enabledSummary, {
              enabled: enabledLineIds.size,
              total: lines.length,
            })}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
          {locale.settings.subtitle}
        </p>
      </div>

      {/* Temporary quick-filter hidden notice */}
      {effectiveEnabledCount !== undefined && effectiveEnabledCount < enabledLineIds.size && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 flex items-center justify-between gap-2">
          <span className="leading-snug">
            {formatMessage(locale.settings.hiddenByQuickFilterNotice, {
              count: enabledLineIds.size - effectiveEnabledCount,
            })}
          </span>
          {onShowAllConfiguredKinds && (
            <button
              type="button"
              onClick={onShowAllConfiguredKinds}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-blue-700 transition-colors shrink-0"
            >
              <Eye className="w-3 h-3" />
              {locale.settings.showAllConfiguredButton}
            </button>
          )}
        </div>
      )}

      {/* Zero-lines safety banner */}
      {enabledLineIds.size === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-2">
          <p className="font-semibold">{locale.settings.zeroWarningTitle}</p>
          <p className="text-amber-800">{locale.settings.zeroWarningBody}</p>
          <button
            type="button"
            onClick={() => onApplyPreset('recommended')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-amber-700 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            {locale.settings.presets.recommended}
          </button>
        </div>
      )}

      {/* Quick preset chips */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          {locale.settings.presetsLabel}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESET_KEYS.map((presetKey) => {
            const isActive = setsEqual(enabledLineIds, presetSets[presetKey]);
            return (
              <button
                key={presetKey}
                type="button"
                onClick={() => onApplyPreset(presetKey)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors text-left flex items-center justify-between ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className="truncate">{locale.settings.presets[presetKey]}</span>
                <span
                  className={`text-[10px] tabular-nums ${
                    isActive ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {presetSets[presetKey].size}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Collapsible 5-tier track & station shape legend */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLegend((prev) => !prev)}
          className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span>{locale.settings.legendTitle}</span>
          {showLegend ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>
        {showLegend && (
          <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              {LEGEND_KINDS.map(({ kind, sampleColor }) => (
                <div key={kind} className="flex items-center gap-2 text-[11px] text-slate-700">
                  <TrackStyleSwatch kind={kind} color={sampleColor} compact />
                  <span className="truncate">{locale.settings.railwayKinds[kind]}</span>
                </div>
              ))}
            </div>
            <div className="pt-1.5 border-t border-slate-100 space-y-1 text-[11px] text-slate-500 leading-snug">
              <p>{locale.settings.stationShapesHint}</p>
              <p className="text-slate-600 font-medium">
                {locale.settings.legendMultiKindHint}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={locale.settings.searchPlaceholder}
          className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-400"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={locale.settings.clearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Operator-grouped checklist */}
      {operatorGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
          {formatMessage(locale.settings.emptySearch, { query: query.trim() })}
        </div>
      ) : (
        <div className="space-y-2">
          {operatorGroups.map(({ operator, allOpLines, visibleOpLines }) => {
            const enabledInOperator = allOpLines.filter((line) =>
              enabledLineIds.has(line.id)
            ).length;
            const allEnabledInOperator = enabledInOperator === allOpLines.length;
            const someEnabledInOperator =
              enabledInOperator > 0 && enabledInOperator < allOpLines.length;
            const isExpanded =
              Boolean(normalizedQuery) || expandedOperators.has(operator.id);

            return (
              <div
                key={operator.id}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50/70">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(operator.id)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: operator.color }}
                    />
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {operator.name}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 tabular-nums shrink-0">
                      {enabledInOperator}/{allOpLines.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onSetGroupEnabled(
                        allOpLines.map((line) => line.id),
                        !allEnabledInOperator
                      )
                    }
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-colors shrink-0 ${
                      allEnabledInOperator
                        ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-700'
                        : someEnabledInOperator
                          ? 'bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {allEnabledInOperator
                      ? locale.settings.clearGroup
                      : locale.settings.selectAllGroup}
                  </button>
                </div>

                {isExpanded && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {visibleOpLines.map((line) => {
                      const checked = enabledLineIds.has(line.id);
                      const kind = line.railwayKind ?? 'subway';
                      const isRecommended = line.defaultEnabled !== false;

                      return (
                        <label
                          key={line.id}
                          className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                            checked ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/30 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleLine(line.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 shrink-0"
                          />
                          <TrackStyleSwatch kind={kind} color={line.color} />
                          <span
                            className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[26px] shrink-0"
                            style={{ backgroundColor: line.color }}
                          >
                            {line.code}
                          </span>
                          <span
                            className={`text-xs truncate flex-1 ${
                              checked ? 'font-medium text-slate-800' : 'text-slate-500'
                            }`}
                          >
                            {line.name}
                          </span>
                          {isRecommended && (
                            <span className="rounded bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-1.5 py-0.5 text-[9px] font-semibold shrink-0">
                              {locale.settings.defaultBadge}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

