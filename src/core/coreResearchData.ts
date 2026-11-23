import beautyCushionImg from '../assets/images/beauty_cushion_compact_1795176863543.jpg';
import beautyNiacinamideImg from '../assets/images/beauty_niacinamide_serum_1795176864293.jpg';
import beautySunscreenImg from '../assets/images/beauty_uv_serum_sunscreen_1795176863670.jpg';
import beautyLipTintImg from '../assets/images/beauty_velvet_lip_tint_1795176863663.jpg';
import fashionBagImg from '../assets/images/fashion_leather_shoulder_bag_1795176863933.jpg';
import fashionBlazerImg from '../assets/images/fashion_linen_blazer_1795176864857.jpg';
import fashionDressImg from '../assets/images/fashion_ribbed_knit_dress_1795176862505.jpg';
import fashionTrousersImg from '../assets/images/fashion_wide_trousers_1795176861834.jpg';
import { LATEST_RESEARCH_SESSION_STORAGE_KEY } from '../utils/researchHistoryStorage';
import type { ResearchProduct } from '../types/product';

export type OrbitalResearchLens = 'overall' | 'profit' | 'sales' | 'low-comp';

export interface OrbitalResearchProduct {
  id: string;
  name: string;
  categoryLabel: string;
  shopName: string;
  imageUrl: string | null;
  priceThb: number;
  commissionPct: number;
  commissionThb: number;
  monthlySales: number;
  monthlyRevenueThb: number;
  growthPct: number;
  overallScore: number;
  demandScore: number;
  profitScore: number;
  lowCompScore: number;
  aiVideoScore: number;
  competitionLabel: 'Low' | 'Moderate' | 'High';
  insight: string;
  angleTag: string;
}

