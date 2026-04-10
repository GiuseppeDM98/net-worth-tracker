import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

const COLLECTION = 'userPreferences';

export type ColorTheme = 'default' | 'solar-dusk' | 'elegant-luxury' | 'midnight-bloom' | 'cyberpunk' | 'retro-arcade';

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
