import type { RailMapController } from './components/RailMapCanvas';

export type RailMapInstance = RailMapController;

export { RailMapCanvas } from './components/RailMapCanvas';
export type {
  CustomMapMarker,
  MapFitPadding,
  RailMapCanvasProps,
  RailMapController,
} from './components/RailMapCanvas';
export {
  MINIMALIST_PALETTE,
  OPENFREEMAP_POSITRON_STYLE_URL,
  createFallbackMinimalistStyle,
  fetchRemoteMinimalistStyle,
  loadMinimalistMapStyle,
} from './style/minimalistMapStyle';
