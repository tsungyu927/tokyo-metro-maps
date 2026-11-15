import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RailLine, RailwayKind } from '@rail-kit/engine';

export type LinePresetKey = 'recommended' | 'withPrivateHubs' | 'subwayOnly' | 'all';

const STORAGE_KEY = 'tokyo-rail-compass:enabled-lines:v1';
const HIDDEN_KINDS_STORAGE_KEY = 'tokyo-rail-compass:hidden-kinds:v1';

const VALID_KINDS = new Set<RailwayKind>([
  'subway',
  'jr',
  'private',
  'shinkansen',
  'monorail',
]);

/**
 * Computes the set of line IDs corresponding to a named layer preset.
 */
export function computePresetLineIds(lines: RailLine[], preset: LinePresetKey): Set<string> {
  switch (preset) {
    case 'recommended':
      return new Set(lines.filter((line) => line.defaultEnabled !== false).map((line) => line.id));
    case 'withPrivateHubs':
      return new Set(
        lines
          .filter((line) => line.defaultEnabled !== false || line.tier === 'tier2')
          .map((line) => line.id)
      );
    case 'subwayOnly':
      return new Set(
        lines
          .filter((line) => (line.railwayKind ?? 'subway') === 'subway')
          .map((line) => line.id)
      );
    case 'all':
      return new Set(lines.map((line) => line.id));
  }
}

function readStoredLineIds(lines: RailLine[], fallbackIds: Set<string>): Set<string> {
  if (typeof window === 'undefined') {
    return new Set(fallbackIds);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set(fallbackIds);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set(fallbackIds);
    }
    const validIds = new Set(lines.map((line) => line.id));
    const filtered = parsed.filter(
      (id): id is string => typeof id === 'string' && validIds.has(id)
    );
    if (parsed.length > 0 && filtered.length === 0) {
      return new Set(fallbackIds);
    }
    return new Set(filtered);
  } catch {
    return new Set(fallbackIds);
  }
}

function readStoredHiddenKinds(): Set<RailwayKind> {
  if (typeof window === 'undefined') {
    return new Set<RailwayKind>();
  }
  try {
    const raw = window.localStorage.getItem(HIDDEN_KINDS_STORAGE_KEY);
    if (!raw) {
      return new Set<RailwayKind>();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<RailwayKind>();
    }
    const filtered = parsed.filter(
      (kind): kind is RailwayKind =>
        typeof kind === 'string' && VALID_KINDS.has(kind as RailwayKind)
    );
    return new Set(filtered);
  } catch {
    return new Set<RailwayKind>();
  }
}

/**
 * Manages user-configured line selections (`configuredLineIds`) separately from temporary
 * quick-bar track-kind visibility hides (`hiddenRailwayKinds`), so toggling a track-kind
 * pill off and back on restores only the user's configured lines.
 */
export function useEnabledLines(lines: RailLine[]) {
  const defaultLineIds = useMemo(() => computePresetLineIds(lines, 'recommended'), [lines]);
  const lineById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);

  const [configuredLineIds, setConfiguredLineIds] = useState<Set<string>>(() =>
    readStoredLineIds(lines, defaultLineIds)
  );
  const [hiddenRailwayKinds, setHiddenRailwayKinds] = useState<Set<RailwayKind>>(() =>
    readStoredHiddenKinds()
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...configuredLineIds]));
    } catch {
      // Ignore storage quota or private browsing write failures.
    }
  }, [configuredLineIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HIDDEN_KINDS_STORAGE_KEY,
        JSON.stringify([...hiddenRailwayKinds])
      );
    } catch {
      // Ignore storage quota or private browsing write failures.
    }
  }, [hiddenRailwayKinds]);

  const enabledLineIds = useMemo(() => {
    if (hiddenRailwayKinds.size === 0) {
      return configuredLineIds;
    }
    const effective = new Set<string>();
    for (const id of configuredLineIds) {
      const line = lineById.get(id);
      const kind = line?.railwayKind ?? 'subway';
      if (!hiddenRailwayKinds.has(kind)) {
        effective.add(id);
      }
    }
    return effective;
  }, [configuredLineIds, hiddenRailwayKinds, lineById]);

  const toggleLine = useCallback(
    (lineId: string) => {
      const wasConfigured = configuredLineIds.has(lineId);
      setConfiguredLineIds((prev) => {
        const next = new Set(prev);
        if (next.has(lineId)) {
          next.delete(lineId);
        } else {
          next.add(lineId);
        }
        return next;
      });
      if (!wasConfigured) {
        const kind = lineById.get(lineId)?.railwayKind ?? 'subway';
        setHiddenRailwayKinds((prev) => {
          if (!prev.has(kind)) return prev;
          const next = new Set(prev);
          next.delete(kind);
          return next;
        });
      }
    },
    [configuredLineIds, lineById]
  );

  const setGroupEnabled = useCallback(
    (lineIds: string[], enabled: boolean) => {
      setConfiguredLineIds((prev) => {
        const next = new Set(prev);
        for (const id of lineIds) {
          if (enabled) {
            next.add(id);
          } else {
            next.delete(id);
          }
        }
        return next;
      });
      if (enabled && lineIds.length > 0) {
        const kindsToUnhide = new Set<RailwayKind>();
        for (const id of lineIds) {
          kindsToUnhide.add(lineById.get(id)?.railwayKind ?? 'subway');
        }
        setHiddenRailwayKinds((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const kind of kindsToUnhide) {
            if (next.delete(kind)) changed = true;
          }
          return changed ? next : prev;
        });
      }
    },
    [lineById]
  );

  const toggleRailwayKind = useCallback(
    (kind: RailwayKind) => {
      const hasConfigured = lines.some(
        (line) =>
          (line.railwayKind ?? 'subway') === kind && configuredLineIds.has(line.id)
      );
      if (!hasConfigured) return;

      setHiddenRailwayKinds((prev) => {
        const next = new Set(prev);
        if (next.has(kind)) {
          next.delete(kind);
        } else {
          next.add(kind);
        }
        return next;
      });
    },
    [lines, configuredLineIds]
  );

  const showAllConfiguredKinds = useCallback(() => {
    setHiddenRailwayKinds(new Set<RailwayKind>());
  }, []);

  const applyPreset = useCallback(
    (preset: LinePresetKey) => {
      setConfiguredLineIds(computePresetLineIds(lines, preset));
      setHiddenRailwayKinds(new Set<RailwayKind>());
    },
    [lines]
  );

  return {
    configuredLineIds,
    enabledLineIds,
    hiddenRailwayKinds,
    toggleLine,
    setGroupEnabled,
    toggleRailwayKind,
    showAllConfiguredKinds,
    applyPreset,
    defaultLineIds,
  };
}
