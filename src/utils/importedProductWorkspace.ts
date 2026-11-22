import type {
  ConfidenceLevel,
  DataStatus,
  LinkImportExecuteResponse,
  LinkImportInspectResponse,
  OpportunityEvaluation,
  ProductCategory,
  ResearchProduct,
  ResearchSourceItem,
} from '../types/product.ts';
import { getCategoryLabel } from './categoryRegistry.ts';
import {
  extractCanonicalTikTokNumericId,
  getTikTokShopProductUrl,
  isSafeHttpUrl,
  resolveProductImageDisplayConfig,
} from './format.ts';
import {
  evaluateProductOpportunity,
  getCanonicalProductId,
  normalizeDataStatus,
} from './scoring.ts';

export const IMPORTED_WORKSPACE_STORAGE_KEY = 'siampick_imported_workspace_v1';
export const IMPORTED_WORKSPACE_SCHEMA_VERSION = 1;

export type ImportedWorkspaceDataSource =
  | 'kalodata-api'
  | 'server-cache'
  | 'client-cache'
  | 'in-flight-shared'
  | 'existing-workspace';

export interface ImportedWorkspaceContext {
  schemaVersion: number;
  canonicalProductId: string;
  product: ResearchProduct;
  importedAt: string;
  dataSource: ImportedWorkspaceDataSource;
  apiCallsMade: number;
  estimatedCreditsCharged: number;
  canonicalUrl: string | null;
  resolvedUrl: string | null;
  redirectHops: string[];
  alreadyExistedInWorkspace: boolean;
  existingSources: Array<'results' | 'saved' | 'history'>;
  unmappedCategoryNoteEn?: string;
  unmappedCategoryNoteMy?: string;
}

export interface ImportedWorkspaceVerificationRow {
  key:
    | 'price'
    | 'commission'
    | 'sales'
    | 'shop'
    | 'competition'
    | 'reviews'
    | 'image';
  labelEn: string;
  labelMy: string;
  valueEn: string;
  valueMy: string;
  status: DataStatus;
}

