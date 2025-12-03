'use client';

import { useState } from 'react';
import { Asset } from '@/types/assets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatCurrency,
  formatNumber,
} from '@/lib/services/chartService';
import {
  calculateAssetValue,
  calculateUnrealizedGains,
} from '@/lib/services/assetService';
import { getAssetClassColor } from '@/lib/constants/colors';
import { Pencil, Trash2, Calculator, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AssetCardProps {
  asset: Asset;
  onEdit: (asset: Asset) => void;
  onDelete: (assetId: string) => void;
  onCalculateTaxes?: (asset: Asset) => void;
  isManualPrice: boolean;
}

const formatAssetName = (name: string): string => {
  const nameMap: Record<string, string> = {
    realestate: 'Real Estate',
    equity: 'Equity',
    bonds: 'Bonds',
    crypto: 'Crypto',
    cash: 'Cash',
    commodity: 'Commodity',
  };
  return nameMap[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
};

export function AssetCard({
  asset,
  onEdit,
  onDelete,
  onCalculateTaxes,
  isManualPrice,
}: AssetCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const value = calculateAssetValue(asset);
  const lastUpdate =
    asset.lastPriceUpdate instanceof Date
      ? asset.lastPriceUpdate
      : new Date();
  const assetClassColor = getAssetClassColor(asset.assetClass);

  const hasGainLoss = asset.averageCost && asset.averageCost > 0;
  let gainLoss = 0;
  let gainLossPercentage = 0;
  if (hasGainLoss) {
    gainLoss = calculateUnrealizedGains(asset);
    const costBasis = asset.quantity * asset.averageCost!;
    gainLossPercentage = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
  }

  const isPositive = gainLoss > 0;
  const isNegative = gainLoss < 0;
  const gainLossColor = isPositive
    ? 'text-green-600'
    : isNegative
    ? 'text-red-600'
    : 'text-gray-600';

  return (
    <Card className={isManualPrice ? 'bg-amber-50' : ''}>
      <CardContent className="p-4">
        {/* Header: Nome + Badge Classe */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-base text-gray-900">
              {asset.name}
            </h3>
            {asset.ticker && (
              <p className="text-sm text-gray-500 mt-0.5">{asset.ticker}</p>
            )}
          </div>
          <Badge
            className="ml-2"
            style={{
              backgroundColor: `${assetClassColor}20`,
              color: assetClassColor,
              border: `1px solid ${assetClassColor}40`,
            }}
          >
            {formatAssetName(asset.assetClass)}
          </Badge>
        </div>

        {/* Valore Totale e G/P (prominenti) */}
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500">Valore Totale</p>
              <p className="text-lg font-bold text-gray-900">
                {asset.assetClass === 'realestate' &&
                asset.outstandingDebt &&
                asset.outstandingDebt > 0 ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1 cursor-help">
                          {formatCurrency(value)}
                          <Info className="h-3 w-3 text-gray-400" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p>
                            <strong>Valore lordo:</strong>{' '}
                            {formatCurrency(
                              asset.quantity * asset.currentPrice
                            )}
                          </p>
                          <p>
                            <strong>Debito residuo:</strong>{' '}
                            {formatCurrency(asset.outstandingDebt)}
                          </p>
                          <p>
                            <strong>Valore netto:</strong>{' '}
                            {formatCurrency(value)}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  formatCurrency(value)
                )}
              </p>
            </div>
            {hasGainLoss && (
              <div className="text-right">
                <p className="text-xs text-gray-500">G/P</p>
                <div className={`font-semibold ${gainLossColor}`}>
                  <div className="text-base">
                    {isPositive ? '+' : ''}
                    {formatCurrency(gainLoss)}
                  </div>
                  <div className="text-xs">
                    {isPositive ? '+' : ''}
                    {formatNumber(gainLossPercentage, 2)}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dati base (sempre visibili) */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <span className="text-gray-500">Tipo:</span>{' '}
            <span className="font-medium">{formatAssetName(asset.type)}</span>
          </div>
          <div>
            <span className="text-gray-500">Quantità:</span>{' '}
            <span className="font-medium">
              {formatNumber(asset.quantity, 2)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Prezzo:</span>{' '}
            <span className="font-medium">
              {formatCurrency(asset.currentPrice)}
            </span>
          </div>
          {asset.averageCost && (
            <div>
              <span className="text-gray-500">PMC:</span>{' '}
              <span className="font-medium">
                {formatCurrency(asset.averageCost)}
              </span>
            </div>
          )}
        </div>

        {/* Dettagli collassabili */}
        {showDetails && (
          <div className="grid grid-cols-2 gap-2 text-sm mb-3 pt-2 border-t">
            {asset.totalExpenseRatio && (
              <div>
                <span className="text-gray-500">TER:</span>{' '}
                <span className="font-medium text-purple-600">
                  {asset.totalExpenseRatio.toFixed(2)}%
                </span>
              </div>
            )}
            {asset.taxRate !== undefined && asset.taxRate >= 0 && (
              <div>
                <span className="text-gray-500">Aliquota:</span>{' '}
                <span className="font-medium">{asset.taxRate}%</span>
              </div>
            )}
            {asset.subCategory && (
              <div className="col-span-2">
                <span className="text-gray-500">Sottocategoria:</span>{' '}
                <span className="font-medium">{asset.subCategory}</span>
              </div>
            )}
            <div className="col-span-2">
              <span className="text-gray-500">Ultimo Agg.:</span>{' '}
              <span className="font-medium">
                {format(lastUpdate, 'dd/MM/yyyy HH:mm', { locale: it })}
              </span>
            </div>
          </div>
        )}

        {/* Toggle dettagli */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full mb-3"
        >
          {showDetails ? (
            <>
              Nascondi dettagli <ChevronUp className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              Mostra dettagli <ChevronDown className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        {/* Action buttons */}
        <div className="flex gap-2">
          {onCalculateTaxes && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCalculateTaxes(asset)}
              className="flex-1"
            >
              <Calculator className="mr-2 h-4 w-4 text-blue-600" />
              Tasse
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(asset)}
            className="flex-1"
          >
            <Pencil className="mr-2 h-4 w-4" />
            Modifica
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm('Sei sicuro di voler eliminare questo asset?')) {
                onDelete(asset.id);
              }
            }}
            className="flex-1"
          >
            <Trash2 className="mr-2 h-4 w-4 text-red-500" />
            Elimina
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
