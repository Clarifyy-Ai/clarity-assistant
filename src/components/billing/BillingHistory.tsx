import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/userStore';
import { Calendar, Download, ArrowDownLeft, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { creditsDB } from '@/lib/supabase/database';
import { supabase } from '@/lib/supabase/client';
import { formatInrPaise } from '@/lib/billing/priceCalculator';
import {
  mergeBillingHistoryTransactions,
  type BillingHistoryTransaction,
} from '@/lib/billing/billingHistoryMerge';
import type { Tables } from '@/integrations/supabase/types';

/**
 * BillingHistory Component
 *
 * Display transaction history with:
 * - All charges and credits
 * - Invoice download
 * - Filtering & sorting
 * - Pagination
 * - Export to CSV
 */

type Transaction = BillingHistoryTransaction;

interface BillingHistoryProps {
  /**
   * Max items to show per page
   */
  itemsPerPage?: number;

  /**
   * Show filter options
   */
  showFilters?: boolean;

  /**
   * Show export button
   */
  showExport?: boolean;

  /** Increment to reload ledger + payment orders after Settings refresh. */
  refreshKey?: number;

  className?: string;
}

export function BillingHistory({
  itemsPerPage = 10,
  showFilters = true,
  showExport = true,
  refreshKey = 0,
  className,
}: BillingHistoryProps) {
  const { profile, user } = useAuthStore();
  const accountId = profile?.id ?? user?.id;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<'all' | 'purchase' | 'usage' | 'refund' | 'bonus'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc'>('date-desc');

  const filteredTransactions = transactions
    .filter((t) => filterType === 'all' || t.type === filterType)
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return b.date.getTime() - a.date.getTime();
        case 'date-asc':
          return a.date.getTime() - b.date.getTime();
        case 'amount-desc':
          return b.amount - a.amount;
        default:
          return 0;
      }
    });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  useEffect(() => {
    const nextTotalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
    setCurrentPage((page) => (nextTotalPages > 0 ? Math.min(page, nextTotalPages) : 1));
  }, [filteredTransactions.length, itemsPerPage]);

  const loadTransactions = useCallback(async () => {
    if (!accountId) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ledger, paymentsResult] = await Promise.all([
        creditsDB.listByUserId(accountId, 100),
        supabase
          .from("payment_orders")
          .select(
            "id, product_type, amount_paise, status, created_at, paid_at, provider, credits_granted, provider_payment_id",
          )
          .eq("user_id", accountId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (paymentsResult.error) throw paymentsResult.error;

      const payments = (paymentsResult.data ?? []) as Tables<"payment_orders">[];

      setTransactions(
        mergeBillingHistoryTransactions(
          ledger.map((row) => ({
            id: row.id,
            amount: row.amount,
            action: String(row.action ?? ""),
            created_at: row.created_at,
            description: row.description,
            stripe_payment_id: row.stripe_payment_id ?? null,
          })),
          payments.map((p) => ({
            id: p.id,
            product_type: p.product_type,
            amount_paise: p.amount_paise,
            status: p.status,
            created_at: p.created_at,
            paid_at: p.paid_at,
            provider: p.provider,
            credits_granted: p.credits_granted,
            provider_payment_id: p.provider_payment_id,
          })),
        ),
      );
    } catch {
      toast.error('Failed to load billing history');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions, refreshKey, reloadNonce]);

  // Paginate
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const displayedTransactions = filteredTransactions.slice(startIdx, endIdx);

  // Export to CSV
  const handleExport = () => {
    const csv = [
      ['Date', 'Type', 'Description', 'Amount', 'Credits', 'Status'].join(','),
      ...filteredTransactions.map((t) =>
        [
          t.date.toLocaleDateString(),
          t.type,
          t.description,
          t.amount > 0 ? formatInrPaise(Math.round(t.amount * 100)) : "—",
          t.credits,
          t.status,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Billing history exported to CSV');
  };

  const handleDownloadInvoice = async (transaction: Transaction) => {
    if (!transaction.invoice_url) {
      toast.error('This transaction does not have an invoice');
      return;
    }

    try {
      window.open(transaction.invoice_url, '_blank');
    } catch {
      toast.error('Failed to download invoice');
    }
  };

  if (loading && transactions.length === 0) {
    return (
      <div className={cn('rounded-lg border border-border bg-secondary/50 p-6', className)}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/30 border-t-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">Billing History</h3>
          <p className="text-xs text-muted-foreground mt-1">
            View your transactions, refunds, and invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="billing-history-refresh"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="flex items-center gap-2"
          >
            Refresh
          </Button>
          {showExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={filterType}
              data-testid="billing-history-filter"
              onChange={(e) => {
                setFilterType(e.target.value as typeof filterType);
                setCurrentPage(1);
              }}
              className="rounded-lg bg-secondary border border-border px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Transactions</option>
              <option value="purchase">Purchases</option>
              <option value="usage">Usage</option>
              <option value="refund">Refunds</option>
              <option value="bonus">Bonuses</option>
            </select>
          </div>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as typeof sortBy);
              setCurrentPage(1);
            }}
            className="rounded-lg bg-secondary border border-border px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
          </select>
        </div>
      )}

      {/* Transactions Table */}
      {displayedTransactions.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/50 p-8 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border border-border bg-secondary/50 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                    Credits
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    data-testid={transaction.type === "refund" ? "billing-refund-row" : "billing-history-row"}
                    className="border-b border-border hover:bg-secondary/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {transaction.date.toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {transaction.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1 capitalize">
                          {transaction.type}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-foreground">
                      {transaction.amount > 0
                        ? `${transaction.type === "refund" ? "+" : "-"}${formatInrPaise(Math.round(transaction.amount * 100))}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold',
                          transaction.credits > 0
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/20 text-red-300'
                        )}
                      >
                        {transaction.credits > 0 ? '+' : ''}{transaction.credits}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex px-2 py-1 rounded text-xs font-medium capitalize',
                          transaction.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : transaction.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300'
                            : transaction.status === 'refunded'
                            ? 'bg-violet-500/20 text-violet-300'
                            : 'bg-red-500/20 text-red-300'
                        )}
                      >
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {transaction.invoice_url && (
                        <button
                          onClick={() => handleDownloadInvoice(transaction)}
                          className="p-1.5 rounded hover:bg-secondary transition-colors"
                          title="Download invoice"
                        >
                          <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-2">
            {displayedTransactions.map((transaction) => (
              <div
                key={transaction.id}
                data-testid={transaction.type === "refund" ? "billing-refund-row" : "billing-history-row"}
                className="rounded-lg border border-border bg-secondary/50 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {transaction.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        {transaction.date.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">
                      {transaction.amount > 0
                        ? `${transaction.type === "refund" ? "+" : "-"}${formatInrPaise(Math.round(transaction.amount * 100))}`
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      {transaction.type}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded',
                      transaction.credits > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-red-500/20 text-red-300'
                    )}
                  >
                    <ArrowDownLeft className="h-3 w-3" />
                    {transaction.credits > 0 ? '+' : ''}{transaction.credits}
                  </span>

                  <span
                    className={cn(
                      'px-2 py-1 rounded capitalize',
                      transaction.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : transaction.status === 'pending'
                        ? 'bg-amber-500/20 text-amber-300'
                        : transaction.status === 'refunded'
                        ? 'bg-violet-500/20 text-violet-300'
                        : 'bg-red-500/20 text-red-300'
                    )}
                  >
                    {transaction.status}
                  </span>

                  {transaction.invoice_url && (
                    <button
                      onClick={() => handleDownloadInvoice(transaction)}
                      className="p-1.5 rounded hover:bg-secondary"
                    >
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground" data-testid="billing-history-page">
            Page {currentPage} of {totalPages} • {filteredTransactions.length} total
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="billing-history-prev"
              onClick={() => {
                const next = Math.max(1, currentPage - 1);
                setCurrentPage(next);
              }}
              disabled={currentPage === 1}
            >
              ← Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="billing-history-next"
              onClick={() => {
                const next = Math.min(totalPages, currentPage + 1);
                setCurrentPage(next);
              }}
              disabled={currentPage === totalPages}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BillingHistory;
