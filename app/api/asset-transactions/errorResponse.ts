import { NextResponse } from 'next/server';
import { getApiAuthErrorResponse } from '@/lib/server/apiAuth';
import { LedgerValidationError } from '@/lib/utils/assetTransactionUtils';
import { TradeUseCaseError } from '@/lib/server/assetTransactionUseCase';
import { TradeFxUnavailableError } from '@/lib/server/tradeFxService';

/**
 * Translate a trade-ledger error into its HTTP response (controller layer — domain errors carry
 * their own Italian, user-displayable messages, forwarded verbatim). Shared by the three routes:
 *   - auth errors (401/403/400)            → getApiAuthErrorResponse
 *   - LedgerValidationError (over-sell, …) → 422
 *   - TradeUseCaseError (meta/type/date/…) → its own status
 *   - TradeFxUnavailableError              → 503
 *   - anything else                        → 500 (generic, logged)
 */
export function getTradeErrorResponse(error: unknown, operation: string): NextResponse {
  const authResponse = getApiAuthErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof LedgerValidationError) {
    return NextResponse.json({ error: error.userMessage }, { status: 422 });
  }

  if (error instanceof TradeUseCaseError) {
    return NextResponse.json({ error: error.userMessage }, { status: error.status });
  }

  if (error instanceof TradeFxUnavailableError) {
    return NextResponse.json(
      { error: `Impossibile recuperare il cambio per la valuta ${error.currency}. Riprova più tardi.` },
      { status: 503 }
    );
  }

  console.error(`[${operation}] Unexpected error:`, error);
  return NextResponse.json({ error: 'Errore durante l\'operazione sul registro.' }, { status: 500 });
}
