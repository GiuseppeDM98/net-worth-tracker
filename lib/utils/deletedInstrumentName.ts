/**
 * The ONE word for a trade whose asset no longer exists. Its own module so the sales verdict
 * (`periodSales`, on the Panoramica and in the email) can name an orphan without importing the sold-out
 * group's words, which only Strumenti reads: a shared import would put them in a chunk every dashboard route loads.
 * `instrumentArchive.ts` re-exports it.
 */
export const DELETED_INSTRUMENT_NAME = 'Strumento eliminato';
