"use client";

import {
  AlertTriangle,
  Bell,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Crosshair,
  Gauge,
  LineChart,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WATCHLIST } from "@/lib/shared/watchlist";
import type {
  AlertResponse,
  CrossMarketInsight,
  IntelligenceReport,
  MacroRiskEvent,
  OpportunityEngineResponse,
  PolymarketOpportunity,
  PolymarketScanResponse,
  ScanResponse,
  SetupCheckResponse,
  SetupReport,
  UnifiedOpportunity
} from "@/lib/shared/types";
import {
  analyzePaperTrades,
  loadPaperTrades,
  loadResearchFeed,
  PaperTrade,
  PaperTradeOutcome,
  polymarketToPaperTrade,
  ResearchFeedItem,
  savePaperTrades,
  saveResearchFeed,
  setupToPaperTrade
} from "@/lib/client/paper-trades";

type Tab =
  | "Top Opportunities"
  | "Stock Scanner"
  | "Polymarket Scanner"
  | "Cross-Market Opportunities"
  | "Reports"
  | "Alerts"
  | "Paper Trades"
  | "Research Feed"
  | "Setup"
  | "Rules / Education";

type CrossMarketResponse = {
  generatedAt: string;
  stockScan: ScanResponse | null;
  stockError: string | null;
  polymarketScan: PolymarketScanResponse;
  insights: CrossMarketInsight[];
};

type OpportunityAlertStatus = {
  state: "idle" | "sent" | "skipped" | "failed";
  message: string;
  warnings: string[];
};

const tabs: Tab[] = [
  "Top Opportunities",
  "Stock Scanner",
  "Polymarket Scanner",
  "Cross-Market Opportunities",
  "Reports",
  "Alerts",
  "Paper Trades",
  "Research Feed",
  "Setup",
  "Rules / Education"
];

const scanTimes = ["8:30 AM ET", "12:30 PM ET", "3:30 PM ET"];

function badgeClass(tone: "green" | "yellow" | "red" | "blue") {
  const classes = {
    green: "border-terminal-green/40 bg-terminal-green/10 text-terminal-green",
    yellow: "border-terminal-amber/40 bg-terminal-amber/10 text-terminal-amber",
    red: "border-terminal-red/40 bg-terminal-red/10 text-terminal-red",
    blue: "border-terminal-cyan/40 bg-terminal-cyan/10 text-terminal-cyan"
  };
  return `inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold ${classes[tone]}`;
}

