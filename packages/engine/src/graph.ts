import { WalletFareCalculator } from './fare';
import type {
  ComputedRoute,
  Operator,
  RailLine,
  RideSegment,
  RouteRideLeg,
  RouteTagKey,
  RouteTransferStep,
  SearchOptions,
  StationGroup,
  TransferDifficulty,
  TransitDataset,
  WalletState,
} from './types';

interface GraphEdge {
  kind: 'ride' | 'transfer';
  fromNode: string;
  toNode: string;
  fromStationId: string;
  toStationId: string;
  lineId: string;
  toLineId: string;
  operatorId: string;
  minutes: number;
  distanceKm: number;
  viaCoords?: [number, number][];
  difficulty?: TransferDifficulty;
  noteKey?: string;
}

interface SearchProfile {
  name: string;
  allowedOperators?: ReadonlySet<string>;
  allowedLineIds?: ReadonlySet<string>;
  penalizedLineIds?: ReadonlySet<string>;
  weightEdge: (edge: GraphEdge, isLastTransfer: boolean) => number;
}

const DEFAULT_SAME_OP_TRANSFER_MIN = 3;
const DEFAULT_CROSS_OP_TRANSFER_MIN = 5;

function makePlatformNode(stationId: string, lineId: string): string {
  return `${stationId}::${lineId}`;
}

/**
 * Multi-criteria transit graph router supporting line highlighting and wallet-aware pathfinding.
 */
export class TransitGraph {
  private readonly dataset: TransitDataset;
  private readonly fareCalculator: WalletFareCalculator;
  private readonly operatorMap: Map<string, Operator>;
  private readonly lineMap: Map<string, RailLine>;
  private readonly stationMap: Map<string, StationGroup>;
  private readonly adjacency: Map<string, GraphEdge[]>;

  constructor(dataset: TransitDataset) {
    this.dataset = dataset;
    this.fareCalculator = new WalletFareCalculator(dataset.fareRules, dataset.walletPasses);
    this.operatorMap = new Map(dataset.operators.map((op) => [op.id, op]));
    this.lineMap = new Map(dataset.lines.map((line) => [line.id, line]));
    this.stationMap = new Map(dataset.stations.map((station) => [station.id, station]));
    this.adjacency = new Map();

    this.buildGraph();
  }

  getStation(stationId: string): StationGroup | undefined {
    return this.stationMap.get(stationId);
  }

  getLine(lineId: string): RailLine | undefined {
    return this.lineMap.get(lineId);
  }

  getOperator(operatorId: string): Operator | undefined {
    return this.operatorMap.get(operatorId);
  }

  /**
   * Returns all rail lines serving the specified station group.
   */
  getConnectedLines(
    stationId: string,
    allowedLineIds?: ReadonlySet<string>
  ): RailLine[] {
    const station = this.stationMap.get(stationId);
    if (!station) return [];

    const seen = new Set<string>();
    const result: RailLine[] = [];
    for (const platform of station.platforms) {
      if (seen.has(platform.lineId)) continue;
      if (allowedLineIds && !allowedLineIds.has(platform.lineId)) continue;
      const line = this.lineMap.get(platform.lineId);
      if (line) {
        seen.add(line.id);
        result.push(line);
      }
    }
    return result;
  }

  /**
   * Returns the official station code for a station on a specific line, if present.
   */
  getStationCode(stationId: string, lineId: string): string {
    const station = this.stationMap.get(stationId);
    if (!station) return lineId;
    return station.platforms.find((p) => p.lineId === lineId)?.code ?? lineId;
  }

