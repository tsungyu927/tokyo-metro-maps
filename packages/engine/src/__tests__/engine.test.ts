import { describe, expect, it } from 'vitest';
import { TransitGraph, WalletFareCalculator } from '../index';
import type { WalletState } from '../types';
import { tokyoTransitDataset } from '../../../tokyo-data/src/index';

const defaultIcWallet: WalletState = {
  paymentMethod: 'ic',
  enabledPassIds: [],
};

const cashWallet: WalletState = {
  paymentMethod: 'cash',
  enabledPassIds: [],
};

const subwayPassWallet: WalletState = {
  paymentMethod: 'ic',
  enabledPassIds: ['tokyo-subway-ticket'],
};

const jrPassWallet: WalletState = {
  paymentMethod: 'ic',
  enabledPassIds: ['jr-tokunai-pass'],
};

describe('Tokyo dataset referential integrity', () => {
  it('contains all 76 expanded lines across 15 operators and all 5 railwayKinds', () => {
    expect(tokyoTransitDataset.operators).toHaveLength(15);
    expect(tokyoTransitDataset.lines).toHaveLength(76);
    expect(
      tokyoTransitDataset.lines.filter((l) => l.defaultEnabled !== false)
    ).toHaveLength(30);

    const kinds = new Set(tokyoTransitDataset.lines.map((l) => l.railwayKind));
    expect(kinds).toEqual(
      new Set(['subway', 'jr', 'private', 'shinkansen', 'monorail'])
    );
    expect(tokyoTransitDataset.stations.length).toBeGreaterThanOrEqual(300);
  });

  it('has zero dangling station or line references in segments and transfers', () => {
    const stationMap = new Map(tokyoTransitDataset.stations.map((s) => [s.id, s]));
    const lineIds = new Set(tokyoTransitDataset.lines.map((l) => l.id));

    for (const station of tokyoTransitDataset.stations) {
      expect(station.platforms.length).toBeGreaterThan(0);
      for (const platform of station.platforms) {
        expect(lineIds.has(platform.lineId)).toBe(true);
      }
    }

    for (const seg of tokyoTransitDataset.segments) {
      expect(lineIds.has(seg.lineId)).toBe(true);
      const fromStation = stationMap.get(seg.fromStationId);
      const toStation = stationMap.get(seg.toStationId);
      expect(fromStation, `Missing fromStation ${seg.fromStationId}`).toBeDefined();
      expect(toStation, `Missing toStation ${seg.toStationId}`).toBeDefined();
      expect(
        fromStation?.platforms.some((p) => p.lineId === seg.lineId),
        `${seg.fromStationId} missing platform for line ${seg.lineId}`
      ).toBe(true);
      expect(
        toStation?.platforms.some((p) => p.lineId === seg.lineId),
        `${seg.toStationId} missing platform for line ${seg.lineId}`
      ).toBe(true);
    }

    for (const link of tokyoTransitDataset.transfers) {
      const fromStation = stationMap.get(link.fromStationId);
      const toStation = stationMap.get(link.toStationId);
      expect(fromStation, `Missing transfer fromStation ${link.fromStationId}`).toBeDefined();
      expect(toStation, `Missing transfer toStation ${link.toStationId}`).toBeDefined();
      expect(
        fromStation?.platforms.some((p) => p.lineId === link.fromLineId),
        `${link.fromStationId} missing transfer line ${link.fromLineId}`
      ).toBe(true);
      expect(
        toStation?.platforms.some((p) => p.lineId === link.toLineId),
        `${link.toStationId} missing transfer line ${link.toLineId}`
      ).toBe(true);
    }
  });
});

