import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  ComputedRoute,
  RailLine,
  RailwayKind,
  StationGroup,
  TransitDataset,
} from '@rail-kit/engine';
import {
  MINIMALIST_PALETTE,
  createFallbackMinimalistStyle,
  fetchRemoteMinimalistStyle,
} from '../style/minimalistMapStyle';

export interface RailMapController {
  zoomIn: (options?: { duration?: number }) => unknown;
  zoomOut: (options?: { duration?: number }) => unknown;
  easeTo: (options: {
    center: [number, number];
    zoom: number;
    padding?: MapFitPadding;
    duration?: number;
  }) => unknown;
}

export interface CustomMapMarker {
  id: string;
  coord: [number, number];
  render: () => React.ReactNode;
  onClick?: () => void;
}

export interface MapFitPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface RailMapCanvasProps {
  dataset: TransitDataset;
  originId?: string | null;
  destinationId?: string | null;
  activeLineIds?: ReadonlySet<string>;
  activeRoute?: ComputedRoute | null;
  visibleOperators?: ReadonlySet<string>;
  visibleLineIds?: ReadonlySet<string>;
  initialCenter?: [number, number];
  initialZoom?: number;
  fitPadding?: MapFitPadding;
  /** Optional custom markers slot for overlays such as restaurants or cafes */
  customMarkers?: CustomMapMarker[];
  /** Optional custom badge slot rendered next to station pins */
  renderStationBadge?: (station: StationGroup) => React.ReactNode;
  onStationSelect?: (station: StationGroup, connectedLines: RailLine[]) => void;
  onMapBackgroundClick?: () => void;
  onMapReady?: (map: RailMapController) => void;
}

interface MarkerPortalEntry {
  id: string;
  element: HTMLDivElement;
  content: React.ReactNode;
}

type StationMarkerShape = 'circle' | 'square' | 'diamond' | 'shinkansen';

const SOURCE_LINES = 'rail-lines-source';
const SOURCE_STATIONS = 'rail-stations-source';
const SOURCE_ROUTE = 'rail-active-route-source';

const LAYER_LINES_GLOW = 'rail-lines-glow';
const LAYER_LINES_SHINKANSEN_CASING = 'rail-lines-shinkansen-casing';
const LAYER_LINES_MAIN = 'rail-lines-main';
const LAYER_LINES_SHINKANSEN_BED = 'rail-lines-shinkansen-bed';
const LAYER_LINES_SHINKANSEN_DASH = 'rail-lines-shinkansen-dash';
const LAYER_LINES_JR_TIES = 'rail-lines-jr-ties';
const LAYER_LINES_PRIVATE_INNER = 'rail-lines-private-inner';
const LAYER_LINES_MONORAIL_DOTS = 'rail-lines-monorail-dots';
const LAYER_ROUTE_CASING = 'rail-active-route-casing';
const LAYER_ROUTE_MAIN = 'rail-active-route-main';
const LAYER_STATIONS_HIT = 'rail-stations-hit';
const LAYER_STATIONS_CIRCLE = 'rail-stations-circle';
const LAYER_STATIONS_SHINKANSEN_OUTER = 'rail-stations-shinkansen-outer';
const LAYER_STATIONS_SHINKANSEN_INNER = 'rail-stations-shinkansen-inner';
const LAYER_STATIONS_SHAPE = 'rail-stations-shape';
const LAYER_STATIONS_LABEL = 'rail-stations-label';

const DEFAULT_CENTER: [number, number] = [139.7454, 35.6812];
const DEFAULT_ZOOM = 12.2;
const DEFAULT_FIT_PADDING: MapFitPadding = { top: 80, bottom: 80, left: 80, right: 80 };
const EMPTY_CUSTOM_MARKERS: CustomMapMarker[] = [];

const BASE_LINE_WIDTH: Record<RailwayKind, { active: number; idle: number }> = {
  shinkansen: { active: 6.8, idle: 4.8 },
  jr: { active: 5.4, idle: 3.9 },
  private: { active: 5.2, idle: 3.7 },
  subway: { active: 5.2, idle: 3.6 },
  monorail: { active: 4.4, idle: 3.1 },
};

function resolveStationShape(visibleKinds: ReadonlySet<RailwayKind>): StationMarkerShape {
  // Hubs serving multiple track types unify under the standard colored-ring circle
  if (visibleKinds.size > 1) return 'circle';
  const soleKind = visibleKinds.values().next().value as RailwayKind | undefined;
  if (soleKind === 'shinkansen') return 'shinkansen';
  if (soleKind === 'jr' || soleKind === 'private') return 'square';
  if (soleKind === 'monorail') return 'diamond';
  return 'circle';
}

