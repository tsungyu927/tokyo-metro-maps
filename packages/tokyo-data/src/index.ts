import type { TransitDataset } from '@rail-kit/engine';
import operators from './data/operators.json';
import lines from './data/lines.json';
import stations from './data/stations.json';
import segments from './data/segments.json';
import transfers from './data/transfers.json';
import fareRules from './data/fares.json';
import walletPasses from './data/wallet-passes.json';

/**
 * Pure static dataset for Tokyo central transit network (Metro, Toei, and JR East core lines).
 */
export const tokyoTransitDataset = {
  id: 'tokyo-core-v1',
  operators,
  lines,
  stations,
  segments,
  transfers,
  fareRules,
  walletPasses,
} as unknown as TransitDataset;

export {
  operators,
  lines,
  stations,
  segments,
  transfers,
  fareRules,
  walletPasses,
};
