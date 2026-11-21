import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { SubscriptionCard } from './SubscriptionCard';
import type { Subscription } from '@/lib/types';
import { usePlan } from '@/hooks/usePlans';

vi.mock('@/hooks/usePlans', () => ({
  usePlan: vi.fn(),
}));

const mockedUsePlan = vi.mocked(usePlan);

const baseSubscription: Subscription = {
  id: 'sub_123',
  planId: 'plan_basic',
  planName: 'Basic',
  status: 'active',
  amount: 1000,
  currency: 'usd',
  interval: 'month',
  currentPeriodEnd: '2024-12-31T00:00:00.000Z',
};

describe('SubscriptionCard', () => {
  beforeEach(() => {
    mockedUsePlan.mockReset();
    mockedUsePlan.mockReturnValue({ plan: null, isLoading: false, error: null } as ReturnType<
      typeof usePlan
    >);
  });

  it('renders the subscription details', () => {
    const { getByText } = render(<SubscriptionCard subscription={baseSubscription} />);

    expect(getByText('Basic')).toBeInTheDocument();
    expect(getByText('active')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<SubscriptionCard subscription={baseSubscription} />);

    expect(await axe(container)).toHaveNoViolations();
  });

  describe('plan name', () => {
    it('does not render a plan name and requests null when planId is 0', () => {
      const { queryByTestId } = render(
        <SubscriptionCard subscription={{ ...baseSubscription, planId: 0 }} />,
      );

      expect(mockedUsePlan).toHaveBeenCalledWith(null);
      expect(queryByTestId('plan-name')).not.toBeInTheDocument();
    });

    it('renders the plan name as a secondary label when planId is non-zero', () => {
      mockedUsePlan.mockReturnValue({
        plan: { id: 42, name: 'Pro Plan' },
        isLoading: false,
        error: null,
      } as ReturnType<typeof usePlan>);

      const { getByTestId } = render(
        <SubscriptionCard subscription={{ ...baseSubscription, planId: 42 }} />,
      );

      expect(mockedUsePlan).toHaveBeenCalledWith(42);
      expect(getByTestId('plan-name')).toHaveTextContent('Pro Plan');
    });

    it('shows a loading placeholder while the plan is loading', () => {
      mockedUsePlan.mockReturnValue({
        plan: null,
        isLoading: true,
        error: null,
      } as ReturnType<typeof usePlan>);

      const { getByTestId } = render(
        <SubscriptionCard subscription={{ ...baseSubscription, planId: 42 }} />,
      );

      expect(getByTestId('plan-name-loading')).toBeInTheDocument();
    });

    it('shows a graceful message when the plan fails to load', () => {
      mockedUsePlan.mockReturnValue({
        plan: null,
        isLoading: false,
        error: new Error('boom'),
      } as ReturnType<typeof usePlan>);

      const { getByTestId } = render(
        <SubscriptionCard subscription={{ ...baseSubscription, planId: 42 }} />,
      );

      expect(getByTestId('plan-name-error')).toHaveTextContent('Plan unavailable');
    });
  });

  describe("CapProgress", () => {
    it("shows 0% when nothing has been charged", () => {
      renderCard({ ...base, totalCharged: 0n });
      const bar = screen.getByRole("progressbar", { name: "0% of the cap charged" });
      expect(bar).toHaveAttribute("aria-valuenow", "0");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    });

    it("shows the partial percentage and matching aria-valuenow", () => {
      renderCard(base);
      const bar = screen.getByRole("progressbar", { name: "25% of the cap charged" });
      expect(bar).toHaveAttribute("aria-valuenow", "25");
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
    });

    it("shows 100% when the whole cap has been charged", () => {
      renderCard({ ...base, status: SubStatus.Exhausted, totalCharged: 120_000_000n });
      const bar = screen.getByRole("progressbar", { name: "100% of the cap charged" });
      expect(bar).toHaveAttribute("aria-valuenow", "100");
    });

    it("keeps the charged percentage visible once cancelled", () => {
      renderCard({ ...base, status: SubStatus.Cancelled });
      const bar = screen.getByRole("progressbar", { name: "25% of the cap charged" });
      expect(bar).toHaveAttribute("aria-valuenow", "25");
    });
  });

  describe("SubStatusBadge", () => {
    it.each([
      [SubStatus.Active, /Active/i],
      [SubStatus.Paused, /Paused/i],
      [SubStatus.Cancelled, /Cancelled/i],
      [SubStatus.Exhausted, /Exhausted/i],
    ])("renders a badge for %s", (status, label) => {
      renderCard({ ...base, status });
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  describe("CommittedSpend", () => {
    it("shows the remaining committed amount for a single token", () => {
      renderCard(base);
      // 120_000_000 - 30_000_000 = 90_000_000 stroops = 9 XLM
      expect(screen.getByText(/9(\.0+)?\s*XLM/)).toBeInTheDocument();
    });

    it("never adds different tokens together", () => {
      renderCard({ ...base, token: "CUSDC" });
      // Only the subscription's own token is shown; no XLM figure leaks in.
      expect(screen.queryByText(/XLM/)).not.toBeInTheDocument();
    });

    it("shows nothing committed when the cap is fully charged", () => {
      renderCard({ ...base, status: SubStatus.Exhausted, totalCharged: 120_000_000n });
      expect(screen.queryByText(/9(\.0+)?\s*XLM/)).not.toBeInTheDocument();
    });
  });

  describe("NextChargeCountdown", () => {
    it("reads as not-yet when the next charge is in the future", async () => {
      renderCard(base);
      expect(await screen.findByText(/Not before about/)).toBeInTheDocument();
    });

    it("reads as allowed-now when the next charge ledger has passed", async () => {
      renderCard({ ...base, nextChargeLedger: 900 });
      expect(await screen.findByText(/can be charged now/i)).toBeInTheDocument();
    });

    it("says none while paused", () => {
      renderCard({ ...base, status: SubStatus.Paused });
      expect(screen.getByText("None while paused")).toBeInTheDocument();
    });

    it("says none once cancelled", () => {
      renderCard({ ...base, status: SubStatus.Cancelled });
      expect(screen.getByText("None — cancelled")).toBeInTheDocument();
    });

    it("says none once the cap is fully charged", () => {
      renderCard({ ...base, status: SubStatus.Exhausted, totalCharged: 120_000_000n });
      expect(screen.getByText(/Nothing more can be taken/)).toBeInTheDocument();
    });
  });
});
