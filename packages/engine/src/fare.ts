import type {
  FareBreakdown,
  FareBracket,
  FareRules,
  OperatorFareItem,
  PaymentMethod,
  RouteRideLeg,
  WalletPass,
  WalletState,
} from './types';

interface OperatorChunk {
  operatorId: string;
  legs: RouteRideLeg[];
}

/**
 * Calculates single-operator, inter-operator discount, and multi-pass wallet fares.
 */
export class WalletFareCalculator {
  private readonly fareRules: FareRules;
  private readonly passById: Map<string, WalletPass>;

  constructor(fareRules: FareRules, walletPasses: WalletPass[]) {
    this.fareRules = fareRules;
    this.passById = new Map(walletPasses.map((pass) => [pass.id, pass]));
  }

  /**
   * Computes both the standard fare (without passes) and the wallet-adjusted payable fare.
   */
  calculateRouteFare(legs: RouteRideLeg[], wallet: WalletState): FareBreakdown {
    if (legs.length === 0) {
      return {
        paymentMethod: wallet.paymentMethod,
        baseFare: 0,
        payableFare: 0,
        savedAmount: 0,
        appliedPassIds: [],
        interOperatorDiscountApplied: 0,
        operatorBreakdown: [],
      };
    }

    const chunks = this.groupConsecutiveOperatorLegs(legs);
    const activePasses = wallet.enabledPassIds
      .map((id) => this.passById.get(id))
      .filter((pass): pass is WalletPass => pass !== undefined);

    const operatorBreakdown: OperatorFareItem[] = chunks.map((chunk) =>
      this.evaluateChunk(chunk, wallet.paymentMethod, activePasses)
    );

    const rawBaseSum = operatorBreakdown.reduce((sum, item) => sum + item.baseFare, 0);
    const baseDiscount = this.computeAdjacentDiscounts(
      operatorBreakdown.map((item) => ({ operatorId: item.operatorId, fare: item.baseFare })),
      wallet.paymentMethod
    );
    const baseFare = Math.max(0, rawBaseSum - baseDiscount);

    const rawPayableSum = operatorBreakdown.reduce((sum, item) => sum + item.payableFare, 0);
    const payableDiscount = this.computeAdjacentDiscounts(
      operatorBreakdown.map((item) => ({ operatorId: item.operatorId, fare: item.payableFare })),
      wallet.paymentMethod
    );
    const payableFare = Math.max(0, rawPayableSum - payableDiscount);

    const appliedPassIds = Array.from(
      new Set(
        operatorBreakdown
          .map((item) => item.coveredByPassId)
          .filter((id): id is string => id !== null)
      )
    );

    return {
      paymentMethod: wallet.paymentMethod,
      baseFare,
      payableFare,
      savedAmount: Math.max(0, baseFare - payableFare),
      appliedPassIds,
      interOperatorDiscountApplied: payableDiscount,
      operatorBreakdown,
    };
  }

  /**
   * Checks whether a given line is fully covered by at least one enabled pass in the wallet.
   */
  isLineCoveredByWallet(operatorId: string, lineId: string, wallet: WalletState): boolean {
    return this.findCoveringPass(operatorId, lineId, wallet.enabledPassIds) !== null;
  }

  private findCoveringPass(
    operatorId: string,
    lineId: string,
    enabledPassIds: string[]
  ): WalletPass | null {
    for (const passId of enabledPassIds) {
      const pass = this.passById.get(passId);
      if (!pass) continue;
      if (
        pass.coveredOperators.includes(operatorId) &&
        !(pass.excludedLineIds?.includes(lineId) ?? false)
      ) {
        return pass;
      }
    }
    return null;
  }

  private groupConsecutiveOperatorLegs(legs: RouteRideLeg[]): OperatorChunk[] {
    const chunks: OperatorChunk[] = [];
    for (const leg of legs) {
      const last = chunks[chunks.length - 1];
      if (last && last.operatorId === leg.operatorId) {
        last.legs.push(leg);
      } else {
        chunks.push({ operatorId: leg.operatorId, legs: [leg] });
      }
    }
    return chunks;
  }