const CURATED_CORE_PRODUCTS: ReadonlyArray<OrbitalResearchProduct> = [
  {
    id: 'sp-core-uv-serum',
    name: 'Aqua Glass UV Serum SPF50+ PA++++',
    categoryLabel: 'Skincare',
    shopName: 'Lumina Lab TH',
    imageUrl: beautySunscreenImg,
    priceThb: 349,
    commissionPct: 20,
    commissionThb: 70,
    monthlySales: 18400,
    monthlyRevenueThb: 6421600,
    growthPct: 68,
    overallScore: 95,
    demandScore: 96,
    profitScore: 92,
    lowCompScore: 76,
    aiVideoScore: 95,
    competitionLabel: 'Moderate',
    insight: 'Zero-white-cast outdoor UV camera tests convert 2.4x faster in Bangkok midday humidity hooks.',
    angleTag: 'UV Camera Demo',
  },
  {
    id: 'sp-core-niacinamide',
    name: '10% Niacinamide + Zinc Brightening Drop',
    categoryLabel: 'Cosmetics',
    shopName: 'DermPure Official',
    imageUrl: beautyNiacinamideImg,
    priceThb: 289,
    commissionPct: 22,
    commissionThb: 64,
    monthlySales: 14900,
    monthlyRevenueThb: 4306100,
    growthPct: 54,
    overallScore: 93,
    demandScore: 91,
    profitScore: 95,
    lowCompScore: 81,
    aiVideoScore: 90,
    competitionLabel: 'Low',
    insight: 'High repeat-purchase rate with 22% affiliate payout and strong 14-day glass-skin transformation hooks.',
    angleTag: '14-Day Routine',
  },
  {
    id: 'sp-core-cushion',
    name: 'Soft Matte Silk Cushion Compact',
    categoryLabel: 'Makeup',
    shopName: 'Sora Studio BKK',
    imageUrl: beautyCushionImg,
    priceThb: 459,
    commissionPct: 18,
    commissionThb: 83,
    monthlySales: 12600,
    monthlyRevenueThb: 5783400,
    growthPct: 47,
    overallScore: 91,
    demandScore: 93,
    profitScore: 89,
    lowCompScore: 72,
    aiVideoScore: 96,
    competitionLabel: 'Moderate',
    insight: 'One-tap half-face coverage comparisons and waterproof tissue tests drive strong impulse checkouts.',
    angleTag: 'Half-Face Test',
  },
  {
    id: 'sp-core-shoulder-bag',
    name: 'Structured Vegan Leather Shoulder Bag',
    categoryLabel: 'Accessories',
    shopName: 'Atelier Khao',
    imageUrl: fashionBagImg,
    priceThb: 590,
    commissionPct: 19,
    commissionThb: 112,
    monthlySales: 7850,
    monthlyRevenueThb: 4631500,
    growthPct: 62,
    overallScore: 90,
    demandScore: 84,
    profitScore: 96,
    lowCompScore: 88,
    aiVideoScore: 89,
    competitionLabel: 'Low',
    insight: 'Highest baht-per-sale affiliate margin with low saturation; "What fits inside" 12s clips lead conversions.',
    angleTag: 'What Fits Inside',
  },
  {
    id: 'sp-core-lip-tint',
    name: 'Cloud Velvet Dewy Lip Tint',
    categoryLabel: 'Beauty',
    shopName: 'Miel Cosmetics TH',
    imageUrl: beautyLipTintImg,
    priceThb: 199,
    commissionPct: 24,
    commissionThb: 48,
    monthlySales: 23100,
    monthlyRevenueThb: 4596900,
    growthPct: 79,
    overallScore: 89,
    demandScore: 98,
    profitScore: 86,
    lowCompScore: 64,
    aiVideoScore: 94,
    competitionLabel: 'Moderate',
    insight: 'Impulse-friendly ฿199 price point with rapid 3-shade arm-swatch videos fueling viral velocity.',
    angleTag: '3-Shade Swatch',
  },
  {
    id: 'sp-core-wide-trousers',
    name: 'High-Waist Tailored Wide-Leg Trousers',
    categoryLabel: 'Womenswear',
    shopName: 'Mora Collective',
    imageUrl: fashionTrousersImg,
    priceThb: 420,
    commissionPct: 16,
    commissionThb: 67,
    monthlySales: 11200,
    monthlyRevenueThb: 4704000,
    growthPct: 38,
    overallScore: 87,
    demandScore: 88,
    profitScore: 82,
    lowCompScore: 79,
    aiVideoScore: 91,
    competitionLabel: 'Low',
    insight: 'Petite-to-tall 155cm vs 170cm fit comparisons lower return friction and boost cart add rates.',
    angleTag: 'Height Fit Check',
  },
  {
    id: 'sp-core-linen-blazer',
    name: 'Breathable Resort Linen Oversized Blazer',
    categoryLabel: 'Womenswear',
    shopName: 'Vela Loom TH',
    imageUrl: fashionBlazerImg,
    priceThb: 690,
    commissionPct: 17,
    commissionThb: 117,
    monthlySales: 5900,
    monthlyRevenueThb: 4071000,
    growthPct: 51,
    overallScore: 86,
    demandScore: 79,
    profitScore: 94,
    lowCompScore: 91,
    aiVideoScore: 86,
    competitionLabel: 'Low',
    insight: 'Blue-ocean office-to-cafe styling niche with the highest baht payout per conversion and low creator density.',
    angleTag: '3 Ways To Style',
  },
  {
    id: 'sp-core-knit-dress',
    name: 'Sculpted Ribbed Midi Knit Dress',
    categoryLabel: 'Womenswear',
    shopName: 'Nara Silhouette',
    imageUrl: fashionDressImg,
    priceThb: 489,
    commissionPct: 15,
    commissionThb: 73,
    monthlySales: 8640,
    monthlyRevenueThb: 4224960,
    growthPct: 44,
    overallScore: 84,
    demandScore: 85,
    profitScore: 81,
    lowCompScore: 83,
    aiVideoScore: 92,
    competitionLabel: 'Low',
    insight: 'Strong visual silhouette for 360-degree turn reels and cafe daylight lifestyle cuts.',
    angleTag: '360° Fit Turn',
  },
];

