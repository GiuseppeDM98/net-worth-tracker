// The tile shell moved to components/ui/tile.tsx when the shell was redesigned (the first
// propagation after the Panoramica); this re-export keeps the Panoramica's imports stable.
export {
  Tile as OverviewTile,
  TILE_EYEBROW_CLASS,
  TILE_SUB_EYEBROW_CLASS,
  TILE_CELL_CLASS,
} from '@/components/ui/tile';
