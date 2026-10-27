/**
 * Fund identity over the wire — what `GET /api/portfolio/fund-identity` answers, one result per
 * product name asked. The judgement itself lives in `lib/utils/fundIdentity.ts`; this file only
 * describes the shape the route and the import preview exchange.
 */
import type { FundIdentity, FundIdentityStatus } from '@/lib/utils/fundIdentity';

/**
 * `unavailable` is NOT `none`: it says the service could not ask (no `EODHD_API_TOKEN`, EODHD
 * refusing or unreachable). The import preview must not blame the fund for the app's silence.
 */
export type FundIdentityAnswerStatus = FundIdentityStatus | 'unavailable';

export interface FundIdentityResult {
  /** The product name exactly as the caller asked it — the caller keys its own rows by this. */
  query: string;
  status: FundIdentityAnswerStatus;
  identity?: FundIdentity;
  /** Hits EODHD answered: 0 is «sconosciuto», >0 says it knows other share classes. */
  candidateCount: number;
}

export interface FundIdentitiesResponse {
  results: FundIdentityResult[];
}