export interface ImportedProductOverviewModel {
  canonicalProductId: string;
  numericProductId: string | null;
  productName: string;
  productNameMy: string;
  category: ProductCategory;
  categoryLabelEn: string;
  categoryLabelMy: string;
  subCategory: string;
  subCategoryMy: string;
  imageConfig: ReturnType<typeof resolveProductImageDisplayConfig>;
  imageStatus: DataStatus;
  tiktokShopUrl: string | null;
  kalodataUrl: string | null;
  // Shop & fulfillment
  shopName: string;
  shopAvailable: boolean;
  sellerId: string | null;
  shopSellerType: string | null;
  dispatchHub: string;
  deliveryType: string | null;
  sellerStatus: DataStatus;
  sellerReliabilityStatus: DataStatus;
  // Price
  priceThb: number | null;
  minPriceThb: number | null;
  maxPriceThb: number | null;
  skuCount: number | null;
  priceStatus: DataStatus;
  // Sales & Revenue
  salesVolume: number | null;
  revenueThb: number | null;
  revenueGrowthRate: number | null;
  videoRevenueThb: number | null;
  liveRevenueThb: number | null;
  showcaseRevenueThb: number | null;
  shoppingMallRevenueThb: number | null;
  salesStatus: DataStatus;
  dateRange: string | null;
  // Commission
  commissionRate: number | null;
  commissionVerified: boolean;
  estimatedCommissionPerSaleThb: number | null;
  commissionStatus: DataStatus;
  // Competition & Reviews
  creatorNumber: number | null;
  videoNumber: number | null;
  liveNumber: number | null;
  competitionStatus: DataStatus;
  reviewCount: number | null;
  reviewCountStatus: DataStatus;
  customerRating: number | null;
  customerRatingStatus: DataStatus;
  feedbackStatus: DataStatus;
  // Evaluation
  evaluation: OpportunityEvaluation;
  opportunityScore: number;
  confidenceLevel: ConfidenceLevel;
  confidencePct: number;
  verifiedCount: number;
  totalCriteria: number;
  // Source, verification breakdown & unavailable list
  dataSource: ImportedWorkspaceDataSource;
  sourceTitleEn: string;
  sourceTitleMy: string;
  sourceDetailEn: string;
  sourceDetailMy: string;
  apiCallsMade: number;
  estimatedCreditsCharged: number;
  redirectHopsCount: number;
  resolvedUrl: string | null;
  sources: ResearchSourceItem[];
  verificationRows: ImportedWorkspaceVerificationRow[];
  unavailableItemsEn: string[];
  unavailableItemsMy: string[];
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildImportedWorkspaceContextFromExecute(
  result: LinkImportExecuteResponse,
  importedAt: string = new Date().toISOString()
): ImportedWorkspaceContext {
  const canonicalProductId = getCanonicalProductId(result.product);
  return {
    schemaVersion: IMPORTED_WORKSPACE_SCHEMA_VERSION,
    canonicalProductId,
    product: result.product,
    importedAt: result.product.researchedAt ?? importedAt,
    dataSource: result.dataSource,
    apiCallsMade: result.apiCallsMade,
    estimatedCreditsCharged: result.estimatedCreditsCharged,
    canonicalUrl: result.canonicalUrl ?? null,
    resolvedUrl: result.resolvedUrl ?? null,
    redirectHops: Array.isArray(result.redirectHops) ? result.redirectHops : [],
    alreadyExistedInWorkspace: result.alreadyExistedInWorkspace === true,
    existingSources: [],
    ...(result.unmappedCategoryNoteEn
      ? { unmappedCategoryNoteEn: result.unmappedCategoryNoteEn }
      : {}),
    ...(result.unmappedCategoryNoteMy
      ? { unmappedCategoryNoteMy: result.unmappedCategoryNoteMy }
      : {}),
  };
}

export function buildImportedWorkspaceContextFromExisting(
  product: ResearchProduct,
  options?: {
    inspectResult?: LinkImportInspectResponse | null;
    existingSources?: Array<'results' | 'saved' | 'history'>;
    importedAt?: string;
  }
): ImportedWorkspaceContext {
  const inspectResult = options?.inspectResult ?? null;
  const canonicalProductId = getCanonicalProductId(product);
  const existingSources =
    options?.existingSources ?? inspectResult?.alreadyInWorkspaceSources ?? [];

  return {
    schemaVersion: IMPORTED_WORKSPACE_SCHEMA_VERSION,
    canonicalProductId,
    product,
    importedAt: product.researchedAt ?? options?.importedAt ?? new Date().toISOString(),
    dataSource: 'existing-workspace',
    apiCallsMade: 0,
    estimatedCreditsCharged: 0,
    canonicalUrl: inspectResult?.canonicalUrl ?? getTikTokShopProductUrl(product),
    resolvedUrl: inspectResult?.resolvedUrl ?? null,
    redirectHops: Array.isArray(inspectResult?.redirectHops) ? inspectResult.redirectHops : [],
    alreadyExistedInWorkspace: true,
    existingSources,
  };
}

export function syncImportedWorkspaceProduct(
  current: ImportedWorkspaceContext | null,
  updatedProduct: ResearchProduct
): ImportedWorkspaceContext | null {
  if (!current) return null;
  if (getCanonicalProductId(updatedProduct) !== current.canonicalProductId) {
    return current;
  }
  return {
    ...current,
    product: updatedProduct,
  };
}

export function loadImportedWorkspaceContext(): ImportedWorkspaceContext | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(IMPORTED_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImportedWorkspaceContext> | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.product ||
      typeof parsed.product !== 'object' ||
      typeof parsed.product.id !== 'string' ||
      typeof parsed.product.name !== 'string'
    ) {
      return null;
    }
    return {
      schemaVersion: IMPORTED_WORKSPACE_SCHEMA_VERSION,
      canonicalProductId:
        typeof parsed.canonicalProductId === 'string' && parsed.canonicalProductId.trim()
          ? parsed.canonicalProductId.trim()
          : getCanonicalProductId(parsed.product),
      product: parsed.product,
      importedAt:
        typeof parsed.importedAt === 'string' && parsed.importedAt.trim()
          ? parsed.importedAt
          : parsed.product.researchedAt ?? new Date().toISOString(),
      dataSource:
        parsed.dataSource === 'kalodata-api' ||
        parsed.dataSource === 'server-cache' ||
        parsed.dataSource === 'client-cache' ||
        parsed.dataSource === 'in-flight-shared' ||
        parsed.dataSource === 'existing-workspace'
          ? parsed.dataSource
          : 'existing-workspace',
      apiCallsMade:
        typeof parsed.apiCallsMade === 'number' && Number.isFinite(parsed.apiCallsMade)
          ? parsed.apiCallsMade
          : 0,
      estimatedCreditsCharged:
        typeof parsed.estimatedCreditsCharged === 'number' &&
        Number.isFinite(parsed.estimatedCreditsCharged)
          ? parsed.estimatedCreditsCharged
          : 0,
      canonicalUrl:
        typeof parsed.canonicalUrl === 'string' && isSafeHttpUrl(parsed.canonicalUrl)
          ? parsed.canonicalUrl
          : null,
      resolvedUrl:
        typeof parsed.resolvedUrl === 'string' && isSafeHttpUrl(parsed.resolvedUrl)
          ? parsed.resolvedUrl
          : null,
      redirectHops: Array.isArray(parsed.redirectHops)
        ? parsed.redirectHops.filter((u): u is string => typeof u === 'string')
        : [],
      alreadyExistedInWorkspace: parsed.alreadyExistedInWorkspace === true,
      existingSources: Array.isArray(parsed.existingSources)
        ? parsed.existingSources.filter(
            (s): s is 'results' | 'saved' | 'history' =>
              s === 'results' || s === 'saved' || s === 'history'
          )
        : [],
      ...(typeof parsed.unmappedCategoryNoteEn === 'string'
        ? { unmappedCategoryNoteEn: parsed.unmappedCategoryNoteEn }
        : {}),
      ...(typeof parsed.unmappedCategoryNoteMy === 'string'
        ? { unmappedCategoryNoteMy: parsed.unmappedCategoryNoteMy }
        : {}),
    };
  } catch {
    return null;
  }
}

