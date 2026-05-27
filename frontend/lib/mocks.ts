// Mock data for surfaces depicted in ROADMAP.md that we don't have backend
// support for yet. See plan.md §9b for the full list of unwired surfaces.
// Anything imported from this file is NOT live data — treat it as decoration
// until the corresponding backend lands.

export type MockSession = {
  id: string;
  title: string;
  type: string;
  lang: string;
  code: string;
  status: "active" | "pending" | "ended";
  candidate: string;
  started: string;
  tokens: number;
  budget: number;
  halluc: number;
  caught: string;
  paste: number;
  score?: number;
};

export const SESSIONS: MockSession[] = [
  { id: "a1f3", title: "Search infra — onsite #2", type: "Debugging",        lang: "python",     code: "7I1Q5K5Y", status: "active",  candidate: "Sithu Soe",   started: "2 min ago",        tokens: 1242,  budget: 6000,  halluc: 30, caught: "1/2", paste: 0 },
  { id: "b2e4", title: "Stripe payment flow",       type: "API integration",  lang: "typescript", code: "CG05IT9J", status: "pending", candidate: "—",           started: "scheduled 4:00 PM", tokens: 0,     budget: 12000, halluc: 0,  caught: "—",   paste: 0 },
  { id: "c5d8", title: "Aggregate orders query",    type: "SQL / data query", lang: "sql",        code: "0P1WZ2UE", status: "ended",   candidate: "Phyo Thant",  started: "yesterday · 47m",   tokens: 2840,  budget: 3000,  halluc: 0,  caught: "0/0", paste: 2, score: 7.4 },
  { id: "d9k1", title: "Binary search — buggy",     type: "Debugging",        lang: "python",     code: "K3M2P7TQ", status: "ended",   candidate: "Alex Chen",   started: "Mon · 52m",         tokens: 5612,  budget: 6000,  halluc: 30, caught: "3/4", paste: 0, score: 8.6 },
  { id: "e3h7", title: "Rate limiter design",       type: "System design",    lang: "—",          code: "TR8XLM4F", status: "ended",   candidate: "Maria López", started: "Mon · 1h 12m",      tokens: 18420, budget: 20000, halluc: 0,  caught: "—",   paste: 1, score: 6.8 },
];

export const STATS = {
  sessionsThisWeek: { value: "14",    sub: "+3 vs last week",         spark: [3, 5, 4, 7, 6, 9, 8, 11, 10, 12, 14] },
  avgCaught:        { value: "62%",   sub: "across 8 debugging runs", spark: [40, 55, 60, 52, 68, 72, 65, 62] },
  medianScore:      { value: "7.4",   sub: "of 10",                   spark: [6.8, 7.0, 6.5, 7.4, 7.6, 7.2, 7.4] },
  tokensSpent:      { value: "84.2K", sub: "$0.32 est.",              spark: [8, 12, 10, 18, 22, 28, 32, 42, 48, 56, 64, 72, 84] },
};

// Per-interviewer + shared-team Anthropic usage. Both are mock per plan.md §9b — we
// don't aggregate usage by user yet, and there is no Anthropic billing API integration.
export const TOKENS_MINE = {
  value: "12.4K",
  sub: "$0.05 est. this week",
  spark: [1, 2, 1, 3, 2, 4, 3, 5, 4, 6, 7, 9, 12],
};

export const API_BALANCE = {
  used: 18.42,
  total: 25.0,
  // Mock: pretend the team has $25 of monthly Anthropic budget and we've burned ~$18.
  spentLabel: "$18.42",
  totalLabel: "$25.00",
  remainingLabel: "$6.58 remaining",
};

export const ACTIVITY = [
  { who: "Sithu Soe",   what: "joined",    target: "Search infra — onsite #2",   when: "2m",  color: "live"   },
  { who: "Phyo Thant",  what: "scheduled", target: "Stripe payment flow",        when: "32m", color: "signal" },
  { who: "Alex Chen",   what: "completed", target: "Binary search — buggy",      when: "Mon", color: "fg-2"   },
  { who: "AI",          what: "flagged",   target: "3 hallucinations rewritten", when: "Mon", color: "warn"   },
  { who: "Maria López", what: "submitted", target: "Rate limiter design",        when: "Mon", color: "fg-2"   },
] as const;

export const KTH_LARGEST_CODE = `def find_kth_largest(nums, k):
    """Return the k-th largest element in nums."""
    import heapq

    # Build a min-heap of size k
    heap = []
    for n in nums:
        if len(heap) < k:
            heapq.heappush(heap, n)
        elif n > heap[0]:
            heapq.heappop(heap)
            heapq.heappush(heap, n)

    return heap[0]


# test
print(find_kth_largest([3, 2, 1, 5, 6, 4], 2))`;

export const KTH_LARGEST_FIXED = `def find_kth_largest(nums, k):
    """Return the k-th largest element in nums."""
    import heapq

    if k > len(nums) or k < 1:
        raise ValueError("k must be between 1 and len(nums)")

    # Heapify the first k items, then push/pop-replace the rest.
    heap = nums[:k]
    heapq.heapify(heap)
    for n in nums[k:]:
        if n > heap[0]:
            heapq.heapreplace(heap, n)

    return heap[0]`;