const FALLBACK_IMAGES = [
  beautySunscreenImg,
  beautyNiacinamideImg,
  beautyCushionImg,
  fashionBagImg,
  beautyLipTintImg,
  fashionTrousersImg,
  fashionBlazerImg,
  fashionDressImg,
];

function mapStoredResearchProduct(
  p: ResearchProduct,
  index: number
): OrbitalResearchProduct {
  const priceThb = p.priceThb ?? p.kalodataMetrics?.unitPriceThb ?? 399;
  const commissionPct = p.commissionRate ?? p.kalodataMetrics?.commissionRatePct ?? 16;
  const commissionThb =
    p.estimatedCommissionPerSaleThb ?? Math.round((priceThb * commissionPct) / 100);
  const monthlySales = p.kalodataMetrics?.salesVolume ?? 6500;
  const monthlyRevenueThb =
    p.kalodataMetrics?.revenueThb ?? Math.round(monthlySales * priceThb);
  const growthPct = Math.round((p.kalodataMetrics?.revenueGrowthRate ?? 0.35) * 100);
  const overallScore = Math.max(55, Math.min(99, Math.round(p.opportunityScore || 82)));
  const lowCompScore =
    p.competitionLevel === 'Low' ? 90 : p.competitionLevel === 'Moderate' ? 74 : 52;
  const demandScore =
    p.demandLevel === 'High' ? 94 : p.demandLevel === 'Growing' ? 86 : 75;
  const profitScore = Math.min(98, Math.max(60, Math.round(52 + commissionPct * 2.1)));
  const aiVideoScore =
    p.aiVideoSuitability === 'High' ? 94 : p.aiVideoSuitability === 'Good' ? 84 : 72;

  return {
    id: p.id,
    name: p.name,
    categoryLabel: p.subCategory || p.category,
    shopName: p.shopName || 'TikTok Shop TH',
    imageUrl: p.imageVerified && p.imageUrl ? p.imageUrl : FALLBACK_IMAGES[index % FALLBACK_IMAGES.length],
    priceThb: Math.round(priceThb),
    commissionPct: Math.round(commissionPct),
    commissionThb: Math.round(commissionThb),
    monthlySales: Math.round(monthlySales),
    monthlyRevenueThb: Math.round(monthlyRevenueThb),
    growthPct,
    overallScore,
    demandScore,
    profitScore,
    lowCompScore,
    aiVideoScore,
    competitionLabel: p.competitionLevel || 'Moderate',
    insight: p.whyChooseEn || 'Strong Thailand TikTok Shop conversion velocity with healthy affiliate margin.',
    angleTag: p.videoIdeas?.[0]?.formatEn || 'Product Demo',
  };
}

/**
 * Loads latest locally persisted SiamPick research session if available,
 * otherwise returns curated studio-photographed Thailand TikTok Shop winning products.
 */
export function loadOrbitalResearchProducts(): OrbitalResearchProduct[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LATEST_RESEARCH_SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { products?: ResearchProduct[] };
        if (Array.isArray(parsed?.products) && parsed.products.length >= 3) {
          return parsed.products.slice(0, 8).map(mapStoredResearchProduct);
        }
      }
    }
  } catch {
    // Fall back cleanly to curated SiamPick studio products
  }
  return [...CURATED_CORE_PRODUCTS];
}

export function getLensMetricScore(
  product: OrbitalResearchProduct,
  lens: OrbitalResearchLens
): number {
  switch (lens) {
    case 'profit':
      return product.profitScore;
    case 'sales':
      return product.demandScore;
    case 'low-comp':
      return product.lowCompScore;
    default:
      return product.overallScore;
  }
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

const SAVED_ORBITAL_KEY = 'siampick_orbital_saved_ids_v1';

export function loadSavedOrbitalIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SAVED_ORBITAL_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function persistSavedOrbitalIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(SAVED_ORBITAL_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage quota errors
  }
}
