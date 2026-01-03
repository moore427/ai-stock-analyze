
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getGeminiAnalysis = async (stockData: any, instData: any): Promise<any> => {
  const recentHistory = stockData.history.slice(-10).map((h: any) => ({
    date: h.date,
    close: h.close,
    vol: h.Trading_Volume
  }));

  const prompt = `
    請分析以下台股數據並撰寫專業分析報告：
    股票代號/名稱: ${stockData.id}
    當前價格: ${stockData.price}
    今日漲跌: ${stockData.change} (${stockData.pct}%)
    本益比 (PER): ${stockData.per || 'N/A'}, 股淨比 (PBR): ${stockData.pbr || 'N/A'}
    法人動向 (最後交易日): 外資: ${instData.foreign}, 投信: ${instData.trust}, 自營商: ${instData.dealer}
    最近 10 日歷史走勢: ${JSON.stringify(recentHistory)}

    任務要求：
    1. 提供技術面總結（使用台灣繁體中文專業財經用語）。
    2. 基於本益比/股淨比評估財務健康度。
    3. 分析法人籌碼情緒。
    4. 預測未來 3 日價格走勢（附帶邏輯說明）。
    5. 給出一個 0-100 的 AI 綜合評分。
    6. 根據籌碼特性，建議 3 家可能正在佈局的活躍主力券商名稱。
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            financial: { type: Type.STRING },
            institutional: { type: Type.STRING },
            prediction: {
              type: Type.OBJECT,
              properties: {
                days: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      date: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                      low: { type: Type.NUMBER },
                      high: { type: Type.NUMBER }
                    }
                  }
                }
              }
            },
            score: { type: Type.NUMBER },
            brokerages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  type: { type: Type.STRING }
                }
              }
            }
          },
          required: ["summary", "financial", "institutional", "prediction", "score", "brokerages"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};
