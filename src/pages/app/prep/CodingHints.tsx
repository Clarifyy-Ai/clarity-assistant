import { fetchEdge } from "@/lib/network/fetchEdge";
import { useState, useMemo } from "react";
import { useCredits } from "@/hooks/useCredits";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Code2, Search, ChevronRight, Lightbulb, BookOpen,
  Copy, Sparkles, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "all",       label: "All",           icon: "📋" },
  { id: "arrays",    label: "Arrays",        icon: "📊" },
  { id: "strings",   label: "Strings",       icon: "🔤" },
  { id: "trees",     label: "Trees",         icon: "🌳" },
  { id: "graphs",    label: "Graphs",        icon: "🕸️" },
  { id: "dp",        label: "Dynamic Prog.", icon: "📐" },
  { id: "linked",    label: "Linked Lists",  icon: "🔗" },
  { id: "sorting",   label: "Sorting",       icon: "↕️" },
];

type Difficulty = "easy" | "medium" | "hard";

interface CodingProblem {
  id: string;
  title: string;
  category: string;
  difficulty: Difficulty;
  description: string;
  examples: string;
  tags: string[];
}

const PROBLEMS: CodingProblem[] = [
  { id: "1",  title: "Two Sum",                      category: "arrays",   difficulty: "easy",   description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution.", examples: "Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]", tags: ["hash map", "brute force"] },
  { id: "2",  title: "Best Time to Buy and Sell Stock", category: "arrays", difficulty: "easy",   description: "Given an array prices where prices[i] is the price of a given stock on the ith day, find the maximum profit you can achieve. You may complete at most one transaction.", examples: "Input: prices = [7,1,5,3,6,4]\nOutput: 5", tags: ["sliding window", "greedy"] },
  { id: "3",  title: "Maximum Subarray",              category: "arrays",   difficulty: "medium", description: "Given an integer array nums, find the subarray with the largest sum, and return its sum.", examples: "Input: nums = [-2,1,-3,4,-1,2,1,-5,4]\nOutput: 6", tags: ["kadane's", "divide and conquer"] },
  { id: "4",  title: "Product of Array Except Self",   category: "arrays",   difficulty: "medium", description: "Given an integer array nums, return an array answer such that answer[i] is equal to the product of all elements of nums except nums[i], without using division.", examples: "Input: nums = [1,2,3,4]\nOutput: [24,12,8,6]", tags: ["prefix/suffix"] },
  { id: "5",  title: "Valid Anagram",                 category: "strings",  difficulty: "easy",   description: "Given two strings s and t, return true if t is an anagram of s, and false otherwise.", examples: "Input: s = 'anagram', t = 'nagaram'\nOutput: true", tags: ["hash map", "sorting"] },
  { id: "6",  title: "Longest Substring Without Repeating", category: "strings", difficulty: "medium", description: "Given a string s, find the length of the longest substring without repeating characters.", examples: "Input: s = 'abcabcbb'\nOutput: 3", tags: ["sliding window", "hash set"] },
  { id: "7",  title: "Group Anagrams",                category: "strings",  difficulty: "medium", description: "Given an array of strings strs, group the anagrams together. You can return the answer in any order.", examples: "Input: ['eat','tea','tan','ate','nat','bat']\nOutput: [['bat'],['nat','tan'],['ate','eat','tea']]", tags: ["hash map", "sorting"] },
  { id: "8",  title: "Longest Palindromic Substring",  category: "strings",  difficulty: "medium", description: "Given a string s, return the longest palindromic substring in s.", examples: "Input: s = 'babad'\nOutput: 'bab' or 'aba'", tags: ["expand around center", "dp"] },
  { id: "9",  title: "Invert Binary Tree",            category: "trees",    difficulty: "easy",   description: "Given the root of a binary tree, invert the tree, and return its root.", examples: "Input: root = [4,2,7,1,3,6,9]\nOutput: [4,7,2,9,6,3,1]", tags: ["recursion", "bfs"] },
  { id: "10", title: "Maximum Depth of Binary Tree",   category: "trees",    difficulty: "easy",   description: "Given the root of a binary tree, return its maximum depth.", examples: "Input: root = [3,9,20,null,null,15,7]\nOutput: 3", tags: ["recursion", "dfs"] },
  { id: "11", title: "Validate Binary Search Tree",    category: "trees",    difficulty: "medium", description: "Given the root of a binary tree, determine if it is a valid binary search tree (BST).", examples: "Input: root = [2,1,3]\nOutput: true", tags: ["dfs", "inorder"] },
  { id: "12", title: "Lowest Common Ancestor",         category: "trees",    difficulty: "medium", description: "Given a binary tree, find the lowest common ancestor (LCA) of two given nodes in the tree.", examples: "Input: root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1\nOutput: 3", tags: ["recursion", "dfs"] },
  { id: "13", title: "Number of Islands",              category: "graphs",   difficulty: "medium", description: "Given an m x n 2D binary grid which represents a map of '1's (land) and '0's (water), return the number of islands.", examples: "Input: grid = [['1','1','0'],['1','1','0'],['0','0','1']]\nOutput: 2", tags: ["bfs", "dfs", "union find"] },
  { id: "14", title: "Clone Graph",                    category: "graphs",   difficulty: "medium", description: "Given a reference of a node in a connected undirected graph, return a deep copy (clone) of the graph.", examples: "Input: adjList = [[2,4],[1,3],[2,4],[1,3]]\nOutput: [[2,4],[1,3],[2,4],[1,3]]", tags: ["bfs", "dfs", "hash map"] },
  { id: "15", title: "Course Schedule",                category: "graphs",   difficulty: "medium", description: "There are a total of numCourses courses you have to take. Some courses may have prerequisites. Determine if you can finish all courses.", examples: "Input: numCourses = 2, prerequisites = [[1,0]]\nOutput: true", tags: ["topological sort", "dfs"] },
  { id: "16", title: "Climbing Stairs",                category: "dp",       difficulty: "easy",   description: "You are climbing a staircase. It takes n steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?", examples: "Input: n = 3\nOutput: 3", tags: ["fibonacci", "memoization"] },
  { id: "17", title: "Coin Change",                    category: "dp",       difficulty: "medium", description: "Given an integer array coins representing coin denominations and an integer amount, return the fewest number of coins needed to make up that amount.", examples: "Input: coins = [1,2,5], amount = 11\nOutput: 3", tags: ["bottom-up dp"] },
  { id: "18", title: "Longest Increasing Subsequence",  category: "dp",       difficulty: "medium", description: "Given an integer array nums, return the length of the longest strictly increasing subsequence.", examples: "Input: nums = [10,9,2,5,3,7,101,18]\nOutput: 4", tags: ["binary search", "dp"] },
  { id: "19", title: "Reverse Linked List",            category: "linked",   difficulty: "easy",   description: "Given the head of a singly linked list, reverse the list, and return the reversed list.", examples: "Input: head = [1,2,3,4,5]\nOutput: [5,4,3,2,1]", tags: ["iterative", "recursive"] },
  { id: "20", title: "Merge Two Sorted Lists",         category: "linked",   difficulty: "easy",   description: "Merge two sorted linked lists and return it as a sorted list. The list should be made by splicing together the nodes of the first two lists.", examples: "Input: l1 = [1,2,4], l2 = [1,3,4]\nOutput: [1,1,2,3,4,4]", tags: ["recursion", "iterative"] },
  { id: "21", title: "Merge Sort",                     category: "sorting",  difficulty: "medium", description: "Implement merge sort algorithm. Given an array of integers, sort them in ascending order using the divide and conquer approach.", examples: "Input: [38,27,43,3,9,82,10]\nOutput: [3,9,10,27,38,43,82]", tags: ["divide and conquer", "stable sort"] },
  { id: "22", title: "Quick Select (Kth Largest)",     category: "sorting",  difficulty: "medium", description: "Find the kth largest element in an unsorted array. Note that it is the kth largest element in sorted order, not the kth distinct element.", examples: "Input: nums = [3,2,1,5,6,4], k = 2\nOutput: 5", tags: ["partition", "quickselect"] },
];

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy:   "emerald",
  medium: "amber",
  hard:   "red",
};

