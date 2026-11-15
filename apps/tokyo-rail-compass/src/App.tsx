import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon, Settings, TrainFront, Wallet } from 'lucide-react';
import { TransitGraph } from '@rail-kit/engine';
import type { StationGroup } from '@rail-kit/engine';
import { RailMapCanvas } from '@rail-kit/map-ui';
import type { MapFitPadding, RailMapInstance } from '@rail-kit/map-ui';
import { tokyoTransitDataset } from '@rail-kit/tokyo-data';
import { LineLayersSettingsView } from './components/LineLayersSettingsView';
import { MobileBottomSheet, type SheetSnap } from './components/MobileBottomSheet';
import {
  OperatorFilterBar,
  RAILWAY_KIND_LEGEND,
  computeRailwayKindStats,
} from './components/OperatorFilterBar';
import { RouteComparisonView } from './components/RouteComparisonView';
import { StationDetailView } from './components/StationDetailView';
import { StationPillSelector } from './components/StationPillSelector';
import { TrackStyleSwatch } from './components/TrackStyleSwatch';
import { TransitWalletView } from './components/TransitWalletView';
import { useEnabledLines } from './hooks/useEnabledLines';
import { useWalletState } from './hooks/useWalletState';
import { formatMessage, locale } from './locales/i18n';

type AppTab = 'explore' | 'wallet' | 'lines';

const QUICK_HUB_IDS = ['shinjuku', 'ueno', 'tokyo', 'shibuya', 'ginza', 'asakusa'];
const TOKYO_CENTER: [number, number] = [139.7454, 35.6812];
const TOKYO_ZOOM = 12.2;

