import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/userStore';
import { Zap, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLAN_MONTHLY_CREDITS, type PlanId } from '@/lib/constants/pricing';
import { useCreditBalance } from '@/components/billing/useCreditState';

/**
 * CreditBalance Component
 *
 * Displays user's current credit balance with:
 * - Credit count (remaining this month)
 * - Usage percentage & trend
 * - Status indicator (healthy/warning/critical)
 * - Quick buy button
 * - Next reset date (if applicable)
 */

interface CreditBalanceProps {
  /**
   * Size variant
   * - 'sm': Compact (for sidebar, header)
   * - 'md': Medium (for dashboard widget)
   * - 'lg': Large (for full settings page)
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Show detailed breakdown
   * - true: Show % used, monthly limit, next reset
   * - false: Show only balance
   */
  showDetails?: boolean;

  /**
   * Callback when user clicks "Buy Credits"
   */
  onBuyCreditClick?: () => void;

  className?: string;
}

interface CreditStatus {
  current: number;
  limit: number;
  used: number;
  percentage: number;
  status: 'healthy' | 'warning' | 'critical'; // >70%, >90%, >95%
  daysUntilReset: number;
}

function getCreditStatus(current: number, limit: number): CreditStatus {
  const safeLimit = Math.max(1, limit);
  const used = Math.max(0, safeLimit - current);
  const percentage = Math.min(100, (used / safeLimit) * 100);

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (percentage > 95) status = 'critical';
  else if (percentage > 70) status = 'warning';

  // Calculate days until reset (assuming monthly billing)
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysUntilReset = Math.ceil(
    (nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    current,
    limit,
    used,
    percentage,
    status,
    daysUntilReset,
  };
}

export function CreditBalance({
  size = 'md',
  showDetails = true,
  onBuyCreditClick,
  className,
}: CreditBalanceProps) {
  const { profile } = useAuthStore();
  const { balance, known } = useCreditBalance();
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);

  useEffect(() => {
    if (!known) return;
    const planId = ((profile as { plan_id?: string } | null)?.plan_id ?? "free") as PlanId;
    const limit = PLAN_MONTHLY_CREDITS[planId] ?? PLAN_MONTHLY_CREDITS.free ?? 50;
    setCreditStatus(getCreditStatus(balance, limit));
  }, [balance, known, profile]);

  if (!creditStatus) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg bg-secondary/40 p-3', className)}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <span className="text-xs text-muted-foreground">Loading credits...</span>
      </div>
    );
  }

  // Size variants
  const sizeClasses = {
    sm: 'p-2 gap-2',
    md: 'p-3 gap-3',
    lg: 'p-4 gap-4',
  };

  const textSizes = {
    sm: { label: 'text-xs', value: 'text-sm', detail: 'text-[10px]' },
    md: { label: 'text-xs', value: 'text-lg', detail: 'text-xs' },
    lg: { label: 'text-sm', value: 'text-2xl', detail: 'text-sm' },
  };

  // Status colors
  const statusColors = {
    healthy: {
      icon: 'text-emerald-400',
      bar: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
    },
    warning: {
      icon: 'text-amber-400',
      bar: 'bg-gradient-to-r from-amber-500 to-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
    },
    critical: {
      icon: 'text-red-400',
      bar: 'bg-gradient-to-r from-red-500 to-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
    },
  };

  const colors = statusColors[creditStatus.status];

  return (
    <div
      className={cn(
        'rounded-lg border transition-all',
        colors.bg,
        colors.border,
        sizeClasses[size],
        'flex flex-col',
        className
      )}
    >
      {/* Header: Icon + Label + Value */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('flex items-center justify-center rounded-lg p-1')}>
            <Zap className={cn('h-4 w-4', colors.icon)} />
          </div>
          <div>
            <div className={cn('font-medium text-foreground', textSizes[size].label)}>
              Credits
            </div>
            {size === 'sm' && (
              <div className="text-[10px] text-muted-foreground">
                {creditStatus.current} left
              </div>
            )}
          </div>
        </div>

        {/* Big number */}
        <div className="text-right">
          <div className={cn('font-bold text-foreground', textSizes[size].value)}>
            {creditStatus.current}
          </div>
          {size !== 'sm' && (
            <div className={cn('text-muted-foreground', textSizes[size].detail)}>
              of {creditStatus.limit}
            </div>
          )}
        </div>
      </div>

      {/* Usage bar + details */}
      {showDetails && (
        <>
          {/* Progress bar */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn('h-full transition-all duration-300', colors.bar)}
              style={{ width: `${creditStatus.percentage}%` }}
            />
          </div>

          {/* Details row */}
          {size !== 'sm' && (
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <TrendingUp className={cn('h-3 w-3', colors.icon)} />
                <span className={cn('text-muted-foreground', textSizes[size].detail)}>
                  {Math.round(creditStatus.percentage)}% used
                </span>
              </div>

              <span className={cn('text-muted-foreground', textSizes[size].detail)}>
                Resets in {creditStatus.daysUntilReset}d
              </span>
            </div>
          )}

          {/* Status message */}
          {creditStatus.status !== 'healthy' && size === 'lg' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary p-2">
              <AlertCircle className={cn('h-4 w-4', colors.icon)} />
              <span className={cn('text-xs text-foreground')}>
                {creditStatus.status === 'critical'
                  ? '⚠️ You\'re almost out of credits. Buy more to continue.'
                  : '⚠️ Getting low on credits. Consider buying more.'}
              </span>
            </div>
          )}

          {/* CTA button */}
          {size === 'lg' && creditStatus.status !== 'healthy' && (
            <button
              onClick={onBuyCreditClick}
              className={cn(
                'mt-3 w-full rounded-lg px-3 py-2 text-xs font-medium text-foreground transition-all',
                colors.bg,
                'hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900',
                colors.border
              )}
            >
              Buy Credits
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default CreditBalance;
