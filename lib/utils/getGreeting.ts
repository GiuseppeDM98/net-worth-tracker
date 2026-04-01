// Contextual greeting based on hour of day (Europe/Rome).
// Pure function — caller is responsible for extracting the hour from the correct timezone.
// Hour must be in 0-23 range.

export type GreetingResult = { greeting: string; subtitle: string };

export function getGreeting(hour: number): GreetingResult {
  if (hour >= 5 && hour < 12) {
    return { greeting: 'Buongiorno', subtitle: 'Ecco il tuo patrimonio di stamattina' };
  }
  if (hour >= 12 && hour < 18) {
    return { greeting: 'Buon pomeriggio', subtitle: 'Aggiornamento pomeridiano' };
  }
  if (hour >= 18 && hour < 22) {
    return { greeting: 'Buonasera', subtitle: 'Riepilogo della giornata' };
  }
  // 22-4: late night / early morning
  return { greeting: 'Buonanotte', subtitle: 'Sei sveglio tardi — ecco il tuo portafoglio' };
}
