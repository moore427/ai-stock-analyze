
export interface StockInfo {
  id: string;
  name: string;
  price: number;
  change: number;
  pct: number;
  volume: number;
  per?: number;
  pbr?: number;
  history: any[];
  lastUpdate: string;
  score?: number;
  trend?: 'bullish' | 'bearish' | 'neutral';
  error?: boolean;
}

export interface InstitutionalData {
  date: string;
  foreign: number;
  trust: number;
  dealer: number;
  total: number;
  status: string;
}

export interface AIAnalysis {
  summary: string;
  financial: string;
  institutional: string;
  prediction: {
    days: { date: string; price: number; low: number; high: number }[];
  };
  score: number;
  brokerages: { name: string; amount: number; type: '買超' | '賣超' }[];
}

export interface MarketIndex {
  price: number;
  change: number;
  pct: number;
  volume: string;
  date: string;
  status: string;
}

export interface FundFlow {
  total: number;
  date: string;
  status: string;
  apiStatus: string;
}
