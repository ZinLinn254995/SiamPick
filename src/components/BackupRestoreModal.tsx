import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  HardDrive,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import type { Language } from '../types/product';
import {
  buildSiamPickBackupSnapshot,
  DEFAULT_BACKUP_SCOPE,
  getLocalBackupInventoryCounts,
  MAX_BACKUP_FILE_BYTES,
  parseAndValidateSiamPickBackup,
  restoreSiamPickBackup,
  type BackupParseResult,
  type BackupRestoreMode,
  type BackupRestoreResult,
  type BackupScopeSelection,
} from '../utils/backupStorage';
import { formatByteSize } from '../utils/researchHistoryStorage';
import { formatResearchDateTime } from '../utils/savedProductsStorage';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { triggerFileDownload } from '../utils/exportReports';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { MOTION_TRANSITIONS, MOTION_VARIANTS } from '../utils/motionPresets';

export type BackupModalTab = 'backup' | 'restore';

interface BackupRestoreModalProps {
  isOpen: boolean;
  initialTab?: BackupModalTab;
  onClose: () => void;
  onRestoreComplete: (result: BackupRestoreResult) => void;
  language: Language;
  /** Passed to ensure live inventory counts re-compute when Saved/History state changes */
  savedCount: number;
  historyCount: number;
}