  private evaluateChunk(
    chunk: OperatorChunk,
    paymentMethod: PaymentMethod,
    activePasses: WalletPass[]
  ): OperatorFareItem {
    const totalDistanceKm = chunk.legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
    const baseFare = this.computeDistanceAndExpressFare(
      chunk.operatorId,
      totalDistanceKm,
      chunk.legs,
      paymentMethod
    );

    const activePassIds = activePasses.map((p) => p.id);
    const uncoveredLegs: RouteRideLeg[] = [];
    let primaryPassId: string | null = null;

    for (const leg of chunk.legs) {
      const coveringPass = this.findCoveringPass(leg.operatorId, leg.lineId, activePassIds);
      if (coveringPass) {
        primaryPassId = primaryPassId ?? coveringPass.id;
      } else {
        uncoveredLegs.push(leg);
      }
    }

    if (uncoveredLegs.length === 0) {
      return {
        operatorId: chunk.operatorId,
        distanceKm: Number(totalDistanceKm.toFixed(1)),
        baseFare,
        payableFare: 0,
        coveredByPassId: primaryPassId,
      };
    }

    const uncoveredDistanceKm = uncoveredLegs.reduce((sum, leg) => sum + leg.distanceKm, 0);
    const payableFare =
      uncoveredLegs.length === chunk.legs.length
        ? baseFare
        : this.computeDistanceAndExpressFare(
            chunk.operatorId,
            uncoveredDistanceKm,
            uncoveredLegs,
            paymentMethod
          );

    return {
      operatorId: chunk.operatorId,
      distanceKm: Number(totalDistanceKm.toFixed(1)),
      baseFare,
      payableFare,
      coveredByPassId: primaryPassId,
    };
  }

  private computeDistanceAndExpressFare(
    operatorId: string,
    distanceKm: number,
    legs: RouteRideLeg[],
    paymentMethod: PaymentMethod
  ): number {
    if (distanceKm <= 0) return 0;

    const brackets = this.fareRules.operatorBrackets[operatorId] ?? [];
    let fare = this.lookupBracketFare(brackets, distanceKm, paymentMethod);

    const surcharges = this.fareRules.expressSurcharges ?? {};
    const chargedExpressLines = new Set<string>();
    for (const leg of legs) {
      const surcharge = surcharges[leg.lineId];
      if (surcharge && !chargedExpressLines.has(leg.lineId)) {
        chargedExpressLines.add(leg.lineId);
        fare += paymentMethod === 'ic' ? surcharge.icFare : surcharge.cashFare;
      }
    }

    return fare;
  }

  private lookupBracketFare(
    brackets: FareBracket[],
    distanceKm: number,
    paymentMethod: PaymentMethod
  ): number {
    for (const bracket of brackets) {
      if (bracket.maxKm === null || distanceKm <= bracket.maxKm) {
        return paymentMethod === 'ic' ? bracket.icFare : bracket.cashFare;
      }
    }
    const fallback = brackets[brackets.length - 1];
    if (!fallback) return 0;
    return paymentMethod === 'ic' ? fallback.icFare : fallback.cashFare;
  }

  private computeAdjacentDiscounts(
    items: { operatorId: string; fare: number }[],
    paymentMethod: PaymentMethod
  ): number {
    let totalDiscount = 0;

    for (let i = 0; i < items.length - 1; i++) {
      const left = items[i];
      const right = items[i + 1];
      if (left.fare <= 0 || right.fare <= 0) continue;

      const rule = this.fareRules.interOperatorDiscounts.find(
        (d) =>
          (d.operators[0] === left.operatorId && d.operators[1] === right.operatorId) ||
          (d.operators[1] === left.operatorId && d.operators[0] === right.operatorId)
      );

      if (rule) {
        totalDiscount += paymentMethod === 'ic' ? rule.icDiscount : rule.cashDiscount;
      }
    }

    return totalDiscount;
  }
}

