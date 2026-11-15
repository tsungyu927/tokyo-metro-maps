import type { RailwayKind } from '@rail-kit/engine';

export interface TrackStyleSwatchProps {
  kind: RailwayKind;
  color: string;
  compact?: boolean;
  className?: string;
}

interface StrokeSpec {
  stroke: string;
  strokeWidth: number;
  dash?: string;
  cap: 'round' | 'butt';
}

function getSwatchLayers(kind: RailwayKind, color: string, compact: boolean): StrokeSpec[] {
  const baseWidth = compact ? 2.6 : 3.4;

  switch (kind) {
    case 'shinkansen':
      return [
        { stroke: color, strokeWidth: compact ? 4.4 : 5.6, cap: 'round' },
        { stroke: '#FFFFFF', strokeWidth: compact ? 2.5 : 3.2, cap: 'round' },
        {
          stroke: color,
          strokeWidth: compact ? 1.4 : 1.9,
          dash: compact ? '5 3.5' : '7 4.5',
          cap: 'butt',
        },
      ];
    case 'jr':
      return [
        { stroke: color, strokeWidth: baseWidth, cap: 'round' },
        {
          stroke: '#FFFFFF',
          strokeWidth: compact ? 1.2 : 1.5,
          dash: compact ? '3.5 3.5' : '4.5 4',
          cap: 'butt',
        },
      ];
    case 'private':
      return [
        { stroke: color, strokeWidth: baseWidth, cap: 'round' },
        { stroke: '#FFFFFF', strokeWidth: compact ? 0.95 : 1.15, cap: 'round' },
      ];
    case 'monorail':
      return [
        { stroke: color, strokeWidth: compact ? 2.4 : 3.2, cap: 'round' },
        {
          stroke: '#FFFFFF',
          strokeWidth: compact ? 1.25 : 1.65,
          dash: compact ? '0.2 3.5' : '0.2 4.5',
          cap: 'round',
        },
      ];
    case 'subway':
    default:
      return [{ stroke: color, strokeWidth: baseWidth, cap: 'round' }];
  }
}

/**
 * Miniature SVG track-style swatch mirroring the five railwayKind line styles on the map.
 */
export function TrackStyleSwatch({
  kind,
  color,
  compact = false,
  className = '',
}: TrackStyleSwatchProps) {
  const width = compact ? 18 : 28;
  const height = compact ? 8 : 10;
  const cy = height / 2;
  const padX = compact ? 2 : 2.5;
  const layers = getSwatchLayers(kind, color, compact);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 ${className}`.trim()}
      aria-hidden="true"
    >
      {layers.map((layer, index) => (
        <line
          key={index}
          x1={padX}
          y1={cy}
          x2={width - padX}
          y2={cy}
          stroke={layer.stroke}
          strokeWidth={layer.strokeWidth}
          strokeDasharray={layer.dash}
          strokeLinecap={layer.cap}
        />
      ))}
    </svg>
  );
}