function createStationShapeImage(
  shape: 'square' | 'diamond',
  color: string,
  isMajorHub: boolean
): ImageData | { width: number; height: number; data: Uint8ClampedArray } {
  const size = 40;
  if (typeof document === 'undefined') {
    return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) };
  }

  const center = size / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = color;
  ctx.lineWidth = isMajorHub ? 5.6 : 4.2;
  ctx.lineJoin = 'round';

  if (shape === 'square') {
    const box = isMajorHub ? 24 : 18;
    const x = center - box / 2;
    const y = center - box / 2;
    const r = 4;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + box, y, x + box, y + box, r);
    ctx.arcTo(x + box, y + box, x, y + box, r);
    ctx.arcTo(x, y + box, x, y, r);
    ctx.arcTo(x, y, x + box, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    const radius = isMajorHub ? 13 : 10;
    ctx.beginPath();
    ctx.moveTo(center, center - radius);
    ctx.lineTo(center + radius, center);
    ctx.lineTo(center, center + radius);
    ctx.lineTo(center - radius, center);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Reusable, data-driven MapLibre canvas rendering transit lines, station codes,
 * active route highlights, and plugin slots for custom map overlays.
 */
export function RailMapCanvas({
  dataset,
  originId = null,
  destinationId = null,
  activeLineIds,
  activeRoute = null,
  visibleOperators,
  visibleLineIds,
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  fitPadding = DEFAULT_FIT_PADDING,
  customMarkers = EMPTY_CUSTOM_MARKERS,
  renderStationBadge,
  onStationSelect,
  onMapBackgroundClick,
  onMapReady,
}: RailMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [portalEntries, setPortalEntries] = useState<MarkerPortalEntry[]>([]);

  const onStationSelectRef = useRef(onStationSelect);
  onStationSelectRef.current = onStationSelect;
  const onBackgroundClickRef = useRef(onMapBackgroundClick);
  onBackgroundClickRef.current = onMapBackgroundClick;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const visibleOperatorsRef = useRef(visibleOperators);
  visibleOperatorsRef.current = visibleOperators;
  const visibleLineIdsRef = useRef(visibleLineIds);
  visibleLineIdsRef.current = visibleLineIds;

  const linesGeoJsonRef = useRef<GeoJSON.FeatureCollection<GeoJSON.LineString>>({
    type: 'FeatureCollection',
    features: [],
  });
  const activeRouteGeoJsonRef = useRef<GeoJSON.FeatureCollection<GeoJSON.LineString>>({
    type: 'FeatureCollection',
    features: [],
  });
  const stationsGeoJsonRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>({
    type: 'FeatureCollection',
    features: [],
  });

  const lineById = useMemo(
    () => new Map(dataset.lines.map((line) => [line.id, line])),
    [dataset.lines]
  );

  const stationById = useMemo(
    () => new Map(dataset.stations.map((station) => [station.id, station])),
    [dataset.stations]
  );

  // Derive the set of lines that should glow based on station selection or active route
  const effectiveActiveLineIds = useMemo(() => {
    if (activeRoute) {
      return new Set(activeRoute.legs.map((leg) => leg.lineId));
    }
    if (activeLineIds && activeLineIds.size > 0) {
      return activeLineIds;
    }
    return null;
  }, [activeRoute, activeLineIds]);

  const linesGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => {
    const hasSelection = effectiveActiveLineIds !== null;

    interface VisibleSegmentEntry {
      seg: (typeof dataset.segments)[number];
      line: NonNullable<ReturnType<typeof lineById.get>>;
      from: NonNullable<ReturnType<typeof stationById.get>>;
      to: NonNullable<ReturnType<typeof stationById.get>>;
      isCanonicalForward: boolean;
    }

    const pairGroups = new Map<string, VisibleSegmentEntry[]>();
    for (const seg of dataset.segments) {
      const line = lineById.get(seg.lineId);
      if (!line) continue;
      if (visibleOperators && !visibleOperators.has(line.operatorId)) continue;
      if (visibleLineIds && !visibleLineIds.has(line.id)) continue;

      const from = stationById.get(seg.fromStationId);
      const to = stationById.get(seg.toStationId);
      if (!from || !to) continue;

      const isCanonicalForward = seg.fromStationId < seg.toStationId;
      const pairKey = isCanonicalForward
        ? `${seg.fromStationId}::${seg.toStationId}`
        : `${seg.toStationId}::${seg.fromStationId}`;
      let group = pairGroups.get(pairKey);
      if (!group) {
        group = [];
        pairGroups.set(pairKey, group);
      }
      group.push({ seg, line, from, to, isCanonicalForward });
    }

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const group of pairGroups.values()) {
      group.sort((a, b) => a.line.id.localeCompare(b.line.id));
      const count = group.length;
      for (let idx = 0; idx < count; idx++) {
        const { seg, line, from, to, isCanonicalForward } = group[idx];
        const rawSlot = count > 1 ? idx - (count - 1) / 2 : 0;
        // Flip sign for reversed station pairs so MapLibre line-offset stays consistent on shared corridors
        const offsetSlot = isCanonicalForward ? rawSlot : -rawSlot;

        const railwayKind: RailwayKind = line.railwayKind ?? 'subway';
        const isActive = hasSelection ? effectiveActiveLineIds.has(line.id) : false;
        const opacity = hasSelection ? (isActive ? 0.96 : 0.14) : 0.82;
        const baseWidths = BASE_LINE_WIDTH[railwayKind];
        const width = hasSelection
          ? isActive
            ? baseWidths.active
            : 2.4
          : baseWidths.idle;

        features.push({
          type: 'Feature',
          properties: {
            lineId: line.id,
            color: line.color,
            railwayKind,
            opacity,
            width,
            isActive: isActive ? 1 : 0,
            offsetSlot,
          },
          geometry: {
            type: 'LineString',
            coordinates: [from.coord, ...(seg.viaCoords ?? []), to.coord],
          },
        });
      }
    }

    return { type: 'FeatureCollection', features };
  }, [
    dataset.segments,
    effectiveActiveLineIds,
    lineById,
    stationById,
    visibleLineIds,
    visibleOperators,
  ]);

  const activeRouteGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => {
    if (!activeRoute) {
      return { type: 'FeatureCollection', features: [] };
    }

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = activeRoute.legs.map((leg) => ({
      type: 'Feature',
      properties: {
        lineId: leg.lineId,
        color: lineById.get(leg.lineId)?.color ?? '#2563eb',
      },
      geometry: {
        type: 'LineString',
        coordinates: leg.coordinates,
      },
    }));

    return { type: 'FeatureCollection', features };
  }, [activeRoute, lineById]);

  const stationsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    const hasSelection = effectiveActiveLineIds !== null;
    const routeStationIds = new Set<string>();
    const routeStationCode = new Map<string, string>();

    if (activeRoute) {
      for (const leg of activeRoute.legs) {
        for (const sid of leg.stopStationIds) {
          routeStationIds.add(sid);
          const st = stationById.get(sid);
          const code = st?.platforms.find((p) => p.lineId === leg.lineId)?.code;
          if (code && !routeStationCode.has(sid)) {
            routeStationCode.set(sid, code);
          }
        }
      }
    }

    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

    for (const station of dataset.stations) {
      const visiblePlatforms = station.platforms.filter((p) => {
        const line = lineById.get(p.lineId);
        if (!line) return false;
        if (visibleOperators && !visibleOperators.has(line.operatorId)) return false;
        if (visibleLineIds && !visibleLineIds.has(line.id)) return false;
        return true;
      });
      if (visiblePlatforms.length === 0) continue;

      const visibleKinds = new Set<RailwayKind>();
      for (const p of visiblePlatforms) {
        const kind = lineById.get(p.lineId)?.railwayKind ?? 'subway';
        visibleKinds.add(kind);
      }
      const markerShape = resolveStationShape(visibleKinds);

      const primaryPlatform =
        visiblePlatforms.find((p) => effectiveActiveLineIds?.has(p.lineId)) ??
        visiblePlatforms[0];
      const primaryColor = lineById.get(primaryPlatform.lineId)?.color ?? '#334155';

      const isSelectedEndpoint = station.id === originId || station.id === destinationId;
      const isOnActiveLine = visiblePlatforms.some((p) =>
        effectiveActiveLineIds?.has(p.lineId)
      );
      const isOnRoute = routeStationIds.has(station.id);

      let opacity = 1;
      if (hasSelection && !isSelectedEndpoint) {
        opacity = activeRoute ? (isOnRoute ? 1 : 0.28) : isOnActiveLine ? 1 : 0.28;
      }

      const code = routeStationCode.get(station.id) ?? primaryPlatform.code;
      const label = `${code} ${station.name}`;

      features.push({
        type: 'Feature',
        id: station.id,
        properties: {
          stationId: station.id,
          label,
          primaryColor,
          markerShape,
          opacity,
          isMajorHub: station.isMajorHub ? 1 : 0,
          isSelected: isSelectedEndpoint ? 1 : 0,
          sortKey: isSelectedEndpoint ? 1 : station.isMajorHub ? 2 : 5,
        },
        geometry: {
          type: 'Point',
          coordinates: station.coord,
        },
      });
    }

    return { type: 'FeatureCollection', features };
  }, [
    activeRoute,
    dataset.stations,
    destinationId,
    effectiveActiveLineIds,
    lineById,
    originId,
    stationById,
    visibleLineIds,
    visibleOperators,
  ]);

  linesGeoJsonRef.current = linesGeoJson;
  activeRouteGeoJsonRef.current = activeRouteGeoJson;
  stationsGeoJsonRef.current = stationsGeoJson;

  // Initialize MapLibre instance and load the warm-silver minimalist style
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let map: maplibregl.Map;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: createFallbackMinimalistStyle(),
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 9.5,
        maxZoom: 16.5,
        attributionControl: false,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    mapRef.current = map;
    map.on('error', () => {
      // Prevent unhandled MapLibre tile/glyph/style errors from surfacing as uncaught exceptions
    });

    map.on('styleimagemissing', (event) => {
      const match = /^station-(square|diamond)-(#?[0-9a-fA-F]+)-(hub|std)$/.exec(event.id);
      if (!match) return;
      const [, shape, color, tier] = match;
      try {
        if (!map.hasImage(event.id)) {
          map.addImage(
            event.id,
            createStationShapeImage(shape as 'square' | 'diamond', color, tier === 'hub'),
            { pixelRatio: 2 }
          );
        }
      } catch {
        // Ignore transient style state race while registering custom station icons
      }
    });

    try {
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-left'
      );
    } catch {
      // Non-fatal if attribution control fails during early teardown
    }

    const scaledLineWidth = (multiplier = 1) =>
      [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        ['*', ['get', 'width'], 0.72 * multiplier],
        13,
        ['*', ['get', 'width'], multiplier],
        15,
        ['*', ['get', 'width'], 1.3 * multiplier],
      ] as maplibregl.ExpressionSpecification;

    const scaledLineOffset = () =>
      [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        ['*', ['get', 'offsetSlot'], 1.8],
        13,
        ['*', ['get', 'offsetSlot'], 3.2],
        15,
        ['*', ['get', 'offsetSlot'], 4.6],
      ] as maplibregl.ExpressionSpecification;

    const ensureTransitLayers = () => {
      if (disposed || !map.getStyle()) return;

      try {
        if (!map.getSource(SOURCE_LINES)) {
          map.addSource(SOURCE_LINES, { type: 'geojson', data: linesGeoJsonRef.current });
        }
        if (!map.getSource(SOURCE_ROUTE)) {
          map.addSource(SOURCE_ROUTE, { type: 'geojson', data: activeRouteGeoJsonRef.current });
        }
        if (!map.getSource(SOURCE_STATIONS)) {
          map.addSource(SOURCE_STATIONS, { type: 'geojson', data: stationsGeoJsonRef.current });
        }

        if (!map.getLayer(LAYER_LINES_GLOW)) {
          map.addLayer({
            id: LAYER_LINES_GLOW,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['==', ['get', 'isActive'], 1],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 12,
              'line-blur': 6,
              'line-opacity': 0.42,
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_LINES_SHINKANSEN_CASING)) {
          map.addLayer({
            id: LAYER_LINES_SHINKANSEN_CASING,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['==', ['get', 'railwayKind'], 'shinkansen'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': scaledLineWidth(1.32),
              'line-opacity': ['get', 'opacity'],
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_LINES_MAIN)) {
          map.addLayer({
            id: LAYER_LINES_MAIN,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['!=', ['get', 'railwayKind'], 'shinkansen'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': scaledLineWidth(1),
              'line-opacity': ['get', 'opacity'],
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_LINES_SHINKANSEN_BED)) {
          map.addLayer({
            id: LAYER_LINES_SHINKANSEN_BED,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['==', ['get', 'railwayKind'], 'shinkansen'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': scaledLineWidth(0.72),
              'line-opacity': ['get', 'opacity'],
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_LINES_SHINKANSEN_DASH)) {
          map.addLayer({
            id: LAYER_LINES_SHINKANSEN_DASH,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['==', ['get', 'railwayKind'], 'shinkansen'],
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': scaledLineWidth(0.52),
              'line-dasharray': [3, 2.2],
              'line-opacity': ['get', 'opacity'],
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_LINES_JR_TIES)) {
          map.addLayer({
            id: LAYER_LINES_JR_TIES,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['==', ['get', 'railwayKind'], 'jr'],
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': scaledLineWidth(0.36),
              'line-dasharray': [1.6, 1.8],
              'line-opacity': ['get', 'opacity'],
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_LINES_PRIVATE_INNER)) {
          map.addLayer({
            id: LAYER_LINES_PRIVATE_INNER,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['==', ['get', 'railwayKind'], 'private'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': scaledLineWidth(0.3),
              'line-opacity': ['get', 'opacity'],
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_LINES_MONORAIL_DOTS)) {
          map.addLayer({
            id: LAYER_LINES_MONORAIL_DOTS,
            type: 'line',
            source: SOURCE_LINES,
            filter: ['==', ['get', 'railwayKind'], 'monorail'],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': scaledLineWidth(0.44),
              'line-dasharray': [0.2, 1.8],
              'line-opacity': ['get', 'opacity'],
              'line-offset': scaledLineOffset(),
            },
          });
        }

        if (!map.getLayer(LAYER_ROUTE_CASING)) {
          map.addLayer({
            id: LAYER_ROUTE_CASING,
            type: 'line',
            source: SOURCE_ROUTE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#ffffff',
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 13, 10, 15, 13],
              'line-opacity': 0.92,
            },
          });
        }

        if (!map.getLayer(LAYER_ROUTE_MAIN)) {
          map.addLayer({
            id: LAYER_ROUTE_MAIN,
            type: 'line',
            source: SOURCE_ROUTE,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 13, 6.2, 15, 8],
              'line-opacity': 1,
            },
          });
        }

        if (!map.getLayer(LAYER_STATIONS_HIT)) {
          map.addLayer({
            id: LAYER_STATIONS_HIT,
            type: 'circle',
            source: SOURCE_STATIONS,
            paint: {
              'circle-radius': 18,
              'circle-color': '#000000',
              'circle-opacity': 0,
            },
          });
        }

        if (!map.getLayer(LAYER_STATIONS_CIRCLE)) {
          map.addLayer({
            id: LAYER_STATIONS_CIRCLE,
            type: 'circle',
            source: SOURCE_STATIONS,
            filter: ['==', ['get', 'markerShape'], 'circle'],
            paint: {
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10.5,
                ['case', ['==', ['get', 'isMajorHub'], 1], 4.5, 3],
                13,
                ['case', ['==', ['get', 'isMajorHub'], 1], 6.5, 4.8],
                15.5,
                ['case', ['==', ['get', 'isMajorHub'], 1], 8, 6],
              ],
              'circle-color': '#FFFFFF',
              'circle-stroke-color': ['get', 'primaryColor'],
              'circle-stroke-width': ['case', ['==', ['get', 'isMajorHub'], 1], 3, 2.2],
              'circle-opacity': ['get', 'opacity'],
              'circle-stroke-opacity': ['get', 'opacity'],
            },
          });
        }

        if (!map.getLayer(LAYER_STATIONS_SHINKANSEN_OUTER)) {
          map.addLayer({
            id: LAYER_STATIONS_SHINKANSEN_OUTER,
            type: 'circle',
            source: SOURCE_STATIONS,
            filter: ['==', ['get', 'markerShape'], 'shinkansen'],
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10.5, 6, 13, 8, 15.5, 9.5],
              'circle-color': '#FFFFFF',
              'circle-stroke-color': ['get', 'primaryColor'],
              'circle-stroke-width': 2.8,
              'circle-opacity': ['get', 'opacity'],
              'circle-stroke-opacity': ['get', 'opacity'],
            },
          });
        }

        if (!map.getLayer(LAYER_STATIONS_SHINKANSEN_INNER)) {
          map.addLayer({
            id: LAYER_STATIONS_SHINKANSEN_INNER,
            type: 'circle',
            source: SOURCE_STATIONS,
            filter: ['==', ['get', 'markerShape'], 'shinkansen'],
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10.5, 2.6, 13, 3.6, 15.5, 4.4],
              'circle-color': ['get', 'primaryColor'],
              'circle-opacity': ['get', 'opacity'],
            },
          });
        }

        if (!map.getLayer(LAYER_STATIONS_SHAPE)) {
          map.addLayer({
            id: LAYER_STATIONS_SHAPE,
            type: 'symbol',
            source: SOURCE_STATIONS,
            filter: ['in', ['get', 'markerShape'], ['literal', ['square', 'diamond']]],
            layout: {
              'icon-image': [
                'concat',
                'station-',
                ['get', 'markerShape'],
                '-',
                ['get', 'primaryColor'],
                '-',
                ['case', ['==', ['get', 'isMajorHub'], 1], 'hub', 'std'],
              ],
              'icon-size': ['interpolate', ['linear'], ['zoom'], 10.5, 0.72, 13, 1.0, 15.5, 1.22],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: {
              'icon-opacity': ['get', 'opacity'],
            },
          });
        }

        if (!map.getLayer(LAYER_STATIONS_LABEL)) {
          map.addLayer({
            id: LAYER_STATIONS_LABEL,
            type: 'symbol',
            source: SOURCE_STATIONS,
            filter: ['==', ['get', 'isSelected'], 0],
            layout: {
              'text-field': ['get', 'label'],
              'text-font': ['Noto Sans Regular'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 13.5, 12],
              'text-offset': [0, 1.15],
              'text-anchor': 'top',
              'symbol-sort-key': ['get', 'sortKey'],
              'text-padding': 4,
            },
            paint: {
              'text-color': '#1E293B',
              'text-halo-color': '#FFFFFF',
              'text-halo-width': 2.2,
              'text-opacity': ['get', 'opacity'],
            },
          });
        }

        setStyleLoaded(true);
      } catch {
        // Ignore transient style state transitions during style swaps
      }
    };

    map.on('style.load', ensureTransitLayers);
    map.on('styledata', () => {
      if (!disposed && map.isStyleLoaded() && !map.getSource(SOURCE_LINES)) {
        ensureTransitLayers();
      }
    });
    map.on('load', () => {
      ensureTransitLayers();
      onMapReadyRef.current?.(map);
    });

    map.on('mouseenter', LAYER_STATIONS_HIT, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LAYER_STATIONS_HIT, () => {
      map.getCanvas().style.cursor = '';
    });

    map.on('click', (event) => {
      if (!map.getLayer(LAYER_STATIONS_HIT)) {
        onBackgroundClickRef.current?.();
        return;
      }
      const features = map.queryRenderedFeatures(event.point, {
        layers: [LAYER_STATIONS_HIT],
      });
      const hit = features[0];
      const stationId = hit?.properties?.stationId as string | undefined;
      if (stationId) {
        const station = stationById.get(stationId);
        if (station) {
          const ops = visibleOperatorsRef.current;
          const allowedLines = visibleLineIdsRef.current;
          const connectedLines = station.platforms
            .map((p) => lineById.get(p.lineId))
            .filter(
              (l): l is RailLine =>
                l !== undefined &&
                (!ops || ops.has(l.operatorId)) &&
                (!allowedLines || allowedLines.has(l.id))
            );
          onStationSelectRef.current?.(station, connectedLines);
          return;
        }
      }
      onBackgroundClickRef.current?.();
    });

    fetchRemoteMinimalistStyle().then((remoteStyle) => {
      if (disposed || !remoteStyle) return;
      setStyleLoaded(false);
      try {
        map.setStyle(remoteStyle, { diff: false });
      } catch {
        ensureTransitLayers();
      }
    });

    return () => {
      disposed = true;
      mapRef.current = null;
      try {
        map.remove();
      } catch {
        // Ignore StrictMode teardown race conditions
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push GeoJSON updates when state or filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded || webglFailed) return;

    const lineSource = map.getSource(SOURCE_LINES) as maplibregl.GeoJSONSource | undefined;
    lineSource?.setData(linesGeoJson);

    const routeSource = map.getSource(SOURCE_ROUTE) as maplibregl.GeoJSONSource | undefined;
    routeSource?.setData(activeRouteGeoJson);

    const stationSource = map.getSource(SOURCE_STATIONS) as maplibregl.GeoJSONSource | undefined;
    stationSource?.setData(stationsGeoJson);
  }, [styleLoaded, webglFailed, linesGeoJson, activeRouteGeoJson, stationsGeoJson]);

  // Smoothly frame the selected origin & destination route within visible viewport padding
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !originId || webglFailed) return;

    const origin = stationById.get(originId);
    if (!origin) return;

    if (!destinationId) {
      map.easeTo({
        center: origin.coord,
        zoom: Math.max(map.getZoom(), 12.6),
        padding: fitPadding,
        duration: 550,
      });
      return;
    }

    const destination = stationById.get(destinationId);
    if (!destination) return;

    const bounds = new maplibregl.LngLatBounds(origin.coord, origin.coord);
    bounds.extend(destination.coord);
    if (activeRoute) {
      for (const leg of activeRoute.legs) {
        for (const coord of leg.coordinates) {
          bounds.extend(coord);
        }
      }
    }

    map.fitBounds(bounds, {
      padding: fitPadding,
      maxZoom: 14.2,
      duration: 650,
    });
  }, [originId, destinationId, activeRoute, fitPadding, stationById, webglFailed]);

  // Manage React-rendered MapLibre Markers for selected endpoints, transfer hubs, and custom slots
  useEffect(() => {
    const map = mapRef.current;
    if (!map || webglFailed) return;

    const markers: maplibregl.Marker[] = [];
    const entries: MarkerPortalEntry[] = [];

    const addMarker = (
      id: string,
      coord: [number, number],
      content: React.ReactNode,
      zIndex = 10,
      onClick?: () => void
    ) => {
      const el = document.createElement('div');
      el.style.zIndex = String(zIndex);
      if (onClick) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick();
        });
      }
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coord)
        .addTo(map);
      markers.push(marker);
      entries.push({ id, element: el, content });
    };

    const getStationBadgeCode = (station: StationGroup): string => {
      if (activeRoute) {
        for (const leg of activeRoute.legs) {
          const matched = station.platforms.find((p) => p.lineId === leg.lineId);
          if (matched) return matched.code;
        }
      }
      return station.platforms[0]?.code ?? '';
    };

    if (originId) {
      const origin = stationById.get(originId);
      if (origin) {
        const code = getStationBadgeCode(origin);
        addMarker(
          `origin-${origin.id}`,
          origin.coord,
          <div className="relative w-5 h-5 flex items-center justify-center pointer-events-none">
            <div className="w-5 h-5 rounded-full bg-blue-600 border-[3px] border-white ring-4 ring-blue-500/25 shadow-md" />
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-md whitespace-nowrap flex items-center gap-1">
              <span className="opacity-90 font-mono">{code}</span>
              <span>{origin.name}</span>
            </div>
          </div>,
          30
        );
      }
    }

    if (destinationId) {
      const dest = stationById.get(destinationId);
      if (dest) {
        const code = getStationBadgeCode(dest);
        addMarker(
          `dest-${dest.id}`,
          dest.coord,
          <div className="relative w-5 h-5 flex items-center justify-center pointer-events-none">
            <div className="w-5 h-5 rounded-full bg-orange-600 border-[3px] border-white ring-4 ring-orange-500/25 shadow-md" />
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-orange-600 text-white text-xs font-bold shadow-md whitespace-nowrap flex items-center gap-1">
              <span className="opacity-90 font-mono">{code}</span>
              <span>{dest.name}</span>
            </div>
          </div>,
          30
        );
      }
    }

    if (activeRoute) {
      for (const transfer of activeRoute.transfers) {
        const st = stationById.get(transfer.fromStationId);
        if (!st) continue;
        addMarker(
          `transfer-${transfer.fromStationId}-${transfer.toLineId}`,
          st.coord,
          <div className="relative w-4 h-4 flex items-center justify-center pointer-events-none">
            <div className="w-4 h-4 rounded-full bg-white border-[3px] border-slate-800 shadow" />
            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900/90 text-white text-xs font-semibold shadow whitespace-nowrap">
              {st.name} · {transfer.walkMinutes}m
            </div>
          </div>,
          25
        );
      }
    }

    if (renderStationBadge) {
      for (const station of dataset.stations) {
        const badgeNode = renderStationBadge(station);
        if (!badgeNode) continue;
        addMarker(
          `badge-${station.id}`,
          station.coord,
          <div className="pointer-events-none -translate-y-4 translate-x-4">{badgeNode}</div>,
          15
        );
      }
    }

    for (const custom of customMarkers) {
      addMarker(`custom-${custom.id}`, custom.coord, custom.render(), 20, custom.onClick);
    }

    setPortalEntries((prev) =>
      prev.length === 0 && entries.length === 0 ? prev : entries
    );

    return () => {
      for (const marker of markers) {
        try {
          marker.remove();
        } catch {
          // Ignore teardown race when map is already removed
        }
      }
    };
  }, [
    originId,
    destinationId,
    activeRoute,
    customMarkers,
    renderStationBadge,
    dataset.stations,
    stationById,
    webglFailed,
  ]);

  if (webglFailed) {
    return (
      <SvgFallbackCanvas
        dataset={dataset}
        linesGeoJson={linesGeoJson}
        activeRouteGeoJson={activeRouteGeoJson}
        stationsGeoJson={stationsGeoJson}
        originId={originId}
        destinationId={destinationId}
        activeRoute={activeRoute}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        fitPadding={fitPadding}
        visibleOperators={visibleOperators}
        visibleLineIds={visibleLineIds}
        customMarkers={customMarkers}
        renderStationBadge={renderStationBadge}
        lineById={lineById}
        stationById={stationById}
        onStationSelect={onStationSelect}
        onMapBackgroundClick={onMapBackgroundClick}
        onMapReady={onMapReady}
      />
    );
  }

  return (
    <div
      className="relative z-0 isolate w-full h-full"
      style={{ position: 'relative', zIndex: 0, isolation: 'isolate', width: '100%', height: '100%' }}
    >
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {portalEntries.map((entry) => createPortal(entry.content, entry.element, entry.id))}
    </div>
  );
}

