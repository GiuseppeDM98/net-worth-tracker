// Maps internal asset class/type identifiers to display names.
// Shared between AssetManagementTab and AssetCard to keep labels in sync.
const ASSET_NAME_MAP: Record<string, string> = {
  realestate: 'Real Estate',
  equity: 'Equity',
  bonds: 'Bonds',
  crypto: 'Crypto',
  cash: 'Cash',
  commodity: 'Commodity',
  trendFollowing: 'Trend Following',
  carry: 'Carry',
};

export function formatAssetClassName(name: string): string {
  return ASSET_NAME_MAP[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1);
}
