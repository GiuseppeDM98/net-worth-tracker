'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { getAllAssets, ASSET_CLASS_ORDER } from '@/lib/services/assetService';
import { getUserSnapshots, updateSnapshotNote } from '@/lib/services/snapshotService';
import {
  getTargets,
  compareAllocations,
  getDefaultTargets,
} from '@/lib/services/assetAllocationService';
import { getAllExpenses } from '@/lib/services/expenseService';
import {
  prepareNetWorthHistoryData,
  prepareAssetClassHistoryData,
  prepareYoYVariationData,
  prepareSavingsVsInvestmentData,
  prepareDoublingTimeData,
  formatCurrency,
  formatCurrencyCompact,
  formatPercentage,
} from '@/lib/services/chartService';
import { Asset, MonthlySnapshot, AssetAllocationTarget, DoublingMode } from '@/types/assets';
import { DoublingTimeSummaryCards } from '@/components/history/DoublingTimeSummaryCards';
import { DoublingMilestoneTimeline } from '@/components/history/DoublingMilestoneTimeline';
import { Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Plus, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CreateManualSnapshotModal } from '@/components/CreateManualSnapshotModal';
import { SnapshotSearchDialog } from '@/components/history/SnapshotSearchDialog';
import { CustomChartDot } from '@/components/history/CustomChartDot';
import { ExportPDFButton } from '@/components/dashboard/ExportPDFButton';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { getAssetClassColor } from '@/lib/constants/colors';

/**
 * HISTORY PAGE ARCHITECTURE
 *
 * This page displays historical portfolio analysis with multiple interactive charts.
 *
 * DATA FLOW:
 * 1. Load snapshots + assets + targets from Firebase (parallel fetching)
 * 2. Transform snapshots → chart data structures using chartService
 * 3. Render 5 main charts with toggle between percentage and absolute value modes
 *
 * CHART TYPES:
 * - Net Worth Evolution: Line chart showing total portfolio growth over time
 * - Asset Class Evolution: Stacked area (€) or multi-line (%) showing allocation breakdown
 * - Liquidity Evolution: Overlapping areas (€) or separate lines (%) for liquid vs illiquid
 * - YoY Variation: Bar chart showing year-over-year changes
 * - Current vs Target: Progress bars comparing current allocation to user-defined targets
 *
 * RESPONSIVE DESIGN:
 * - Mobile (<768px): Smaller charts, hidden legends, compact labels
 * - Landscape: Reduced heights for better fit in constrained viewports
 * - Desktop: Full charts with legends and optimal sizing
 *
 * KEY TRADE-OFFS:
 * - Chart labels use custom SVG renderers for better visibility vs recharts defaults (more control, readable over chart lines)
 * - Notes displayed inline on chart vs separate section for immediate context
 * - Manual snapshot creation available for backfilling historical data vs automatic monthly only
 * - Dual chart types (stacked area vs line) for mode toggling vs dynamic data transformation (clearer separation of concerns)
 */

/**
 * Convert month number (1-12) to Italian month name.
 *
 * @param month - Month number where 1 = Gennaio (January), 12 = Dicembre (December)
 * @returns Italian month name as string
 */
const getMonthName = (month: number): string => {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return months[month - 1];
};

