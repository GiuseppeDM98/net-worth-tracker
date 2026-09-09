import { describe, it, expect } from 'vitest'

import {
  buildAssetClassComposition,
  buildLiquidityComposition,
  buildChartAriaLabel,
  formatPeriodLabel,
  shareKey,
  valueKey,
  PENSION_BAND_KEY,
  RESIDUAL_BAND_KEY,
  type LiquidityHistoryPoint,
} from '@/lib/utils/historyComposition'
import type { AssetClassHistoryPoint } from '@/lib/services/chartService'
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils'
import type { AssetClass } from '@/types/assets'

/**
 * The `byClass` map is exhaustive over `AssetClass` by type, so a fixture builder that defaults
 * every member keeps the tests readable while still failing to compile if the union widens.
 */
function makeAssetClassPoint(
  month: number,
  year: number,
  totalNetWorth: number,
  byClass: Partial<Record<AssetClass, number>>,
  pension = 0
): AssetClassHistoryPoint {
  return {
    date: `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`,
    month,
    year,
    totalNetWorth,
    byClass: {
      equity: 0,
      bonds: 0,
      crypto: 0,
      realestate: 0,
      cash: 0,
      commodity: 0,
      trendFollowing: 0,
      carry: 0,
      ...byClass,
    },
    pension,
    pensionSource: pension > 0 ? 'measured' : 'none',
  }
}

function makeLiquidityPoint(
  month: number,
  year: number,
  liquid: number,
  illiquid: number,
  totalNetWorth = liquid + illiquid
): LiquidityHistoryPoint {
  return {
    date: `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`,
    month,
    year,
    totalNetWorth,
    liquidNetWorth: liquid,
    illiquidNetWorth: illiquid,
  }
}

function sumShares(row: Record<string, string | number>, bandKeys: string[]): number {
  return bandKeys.reduce((sum, key) => sum + (row[shareKey(key)] as number), 0)
}

