import { BenchmarkDefinition } from '@/types/benchmarks';

/**
 * Curated model portfolio definitions.
 *
 * Each benchmark is represented by USD-listed ETF proxies with deep historical
 * data (earliest common date ~2007). Returns are computed in USD and clearly
 * labelled as such in the UI — FX conversion to EUR is deferred to a future version.
 *
 * ETF proxy rationale:
 *  - ACWI: MSCI All Country World Index (global equities, available from 2008)
 *  - AGG: Bloomberg US Aggregate Bond Index (core bonds, from 2003)
 *  - SPY: S&P 500 (US large-cap proxy, from 1993)
 *  - TLT: 20+ Year US Treasury (long-duration bonds, from 2002)
 *  - IEF: 7-10 Year US Treasury (intermediate bonds, from 2002)
 *  - GLD: SPDR Gold Shares (gold, from 2004)
 *  - GSG: iShares S&P GSCI Commodity (broad commodities, from 2006)
 *  - SHY: 1-3 Year US Treasury (short-term bonds/cash proxy, from 2002)
 *  - VTI: Vanguard Total Stock Market (US total market, from 2001)
 *  - VBR: Vanguard Small-Cap Value (US small-cap value, from 2004)
 *
 * All benchmarks assume annual rebalancing back to target weights.
 */
export const BENCHMARKS: BenchmarkDefinition[] = [
  {
    id: '60-40',
    name: 'Portafoglio 60/40',
    description: '60% azioni globali (ACWI) + 40% obbligazioni aggregate (AGG). Allocazione classica bilanciata, punto di riferimento storico per investitori a lungo termine.',
    color: '#3b82f6', // blue-500
    components: [
      { ticker: 'ACWI', weight: 0.60, name: 'MSCI All Country World' },
      { ticker: 'AGG', weight: 0.40, name: 'Bloomberg Aggregate Bond' },
    ],
  },
  {
    id: 'all-weather',
    name: 'All Weather',
    description: 'Strategia di Ray Dalio progettata per performare in qualsiasi scenario economico: crescita, recessione, inflazione, deflazione.',
    color: '#f59e0b', // amber-500
    components: [
      { ticker: 'SPY', weight: 0.30, name: 'S&P 500' },
      { ticker: 'TLT', weight: 0.40, name: 'Treasury 20+ anni' },
      { ticker: 'IEF', weight: 0.15, name: 'Treasury 7-10 anni' },
      { ticker: 'GLD', weight: 0.075, name: 'Oro' },
      { ticker: 'GSG', weight: 0.075, name: 'Commodities' },
    ],
  },
  {
    id: 'buffett-90-10',
    name: '90/10 Buffett',
    description: '90% S&P 500 + 10% T-Bill a breve termine. Raccomandato da Warren Buffett nel testamento per la moglie: massima esposizione azionaria con una piccola riserva di liquidità.',
    color: '#10b981', // emerald-500
    components: [
      { ticker: 'SPY', weight: 0.90, name: 'S&P 500' },
      { ticker: 'SHY', weight: 0.10, name: 'Treasury 1-3 anni' },
    ],
  },
  {
    id: 'golden-butterfly',
    name: 'Golden Butterfly',
    description: 'Evoluzione del Permanent Portfolio di Harry Browne con maggiore enfasi sulle small-cap value. Cinque classi d\'asset al 20% ciascuna per bilanciare crescita e protezione.',
    color: '#8b5cf6', // violet-500
    components: [
      { ticker: 'VTI', weight: 0.20, name: 'US Total Market' },
      { ticker: 'VBR', weight: 0.20, name: 'Small-Cap Value' },
      { ticker: 'GLD', weight: 0.20, name: 'Oro' },
      { ticker: 'TLT', weight: 0.20, name: 'Treasury 20+ anni' },
      { ticker: 'SHY', weight: 0.20, name: 'Treasury 1-3 anni' },
    ],
  },
];

export const BENCHMARK_MAP: Record<string, BenchmarkDefinition> = Object.fromEntries(
  BENCHMARKS.map(b => [b.id, b])
);
