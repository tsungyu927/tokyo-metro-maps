import { AlertTriangle, Footprints, TicketCheck } from 'lucide-react';
import type {
  ComputedRoute,
  FareRules,
  Operator,
  RailLine,
  StationGroup,
  TransferDifficulty,
} from '@rail-kit/engine';
import { formatMessage, locale, resolveLocaleKey } from '../locales/i18n';
import { TrackStyleSwatch } from './TrackStyleSwatch';

interface RouteComparisonViewProps {
  origin: StationGroup;
  routes: ComputedRoute[];
  activeRouteId: string | null;
  lineById: Map<string, RailLine>;
  stationById: Map<string, StationGroup>;
  operatorById: Map<string, Operator>;
  fareRules: FareRules;
  onSelectRoute: (routeId: string) => void;
}

const TAG_BADGE_STYLES: Record<ComputedRoute['tagKey'], string> = {
  fastest: 'bg-emerald-600 text-white',
  direct: 'bg-blue-600 text-white',
  passSaver: 'bg-sky-600 text-white',
  alternative: 'bg-slate-600 text-white',
};

const TRANSFER_BADGE_STYLES: Record<TransferDifficulty, string> = {
  easy: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  normal: 'bg-slate-100 text-slate-700 border-slate-200',
  hard: 'bg-amber-50 text-amber-800 border-amber-300',
};

/**
 * State 2 panel displaying ranked route alternatives with explicit transfer walk steps and wallet fares.
 */
export function RouteComparisonView({
  origin,
  routes,
  activeRouteId,
  lineById,
  stationById,
  operatorById,
  fareRules,
  onSelectRoute,
}: RouteComparisonViewProps) {
  const currency = fareRules.currencySymbol;

  if (routes.length === 0) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 leading-relaxed">
        {locale.routes.noRoutesFound}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {routes.map((route, index) => {
        const isSelected = activeRouteId ? route.id === activeRouteId : index === 0;
        const tagLabel = locale.routes.tags[route.tagKey];
        const hasSavings = route.fare.savedAmount > 0;
        const isFullyCovered = route.fare.payableFare === 0 && hasSavings;

        return (
          <div
            key={route.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectRoute(route.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectRoute(route.id);
              }
            }}
            className={`rounded-2xl border p-3.5 transition cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isSelected
                ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500/20'
                : 'bg-white/80 border-slate-200/90 hover:bg-white hover:border-slate-300'
            }`}
          >
            {/* Header row: badge + duration + wallet-adjusted price */}
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    TAG_BADGE_STYLES[route.tagKey]
                  }`}
                >
                  {tagLabel}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-extrabold text-slate-900 tabular-nums">
                    {route.totalMinutes}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    {locale.routes.minutesUnit}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs font-medium text-slate-600">
                    {route.transferCount === 0
                      ? locale.routes.directLabel
                      : formatMessage(locale.routes.transfersCountLabel, {
                          count: route.transferCount,
                        })}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="flex items-baseline justify-end gap-1.5">
                  {hasSavings && (
                    <span className="text-xs text-slate-400 line-through tabular-nums">
                      {currency}
                      {route.fare.baseFare}
                    </span>
                  )}
                  <span
                    className={`text-lg font-extrabold tabular-nums ${
                      hasSavings ? 'text-emerald-600' : 'text-slate-900'
                    }`}
                  >
                    {currency}
                    {route.fare.payableFare}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {route.fare.paymentMethod === 'ic'
                    ? locale.routes.paidByIc
                    : locale.routes.paidByCash}
                </div>
              </div>
            </div>

            {/* Wallet discount or inter-operator discount pills */}
            {(hasSavings || route.fare.interOperatorDiscountApplied > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hasSavings && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                    <TicketCheck className="w-3.5 h-3.5" />
                    {isFullyCovered
                      ? locale.routes.passFullFreeBadge
                      : formatMessage(locale.routes.passSavedBadge, {
                          currency,
                          amount: route.fare.savedAmount,
                        })}
                  </span>
                )}
                {route.fare.interOperatorDiscountApplied > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-xs font-medium">
                    {formatMessage(locale.routes.interOperatorDiscountBadge, {
                      currency,
                      amount: route.fare.interOperatorDiscountApplied,
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Proportional segment color bar */}
            <div className="mt-2.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden flex gap-0.5">
              {route.legs.map((leg, legIndex) => {
                const line = lineById.get(leg.lineId);
                const flexGrow = Math.max(1, leg.rideMinutes);
                return (
                  <div
                    key={`${leg.lineId}-${legIndex}`}
                    className="h-full rounded-full"
                    style={{
                      flexGrow,
                      backgroundColor: line?.color ?? '#64748b',
                    }}
                  />
                );
              })}
            </div>

            {/* Step-by-step leg + explicit transfer walking time breakdown */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2 text-xs">
              {route.legs.map((leg, legIndex) => {
                const line = lineById.get(leg.lineId);
                const fromStation = stationById.get(leg.fromStationId);
                const toStation = stationById.get(leg.toStationId);
                const operator = operatorById.get(leg.operatorId);
                const transfer = route.transfers[legIndex];

                return (
                  <div key={`${leg.lineId}-${legIndex}`} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <TrackStyleSwatch
                          kind={line?.railwayKind ?? 'subway'}
                          color={line?.color ?? '#64748b'}
                          compact
                        />
                        <span className="font-bold text-slate-900 truncate">
                          {line?.name ?? leg.lineId}
                        </span>
                        <span className="text-slate-400 shrink-0">
                          {operator?.shortName}
                        </span>
                      </div>
                      <span className="text-slate-600 font-medium tabular-nums shrink-0">
                        {formatMessage(locale.routes.legDuration, {
                          minutes: leg.rideMinutes,
                        })}
                      </span>
                    </div>

                    <div className="pl-4 text-slate-500 flex items-center gap-1.5 truncate">
                      <span className="font-mono text-slate-700">{leg.fromCode}</span>
                      <span>{fromStation?.name}</span>
                      <span>→</span>
                      <span className="font-mono text-slate-700">{leg.toCode}</span>
                      <span>{toStation?.name}</span>
                    </div>

                    {transfer && (
                      <div
                        className={`ml-3 px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 ${
                          TRANSFER_BADGE_STYLES[transfer.difficulty]
                        }`}
                      >
                        {transfer.difficulty === 'hard' ? (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        ) : (
                          <Footprints className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        )}
                        <div className="leading-snug">
                          <span className="font-bold">
                            {formatMessage(
                              transfer.difficulty === 'hard'
                                ? locale.routes.transferWalkHard
                                : transfer.difficulty === 'easy'
                                  ? locale.routes.transferWalkEasy
                                  : locale.routes.transferWalkNormal,
                              { minutes: transfer.walkMinutes }
                            )}
                          </span>
                          <span className="mx-1">·</span>
                          <span>
                            {stationById.get(transfer.fromStationId)?.name}
                            {transfer.toStationId !== transfer.fromStationId
                              ? ` ↔ ${stationById.get(transfer.toStationId)?.name}`
                              : ''}{' '}
                            ({resolveLocaleKey(transfer.noteKey)})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {route.transferCount > 0 && (
              <div className="mt-2 pt-1.5 border-t border-slate-100 text-xs text-slate-400">
                {formatMessage(locale.routes.rideSummary, {
                  ride: route.rideMinutes,
                  walk: route.totalWalkMinutes,
                })}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-xs text-slate-500 px-1 pt-0.5 leading-relaxed">
        {formatMessage(locale.routes.thirdClickHint, { origin: origin.name })}
      </p>
    </div>
  );
}