export default function CodingHints() {
  const credits = useCredits();

  const [category, setCategory]     = useState("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<string | null>(null);
  const [hintText, setHintText]     = useState("");
  const [solutionText, setSolutionText] = useState("");
  const [loading, setLoading]       = useState<"hint" | "solution" | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [depth, setDepth]           = useState<"surface" | "medium" | "near-complete">("surface");

  const filtered = useMemo(() => {
    return PROBLEMS.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (difficulty !== "all" && p.difficulty !== difficulty) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.title.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q));
      }
      return true;
    });
  }, [category, difficulty, search]);

  const activeProblem = PROBLEMS.find((p) => p.id === selected);

  async function getAIHint() {
    if (!activeProblem || !credits.canAfford("coding_hint")) return;
    setLoading("hint");
    setError(null);
    setHintText("");

    const { success, error: deductErr } = await credits.deduct("coding_hint");
    if (!success) {
      setError(deductErr ?? "Failed to deduct credits");
      setLoading(null);
      return;
    }

    try {
      
      const input = `Problem: ${activeProblem.title}\n\n${activeProblem.description}\n\nExamples:\n${activeProblem.examples}\n\nTags: ${activeProblem.tags.join(", ")}`;
      const res = await fetchEdge("prep-tool", { tool_id: "coding_hint", input, depth });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setHintText(data.result ?? "Think about the data structures that would help here. Consider time and space complexity tradeoffs.");
    } catch (err) {
      await credits.refund("coding_hint");
      setHintText(getOfflineHint(activeProblem));
      toast.info("Using offline hints — AI unavailable. Credit refunded.");
    }
    setLoading(null);
  }

  async function getAISolution() {
    if (!activeProblem || !credits.canAfford("coding_solution")) return;
    setLoading("solution");
    setError(null);
    setSolutionText("");

    const { success, error: deductErr } = await credits.deduct("coding_solution");
    if (!success) {
      setError(deductErr ?? "Failed to deduct credits");
      setLoading(null);
      return;
    }

    try {
      
      const input = `Problem: ${activeProblem.title}\n\n${activeProblem.description}\n\nExamples:\n${activeProblem.examples}\n\nTags: ${activeProblem.tags.join(", ")}`;
      const res = await fetchEdge("prep-tool", { tool_id: "coding_solution", input });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setSolutionText(data.result ?? "Solution explanation unavailable.");
    } catch (err) {
      await credits.refund("coding_solution");
      setSolutionText(getOfflineSolution(activeProblem));
      toast.info("Using offline solution — AI unavailable. Credit refunded.");
    }
    setLoading(null);
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Coding Problems"
        description="Browse interview coding problems, get AI hints and solution explanations"
      />

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="lg:w-[380px] space-y-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problems…"
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all",
                  category === c.id
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {(["all", "easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={cn(
                  "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all capitalize",
                  difficulty === d
                    ? d === "easy" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                    : d === "medium" ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                    : d === "hard" ? "bg-red-500/20 border-red-500/30 text-red-300"
                    : "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelected(p.id); setHintText(""); setSolutionText(""); setError(null); }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border transition-all",
                  selected === p.id
                    ? "bg-violet-600/10 border-violet-500/30"
                    : "bg-secondary/50 border-border hover:bg-secondary"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate pr-2">{p.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge
                    variant={DIFFICULTY_COLORS[p.difficulty] as "emerald" | "amber" | "red"}
                    size="sm"
                  >
                    {p.difficulty}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{CATEGORIES.find((c) => c.id === p.category)?.label}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8">
                <Code2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No problems match your filters.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {activeProblem ? (
            <>
              <Card>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{activeProblem.title}</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant={DIFFICULTY_COLORS[activeProblem.difficulty] as "emerald" | "amber" | "red"} size="sm">
                        {activeProblem.difficulty}
                      </Badge>
                      {activeProblem.tags.map((t) => (
                        <Badge key={t} variant="default" size="sm">{t}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{activeProblem.description}</p>
                <div className="mt-4 bg-muted/40 rounded-xl p-4 font-mono text-xs text-foreground whitespace-pre-wrap">
                  {activeProblem.examples}
                </div>
              </Card>

              {error && (
                <Card className="border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                </Card>
              )}

              {/* Depth selector */}
              <div className="flex gap-1.5">
                {([
                  { id: "surface",      label: "Quick hint" },
                  { id: "medium",       label: "Deeper hint" },
                  { id: "near-complete", label: "Near-complete" },
                ] as const).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setDepth(d.id); setHintText(""); }}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                      depth === d.id
                        ? "bg-violet-500/20 border-violet-500/30 text-violet-300"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={getAIHint}
                  disabled={loading === "hint" || !credits.canAfford("coding_hint")}
                  loading={loading === "hint"}
                  leftIcon={<Lightbulb className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Get hint ({credits.costs.coding_hint} credit)
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={getAISolution}
                  disabled={loading === "solution" || !credits.canAfford("coding_solution")}
                  loading={loading === "solution"}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Explain solution ({credits.costs.coding_solution} credits)
                </Button>
              </div>

              {hintText && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" /> Hint
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(hintText); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{hintText}</p>
                </Card>
              )}

              {solutionText && (
                <Card className="border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" /> Solution Explanation
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(solutionText); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{solutionText}</p>
                </Card>
              )}
            </>
          ) : (
            <Card className="text-center py-20">
              <Code2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Select a problem to view details</p>
              <p className="text-muted-foreground text-xs mt-1">Get AI-powered hints and solution explanations</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function getOfflineHint(problem: CodingProblem): string {
  const hints: Record<string, string> = {
    arrays: "Consider using a hash map to track values you've seen. Think about whether you can solve this in a single pass through the array.",
    strings: "Think about character frequency counting. A hash map or array of size 26 can track character occurrences efficiently.",
    trees: "Consider recursive vs iterative approaches. For most tree problems, DFS (pre/in/post-order) or BFS (level-order) will work.",
    graphs: "Think about BFS vs DFS traversal. Consider using a visited set to avoid cycles. Is this a connectivity or shortest-path problem?",
    dp: "Identify the subproblems and their relationships. Can you express the solution in terms of smaller subproblems? Start with a recurrence relation.",
    linked: "Use a two-pointer technique or dummy head node. Drawing out the pointer manipulations on paper often clarifies the logic.",
    sorting: "Think about the divide-and-conquer paradigm. What's the key insight for the partition/merge step?",
  };
  return hints[problem.category] ?? "Break the problem into smaller subproblems. Consider edge cases like empty input, single element, and duplicates.";
}

function getOfflineSolution(problem: CodingProblem): string {
  return `Offline solution guide for "${problem.title}":\n\n1. Key approach: Consider using ${problem.tags.join(" or ")}.\n2. Time complexity: Think about the optimal solution — most interview problems have O(n) or O(n log n) solutions.\n3. Space complexity: Can you solve this in-place or do you need auxiliary data structures?\n4. Edge cases: Empty input, single element, all duplicates, sorted/reverse sorted.\n\nPractice explaining your thought process aloud — interviewers care about your reasoning as much as the solution.`;
}