describe('TransitGraph', () => {
  const graph = new TransitGraph(tokyoTransitDataset);

  it('returns all connected lines across JR, Metro, and Toei for Shinjuku', () => {
    const lines = graph.getConnectedLines('shinjuku');
    const lineIds = lines.map((l) => l.id);
    expect(lineIds).toContain('JY');
    expect(lineIds).toContain('JC');
    expect(lineIds).toContain('M');
    expect(lineIds).toContain('S');
    expect(lineIds).toContain('E');
  });

  it('finds multiple distinct routes from Shinjuku to Ueno including transfer walking minutes', () => {
    const routes = graph.findRoutes('shinjuku', 'ueno', defaultIcWallet);
    expect(routes.length).toBeGreaterThanOrEqual(2);

    // Fastest route should use JR Chuo Rapid -> Kanda transfer -> JY/JK or direct JY
    const fastest = routes[0];
    expect(fastest.tagKey).toBe('fastest');
    expect(fastest.totalMinutes).toBeLessThanOrEqual(26);
    expect(fastest.fare.payableFare).toBeGreaterThan(0);

    // Ensure at least one route has explicit transfer walkMinutes > 0
    const transferRoute = routes.find((r) => r.transferCount > 0);
    expect(transferRoute).toBeDefined();
    expect(transferRoute?.transfers[0].walkMinutes).toBeGreaterThan(0);

    // Ensure a pure subway option (e.g., M -> G at Akasaka-mitsuke or Ginza) is surfaced
    const subwayRoute = routes.find((r) =>
      r.legs.every((leg) => leg.operatorId === 'TokyoMetro' || leg.operatorId === 'Toei')
    );
    expect(subwayRoute).toBeDefined();
  });

  it('returns curated 1-minute cross-platform transfer at Akasaka-mitsuke (M <-> G)', () => {
    const routes = graph.findRoutes('shinjuku', 'toranomon', subwayPassWallet);
    const crossPlatformRoute = routes.find((r) =>
      r.transfers.some(
        (t) => t.fromStationId === 'akasaka-mitsuke' && t.walkMinutes === 1 && t.difficulty === 'easy'
      )
    );
    expect(crossPlatformRoute).toBeDefined();
    expect(crossPlatformRoute?.fare.payableFare).toBe(0);
    expect(crossPlatformRoute?.fare.savedAmount).toBeGreaterThan(0);
  });

  it('filters routes cleanly when restricted to specific operators', () => {
    const metroOnly = new Set(['TokyoMetro']);
    const routes = graph.findRoutes('shinjuku', 'ueno', defaultIcWallet, {
      allowedOperators: metroOnly,
    });
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.legs.every((l) => l.operatorId === 'TokyoMetro')).toBe(true);
    }
  });

  it('filters connected lines and routes strictly by allowedLineIds', () => {
    const shibuyaFiltered = graph.getConnectedLines(
      'shibuya',
      new Set(['G', 'IN'])
    );
    expect(new Set(shibuyaFiltered.map((l) => l.id))).toEqual(
      new Set(['G', 'IN'])
    );
    expect(graph.getConnectedLines('shibuya', new Set())).toHaveLength(0);

    const inokashiraRoutes = graph.findRoutes(
      'shibuya',
      'kichijoji',
      defaultIcWallet,
      { allowedLineIds: new Set(['IN']) }
    );
    expect(inokashiraRoutes.length).toBeGreaterThan(0);
    expect(inokashiraRoutes[0].transferCount).toBe(0);
    expect(inokashiraRoutes[0].legs[0].lineId).toBe('IN');

    const jrOnlyRoutes = graph.findRoutes(
      'shibuya',
      'kichijoji',
      defaultIcWallet,
      { allowedLineIds: new Set(['JY', 'JC']) }
    );
    expect(jrOnlyRoutes.length).toBeGreaterThan(0);
    for (const route of jrOnlyRoutes) {
      expect(
        route.legs.every((leg) => leg.lineId === 'JY' || leg.lineId === 'JC')
      ).toBe(true);
      expect(route.legs.some((leg) => leg.lineId === 'IN')).toBe(false);
    }

    expect(
      graph.findRoutes('shibuya', 'kichijoji', defaultIcWallet, {
        allowedLineIds: new Set(),
      })
    ).toHaveLength(0);
  });

  it('routes airport access lines via Tokyo Monorail and Keikyu Airport Line', () => {
    const monorailRoutes = graph.findRoutes(
      'hamamatsucho',
      'haneda-t1',
      defaultIcWallet,
      { allowedLineIds: new Set(['MO']) }
    );
    expect(monorailRoutes.length).toBeGreaterThan(0);
    expect(monorailRoutes[0].transferCount).toBe(0);
    expect(monorailRoutes[0].legs[0].lineId).toBe('MO');

    const keikyuRoutes = graph.findRoutes(
      'sengakuji',
      'haneda-t1',
      defaultIcWallet,
      { allowedLineIds: new Set(['KK', 'KKA']) }
    );
    expect(keikyuRoutes.length).toBeGreaterThan(0);
    expect(
      keikyuRoutes[0].legs.every(
        (leg) => leg.lineId === 'KK' || leg.lineId === 'KKA'
      )
    ).toBe(true);
  });

  it('routes intra-Tokyo Shinkansen with express surcharge', () => {
    const shinkansenRoutes = graph.findRoutes(
      'tokyo',
      'shinagawa',
      defaultIcWallet,
      { allowedLineIds: new Set(['SHK-Tokaido']) }
    );
    expect(shinkansenRoutes.length).toBeGreaterThan(0);
    expect(shinkansenRoutes[0].legs[0].lineId).toBe('SHK-Tokaido');
    expect(shinkansenRoutes[0].fare.payableFare).toBeGreaterThan(1000);
  });
});

