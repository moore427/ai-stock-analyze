
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, TrendingUp, BarChart2, ArrowLeft, Cpu, Activity, TrendingDown, AlertCircle, 
  Globe, Loader, PieChart, History, Briefcase, Users, RefreshCw, Wifi, WifiOff 
} from 'lucide-react';
import { 
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  fetchMarketIndex, fetchInstitutionalInvestors, fetchStockData, fetchStockInstitutionalData, resolveStockId 
} from './services/finmind';
import { getGeminiAnalysis } from './services/gemini';
import { MarketIndex, FundFlow, StockInfo, AIAnalysis } from './types';

// --- Static Helpers ---
const DEFAULT_HOT_IDS = ['2330', '2317', '2454', '2603', '2881', '0050'];

// --- Sub-components ---
const GaugeChart = ({ score }: { score: number }) => {
  const normalizedScore = Math.max(0, Math.min(score, 100));
  let color = "text-yellow-500";
  let borderColor = "border-yellow-500";
  if (score >= 80) { color = "text-red-500"; borderColor = "border-red-500"; }
  else if (score < 40) { color = "text-green-500"; borderColor = "border-green-500"; }

  return (
    <div className="relative flex flex-col items-center justify-center py-4">
      <div className="relative w-48 h-28 overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full border-[14px] border-slate-800 box-border"></div>
        <div 
          className={`absolute top-0 left-0 w-48 h-48 rounded-full border-[14px] ${borderColor} box-border transition-all duration-1000 ease-out`} 
          style={{ 
            clipPath: 'polygon(0 50%, 100% 50%, 100% 0, 0 0)', 
            transform: `rotate(${normalizedScore * 1.8 - 180}deg)`, 
            opacity: 0.8 
          }}
        ></div>
      </div>
      <div className="absolute top-16 text-center">
        <span className={`text-5xl font-extrabold ${color}`}>{score}</span>
        <div className="text-xs text-slate-500 font-medium tracking-widest mt-1">AI 綜合評分</div>
      </div>
    </div>
  );
};

const CustomCandle = (props: any) => {
  const { x, y, width, height, payload, yAxis } = props;
  if (!yAxis || !yAxis.scale || !payload) return null;
  const isUp = payload.close >= payload.open;
  const color = isUp ? '#ef4444' : '#22c55e';
  const yHigh = yAxis.scale(payload.max || payload.high || payload.price);
  const yLow = yAxis.scale(payload.min || payload.low || payload.price);
  const yOpen = yAxis.scale(payload.open);
  const yClose = yAxis.scale(payload.close);
  const candleHeight = Math.max(Math.abs(yOpen - yClose), 2);
  const candleY = Math.min(yOpen, yClose);
  const centerX = x + width / 2;

  return (
    <g>
      <line x1={centerX} y1={yHigh} x2={centerX} y2={yLow} stroke={color} strokeWidth={1} />
      <rect x={x + 2} y={candleY} width={Math.max(width - 4, 1)} height={candleHeight} fill={color} />
    </g>
  );
};

