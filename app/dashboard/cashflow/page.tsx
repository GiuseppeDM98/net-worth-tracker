import { CashflowPageClient } from '@/components/cashflow/CashflowPageClient';

/**
 * Cashflow page (2026-11: a server component in front of the client body, as the Assistente's).
 * Its one job is to read whether the Assistente is configured — `ANTHROPIC_API_KEY` exists on the
 * server alone — for the bridge «Chiedi all'Assistente» on Tracciamento. The body sits under the
 * dashboard's `ProtectedRoute`, so its `useSearchParams` needs no `Suspense` (doc/guide/shell.md).
 */
export default function CashflowPage() {
  return <CashflowPageClient assistantConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
