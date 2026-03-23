import { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * PricingCard Component
 *
 * Reusable pricing plan card for use in:
 * - Upgrade modal
 * - Pricing page
 * - Dashboard widgets
 * - Settings pages
 */

interface PricingFeature {
  label: string;
  included: boolean;
  tooltip?: string;
}

interface PricingCardProps {
  /**
   * Plan identifier
   */
  id: string;

  /**
   * Plan name
   */
  label: string;

  /**
   * Price (without currency)
   */
  price: string;

  /**
   * Billing period
   */
  period?: string;

  /**
   * Monthly credits included
   */
  credits?: number;

  /**
   * Icon component (optional)
   */
  icon?: ReactNode;

  /**
   * Color theme
   */
  color?: 'violet' | 'amber' | 'emerald' | 'blue';

  /**
   * Feature list
   */
  features: PricingFeature[];

  /**
   * Button text (default: "Upgrade to [Label]")
   */
  ctaLabel?: string;

  /**
   * Is this the current plan?
   */
  isCurrent?: boolean;

  /**
   * Should this card be highlighted?
   */
  isHighlighted?: boolean;

  /**
   * Button click handler
   */
  onUpgrade?: () => void;

  /**
   * Additional badge text
   */
  badge?: string;

  /**
   * Show yearly savings
   */
  yearlyPrice?: string;

  /**
   * Subtitle text
   */
  subtitle?: string;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  className?: string;
}

const colorMap = {
  violet: {
    bg: 'bg-violet-500/5',
    border: 'border-violet-500/30',
    activeBg: 'bg-violet-600/20',
    activeBorder: 'border-violet-500/50',
    icon: 'bg-violet-500/15 text-violet-400',
    button: 'bg-violet-600 hover:bg-violet-500 focus:ring-violet-500',
  },
  amber: {
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/30',
    activeBg: 'bg-amber-600/20',
    activeBorder: 'border-amber-500/50',
    icon: 'bg-amber-500/15 text-amber-400',
    button: 'bg-amber-500 hover:bg-amber-400 focus:ring-amber-500 text-black',
  },
  emerald: {
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/30',
    activeBg: 'bg-emerald-600/20',
    activeBorder: 'border-emerald-500/50',
    icon: 'bg-emerald-500/15 text-emerald-400',
    button: 'bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500',
  },
  blue: {
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/30',
    activeBg: 'bg-blue-600/20',
    activeBorder: 'border-blue-500/50',
    icon: 'bg-blue-500/15 text-blue-400',
    button: 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500',
  },
};

export function PricingCard({
  id,
  label,
  price,
  period = '/mo',
  credits,
  icon,
  color = 'violet',
  features,
  ctaLabel,
  isCurrent = false,
  isHighlighted = false,
  onUpgrade,
  badge,
  yearlyPrice,
  subtitle,
  size = 'md',
  className,
}: PricingCardProps) {
  const colors = colorMap[color];

  // Size variants
  const sizeClasses = {
    sm: {
      container: 'rounded-lg p-3',
      header: 'gap-2 mb-2',
      price: 'text-lg',
      features: 'space-y-1',
      featureText: 'text-xs',
      button: 'py-2 text-xs',
      icon: 'h-6 w-6',
    },
    md: {
      container: 'rounded-2xl p-5',
      header: 'gap-3 mb-4',
      price: 'text-2xl',
      features: 'space-y-2',
      featureText: 'text-sm',
      button: 'py-2.5 text-sm',
      icon: 'h-8 w-8',
    },
    lg: {
      container: 'rounded-2xl p-6',
      header: 'gap-4 mb-6',
      price: 'text-3xl',
      features: 'space-y-2.5',
      featureText: 'text-sm',
      button: 'py-3 text-sm',
      icon: 'h-10 w-10',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        'flex flex-col transition-all duration-200 border',
        sizes.container,
        isHighlighted
          ? cn(colors.activeBg, colors.activeBorder)
          : cn(colors.bg, colors.border),
        isHighlighted && 'ring-2 ring-offset-2 ring-offset-slate-900',
        isHighlighted && `ring-${color}-500/30`,
        className
      )}
    >
      {/* Badge */}
      {badge && (
        <div className={cn(
          'mb-2 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold',
          `bg-${color}-500/20 text-${color}-300`
        )}>
          {badge}
        </div>
      )}

      {/* Header */}
      <div className={cn('flex items-start', sizes.header)}>
        {icon && (
          <div className={cn('flex items-center justify-center rounded-xl', colors.icon, sizes.icon)}>
            {icon}
          </div>
        )}

        <div className="flex-1">
          <h3 className="text-lg font-bold text-foreground">{label}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          {credits && (
            <p className="text-xs text-muted-foreground mt-1">{credits} credits/month</p>
          )}
        </div>

        <div className="text-right">
          <div className={cn('font-black text-foreground', sizes.price)}>
            {price}
          </div>
          <div className="text-xs text-muted-foreground">{period}</div>
          {yearlyPrice && (
            <div className="text-xs text-emerald-400 mt-1">
              or ${yearlyPrice}/year
            </div>
          )}
        </div>
      </div>

      {/* Features */}
      <ul className={cn('flex-1', sizes.features)}>
        {features.map((feature) => (
          <li
            key={feature.label}
            className="flex items-start gap-2 group"
            title={feature.tooltip}
          >
            {feature.included ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <X className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            )}
            <span
              className={cn(
                sizes.featureText,
                feature.included ? 'text-muted-foreground' : 'text-muted-foreground line-through'
              )}
            >
              {feature.label}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <Button
        onClick={onUpgrade}
        disabled={isCurrent}
        className={cn(
          'mt-6 w-full rounded-xl text-foreground font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900',
          sizes.button,
          isCurrent
            ? 'bg-secondary text-muted-foreground cursor-not-allowed'
            : colors.button
        )}
      >
        {isCurrent ? 'Current Plan' : ctaLabel || `Upgrade to ${label}`}
      </Button>
    </div>
  );
}

export default PricingCard;
