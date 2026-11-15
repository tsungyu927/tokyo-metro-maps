/**
 * Core domain types for modular, data-driven transit networks.
 * Keep all fields framework-agnostic so datasets and engines can be shared across apps.
 */

export interface Operator {
  id: string;
  name: string;
  shortName: string;
  color: string;
}

export type RailwayKind = 'subway' | 'jr' | 'private' | 'shinkansen' | 'monorail';
export type LinePresetTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';

export interface RailLine {
  id: string;
  code: string;
  operatorId: string;
  name: string;
  color: string;
  railwayKind?: RailwayKind;
  defaultEnabled?: boolean;
  tier?: LinePresetTier;
  isLoop?: boolean;
  isExpress?: boolean;
}

export interface StationPlatformCode {
  lineId: string;
  code: string;
}

export interface StationGroup {
  id: string;
  name: string;
  nameEn: string;
  /** WGS84 coordinate tuple: [longitude, latitude] */
  coord: [number, number];
  platforms: StationPlatformCode[];
  isMajorHub?: boolean;
}

export interface RideSegment {
  fromStationId: string;
  toStationId: string;
  lineId: string;
  rideMinutes: number;
  distanceKm: number;
  /** Intermediate geometry points [lng, lat] excluding endpoints, for smoother curves */
  viaCoords?: [number, number][];
  bidirectional?: boolean;
}

export type TransferDifficulty = 'easy' | 'normal' | 'hard';

export interface TransferLink {
  fromStationId: string;
  fromLineId: string;
  toStationId: string;
  toLineId: string;
  walkMinutes: number;
  difficulty: TransferDifficulty;
  /** Translation key resolved by the UI locale dictionary */
  noteKey: string;
  bidirectional?: boolean;
}

export interface FareBracket {
  maxKm: number | null;
  icFare: number;
  cashFare: number;
}

export interface InterOperatorDiscount {
  operators: [string, string];
  icDiscount: number;
  cashDiscount: number;
}

export interface FareRules {
  currencySymbol: string;
  operatorBrackets: Record<string, FareBracket[]>;
  expressSurcharges?: Record<string, { icFare: number; cashFare: number }>;
  interOperatorDiscounts: InterOperatorDiscount[];
}

export interface WalletPass {
  id: string;
  name: string;
  subtitle: string;
  badgeColor: string;
  coveredOperators: string[];
  excludedLineIds?: string[];
}

export type PaymentMethod = 'ic' | 'cash';

export interface WalletState {
  paymentMethod: PaymentMethod;
  enabledPassIds: string[];
}

export interface TransitDataset {
  id: string;
  operators: Operator[];
  lines: RailLine[];
  stations: StationGroup[];
  segments: RideSegment[];
  transfers: TransferLink[];
  fareRules: FareRules;
  walletPasses: WalletPass[];
}

export interface RouteRideLeg {
  lineId: string;
  operatorId: string;
  fromStationId: string;
  toStationId: string;
  fromCode: string;
  toCode: string;
  stopStationIds: string[];
  coordinates: [number, number][];
  rideMinutes: number;
  distanceKm: number;
}

export interface RouteTransferStep {
  fromStationId: string;
  toStationId: string;
  fromLineId: string;
  toLineId: string;
  walkMinutes: number;
  difficulty: TransferDifficulty;
  noteKey: string;
}

export interface OperatorFareItem {
  operatorId: string;
  distanceKm: number;
  baseFare: number;
  payableFare: number;
  coveredByPassId: string | null;
}

export interface FareBreakdown {
  paymentMethod: PaymentMethod;
  baseFare: number;
  payableFare: number;
  savedAmount: number;
  appliedPassIds: string[];
  interOperatorDiscountApplied: number;
  operatorBreakdown: OperatorFareItem[];
}

export type RouteTagKey = 'fastest' | 'direct' | 'passSaver' | 'alternative';

export interface SearchOptions {
  allowedOperators?: ReadonlySet<string>;
  allowedLineIds?: ReadonlySet<string>;
  maxRoutes?: number;
}

export interface ComputedRoute {
  id: string;
  tagKey: RouteTagKey;
  totalMinutes: number;
  rideMinutes: number;
  totalWalkMinutes: number;
  transferCount: number;
  legs: RouteRideLeg[];
  transfers: RouteTransferStep[];
  fare: FareBreakdown;
}

