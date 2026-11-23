import { AlertCircle, CheckCircle2, FlaskConical, XCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Language, ProductDecisionVerdict } from '../../types/product';
import { TRANSLATIONS } from '../../i18n/translations';
import { MOTION_VARIANTS } from '../../utils/motionPresets';

export type VerdictBadgeSize = 'sm' | 'md' | 'lg';

export interface VerdictBadgeProps {
  verdict: ProductDecisionVerdict;
  size?: VerdictBadgeSize;
  language?: Language;
  animateStamp?: boolean;
  className?: string;
}

const VERDICT_CONFIG: Record<
  ProductDecisionVerdict,
  {
    container: string;
    iconClass: string;
    Icon: typeof CheckCircle2;
  }
> = {
  recommended: {
    container:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/80',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  'worth-testing': {
    container:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/80',
    iconClass: 'text-amber-600 dark:text-amber-400',
    Icon: FlaskConical,
  },
  'need-more-data': {
    container:
      'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700',
    iconClass: 'text-zinc-500 dark:text-zinc-400',
    Icon: AlertCircle,
  },
  'not-recommended': {
    container:
      'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/80',
    iconClass: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
};

const SIZE_STYLES: Record<VerdictBadgeSize, { pill: string; icon: string }> = {
  sm: {
    pill: 'px-2.5 py-1 text-xs gap-1.5',
    icon: 'w-3.5 h-3.5',
  },
  md: {
    pill: 'px-3.5 py-1.5 text-sm gap-2',
    icon: 'w-4 h-4',
  },
  lg: {
    pill: 'px-4 py-2 text-base gap-2',
    icon: 'w-5 h-5',
  },
};

export function VerdictBadge({
  verdict,
  size = 'md',
  language = 'my',
  animateStamp = false,
  className = '',
}: VerdictBadgeProps) {
  const prefersReduced = useReducedMotion();
  const config = VERDICT_CONFIG[verdict];
  const sizeStyle = SIZE_STYLES[size];
  const label = TRANSLATIONS[language].decisionVerdictLabels[verdict];
  const Icon = config.Icon;

  const badgeClassName = `inline-flex items-center font-semibold rounded-full border leading-snug whitespace-nowrap shrink-0 ${config.container} ${sizeStyle.pill} ${className}`;

  if (animateStamp && !prefersReduced) {
    return (
      <motion.span
        role="status"
        aria-label={label}
        variants={MOTION_VARIANTS.verdictStamp}
        initial="initial"
        animate="animate"
        className={badgeClassName}
      >
        <Icon className={`shrink-0 ${sizeStyle.icon} ${config.iconClass}`} aria-hidden="true" />
        <span>{label}</span>
      </motion.span>
    );
  }

  return (
    <span role="status" aria-label={label} className={badgeClassName}>
      <Icon className={`shrink-0 ${sizeStyle.icon} ${config.iconClass}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