function scoreTone(score: number) {
  if (score >= 75) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

function riskTone(risk: string) {
  if (risk === "low") return "green";
  if (risk === "medium") return "yellow";
  return "red";
}

function formatMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Top Opportunities");
  const [engine, setEngine] = useState<OpportunityEngineResponse | null>(null);
  const [stockScan, setStockScan] = useState<ScanResponse | null>(null);
  const [polyScan, setPolyScan] = useState<PolymarketScanResponse | null>(null);
  const [crossMarket, setCrossMarket] = useState<CrossMarketResponse | null>(null);
  const [setup, setSetup] = useState<SetupCheckResponse | null>(null);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>(loadPaperTrades);
  const [feed, setFeed] = useState<ResearchFeedItem[]>(loadResearchFeed);
  const [loading, setLoading] = useState<"stock" | "polymarket" | "cross" | "alert" | "opportunity" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertResult, setAlertResult] = useState<AlertResponse | null>(null);
  const [sendOpportunityTelegram, setSendOpportunityTelegram] = useState(false);
  const [opportunityAlertStatus, setOpportunityAlertStatus] = useState<OpportunityAlertStatus>({
    state: "idle",
    message: "Telegram alert skipped",
    warnings: []
  });

  useEffect(() => {
    void checkSetup();
  }, []);

  const analytics = useMemo(() => analyzePaperTrades(paperTrades), [paperTrades]);

  function persistTrades(nextTrades: PaperTrade[]) {
    setPaperTrades(nextTrades);
    savePaperTrades(nextTrades);
  }

  function persistFeed(items: ResearchFeedItem[]) {
    setFeed(items.slice(0, 200));
    saveResearchFeed(items);
  }

  function addFeedItem(item: Omit<ResearchFeedItem, "id" | "timestamp">) {
    persistFeed([{ ...item, id: `${item.source}-${item.symbol}-${Date.now()}`, timestamp: new Date().toISOString() }, ...feed]);
  }

  async function checkSetup() {
    try {
      const response = await fetch("/.netlify/functions/check-setup");
      if (!response.ok) throw new Error("Setup check failed.");
      setSetup((await response.json()) as SetupCheckResponse);
    } catch (caught) {
      setSetup({
        configured: {},
        publicApis: {
          POLYMARKET_GAMMA_API: true,
          POLYMARKET_DATA_API: true,
          POLYMARKET_CLOB_PUBLIC_API: true
        },
        requiredMissing: ["OPENAI_API_KEY", "FINNHUB_API_KEY"],
        optionalMissing: [
          "POLYGON_API_KEY",
          "TWILIO_ACCOUNT_SID",
          "TWILIO_AUTH_TOKEN",
          "TWILIO_FROM_NUMBER",
          "USER_PHONE_NUMBER",
          "TELEGRAM_BOT_TOKEN",
          "TELEGRAM_CHAT_ID",
          "RESEND_API_KEY",
          "ALERT_EMAIL_TO",
          "ALERT_EMAIL_FROM"
        ]
      });
      setError(caught instanceof Error ? caught.message : "Setup check failed.");
    }
  }

  async function runStockScan() {
    setLoading("stock");
    setError(null);
    setActiveTab("Stock Scanner");
    try {
      const response = await fetch("/.netlify/functions/run-market-scan", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Stock scan failed.");
      const scan = payload as ScanResponse;
      setStockScan(scan);
      scan.setups.forEach((setupReport) =>
        addFeedItem({
          source: "stock",
          symbol: setupReport.ticker,
          score: setupReport.score,
          summary: setupReport.ai.catalyst,
          status: "generated",
          paperTradeAction: "none",
          followUpNeeded: setupReport.ai.checkBeforeTrading[0] ?? "Review catalyst and risk."
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stock scan failed.");
    } finally {
      setLoading(null);
    }
  }

  async function runOpportunityEngineNow() {
    setLoading("opportunity");
    setError(null);
    setActiveTab("Top Opportunities");
    setOpportunityAlertStatus({
      state: "idle",
      message: sendOpportunityTelegram ? "Telegram alert pending" : "Telegram alert skipped",
      warnings: []
    });
    try {
      const response = await fetch("/.netlify/functions/run-opportunity-engine", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Opportunity engine failed.");
      const result = payload as OpportunityEngineResponse;
      setEngine(result);
      setStockScan(result.stockScan);
      setPolyScan(result.polymarketScan);
      setCrossMarket({
        generatedAt: result.generatedAt,
        stockScan: result.stockScan,
        stockError: result.stockScan ? null : result.warnings.find((warning) => warning.includes("Stock opportunity scan skipped")) ?? null,
        polymarketScan: result.polymarketScan,
        insights: result.crossMarketInsights
      });
      result.opportunities.slice(0, 12).forEach((opportunity) =>
        addFeedItem({
          source: opportunity.marketType,
          symbol: opportunity.symbol,
          score: opportunity.score,
          summary: `${opportunity.title}: ${opportunity.catalyst.whyItMatters}`,
          status: "generated",
          paperTradeAction: "none",
          followUpNeeded: opportunity.monitorNext[0] ?? opportunity.invalidation
        })
      );
      await maybeSendOpportunityTelegramAlerts(result.opportunities);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opportunity engine failed.");
      setOpportunityAlertStatus({
        state: "skipped",
        message: "Telegram alert skipped",
        warnings: ["Opportunity scan did not finish, so no alert was sent."]
      });
    } finally {
      setLoading(null);
    }
  }

  function selectTelegramAlertOpportunities(opportunities: UnifiedOpportunity[]) {
    const selected = new Map<string, UnifiedOpportunity>();
    const sorted = [...opportunities].sort((a, b) => b.attentionPriority - a.attentionPriority || b.score - a.score);
    const best = sorted[0];
    if (best) selected.set(best.id, best);

    sorted
      .filter((opportunity) => opportunity.score >= 85)
      .forEach((opportunity) => {
        if (selected.size < 3) selected.set(opportunity.id, opportunity);
      });

    sorted
      .filter((opportunity) => opportunity.riskLevel === "high" && opportunity.score >= 80)
      .forEach((opportunity) => {
        if (selected.size < 3) selected.set(opportunity.id, opportunity);
      });

    return [...selected.values()].slice(0, 3);
  }

  function buildOpportunityAlertMessage(opportunity: UnifiedOpportunity) {
    return [
      `Market: ${opportunity.symbol}`,
      `Score: ${opportunity.score}`,
      `Risk: ${opportunity.riskLevel}`,
      `Confidence: ${opportunity.confidence}`,
      `Catalyst: ${opportunity.catalyst.type} - ${opportunity.catalyst.whyItMatters}`,
      `Bull/YES case: ${opportunity.bullCase}`,
      `Bear/NO case: ${opportunity.bearCase}`,
      `Trap risk: ${opportunity.trap}`,
      `Invalidation: ${opportunity.invalidation}`,
      `Suggested paper action only: ${opportunity.suggestedPaperAction}`,
      "Research only. Manual approval only. Never auto-trade."
    ].join("\n\n");
  }

  async function maybeSendOpportunityTelegramAlerts(opportunities: UnifiedOpportunity[]) {
    if (!sendOpportunityTelegram) {
      setOpportunityAlertStatus({ state: "skipped", message: "Telegram alert skipped", warnings: ["Toggle is off."] });
      return;
    }

    const selected = selectTelegramAlertOpportunities(opportunities);
    if (!selected.length) {
      setOpportunityAlertStatus({ state: "skipped", message: "Telegram alert skipped", warnings: ["No opportunities met alert rules."] });
      return;
    }

    const warnings: string[] = [];
    let sentCount = 0;

    try {
      for (const opportunity of selected) {
        const response = await fetch("/.netlify/functions/send-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Opportunity alert: ${opportunity.symbol}`,
            message: buildOpportunityAlertMessage(opportunity),
            severity: opportunity.riskLevel,
            alertType:
              opportunity.riskLevel === "high" && opportunity.score >= 80
                ? "risk warning"
                : opportunity.marketType === "polymarket"
                  ? "polymarket mover"
                  : "stock mover",
            channels: ["telegram"]
          })
        });
        const payload = (await response.json()) as AlertResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Telegram alert failed.");
        warnings.push(...payload.warnings);
        if (payload.sent) sentCount += 1;
      }

      setOpportunityAlertStatus({
        state: sentCount > 0 ? "sent" : "skipped",
        message: sentCount > 0 ? `Telegram alert sent (${sentCount})` : "Telegram alert skipped",
        warnings: sentCount > 0 ? warnings : [...warnings, "Telegram channel was not configured or delivered no messages."]
      });
    } catch (caught) {
      setOpportunityAlertStatus({
        state: "failed",
        message: "Telegram alert failed",
        warnings: [caught instanceof Error ? caught.message : "Telegram alert failed."]
      });
    }
  }

  async function runPolymarketScanNow() {
    setLoading("polymarket");
    setError(null);
    setActiveTab("Polymarket Scanner");
    try {
      const response = await fetch("/.netlify/functions/run-polymarket-scan", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Polymarket scan failed.");
      const scan = payload as PolymarketScanResponse;
      setPolyScan(scan);
      scan.opportunities.forEach((market) =>
        addFeedItem({
          source: "polymarket",
          symbol: market.question,
          score: market.score,
          summary: `${market.currentConsensus}. ${market.catalyst}`,
          status: "generated",
          paperTradeAction: "none",
          followUpNeeded: market.whatToMonitor[0] ?? "Review rules and spread."
        })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Polymarket scan failed.");
    } finally {
      setLoading(null);
    }
  }

  async function runCrossMarket() {
    setLoading("cross");
    setError(null);
    setActiveTab("Cross-Market Opportunities");
    try {
      const response = await fetch("/.netlify/functions/run-cross-market-scan", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Cross-market scan failed.");
      setCrossMarket(payload as CrossMarketResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cross-market scan failed.");
    } finally {
      setLoading(null);
    }
  }

  async function sendTestAlert() {
    setLoading("alert");
    setError(null);
    try {
      const response = await fetch("/.netlify/functions/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Market Intelligence AI test alert",
          message: "This is a configured-channel test. Research only; no auto-trading.",
          severity: "medium",
          alertType: "test",
          channels: ["telegram", "email", "sms"]
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Alert failed.");
      setAlertResult(payload as AlertResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Alert failed.");
    } finally {
      setLoading(null);
    }
  }

  function addStockTrade(setupReport: SetupReport, status: PaperTradeOutcome) {
    persistTrades([setupToPaperTrade(setupReport, status), ...paperTrades]);
    addFeedItem({
      source: "stock",
      symbol: setupReport.ticker,
      score: setupReport.score,
      summary: setupReport.ai.catalyst,
      status: status === "skipped" ? "skipped" : "approved",
      paperTradeAction: status,
      followUpNeeded: setupReport.ai.invalidation
    });
  }

  function addPolyTrade(market: PolymarketOpportunity, status: PaperTradeOutcome) {
    persistTrades([polymarketToPaperTrade(market, status), ...paperTrades]);
    addFeedItem({
      source: "polymarket",
      symbol: market.question,
      score: market.score,
      summary: `${market.currentConsensus}. ${market.whyToSkip}`,
      status: status === "skipped" ? "skipped" : "approved",
      paperTradeAction: status,
      followUpNeeded: market.invalidation
    });
  }

  function updateOutcome(id: string, status: PaperTradeOutcome) {
    persistTrades(paperTrades.map((trade) => (trade.id === id ? { ...trade, status } : trade)));
  }

  return (
    <main className="terminal-grid min-h-screen bg-terminal-ink">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-terminal-line pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className={badgeClass("blue")}>V2 · Stocks + Polymarket · Research only</div>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-white sm:text-4xl">Market Intelligence AI</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-terminal-muted">
              Multi-market research terminal for stocks, ETFs, Polymarket odds, catalysts, smart money context, alerts, and paper-trade learning. No wallet, no private keys, no auto-execution.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <ActionButton onClick={runOpportunityEngineNow} loading={loading === "opportunity"} label="Opportunities" />
            <ActionButton onClick={runPolymarketScanNow} loading={loading === "polymarket"} label="Polymarket" />
            <ActionButton onClick={runCrossMarket} loading={loading === "cross"} label="Cross-Market" />
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm transition ${
                activeTab === tab
                  ? "border-terminal-cyan bg-terminal-cyan/12 text-terminal-cyan"
                  : "border-terminal-line bg-terminal-panel/80 text-terminal-muted hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {error ? <ErrorBanner message={error} /> : null}

        {activeTab === "Top Opportunities" ? (
          <TopOpportunitiesPanel
            engine={engine}
            loading={loading === "opportunity"}
            onRun={runOpportunityEngineNow}
            alertStatus={opportunityAlertStatus}
          />
        ) : null}
        {activeTab === "Stock Scanner" ? (
          <StockScanner scan={stockScan} loading={loading === "stock"} onRun={runStockScan} onPaperTrade={addStockTrade} setup={setup} />
        ) : null}
        {activeTab === "Polymarket Scanner" ? (
          <PolymarketScanner scan={polyScan} loading={loading === "polymarket"} onRun={runPolymarketScanNow} onPaperTrade={addPolyTrade} />
        ) : null}
        {activeTab === "Cross-Market Opportunities" ? (
          <CrossMarketPanel crossMarket={crossMarket} loading={loading === "cross"} onRun={runCrossMarket} />
        ) : null}
        {activeTab === "Reports" ? (
          <ReportsPanel engine={engine} loading={loading === "opportunity"} onRun={runOpportunityEngineNow} />
        ) : null}
        {activeTab === "Alerts" ? (
          <AlertsPanel
            setup={setup}
            result={alertResult}
            loading={loading === "alert"}
            onSendTest={sendTestAlert}
            sendOpportunityTelegram={sendOpportunityTelegram}
            onToggleOpportunityTelegram={setSendOpportunityTelegram}
            opportunityAlertStatus={opportunityAlertStatus}
          />
        ) : null}
        {activeTab === "Paper Trades" ? (
          <PaperTradesPanel trades={paperTrades} analytics={analytics} onOutcome={updateOutcome} />
        ) : null}
        {activeTab === "Research Feed" ? <ResearchFeedPanel feed={feed} /> : null}
        {activeTab === "Setup" ? <SetupPanel setup={setup} onRefresh={checkSetup} /> : null}
        {activeTab === "Rules / Education" ? <Rules /> : null}
      </div>
    </main>
  );
}

function ActionButton({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-terminal-cyan/40 bg-terminal-cyan px-4 py-2 text-sm font-bold text-terminal-ink shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      {label}
    </button>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <div className="flex items-center gap-2 text-terminal-cyan [&_svg]:h-4 [&_svg]:w-4">{icon}<span className="text-xs uppercase tracking-normal">{label}</span></div>
      <div className="mt-3 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-terminal-red/40 bg-terminal-red/10 p-4 text-sm text-terminal-red">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{message}</div>
      <p className="mt-2 text-terminal-muted">Check Setup for required keys and remember Polymarket public data needs no key.</p>
    </div>
  );
}

function TopOpportunitiesPanel({
  engine,
  loading,
  onRun,
  alertStatus
}: {
  engine: OpportunityEngineResponse | null;
  loading: boolean;
  onRun: () => void;
  alertStatus: OpportunityAlertStatus;
}) {
  const top = engine?.opportunities.slice(0, 10) ?? [];
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <Metric icon={<Sparkles />} label="Top opportunities" value={String(top.length)} />
        <Metric icon={<Gauge />} label="Best score" value={String(top[0]?.score ?? 0)} />
        <Metric icon={<Target />} label="Attention priority" value={String(top[0]?.attentionPriority ?? 0)} />
        <Metric icon={<Brain />} label="Data confidence" value={top[0]?.dataConfidence ?? "Run engine"} />
      </div>
      <ScannerHeader title="Opportunity intelligence engine" subtitle="Unifies stock movers, Polymarket movers, catalysts, macro risk, reports, and cross-market hypotheses." onRun={onRun} loading={loading} />
      <AlertStatusPanel status={alertStatus} />
      {loading ? <LoadingState text="Ranking stock and Polymarket research opportunities..." /> : null}
      {!loading && !engine ? <EmptyState text="Run the opportunity engine to rank multi-market research ideas." /> : null}
      {engine ? <WarningList items={engine.warnings} /> : null}
      <div className="grid gap-4">
        {top.map((opportunity) => (
          <article key={opportunity.id} className="rounded-md border border-terminal-line bg-terminal-panel p-4 shadow-glow">
            <CardTop title={opportunity.title} score={opportunity.score} risk={opportunity.riskLevel} confidence={opportunity.confidence} />
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={badgeClass(opportunity.marketType === "stock" ? "blue" : "green")}>{opportunity.marketType}</span>
              <span className={badgeClass(scoreTone(opportunity.attentionPriority))}>attention {opportunity.attentionPriority}</span>
              <span className={badgeClass(opportunity.dataConfidence === "high" ? "green" : opportunity.dataConfidence === "medium" ? "yellow" : "red")}>data {opportunity.dataConfidence}</span>
              <span className={badgeClass("yellow")}>Why skip this?</span>
            </div>
            <p className="mt-3 text-sm text-terminal-muted">{opportunity.current}</p>
            <BreakdownGrid items={opportunity.scoreBreakdown} />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Info title={`Catalyst: ${opportunity.catalyst.type}`} text={opportunity.catalyst.whyItMatters} />
              <Info title="Bull / YES case" text={opportunity.bullCase} />
              <Info title="Bear / NO case" text={opportunity.bearCase} />
              <Info title="Why it might be a trap" text={opportunity.trap} />
              <Info title="Invalidation" text={opportunity.invalidation} />
              <Info title="Suggested paper action" text={opportunity.suggestedPaperAction} />
            </div>
            <List title="Monitor next" items={opportunity.monitorNext} />
            <WarningList items={[opportunity.skipReason]} />
          </article>
        ))}
      </div>
      {engine ? <MacroRiskPanel items={engine.macroRiskToday} /> : null}
      {engine ? <EarningsWatchPanel items={engine.earningsWatch.slice(0, 8)} /> : null}
    </section>
  );
}

function ReportsPanel({ engine, loading, onRun }: { engine: OpportunityEngineResponse | null; loading: boolean; onRun: () => void }) {
  return (
    <section className="grid gap-4">
      <ScannerHeader title="Morning / midday / closing reports" subtitle="Server-generated summaries from the unified opportunity engine. Paper-trade ideas only." onRun={onRun} loading={loading} />
      {loading ? <LoadingState text="Generating report cards..." /> : null}
      {!loading && !engine ? <EmptyState text="Run the opportunity engine to generate report cards." /> : null}
      {engine?.reports.map((report) => <ReportCard key={report.id} report={report} />)}
    </section>
  );
}

function ReportCard({ report }: { report: IntelligenceReport }) {
  return (
    <article className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-white">{report.title}</h2>
        <span className={badgeClass("blue")}>{new Date(report.generatedAt).toLocaleString()}</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <List title="Top stock setups" items={report.topStocks.map((item) => `${item.symbol}: score ${item.score}, ${item.catalyst.type}`)} />
        <List title="Top Polymarket setups" items={report.topPolymarket.map((item) => `${item.symbol}: score ${item.score}, ${item.catalyst.type}`)} />
        <Info title="Biggest risk today" text={report.biggestRiskToday} />
        <List title="What to ignore" items={report.whatToIgnore} />
        <List title="Monitor next" items={report.monitorNext} />
        <List title="Paper-trade ideas only" items={report.paperTradeIdeasOnly} />
      </div>
    </article>
  );
}

function MacroRiskPanel({ items }: { items: MacroRiskEvent[] }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <h2 className="text-lg font-semibold text-white">Macro Risk Today</h2>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.category} className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
            <span className={badgeClass("yellow")}>{item.category}</span>
            <p className="mt-3 text-sm text-terminal-muted">{item.whyItMatters}</p>
            <p className="mt-2 text-sm text-terminal-amber">{item.monitor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EarningsWatchPanel({ items }: { items: { ticker: string; status: string; note: string }[] }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <h2 className="text-lg font-semibold text-white">Earnings Watch</h2>
      <p className="mt-2 text-sm text-terminal-muted">Placeholder until earnings-calendar provider support is enabled.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => <span key={item.ticker} className={badgeClass("yellow")}>{item.ticker}: {item.status}</span>)}
      </div>
    </div>
  );
}

function StockScanner({ scan, loading, onRun, onPaperTrade, setup }: { scan: ScanResponse | null; loading: boolean; onRun: () => void; onPaperTrade: (setup: SetupReport, status: PaperTradeOutcome) => void; setup: SetupCheckResponse | null }) {
  const strongest = scan?.setups[0];
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <Metric icon={<Radio />} label="Scheduled scans" value={scanTimes.join(" · ")} />
        <Metric icon={<Gauge />} label="Market regime" value={scan?.regime.label ?? "Run scan"} />
        <Metric icon={<TrendingUp />} label="Stock setups" value={String(scan?.setups.length ?? 0)} />
        <Metric icon={<ShieldAlert />} label="Stock env" value={setup?.requiredMissing.length ? "Missing keys" : "Ready"} />
      </div>
      <ScannerHeader title="Stock / ETF scanner" subtitle="Finnhub quotes/news, optional Polygon, backend OpenAI reports, no frontend secrets." onRun={onRun} loading={loading} />
      {loading ? <LoadingState text="Fetching stock quotes, news, regime, and AI explanations..." /> : null}
      {!loading && !scan ? <EmptyState text="Run a stock scan to fetch real quotes and catalysts." /> : null}
      {strongest ? <CompactStock setup={strongest} /> : null}
      {scan?.setups.map((setupReport) => <StockSetupCard key={setupReport.ticker} setup={setupReport} onPaperTrade={onPaperTrade} />)}
      {scan ? <WarningList items={scan.warnings} /> : null}
      <Watchlist />
    </section>
  );
}

function PolymarketScanner({ scan, loading, onRun, onPaperTrade }: { scan: PolymarketScanResponse | null; loading: boolean; onRun: () => void; onPaperTrade: (market: PolymarketOpportunity, status: PaperTradeOutcome) => void }) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <Metric icon={<Sparkles />} label="Opportunities" value={String(scan?.opportunities.length ?? 0)} />
        <Metric icon={<Users />} label="Smart money rows" value={String(scan?.smartMoney.traders.length ?? 0)} />
        <Metric icon={<LineChart />} label="Top score" value={String(scan?.opportunities[0]?.score ?? 0)} />
        <Metric icon={<ShieldAlert />} label="Public API" value="No key needed" />
      </div>
      <ScannerHeader title="Polymarket scanner" subtitle="Gamma events/markets plus Data API leaderboard. No wallet, private keys, or order placement." onRun={onRun} loading={loading} />
      {loading ? <LoadingState text="Fetching active events, markets, odds metadata, risk flags, and leaderboard..." /> : null}
      {!loading && !scan ? <EmptyState text="Run a Polymarket scan to find active public market research packets." /> : null}
      {scan?.opportunities.map((market) => <PolymarketCard key={market.id} market={market} onPaperTrade={onPaperTrade} />)}
      {scan ? <SmartMoneyPanel scan={scan} /> : null}
      {scan ? <WarningList items={scan.warnings} /> : null}
    </section>
  );
}

function ScannerHeader({ title, subtitle, loading, onRun }: { title: string; subtitle: string; loading: boolean; onRun: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-terminal-line bg-terminal-panel p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-terminal-muted">{subtitle}</p>
      </div>
      <button onClick={onRun} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-md border border-terminal-line px-3 py-2 text-sm text-terminal-muted hover:text-white disabled:opacity-60">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Run
      </button>
    </div>
  );
}

function CompactStock({ setup }: { setup: SetupReport }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <h2 className="text-lg font-semibold text-white">Strongest stock setup</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-2xl font-bold text-white">{setup.ticker}</span>
        <span className={badgeClass(scoreTone(setup.score))}>Score {setup.score}</span>
        <span className={badgeClass(riskTone(setup.riskLevel))}>{setup.riskLevel} risk</span>
      </div>
      <p className="mt-3 text-sm text-terminal-muted">{setup.ai.catalyst}</p>
      <p className="mt-2 text-sm text-terminal-amber">{setup.ai.whyToSkip}</p>
    </div>
  );
}

function StockSetupCard({ setup, onPaperTrade }: { setup: SetupReport; onPaperTrade: (setup: SetupReport, status: PaperTradeOutcome) => void }) {
  return (
    <article className="rounded-md border border-terminal-line bg-terminal-panel p-4 shadow-glow">
      <CardTop title={setup.ticker} score={setup.score} risk={setup.riskLevel} confidence={setup.ai.confidence} />
      <p className="mt-2 text-sm text-terminal-muted">${setup.quote.price.toFixed(2)} · {setup.quote.changePercent.toFixed(2)}% · {setup.regime.label}</p>
      <BreakdownGrid items={setup.breakdown} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Info title="Catalyst" text={setup.ai.catalyst} />
        <Info title="Bull case" text={setup.ai.bullCase} />
        <Info title="Bear case" text={setup.ai.bearCase} />
        <Info title="Why to skip" text={setup.ai.whyToSkip} />
        <Info title="Entry zone" text={setup.ai.entryZone} />
        <Info title="Invalidation" text={setup.ai.invalidation} />
      </div>
      <TradeButtons onApprove={() => onPaperTrade(setup, "open")} onSkip={() => onPaperTrade(setup, "skipped")} />
      <WarningList items={setup.warnings} />
    </article>
  );
}

function PolymarketCard({ market, onPaperTrade }: { market: PolymarketOpportunity; onPaperTrade: (market: PolymarketOpportunity, status: PaperTradeOutcome) => void }) {
  const riskItems = Object.entries(market.riskFlags).filter(([key, value]) => key !== "probableTrap" && value);
  return (
    <article className="rounded-md border border-terminal-line bg-terminal-panel p-4 shadow-glow">
      <CardTop title={market.question} score={market.score} risk={market.riskLevel} confidence={market.confidence} />
      <p className="mt-2 text-sm text-terminal-muted">
        {market.currentConsensus} · Attention {market.attentionPriority} · Category weight {market.categoryWeight} · Vol {formatMoney(market.volume)} · 24h {formatMoney(market.volume24hr)} · Liq {formatMoney(market.liquidity)}
      </p>
      <BreakdownGrid items={market.scoreBreakdown} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Info title="Resolution criteria" text={market.resolutionCriteria} />
        <Info title="Catalyst" text={market.catalyst} />
        <Info title="Strongest YES case" text={market.yesCase} />
        <Info title="Strongest NO case" text={market.noCase} />
        <Info title="Why to skip" text={market.whyToSkip} />
        <Info title="Why this is probably a trap" text={market.riskFlags.probableTrap} />
        <Info title="Invalidation" text={market.invalidation} />
        <div className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
          <h4 className="font-semibold text-white">Risk flags</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {riskItems.length ? riskItems.map(([key]) => <span key={key} className={badgeClass("yellow")}>{key}</span>) : <span className={badgeClass("green")}>No major flags</span>}
          </div>
        </div>
      </div>
      <TradeButtons onApprove={() => onPaperTrade(market, "open")} onSkip={() => onPaperTrade(market, "skipped")} />
      <WarningList items={market.warnings} />
    </article>
  );
}

function CardTop({ title, score, risk, confidence }: { title: string; score: number; risk: string; confidence: string }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <h3 className="max-w-4xl text-xl font-bold text-white">{title}</h3>
      <div className="flex shrink-0 flex-wrap gap-2">
        <span className={badgeClass(scoreTone(score))}>Score {score}</span>
        <span className={badgeClass(riskTone(risk))}>{risk} risk</span>
        <span className={badgeClass(confidence === "high" ? "green" : confidence === "medium" ? "yellow" : "red")}>{confidence} confidence</span>
      </div>
    </div>
  );
}