  /**
   * Computes up to `maxRoutes` distinct routes between two stations with wallet-adjusted fares.
   */
  findRoutes(
    originId: string,
    destinationId: string,
    wallet: WalletState,
    options: SearchOptions = {}
  ): ComputedRoute[] {
    if (originId === destinationId) return [];
    const origin = this.stationMap.get(originId);
    const destination = this.stationMap.get(destinationId);
    if (!origin || !destination) return [];

    const maxRoutes = options.maxRoutes ?? 3;
    const allowedOps = options.allowedOperators;
    const allowedLines = options.allowedLineIds;
    if (allowedLines && allowedLines.size === 0) return [];

    const baseProfiles: SearchProfile[] = [
      {
        name: 'fastest',
        allowedOperators: allowedOps,
        allowedLineIds: allowedLines,
        weightEdge: (edge) =>
          edge.kind === 'ride' ? edge.minutes : edge.minutes + 1.5,
      },
      {
        name: 'direct',
        allowedOperators: allowedOps,
        allowedLineIds: allowedLines,
        weightEdge: (edge) =>
          edge.kind === 'ride' ? edge.minutes : edge.minutes * 2.2 + 22,
      },
      {
        name: 'passSaver',
        allowedOperators: allowedOps,
        allowedLineIds: allowedLines,
        weightEdge: (edge) => {
          if (edge.kind === 'transfer') return edge.minutes + 2;
          const covered = this.fareCalculator.isLineCoveredByWallet(
            edge.operatorId,
            edge.lineId,
            wallet
          );
          return covered ? edge.minutes * 0.65 : edge.minutes + 6;
        },
      },
      {
        name: 'subwayPreferred',
        allowedOperators: this.intersectOperators(allowedOps, ['TokyoMetro', 'Toei']),
        allowedLineIds: allowedLines,
        weightEdge: (edge) =>
          edge.kind === 'ride' ? edge.minutes : edge.minutes + 1.5,
      },
    ];

    const candidatesBySignature = new Map<string, ComputedRoute>();

    for (const profile of baseProfiles) {
      if (profile.allowedOperators && profile.allowedOperators.size === 0) continue;
      const edgePath = this.runDijkstra(origin, destination, profile);
      if (!edgePath) continue;
      const route = this.materializeRoute(edgePath, wallet);
      if (route) {
        const sig = this.getRouteSignature(route);
        if (!candidatesBySignature.has(sig)) {
          candidatesBySignature.set(sig, route);
        }
      }
    }

    // Run penalized alternative passes if fewer than maxRoutes unique options were found
    for (let attempt = 0; attempt < 2 && candidatesBySignature.size < maxRoutes; attempt++) {
      const existingRoutes = Array.from(candidatesBySignature.values());
      if (existingRoutes.length === 0) break;

      const penalizedLines = new Set<string>();
      for (const existing of existingRoutes) {
        for (const leg of existing.legs) {
          penalizedLines.add(leg.lineId);
        }
      }

      const penaltyMultiplier = attempt === 0 ? 1.85 : 2.8;
      const altProfile: SearchProfile = {
        name: `alt-${attempt}`,
        allowedOperators: allowedOps,
        allowedLineIds: allowedLines,
        penalizedLineIds: penalizedLines,
        weightEdge: (edge) => {
          if (edge.kind === 'transfer') return edge.minutes + 1.5;
          const multiplier = penalizedLines.has(edge.lineId) ? penaltyMultiplier : 1;
          return edge.minutes * multiplier;
        },
      };

      const edgePath = this.runDijkstra(origin, destination, altProfile);
      if (!edgePath) break;
      const route = this.materializeRoute(edgePath, wallet);
      if (route) {
        const sig = this.getRouteSignature(route);
        if (!candidatesBySignature.has(sig)) {
          candidatesBySignature.set(sig, route);
        }
      }
    }

    const routes = Array.from(candidatesBySignature.values());
    if (routes.length === 0) return [];

    return this.rankAndTagRoutes(routes).slice(0, maxRoutes);
  }

  private intersectOperators(
    allowedOps: ReadonlySet<string> | undefined,
    targetOps: string[]
  ): ReadonlySet<string> {
    if (!allowedOps) return new Set(targetOps);
    return new Set(targetOps.filter((op) => allowedOps.has(op)));
  }