export default function App() {
  const [view, setView] = useState<'home' | 'detail' | 'loading'>('home');
  const [marketIndex, setMarketIndex] = useState<MarketIndex | null>(null);
  const [fundFlow, setFundFlow] = useState<FundFlow | null>(null);
  const [hotStocks, setHotStocks] = useState<StockInfo[]>([]);
  const [searchHistory, setSearchHistory] = useState<StockInfo[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockInfo | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error' | 'loading'>('loading');

  const refreshMarket = useCallback(async () => {
    setIsLoading(true);
    setConnectionStatus('loading');
    try {
      const [idx, flow] = await Promise.all([fetchMarketIndex(), fetchInstitutionalInvestors()]);
      setMarketIndex(idx as MarketIndex);
      setFundFlow(flow as FundFlow);

      const stockPromises = DEFAULT_HOT_IDS.map(id => fetchStockData(id));
      const stocks = await Promise.all(stockPromises);
      setHotStocks(stocks.filter(s => !s.error) as StockInfo[]);
      setConnectionStatus('connected');
    } catch (e) {
      setConnectionStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMarket();
  }, [refreshMarket]);

  const handleSearch = async (query: string) => {
    if (!query) return;
    setIsLoading(true);
    setSearchError('');
    
    try {
      // 1. 解析輸入（可能是代號或中文）
      const stockId = await resolveStockId(query);
      
      if (!stockId) {
        setSearchError('找不到該股票名稱或代號，請重新輸入');
        setIsLoading(false);
        return;
      }

      setView('loading');
      
      // 2. 獲取詳細數據
      const data = await fetchStockData(stockId);
      if (data.error) {
        setSearchError('數據抓取失敗，請確認代號是否正確');
        setView('home');
        return;
      }

      const inst = await fetchStockInstitutionalData(stockId);
      const report = await getGeminiAnalysis(data, inst);
      
      const fullData = { 
        ...data, 
        score: report.score,
        trend: data.pct > 0 ? 'bullish' : 'bearish'
      } as StockInfo;

      setSelectedStock(fullData);
      setAnalysis(report);
      setSearchHistory(prev => [fullData, ...prev.filter(s => s.id !== stockId)].slice(0, 3));
      setView('detail');
    } catch (e) {
      setSearchError('AI 分析發生錯誤，請稍後再試');
      setView('home');
    } finally {
      setIsLoading(false);
    }
  };

  const chartData = useMemo(() => {
    if (!selectedStock) return [];
    return selectedStock.history.slice(-40).map(d => ({
      date: d.date.slice(5),
      open: d.open,
      close: d.close,
      max: d.max,
      min: d.min,
      volume: d.Trading_Volume
    }));
  }, [selectedStock]);

  if (view === 'loading') {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center z-50">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <Activity className="absolute inset-0 m-auto w-8 h-8 text-blue-400 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">AI 正在深度掃描市場...</h2>
        <p className="text-slate-400 max-w-md">正在根據您輸入的內容檢索數據並產出專業分析報告。</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* HEADER */}
      <nav className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view === 'detail' && (
            <button onClick={() => setView('home')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight hidden sm:block">TW Stock AI Pro 台股戰情室</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${
            connectionStatus === 'connected' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {connectionStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {connectionStatus === 'connected' ? '數據連線正常' : '連線異常'}
          </div>
          <button onClick={refreshMarket} className="p-2 text-slate-400 hover:text-white transition" title="重新整理">
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </nav>

      {/* HOME VIEW */}
      {view === 'home' && (
        <main className="max-w-6xl mx-auto px-4 py-12 animate-fade-in-up">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-black text-white mb-4 tracking-tighter">台股 AI 戰情室</h1>
            <p className="text-slate-400 text-lg">整合 FinMind 即時數據與 Google Gemini 深度推理</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* TAIEX Card */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/5 rounded-full blur-[80px] -mr-24 -mt-24 transition-all group-hover:bg-blue-600/10"></div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" /> 加權指數 (TAIEX)
                  </div>
                  {marketIndex ? (
                    <>
                      <div className="text-5xl font-black text-white tracking-tighter">
                        {marketIndex.price.toLocaleString()}
                      </div>
                      <div className={`mt-3 flex items-center gap-2 font-bold ${marketIndex.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {marketIndex.change >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        {marketIndex.change >= 0 ? '+' : ''}{marketIndex.change} ({marketIndex.pct}%)
                      </div>
                    </>
                  ) : <div className="h-16 flex items-center text-slate-600">數據載入中...</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">成交量</div>
                  <div className="text-2xl font-mono font-bold text-slate-300">{marketIndex?.volume} 億</div>
                </div>
              </div>
            </div>

            {/* Fund Flow Card */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-600/5 rounded-full blur-[80px] -mr-24 -mt-24 transition-all group-hover:bg-purple-600/10"></div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-purple-500" /> 法人買賣超
                  </div>
                  {fundFlow ? (
                    <>
                      <div className={`text-5xl font-black tracking-tighter ${fundFlow.total >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {fundFlow.total > 0 ? '+' : ''}{fundFlow.total} <span className="text-2xl text-slate-500">億</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-slate-400 font-medium">
                        <PieChart className="w-4 h-4" /> 基準日期: {fundFlow.date}
                      </div>
                    </>
                  ) : <div className="h-16 flex items-center text-slate-600">數據載入中...</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">動向判定</div>
                  <div className={`text-2xl font-bold ${fundFlow?.total && fundFlow.total > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {fundFlow?.total && fundFlow.total > 0 ? '偏多' : '偏空'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto mb-16 relative">
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all shadow-2xl">
              <Search className="w-6 h-6 text-slate-500 ml-4 mr-3" />
              <input 
                type="text" 
                placeholder="輸入名稱或代號 (如: 台積電, 2330)" 
                className="bg-transparent border-none outline-none w-full text-lg py-2 placeholder-slate-600 text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
              />
              <button 
                onClick={() => handleSearch(searchQuery)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-xl transition shadow-lg shadow-blue-500/20"
              >
                AI 深度分析
              </button>
            </div>
            {searchError && <p className="absolute -bottom-8 left-0 text-red-400 text-sm font-bold flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {searchError}</p>}
          </div>

          {/* History */}
          {searchHistory.length > 0 && (
            <div className="mb-12">
              <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-600" /> 最近查詢紀錄
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchHistory.map(stock => (
                  <button key={stock.id} onClick={() => handleSearch(stock.id)} className="bg-slate-900/40 border border-slate-800 hover:border-blue-500/30 p-5 rounded-2xl flex items-center justify-between transition-all group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        {stock.name ? stock.name.charAt(0) : stock.id.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-white group-hover:text-blue-400 transition-colors truncate max-w-[120px]">{stock.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{stock.id}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-bold font-mono text-lg ${stock.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>{stock.price}</div>
                      <div className={`text-xs font-bold ${stock.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>{stock.pct}%</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular Stocks */}
          <div>
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> 市場熱門個股
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {hotStocks.map(stock => (
                <button key={stock.id} onClick={() => handleSearch(stock.id)} className="bg-slate-900/40 border border-slate-800 hover:border-blue-500/30 p-5 rounded-2xl flex items-center justify-between transition-all group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-12 h-12 bg-slate-800 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      {stock.name ? stock.name.charAt(0) : stock.id.charAt(0)}
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-white group-hover:text-blue-400 transition-colors truncate max-w-[120px]">{stock.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{stock.id}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-bold font-mono text-lg ${stock.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>{stock.price}</div>
                    <div className={`text-xs font-bold ${stock.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>{stock.pct}%</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* DETAIL VIEW */}
      {view === 'detail' && selectedStock && analysis && (
        <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Header Stats */}
          <div className="lg:col-span-12 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-6 shadow-xl">
            <div className="flex items-center gap-6">
              <div>
                <h2 className="text-3xl font-black text-white">{selectedStock.name}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-mono text-xl">{selectedStock.id}</span>
                  <span className="text-slate-600 text-sm font-medium">| 更新：{selectedStock.lastUpdate}</span>
                </div>
              </div>
              <div className="h-12 w-[1px] bg-slate-800 hidden sm:block"></div>
              <div>
                <div className={`text-4xl font-black font-mono tracking-tighter ${selectedStock.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>{selectedStock.price}</div>
                <div className={`font-bold ${selectedStock.change >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {selectedStock.change > 0 ? '+' : ''}{selectedStock.change} ({selectedStock.pct}%)
                </div>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 min-w-[100px]">
                <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">本益比 PER</div>
                <div className="text-lg font-bold text-white font-mono">{selectedStock.per || '--'}</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 min-w-[100px]">
                <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">成交量 Vol</div>
                <div className="text-lg font-bold text-white font-mono">{Math.round(selectedStock.volume / 1000).toLocaleString()}K</div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 min-w-[100px]">
                <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">股淨比 PBR</div>
                <div className="text-lg font-bold text-white font-mono">{selectedStock.pbr || '--'}</div>
              </div>
            </div>
          </div>

          {/* Left: Charts and Analysis */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-blue-500" /> 技術走勢與 AI 預測軌跡
                </h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span> 收盤價</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 opacity-30"></span> 均線參考</span>
                </div>
              </div>

              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis domain={['auto', 'auto']} stroke="#475569" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} orientation="right" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }} />
                    <Bar dataKey="close" shape={<CustomCandle />} />
                    <Line type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={2} dot={false} opacity={0.3} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-800">
                <Cpu className="w-6 h-6 text-purple-500" />
                <h3 className="text-xl font-bold text-white">Gemini 深度分析報告</h3>
              </div>

              <div className="space-y-8">
                <section>
                  <h4 className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> 技術與籌碼面分析
                  </h4>
                  <p className="text-slate-300 leading-relaxed text-sm">{analysis.summary}</p>
                </section>
                <section>
                  <h4 className="text-green-400 font-bold mb-3 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div> 基本面價值評估
                  </h4>
                  <p className="text-slate-300 leading-relaxed text-sm">{analysis.financial}</p>
                </section>
                <section>
                  <h4 className="text-yellow-400 font-bold mb-3 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div> 市場信心與資金動能
                  </h4>
                  <p className="text-slate-300 leading-relaxed text-sm">{analysis.institutional}</p>
                </section>
              </div>
            </div>
          </div>

          {/* Right: Scores and Predictions */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-xl text-center">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">AI 綜合評分</h3>
              <GaugeChart score={analysis.score} />
              <div className="mt-8 p-4 bg-slate-950 rounded-2xl border border-slate-800 text-sm">
                <div className="text-slate-500 font-bold mb-2">建議投資方向</div>
                <div className={`text-xl font-black ${analysis.score >= 70 ? 'text-red-400' : analysis.score <= 40 ? 'text-green-400' : 'text-slate-400'}`}>
                  {analysis.score >= 80 ? '強勢買進' : analysis.score >= 60 ? '偏多持有' : analysis.score >= 40 ? '區間震盪' : '保守觀望'}
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" /> AI 短線價格預測
              </h3>
              <div className="space-y-4">
                {analysis.prediction.days.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800 hover:border-blue-500/30 transition-colors">
                    <div className="text-sm font-bold text-slate-400">{p.date}</div>
                    <div className="text-right">
                      <div className="text-lg font-black text-white font-mono">{p.price.toFixed(2)}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">預估區間: {p.low.toFixed(1)} - {p.high.toFixed(1)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-500" /> 推薦關注主力券商
              </h3>
              <div className="space-y-3">
                {analysis.brokerages.map((b, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="text-sm text-slate-300 font-bold">{b.name}</div>
                    <div className={`text-xs font-black px-3 py-1 rounded-full ${b.type === '買超' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                      {b.type} {b.amount}張
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-blue-900/10 border border-blue-500/20 rounded-3xl text-xs text-blue-300 leading-relaxed italic">
              <span className="font-bold not-italic">免責聲明：</span> 以上內容均為 Gemini AI 模型基於歷史數據產出之分析報告，僅供參考，不構成任何形式之具體投資建議。投資有風險，入市需謹慎並自行評估。
            </div>
          </div>
        </main>
      )}

      {/* FOOTER */}
      <footer className="border-t border-slate-800 py-12 px-4 text-center mt-auto">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4 opacity-50">
            <Activity className="w-5 h-5" />
            <span className="font-bold text-lg">TW Stock AI Pro 台股戰情室</span>
          </div>
          <p className="text-slate-500 text-sm">技術支援：Google Gemini 3 與 FinMind 開放數據 API。即時市場數據可能因來源端而有延遲。</p>
          <p className="text-slate-600 text-xs mt-4">© 2024 AI Stock Lab. 版權所有。</p>
        </div>
      </footer>
    </div>
  );
}
