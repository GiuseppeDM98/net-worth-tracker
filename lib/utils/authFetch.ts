import { auth } from '@/lib/firebase/config';

/**
 * Attach the current Firebase ID token to private API requests.
 *
 * The app already knows the signed-in user client-side, but route handlers that
 * use the Admin SDK must still verify the caller explicitly.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Utente non autenticato');
  }

  const idToken = await currentUser.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${idToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
