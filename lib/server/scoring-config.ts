export const DEFAULT_SCORING_CONFIG = {
  stock: {
    catalystWords: [
      "earnings",
      "guidance",
      "upgrade",
      "downgrade",
      "deal",
      "contract",
      "launch",
      "approval",
      "partnership",
      "forecast",
      "revenue",
      "profit",
      "acquisition",
      "sec",
      "investigation"
    ],
    // A 5% daily move is treated as a full momentum signal. Bigger moves do not keep adding points forever.
    momentumFullMovePercent: 5,
    // A 4% high-to-low day is treated as strong activity when real volume is unavailable from the quote feed.
    volatilityFullDayRangePercent: 4,
    // Each recent headline adds catalyst credit because fresh news gives the price move a reason to exist.
    catalystPointsPerHeadline: 14,
    // Strong catalyst words add extra credit because earnings, deals, approvals, or SEC/news events can change the thesis quickly.
    catalystKeywordBonus: 30,
    // Moves above this level may already be chased by late buyers, so the risk/reward score is reduced.
    moderateExtensionMovePercent: 5,
    // Very large same-day moves are more likely to reverse or have bad fills, so the penalty is larger.
    severeExtensionMovePercent: 8,
    // Stocks below $2 are treated as too risky for this beginner research workflow.
    pennyStockPrice: 2,
    // A normal setup starts near 80 risk/reward points before extension, penny-stock, and range adjustments.
    baseRiskReward: 80,
    // A modest day range can improve risk/reward because there may be enough movement to define a paper setup.
    maxDayRangeRiskRewardBonus: 15,
    // Bigger intraday ranges trigger caution because spreads and slippage can hurt small accounts.
    wideRangeWarningPercent: 8,
    // Very large price moves trigger extra beginner caution even if the headline looks exciting.
    extremeMoveWarningPercent: 10,
    // Below this score, the setup is usually too weak to be more than a watch item.
    weakSetupScore: 55,
    weights: {
      // Momentum asks: is price actually moving enough to deserve attention?
      momentum: 0.3,
      // Volatility asks: is there enough intraday action to research, without assuming volume data exists?
      volatility: 0.25,
      // Catalyst asks: is there a fresh reason for the move beyond random noise?
      catalyst: 0.25,
      // Risk/reward asks: is the setup still reasonable for a small paper account?
      riskReward: 0.2
    }
  },
  polymarket: {
    catalystWords: [
      "election",
      "fed",
      "inflation",
      "cpi",
      "earnings",
      "ipo",
      "bitcoin",
      "crypto",
      "court",
      "war",
      "approval",
      "deadline",
      "rate",
      "tariff",
      "ai",
      "nvidia"
    ],
    // Liquidity matters, but it is capped so a huge sports market does not win by size alone.
    liquidityLogMultiplier: 16,
    // Recent odds movement gets attention because it can reveal new information entering the market.
    oneDayMoveMultiplier: 260,
    // One-week odds movement matters less than today because older moves may already be fully priced in.
    oneWeekMoveMultiplier: 100,
    // Intraday price-history movement is another freshness check when the CLOB endpoint returns it.
    priceHistoryMoveMultiplier: 320,
    // Near-50/50 markets get a small boost because both sides may still have researchable upside.
    competitiveOddsWeight: 0.25,
    // Each catalyst keyword adds attention because topics like Fed, CPI, elections, and crypto can move fast.
    catalystKeywordPoints: 12,
    // 24h volume adds catalyst strength only up to a cap so raw volume does not dominate.
    catalystVolumeDivisor: 10_000,
    catalystVolumeCap: 35,
    // A meaningful same-day odds move can be a fresh catalyst signal, but it is capped for safety.
    catalystMoveMultiplier: 250,
    catalystMoveCap: 30,
    // Markets resolving within two weeks are easier to research than far-off futures.
    nearResolutionDays: 14,
    // Futures longer than 60 days need a fresh catalyst or they should be deprioritized.
    longDatedDays: 60,
    // Sports need both liquidity and fresh/near-term evidence before ranking well.
    highLiquidityMinimum: 25_000,
    highVolume24hMinimum: 2_500,
    // Wider spreads mean the displayed odds may not be the price a user can actually paper-track.
    clearEdgeMaxSpread: 0.03,
    // Below these levels, a market may be hard to enter or exit cleanly even on paper.
    thinLiquidityMinimum: 1_000,
    thinVolume24hMinimum: 100,
    // A spread over 4 cents is a warning for beginners.
    wideSpreadThreshold: 0.04,
    weights: {
      // Liquidity/volume asks: is this market active enough to inspect?
      liquidityVolume: 0.25,
      // Odds momentum asks: are probabilities moving today?
      oddsMomentum: 0.2,
      // Catalyst strength asks: is there a real event or news reason behind the move?
      catalystStrength: 0.2,
      // Resolution clarity asks: are the rules clear enough to avoid wording traps?
      resolutionClarity: 0.15,
      // Time attractiveness asks: is resolution soon enough to research practically?
      timeAttractiveness: 0.1,
      // Crowd signal asks: is there broad participation without blindly copying traders?
      crowdSignal: 0.1
    },
    categoryWeights: {
      politics: 14,
      macroEconomics: 14,
      crypto: 14,
      financialMarkets: 14,
      majorCurrentNews: 10,
      general: -4,
      sportsQualified: -2,
      sportsUnqualified: -18,
      sportsLongDated: -28
    },
    // Category quality affects raw score lightly so attention quality matters without hiding bad mechanics.
    rawScoreCategoryMultiplier: 0.45,
    // Fresh catalyst bonus lifts markets with current news; missing freshness lowers attention priority.
    freshCatalystAttentionBonus: 8,
    staleCatalystAttentionPenalty: -5,
    // Near resolution is useful because the user can monitor a concrete event instead of a far-off story.
    nearResolutionAttentionBonus: 6,
    // Unqualified sports futures are pushed down again at the attention-priority layer.
    sportsAttentionPenalty: -18
  }
} as const;