export default function HistoryPage() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssetClassPercentage, setShowAssetClassPercentage] = useState(false);
  const [showLiquidityPercentage, setShowLiquidityPercentage] = useState(false);
  const [showYoYPercentage, setShowYoYPercentage] = useState(false);
  const [showManualSnapshotModal, setShowManualSnapshotModal] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [snapshotSearchDialogOpen, setSnapshotSearchDialogOpen] = useState(false);
  const [doublingMode, setDoublingMode] = useState<DoublingMode>('geometric');

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isLandscape = useMediaQuery('(min-width: 568px) and (max-height: 500px) and (orientation: landscape)');

  // Responsive helper functions
  const getChartHeight = () => {
    if (isLandscape) return 300;
    if (isMobile) return 280;
    return 400;
  };

  const getChartMargins = () => {
    if (isMobile) return { left: 10, right: 10, top: 5, bottom: 5 };
    return { left: 50 };
  };

  const getYAxisWidth = () => (isMobile ? 70 : 100);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  /**
   * Load all data needed for history visualization.
   *
   * Fetches in parallel for optimal performance:
   * - Snapshots: Monthly portfolio snapshots used for all historical charts
   * - Assets: Current assets needed for allocation comparison view
   * - Targets: User's allocation targets for comparison (falls back to defaults if not set)
   * - Expenses: Cashflow data needed for savings vs investment growth chart
   *
   * Snapshots are created automatically at month-end or manually via modal for backfilling.
   * All four queries run concurrently to minimize loading time.
   */
  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [snapshotsData, assetsData, targetsData, expensesData] = await Promise.all([
        getUserSnapshots(user.uid),
        getAllAssets(user.uid),
        getTargets(user.uid),
        getAllExpenses(user.uid),
      ]);

      setSnapshots(snapshotsData);
      setAssets(assetsData);
      setTargets(targetsData || getDefaultTargets());
      setExpenses(expensesData);
    } catch (error) {
      console.error('Error loading history data:', error);
      toast.error('Errore nel caricamento dello storico');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Export snapshot history to CSV file for external analysis.
   *
   * CSV Format:
   * - Headers: Data (MM/YYYY), Patrimonio Totale, Patrimonio Liquido, Patrimonio Illiquido
   * - Values: Raw numbers (not formatted as currency)
   * - Filename includes timestamp to prevent overwrites
   *
   * Downloads file directly to browser's default download location.
   */
  const handleExportCSV = () => {
    if (snapshots.length === 0) {
      toast.error('Nessun dato da esportare');
      return;
    }

    // Create CSV content
    const headers = ['Data', 'Patrimonio Totale', 'Patrimonio Liquido', 'Patrimonio Illiquido'];
    const rows = snapshots.map((snapshot) => [
      `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
      snapshot.totalNetWorth,
      snapshot.liquidNetWorth,
      snapshot.illiquidNetWorth || 0,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `net-worth-history-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Storico esportato con successo');
  };

  /**
   * Save user note for a specific snapshot month.
   *
   * Uses optimistic update pattern for immediate UI feedback:
   * 1. Update Firestore first (persists note to database)
   * 2. Update local state immediately (no need to wait for re-fetch)
   * 3. Empty notes stored as undefined (Firebase best practice, avoids storing empty strings)
   *
   * @param year - Snapshot year
   * @param month - Snapshot month (1-12)
   * @param note - User's note text (empty string converted to undefined)
   */
  const handleSaveNote = async (year: number, month: number, note: string) => {
    if (!user) return;

    await updateSnapshotNote(user.uid, year, month, note);

    // Update local state immediately for instant UI feedback (optimistic update)
    setSnapshots((prevSnapshots) =>
      prevSnapshots.map((s) =>
        s.year === year && s.month === month
          ? { ...s, note: note.trim() || undefined }
          : s
      )
    );
  };

  const netWorthHistory = prepareNetWorthHistoryData(snapshots);
  const assetClassHistory = prepareAssetClassHistoryData(snapshots);
  const yoyVariationData = prepareYoYVariationData(snapshots);
  const savingsVsInvestmentData = prepareSavingsVsInvestmentData(snapshots, expenses);
  const doublingTimeSummary = prepareDoublingTimeData(snapshots, doublingMode);

  // Calculate percentage split of liquid vs illiquid for each snapshot.
  // This enables the chart toggle between € values and % distribution.
  // Percentages are pre-calculated here rather than in chart render
  // to avoid recalculation on every chart update (performance optimization).
  const liquidityHistory = netWorthHistory.map((item) => {
    const total = item.liquidNetWorth + item.illiquidNetWorth;
    return {
      ...item,
      liquidPercentage: total > 0 ? (item.liquidNetWorth / total) * 100 : 0,
      illiquidPercentage: total > 0 ? (item.illiquidNetWorth / total) * 100 : 0,
    };
  });

  // Prepare current vs target data
  const allocation = compareAllocations(
    assets,
    targets || getDefaultTargets()
  );

  // WARNING: If you add a new asset class, also update:
  // - ASSET_CLASS_ORDER in lib/services/assetService.ts
  // - getAssetClassColor() in lib/constants/colors.ts
  // - AssetClass type definition in types/assets.ts
  // - Target allocation settings in settings page
  // Keep all locations in sync to prevent UI inconsistencies!
  const assetClassLabels: Record<string, string> = {
    equity: 'Azioni (Equity)',
    bonds: 'Obbligazioni (Bonds)',
    crypto: 'Criptovalute (Crypto)',
    realestate: 'Immobili (Real Estate)',
    cash: 'Liquidità (Cash)',
    commodity: 'Materie Prime (Commodity)',
  };

  // Sort asset classes by predefined order (Equity → Bonds → Crypto → etc.)
  // rather than alphabetically. This provides consistent UX across all views
  // and matches the order users expect from finance conventions.
  // Order defined in ASSET_CLASS_ORDER constant for centralized management.
  const currentVsTargetData = Object.entries(allocation.byAssetClass)
    .sort(([a], [b]) => {
      const orderA = ASSET_CLASS_ORDER[a] || 999;
      const orderB = ASSET_CLASS_ORDER[b] || 999;
      return orderA - orderB;
    })
    .map(([assetClass, data]) => ({
      name: assetClassLabels[assetClass] || assetClass,
      corrente: data.currentPercentage,
      target: data.targetPercentage,
      color: getAssetClassColor(assetClass),
    }));

  /**
   * Custom label renderer for net worth chart using SVG.
   *
   * WHY CUSTOM RENDERER:
   * Recharts default labels don't support:
   * - Background boxes for readability over chart lines
   * - Border styling for visual hierarchy and emphasis
   * - Precise positioning control for optimal label placement
   *
   * SVG STRUCTURE:
   * <g> - Group container for rect + text elements
   *   <rect> - White background with blue border (creates "pill" shape)
   *   <text> - Currency value centered in rect
   *
   * POSITIONING LOGIC:
   * - x, y coordinates from chart library (data point position)
   * - rect centered horizontally: x - (textWidth / 2) - padding
   * - text y-offset: -6px above rect bottom for vertical centering
   *
   * ACCESSIBILITY:
   * - High contrast: dark text (#1F2937) on white background
   * - Rounded corners (rx=4) for modern, friendly appearance
   * - 95% opacity allows slight chart visibility through label
   */
  const renderNetWorthLabelTotal = (props: any) => {
    const { x, y, value } = props;
    const text = formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7; // Approximate width based on font size

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y - 20}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke="#3B82F6"
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y - 6}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };


  const renderLiquidityLabelIlliquid = (props: any) => {
    const { x, y, value } = props;
    const text = showLiquidityPercentage
      ? `${value.toFixed(1)}%`
      : formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7;

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y - 10}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke="#F59E0B"
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y + 4}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };

  const renderLiquidityLabelLiquid = (props: any) => {
    const { x, y, value } = props;
    const text = showLiquidityPercentage
      ? `${value.toFixed(1)}%`
      : formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7;

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y - 20}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke="#10B981"
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y - 6}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };

  /**
   * Factory function for asset class label renderers with custom colors.
   *
   * Creates a custom SVG label renderer with specified color border.
   * Same structure as renderNetWorthLabelTotal but allows dynamic color theming.
   *
   * @param color - Hex color for border stroke (matches asset class color)
   * @param offsetY - Vertical offset from data point (default -10, negative = above)
   * @returns Label render function compatible with Recharts label prop
   */
  const renderAssetClassLabel = (color: string, offsetY: number = -10) => (props: any) => {
    const { x, y, value } = props;
    if (!value || value === 0) return null;

    const text = showAssetClassPercentage
      ? `${value.toFixed(1)}%`
      : formatCurrency(value).replace(/,00$/, '');
    const padding = 6;
    const textWidth = text.length * 7;

    return (
      <g>
        <rect
          x={x - textWidth / 2 - padding}
          y={y + offsetY}
          width={textWidth + padding * 2}
          height={20}
          fill="white"
          stroke={color}
          strokeWidth={1.5}
          rx={4}
          opacity={0.95}
        />
        <text
          x={x}
          y={y + offsetY + 14}
          fill="#1F2937"
          fontSize={12}
          textAnchor="middle"
          fontWeight="600"
        >
          {text}
        </text>
      </g>
    );
  };

  const renderEquityLabel = renderAssetClassLabel('#3B82F6', -10);
  const renderBondsLabel = renderAssetClassLabel('#EF4444', -10);
  const renderCryptoLabel = renderAssetClassLabel('#F59E0B', -10);
  const renderRealEstateLabel = renderAssetClassLabel('#10B981', -10);
  const renderCashLabel = renderAssetClassLabel('#6B7280', -10);
  const renderCommodityLabel = renderAssetClassLabel('#92400E', -10);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Storico</h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
            Analizza l'evoluzione del tuo patrimonio (lordo) nel tempo
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => setShowManualSnapshotModal(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Inserisci Snapshot Passato</span>
            <span className="sm:hidden">Snapshot Passato</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={snapshots.length === 0}
            className="w-full sm:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Esporta CSV
          </Button>
          <ExportPDFButton
            snapshots={snapshots}
            assets={assets}
            allocationTargets={targets || getDefaultTargets()}
          />
        </div>
      </div>

      {/* Net Worth History Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Evoluzione Patrimonio Netto</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {/* Toggle Visualizza Note */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNotes(!showNotes)}
                className="w-full sm:w-auto text-xs sm:text-sm"
              >
                {showNotes ? 'Nascondi Note' : 'Visualizza Note'}
              </Button>

              {/* Bottone Inserisci Nota */}
              <Button
                variant="default"
                size="sm"
                onClick={() => setSnapshotSearchDialogOpen(true)}
                className="w-full sm:w-auto text-xs sm:text-sm"
              >
                <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                Inserisci una nota
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {netWorthHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile. Gli snapshot mensili verranno creati
              automaticamente.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-net-worth-evolution">
              <LineChart data={netWorthHistory} margin={getChartMargins()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  width={getYAxisWidth()}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                  // Add 5% padding above/below data range to prevent chart clipping.
                  // Data points at min/max would otherwise be partially cut off by chart edges.
                  // Formula: min * 0.95 creates 5% space below, max * 1.05 creates 5% space above.
                  domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    padding: isMobile ? '8px' : '12px',
                    fontSize: isMobile ? '11px' : '13px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                  labelStyle={{
                    color: '#000',
                    fontWeight: 600,
                    marginBottom: '4px',
                    fontSize: isMobile ? '14px' : '16px',
                  }}
                  itemStyle={{
                    fontSize: isMobile ? '14px' : '16px',
                    padding: '2px 0',
                  }}
                  cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Legend
                  wrapperStyle={{
                    display: isMobile ? 'none' : 'block',
                    paddingTop: isMobile ? '0' : '20px'
                  }}
                  iconSize={isMobile ? 8 : 10}
                  fontSize={isMobile ? 11 : 12}
                />
                {/*
                  NOTES VISUALIZATION PATTERN

                  Notes are no longer rendered as inline labels on the chart.
                  Instead, when showNotes is true, a dedicated table appears below
                  this chart showing all snapshots with notes in a readable format.

                  Visual indicators remain: CustomChartDot renders amber dots with
                  message icons for snapshots that have notes attached.
                */}
                <Line
                  type="monotone"
                  dataKey="totalNetWorth"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  name="Patrimonio Totale"
                  dot={({ key, ...props }: any) => <CustomChartDot key={key} {...props} isMobile={isMobile} />}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/*
        NOTES TABLE PATTERN

        When showNotes is true, display a dedicated table below the chart
        showing all snapshots with notes in a clean, readable format.

        DESIGN RATIONALE:
        - Follows the same responsive pattern as cashflow drill-down (CurrentYearTab)
        - Mobile: Card layout with stacked info
        - Desktop: Table with sticky header, max-height scrolling
        - Shows full note text (not truncated like old inline labels)
        - Sorted newest to oldest for easy scanning

        DATA FILTERING:
        Filter snapshots to only those with note field present and non-empty.
        The note field is optional in MonthlySnapshot, stored as undefined when empty
        (Firebase best practice to avoid storing empty strings).
      */}
      {showNotes && (() => {
        // Filter snapshots that have notes (note field exists and is not empty).
        // prepareNetWorthHistoryData() already includes note, month, year fields
        // from the original snapshots, so we can use them directly without
        // searching through the snapshots array again.
        const snapshotsWithNotes = netWorthHistory
          .filter(item => item.note && item.note.trim() !== '')
          .map(item => ({
            year: item.year,
            month: item.month,
            note: item.note!,
            date: item.date
          }))
          .sort((a, b) => {
            // Sort by year descending, then by month descending (newest first)
            if (b.year !== a.year) return b.year - a.year;
            return b.month - a.month;
          });

        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg sm:text-xl">Note Patrimonio Netto</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotes(false)}
                  className="text-xs sm:text-sm"
                >
                  Chiudi
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {snapshotsWithNotes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nessuna nota disponibile
                </div>
              ) : (
                <>
                  {/* Mobile layout: Card-based */}
                  <div className="space-y-3 sm:hidden">
                    {snapshotsWithNotes.map((item) => (
                      <div key={`${item.year}-${item.month}`} className="rounded-md border p-3">
                        <div className="font-medium text-sm text-muted-foreground mb-2">
                          {getMonthName(item.month)} {item.year}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                          {item.note}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop layout: Table with sticky header */}
                  <div className="hidden sm:block rounded-md border">
                    <div className="max-h-[500px] overflow-y-auto">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-muted/50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium w-[200px]">
                              Periodo
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium">
                              Nota
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshotsWithNotes.map((item) => (
                            <tr key={`${item.year}-${item.month}`} className="border-b hover:bg-muted/30">
                              <td className="px-4 py-3 text-sm font-medium align-top">
                                {getMonthName(item.month)} {item.year}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-line">
                                {item.note}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Counter footer */}
                  <div className="mt-4 text-sm text-muted-foreground">
                    {snapshotsWithNotes.length} {snapshotsWithNotes.length === 1 ? 'nota trovata' : 'note trovate'}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Asset Class Evolution Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Patrimonio Netto per Asset Class</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssetClassPercentage(!showAssetClassPercentage)}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              {showAssetClassPercentage ? '€ Valori Assoluti' : '% Percentuali'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {assetClassHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-asset-class-evolution">
              {/*
                CHART MODE SWITCHING: Percentage vs Absolute Values

                Two fundamentally different chart types for the same data:

                1. PERCENTAGE MODE (LineChart):
                   - Use case: Compare relative weights over time
                   - Shows: % of total portfolio for each asset class
                   - Math: assetValue / totalPortfolio * 100
                   - Y-axis: Fixed 0-100% range
                   - Why LineChart: Percentages don't stack (always sum to 100%)

                2. ABSOLUTE MODE (Stacked AreaChart):
                   - Use case: See actual € growth for each asset class
                   - Shows: Total € value stacked on top of each other
                   - Math: Raw asset values in EUR
                   - Y-axis: Dynamic based on portfolio size
                   - Why Stacked: Visual representation of total portfolio composition

                TRADE-OFF:
                Using two separate chart types instead of data transformation
                because recharts doesn't support dynamic stacking. This duplicates
                some code but provides clearer separation of concerns and better UX.
              */}
              {showAssetClassPercentage ? (
                // Percentage mode: Use LineChart with separate lines
                <LineChart data={assetClassHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
                  <Line
                    type="monotone"
                    dataKey="equityPercentage"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    name="Azioni"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bondsPercentage"
                    stroke="#EF4444"
                    strokeWidth={2}
                    name="Obbligazioni"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cryptoPercentage"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    name="Criptovalute"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="realestatePercentage"
                    stroke="#10B981"
                    strokeWidth={2}
                    name="Immobili"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cashPercentage"
                    stroke="#6B7280"
                    strokeWidth={2}
                    name="Liquidità"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="commodityPercentage"
                    stroke="#92400E"
                    strokeWidth={2}
                    name="Materie Prime"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                </LineChart>
              ) : (
                // Absolute values mode: Use Stacked AreaChart
                <AreaChart data={assetClassHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => formatCurrencyCompact(value)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.8}
                    name="Azioni"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="bonds"
                    stroke="#EF4444"
                    fill="#EF4444"
                    fillOpacity={0.8}
                    name="Obbligazioni"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="crypto"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.8}
                    name="Criptovalute"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="realestate"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.8}
                    name="Immobili"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="cash"
                    stroke="#6B7280"
                    fill="#6B7280"
                    fillOpacity={0.8}
                    name="Liquidità"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="commodity"
                    stroke="#92400E"
                    fill="#92400E"
                    fillOpacity={0.8}
                    name="Materie Prime"
                    isAnimationActive={false}
                    label={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Liquidity Evolution Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Evoluzione Liquidità vs Illiquidità</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLiquidityPercentage(!showLiquidityPercentage)}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              {showLiquidityPercentage ? '€ Valori Assoluti' : '% Percentuali'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {netWorthHistory.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-liquidity">
              {showLiquidityPercentage ? (
                // Percentage mode: Use LineChart with separate lines
                <LineChart data={liquidityHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
                  <Line
                    type="monotone"
                    dataKey="liquidPercentage"
                    stroke="#10B981"
                    strokeWidth={2}
                    name="Liquido"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="illiquidPercentage"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    name="Illiquido"
                    dot={{ r: 4 }}
                    isAnimationActive={false}
                    label={false}
                  />
                </LineChart>
              ) : (
                // Absolute values mode: Use AreaChart with overlapping areas (no stack)
                <AreaChart data={liquidityHistory} margin={getChartMargins()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    width={getYAxisWidth()}
                    tickFormatter={(value) => formatCurrencyCompact(value)}
                    domain={[(dataMin: number) => dataMin * 0.95, (dataMax: number) => dataMax * 1.05]}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.98)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      padding: isMobile ? '8px' : '12px',
                      fontSize: isMobile ? '14px' : '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                    labelStyle={{
                      color: '#000',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      fontSize: isMobile ? '14px' : '16px',
                      padding: '2px 0',
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      display: isMobile ? 'none' : 'block',
                      paddingTop: isMobile ? '0' : '20px'
                    }}
                    iconSize={isMobile ? 8 : 10}
                    fontSize={isMobile ? 11 : 12}
                  />
                  <Area
                    type="monotone"
                    dataKey="liquidNetWorth"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.6}
                    name="Liquido"
                    isAnimationActive={false}
                    label={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="illiquidNetWorth"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.6}
                    name="Illiquido"
                    isAnimationActive={false}
                    label={false}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* YoY Variation Chart */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Storico YoY</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowYoYPercentage(!showYoYPercentage)}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              {showYoYPercentage ? '€ Valori Assoluti' : '% Percentuali'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {yoyVariationData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Nessuno storico disponibile.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-yoy-variation">
              <BarChart data={yoyVariationData} margin={getChartMargins()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis
                  width={getYAxisWidth()}
                  tickFormatter={(value) =>
                    showYoYPercentage
                      ? `${value.toFixed(0)}%`
                      : formatCurrencyCompact(value)
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'Variazione') {
                      return showYoYPercentage
                        ? `${value.toFixed(2)}%`
                        : formatCurrency(value);
                    }
                    return formatCurrency(value);
                  }}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    padding: isMobile ? '8px' : '12px',
                    fontSize: isMobile ? '14px' : '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                  labelStyle={{
                    color: '#000',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                  itemStyle={{
                    fontSize: isMobile ? '14px' : '16px',
                    padding: '2px 0',
                  }}
                />
                <Legend
                  wrapperStyle={{
                    display: isMobile ? 'none' : 'block',
                    paddingTop: isMobile ? '0' : '20px'
                  }}
                  iconSize={isMobile ? 8 : 10}
                  fontSize={isMobile ? 11 : 12}
                />
                <Bar
                  dataKey={showYoYPercentage ? 'variationPercentage' : 'variation'}
                  name="Variazione"
                  isAnimationActive={false}
                >
                  {yoyVariationData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.variation >= 0 ? '#10B981' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Savings vs Investment Growth Chart */}
      {/* Shows year-by-year breakdown of net worth growth:
          - Green bar (Net Savings): What user saved from income
          - Blue/Red bar (Investment Growth): What markets contributed (positive/negative)
          Stacked bars sum to total Net Worth Growth for the year */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">
            Risparmio vs Crescita Investimenti
          </CardTitle>
        </CardHeader>
        <CardContent>
          {savingsVsInvestmentData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Dati insufficienti per la visualizzazione.
              Servono snapshot e transazioni cashflow per ogni anno.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={getChartHeight()} id="chart-savings-vs-investment">
              <BarChart data={savingsVsInvestmentData} margin={getChartMargins()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis
                  width={getYAxisWidth()}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name
                  ]}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    padding: isMobile ? '8px' : '12px',
                    fontSize: isMobile ? '14px' : '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                  labelStyle={{
                    color: '#000',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                  itemStyle={{
                    fontSize: isMobile ? '14px' : '16px',
                    padding: '2px 0',
                  }}
                />
                <Legend
                  wrapperStyle={{
                    display: isMobile ? 'none' : 'block',
                    paddingTop: isMobile ? '0' : '20px'
                  }}
                  iconSize={isMobile ? 8 : 10}
                  fontSize={isMobile ? 11 : 12}
                />

                {/* Bar 1: Net Savings (always green) */}
                <Bar
                  dataKey="netSavings"
                  name="Risparmio Netto"
                  fill="#10B981"
                  stackId="a"
                  isAnimationActive={false}
                />

                {/* Bar 2: Investment Growth (conditional color) */}
                <Bar
                  dataKey="investmentGrowth"
                  name="Crescita Investimenti"
                  stackId="a"
                  isAnimationActive={false}
                >
                  {savingsVsInvestmentData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.investmentGrowth >= 0 ? '#3B82F6' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Doubling Time Analysis */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg sm:text-xl">Tempo di Raddoppio Patrimonio</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Mostra quanto tempo ha impiegato il tuo patrimonio per raddoppiare nei diversi periodi.
                Ogni milestone rappresenta un traguardo significativo nella crescita del tuo portafoglio.
              </p>
            </div>
            {/* Toggle button for switching between geometric and threshold modes */}
            <div className="flex gap-2 shrink-0">
              <Button
                variant={doublingMode === 'geometric' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDoublingMode('geometric')}
                className="text-xs sm:text-sm"
              >
                Raddoppi (2x, 4x...)
              </Button>
              <Button
                variant={doublingMode === 'threshold' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDoublingMode('threshold')}
                className="text-xs sm:text-sm"
              >
                Traguardi (€100k...)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {doublingTimeSummary.totalDoublings === 0 && !doublingTimeSummary.currentDoublingInProgress ? (
            <div className="flex h-32 items-center justify-center text-gray-500">
              Nessuna milestone ancora completata. Continua a costruire il tuo patrimonio!
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Metrics */}
              <DoublingTimeSummaryCards summary={doublingTimeSummary} doublingMode={doublingMode} />

              {/* Milestone Timeline */}
              <div>
                <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Storico {doublingMode === 'geometric' ? 'Raddoppi' : 'Traguardi'}
                </h3>
                <DoublingMilestoneTimeline
                  milestones={doublingTimeSummary.milestones}
                  currentInProgress={doublingTimeSummary.currentDoublingInProgress}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current vs Target Comparison */}
      <Card>
          <CardHeader>
            <CardTitle>Asset Class: Corrente vs Desiderata</CardTitle>
          </CardHeader>
          <CardContent>
            {currentVsTargetData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Nessun dato disponibile.
              </div>
            ) : (
              <div className="space-y-4">
                {currentVsTargetData.map((item) => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-gray-600">
                        {formatPercentage(item.corrente)} /{' '}
                        {formatPercentage(item.target)}
                      </span>
                    </div>
                    <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-200">
                      {/* Target bar (background) */}
                      <div
                        className="absolute h-full bg-gray-300"
                        style={{
                          width: `${Math.min(item.target, 100)}%`,
                        }}
                      />
                      {/* Current bar (foreground) */}
                      <div
                        className="absolute h-full transition-all"
                        style={{
                          width: `${Math.min(item.corrente, 100)}%`,
                          backgroundColor: item.color,
                          opacity: 0.8,
                        }}
                      />
                      {/* Labels */}
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white mix-blend-difference">
                        Corrente
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Corrente: {formatPercentage(item.corrente)}</span>
                      <span>Target: {formatPercentage(item.target)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      {snapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Snapshot Mensili</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "grid gap-4",
              isLandscape ? "grid-cols-2" : "grid-cols-1",
              "md:grid-cols-2 lg:grid-cols-3"
            )}>
              {snapshots.slice(-6).reverse().map((snapshot) => (
                <div
                  key={`${snapshot.year}-${snapshot.month}`}
                  className="rounded-lg border p-4"
                >
                  <div>
                    <div className="text-lg font-semibold">
                      {getMonthName(snapshot.month)} {snapshot.year}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Creato il: {snapshot.createdAt.toLocaleString('it-IT', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-lg font-bold">
                      {formatCurrency(snapshot.totalNetWorth)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Liquido: {formatCurrency(snapshot.liquidNetWorth)}
                    </div>
                  </div>
                  {snapshot.note && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1 flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        Nota:
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                        {snapshot.note.length > 100
                          ? snapshot.note.substring(0, 100) + '...'
                          : snapshot.note}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CreateManualSnapshotModal
        open={showManualSnapshotModal}
        onOpenChange={setShowManualSnapshotModal}
        userId={user?.uid || ''}
        onSuccess={loadData}
      />

      <SnapshotSearchDialog
        open={snapshotSearchDialogOpen}
        onOpenChange={setSnapshotSearchDialogOpen}
        snapshots={snapshots}
        onSave={handleSaveNote}
      />
    </div>
  );
}
