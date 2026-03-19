// @ts-nocheck
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/userStore';
import { Calendar, Download, CreditCard, ArrowDownLeft, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const toast = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<'all' | 'purchase' | 'usage' | 'refund' | 'bonus'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc'>('date-desc');

  // Load transactions
  useEffect(() => {
    const loadTransactions = async () => {
      setLoading(true);
      try {
        // TODO: Fetch from API
        // const response = await fetch(`/api/billing/transactions?userId=${profile?.id}`);
        // const data = await response.json();
        // setTransactions(data);

        // Mock data for now
        setTransactions([
          {
            id: '1',
            date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            type: 'purchase',
            description: 'Pro Plan Subscription',
            amount: 12,
            credits: 30,
            status: 'completed',
          },
          {
            id: '2',
            date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            type: 'usage',
            description: '5 interviews completed',
            amount: 0,
            credits: -5,
            status: 'completed',
          },
          {
            id: '3',
            date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            type: 'bonus',
            description: 'Welcome bonus',
            amount: 0,
            credits: 10,
            status: 'completed',
          },
        ]);
      } catch (error) {
        toast({
          type: 'error',
          title: 'Error',
          description: 'Failed to load billing history',
        });
      } finally {
        setLoading(false);
      }
    };

    if (profile?.id) {
      loadTransactions();
    }
  }, [profile?.id, toast]);

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

    toast({
      type: 'success',
      title: 'Exported',
      description: 'Billing history exported to CSV',
    });
  };

  // Download invoice
  const handleDownloadInvoice = async (transaction: Transaction) => {
    if (!transaction.invoice_url) {
      toast({
        type: 'error',
        title: 'No invoice',
        description: 'This transaction does not have an invoice',
      });
      return;
    }

    try {
      window.open(transaction.invoice_url, '_blank');
    } catch (error) {
      toast({
        type: 'error',
        title: 'Error',
        description: 'Failed to download invoice',
      });
    }
  };

  if (loading) {
    return (
      <div className={cn('rounded-lg border border-white/10 bg-white/[0.02] p-6', className)}>
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
          <h3 className="text-lg font-bold text-white">Billing History</h3>
          <p className="text-xs text-gray-500 mt-1">
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
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as any);
                setCurrentPage(1);
              }}
              className="rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
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
            className="rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="amount-desc">Highest Amount</option>
          </select>
        </div>
      )}

      {/* Transactions Table */}
      {displayedTransactions.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-8 text-center">
          <Calendar className="h-8 w-8 text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">
                    Credits
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-gray-300">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-gray-600" />
                        {transaction.date.toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-medium text-white">
                          {transaction.description}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 capitalize">
                          {transaction.type}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-white">
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
                          className="p-1.5 rounded hover:bg-white/[0.05] transition-colors"
                          title="Download invoice"
                        >
                          <Download className="h-3.5 w-3.5 text-gray-500 hover:text-white" />
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
                className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {transaction.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-3 w-3 text-gray-600" />
                      <p className="text-xs text-gray-500">
                        {transaction.date.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">
                      {transaction.amount > 0 ? '-' : '+'}${Math.abs(transaction.amount)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">
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
                      className="p-1.5 rounded hover:bg-white/[0.05]"
                    >
                      <Download className="h-4 w-4 text-gray-500" />
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
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
          <p className="text-xs text-gray-500">
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