function BreakdownGrid({ items }: { items: Record<string, number> }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      {Object.entries(items).map(([key, value]) => (
        <div key={key} className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
          <div className="text-xs uppercase text-terminal-muted">{key}</div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-terminal-line"><div className="h-full bg-terminal-cyan" style={{ width: `${Math.min(100, value)}%` }} /></div>
          <div className="mt-2 text-lg font-bold text-white">{value}</div>
        </div>
      ))}
    </div>
  );
}

function TradeButtons({ onApprove, onSkip }: { onApprove: () => void; onSkip: () => void }) {
  return (
    <div className="mt-4 flex gap-2">
      <button onClick={onApprove} className="rounded-md bg-terminal-green px-3 py-2 text-sm font-bold text-terminal-ink">Paper Trade</button>
      <button onClick={onSkip} className="rounded-md border border-terminal-line px-3 py-2 text-sm text-terminal-muted hover:text-white">Skip</button>
    </div>
  );
}

function CrossMarketPanel({ crossMarket, loading, onRun }: { crossMarket: CrossMarketResponse | null; loading: boolean; onRun: () => void }) {
  return (
    <section className="grid gap-4">
      <ScannerHeader title="Cross-market opportunities" subtitle="Compares stock narratives with Polymarket themes. Inferred links are marked as hypotheses." onRun={onRun} loading={loading} />
      {loading ? <LoadingState text="Building cross-market hypotheses..." /> : null}
      {!loading && !crossMarket ? <EmptyState text="Run a cross-market scan to compare stock and Polymarket signals." /> : null}
      {crossMarket?.stockError ? <ErrorBanner message={crossMarket.stockError} /> : null}
      {crossMarket?.insights.map((insight) => (
        <article key={insight.id} className="rounded-md border border-terminal-line bg-terminal-panel p-4">
          <CardTop title={insight.title} score={insight.confidence === "medium" ? 65 : 45} risk="medium" confidence={insight.confidence} />
          <p className="mt-3 text-sm leading-6 text-terminal-muted">{insight.hypothesis}</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <List title="Stock signals" items={insight.stockSignals} />
            <List title="Polymarket signals" items={insight.polymarketSignals} />
            <Info title="Risk" text={insight.risk} />
            <Info title="Follow-up" text={insight.followUp} />
          </div>
        </article>
      ))}
    </section>
  );
}

