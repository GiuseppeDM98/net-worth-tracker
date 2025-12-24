'use client';

import { useState } from 'react';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface ExpenseCardProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Math.abs(amount));
};

const formatDate = (date: Date | string | Timestamp): string => {
  const dateObj = date instanceof Date ? date : date instanceof Timestamp ? date.toDate() : new Date(date);
  return format(dateObj, 'dd/MM/yyyy', { locale: it });
};

const getTypeBadgeColor = (type: ExpenseType): string => {
  switch (type) {
    case 'income':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'fixed':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'variable':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'debt':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getTypeLabel = (type: ExpenseType): string => {
  return EXPENSE_TYPE_LABELS[type];
};

export function ExpenseCard({ expense, onEdit, onDelete }: ExpenseCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Card>
      <CardContent className="p-4">
        {/* Header: Data + Tipo Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-base text-gray-900">
              {formatDate(expense.date)}
            </p>
            {expense.isRecurring && (
              <Calendar className="h-4 w-4 text-muted-foreground" aria-label="Voce ricorrente" />
            )}
          </div>
          <Badge className={`${getTypeBadgeColor(expense.type)} text-xs font-semibold border`}>
            {getTypeLabel(expense.type)}
          </Badge>
        </div>

        {/* Importo (prominente) */}
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Importo</p>
          <div
            className={`flex items-center gap-2 text-xl font-bold ${
              expense.type === 'income' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {expense.type === 'income' ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )}
            <span>{formatCurrency(expense.amount)}</span>
          </div>
        </div>

        {/* Categoria e Sottocategoria (sempre visibili) */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <span className="text-gray-500">Categoria:</span>{' '}
            <span className="font-medium">{expense.categoryName}</span>
          </div>
          <div>
            <span className="text-gray-500">Sotto-cat:</span>{' '}
            <span className="font-medium text-gray-700">
              {expense.subCategoryName || '-'}
            </span>
          </div>
        </div>

        {/* Dettagli collassabili */}
        {showDetails && (
          <div className="text-sm mb-3 pt-2 border-t space-y-2">
            {expense.notes && (
              <div>
                <span className="text-gray-500">Note:</span>{' '}
                <span className="font-medium text-gray-700">{expense.notes}</span>
              </div>
            )}
            {expense.isInstallment && expense.installmentNumber && expense.installmentTotal && (
              <div>
                <Badge variant="outline" className="text-xs">
                  Rata {expense.installmentNumber}/{expense.installmentTotal}
                </Badge>
              </div>
            )}
            {expense.link && (
              <div>
                <a
                  href={expense.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                >
                  <ExternalLink className="h-3 w-3" />
                  Apri link
                </a>
              </div>
            )}
          </div>
        )}

        {/* Toggle dettagli */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full mb-3 text-xs"
        >
          {showDetails ? (
            <>
              Nascondi dettagli <ChevronUp className="ml-2 h-3 w-3" />
            </>
          ) : (
            <>
              Mostra dettagli <ChevronDown className="ml-2 h-3 w-3" />
            </>
          )}
        </Button>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(expense)} className="flex-1">
            <Pencil className="mr-2 h-4 w-4" />
            Modifica
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDelete(expense)} className="flex-1">
            <Trash2 className="mr-2 h-4 w-4 text-red-500" />
            Elimina
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
