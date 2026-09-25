/**
 * Imposta di bollo on a conto corrente held by a private individual: a FLAT 34,20 € a year, due
 * only when the balance is above 5.000 € — not a share of the balance. Securities and every other
 * financial product pay the proportional rate the Impostazioni set (0,2% by default), which is
 * why the two rules live apart: `calculateStampDuty` (lib/services/assetService.ts) reads the
 * checking-account pair from here and takes the rate as a parameter.
 *
 * Client-safe and import-free: the settings narrative (SDK-free by rule) reads it too.
 */

/** The balance above which a checking account pays the duty. */
export const CHECKING_ACCOUNT_STAMP_DUTY_THRESHOLD_EUR = 5000;

/** The flat annual duty a checking account above the threshold pays. */
export const CHECKING_ACCOUNT_STAMP_DUTY_EUR = 34.2;
