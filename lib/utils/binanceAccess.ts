/**
 * Binance is wired to ONE server-side API key (one account per deploy), so only its owner may see
 * the tile or call the routes. The UI hides it; the routes enforce it.
 */
const BINANCE_ALLOWED_EMAIL = 'riccardo.maistri95@gmail.com';

export function canUseBinance(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === BINANCE_ALLOWED_EMAIL;
}
