"use client";

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Gauge,
  LineChart,
  Loader2,
  Play,
  ShieldAlert,
  Target,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WATCHLIST } from "@/lib/shared/watchlist";
import type { ScanResponse, SetupCheckResponse, SetupReport } from "@/lib/shared/types";
import {
  loadPaperTrades,
  PaperTrade,
  PaperTradeOutcome,
  savePaperTrades,
  setupToPaperTrade
} from "@/lib/client/paper-trades";

type Tab = "Dashboard" | "Scanner Report" | "Watchlist" | "Paper Trades" | "Education / Rules" | "Setup";

const tabs: Tab[] = ["Dashboard", "Scanner Report", "Watchlist", "Paper Trades", "Education / Rules", "Setup"];
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [setup, setSetup] = useState<SetupCheckResponse | null>(null);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>(loadPaperTrades);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void checkSetup();
  }, []);

  function persistTrades(nextTrades: PaperTrade[]) {
    setPaperTrades(nextTrades);
    savePaperTrades(nextTrades);
  }

  async function checkSetup() {
    setSetupLoading(true);
    try {
      const response = await fetch("/.netlify/functions/check-setup");
      if (!response.ok) throw new Error("Setup check failed.");
      setSetup((await response.json()) as SetupCheckResponse);
    } catch (caught) {
      setSetup({
        configured: {},
        requiredMissing: ["OPENAI_API_KEY", "FINNHUB_API_KEY"],
        optionalMissing: ["POLYGON_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "USER_PHONE_NUMBER"]
      });
      setError(caught instanceof Error ? caught.message : "Setup check failed.");
    } finally {
      setSetupLoading(false);
    }
  }

  async function runScan() {
    setLoading(true);
    setError(null);
    setActiveTab("Scanner Report");

    try {
      const response = await fetch("/.netlify/functions/run-market-scan", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Market scan failed.");
      setScan(payload as ScanResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Market scan failed.");
    } finally {
      setLoading(false);
    }
  }

  function addTrade(setupReport: SetupReport, status: PaperTradeOutcome) {
    persistTrades([setupToPaperTrade(setupReport, status), ...paperTrades]);
  }

  function updateOutcome(id: string, status: PaperTradeOutcome) {
    persistTrades(paperTrades.map((trade) => (trade.id === id ? { ...trade, status } : trade)));
  }

  const stats = useMemo(() => {
    const completed = paperTrades.filter((trade) => ["win", "loss", "breakeven"].includes(trade.status));
    const wins = completed.filter((trade) => trade.status === "win").length;
    return {
      total: paperTrades.filter((trade) => trade.status !== "skipped").length,
      skipped: paperTrades.filter((trade) => trade.status === "skipped").length,
      open: paperTrades.filter((trade) => trade.status === "open").length,
      winRate: completed.length ? Math.round((wins / completed.length) * 100) : 0
    };
  }, [paperTrades]);

  const strongest = scan?.setups[0];
  const highestRisk = scan?.setups.find((item) => item.riskLevel === "high") ?? scan?.setups.at(-1);

  return (
    <main className="terminal-grid min-h-screen bg-terminal-ink">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-terminal-line pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className={badgeClass("blue")}>Research only · Manual review · No auto-trading</div>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-white sm:text-4xl">Market Intelligence AI</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-terminal-muted">
              AI-assisted market scanning for a beginner trader with a small account. It reads external data from backend functions, scores research setups, and keeps paper-trade tracking local.
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-terminal-cyan/40 bg-terminal-cyan px-4 py-2 text-sm font-bold text-terminal-ink shadow-glow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Scan Now
          </button>
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

        {error ? (
          <div className="rounded-md border border-terminal-red/40 bg-terminal-red/10 p-4 text-sm text-terminal-red">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
            <p className="mt-2 text-terminal-muted">Check the Setup tab and confirm required Netlify environment variables are configured.</p>
          </div>
        ) : null}

        {activeTab === "Dashboard" ? (
          <section className="grid gap-4 lg:grid-cols-4">
            <Metric icon={<Clock3 />} label="Scheduled scans" value={scanTimes.join(" · ")} />
            <Metric icon={<Gauge />} label="Market regime" value={scan?.regime.label ?? "Run scan"} />
            <Metric icon={<BarChart3 />} label="Setups found" value={String(scan?.setups.length ?? 0)} />
            <Metric icon={<ShieldAlert />} label="Required setup" value={setup?.requiredMissing.length ? "Missing keys" : "Ready"} />

            <div className="rounded-md border border-terminal-line bg-terminal-panel p-4 lg:col-span-2">
              <h2 className="text-lg font-semibold text-white">Strongest setup</h2>
              {strongest ? <CompactSetup setup={strongest} /> : <EmptyState text="Run a scan to see the strongest research setup." />}
            </div>

            <div className="rounded-md border border-terminal-line bg-terminal-panel p-4 lg:col-span-2">
              <h2 className="text-lg font-semibold text-white">Highest risk setup</h2>
              {highestRisk ? <CompactSetup setup={highestRisk} /> : <EmptyState text="Risk warnings appear after the first scan." />}
            </div>

            <div className="rounded-md border border-terminal-line bg-terminal-panel p-4 lg:col-span-4">
              <h2 className="text-lg font-semibold text-white">Missing setup warnings</h2>
              <WarningList items={[...(scan?.warnings ?? []), ...(setup?.requiredMissing.map((key) => `${key} is missing.`) ?? [])]} />
            </div>
          </section>
        ) : null}

        {activeTab === "Scanner Report" ? (
          <section className="grid gap-4">
            <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Scanner report</h2>
                  <p className="text-sm text-terminal-muted">
                    {scan ? `Generated ${new Date(scan.generatedAt).toLocaleString()}` : "No scan has been run in this session."}
                  </p>
                </div>
                {scan ? <span className={badgeClass("blue")}>{scan.regime.label} · {scan.regime.confidence} confidence</span> : null}
              </div>
              {scan ? <p className="mt-3 text-sm text-terminal-muted">{scan.disclaimer}</p> : null}
            </div>

            {loading ? <LoadingState /> : null}
            {!loading && !scan ? <EmptyState text="Run a market scan to fetch real quotes and news." /> : null}
            {scan?.setups.map((setupReport) => (
              <SetupCard key={setupReport.ticker} setup={setupReport} onPaperTrade={addTrade} />
            ))}
            {scan?.setups.length === 0 && scan ? <EmptyState text="No eligible setups passed the v1 guardrails." /> : null}
          </section>
        ) : null}

        {activeTab === "Watchlist" ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {WATCHLIST.map((ticker) => (
              <div key={ticker} className="rounded-md border border-terminal-line bg-terminal-panel p-4">
                <div className="text-xl font-bold text-white">{ticker}</div>
                <p className="mt-2 text-sm text-terminal-muted">v1 scanner symbol · no options · no penny stocks under $2.</p>
              </div>
            ))}
          </section>
        ) : null}

        {activeTab === "Paper Trades" ? (
          <section className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Metric icon={<ClipboardCheck />} label="Total paper trades" value={String(stats.total)} />
              <Metric icon={<CheckCircle2 />} label="Win rate" value={`${stats.winRate}%`} />
              <Metric icon={<LineChart />} label="Open ideas" value={String(stats.open)} />
              <Metric icon={<XCircle />} label="Skipped" value={String(stats.skipped)} />
            </div>
            <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
              <h2 className="text-lg font-semibold text-white">Paper trade log</h2>
              <p className="mt-1 text-sm text-terminal-muted">Average gain/loss is a placeholder until manual P/L entry is added.</p>
              <div className="mt-4 grid gap-3">
                {paperTrades.length ? (
                  paperTrades.map((trade) => (
                    <div key={trade.id} className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="font-bold text-white">{trade.ticker}</span>
                          <span className="ml-2 text-sm text-terminal-muted">{new Date(trade.createdAt).toLocaleString()}</span>
                        </div>
                        <select
                          value={trade.status}
                          onChange={(event) => updateOutcome(trade.id, event.target.value as PaperTradeOutcome)}
                          className="rounded-md border border-terminal-line bg-terminal-panel px-3 py-2 text-sm text-white"
                        >
                          <option value="open">Open</option>
                          <option value="win">Win</option>
                          <option value="loss">Loss</option>
                          <option value="breakeven">Breakeven</option>
                          <option value="skipped">Skipped</option>
                        </select>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-terminal-muted sm:grid-cols-3">
                        <span>Entry: {trade.entryZone}</span>
                        <span>Stop: {trade.stopLoss}</span>
                        <span>Target: {trade.target}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState text="Approve a scanner setup as a paper trade to start the 30-day practice log." />
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "Education / Rules" ? <Rules /> : null}
        {activeTab === "Setup" ? <SetupPanel setup={setup} loading={setupLoading} onRefresh={checkSetup} /> : null}
      </div>
    </main>
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

function CompactSetup({ setup }: { setup: SetupReport }) {
  return (
    <div className="mt-3 grid gap-3 text-sm text-terminal-muted">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xl font-bold text-white">{setup.ticker}</span>
        <span className={badgeClass(scoreTone(setup.score))}>Score {setup.score}</span>
        <span className={badgeClass(riskTone(setup.riskLevel))}>{setup.riskLevel} risk</span>
      </div>
      <p>{setup.ai.catalyst}</p>
      <p>{setup.ai.whyToSkip}</p>
    </div>
  );
}

function SetupCard({ setup, onPaperTrade }: { setup: SetupReport; onPaperTrade: (setup: SetupReport, status: PaperTradeOutcome) => void }) {
  return (
    <article className="rounded-md border border-terminal-line bg-terminal-panel p-4 shadow-glow">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-bold text-white">{setup.ticker}</h3>
            <span className={badgeClass(scoreTone(setup.score))}>Score {setup.score}</span>
            <span className={badgeClass(riskTone(setup.riskLevel))}>{setup.riskLevel} risk</span>
            <span className={badgeClass(setup.ai.confidence === "high" ? "green" : setup.ai.confidence === "medium" ? "yellow" : "red")}>{setup.ai.confidence} confidence</span>
          </div>
          <p className="mt-2 text-sm text-terminal-muted">
            ${setup.quote.price.toFixed(2)} · {setup.quote.changePercent.toFixed(2)}% · {setup.regime.label}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onPaperTrade(setup, "open")} className="rounded-md bg-terminal-green px-3 py-2 text-sm font-bold text-terminal-ink">
            Paper Trade
          </button>
          <button onClick={() => onPaperTrade(setup, "skipped")} className="rounded-md border border-terminal-line px-3 py-2 text-sm text-terminal-muted">
            Skip
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {Object.entries(setup.breakdown).map(([key, value]) => (
          <div key={key} className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
            <div className="text-xs uppercase text-terminal-muted">{key}</div>
            <div className="mt-1 text-lg font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Info title="Catalyst" text={setup.ai.catalyst} />
        <Info title="Bull case" text={setup.ai.bullCase} />
        <Info title="Bear case" text={setup.ai.bearCase} />
        <Info title="Why to skip" text={setup.ai.whyToSkip} />
        <Info title="Entry zone" text={setup.ai.entryZone} />
        <Info title="Stop loss idea" text={setup.ai.stopLoss} />
        <Info title="Target idea" text={setup.ai.target} />
        <Info title="Risk/reward" text={setup.ai.riskReward} />
        <Info title="Invalidation" text={setup.ai.invalidation} />
        <div className="rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
          <h4 className="font-semibold text-white">Manual Robinhood checklist</h4>
          <ul className="mt-2 grid gap-2 text-sm text-terminal-muted">
            {["Manual review only", "Limit order only", "Max paper risk $2-$5", ...setup.ai.checkBeforeTrading].map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-terminal-green" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <WarningList items={setup.warnings} />
      {setup.news[0]?.url ? (
        <a href={setup.news[0].url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm text-terminal-cyan hover:text-white">
          Read catalyst source <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
    </article>
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

function WarningList({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="mt-3 text-sm text-terminal-muted">No warnings at this stage.</p>;
  }

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

function LoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-md border border-terminal-line bg-terminal-panel">
      <div className="flex items-center gap-3 text-terminal-cyan"><Loader2 className="h-5 w-5 animate-spin" /> Fetching quotes, news, regime, and AI report...</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-terminal-line bg-terminal-panel/50 p-6 text-center text-sm text-terminal-muted">
      {text}
    </div>
  );
}

function Rules() {
  const rules = [
    "Research only, not financial advice.",
    "No auto-trading, no Robinhood connection, no browser automation to place trades.",
    "Default account size is $100; max risk per paper idea is $2-$5.",
    "No options in v1 and no penny stocks under $2.",
    "No market orders. Limit orders only after manual review.",
    "Skip if there is no clear catalyst, low confidence, or a spread/liquidity warning.",
    "Paper trade for 30 days before risking real money."
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><BookOpen className="h-5 w-5 text-terminal-cyan" /> Rules</h2>
        <ul className="mt-4 grid gap-3 text-sm text-terminal-muted">
          {rules.map((rule) => (
            <li key={rule} className="flex gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-terminal-amber" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-md border border-terminal-line bg-terminal-panel p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Target className="h-5 w-5 text-terminal-green" /> Learning Loop</h2>
        <p className="mt-4 text-sm leading-6 text-terminal-muted">
          Each paper setup should be reviewed later as win, loss, or breakeven. The goal is to learn which catalysts, regimes, and risk levels behave well before any real-money decision.
        </p>
      </div>
    </section>
  );
}

function SetupPanel({ setup, loading, onRefresh }: { setup: SetupCheckResponse | null; loading: boolean; onRefresh: () => void }) {
  const rows = setup?.configured ? Object.entries(setup.configured) : [];

  return (
    <section className="rounded-md border border-terminal-line bg-terminal-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Environment setup</h2>
        <button onClick={onRefresh} className="rounded-md border border-terminal-line px-3 py-2 text-sm text-terminal-muted hover:text-white">Refresh</button>
      </div>
      {loading ? <LoadingState /> : null}
      {!loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between rounded-md border border-terminal-line bg-terminal-ink/60 p-3">
              <span className="text-sm text-terminal-muted">{key}</span>
              <span className={badgeClass(value ? "green" : key === "OPENAI_API_KEY" || key === "FINNHUB_API_KEY" ? "red" : "yellow")}>
                {value ? "Configured" : "Missing"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
