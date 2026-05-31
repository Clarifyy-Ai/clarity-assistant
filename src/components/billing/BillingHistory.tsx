// @ts-nocheck
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/userStore';
import { Calendar, Download, CreditCard, ArrowDownLeft, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { creditsDB } from '@/lib/supabase/database';

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

interface Transaction {
  id: string;
  date: Date;
  type: 'purchase' | 'usage' | 'refund' | 'bonus';
  description: string;
  amount: number;  // Dollars
  credits: number;  // Credit count
  invoice_url?: string;
  status: 'completed' | 'pending' | 'failed';
}

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

  className?: string;
}

export function BillingHistory({
  itemsPerPage = 10,
  showFilters = true,
  showExport = true,
  className,
}: BillingHistoryProps) {
  const { profile } = useAuthStore();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<'all' | 'purchase' | 'usage' | 'refund' | 'bonus'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc'>('date-desc');

  useEffect(() => {
    const loadTransactions = async () => {
      if (!profile?.id) return;
      setLoading(true);
      try {
        const data = await creditsDB.listByUserId(profile.id, 100);

        const mapped: Transaction[] = data.map((row) => {
          const credits = row.amount as number;
          const reason: string = (row.action as string) ?? '';

          let type: Transaction['type'] = 'usage';
          if (reason.startsWith('purchase:') || reason.startsWith('subscription_grant:')) {
            type = credits > 0 ? 'purchase' : 'usage';
          } else if (reason.startsWith('refund:')) {
            type = 'refund';
          } else if (reason.startsWith('bonus:') || reason.startsWith('welcome') || reason.startsWith('referral:')) {
            type = 'bonus';
          } else if (credits < 0) {
            type = 'usage';
          }

          const description = reason
            .replace('subscription_grant:', 'Subscription: ')
            .replace('purchase:', 'Credit purchase: ')
            .replace('refund:', 'Refund: ')
            .replace('bonus:', 'Bonus: ')
            .replace('usage:', 'Used: ')
            .replace(/_/g, ' ')
            .replace(/^./, (c) => c.toUpperCase());

          return {
            id:          row.id,
            date:        new Date(row.created_at),
            type,
            description: description || (credits < 0 ? 'Credits used' : 'Credits added'),
            amount:      0,
            credits,
            status:      'completed',
          };
        });

        setTransactions(mapped);
      } catch {
        toast.error('Failed to load billing history');
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [profile?.id]);

  // Filter and sort
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

  // Paginate
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
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
          `$${t.amount}`,
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

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-border bg-secondary/50 p-6', className)}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500/30 border-t-violet-500" />
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
            View your transactions and invoices
          </p>
        </div>
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

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as any);
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
            onChange={(e) => setSortBy(e.target.value as any)}
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
                      {transaction.amount > 0 ? '-' : '+'}${Math.abs(transaction.amount)}
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
                      {transaction.amount > 0 ? '-' : '+'}${Math.abs(transaction.amount)}
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
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages} • {filteredTransactions.length} total
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              ← Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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