export function persistImportedWorkspaceContext(context: ImportedWorkspaceContext | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (!context) {
      storage.removeItem(IMPORTED_WORKSPACE_STORAGE_KEY);
      return;
    }
    storage.setItem(IMPORTED_WORKSPACE_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Never disturb primary Saved Products, Research History, or Enrichment Cache on storage failure
  }
}

function fmtThbCompact(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return 'Unavailable';
  return `฿${Math.round(val).toLocaleString('en-US')}`;
}

function describeImportSource(
  context: ImportedWorkspaceContext
): {
  titleEn: string;
  titleMy: string;
  detailEn: string;
  detailMy: string;
} {
  switch (context.dataSource) {
    case 'kalodata-api':
      return {
        titleEn: 'Live Kalodata OpenAPI (Product Detail)',
        titleMy: 'Kalodata OpenAPI တိုက်ရိုက် (Product Detail)',
        detailEn: `Fetched verified Thailand TikTok Shop metrics via Kalodata Product Detail API (${context.apiCallsMade} API call · ${context.estimatedCreditsCharged} cr).`,
        detailMy: `Kalodata Product Detail API မှ တကယ့် Thailand TikTok Shop ဒေတာများကို တိုက်ရိုက်ရယူထားပါသည် (API ${context.apiCallsMade} ကြိမ် · ${context.estimatedCreditsCharged} cr)။`,
      };
    case 'server-cache':
      return {
        titleEn: 'Server Product Detail Cache (0 cr)',
        titleMy: 'Server Product Detail Cache (0 cr)',
        detailEn:
          'Reused verified Kalodata Product Detail cached on the server — 0 extra API calls and 0 credits charged.',
        detailMy:
          'Server Cache ထဲရှိ အတည်ပြုပြီး Kalodata Product Detail ကို ပြန်သုံးထားပါသည် — API ထပ်မခေါ်ဘဲ 0 Credit ဖြစ်ပါသည်။',
      };
    case 'client-cache':
      return {
        titleEn: 'Browser Enrichment Cache (0 cr)',
        titleMy: 'Browser Enrichment Cache (0 cr)',
        detailEn:
          'Hydrated from your local browser Enrichment Cache — 0 Kalodata API calls and 0 credits charged.',
        detailMy:
          'Browser Enrichment Cache မှ ပြန်လည်ဖတ်ယူထားပါသည် — Kalodata API ထပ်မခေါ်ဘဲ 0 Credit ဖြစ်ပါသည်။',
      };
    case 'in-flight-shared':
      return {
        titleEn: 'Shared In-Flight Request (0 extra cr)',
        titleMy: 'မျှဝေသုံးစွဲထားသော Request (0 extra cr)',
        detailEn:
          'Reused an identical in-flight Kalodata import request to prevent duplicate credit charges.',
        detailMy:
          'တူညီနေသော Kalodata Import Request ကို မျှဝေအသုံးပြုထားသဖြင့် Credit နှစ်ထပ် မကုန်ကျပါ။',
      };
    case 'existing-workspace': {
      const originTags =
        context.existingSources.length > 0 ? context.existingSources.join(' / ') : 'workspace';
      return {
        titleEn: `Existing Workspace Record (${originTags} · 0 cr)`,
        titleMy: `Workspace ထဲတွင် ရှိပြီးသား Record (${originTags} · 0 cr)`,
        detailEn:
          'Loaded directly from your existing SiamPick workspace without duplicate imports or extra Kalodata calls.',
        detailMy:
          'SiamPick Workspace ထဲတွင် ရှိပြီးသား Product ကို Duplicate မဖြစ်စေဘဲ API ထပ်မခေါ်ဘဲ ဖွင့်ထားပါသည် (0 cr)။',
      };
    }
  }
}

