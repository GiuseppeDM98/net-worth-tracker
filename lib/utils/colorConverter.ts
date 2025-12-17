// lib/utils/colorConverter.ts
// Color conversion utilities for OKLCh to Hex format
// Used to make OKLCh colors compatible with html2canvas during PDF export

/**
 * Check if a color string is in OKLCh format
 *
 * @param colorString - Color string to check (e.g., "oklch(0.5 0.1 180)")
 * @returns true if the string matches OKLCh format
 */
export function isOklchColor(colorString: string): boolean {
  if (!colorString || typeof colorString !== 'string') return false;
  return colorString.trim().toLowerCase().startsWith('oklch(');
}

/**
 * Convert OKLCh color to hex format for html2canvas compatibility
 *
 * OKLCh is a perceptually uniform color space introduced in CSS Color Module Level 4.
 * html2canvas 1.4.1 does not support OKLCh parsing, so we convert to hex/sRGB.
 *
 * Conversion pipeline:
 * 1. OKLCh (L, C, H) → OKLab (L, a, b) using polar to Cartesian conversion
 * 2. OKLab → Linear sRGB using matrix transformation (D65 illuminant)
 * 3. Linear sRGB → sRGB using gamma correction (γ = 2.4)
 * 4. sRGB → Hex string (#RRGGBB)
 *
 * @param oklchString - OKLCh color string (e.g., "oklch(0.5 0.1 180)" or "oklch(50% 0.1 180 / 0.8)")
 * @returns Hex color string (e.g., "#7f9fb3") or #ffffff as fallback
 *
 * @see https://www.w3.org/TR/css-color-4/#the-oklch-notation
 * @see https://bottosson.github.io/posts/oklab/
 */
export function convertOklchToHex(oklchString: string): string {
  try {
    // Parse OKLCh values using regex
    // Format: oklch(L C H) or oklch(L C H / alpha)
    // L = 0-1 or 0%-100%, C = 0-0.4 typically, H = 0-360deg
    const match = oklchString.match(
      /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)/i
    );

    if (!match) {
      console.warn(`Failed to parse OKLCh string: ${oklchString}`);
      return '#ffffff'; // Fallback to white
    }

    let L = parseFloat(match[1]);
    const C = parseFloat(match[2]);
    const H = parseFloat(match[3]);

    // Convert percentage lightness to 0-1 range
    if (match[1].includes('%')) {
      L = L / 100;
    }

    // Validate ranges
    if (isNaN(L) || isNaN(C) || isNaN(H)) {
      console.warn(`Invalid OKLCh values: L=${L}, C=${C}, H=${H}`);
      return '#ffffff';
    }

    // Step 1: Convert OKLCh to OKLab (polar to Cartesian)
    const hueRadians = (H * Math.PI) / 180;
    const a = C * Math.cos(hueRadians);
    const b = C * Math.sin(hueRadians);

    // Step 2: Convert OKLab to Linear RGB
    // Using the inverse of the OKLab → LMS → Linear RGB transformation
    // First: OKLab → LMS
    const l = L + 0.3963377774 * a + 0.2158037573 * b;
    const m = L - 0.1055613458 * a - 0.0638541728 * b;
    const s = L - 0.0894841775 * a - 1.2914855480 * b;

    // LMS values are in the range [0, 1], apply cube to get linear LMS
    const lr = l * l * l;
    const mr = m * m * m;
    const sr = s * s * s;

    // Second: Linear LMS → Linear RGB (D65 illuminant)
    const rLinear = +4.0767416621 * lr - 3.3077115913 * mr + 0.2309699292 * sr;
    const gLinear = -1.2684380046 * lr + 2.6097574011 * mr - 0.3413193965 * sr;
    const bLinear = -0.0041960863 * lr - 0.7034186147 * mr + 1.7076147010 * sr;

    // Step 3: Convert Linear RGB to sRGB (gamma correction)
    const r = linearToSRGB(rLinear);
    const g = linearToSRGB(gLinear);
    const b_srgb = linearToSRGB(bLinear);

    // Step 4: Convert sRGB to hex
    const rHex = Math.round(r * 255).toString(16).padStart(2, '0');
    const gHex = Math.round(g * 255).toString(16).padStart(2, '0');
    const bHex = Math.round(b_srgb * 255).toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;

  } catch (error) {
    console.error(`Error converting OKLCh to hex: ${oklchString}`, error);
    return '#ffffff'; // Fallback to white on error
  }
}

/**
 * Convert Linear RGB value to sRGB (apply gamma correction)
 *
 * @param value - Linear RGB value in range [0, 1]
 * @returns sRGB value in range [0, 1]
 */
function linearToSRGB(value: number): number {
  // Clamp to valid range
  const clamped = Math.max(0, Math.min(1, value));

  // Apply gamma correction (γ = 2.4)
  if (clamped <= 0.0031308) {
    return 12.92 * clamped;
  } else {
    return 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  }
}
