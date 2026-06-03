import type { SetupReport } from "@/lib/shared/types";

export type PaperTradeOutcome = "open" | "win" | "loss" | "breakeven" | "skipped";

export type PaperTrade = {
  id: string;
  ticker: string;
  createdAt: string;
  status: PaperTradeOutcome;
  score: number;
  entryZone: string;
  stopLoss: string;
  target: string;
  riskLevel: string;
  notes: string;
};

const STORAGE_KEY = "market-intelligence-paper-trades";

export function loadPaperTrades(): PaperTrade[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PaperTrade[]) : [];
  } catch {
    return [];
  }
}

export function savePaperTrades(trades: PaperTrade[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
}

export function setupToPaperTrade(setup: SetupReport, status: PaperTradeOutcome = "open"): PaperTrade {
  return {
    id: `${setup.ticker}-${Date.now()}`,
    ticker: setup.ticker,
    createdAt: new Date().toISOString(),
    status,
    score: setup.score,
    entryZone: setup.ai.entryZone,
    stopLoss: setup.ai.stopLoss,
    target: setup.ai.target,
    riskLevel: setup.riskLevel,
    notes: status === "skipped" ? setup.ai.whyToSkip : ""
  };
}