  private buildGraph(): void {
    // 1. Add ride edges from segments
    for (const seg of this.dataset.segments) {
      const line = this.lineMap.get(seg.lineId);
      if (!line) continue;

      this.addRideEdge(seg, line, false);
      if (seg.bidirectional !== false) {
        this.addRideEdge(seg, line, true);
      }
    }

    // 2. Index explicit transfer links
    const explicitPairs = new Set<string>();
    for (const link of this.dataset.transfers) {
      this.addTransferEdge(
        link.fromStationId,
        link.fromLineId,
        link.toStationId,
        link.toLineId,
        link.walkMinutes,
        link.difficulty,
        link.noteKey
      );
      explicitPairs.add(
        `${link.fromStationId}:${link.fromLineId}->${link.toStationId}:${link.toLineId}`
      );

      if (link.bidirectional !== false) {
        this.addTransferEdge(
          link.toStationId,
          link.toLineId,
          link.fromStationId,
          link.fromLineId,
          link.walkMinutes,
          link.difficulty,
          link.noteKey
        );
        explicitPairs.add(
          `${link.toStationId}:${link.toLineId}->${link.fromStationId}:${link.fromLineId}`
        );
      }
    }

    // 3. Auto-generate default intra-station transfers when no explicit timing is provided
    for (const station of this.dataset.stations) {
      const lineIds = Array.from(new Set(station.platforms.map((p) => p.lineId)));
      for (let i = 0; i < lineIds.length; i++) {
        for (let j = 0; j < lineIds.length; j++) {
          if (i === j) continue;
          const fromLineId = lineIds[i];
          const toLineId = lineIds[j];
          const key = `${station.id}:${fromLineId}->${station.id}:${toLineId}`;
          if (explicitPairs.has(key)) continue;

          const fromLine = this.lineMap.get(fromLineId);
          const toLine = this.lineMap.get(toLineId);
          if (!fromLine || !toLine) continue;

          const sameOperator = fromLine.operatorId === toLine.operatorId;
          this.addTransferEdge(
            station.id,
            fromLineId,
            station.id,
            toLineId,
            sameOperator ? DEFAULT_SAME_OP_TRANSFER_MIN : DEFAULT_CROSS_OP_TRANSFER_MIN,
            sameOperator ? 'easy' : 'normal',
            sameOperator ? 'transfer.sameOperatorDefault' : 'transfer.crossOperatorDefault'
          );
        }
      }
    }
  }

  private addRideEdge(seg: RideSegment, line: RailLine, reverse: boolean): void {
    const fromStationId = reverse ? seg.toStationId : seg.fromStationId;
    const toStationId = reverse ? seg.fromStationId : seg.toStationId;
    const fromNode = makePlatformNode(fromStationId, line.id);
    const toNode = makePlatformNode(toStationId, line.id);

    const viaCoords =
      seg.viaCoords && reverse ? [...seg.viaCoords].reverse() : seg.viaCoords;

    this.pushEdge({
      kind: 'ride',
      fromNode,
      toNode,
      fromStationId,
      toStationId,
      lineId: line.id,
      toLineId: line.id,
      operatorId: line.operatorId,
      minutes: seg.rideMinutes,
      distanceKm: seg.distanceKm,
      viaCoords,
    });
  }

  private addTransferEdge(
    fromStationId: string,
    fromLineId: string,
    toStationId: string,
    toLineId: string,
    walkMinutes: number,
    difficulty: TransferDifficulty,
    noteKey: string
  ): void {
    const toLine = this.lineMap.get(toLineId);
    if (!toLine) return;

    this.pushEdge({
      kind: 'transfer',
      fromNode: makePlatformNode(fromStationId, fromLineId),
      toNode: makePlatformNode(toStationId, toLineId),
      fromStationId,
      toStationId,
      lineId: fromLineId,
      toLineId,
      operatorId: toLine.operatorId,
      minutes: walkMinutes,
      distanceKm: 0,
      difficulty,
      noteKey,
    });
  }

  private pushEdge(edge: GraphEdge): void {
    const list = this.adjacency.get(edge.fromNode);
    if (list) {
      list.push(edge);
    } else {
      this.adjacency.set(edge.fromNode, [edge]);
    }
  }