describe('buildAssetClassComposition', () => {
  it('should close every row at exactly 100% so the stack can never overflow or fall short', () => {
    // Arrange — a total that does not match the class sum in either direction
    const points = [
      makeAssetClassPoint(1, 2025, 1000, { equity: 600, bonds: 400 }),
      makeAssetClassPoint(2, 2025, 1000, { equity: 700, bonds: 200 }), // classes sum below total
      makeAssetClassPoint(3, 2025, 900, { equity: 700, bonds: 400 }), // classes sum above total
    ]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    const bandKeys = series.bands.map((band) => band.key)
    for (const row of series.rows) {
      expect(sumShares(row, bandKeys)).toBeCloseTo(100, 9)
    }
  })

  it('should plot trendFollowing and carry, which the six hard-coded classes used to drop', () => {
    // Arrange
    const points = [
      makeAssetClassPoint(1, 2025, 1000, { equity: 500, trendFollowing: 300, carry: 200 }),
    ]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    const bandKeys = series.bands.map((band) => band.key)
    expect(bandKeys).toContain('trendFollowing')
    expect(bandKeys).toContain('carry')
    expect(series.rows[0][shareKey('trendFollowing')]).toBeCloseTo(30, 9)
    expect(series.rows[0][shareKey('carry')]).toBeCloseTo(20, 9)
  })

  it('should omit a class that is zero in every month so the legend carries no dead rows', () => {
    // Arrange
    const points = [makeAssetClassPoint(1, 2025, 1000, { equity: 1000 })]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.bands.map((band) => band.key)).toEqual(['equity'])
  })

  it('should keep a class that is zero in one month but held in another', () => {
    // Arrange
    const points = [
      makeAssetClassPoint(1, 2025, 1000, { equity: 1000, crypto: 0 }),
      makeAssetClassPoint(2, 2025, 1000, { equity: 900, crypto: 100 }),
    ]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.bands.map((band) => band.key)).toEqual(['equity', 'crypto'])
    expect(series.rows[0][shareKey('crypto')]).toBe(0)
  })

  it('should name the unattributed remainder when the total exceeds what the classes explain', () => {
    // Arrange — 5% of the portfolio is in no class bucket at all
    const points = [makeAssetClassPoint(1, 2025, 1000, { equity: 950 })]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    const residual = series.bands.find((band) => band.key === RESIDUAL_BAND_KEY)
    expect(residual).toBeDefined()
    expect(residual?.label).toBe('Non attribuito')
    expect(residual?.colorIndex).toBeNull()
    expect(series.rows[0][shareKey(RESIDUAL_BAND_KEY)]).toBeCloseTo(5, 9)
  })

  it('should absorb a sub-threshold remainder instead of showing a band for rounding', () => {
    // Arrange — 0.1% gap, below the 0.5% visibility threshold
    const points = [makeAssetClassPoint(1, 2025, 1000, { equity: 999 })]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.bands.map((band) => band.key)).toEqual(['equity'])
    expect(series.rows[0][shareKey('equity')]).toBeCloseTo(100, 9)
  })

  it('should not invent a negative remainder when the pension clamp pushes the class sum above the total', () => {
    // Arrange — the documented `Math.max(0, …)` carve-out artifact: plotted > totalNetWorth
    const points = [makeAssetClassPoint(1, 2025, 900, { equity: 700, bonds: 400 })]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert — no residual band, and the shares still describe the plotted mix
    expect(series.bands.map((band) => band.key)).toEqual(['equity', 'bonds'])
    expect(series.rows[0][shareKey('equity')]).toBeCloseTo((700 / 1100) * 100, 9)
    expect(series.rows[0][shareKey('bonds')]).toBeCloseTo((400 / 1100) * 100, 9)
  })

  it('should give Previdenza its own chart slot, never the one trendFollowing owns', () => {
    // Arrange
    const points = [makeAssetClassPoint(1, 2025, 1000, { equity: 600, trendFollowing: 100 }, 300)]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    const pension = series.bands.find((band) => band.key === PENSION_BAND_KEY)
    const trendFollowing = series.bands.find((band) => band.key === 'trendFollowing')
    expect(pension?.colorIndex).not.toBe(trendFollowing?.colorIndex)
    expect(trendFollowing?.colorIndex).toBe(ASSET_CLASS_CHART_INDEX.trendFollowing)
  })

  it('should label Previdenza in Italian and carry its euro value through', () => {
    // Arrange
    const points = [makeAssetClassPoint(1, 2025, 1000, { equity: 700 }, 300)]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.bands.find((band) => band.key === PENSION_BAND_KEY)?.label).toBe('Previdenza')
    expect(series.rows[0][valueKey(PENSION_BAND_KEY)]).toBe(300)
  })

  it('should rank the breakdown by euro value descending, not by stack order', () => {
    // Arrange — bonds is declared after equity but is the larger holding
    const points = [makeAssetClassPoint(1, 2025, 1000, { equity: 300, bonds: 700 })]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.breakdown.map((entry) => entry.key)).toEqual(['bonds', 'equity'])
    expect(series.breakdown[0].valueEur).toBe(700)
    expect(series.breakdown[0].sharePct).toBeCloseTo(70, 9)
  })

  it('should report the drift in percentage points against the same month one year earlier', () => {
    // Arrange
    const points = [
      makeAssetClassPoint(3, 2024, 1000, { equity: 400, bonds: 600 }),
      makeAssetClassPoint(3, 2025, 1000, { equity: 550, bonds: 450 }),
    ]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    const equity = series.breakdown.find((entry) => entry.key === 'equity')
    const bonds = series.breakdown.find((entry) => entry.key === 'bonds')
    expect(equity?.deltaPp).toBeCloseTo(15, 9)
    expect(bonds?.deltaPp).toBeCloseTo(-15, 9)
  })

  it('should return a null drift when the baseline month is absent rather than reporting zero', () => {
    // Arrange — only 8 months of history, so March of the prior year is unknowable
    const points = [
      makeAssetClassPoint(1, 2025, 1000, { equity: 1000 }),
      makeAssetClassPoint(2, 2025, 1000, { equity: 1000 }),
    ]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.breakdown[0].deltaPp).toBeNull()
  })

  it('should report the snapshot total verbatim, never a re-derived sum of the bands', () => {
    // Arrange — classes deliberately disagree with the total
    const points = [makeAssetClassPoint(8, 2026, 12345, { equity: 900 })]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.latestTotalEur).toBe(12345)
    expect(series.rows[0].totalNetWorth).toBe(12345)
    expect(series.latestPeriodLabel).toBe('Agosto 2026')
  })

  it('should survive a month with no portfolio at all', () => {
    // Arrange
    const points = [makeAssetClassPoint(1, 2025, 0, {})]

    // Act
    const series = buildAssetClassComposition(points)

    // Assert
    expect(series.bands).toEqual([])
    expect(series.breakdown).toEqual([])
    expect(series.latestTotalEur).toBe(0)
  })

  it('should return an empty series with no data', () => {
    // Act
    const series = buildAssetClassComposition([])

    // Assert
    expect(series.rows).toEqual([])
    expect(series.breakdown).toEqual([])
    expect(series.latestTotalEur).toBeNull()
    expect(series.latestPeriodLabel).toBeNull()
  })
})

