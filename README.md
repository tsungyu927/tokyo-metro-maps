# Tokyo Rail Compass (`tokyo-metro-maps`)

Interactive Tokyo subway & railway map, multi-criteria route planner, and transit pass fare calculator built on **React 18 + TypeScript + Tailwind CSS + MapLibre GL JS + OpenFreeMap** (completely API-key-free).

Live GitHub Pages target: `https://jamiechien.com/tokyo-metro-maps/`

## Features

- **Minimalist Keyless Basemap**: Warm-silver MapLibre GL JS vector style powered by OpenFreeMap (with automatic offline fallback style and WebGL-less SVG canvas fallback).
- **Tokyo-Wide Network Dataset**: **15 operators**, **76 lines**, **349 stations**, **553 segments**, and **66 transfer / through-service links** across Tokyo Metro, Toei Subway, JR East, intra-Tokyo Shinkansen (`東京 ↔ 上野` / `品川`), airport access (`Tokyo Monorail`, `Keikyu Airport`, `Keisei`), private railways, and trams/AGT.
- **5-Tier Track Styling & Unified Hub Shapes**:
  - `subway`: solid colored line; circle markers.
  - `jr`: colored rail with dashed white sleeper ties; rounded-square markers.
  - `private`: colored parallel double rail; rounded-square markers.
  - `shinkansen`: wide casing with white bed and long dashed center; double-ring bullseye markers.
  - `monorail`: colored guideway with white dotted center; diamond markers.
  - Stations serving multiple visible `railwayKind` types automatically unify to a **colored-ring circle**.
- **3-Click Station Exploration & Transit Wallet**:
  - Click origin → light up all enabled lines through that station; click destination → compare ranked routes (ride minutes, transfer walking time, IC vs. cash fare brackets, express surcharges, and Tokyo Metro ↔ Toei ¥70 transfer discount) with pass deductions (`Tokyo Subway Ticket`, `JR Tokunai Pass`, `Toei One-Day Pass`, etc.).
- **Configurable Line Layers & Non-Destructive Quick Filters**:
  - **30 Tier 0 + Tier 1 lines** are enabled by default in the `路線設定` tab (`localStorage`-persisted). Only checked lines appear on the map and participate in route calculation.
  - Bottom-right / mobile quick track-kind toggles temporarily hide or reveal configured line groups without overwriting your saved settings checklist.

## Monorepo Structure

```text
tokyo-metro-maps/
├── packages/
│   ├── engine/               # @rail-kit/engine — TransitGraph router & WalletFareCalculator
│   ├── tokyo-data/           # @rail-kit/tokyo-data — Tokyo transit JSON datasets & pass rules
│   └── map-ui/               # @rail-kit/map-ui — Reusable <RailMapCanvas /> & MapLibre styles
├── apps/
│   └── tokyo-rail-compass/   # React + TypeScript + Tailwind CSS + Vite web app
├── .github/
│   └── workflows/deploy.yml  # GitHub Pages CI build & deploy workflow
├── package.json
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- **Node.js** `>= 18.18.0`
- **pnpm** `>= 9.0.0`

### Commands

```bash
# Install workspace dependencies
pnpm install

# Start local dev server (http://localhost:5173)
pnpm dev

# Run unit tests (@rail-kit/engine)
pnpm test

# Typecheck all workspace packages
pnpm typecheck

# Build production bundle (apps/tokyo-rail-compass/dist)
pnpm build
```

## Reusing `@rail-kit/map-ui`

`@rail-kit/map-ui` and `@rail-kit/tokyo-data` are designed to be imported directly in downstream apps (such as station-based POI or food maps) via the `customMarkers` slot:

```tsx
import { RailMapCanvas } from '@rail-kit/map-ui';
import { tokyoTransitDataset } from '@rail-kit/tokyo-data';

export function CustomOverlayMap() {
  return (
    <RailMapCanvas
      dataset={tokyoTransitDataset}
      customMarkers={[
        {
          id: 'spot-1',
          coord: [139.7671, 35.6812],
          render: () => <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-xs">Cafe</span>,
        },
      ]}
    />
  );
}
```