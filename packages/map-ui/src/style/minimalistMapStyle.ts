import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const OPENFREEMAP_POSITRON_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
export const OPENFREEMAP_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const MINIMALIST_PALETTE = {
  land: '#F2F1EC',
  water: '#BDD5E7',
  park: '#D6E5D0',
  building: '#EAE9E3',
  roadFill: '#FFFFFF',
  roadCasing: '#E2E1DC',
  labelText: '#7A8694',
  labelHalo: '#F2F1EC',
} as const;

/**
 * Synchronous fallback vector style matching the warm-silver minimalist palette
 * when fetching the remote Positron style JSON fails or times out.
 */
export function createFallbackMinimalistStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Tokyo Minimalist Warm Silver',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: OPENFREEMAP_TILEJSON_URL,
      },
    },
    glyphs: OPENFREEMAP_GLYPHS_URL,
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': MINIMALIST_PALETTE.land,
        },
      },
      {
        id: 'landuse-park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: {
          'fill-color': MINIMALIST_PALETTE.park,
          'fill-opacity': 0.85,
        },
      },
      {
        id: 'landuse-wood',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]],
        paint: {
          'fill-color': MINIMALIST_PALETTE.park,
          'fill-opacity': 0.65,
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': MINIMALIST_PALETTE.water,
        },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': MINIMALIST_PALETTE.water,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 4],
        },
      },
      {
        id: 'building-subtle',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13.5,
        paint: {
          'fill-color': MINIMALIST_PALETTE.building,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15.5, 0.45],
        },
      },
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary']]],
        paint: {
          'line-color': MINIMALIST_PALETTE.roadCasing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 15, 4],
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']],
        ],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': MINIMALIST_PALETTE.roadFill,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 3.5, 16, 6],
        },
      },
      {
        id: 'water-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        minzoom: 11,
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: {
          'text-color': MINIMALIST_PALETTE.labelText,
          'text-halo-color': MINIMALIST_PALETTE.labelHalo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'place-district',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 10,
        filter: ['in', ['get', 'class'], ['literal', ['city', 'suburb', 'neighbourhood', 'quarter']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 12],
          'text-letter-spacing': 0.08,
        },
        paint: {
          'text-color': MINIMALIST_PALETTE.labelText,
          'text-halo-color': MINIMALIST_PALETTE.labelHalo,
          'text-halo-width': 2,
          'text-opacity': 0.78,
        },
      },
    ],
  };
}

function restylePositronLayer(layer: LayerSpecification): LayerSpecification {
  const id = layer.id.toLowerCase();

  // Hide commercial POIs, highway shields, and default transit overlays so our rail layer shines cleanly
  if (
    id.includes('poi') ||
    id.includes('transit') ||
    id.includes('rail') ||
    id.includes('railway') ||
    id.includes('aeroway') ||
    id.includes('shield') ||
    id.includes('highway_name') ||
    id.includes('motorway_name')
  ) {
    return {
      ...layer,
      layout: {
        ...(layer.layout ?? {}),
        visibility: 'none',
      },
    } as LayerSpecification;
  }

  if (layer.type === 'background') {
    return {
      ...layer,
      paint: {
        ...(layer.paint ?? {}),
        'background-color': MINIMALIST_PALETTE.land,
      },
    };
  }

  if (layer.type === 'fill') {
    if (id.includes('water')) {
      return {
        ...layer,
        paint: {
          ...(layer.paint ?? {}),
          'fill-color': MINIMALIST_PALETTE.water,
          'fill-opacity': 1,
        },
      };
    }
    if (id.includes('park') || id.includes('wood') || id.includes('grass') || id.includes('green')) {
      return {
        ...layer,
        paint: {
          ...(layer.paint ?? {}),
          'fill-color': MINIMALIST_PALETTE.park,
          'fill-opacity': 0.85,
        },
      };
    }
    if (id.includes('building')) {
      return {
        ...layer,
        paint: {
          ...(layer.paint ?? {}),
          'fill-color': MINIMALIST_PALETTE.building,
          'fill-opacity': 0.45,
        },
      };
    }
    if (id.includes('landuse') || id.includes('landcover')) {
      return {
        ...layer,
        paint: {
          ...(layer.paint ?? {}),
          'fill-color': MINIMALIST_PALETTE.land,
          'fill-opacity': 0.7,
        },
      };
    }
  }

  if (layer.type === 'line') {
    if (id.includes('water')) {
      return {
        ...layer,
        paint: {
          ...(layer.paint ?? {}),
          'line-color': MINIMALIST_PALETTE.water,
        },
      };
    }
    if (id.includes('casing')) {
      return {
        ...layer,
        paint: {
          ...(layer.paint ?? {}),
          'line-color': MINIMALIST_PALETTE.roadCasing,
          'line-opacity': 0.8,
        },
      };
    }
    if (
      id.includes('road') ||
      id.includes('highway') ||
      id.includes('street') ||
      id.includes('motorway') ||
      id.includes('trunk') ||
      id.includes('primary') ||
      id.includes('secondary') ||
      id.includes('tertiary') ||
      id.includes('bridge') ||
      id.includes('tunnel')
    ) {
      return {
        ...layer,
        paint: {
          ...(layer.paint ?? {}),
          'line-color': MINIMALIST_PALETTE.roadFill,
          'line-opacity': id.includes('tunnel') ? 0.45 : 0.9,
        },
      };
    }
  }

  if (layer.type === 'symbol') {
    const hasTextField = Boolean(
      layer.layout &&
        'text-field' in layer.layout &&
        layer.layout['text-field'] !== undefined
    );
    if (!hasTextField) {
      return layer;
    }
    return {
      ...layer,
      paint: {
        ...(layer.paint ?? {}),
        'text-color': MINIMALIST_PALETTE.labelText,
        'text-halo-color': MINIMALIST_PALETTE.labelHalo,
        'text-halo-width': 1.8,
        'text-opacity': 0.82,
      },
    };
  }

  return layer;
}

/**
 * Fetches OpenFreeMap Positron style JSON and transforms it to the Warm-Silver palette,
 * returning null on network error, non-OK HTTP status, or timeout.
 */
export async function fetchRemoteMinimalistStyle(
  timeoutMs = 3500
): Promise<StyleSpecification | null> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENFREEMAP_POSITRON_STYLE_URL, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const style = (await response.json()) as StyleSpecification;
    return {
      ...style,
      layers: style.layers.map(restylePositronLayer),
    };
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/**
 * Fetches OpenFreeMap Positron style JSON and transforms it to the Warm-Silver palette,
 * falling back cleanly to a synchronous style specification on network error or timeout.
 */
export async function loadMinimalistMapStyle(timeoutMs = 3500): Promise<StyleSpecification> {
  return (await fetchRemoteMinimalistStyle(timeoutMs)) ?? createFallbackMinimalistStyle();
}