  private runDijkstra(
    origin: StationGroup,
    destination: StationGroup,
    profile: SearchProfile
  ): GraphEdge[] | null {
    interface QueueItem {
      stateKey: string;
      node: string;
      lastWasTransfer: boolean;
      cost: number;
    }

    const dist = new Map<string, number>();
    const prev = new Map<string, { prevStateKey: string | null; edge: GraphEdge | null }>();
    const visited = new Set<string>();
    const queue: QueueItem[] = [];

    for (const platform of origin.platforms) {
      const line = this.lineMap.get(platform.lineId);
      if (!line) continue;
      if (profile.allowedOperators && !profile.allowedOperators.has(line.operatorId)) {
        continue;
      }
      if (profile.allowedLineIds && !profile.allowedLineIds.has(line.id)) {
        continue;
      }

      const node = makePlatformNode(origin.id, line.id);
      const stateKey = `${node}|0`;
      dist.set(stateKey, 0);
      prev.set(stateKey, { prevStateKey: null, edge: null });
      queue.push({ stateKey, node, lastWasTransfer: false, cost: 0 });
    }

    const targetNodes = new Set(
      destination.platforms
        .filter((platform) => !profile.allowedLineIds || profile.allowedLineIds.has(platform.lineId))
        .map((platform) => makePlatformNode(destination.id, platform.lineId))
    );
    if (queue.length === 0 || targetNodes.size === 0) return null;

    let bestTargetStateKey: string | null = null;

    while (queue.length > 0) {
      // Pop lowest-cost element
      let bestIndex = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].cost < queue[bestIndex].cost) {
          bestIndex = i;
        }
      }
      const current = queue[bestIndex];
      queue[bestIndex] = queue[queue.length - 1];
      queue.pop();

      if (visited.has(current.stateKey)) continue;
      visited.add(current.stateKey);

      if (targetNodes.has(current.node) && !current.lastWasTransfer) {
        bestTargetStateKey = current.stateKey;
        break;
      }

      const edges = this.adjacency.get(current.node) ?? [];
      for (const edge of edges) {
        if (edge.kind === 'transfer' && current.lastWasTransfer) continue;
        if (profile.allowedOperators && !profile.allowedOperators.has(edge.operatorId)) {
          continue;
        }
        if (
          edge.kind === 'ride' &&
          profile.allowedLineIds &&
          !profile.allowedLineIds.has(edge.lineId)
        ) {
          continue;
        }
        if (
          edge.kind === 'transfer' &&
          profile.allowedLineIds &&
          (!profile.allowedLineIds.has(edge.lineId) ||
            !profile.allowedLineIds.has(edge.toLineId))
        ) {
          continue;
        }

        // Do not walk out of the origin station before riding at least one stop
        if (edge.kind === 'transfer' && current.cost === 0 && edge.fromStationId === origin.id) {
          continue;
        }

        const nextLastWasTransfer = edge.kind === 'transfer';
        const nextStateKey = `${edge.toNode}|${nextLastWasTransfer ? '1' : '0'}`;
        if (visited.has(nextStateKey)) continue;

        const nextCost = current.cost + profile.weightEdge(edge, current.lastWasTransfer);
        const existingCost = dist.get(nextStateKey);
        if (existingCost === undefined || nextCost < existingCost) {
          dist.set(nextStateKey, nextCost);
          prev.set(nextStateKey, { prevStateKey: current.stateKey, edge });
          queue.push({
            stateKey: nextStateKey,
            node: edge.toNode,
            lastWasTransfer: nextLastWasTransfer,
            cost: nextCost,
          });
        }
      }
    }

    if (!bestTargetStateKey) return null;

    const edgesReversed: GraphEdge[] = [];
    let cursor: string | null = bestTargetStateKey;
    while (cursor) {
      const record = prev.get(cursor);
      if (!record || !record.edge) break;
      edgesReversed.push(record.edge);
      cursor = record.prevStateKey;
    }

    return edgesReversed.reverse();
  }

  private materializeRoute(edges: GraphEdge[], wallet: WalletState): ComputedRoute | null {
    if (edges.length === 0) return null;

    const legs: RouteRideLeg[] = [];
    const transfers: RouteTransferStep[] = [];

    for (const edge of edges) {
      if (edge.kind === 'transfer') {
        transfers.push({
          fromStationId: edge.fromStationId,
          toStationId: edge.toStationId,
          fromLineId: edge.lineId,
          toLineId: edge.toLineId,
          walkMinutes: edge.minutes,
          difficulty: edge.difficulty ?? 'normal',
          noteKey: edge.noteKey ?? 'transfer.crossOperatorDefault',
        });
        continue;
      }

      const fromStation = this.stationMap.get(edge.fromStationId);
      const toStation = this.stationMap.get(edge.toStationId);
      if (!fromStation || !toStation) continue;

      const segmentCoords: [number, number][] = [
        ...(edge.viaCoords ?? []),
        toStation.coord,
      ];

      const lastLeg = legs[legs.length - 1];
      if (lastLeg && lastLeg.lineId === edge.lineId && transfers.length === legs.length - 1) {
        lastLeg.toStationId = edge.toStationId;
        lastLeg.toCode = this.getStationCode(edge.toStationId, edge.lineId);
        lastLeg.stopStationIds.push(edge.toStationId);
        lastLeg.coordinates.push(...segmentCoords);
        lastLeg.rideMinutes += edge.minutes;
        lastLeg.distanceKm += edge.distanceKm;
      } else {
        legs.push({
          lineId: edge.lineId,
          operatorId: edge.operatorId,
          fromStationId: edge.fromStationId,
          toStationId: edge.toStationId,
          fromCode: this.getStationCode(edge.fromStationId, edge.lineId),
          toCode: this.getStationCode(edge.toStationId, edge.lineId),
          stopStationIds: [edge.fromStationId, edge.toStationId],
          coordinates: [fromStation.coord, ...segmentCoords],
          rideMinutes: edge.minutes,
          distanceKm: edge.distanceKm,
        });
      }
    }

    if (legs.length === 0) return null;

    // Guard against degenerate trailing or unpaired transfers
    const normalizedTransfers = transfers.slice(0, Math.max(0, legs.length - 1));
    const rideMinutes = legs.reduce((sum, leg) => sum + leg.rideMinutes, 0);
    const totalWalkMinutes = normalizedTransfers.reduce((sum, t) => sum + t.walkMinutes, 0);
    const fare = this.fareCalculator.calculateRouteFare(legs, wallet);

    const id = legs.map((l) => `${l.lineId}:${l.fromStationId}-${l.toStationId}`).join('__');

    return {
      id,
      tagKey: 'alternative',
      totalMinutes: rideMinutes + totalWalkMinutes,
      rideMinutes,
      totalWalkMinutes,
      transferCount: normalizedTransfers.length,
      legs,
      transfers: normalizedTransfers,
      fare,
    };
  }

  private getRouteSignature(route: ComputedRoute): string {
    const lineSig = route.legs.map((leg) => leg.lineId).join('>');
    const transferSig = route.transfers.map((t) => t.fromStationId).join(',');
    return `${lineSig}|${transferSig}`;
  }

  private rankAndTagRoutes(routes: ComputedRoute[]): ComputedRoute[] {
    const sorted = [...routes].sort((a, b) => {
      if (a.totalMinutes !== b.totalMinutes) return a.totalMinutes - b.totalMinutes;
      if (a.fare.payableFare !== b.fare.payableFare) {
        return a.fare.payableFare - b.fare.payableFare;
      }
      return a.transferCount - b.transferCount;
    });

    const minFare = Math.min(...sorted.map((r) => r.fare.payableFare));
    const maxBaseFare = Math.max(...sorted.map((r) => r.fare.baseFare));

    return sorted.map((route, idx) => {
      let tagKey: RouteTagKey = 'alternative';
      if (idx === 0) {
        tagKey = 'fastest';
      } else if (route.transferCount === 0) {
        tagKey = 'direct';
      } else if (
        route.fare.savedAmount > 0 &&
        route.fare.payableFare === minFare
      ) {
        tagKey = 'passSaver';
      } else if (route.fare.payableFare < sorted[0].fare.payableFare || route.fare.payableFare < maxBaseFare) {
        tagKey = 'passSaver';
      }

      return { ...route, tagKey };
    });
  }
}