describe('WalletFareCalculator', () => {
  const calculator = new WalletFareCalculator(
    tokyoTransitDataset.fareRules,
    tokyoTransitDataset.walletPasses
  );

  it('merges consecutive TokyoMetro legs into a single distance bracket', () => {
    const fare = calculator.calculateRouteFare(
      [
        {
          lineId: 'M',
          operatorId: 'TokyoMetro',
          fromStationId: 'shinjuku',
          toStationId: 'akasaka-mitsuke',
          fromCode: 'M08',
          toCode: 'M13',
          stopStationIds: ['shinjuku', 'akasaka-mitsuke'],
          coordinates: [
            [139.7, 35.68],
            [139.73, 35.67],
          ],
          rideMinutes: 9,
          distanceKm: 5.0,
        },
        {
          lineId: 'G',
          operatorId: 'TokyoMetro',
          fromStationId: 'akasaka-mitsuke',
          toStationId: 'ueno',
          fromCode: 'G05',
          toCode: 'G16',
          stopStationIds: ['akasaka-mitsuke', 'ueno'],
          coordinates: [
            [139.73, 35.67],
            [139.77, 35.71],
          ],
          rideMinutes: 16,
          distanceKm: 6.0,
        },
      ],
      defaultIcWallet
    );

    // 11.0 km falls into the 7-11 km TokyoMetro IC bracket (¥209) instead of 2x ¥178
    expect(fare.baseFare).toBe(209);
    expect(fare.payableFare).toBe(209);
    expect(fare.savedAmount).toBe(0);
  });

  it('applies the ¥70 TokyoMetro <-> Toei inter-operator transfer discount when no pass is active', () => {
    const fare = calculator.calculateRouteFare(
      [
        {
          lineId: 'M',
          operatorId: 'TokyoMetro',
          fromStationId: 'shinjuku',
          toStationId: 'ginza',
          fromCode: 'M08',
          toCode: 'M16',
          stopStationIds: ['shinjuku', 'ginza'],
          coordinates: [
            [139.7, 35.68],
            [139.76, 35.67],
          ],
          rideMinutes: 16,
          distanceKm: 8.0,
        },
        {
          lineId: 'A',
          operatorId: 'Toei',
          fromStationId: 'higashi-ginza',
          toStationId: 'asakusa',
          fromCode: 'A11',
          toCode: 'A18',
          stopStationIds: ['higashi-ginza', 'asakusa'],
          coordinates: [
            [139.76, 35.66],
            [139.79, 35.71],
          ],
          rideMinutes: 14,
          distanceKm: 5.5,
        },
      ],
      defaultIcWallet
    );

    // Metro 8km (¥209) + Toei 5.5km (¥220) - ¥70 transfer discount = ¥359
    expect(fare.baseFare).toBe(359);
    expect(fare.payableFare).toBe(359);
    expect(fare.interOperatorDiscountApplied).toBe(70);
  });

  it('computes cash rounding correctly and zeroes only covered operators in hybrid routes', () => {
    const legs = [
      {
        lineId: 'M',
        operatorId: 'TokyoMetro',
        fromStationId: 'shinjuku',
        toStationId: 'tokyo',
        fromCode: 'M08',
        toCode: 'M17',
        stopStationIds: ['shinjuku', 'tokyo'],
        coordinates: [
          [139.7, 35.68],
          [139.76, 35.68],
        ] as [number, number][],
        rideMinutes: 19,
        distanceKm: 9.0,
      },
      {
        lineId: 'JY',
        operatorId: 'JR-East',
        fromStationId: 'tokyo',
        toStationId: 'kanda',
        fromCode: 'JY01',
        toCode: 'JY02',
        stopStationIds: ['tokyo', 'kanda'],
        coordinates: [
          [139.76, 35.68],
          [139.77, 35.69],
        ] as [number, number][],
        rideMinutes: 2,
        distanceKm: 1.3,
      },
    ];

    const cashFare = calculator.calculateRouteFare(legs, cashWallet);
    // Metro 9km cash ¥210 + JR 1.3km cash ¥150 = ¥360
    expect(cashFare.baseFare).toBe(360);

    const hybridSubwayPass = calculator.calculateRouteFare(legs, subwayPassWallet);
    // Metro covered (¥0) + JR 1.3km IC (¥146)
    expect(hybridSubwayPass.baseFare).toBe(355);
    expect(hybridSubwayPass.payableFare).toBe(146);
    expect(hybridSubwayPass.savedAmount).toBe(209);
    expect(hybridSubwayPass.appliedPassIds).toContain('tokyo-subway-ticket');

    const hybridJrPass = calculator.calculateRouteFare(legs, jrPassWallet);
    // Metro 9km IC (¥209) + JR covered (¥0)
    expect(hybridJrPass.payableFare).toBe(209);
    expect(hybridJrPass.appliedPassIds).toContain('jr-tokunai-pass');
  });

  it('charges base fare and surcharge for NEX even when jr-tokunai-pass is enabled', () => {
    const fare = calculator.calculateRouteFare(
      [
        {
          lineId: 'NEX',
          operatorId: 'JR-East',
          fromStationId: 'tokyo',
          toStationId: 'narita-airport-t1',
          fromCode: 'NEX',
          toCode: 'NEX',
          stopStationIds: ['tokyo', 'narita-airport-t1'],
          coordinates: [
            [139.76, 35.68],
            [140.38, 35.76],
          ],
          rideMinutes: 56,
          distanceKm: 79.2,
        },
      ],
      jrPassWallet
    );

    expect(fare.payableFare).toBe(1342 + 1730);
    expect(fare.savedAmount).toBe(0);
    expect(fare.appliedPassIds).toHaveLength(0);
  });
});