function appendUniqueNote(list: string[], note: string): void {
  const clean = note.trim();
  if (!clean) return;
  const normalized = clean.toLowerCase();
  if (!list.some((existing) => existing.toLowerCase() === normalized)) {
    list.push(clean);
  }
}

export function deriveImportedProductOverview(
  context: ImportedWorkspaceContext,
  options?: {
    salesWeightPct?: number;
    peerProducts?: readonly ResearchProduct[];
  }
): ImportedProductOverviewModel {
  const product = context.product;
  const m = product.kalodataMetrics;
  const canonicalProductId = getCanonicalProductId(product);
  const numericProductId = extractCanonicalTikTokNumericId(product);

  const evaluation = evaluateProductOpportunity(product, {
    salesWeightPct: options?.salesWeightPct ?? 50,
    peerProducts: options?.peerProducts,
  });

  const imageConfig = resolveProductImageDisplayConfig(product);
  const imageStatus: DataStatus =
    imageConfig.canRender && product.imageVerified ? 'verified' : 'unavailable';

  const priceThb =
    typeof product.priceThb === 'number' && Number.isFinite(product.priceThb) && product.priceThb > 0
      ? product.priceThb
      : typeof m?.unitPriceThb === 'number' && Number.isFinite(m.unitPriceThb) && m.unitPriceThb > 0
        ? m.unitPriceThb
        : null;
  const minPriceThb =
    typeof m?.minPriceThb === 'number' && Number.isFinite(m.minPriceThb) && m.minPriceThb > 0
      ? m.minPriceThb
      : null;
  const maxPriceThb =
    typeof m?.maxPriceThb === 'number' && Number.isFinite(m.maxPriceThb) && m.maxPriceThb > 0
      ? m.maxPriceThb
      : null;
  const skuCount =
    typeof m?.skuCount === 'number' && Number.isFinite(m.skuCount) && m.skuCount > 0
      ? Math.round(m.skuCount)
      : null;
  const priceStatus: DataStatus =
    priceThb !== null ? normalizeDataStatus(product.priceStatus ?? 'verified') : 'unavailable';

  const salesVolume =
    typeof m?.salesVolume === 'number' && Number.isFinite(m.salesVolume) ? m.salesVolume : null;
  const revenueThb =
    typeof m?.revenueThb === 'number' && Number.isFinite(m.revenueThb) ? m.revenueThb : null;
  const revenueGrowthRate =
    typeof m?.revenueGrowthRate === 'number' && Number.isFinite(m.revenueGrowthRate)
      ? m.revenueGrowthRate
      : null;
  const videoRevenueThb =
    typeof m?.videoRevenueThb === 'number' && Number.isFinite(m.videoRevenueThb)
      ? m.videoRevenueThb
      : null;
  const liveRevenueThb =
    typeof m?.liveRevenueThb === 'number' && Number.isFinite(m.liveRevenueThb)
      ? m.liveRevenueThb
      : null;
  const showcaseRevenueThb =
    typeof m?.showcaseRevenueThb === 'number' && Number.isFinite(m.showcaseRevenueThb)
      ? m.showcaseRevenueThb
      : null;
  const shoppingMallRevenueThb =
    typeof m?.shoppingMallRevenueThb === 'number' && Number.isFinite(m.shoppingMallRevenueThb)
      ? m.shoppingMallRevenueThb
      : null;
  const salesStatus: DataStatus =
    salesVolume !== null || revenueThb !== null
      ? normalizeDataStatus(product.salesEvidenceStatus ?? 'verified')
      : 'unavailable';

  const commissionRate =
    product.commissionVerified &&
    typeof product.commissionRate === 'number' &&
    Number.isFinite(product.commissionRate) &&
    product.commissionRate > 0
      ? product.commissionRate
      : typeof m?.commissionRatePct === 'number' &&
          Number.isFinite(m.commissionRatePct) &&
          m.commissionRatePct > 0
        ? m.commissionRatePct
        : null;
  const commissionVerified = commissionRate !== null && product.commissionVerified === true;
  const estimatedCommissionPerSaleThb =
    commissionRate !== null && priceThb !== null
      ? product.estimatedCommissionPerSaleThb ?? Math.round((priceThb * commissionRate) / 100)
      : null;
  const commissionStatus: DataStatus =
    commissionRate !== null
      ? normalizeDataStatus(product.commissionStatus ?? 'verified')
      : 'unavailable';

  const sellerId = m?.sellerId?.trim() ? m.sellerId.trim() : null;
  const rawShopName = product.shopName?.trim() || m?.sellerName?.trim() || '';
  const shopAvailable = Boolean(rawShopName && rawShopName.toLowerCase() !== 'unavailable');
  const shopName = shopAvailable ? rawShopName : 'Unavailable';
  const sellerStatus: DataStatus =
    shopAvailable || sellerId
      ? normalizeDataStatus(product.sellerStatus ?? 'verified')
      : 'unavailable';
  const sellerReliabilityStatus: DataStatus = normalizeDataStatus(
    product.sellerReliabilityStatus ?? (m?.shopEnriched ? 'verified' : shopAvailable || sellerId ? 'unverified' : 'unavailable')
  );

  const creatorNumber =
    typeof m?.creatorNumber === 'number' && Number.isFinite(m.creatorNumber)
      ? m.creatorNumber
      : null;
  const videoNumber =
    typeof m?.videoNumber === 'number' && Number.isFinite(m.videoNumber) ? m.videoNumber : null;
  const liveNumber =
    typeof m?.liveNumber === 'number' && Number.isFinite(m.liveNumber) ? m.liveNumber : null;
  const competitionStatus: DataStatus =
    creatorNumber !== null
      ? normalizeDataStatus(product.competitionStatus ?? 'verified')
      : 'unavailable';

  const reviewCount =
    typeof product.reviewCount === 'number' && Number.isFinite(product.reviewCount)
      ? product.reviewCount
      : typeof m?.productReviewCount === 'number' && Number.isFinite(m.productReviewCount)
        ? m.productReviewCount
        : null;
  const reviewCountStatus: DataStatus =
    reviewCount !== null
      ? normalizeDataStatus(product.reviewCountStatus ?? 'verified')
      : 'unavailable';
  const customerRating =
    typeof product.customerRating === 'number' && Number.isFinite(product.customerRating)
      ? product.customerRating
      : null;
  const customerRatingStatus: DataStatus =
    customerRating !== null
      ? normalizeDataStatus(product.customerRatingStatus ?? 'verified')
      : 'unavailable';
  const feedbackStatus: DataStatus = normalizeDataStatus(product.feedbackStatus ?? 'unavailable');

  const tiktokShopUrl =
    (context.canonicalUrl && isSafeHttpUrl(context.canonicalUrl) ? context.canonicalUrl : null) ??
    getTikTokShopProductUrl(product);
  const kalodataUrl =
    product.sources.find((s) => s.url && s.url.includes('kalodata.com') && isSafeHttpUrl(s.url))
      ?.url ??
    (numericProductId
      ? `https://www.kalodata.com/product/detail?id=${encodeURIComponent(numericProductId)}&region=TH`
      : null);

  const sourceInfo = describeImportSource(context);

  const verificationRows: ImportedWorkspaceVerificationRow[] = [
    {
      key: 'price',
      labelEn: 'Unit Price',
      labelMy: 'Product ဈေးနှုန်း',
      valueEn:
        priceThb !== null
          ? `${fmtThbCompact(priceThb)}${minPriceThb !== null && maxPriceThb !== null && minPriceThb !== maxPriceThb ? ` (${fmtThbCompact(minPriceThb)}–${fmtThbCompact(maxPriceThb)})` : ''}`
          : 'Unavailable',
      valueMy:
        priceThb !== null
          ? `${fmtThbCompact(priceThb)}${minPriceThb !== null && maxPriceThb !== null && minPriceThb !== maxPriceThb ? ` (${fmtThbCompact(minPriceThb)}–${fmtThbCompact(maxPriceThb)})` : ''}`
          : 'Unavailable',
      status: priceStatus,
    },
    {
      key: 'commission',
      labelEn: 'Affiliate Commission',
      labelMy: 'Affiliate ကော်မရှင်',
      valueEn:
        commissionRate !== null
          ? `${commissionRate}%${estimatedCommissionPerSaleThb !== null ? ` (~${fmtThbCompact(estimatedCommissionPerSaleThb)}/sale)` : ''}`
          : 'Unavailable',
      valueMy:
        commissionRate !== null
          ? `${commissionRate}%${estimatedCommissionPerSaleThb !== null ? ` (~${fmtThbCompact(estimatedCommissionPerSaleThb)}/ခု)` : ''}`
          : 'Unavailable',
      status: commissionStatus,
    },
    {
      key: 'sales',
      labelEn: 'Sales & Revenue (GMV)',
      labelMy: 'ရောင်းအားနှင့် ဝင်ငွေ (GMV)',
      valueEn:
        salesVolume !== null || revenueThb !== null
          ? `${salesVolume !== null ? `${salesVolume.toLocaleString('en-US')} units` : 'Units N/A'} · ${revenueThb !== null ? fmtThbCompact(revenueThb) : 'GMV N/A'}`
          : 'Unavailable',
      valueMy:
        salesVolume !== null || revenueThb !== null
          ? `${salesVolume !== null ? `${salesVolume.toLocaleString('en-US')} ခု` : 'အရေအတွက် N/A'} · ${revenueThb !== null ? fmtThbCompact(revenueThb) : 'ဝင်ငွေ N/A'}`
          : 'Unavailable',
      status: salesStatus,
    },
    {
      key: 'shop',
      labelEn: 'Shop & Seller Details',
      labelMy: 'ဆိုင်နှင့် ရောင်းချသူ',
      valueEn: shopAvailable
        ? `${shopName}${m?.shopSellerType ? ` (${m.shopSellerType})` : ' (Basic ID · Shop GMV unverified)'}`
        : sellerId
          ? `Seller #${sellerId}`
          : 'Unavailable',
      valueMy: shopAvailable
        ? `${shopName}${m?.shopSellerType ? ` (${m.shopSellerType})` : ' (အမည်သာ · ဆိုင် GMV မစစ်ရသေး)'}`
        : sellerId
          ? `Seller #${sellerId}`
          : 'Unavailable',
      status: m?.shopEnriched ? 'verified' : sellerStatus === 'verified' ? 'unverified' : 'unavailable',
    },
    {
      key: 'competition',
      labelEn: 'Creator Competition',
      labelMy: 'Creator ပြိုင်ဆိုင်မှု',
      valueEn:
        creatorNumber !== null
          ? `${creatorNumber.toLocaleString('en-US')} creators${videoNumber !== null ? ` · ${videoNumber.toLocaleString('en-US')} videos` : ''}`
          : 'Unavailable',
      valueMy:
        creatorNumber !== null
          ? `Creator ${creatorNumber.toLocaleString('en-US')} ဦး${videoNumber !== null ? ` · Video ${videoNumber.toLocaleString('en-US')} ခု` : ''}`
          : 'Unavailable',
      status: competitionStatus,
    },
    {
      key: 'reviews',
      labelEn: 'Reviews & Star Rating',
      labelMy: 'Review နှင့် Star Rating',
      valueEn:
        customerRating !== null && reviewCount !== null
          ? `${customerRating.toFixed(1)}/5 (${reviewCount.toLocaleString('en-US')} reviews)`
          : reviewCount !== null
            ? `${reviewCount.toLocaleString('en-US')} reviews (Star rating & comment themes ${feedbackStatus === 'verified' ? 'available' : 'unavailable'})`
            : 'Unavailable',
      valueMy:
        customerRating !== null && reviewCount !== null
          ? `${customerRating.toFixed(1)}/5 (Review ${reviewCount.toLocaleString('en-US')} ခု)`
          : reviewCount !== null
            ? `Review ${reviewCount.toLocaleString('en-US')} ခု (Star rating / မှတ်ချက် ${feedbackStatus === 'verified' ? 'ရရှိပြီး' : 'မရရှိသေး'})`
            : 'Unavailable',
      status:
        customerRating !== null && feedbackStatus === 'verified'
          ? 'verified'
          : reviewCount !== null
            ? 'estimated'
            : 'unavailable',
    },
    {
      key: 'image',
      labelEn: 'Product Photo',
      labelMy: 'Product ဓာတ်ပုံ',
      valueEn: imageStatus === 'verified' ? 'Verified from official listing' : 'Unavailable',
      valueMy: imageStatus === 'verified' ? 'တရားဝင် Product ဓာတ်ပုံ အတည်ပြုပြီး' : 'Unavailable',
      status: imageStatus,
    },
  ];

  const unavailableItemsEn: string[] = [];
  const unavailableItemsMy: string[] = [];

  for (const item of product.missingDataEn ?? []) {
    appendUniqueNote(unavailableItemsEn, item);
  }
  for (const item of product.missingDataMy ?? []) {
    appendUniqueNote(unavailableItemsMy, item);
  }

  if (commissionStatus === 'unavailable') {
    appendUniqueNote(
      unavailableItemsEn,
      'Affiliate commission rate was not returned by Kalodata for this listing (Unavailable — check TikTok Shop Creator Center).'
    );
    appendUniqueNote(
      unavailableItemsMy,
      'ဤ Product အတွက် Affiliate Commission Rate ကို Kalodata မှ မရရှိနိုင်ပါ (Unavailable — TikTok Shop Creator Center တွင် စစ်ဆေးပါ)။'
    );
  }
  if (salesStatus === 'unavailable') {
    appendUniqueNote(
      unavailableItemsEn,
      'Sales volume and GMV metrics are currently unavailable from Kalodata.'
    );
    appendUniqueNote(
      unavailableItemsMy,
      'ရောင်းအားနှင့် GMV ဒေတာများကို Kalodata မှ လက်ရှိ မရရှိနိုင်ပါ။'
    );
  }
  if (priceStatus === 'unavailable') {
    appendUniqueNote(unavailableItemsEn, 'Verified unit price is unavailable.');
    appendUniqueNote(unavailableItemsMy, 'အတည်ပြုပြီး Unit Price မရရှိနိုင်ပါ။');
  }
  if (!shopAvailable && !sellerId) {
    appendUniqueNote(
      unavailableItemsEn,
      'Shop name and seller ID were not returned for this listing (Unavailable).'
    );
    appendUniqueNote(
      unavailableItemsMy,
      'ဤ Product အတွက် ဆိုင်အမည်နှင့် Seller ID ကို မရရှိနိုင်ပါ (Unavailable)။'
    );
  }
  if (reviewCount === null && customerRating === null) {
    appendUniqueNote(
      unavailableItemsEn,
      'Customer star rating and review count are not included in this payload (optional Customer Review Intelligence available in Deep Dive).'
    );
    appendUniqueNote(
      unavailableItemsMy,
      'ဖောက်သည် Star Rating နှင့် Review အရေအတွက် မပါဝင်သေးပါ (Deep Dive မှ Customer Review Intelligence ဖြင့် စစ်ဆေးနိုင်ပါသည်)။'
    );
  }
  if (context.unmappedCategoryNoteEn) {
    appendUniqueNote(unavailableItemsEn, context.unmappedCategoryNoteEn);
  }
  if (context.unmappedCategoryNoteMy) {
    appendUniqueNote(unavailableItemsMy, context.unmappedCategoryNoteMy);
  }

  return {
    canonicalProductId,
    numericProductId,
    productName: product.name,
    productNameMy: product.nameMy,
    category: product.category,
    categoryLabelEn: getCategoryLabel(product.category, 'en', { short: true }),
    categoryLabelMy: getCategoryLabel(product.category, 'my', { short: true }),
    subCategory: product.subCategory,
    subCategoryMy: product.subCategoryMy,
    imageConfig,
    imageStatus,
    tiktokShopUrl,
    kalodataUrl,
    shopName,
    shopAvailable,
    sellerId,
    shopSellerType: m?.shopSellerType ?? null,
    dispatchHub: product.dispatchHub,
    deliveryType: m?.deliveryType ?? null,
    sellerStatus,
    sellerReliabilityStatus,
    priceThb,
    minPriceThb,
    maxPriceThb,
    skuCount,
    priceStatus,
    salesVolume,
    revenueThb,
    revenueGrowthRate,
    videoRevenueThb,
    liveRevenueThb,
    showcaseRevenueThb,
    shoppingMallRevenueThb,
    salesStatus,
    dateRange: m?.dateRange ?? null,
    commissionRate,
    commissionVerified,
    estimatedCommissionPerSaleThb,
    commissionStatus,
    creatorNumber,
    videoNumber,
    liveNumber,
    competitionStatus,
    reviewCount,
    reviewCountStatus,
    customerRating,
    customerRatingStatus,
    feedbackStatus,
    evaluation,
    opportunityScore: evaluation.totalScore,
    confidenceLevel: evaluation.confidenceLevel,
    confidencePct: evaluation.confidencePct,
    verifiedCount: evaluation.verifiedCount,
    totalCriteria: evaluation.totalCriteria,
    dataSource: context.dataSource,
    sourceTitleEn: sourceInfo.titleEn,
    sourceTitleMy: sourceInfo.titleMy,
    sourceDetailEn: sourceInfo.detailEn,
    sourceDetailMy: sourceInfo.detailMy,
    apiCallsMade: context.apiCallsMade,
    estimatedCreditsCharged: context.estimatedCreditsCharged,
    redirectHopsCount: context.redirectHops.length,
    resolvedUrl: context.resolvedUrl,
    sources: product.sources ?? [],
    verificationRows,
    unavailableItemsEn,
    unavailableItemsMy,
  };
}
