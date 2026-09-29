import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ColorTheme } from '@/lib/constants/colorTheme';

const COLLECTION = 'userPreferences';

// The union is derived from `COLOR_THEMES` in lib/constants/colorTheme.ts, the list the
// pre-hydration script also accepts; re-exported so the consumers of this service keep their import.
export type { ColorTheme };

export interface UserPreferences {
  colorTheme?: ColorTheme;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const ref = doc(db, COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  return snap.data() as UserPreferences;
}

export async function setUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  const ref = doc(db, COLLECTION, userId);
  await setDoc(ref, prefs, { merge: true });
}