interface SvgFallbackCanvasProps {
  dataset: TransitDataset;
  linesGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  activeRouteGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  stationsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point>;
  originId: string | null;
  destinationId: string | null;
  activeRoute: ComputedRoute | null;
  initialCenter: [number, number];
  initialZoom: number;
  fitPadding: MapFitPadding;
  visibleOperators?: ReadonlySet<string>;
  visibleLineIds?: ReadonlySet<string>;
  customMarkers: CustomMapMarker[];
  renderStationBadge?: (station: StationGroup) => React.ReactNode;
  lineById: Map<string, RailLine>;
  stationById: Map<string, StationGroup>;
  onStationSelect?: (station: StationGroup, connectedLines: RailLine[]) => void;
  onMapBackgroundClick?: () => void;
  onMapReady?: (map: RailMapController) => void;
}

const SVG_BASE_PIXELS_PER_DEG_LAT = 4200;

/**
 * Interactive 2D SVG vector fallback map rendered automatically when WebGL is unavailable,
 * preserving full station selection, line highlighting, pan/zoom, and plugin marker support.
 */
function renderSvgTrackPaths(
  keyPrefix: string,
  d: string,
  kind: string,
  color: string,
  width: number,
  opacity: number
): React.ReactNode {
  const layers: Array<{
    stroke: string;
    strokeWidth: number;
    dash?: string;
    cap: 'round' | 'butt';
  }> =
    kind === 'shinkansen'
      ? [
          { stroke: color, strokeWidth: width * 1.5, cap: 'round' },
          { stroke: '#FFFFFF', strokeWidth: width * 0.92, cap: 'round' },
          { stroke: color, strokeWidth: width * 0.52, dash: '12 8', cap: 'butt' },
        ]
      : kind === 'jr'
        ? [
            { stroke: color, strokeWidth: width, cap: 'round' },
            { stroke: '#FFFFFF', strokeWidth: Math.max(1.4, width * 0.44), dash: '6 6', cap: 'butt' },
          ]
        : kind === 'private'
          ? [
              { stroke: color, strokeWidth: width, cap: 'round' },
              { stroke: '#FFFFFF', strokeWidth: Math.max(1.1, width * 0.32), cap: 'round' },
            ]
          : kind === 'monorail'
            ? [
                { stroke: color, strokeWidth: width, cap: 'round' },
                { stroke: '#FFFFFF', strokeWidth: Math.max(1.4, width * 0.44), dash: '1.5 6', cap: 'round' },
              ]
            : [{ stroke: color, strokeWidth: width, cap: 'round' }];

  return (
    <g key={keyPrefix} opacity={opacity}>
      {layers.map((layer, layerIdx) => (
        <path
          key={layerIdx}
          d={d}
          fill="none"
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
          strokeDasharray={layer.dash}
          strokeLinecap={layer.cap}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

function renderSvgStationShape(
  shape: string,
  radius: number,
  strokeWidth: number,
  primaryColor: string
): React.ReactNode {
  if (shape === 'square') {
    const half = radius * 0.96;
    return (
      <rect
        x={-half}
        y={-half}
        width={half * 2}
        height={half * 2}
        rx={2.2}
        fill="#FFFFFF"
        stroke={primaryColor}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (shape === 'diamond') {
    const diag = radius * 1.24;
    return (
      <polygon
        points={`0,${-diag} ${diag},0 0,${diag} ${-diag},0`}
        fill="#FFFFFF"
        stroke={primaryColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    );
  }

  if (shape === 'shinkansen') {
    return (
      <>
        <circle
          r={radius * 1.3}
          fill="#FFFFFF"
          stroke={primaryColor}
          strokeWidth={Math.max(2, strokeWidth * 0.85)}
        />
        <circle
          r={radius * 0.62}
          fill="#FFFFFF"
          stroke={primaryColor}
          strokeWidth={1.8}
        />
      </>
    );
  }

  return (
    <circle
      r={radius}
      fill="#FFFFFF"
      stroke={primaryColor}
      strokeWidth={strokeWidth}
    />
  );
}

function SvgFallbackCanvas({
  dataset,
  linesGeoJson,
  activeRouteGeoJson,
  stationsGeoJson,
  originId,
  destinationId,
  activeRoute,
  initialCenter,
  initialZoom,
  fitPadding,
  visibleOperators,
  visibleLineIds,
  customMarkers,
  renderStationBadge,
  lineById,
  stationById,
  onStationSelect,
  onMapBackgroundClick,
  onMapReady,
}: SvgFallbackCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({
    center: initialCenter,
    zoom: initialZoom,
  });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startCenter: [number, number];
    moved: boolean;
  } | null>(null);

  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  const cosLat = Math.cos((initialCenter[1] * Math.PI) / 180);
  const scale = SVG_BASE_PIXELS_PER_DEG_LAT * Math.pow(2, view.zoom - 12);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Expose compatible controller methods to parent zoom/reset buttons
  useEffect(() => {
    const controller: RailMapController = {
      zoomIn: () => {
        setView((prev) => ({
          ...prev,
          zoom: Math.min(16.5, prev.zoom + 0.65),
        }));
      },
      zoomOut: () => {
        setView((prev) => ({
          ...prev,
          zoom: Math.max(9.5, prev.zoom - 0.65),
        }));
      },
      easeTo: ({ center, zoom, padding }) => {
        const clampedZoom = Math.min(16.5, Math.max(9.5, zoom));
        const targetScale = SVG_BASE_PIXELS_PER_DEG_LAT * Math.pow(2, clampedZoom - 12);
        const pad = padding ?? { top: 0, bottom: 0, left: 0, right: 0 };
        const offsetX = (pad.left - pad.right) / 2;
        const offsetY = (pad.top - pad.bottom) / 2;
        setView({
          zoom: clampedZoom,
          center: [
            center[0] - offsetX / (cosLat * targetScale),
            center[1] + offsetY / targetScale,
          ],
        });
      },
    };
    onMapReadyRef.current?.(controller);
  }, [cosLat]);

  // Auto-frame selected origin/destination within fitPadding
  useEffect(() => {
    if (!originId) return;
    const origin = stationById.get(originId);
    if (!origin) return;

    const offsetX = (fitPadding.left - fitPadding.right) / 2;
    const offsetY = (fitPadding.top - fitPadding.bottom) / 2;

    if (!destinationId) {
      setView((prev) => {
        const nextZoom = Math.max(prev.zoom, 12.6);
        const nextScale = SVG_BASE_PIXELS_PER_DEG_LAT * Math.pow(2, nextZoom - 12);
        return {
          zoom: nextZoom,
          center: [
            origin.coord[0] - offsetX / (cosLat * nextScale),
            origin.coord[1] + offsetY / nextScale,
          ],
        };
      });
      return;
    }

    const destination = stationById.get(destinationId);
    if (!destination) return;

    const coords: [number, number][] = [origin.coord, destination.coord];
    if (activeRoute) {
      for (const leg of activeRoute.legs) {
        coords.push(...leg.coordinates);
      }
    }

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const availW = Math.max(180, size.width - fitPadding.left - fitPadding.right);
    const availH = Math.max(180, size.height - fitPadding.top - fitPadding.bottom);
    const spanX = Math.max(0.01, (maxLng - minLng) * cosLat);
    const spanY = Math.max(0.01, maxLat - minLat);
    const neededScale = Math.min(availW / spanX, availH / spanY) * 0.82;
    const nextZoom = Math.min(
      14.2,
      Math.max(10.5, 12 + Math.log2(neededScale / SVG_BASE_PIXELS_PER_DEG_LAT))
    );
    const actualScale = SVG_BASE_PIXELS_PER_DEG_LAT * Math.pow(2, nextZoom - 12);
    const midLng = (minLng + maxLng) / 2;
    const midLat = (minLat + maxLat) / 2;

    setView({
      zoom: nextZoom,
      center: [
        midLng - offsetX / (cosLat * actualScale),
        midLat + offsetY / actualScale,
      ],
    });
  }, [originId, destinationId, activeRoute, fitPadding, stationById, cosLat, size.width, size.height]);

  const project = (coord: [number, number]): [number, number] => [
    size.width / 2 + (coord[0] - view.center[0]) * cosLat * scale,
    size.height / 2 - (coord[1] - view.center[1]) * scale,
  ];

  const toPathD = (coords: GeoJSON.Position[]): string =>
    coords
      .map((c, idx) => {
        const [x, y] = project([c[0], c[1]]);
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const getStationBadgeCode = (station: StationGroup): string => {
    if (activeRoute) {
      for (const leg of activeRoute.legs) {
        const matched = station.platforms.find((p) => p.lineId === leg.lineId);
        if (matched) return matched.code;
      }
    }
    return station.platforms[0]?.code ?? '';
  };

  const originStation = originId ? stationById.get(originId) ?? null : null;
  const destStation = destinationId ? stationById.get(destinationId) ?? null : null;

  return (
    <div
      ref={hostRef}
      className="relative z-0 isolate w-full h-full select-none overflow-hidden"
      style={{
        position: 'relative',
        zIndex: 0,
        isolation: 'isolate',
        width: '100%',
        height: '100%',
        backgroundColor: MINIMALIST_PALETTE.land,
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startCenter: view.center,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          drag.moved = true;
        }
        if (drag.moved) {
          setView((prev) => ({
            ...prev,
            center: [
              drag.startCenter[0] - dx / (cosLat * scale),
              drag.startCenter[1] + dy / scale,
            ],
          }));
        }
      }}
      onPointerUp={() => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag && !drag.moved) {
          onMapBackgroundClick?.();
        }
      }}
      onWheel={(e) => {
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        setView((prev) => ({
          ...prev,
          zoom: Math.min(16.5, Math.max(9.5, prev.zoom + delta)),
        }));
      }}
    >
      <svg
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="block w-full h-full"
      >
        {/* Subtle minimalist grid backdrop */}
        <defs>
          <pattern id="rail-fallback-grid" width="64" height="64" patternUnits="userSpaceOnUse">
            <path
              d="M 64 0 L 0 0 0 64"
              fill="none"
              stroke={MINIMALIST_PALETTE.roadCasing}
              strokeWidth="0.8"
              strokeOpacity="0.5"
            />
          </pattern>
        </defs>
        <rect width={size.width} height={size.height} fill={MINIMALIST_PALETTE.land} />
        <rect width={size.width} height={size.height} fill="url(#rail-fallback-grid)" />

        {/* Active line soft glow */}
        {linesGeoJson.features
          .filter((f) => f.properties?.isActive === 1)
          .map((f, idx) => (
            <path
              key={`glow-${idx}`}
              d={toPathD(f.geometry.coordinates)}
              fill="none"
              stroke={String(f.properties?.color ?? '#2563eb')}
              strokeWidth={12}
              strokeOpacity={0.28}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

        {/* Base rail network segments */}
        {linesGeoJson.features.map((f, idx) =>
          renderSvgTrackPaths(
            `seg-${idx}`,
            toPathD(f.geometry.coordinates),
            String(f.properties?.railwayKind ?? 'subway'),
            String(f.properties?.color ?? '#334155'),
            Number(f.properties?.width ?? 3.6),
            Number(f.properties?.opacity ?? 0.78)
          )
        )}

        {/* Highlighted active route casing & stroke */}
        {activeRouteGeoJson.features.map((f, idx) => (
          <path
            key={`route-casing-${idx}`}
            d={toPathD(f.geometry.coordinates)}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={10}
            strokeOpacity={0.92}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {activeRouteGeoJson.features.map((f, idx) => (
          <path
            key={`route-main-${idx}`}
            d={toPathD(f.geometry.coordinates)}
            fill="none"
            stroke={String(f.properties?.color ?? '#2563eb')}
            strokeWidth={6}
            strokeOpacity={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Interactive station nodes + [Code] Kanji labels */}
        {stationsGeoJson.features.map((f) => {
          const stationId = String(f.properties?.stationId ?? '');
          const label = String(f.properties?.label ?? '');
          const primaryColor = String(f.properties?.primaryColor ?? '#334155');
          const markerShape = String(f.properties?.markerShape ?? 'circle');
          const opacity = Number(f.properties?.opacity ?? 1);
          const isMajorHub = Number(f.properties?.isMajorHub ?? 0) === 1;
          const isSelected = Number(f.properties?.isSelected ?? 0) === 1;
          const [cx, cy] = project([f.geometry.coordinates[0], f.geometry.coordinates[1]]);
          const radius = isMajorHub ? 6.5 : 4.8;
          const strokeWidth = isMajorHub ? 3 : 2.2;
          const showLabel = !isSelected && (isMajorHub || opacity > 0.5 || view.zoom >= 12.8);

          return (
            <g
              key={stationId}
              transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)})`}
              style={{ cursor: 'pointer', opacity }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const station = stationById.get(stationId);
                if (!station) return;
                const seen = new Set<string>();
                const connectedLines = station.platforms
                  .map((p) => lineById.get(p.lineId))
                  .filter((l): l is RailLine => {
                    if (!l || seen.has(l.id)) return false;
                    if (visibleOperators && !visibleOperators.has(l.operatorId)) return false;
                    if (visibleLineIds && !visibleLineIds.has(l.id)) return false;
                    seen.add(l.id);
                    return true;
                  });
                onStationSelect?.(station, connectedLines);
              }}
            >
              <circle r={16} fill="transparent" />
              {renderSvgStationShape(markerShape, radius, strokeWidth, primaryColor)}
              {showLabel && (
                <text
                  y={radius + 13}
                  textAnchor="middle"
                  fontSize={isMajorHub ? 11 : 10}
                  fontWeight={isMajorHub ? 700 : 600}
                  fill="#1E293B"
                  stroke="#FFFFFF"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* HTML overlay layer for endpoint pills, transfer badges, and plugin slots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {originStation && (() => {
          const [x, y] = project(originStation.coord);
          const code = getStationBadgeCode(originStation);
          return (
            <div
              key={`svg-origin-${originStation.id}`}
              style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
              className="absolute z-30 w-5 h-5 flex items-center justify-center pointer-events-none"
            >
              <div className="w-5 h-5 rounded-full bg-blue-600 border-[3px] border-white ring-4 ring-blue-500/25 shadow-md" />
              <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-md whitespace-nowrap flex items-center gap-1">
                <span className="opacity-90 font-mono">{code}</span>
                <span>{originStation.name}</span>
              </div>
            </div>
          );
        })()}

        {destStation && (() => {
          const [x, y] = project(destStation.coord);
          const code = getStationBadgeCode(destStation);
          return (
            <div
              key={`svg-dest-${destStation.id}`}
              style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
              className="absolute z-30 w-5 h-5 flex items-center justify-center pointer-events-none"
            >
              <div className="w-5 h-5 rounded-full bg-orange-600 border-[3px] border-white ring-4 ring-orange-500/25 shadow-md" />
              <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-orange-600 text-white text-xs font-bold shadow-md whitespace-nowrap flex items-center gap-1">
                <span className="opacity-90 font-mono">{code}</span>
                <span>{destStation.name}</span>
              </div>
            </div>
          );
        })()}

        {activeRoute?.transfers.map((transfer) => {
          const st = stationById.get(transfer.fromStationId);
          if (!st) return null;
          const [x, y] = project(st.coord);
          return (
            <div
              key={`svg-transfer-${transfer.fromStationId}-${transfer.toLineId}`}
              style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
              className="absolute z-20 w-4 h-4 flex items-center justify-center pointer-events-none"
            >
              <div className="w-4 h-4 rounded-full bg-white border-[3px] border-slate-800 shadow" />
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900/90 text-white text-xs font-semibold shadow whitespace-nowrap">
                {st.name} · {transfer.walkMinutes}m
              </div>
            </div>
          );
        })}

        {renderStationBadge &&
          dataset.stations.map((station) => {
            const badgeNode = renderStationBadge(station);
            if (!badgeNode) return null;
            const [x, y] = project(station.coord);
            return (
              <div
                key={`svg-badge-${station.id}`}
                style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
                className="absolute z-10 pointer-events-none"
              >
                <div className="-translate-y-4 translate-x-4">{badgeNode}</div>
              </div>
            );
          })}

        {customMarkers.map((custom) => {
          const [x, y] = project(custom.coord);
          return (
            <div
              key={`svg-custom-${custom.id}`}
              style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
              className={`absolute z-20 ${custom.onClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
              onClick={(e) => {
                if (!custom.onClick) return;
                e.stopPropagation();
                custom.onClick();
              }}
            >
              {custom.render()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