export default function App() {
  const graph = useMemo(() => new TransitGraph(tokyoTransitDataset), []);
  const lineById = useMemo(
    () => new Map(tokyoTransitDataset.lines.map((l) => [l.id, l])),
    []
  );
  const stationById = useMemo(
    () => new Map(tokyoTransitDataset.stations.map((s) => [s.id, s])),
    []
  );
  const operatorById = useMemo(
    () => new Map(tokyoTransitDataset.operators.map((op) => [op.id, op])),
    []
  );

  const [originId, setOriginId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('explore');
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const mapInstanceRef = useRef<RailMapInstance | null>(null);
  const { wallet, setPaymentMethod, togglePass } = useWalletState();
  const {
    configuredLineIds,
    enabledLineIds,
    hiddenRailwayKinds,
    toggleLine,
    setGroupEnabled,
    toggleRailwayKind,
    showAllConfiguredKinds,
    applyPreset,
  } = useEnabledLines(tokyoTransitDataset.lines);

  const kindStats = useMemo(
    () =>
      computeRailwayKindStats(
        tokyoTransitDataset.lines,
        configuredLineIds,
        hiddenRailwayKinds
      ),
    [configuredLineIds, hiddenRailwayKinds]
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const originStation = originId ? (stationById.get(originId) ?? null) : null;
  const destinationStation = destinationId
    ? (stationById.get(destinationId) ?? null)
    : null;

  useEffect(() => {
    if (
      originStation &&
      !originStation.platforms.some((p) => enabledLineIds.has(p.lineId))
    ) {
      setOriginId(null);
      setDestinationId(null);
      setSelectedRouteId(null);
      setSheetSnap('peek');
      return;
    }
    if (
      destinationStation &&
      !destinationStation.platforms.some((p) => enabledLineIds.has(p.lineId))
    ) {
      setDestinationId(null);
      setSelectedRouteId(null);
    }
  }, [originStation, destinationStation, enabledLineIds]);

  const connectedLines = useMemo(() => {
    if (!originId) return [];
    return graph.getConnectedLines(originId, enabledLineIds);
  }, [graph, originId, enabledLineIds]);

  const activeLineIds = useMemo(() => {
    if (!originId || destinationId) return undefined;
    return new Set(connectedLines.map((line) => line.id));
  }, [originId, destinationId, connectedLines]);

  const routes = useMemo(() => {
    if (!originId || !destinationId) return [];
    return graph.findRoutes(originId, destinationId, wallet, {
      allowedLineIds: enabledLineIds,
      maxRoutes: 3,
    });
  }, [graph, originId, destinationId, wallet, enabledLineIds]);

  // Keep selectedRouteId valid whenever routes recompute
  useEffect(() => {
    if (routes.length === 0) {
      setSelectedRouteId(null);
      return;
    }
    if (!selectedRouteId || !routes.some((r) => r.id === selectedRouteId)) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes, selectedRouteId]);

  const activeRoute = useMemo(() => {
    if (routes.length === 0) return null;
    return routes.find((r) => r.id === selectedRouteId) ?? routes[0];
  }, [routes, selectedRouteId]);

  const quickHubStations = useMemo(
    () =>
      QUICK_HUB_IDS.map((id) => stationById.get(id)).filter(
        (s): s is StationGroup =>
          s !== undefined && s.platforms.some((p) => enabledLineIds.has(p.lineId))
      ),
    [stationById, enabledLineIds]
  );

  const suggestedDestinations = useMemo(
    () => quickHubStations.filter((s) => s.id !== originId).slice(0, 5),
    [quickHubStations, originId]
  );

  const fitPadding = useMemo<MapFitPadding>(() => {
    if (isDesktop) {
      return { top: 64, bottom: 64, left: 420, right: 90 };
    }
    return { top: 96, bottom: 320, left: 44, right: 44 };
  }, [isDesktop]);

  /**
   * 3-click interaction state machine:
   * - No origin -> set origin A
   * - Origin A, no destination -> set destination B (or clear if clicking A)
   * - Both A & B set -> clicking C replaces destination B while keeping origin A
   */
  const handleStationSelect = useCallback(
    (station: StationGroup) => {
      setActiveTab('explore');

      if (!originId) {
        setOriginId(station.id);
        setDestinationId(null);
        setSheetSnap('half');
        return;
      }

      if (!destinationId) {
        if (station.id === originId) {
          setOriginId(null);
          setSheetSnap('peek');
        } else {
          setDestinationId(station.id);
          setSheetSnap('half');
        }
        return;
      }

      if (station.id === originId) {
        setOriginId(null);
        setDestinationId(null);
        setSheetSnap('peek');
        return;
      }

      if (station.id !== destinationId) {
        setDestinationId(station.id);
        setSheetSnap('half');
      }
    },
    [originId, destinationId]
  );

  const handleBackgroundClick = useCallback(() => {
    if (originId && !destinationId) {
      setOriginId(null);
      setSheetSnap('peek');
    }
  }, [originId, destinationId]);

  const handleSwap = useCallback(() => {
    if (!originId || !destinationId) return;
    setOriginId(destinationId);
    setDestinationId(originId);
  }, [originId, destinationId]);

  const handleClearDestination = useCallback(() => {
    setDestinationId(null);
    setSheetSnap('half');
  }, []);

  const handleReset = useCallback(() => {
    setOriginId(null);
    setDestinationId(null);
    setSelectedRouteId(null);
    setSheetSnap('peek');
  }, []);

  const handleZoomIn = useCallback(() => {
    mapInstanceRef.current?.zoomIn({ duration: 250 });
  }, []);

  const handleZoomOut = useCallback(() => {
    mapInstanceRef.current?.zoomOut({ duration: 250 });
  }, []);

  const handleResetCamera = useCallback(() => {
    mapInstanceRef.current?.easeTo({
      center: TOKYO_CENTER,
      zoom: TOKYO_ZOOM,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      duration: 500,
    });
  }, []);

  const handleMapReady = useCallback((map: RailMapInstance) => {
    mapInstanceRef.current = map;
  }, []);

  const exploreContent = (() => {
    if (!originStation) {
      return (
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-900">{locale.idle.headline}</p>
          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="font-bold text-slate-900">{locale.idle.step1Title}</div>
              <p className="text-slate-600 leading-relaxed">{locale.idle.step1Desc}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="font-bold text-slate-900">{locale.idle.step2Title}</div>
              <p className="text-slate-600 leading-relaxed">{locale.idle.step2Desc}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="font-bold text-slate-900">{locale.idle.step3Title}</div>
              <p className="text-slate-600 leading-relaxed">{locale.idle.step3Desc}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {locale.idle.quickStartsLabel}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickHubStations.map((hub) => (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => handleStationSelect(hub)}
                  className="px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-700 text-xs font-semibold text-slate-700 shadow-sm transition min-h-[36px]"
                >
                  {hub.platforms.find((p) => enabledLineIds.has(p.lineId))?.code ??
                    hub.platforms[0]?.code}{' '}
                  {hub.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (!destinationStation) {
      return (
        <StationDetailView
          station={originStation}
          lines={connectedLines}
          operatorById={operatorById}
          suggestedDestinations={suggestedDestinations}
          onQuickSelectDestination={(destId) => {
            const st = stationById.get(destId);
            if (st) handleStationSelect(st);
          }}
        />
      );
    }

    return (
      <RouteComparisonView
        origin={originStation}
        routes={routes}
        activeRouteId={activeRoute?.id ?? null}
        lineById={lineById}
        stationById={stationById}
        operatorById={operatorById}
        fareRules={tokyoTransitDataset.fareRules}
        onSelectRoute={setSelectedRouteId}
      />
    );
  })();

  const mobileSummaryTitle = (() => {
    if (!originStation) return locale.idle.headline;
    if (!destinationStation) {
      return `${originStation.name} · ${formatMessage(
        locale.stationDetail.linesServingCount,
        { count: connectedLines.length }
      )}`;
    }
    if (activeRoute) {
      return `${originStation.name} → ${destinationStation.name} · ${activeRoute.totalMinutes}${locale.routes.minutesUnit} · ¥${activeRoute.fare.payableFare}`;
    }
    return `${originStation.name} → ${destinationStation.name}`;
  })();

  const activePassCount = wallet.enabledPassIds.length;

  const lineSettingsView = (
    <LineLayersSettingsView
      operators={tokyoTransitDataset.operators}
      lines={tokyoTransitDataset.lines}
      enabledLineIds={configuredLineIds}
      effectiveEnabledCount={enabledLineIds.size}
      onShowAllConfiguredKinds={showAllConfiguredKinds}
      onToggleLine={toggleLine}
      onSetGroupEnabled={setGroupEnabled}
      onApplyPreset={applyPreset}
    />
  );

  return (
    <div
      className="relative w-full h-screen h-[100dvh] overflow-hidden bg-[#F2F1EC]"
      style={{ width: '100vw', height: '100dvh' }}
    >
      {/* Full-bleed MapLibre interactive canvas */}
      <RailMapCanvas
        dataset={tokyoTransitDataset}
        originId={originId}
        destinationId={destinationId}
        activeLineIds={activeLineIds}
        activeRoute={activeRoute}
        visibleLineIds={enabledLineIds}
        initialCenter={TOKYO_CENTER}
        initialZoom={TOKYO_ZOOM}
        fitPadding={fitPadding}
        onStationSelect={handleStationSelect}
        onMapBackgroundClick={handleBackgroundClick}
        onMapReady={handleMapReady}
      />

      {/* Desktop Left Floating Glassmorphic Card */}
      <aside className="hidden md:flex fixed top-4 left-4 bottom-4 w-[380px] z-20 rounded-2xl bg-white/90 backdrop-blur-xl border border-slate-200/90 shadow-glass flex-col overflow-hidden">
        {/* App Header & Tab Switcher */}
        <div className="p-4 pb-3 border-b border-slate-200/70 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <TrainFront className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-extrabold text-slate-900 tracking-tight truncate">
                  {locale.appTitle}
                </h1>
                <p className="text-xs text-slate-500 truncate">{locale.appSubtitle}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100/90">
            <button
              type="button"
              onClick={() => setActiveTab('explore')}
              className={`py-1.5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition min-w-0 ${
                activeTab === 'explore'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{locale.tabs.explore}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`py-1.5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition min-w-0 ${
                activeTab === 'wallet'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {locale.tabs.wallet}
                {activePassCount > 0 ? ` (${activePassCount})` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('lines')}
              className={`py-1.5 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition min-w-0 ${
                activeTab === 'lines'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{locale.tabs.lines}</span>
            </button>
          </div>

          {activeTab === 'explore' && (
            <StationPillSelector
              origin={originStation}
              destination={destinationStation}
              onSwap={handleSwap}
              onClearDestination={handleClearDestination}
              onReset={handleReset}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'explore' ? (
            exploreContent
          ) : activeTab === 'wallet' ? (
            <TransitWalletView
              passes={tokyoTransitDataset.walletPasses}
              wallet={wallet}
              onChangePaymentMethod={setPaymentMethod}
              onTogglePass={togglePass}
            />
          ) : (
            lineSettingsView
          )}
        </div>
      </aside>

      {/* Desktop Bottom-Right Floating 5-Kind Track Filter & Zoom Controls */}
      <div className="hidden md:block fixed bottom-4 right-4 z-20">
        <OperatorFilterBar
          lines={tokyoTransitDataset.lines}
          configuredLineIds={configuredLineIds}
          hiddenRailwayKinds={hiddenRailwayKinds}
          onToggleRailwayKind={toggleRailwayKind}
          onOpenLineSettings={() => setActiveTab('lines')}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetCamera={handleResetCamera}
        />
      </div>

      {/* Mobile Top Compact Pill Selector */}
      {activeTab === 'explore' && (
        <div className="md:hidden fixed top-3 left-3 right-3 z-20 space-y-2">
          <StationPillSelector
            origin={originStation}
            destination={destinationStation}
            compact
            onSwap={handleSwap}
            onClearDestination={handleClearDestination}
            onReset={handleReset}
          />
          <div className="flex flex-wrap justify-end gap-1">
            {RAILWAY_KIND_LEGEND.map(({ kind, sampleColor }) => {
              const { configured, active } = kindStats[kind];
              const isUnconfigured = configured === 0;
              const isLit = active > 0;
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={isUnconfigured}
                  title={isUnconfigured ? locale.settings.kindUnconfiguredHint : undefined}
                  onClick={() => toggleRailwayKind(kind)}
                  className={`px-2 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 shadow-sm border transition ${
                    isLit
                      ? 'bg-slate-900/90 text-white border-slate-900'
                      : isUnconfigured
                        ? 'bg-white/60 text-slate-300 border-slate-200/70 cursor-not-allowed'
                        : 'bg-white/85 text-slate-500 border-slate-200'
                  }`}
                >
                  <TrackStyleSwatch
                    kind={kind}
                    color={sampleColor}
                    compact
                    className={
                      isLit ? 'opacity-100' : isUnconfigured ? 'opacity-25' : 'opacity-45'
                    }
                  />
                  <span>{locale.settings.railwayKindsShort[kind]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Draggable Bottom Sheet (Explore Tab) */}
      {activeTab === 'explore' && (
        <MobileBottomSheet
          snap={sheetSnap}
          onChangeSnap={setSheetSnap}
          summaryTitle={mobileSummaryTitle}
        >
          {exploreContent}
        </MobileBottomSheet>
      )}

      {/* Mobile Full-Screen Wallet Overlay (Wallet Tab) */}
      {activeTab === 'wallet' && (
        <div className="md:hidden fixed inset-0 bottom-[60px] z-30 bg-[#F2F1EC] overflow-y-auto px-4 pt-5 pb-8">
          <TransitWalletView
            passes={tokyoTransitDataset.walletPasses}
            wallet={wallet}
            onChangePaymentMethod={setPaymentMethod}
            onTogglePass={togglePass}
          />
        </div>
      )}

      {/* Mobile Full-Screen Line Layers Settings Overlay (Lines Tab) */}
      {activeTab === 'lines' && (
        <div className="md:hidden fixed inset-0 bottom-[60px] z-30 bg-[#F2F1EC] overflow-y-auto px-4 pt-5 pb-8">
          {lineSettingsView}
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[60px] z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-3">
        <button
          type="button"
          onClick={() => setActiveTab('explore')}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition ${
            activeTab === 'explore' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <MapIcon className="w-5 h-5" />
          <span>{locale.tabs.explore}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('wallet')}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition ${
            activeTab === 'wallet' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <Wallet className="w-5 h-5" />
          <span>
            {locale.tabs.wallet}
            {activePassCount > 0 ? ` (${activePassCount})` : ''}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('lines')}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition ${
            activeTab === 'lines' ? 'text-blue-600' : 'text-slate-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>{locale.tabs.lines}</span>
        </button>
      </nav>
    </div>
  );
}
