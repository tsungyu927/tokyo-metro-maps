import type { Operator, RailLine, StationGroup } from '@rail-kit/engine';
import { formatMessage, locale } from '../locales/i18n';

interface StationDetailViewProps {
  station: StationGroup;
  lines: RailLine[];
  operatorById: Map<string, Operator>;
  suggestedDestinations: StationGroup[];
  onQuickSelectDestination: (stationId: string) => void;
}

/**
 * State 1 panel showing all transit lines illuminated at the selected origin station.
 */
export function StationDetailView({
  station,
  lines,
  operatorById,
  suggestedDestinations,
  onQuickSelectDestination,
}: StationDetailViewProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
            {locale.stationDetail.originSelectedBadge}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {formatMessage(locale.stationDetail.linesServingCount, { count: lines.length })}
          </span>
        </div>
        <div className="flex items-baseline gap-2 pt-1">
          <h2 className="text-lg font-bold text-slate-900">{station.name}</h2>
          <span className="text-xs font-medium text-slate-500">{station.nameEn}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {locale.stationDetail.litLinesHeading}
        </h3>
        <div className="space-y-1.5">
          {lines.map((line) => {
            const operator = operatorById.get(line.operatorId);
            const platformCode =
              station.platforms.find((p) => p.lineId === line.id)?.code ?? line.code;
            return (
              <div
                key={line.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/85 border border-slate-200/80 shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="px-2 py-0.5 rounded-md text-white font-mono text-xs font-bold shrink-0"
                    style={{ backgroundColor: line.color }}
                  >
                    {platformCode}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {line.name}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-500 shrink-0 ml-2">
                  {operator?.shortName ?? line.operatorId}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 space-y-2">
        <p className="text-xs text-slate-600 leading-relaxed">
          {locale.stationDetail.nextStepHint}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {suggestedDestinations.map((dest) => (
            <button
              key={dest.id}
              type="button"
              onClick={() => onQuickSelectDestination(dest.id)}
              className="px-2.5 py-1.5 rounded-full bg-white border border-slate-200 hover:border-orange-400 hover:text-orange-700 text-xs font-semibold text-slate-700 transition min-h-[34px]"
            >
              {dest.platforms[0]?.code} {dest.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

