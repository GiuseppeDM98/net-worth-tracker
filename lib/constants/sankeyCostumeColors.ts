/** The theme tokens a costumed Sankey reads as hex (Nivo takes no CSS colour: doc/guide/grafici.md). */
export const SANKEY_COSTUME_TOKEN = {
  slot1: '--chart-1', slot2: '--chart-2', slot3: '--chart-3', slot4: '--chart-4', slot5: '--chart-5',
  slot6: '--chart-6', slot7: '--chart-7', slot8: '--chart-8', slot9: '--chart-9', positive: '--positive',
} as const;
export type SankeyCostumeKey = keyof typeof SANKEY_COSTUME_TOKEN;