function AlertStatusPanel({ status }: { status: OpportunityAlertStatus }) {
  const tone = status.state === "sent" ? "green" : status.state === "failed" ? "red" : "yellow";
  return (
    <div className={`rounded-md border p-3 text-sm ${tone === "green" ? "border-terminal-green/40 bg-terminal-green/10 text-terminal-green" : tone === "red" ? "border-terminal-red/40 bg-terminal-red/10 text-terminal-red" : "border-terminal-amber/40 bg-terminal-amber/10 text-terminal-amber"}`}>
      <div className="font-semibold">{status.message}</div>
      {status.warnings.length ? (
        <ul className="mt-2 grid gap-1">
          {status.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function AlertsPanel({
  setup,
  result,
  loading,
  onSendTest,
  sendOpportunityTelegram,
  onToggleOpportunityTelegram,
  opportunityAlertStatus
}: {
  setup: SetupCheckResponse | null;
  result: AlertResponse | null;
  loading: boolean;
  onSendTest: () => void;
  sendOpportunityTelegram: boolean;
  onToggleOpportunityTelegram: (enabled: boolean) => void;
  opportunityAlertStatus: OpportunityAlertStatus;
}) {
  const configured = setup?.configured ?? {};
  const channels = {
    Telegram: Boolean(configured.TELEGRAM_BOT_TOKEN && configured.TELEGRAM_CHAT_ID),
    Email: Boolean(configured.RESEND_API_KEY && configured.ALERT_EMAIL_TO && configured.ALERT_EMAIL_FROM),
    SMS: Boolean(configured.TWILIO_ACCOUNT_SID && configured.TWILIO_AUTH_TOKEN && configured.TWILIO_FROM_NUMBER && configured.USER_PHONE_NUMBER)
  };
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Bell className="h-5 w-5 text-terminal-cyan" /> Alert architecture</h2>
        <p className="mt-2 text-sm text-terminal-muted">Telegram is the preferred V3 channel. Alerts only send when channel env vars are configured. Triggers include high-score opportunities, risk warnings, morning brief, midday update, closing report, Polymarket movers, and stock movers.</p>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
          <span>
            <span className="block font-semibold text-white">Send Telegram alert after opportunity scan</span>
            <span className="mt-1 block text-sm text-terminal-muted">Default off for safety. When enabled, each scan sends at most 3 Telegram messages.</span>
          </span>
          <input
            type="checkbox"
            checked={sendOpportunityTelegram}
            onChange={(event) => onToggleOpportunityTelegram(event.target.checked)}
            className="h-5 w-5 accent-terminal-cyan"
          />
        </label>
        <div className="mt-4">
          <AlertStatusPanel status={opportunityAlertStatus} />
        </div>
        <div className="mt-4 grid gap-2">
          {Object.entries(channels).map(([channel, ready]) => (
            <div key={channel} className="flex items-center justify-between rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
              <span className="text-sm text-terminal-muted">{channel}</span>
              <span className={badgeClass(ready ? "green" : "yellow")}>{ready ? "Configured" : "Optional missing"}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
          <h3 className="font-semibold text-white">Alert preview</h3>
          <p className="mt-2 text-sm text-terminal-muted">[medium · test] Market Intelligence AI test alert</p>
          <p className="mt-1 text-sm text-terminal-muted">Research only. No auto-trading. Manual review required.</p>
        </div>
        <button onClick={onSendTest} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-md bg-terminal-cyan px-3 py-2 text-sm font-bold text-terminal-ink disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Send test alert</button>
      </div>
      <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
        <h2 className="text-lg font-semibold text-white">Last alert result</h2>
        {result ? (
          <div className="mt-3 grid gap-2 text-sm text-terminal-muted">
            <p>Sent: {String(result.sent)}</p>
            <p>Delivered: {result.deliveredChannels.join(", ") || "none"}</p>
            <WarningList items={result.warnings} />
          </div>
        ) : <EmptyState text="No alert has been tested in this browser session." />}
      </div>
    </section>
  );
}

function PaperTradesPanel({ trades, analytics, onOutcome }: { trades: PaperTrade[]; analytics: ReturnType<typeof analyzePaperTrades>; onOutcome: (id: string, status: PaperTradeOutcome) => void }) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Metric icon={<ClipboardCheck />} label="Ideas tracked" value={String(analytics.totalIdeas)} />
        <Metric icon={<CheckCircle2 />} label="Win rate" value={`${analytics.winRate}%`} />
        <Metric icon={<LineChart />} label="Stock win rate" value={`${analytics.winRateByMarketType.stock}%`} />
        <Metric icon={<Crosshair />} label="Polymarket win rate" value={`${analytics.winRateByMarketType.polymarket}%`} />
      </div>
      <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
        <h2 className="text-lg font-semibold text-white">Learning analytics</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Object.entries(analytics.winRateByScoreBucket).map(([bucket, value]) => <Metric key={bucket} icon={<Gauge />} label={`Score ${bucket}`} value={`${value}%`} />)}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Info title="Best category" text={analytics.bestPerformingCategory} />
          <Info title="Worst category" text={analytics.worstPerformingCategory} />
          <Info title="Most common failure" text={analytics.mostCommonFailureReason} />
        </div>
        <p className="mt-4 text-sm text-terminal-amber">{analytics.overconfidenceWarning}</p>
        <p className="mt-2 text-sm text-terminal-muted">All analytics are localStorage-only for now. Supabase can replace this storage later.</p>
      </div>
      <div className="grid gap-3">
        {trades.length ? trades.map((trade) => (
          <div key={trade.id} className="rounded-md border border-terminal-line bg-terminal-panel p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-bold text-white">{trade.symbol}</span>
                <span className="ml-2 text-sm text-terminal-muted">{trade.marketType} · score {trade.score}</span>
              </div>
              <select value={trade.status} onChange={(event) => onOutcome(trade.id, event.target.value as PaperTradeOutcome)} className="rounded-md border border-terminal-line bg-terminal-ink px-3 py-2 text-sm text-white">
                <option value="open">Open</option>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="breakeven">Breakeven</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
            <p className="mt-2 text-sm text-terminal-muted">{trade.notes || trade.stopLoss}</p>
          </div>
        )) : <EmptyState text="Approve or skip a stock or Polymarket idea to start the learning loop." />}
      </div>
    </section>
  );
}

function ResearchFeedPanel({ feed }: { feed: ResearchFeedItem[] }) {
  return (
    <section className="grid gap-3">
      {feed.length ? feed.map((item) => (
        <div key={item.id} className="rounded-md border border-terminal-line bg-terminal-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass(item.source === "stock" ? "blue" : item.source === "polymarket" ? "green" : "yellow")}>{item.source}</span>
            <span className="font-bold text-white">{item.symbol}</span>
            <span className={badgeClass(scoreTone(item.score))}>Score {item.score}</span>
            <span className="text-xs text-terminal-muted">{new Date(item.timestamp).toLocaleString()}</span>
          </div>
          <p className="mt-3 text-sm text-terminal-muted">{item.summary}</p>
          <p className="mt-2 text-sm text-terminal-amber">Follow-up: {item.followUpNeeded}</p>
        </div>
      )) : <EmptyState text="Scan results will be stored here locally as a research feed." />}
    </section>
  );
}

function SetupPanel({ setup, onRefresh }: { setup: SetupCheckResponse | null; onRefresh: () => void }) {
  const configured = setup?.configured ? Object.entries(setup.configured) : [];
  const publicApis = setup?.publicApis ? Object.entries(setup.publicApis) : [];
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between rounded-md border border-terminal-line bg-terminal-panel p-4">
        <h2 className="text-lg font-semibold text-white">Environment setup</h2>
        <button onClick={onRefresh} className="rounded-md border border-terminal-line px-3 py-2 text-sm text-terminal-muted hover:text-white">Refresh</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {configured.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between rounded-md border border-terminal-line bg-terminal-panel p-3">
            <span className="text-sm text-terminal-muted">{key}</span>
            <span className={badgeClass(value ? "green" : key === "OPENAI_API_KEY" || key === "FINNHUB_API_KEY" ? "red" : "yellow")}>{value ? "Configured" : "Missing"}</span>
          </div>
        ))}
        {publicApis.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between rounded-md border border-terminal-line bg-terminal-panel p-3">
            <span className="text-sm text-terminal-muted">{key}</span>
            <span className={badgeClass(value ? "green" : "red")}>{value ? "Public / no key" : "Unavailable"}</span>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
        <h2 className="text-lg font-semibold text-white">Telegram setup steps</h2>
        <ol className="mt-4 grid gap-2 text-sm text-terminal-muted">
          <li>1. Create a Telegram bot with BotFather.</li>
          <li>2. Send a message to the bot from the target chat.</li>
          <li>3. Get the chat id from Telegram bot updates.</li>
          <li>4. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Netlify env vars.</li>
          <li>5. Click the test alert button in the Alerts tab.</li>
        </ol>
      </div>
    </section>
  );
}

function Rules() {
  const rules = [
    "Research only, not financial advice, not gambling advice.",
    "No auto-trading, no Robinhood execution, no Polymarket execution.",
    "No wallet connection and no private-key handling in V2.",
    "Every idea needs risk, invalidation, skip reason, and fetched public data.",
    "Do not follow top traders blindly; late entries can be the trap.",
    "No market orders; paper-trade and learn before risking real money.",
    "Netlify scheduled functions are UTC cron placeholders for 8:30, 12:30, and 3:30 ET reports."
  ];
  return <List title="Rules / education" items={rules} />;
}

function Watchlist() {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <h2 className="text-lg font-semibold text-white">Stock watchlist</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {WATCHLIST.map((ticker) => <span key={ticker} className={badgeClass("blue")}>{ticker}</span>)}
      </div>
    </div>
  );
}

function SmartMoneyPanel({ scan }: { scan: PolymarketScanResponse }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Users className="h-5 w-5 text-terminal-cyan" /> Smart Money Watch</h2>
      <p className="mt-2 text-sm text-terminal-muted">Leaderboard context only. It does not prove where traders are currently positioned.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {scan.smartMoney.traders.slice(0, 6).map((trader) => (
          <div key={`${trader.rank}-${trader.proxyWallet}`} className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-white">#{trader.rank} {trader.userName}</span>
              <span className={badgeClass("green")}>P/L {formatMoney(trader.pnl)}</span>
            </div>
            <p className="mt-2 text-sm text-terminal-muted">{trader.possibleTheme}</p>
            <p className="mt-2 text-sm text-terminal-amber">{trader.caution}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
      <h4 className="font-semibold text-white">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-terminal-muted">{text}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><BookOpen className="h-5 w-5 text-terminal-cyan" /> {title}</h2>
      <ul className="mt-4 grid gap-3 text-sm text-terminal-muted">
        {items.length ? items.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-terminal-green" /><span>{item}</span></li>) : <li>No signals yet.</li>}
      </ul>
    </div>
  );
}

function WarningList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 grid gap-2">
      {items.map((item) => (
        <div key={item} className="flex gap-2 rounded-md border border-terminal-amber/30 bg-terminal-amber/10 p-3 text-sm text-terminal-amber">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-terminal-line bg-terminal-panel">
      <div className="flex items-center gap-3 text-terminal-cyan"><Loader2 className="h-5 w-5 animate-spin" /> {text}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-terminal-line bg-terminal-panel/50 p-6 text-center text-sm text-terminal-muted">{text}</div>;
}