describe('buildLiquidityComposition', () => {
  it('should split a month into liquid and illiquid summing to 100%', () => {
    // Arrange
    const points = [makeLiquidityPoint(1, 2025, 750, 250)]

    // Act
    const series = buildLiquidityComposition(points)

    // Assert
    expect(series.rows[0][shareKey('liquid')]).toBeCloseTo(75, 9)
    expect(series.rows[0][shareKey('illiquid')]).toBeCloseTo(25, 9)
  })

  it('should name the gap on legacy snapshots where illiquidNetWorth defaults to zero', () => {
    // Arrange — the pre-field snapshot: liquid is partial, illiquid was never written
    const points = [
      makeLiquidityPoint(1, 2025, 600, 0, 1000),
      makeLiquidityPoint(2, 2025, 700, 300, 1000),
    ]

    // Act
    const series = buildLiquidityComposition(points)

    // Assert
    expect(series.bands.map((band) => band.key)).toContain(RESIDUAL_BAND_KEY)
    expect(series.rows[0][shareKey(RESIDUAL_BAND_KEY)]).toBeCloseTo(40, 9)
    expect(series.rows[1][shareKey(RESIDUAL_BAND_KEY)]).toBeCloseTo(0, 9)
  })

  it('should keep the liquid and illiquid hues stable across the redesign', () => {
    // Arrange
    const points = [makeLiquidityPoint(1, 2025, 500, 500)]

    // Act
    const series = buildLiquidityComposition(points)

    // Assert
    expect(series.bands.find((band) => band.key === 'liquid')?.colorIndex).toBe(0)
    expect(series.bands.find((band) => band.key === 'illiquid')?.colorIndex).toBe(2)
  })
})

describe('formatPeriodLabel', () => {
  it('should spell the month in Italian rather than reusing the MM/YY axis key', () => {
    expect(formatPeriodLabel(1, 2025)).toBe('Gennaio 2025')
    expect(formatPeriodLabel(12, 2023)).toBe('Dicembre 2023')
  })
})

describe('buildChartAriaLabel', () => {
  it('should carry the colour-to-name mapping, with Italian separators matching the visible rows', () => {
    // Arrange
    const series = buildAssetClassComposition([
      makeAssetClassPoint(1, 2024, 1000, { equity: 600, bonds: 400 }),
      makeAssetClassPoint(1, 2025, 1000, { equity: 700, bonds: 300 }),
    ])

    // Act
    const label = buildChartAriaLabel('assetClass', series)

    // Assert
    expect(label).toContain('da Gennaio 2024 a Gennaio 2025')
    expect(label).toContain('Azioni 70,0%')
    expect(label).toContain('Obbligazioni 30,0%')
  })

  it('should say so plainly when there is nothing to describe', () => {
    // Act
    const label = buildChartAriaLabel('liquidity', buildLiquidityComposition([]))

    // Assert
    expect(label).toContain('nessun dato')
  })
})
