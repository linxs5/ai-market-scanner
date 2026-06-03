import type { Confidence } from "@/lib/shared/types";

const SEC_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_BASE_URL = "https://data.sec.gov/submissions";
const SEC_USER_AGENT = "Market Intelligence AI research app contact: research@example.com";

type SecTickerRow = {
  cik_str?: number;
  ticker?: string;
  title?: string;
};

type SecCompanyTickersResponse = Record<string, SecTickerRow>;

type SecSubmissionsResponse = {
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      items?: string[];
    };
  };
};

export type SecEightKSignal = {
  ticker: string;
  cik: string | null;
  companyName: string | null;
  mappingConfidence: Confidence;
  hasEightKToday: boolean;
  badge: "SEC 8-K TODAY" | null;
  explanation: string;
  filings: Array<{
    form: string;
    filingDate: string;
    accessionNumber: string;
    primaryDocument: string;
    items: string;
  }>;
  warnings: string[];
};

let tickerMapCache: Map<string, { cik: string; companyName: string | null }> | null = null;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cikToSubmissionId(cik: string) {
  return `CIK${cik.padStart(10, "0")}`;
}

async function secFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": SEC_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
}

async function getTickerMap() {
  if (tickerMapCache) return tickerMapCache;

  const raw = await secFetch<SecCompanyTickersResponse>(SEC_COMPANY_TICKERS_URL);
  tickerMapCache = new Map(
    Object.values(raw)
      .filter((row) => row.ticker && Number.isFinite(row.cik_str))
      .map((row) => [
        String(row.ticker).toUpperCase(),
        {
          cik: String(row.cik_str),
          companyName: row.title ?? null
        }
      ])
  );
  return tickerMapCache;
}

function uncertainSignal(ticker: string, warning: string): SecEightKSignal {
  return {
    ticker,
    cik: null,
    companyName: null,
    mappingConfidence: "low",
    hasEightKToday: false,
    badge: null,
    explanation:
      "SEC 8-K check could not confidently map this ticker to an SEC company record, so do not treat missing filings as a clean signal.",
    filings: [],
    warnings: [warning]
  };
}

export async function fetchSecEightKSignals(tickers: string[]): Promise<Record<string, SecEightKSignal>> {
  const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))];
  const output: Record<string, SecEightKSignal> = {};

  let tickerMap: Map<string, { cik: string; companyName: string | null }>;
  try {
    tickerMap = await getTickerMap();
  } catch (error) {
    const warning = error instanceof Error ? error.message : "SEC ticker map request failed.";
    uniqueTickers.forEach((ticker) => {
      output[ticker] = uncertainSignal(ticker, warning);
    });
    return output;
  }

  await Promise.all(
    uniqueTickers.map(async (ticker) => {
      const mapped = tickerMap.get(ticker);
      if (!mapped) {
        output[ticker] = uncertainSignal(ticker, `${ticker}: SEC ticker mapping not found.`);
        return;
      }

      try {
        const submissionId = cikToSubmissionId(mapped.cik);
        const raw = await secFetch<SecSubmissionsResponse>(`${SEC_SUBMISSIONS_BASE_URL}/${submissionId}.json`);
        const recent = raw.filings?.recent;
        const filingDate = recent?.filingDate ?? [];
        const form = recent?.form ?? [];
        const accessionNumber = recent?.accessionNumber ?? [];
        const primaryDocument = recent?.primaryDocument ?? [];
        const items = recent?.items ?? [];
        const today = todayIso();
        const filings = form
          .map((filingForm, index) => ({
            form: filingForm,
            filingDate: filingDate[index] ?? "",
            accessionNumber: accessionNumber[index] ?? "",
            primaryDocument: primaryDocument[index] ?? "",
            items: items[index] ?? ""
          }))
          .filter((filing) => filing.filingDate === today && /^8-K(?:\/A)?$/i.test(filing.form));

        output[ticker] = {
          ticker,
          cik: mapped.cik,
          companyName: mapped.companyName,
          mappingConfidence: "high",
          hasEightKToday: filings.length > 0,
          badge: filings.length > 0 ? "SEC 8-K TODAY" : null,
          explanation:
            filings.length > 0
              ? "An 8-K was filed today. That can mean the company reported a material event, so read the filing before trusting the headline or price move."
              : "No same-day 8-K was found in SEC company submissions during this scan.",
          filings,
          warnings: []
        };
      } catch (error) {
        output[ticker] = uncertainSignal(ticker, error instanceof Error ? error.message : `${ticker}: SEC submissions request failed.`);
      }
    })
  );

  return output;
}