export function BackupRestoreModal({
  isOpen,
  initialTab = 'backup',
  onClose,
  onRestoreComplete,
  language,
  savedCount,
  historyCount,
}: BackupRestoreModalProps) {
  const isMy = language === 'my';
  const prefersReduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<BackupModalTab>(initialTab);
  const [backupScope, setBackupScope] = useState<BackupScopeSelection>({
    ...DEFAULT_BACKUP_SCOPE,
  });
  const [exportSuccessInfo, setExportSuccessInfo] = useState<{
    filename: string;
    bytesUsed: number;
  } | null>(null);

  // Restore tab state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<BackupParseResult | null>(null);
  const [fileReadError, setFileReadError] = useState<{ en: string; my: string } | null>(null);
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>('merge');
  const [restoreScope, setRestoreScope] = useState<BackupScopeSelection>({
    ...DEFAULT_BACKUP_SCOPE,
  });
  const [restoreOutcome, setRestoreOutcome] = useState<BackupRestoreResult | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  useDialogA11y({
    isOpen,
    containerRef: modalRef,
    onClose,
  });

  // Sync initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setExportSuccessInfo(null);
      setRestoreOutcome(null);
      setFileReadError(null);
    }
  }, [isOpen, initialTab]);

  const localCounts = useMemo(() => {
    if (!isOpen) {
      return {
        savedProducts: savedCount,
        researchHistorySessions: historyCount,
        researchHistoryProducts: 0,
        deepDiveProducts: 0,
        deepDiveRecords: 0,
        latestSessionProducts: 0,
        cachedEnrichments: 0,
        cachedAiAnalyses: 0,
        syncedSubcategories: 0,
      };
    }
    return getLocalBackupInventoryCounts();
  }, [isOpen, savedCount, historyCount, restoreOutcome]);

  const hasAnyBackupScopeSelected =
    backupScope.includeSaved ||
    backupScope.includeHistory ||
    backupScope.includeDeepDive ||
    backupScope.includeLatestSession ||
    backupScope.includeCaches;

  const hasAnyRestoreScopeSelected =
    restoreScope.includeSaved ||
    restoreScope.includeHistory ||
    restoreScope.includeDeepDive ||
    restoreScope.includeLatestSession ||
    restoreScope.includeCaches;

  const handleDownloadBackup = () => {
    if (!hasAnyBackupScopeSelected) return;
    const snapshot = buildSiamPickBackupSnapshot(backupScope);
    triggerFileDownload(
      snapshot.json,
      snapshot.filename,
      'application/json;charset=utf-8;'
    );
    setExportSuccessInfo({
      filename: snapshot.filename,
      bytesUsed: snapshot.bytesUsed,
    });
  };

  const resetRestoreSelection = () => {
    setSelectedFileName(null);
    setParseResult(null);
    setFileReadError(null);
    setRestoreOutcome(null);
    setRestoreScope({ ...DEFAULT_BACKUP_SCOPE });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processSelectedFile = async (file: File) => {
    setFileReadError(null);
    setRestoreOutcome(null);
    setSelectedFileName(file.name);

    if (file.size === 0) {
      setParseResult(null);
      setFileReadError({
        en: 'The selected file is empty.',
        my: 'ရွေးချယ်ထားသော ဖိုင်သည် ဗလာဖြစ်နေပါသည်။',
      });
      return;
    }

    if (file.size * 2 > MAX_BACKUP_FILE_BYTES) {
      setParseResult(null);
      setFileReadError({
        en: 'Backup file exceeds the 15 MB safety limit.',
        my: 'Backup ဖိုင်အရွယ်အစားသည် 15 MB ကန့်သတ်ချက်ထက် ကျော်လွန်နေပါသည်။',
      });
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseAndValidateSiamPickBackup(text);
      setParseResult(parsed);
      if (parsed.ok) {
        const c = parsed.preview.counts;
        setRestoreScope({
          includeSaved: c.savedProducts > 0 || restoreMode === 'replace',
          includeHistory: c.researchHistorySessions > 0 || restoreMode === 'replace',
          includeDeepDive: c.deepDiveRecords > 0 || restoreMode === 'replace',
          includeLatestSession: parsed.preview.hasLatestSession || restoreMode === 'replace',
          includeCaches: parsed.preview.hasCaches || restoreMode === 'replace',
        });
      }
    } catch {
      setParseResult(null);
      setFileReadError({
        en: 'Unable to read the selected file. Please try again.',
        my: 'ရွေးချယ်ထားသော ဖိုင်ကို ဖတ်၍ မရပါ။ ထပ်မံစမ်းသပ်ပါ။',
      });
    }
  };

  const handleApplyRestore = () => {
    if (!parseResult || !parseResult.ok || !hasAnyRestoreScopeSelected) return;
    const result = restoreSiamPickBackup(parseResult.backup, {
      mode: restoreMode,
      scope: restoreScope,
    });
    setRestoreOutcome(result);
    onRestoreComplete(result);
  };

  const scopeLabels = [
    {
      key: 'includeSaved' as const,
      title: isMy ? 'သိမ်းထားသော ကုန်ပစ္စည်းများ' : 'Saved Products',
      localCount: `${localCounts.savedProducts}`,
      backupCount:
        parseResult && parseResult.ok ? `${parseResult.preview.counts.savedProducts}` : null,
    },
    {
      key: 'includeHistory' as const,
      title: isMy
        ? 'ရှာဖွေမှု မှတ်တမ်းများ'
        : 'Research History Sessions',
      localCount: `${localCounts.researchHistorySessions}`,
      backupCount:
        parseResult && parseResult.ok
          ? `${parseResult.preview.counts.researchHistorySessions}`
          : null,
    },
    {
      key: 'includeDeepDive' as const,
      title: isMy
        ? 'Deep Dive မှတ်တမ်း'
        : 'Deep Dive Analysis History',
      localCount: `${localCounts.deepDiveRecords}`,
      backupCount:
        parseResult && parseResult.ok ? `${parseResult.preview.counts.deepDiveRecords}` : null,
    },
    {
      key: 'includeLatestSession' as const,
      title: isMy
        ? 'နောက်ဆုံးရှာဖွေမှု ရလဒ်များ'
        : 'Latest Research Results',
      localCount: `${localCounts.latestSessionProducts}`,
      backupCount:
        parseResult && parseResult.ok
          ? `${parseResult.preview.counts.latestSessionProducts}`
          : null,
    },
    {
      key: 'includeCaches' as const,
      title: isMy
        ? 'AI Analysis & Enrichment Cache (Credit ချွေတာသည့် Cache)'
        : 'AI Analysis, Enrichment & Category Caches',
      localCount: `${localCounts.cachedEnrichments + localCounts.cachedAiAnalyses}`,
      backupCount:
        parseResult && parseResult.ok
          ? `${parseResult.preview.counts.cachedEnrichments + parseResult.preview.counts.cachedAiAnalyses}`
          : null,
    },
  ];

  const isLocalCompletelyEmpty =
    localCounts.savedProducts === 0 &&
    localCounts.researchHistorySessions === 0 &&
    localCounts.deepDiveRecords === 0 &&
    localCounts.latestSessionProducts === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="backup-restore-backdrop"
          variants={MOTION_VARIANTS.backdrop}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-[60] bg-zinc-950/45 dark:bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="backup-restore-heading"
          onClick={onClose}
        >
          <motion.div
            key="backup-restore-dialog"
            ref={modalRef}
            tabIndex={-1}
            variants={MOTION_VARIANTS.modalScale}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full max-w-[640px] max-h-[88vh] bg-white dark:bg-zinc-900 border-t sm:border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Mobile Sheet Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 shrink-0" aria-hidden="true">
          <div className="sp-sheet-handle" />
        </div>

        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 pt-2 sm:pt-4 pb-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-zinc-700 dark:text-zinc-300 shrink-0" aria-hidden="true" />
              <h2
                id="backup-restore-heading"
                className="font-display text-base sm:text-lg font-bold text-zinc-950 dark:text-zinc-50"
              >
                {isMy ? 'Backup နှင့် Restore စနစ်' : 'Backup & Restore'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {isMy
                ? 'သိမ်းထားသော ကုန်ပစ္စည်းများ၊ ရှာဖွေမှု မှတ်တမ်းနှင့် AI/Kalodata ဒေတာများကို Backup ဖိုင် (.json) အဖြစ် သိမ်းဆည်းပြီး အချိန်မရွေး ပြန်လည်ထည့်သွင်းနိုင်ပါသည်။'
                : 'Save a portable JSON backup of your Saved Products, Research History, Deep Dive analyses, and caches — or restore them cleanly anytime.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isMy ? 'ပိတ်ရန်' : 'Close'}
            className="w-10 h-10 -mt-1 -mr-1 rounded-lg inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-zinc-100 dark:border-zinc-800/70 bg-zinc-50/70 dark:bg-zinc-900/50">
          <div
            className="grid grid-cols-2 gap-1 p-1 bg-zinc-200/70 dark:bg-zinc-800 rounded-lg"
            role="tablist"
            aria-label={isMy ? 'Backup သို့မဟုတ် Restore ရွေးချယ်ရန်' : 'Backup or Restore mode'}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'backup'}
              onClick={() => setActiveTab('backup')}
              className={`relative inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'backup'
                  ? 'text-zinc-950 dark:text-zinc-50'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
              }`}
            >
              {activeTab === 'backup' && (
                <motion.span
                  layoutId="backup-modal-tab-pill"
                  transition={MOTION_TRANSITIONS.snappy}
                  aria-hidden="true"
                  className="absolute inset-0 bg-white dark:bg-zinc-900 shadow-xs rounded-md"
                />
              )}
              <Download className="relative z-10 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="relative z-10">{isMy ? 'Backup ဖိုင်သိမ်းမည်' : 'Save Backup'}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'restore'}
              onClick={() => setActiveTab('restore')}
              className={`relative inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === 'restore'
                  ? 'text-zinc-950 dark:text-zinc-50'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50'
              }`}
            >
              {activeTab === 'restore' && (
                <motion.span
                  layoutId="backup-modal-tab-pill"
                  transition={MOTION_TRANSITIONS.snappy}
                  aria-hidden="true"
                  className="absolute inset-0 bg-white dark:bg-zinc-900 shadow-xs rounded-md"
                />
              )}
              <Upload className="relative z-10 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="relative z-10">{isMy ? 'Backup ပြန်ယူမည်' : 'Restore Backup'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'backup' ? (
              <motion.div
                key="backup-tab-body"
                initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={MOTION_TRANSITIONS.crossFade}
                className="space-y-4"
              >
              {/* Current Local Inventory (single flat surface strip — no nested bordered cards) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200/80 dark:divide-zinc-800 rounded-xl bg-zinc-50/90 dark:bg-zinc-800/45 overflow-hidden">
                <div className="px-3.5 py-2.5">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {isMy ? 'သိမ်းထားသော' : 'Saved Products'}
                  </div>
                  <div className="mt-0.5 font-mono text-base sm:text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                    {localCounts.savedProducts}
                  </div>
                </div>

                <div className="px-3.5 py-2.5 border-l border-zinc-200/80 dark:border-zinc-800 sm:border-l-0">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {isMy ? 'ရှာဖွေမှု မှတ်တမ်း' : 'History Runs'}
                  </div>
                  <div className="mt-0.5 font-mono text-base sm:text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                    {localCounts.researchHistorySessions}
                  </div>
                </div>

                <div className="px-3.5 py-2.5">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {isMy ? 'Deep Dive' : 'Deep Dives'}
                  </div>
                  <div className="mt-0.5 font-mono text-base sm:text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                    {localCounts.deepDiveRecords}
                  </div>
                </div>

                <div className="px-3.5 py-2.5 border-l border-zinc-200/80 dark:border-zinc-800 sm:border-l-0">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {isMy ? 'သိမ်းထားသည့် Cache' : 'Cached Items'}
                  </div>
                  <div className="mt-0.5 font-mono text-base sm:text-lg font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                    {localCounts.cachedEnrichments + localCounts.cachedAiAnalyses}
                  </div>
                </div>
              </div>

              {isLocalCompletelyEmpty && (
                <div className="px-3.5 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-600 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {isMy
                      ? 'လက်ရှိ Browser ထဲတွင် သိမ်းထားသော ကုန်ပစ္စည်းနှင့် မှတ်တမ်း မရှိသေးပါ။'
                      : 'No Saved Products or Research History found in this browser yet.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('restore')}
                    className="inline-flex items-center min-h-[36px] font-medium text-zinc-950 dark:text-zinc-100 underline hover:no-underline shrink-0 cursor-pointer"
                  >
                    {isMy ? 'Restore လုပ်ရန်' : 'Restore a file'}
                  </button>
                </div>
              )}

              {/* Scope Checkboxes */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {isMy ? 'Backup ဖိုင်ထဲတွင် ထည့်သွင်းမည့် ဒေတာများ' : 'Include in Backup File'}
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
                  {scopeLabels.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between gap-3 min-h-[44px] px-3.5 py-2 text-xs bg-white dark:bg-zinc-900 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={backupScope[item.key]}
                          onChange={(e) => {
                            setExportSuccessInfo(null);
                            setBackupScope((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }));
                          }}
                          className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
                        />
                        <span className="text-zinc-800 dark:text-zinc-200 truncate">
                          {item.title}
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400 shrink-0">
                        {item.localCount}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {exportSuccessInfo && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200"
                >
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold">
                      {isMy ? 'Backup ဖိုင်ကို ဒေါင်းလုဒ်လုပ်ပြီးပါပြီ' : 'Backup file downloaded'}
                    </div>
                    <p className="font-mono text-xs text-emerald-800 dark:text-emerald-300 truncate">
                      {exportSuccessInfo.filename} ({formatByteSize(exportSuccessInfo.bytesUsed)})
                    </p>
                  </div>
                </div>
              )}
              </motion.div>
            ) : (
              <motion.div
                key="restore-tab-body"
                initial={prefersReduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={MOTION_TRANSITIONS.crossFade}
                className="space-y-4"
              >
              {/* File Dropzone / Picker */}
              {!parseResult?.ok && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) void processSelectedFile(dropped);
                  }}
                  className={`rounded-xl border border-dashed p-5 sm:p-7 text-center transition-colors ${
                    isDragging
                      ? 'border-zinc-950 dark:border-zinc-200 bg-zinc-100/70 dark:bg-zinc-800/70'
                      : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/35'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void processSelectedFile(file);
                    }}
                    className="sr-only"
                    id="siampick-backup-file-input"
                  />

                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 inline-flex items-center justify-center mb-2.5">
                    <FileJson className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    {isMy
                      ? 'SiamPick Backup ဖိုင် (.json) ကို ရွေးချယ်ပါ'
                      : 'Select a SiamPick Backup (.json) file'}
                  </div>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    {isMy
                      ? 'ဖိုင်ကို ဤနေရာသို့ ဆွဲထည့်ပါ သို့မဟုတ် အောက်ပါခလုတ်ဖြင့် ရွေးချယ်ပါ (အများဆုံး 15 MB)။'
                      : 'Drag and drop your backup JSON file here, or browse from your device (max 15 MB).'}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3.5 sp-btn-primary"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isMy ? 'Backup ဖိုင်ရွေးချယ်မည်' : 'Choose Backup File'}</span>
                  </button>
                </div>
              )}

              {/* Validation or Read Error */}
              {(fileReadError || (parseResult && !parseResult.ok)) && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200"
                >
                  <AlertCircle
                    className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {isMy ? 'Backup ဖိုင်ကို အတည်ပြု၍ မရပါ' : 'Invalid backup file'}
                    </div>
                    <p className="leading-relaxed">
                      {fileReadError
                        ? isMy
                          ? fileReadError.my
                          : fileReadError.en
                        : parseResult && !parseResult.ok
                          ? isMy
                            ? parseResult.errorMy
                            : parseResult.errorEn
                          : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* Validated Backup Preview & Restore Options */}
              {parseResult && parseResult.ok && (
                <>
                  <div className="p-3.5 rounded-xl bg-zinc-50/90 dark:bg-zinc-800/45 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileJson
                            className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 truncate">
                            {selectedFileName ?? 'siampick-backup.json'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {isMy ? 'Backup ထုတ်ခဲ့သည့်အချိန်:' : 'Exported:'}{' '}
                          <span className="font-mono tabular-nums">
                            {formatResearchDateTime(parseResult.preview.exportedAt, language)}
                          </span>{' '}
                          · {formatByteSize(parseResult.preview.estimatedBytes)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={resetRestoreSelection}
                        className="inline-flex items-center gap-1 min-h-[36px] px-2 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{isMy ? 'အခြားဖိုင်ရွေးမည်' : 'Change file'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 border-t border-zinc-200/70 dark:border-zinc-700/60 text-xs">
                      <div>
                        <span className="text-xs text-zinc-600 dark:text-zinc-400 block">
                          {isMy ? 'သိမ်းထားသော' : 'Saved Products'}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                          {parseResult.preview.counts.savedProducts}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-600 dark:text-zinc-400 block">
                          {isMy ? 'ရှာဖွေမှု မှတ်တမ်း' : 'History Runs'}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                          {parseResult.preview.counts.researchHistorySessions}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-600 dark:text-zinc-400 block">
                          {isMy ? 'Deep Dive' : 'Deep Dives'}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                          {parseResult.preview.counts.deepDiveRecords}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-600 dark:text-zinc-400 block">
                          {isMy ? 'Cache များ' : 'Cached Items'}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
                          {parseResult.preview.counts.cachedEnrichments +
                            parseResult.preview.counts.cachedAiAnalyses}
                        </span>
                      </div>
                    </div>

                    {parseResult.preview.skippedInvalidCount > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {isMy
                          ? `ပုံစံမပြည့်စုံသော မှတ်တမ်း ${parseResult.preview.skippedInvalidCount} ခုကို ဘေးကင်းစေရန် ကျော်လွှားထားပါသည်။`
                          : `Skipped ${parseResult.preview.skippedInvalidCount} invalid or corrupted entry(s) for safety.`}
                      </p>
                    )}
                  </div>

                  {/* Merge vs Replace Mode Selection */}
                  {!restoreOutcome && (
                    <>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {isMy ? 'ပြန်လည်ထည့်သွင်းမည့် နည်းလမ်း' : 'Restore Mode'}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <label
                            className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                              restoreMode === 'merge'
                                ? 'border-zinc-950 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800/70'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                name="restoreMode"
                                checked={restoreMode === 'merge'}
                                onChange={() => setRestoreMode('merge')}
                                className="mt-0.5 accent-zinc-950 dark:accent-zinc-100 cursor-pointer"
                              />
                              <div>
                                <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                                  {isMy
                                    ? 'ပေါင်းထည့်မည် (Merge · အကြံပြု)'
                                    : 'Merge (Recommended)'}
                                </div>
                                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                  {isMy
                                    ? 'လက်ရှိ သိမ်းထားသောစာရင်းနှင့် မှတ်တမ်းများကို မဖျက်ဘဲ Backup ထဲမှ မရှိသေးသည်များကို ထပ်ပေါင်းပေးမည်။'
                                    : 'Keeps your existing Products & History intact and adds missing items from the backup.'}
                                </p>
                              </div>
                            </div>
                          </label>

                          <label
                            className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                              restoreMode === 'replace'
                                ? 'border-amber-600 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                name="restoreMode"
                                checked={restoreMode === 'replace'}
                                onChange={() => setRestoreMode('replace')}
                                className="mt-0.5 accent-amber-600 cursor-pointer"
                              />
                              <div>
                                <div className="font-semibold text-zinc-950 dark:text-zinc-50">
                                  {isMy ? 'အစားထိုးမည် (Replace)' : 'Replace Existing'}
                                </div>
                                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                  {isMy
                                    ? 'ရွေးချယ်ထားသော လက်ရှိဒေတာများကို Backup ဖိုင်ထဲကအတိုင်း အစားထိုးပြောင်းလဲမည်။'
                                    : 'Replaces the selected local sections with the exact contents of this backup.'}
                                </p>
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      {restoreMode === 'replace' && (
                        <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                          <AlertTriangle
                            className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <span>
                            {isMy
                              ? 'Replace နည်းလမ်းသည် ရွေးချယ်ထားသော လက်ရှိ သိမ်းထားသောစာရင်း / မှတ်တမ်းများကို Backup ဖိုင်ဖြင့် အစားထိုးမည်ဖြစ်ပါသည်။'
                              : 'Replace mode overwrites the selected local data sections with this backup file.'}
                          </span>
                        </div>
                      )}

                      {/* Scope Checkboxes for Restore */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {isMy ? 'ပြန်ယူမည့် ဒေတာအပိုင်းများ' : 'Sections to Restore'}
                        </div>
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 border border-zinc-200/90 dark:border-zinc-800 rounded-xl overflow-hidden">
                          {scopeLabels.map((item) => (
                            <label
                              key={item.key}
                              className="flex items-center justify-between gap-3 min-h-[44px] px-3.5 py-2 text-xs bg-white dark:bg-zinc-900 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 cursor-pointer"
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={restoreScope[item.key]}
                                  onChange={(e) =>
                                    setRestoreScope((prev) => ({
                                      ...prev,
                                      [item.key]: e.target.checked,
                                    }))
                                  }
                                  className="w-4 h-4 rounded-sm border-zinc-300 dark:border-zinc-700 accent-zinc-950 dark:accent-zinc-100 cursor-pointer shrink-0"
                                />
                                <span className="text-zinc-800 dark:text-zinc-200 truncate">
                                  {item.title}
                                </span>
                              </span>
                              <span className="font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400 shrink-0">
                                {item.backupCount ?? '0'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Restore Outcome Banner */}
                  {restoreOutcome && (
                    <div
                      role="status"
                      className={`p-3.5 rounded-xl border space-y-2 text-xs ${
                        restoreOutcome.ok
                          ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                          : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        {restoreOutcome.ok ? (
                          <CheckCircle2
                            className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <AlertTriangle
                            className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span>
                          {restoreOutcome.ok
                            ? isMy
                              ? 'Backup မှ ဒေတာများကို ပြန်လည်ထည့်သွင်းပြီးပါပြီ'
                              : 'Backup restored successfully'
                            : isMy
                              ? 'အချို့ဒေတာများသာ ပြန်ယူနိုင်ခဲ့သည် (Storage နေရာကန့်သတ်ချက်)'
                              : 'Partially restored (browser storage limit reached)'}
                        </span>
                      </div>
                      <ul className="space-y-1 text-xs pl-6 list-disc">
                        <li>
                          {isMy
                            ? `သိမ်းထားသော ကုန်ပစ္စည်းများ: စုစုပေါင်း ${restoreOutcome.appliedCounts.savedProductsTotal} ခု`
                            : `Saved Products: ${restoreOutcome.appliedCounts.savedProductsTotal} total`}
                          {restoreOutcome.mode === 'merge' &&
                            restoreOutcome.appliedCounts.savedProductsAdded > 0 &&
                            (isMy
                              ? ` (+${restoreOutcome.appliedCounts.savedProductsAdded} အသစ်ထပ်ပေါင်းပြီး)`
                              : ` (+${restoreOutcome.appliedCounts.savedProductsAdded} added)`)}
                        </li>
                        <li>
                          {isMy
                            ? `ရှာဖွေမှု မှတ်တမ်း: စုစုပေါင်း ${restoreOutcome.appliedCounts.historyTotal} ကြိမ်`
                            : `Research History: ${restoreOutcome.appliedCounts.historyTotal} session(s)`}
                          {restoreOutcome.mode === 'merge' &&
                            restoreOutcome.appliedCounts.historyAdded > 0 &&
                            (isMy
                              ? ` (+${restoreOutcome.appliedCounts.historyAdded} အသစ်ထပ်ပေါင်းပြီး)`
                              : ` (+${restoreOutcome.appliedCounts.historyAdded} added)`)}
                        </li>
                        <li>
                          {isMy
                            ? `Deep Dive မှတ်တမ်း: စုစုပေါင်း ${restoreOutcome.appliedCounts.deepDiveRecordsTotal} ခု`
                            : `Deep Dive History: ${restoreOutcome.appliedCounts.deepDiveRecordsTotal} record(s)`}
                        </li>
                      </ul>

                      {restoreOutcome.writeErrors.length > 0 && (
                        <div className="pt-1 text-xs text-red-700 dark:text-red-300 space-y-1">
                          {restoreOutcome.writeErrors.map((err, i) => (
                            <p key={i}>{isMy ? err.errorMy ?? err.errorEn : err.errorEn}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Pinned Bottom Action Footer (always visible without scrolling) */}
        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 sm:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:py-3.5 flex items-center justify-end gap-2.5">
          {activeTab === 'backup' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="sp-btn-secondary"
              >
                {isMy ? 'ပိတ်မည်' : 'Close'}
              </button>
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={!hasAnyBackupScopeSelected}
                className="sp-btn-primary flex-1 sm:flex-initial"
              >
                <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {isMy ? 'Backup ဖိုင် (.json) သိမ်းဆည်းမည်' : 'Download Backup (.json)'}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="sp-btn-secondary"
              >
                {restoreOutcome ? (isMy ? 'ပြီးပါပြီ' : 'Done') : isMy ? 'ပိတ်မည်' : 'Cancel'}
              </button>
              {parseResult?.ok && !restoreOutcome && (
                <button
                  type="button"
                  onClick={handleApplyRestore}
                  disabled={!hasAnyRestoreScopeSelected}
                  className="sp-btn-primary flex-1 sm:flex-initial"
                >
                  <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {isMy ? 'Backup မှ ပြန်လည်ထည့်သွင်းမည်' : 'Restore Backup Now'}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
