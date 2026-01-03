
const FINMIND_API_URL = "https://api.finmindtrade.com/api/v4/data";

const getFormattedDate = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
};

// 用於存儲股票清單的簡單緩存
let stockListCache: any[] | null = null;

/**
 * 獲取所有股票清單（帶緩存）
 */
const getStockList = async () => {
  if (stockListCache) return stockListCache;
  try {
    const res = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockInfo`);
    const json = await res.json();
    if (json.data) {
      stockListCache = json.data;
      return stockListCache;
    }
  } catch (e) {
    console.error("無法獲取股票清單:", e);
  }
  return [];
};

/**
 * 將輸入的名稱或代號解析為標準代號
 */
export const resolveStockId = async (query: string): Promise<string | null> => {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 如果已經是純數字，直接回傳
  if (/^\d+$/.test(trimmed)) return trimmed;

  // 否則，從清單中找尋名稱匹配的代號
  const list = await getStockList();
  const match = list.find(s => s.stock_name === trimmed || s.stock_id === trimmed);
  
  if (match) return match.stock_id;

  // 嘗試模糊匹配（如輸入"台積"也能找到"台積電"）
  const fuzzyMatch = list.find(s => s.stock_name.includes(trimmed));
  return fuzzyMatch ? fuzzyMatch.stock_id : null;
};

/**
 * 獲取股票中文正式名稱
 */
export const fetchStockName = async (stockId: string): Promise<string> => {
  const list = await getStockList();
  const match = list.find(s => s.stock_id === stockId);
  return match ? match.stock_name : stockId;
};

export const fetchMarketIndex = async () => {
  const startDate = getFormattedDate(10);
  try {
    const res = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockPrice&data_id=TAIEX&start_date=${startDate}`);
    if (!res.ok) throw new Error('Network Error');
    const json = await res.json();
    if (json.data && json.data.length > 0) {
      const latest = json.data[json.data.length - 1];
      const prev = json.data[json.data.length - 2] || latest;
      const change = latest.close - prev.close;
      const pct = (change / prev.close) * 100;
      const volume = (latest.Trading_Volume / 100000000).toFixed(0); 

      return {
        price: latest.close,
        change: parseFloat(change.toFixed(2)),
        pct: parseFloat(pct.toFixed(2)),
        volume: volume,
        date: latest.date,
        status: 'success'
      };
    }
    return { status: 'nodata' };
  } catch (error) {
    console.error("TAIEX Fetch Error:", error);
    return { status: 'error' };
  }
};

export const fetchInstitutionalInvestors = async () => {
  const startDate = getFormattedDate(10);
  try {
    const res = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockTotalInstitutionalInvestors&start_date=${startDate}`);
    if (!res.ok) throw new Error('Network Error');
    const json = await res.json();
    if (json.data && json.data.length > 0) {
      const data = json.data;
      const lastDate = data[data.length - 1].date;
      const dailyData = data.filter((d: any) => d.date === lastDate);
      let totalNet = 0;
      dailyData.forEach((item: any) => { totalNet += (item.buy - item.sell); });
      return {
        total: parseFloat((totalNet / 100000000).toFixed(2)),
        date: lastDate,
        status: totalNet >= 0 ? 'Buy' : 'Sell',
        apiStatus: 'success'
      };
    }
    return { apiStatus: 'nodata' };
  } catch (error) {
    return { apiStatus: 'error' };
  }
};

export const fetchStockInstitutionalData = async (stockId: string) => {
  const startDate = getFormattedDate(10);
  try {
    const res = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockInstitutionalInvestors&data_id=${stockId}&start_date=${startDate}`);
    const json = await res.json();
    if (json.data && json.data.length > 0) {
      const data = json.data;
      const lastDate = data[data.length - 1].date;
      const dailyData = data.filter((d: any) => d.date === lastDate);
      let foreign = 0, trust = 0, dealer = 0;
      dailyData.forEach((item: any) => {
        const net = item.buy - item.sell;
        if (item.name === 'Foreign_Investor') foreign += net;
        else if (item.name === 'Investment_Trust') trust += net;
        else if (item.name === 'Dealer') dealer += net;
      });
      return { date: lastDate, foreign, trust, dealer, total: foreign + trust + dealer, status: 'success' };
    }
    return { status: 'nodata' };
  } catch (error) {
    return { status: 'error' };
  }
};

export const fetchStockData = async (stockId: string) => {
  const startDate = getFormattedDate(120);
  try {
    const [priceRes, name] = await Promise.all([
      fetch(`${FINMIND_API_URL}?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}`),
      fetchStockName(stockId)
    ]);
    
    const priceJson = await priceRes.json();
    if (!priceJson.data || priceJson.data.length === 0) return { error: true, id: stockId };

    const perRes = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockPER&data_id=${stockId}&start_date=${startDate}`);
    const perJson = await perRes.json();
    const latestPER = perJson.data?.length > 0 ? perJson.data[perJson.data.length - 1] : null;

    const historyData = priceJson.data;
    const latest = historyData[historyData.length - 1];
    const prev = historyData[historyData.length - 2] || latest;

    return {
      id: stockId,
      name: name,
      price: latest.close,
      change: parseFloat((latest.close - prev.close).toFixed(2)),
      pct: parseFloat(((latest.close - prev.close) / prev.close * 100).toFixed(2)),
      volume: latest.Trading_Volume,
      per: latestPER?.PER,
      pbr: latestPER?.PBR,
      history: historyData,
      lastUpdate: latest.date,
      status: 'success'
    };
  } catch (error) {
    return { error: true, id: stockId };
  }
};
