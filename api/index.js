const express = require('express');
const axios = require('axios');
const app = express();

// Alpha Vantage API 配置
const ALPHA_VANTAGE_API_KEY = 'YOUR_ALPHA_VANTAGE_API_KEY'; // 替换为您的 API 密钥
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// 缓存来自 Alpha Vantage 的数据
let dataCache = {};

// 改进的符号映射
const symbolMapping = {
  'XAU/USD': 'XAU',       // 黄金/美元 -> Alpha Vantage 为 XAU
  'EUR/USD': 'EUR',       // 欧元/美元 -> Alpha Vantage 为 EUR
  'USD/JPY': 'JPY',       // 美元/日元 -> Alpha Vantage 为 JPY
  'GBP/USD': 'GBP',       // 英镑/美元 -> Alpha Vantage 为 GBP
  'BTC/USD': 'BTC',       // 比特币/美元 -> Alpha Vantage 为 BTC
  'ETH/USD': 'ETH',       // 以太坊/美元 -> Alpha Vantage 为 ETH
  // 新增更多常用对，使用 USDT 替换 USD
  'LTC/USD': 'LTC',       // 莱特币/美元 -> Alpha Vantage 为 LTC
  'XRP/USD': 'XRP',       // 瑞波币/美元 -> Alpha Vantage 为 XRP
  'DOGE/USD': 'DOGE',     // 狗狗币/美元 -> Alpha Vantage 为 DOGE
  'ADA/USD': 'ADA',       // 艾达币/美元 -> Alpha Vantage 为 ADA
  'SOL/USD': 'SOL',       // 索拉纳/美元 -> Alpha Vantage 为 SOL
  'DOT/USD': 'DOT',       // 波卡/美元 -> Alpha Vantage 为 DOT
  'SHIB/USD': 'SHIB',     // 柴犬币/美元 -> Alpha Vantage 为 SHIB
  'MATIC/USD': 'MATIC',   // Polygon/美元 -> Alpha Vantage 为 MATIC
  // 如果需要支持更多以 USDT 为基础货币的符号，可以在此添加
  'BTC/USDT': 'BTC',      // 比特币/USDT -> Alpha Vantage 为 BTC
  'ETH/USDT': 'ETH',      // 以太坊/USDT -> Alpha Vantage 为 ETH
  'LTC/USDT': 'LTC',      // 莱特币/USDT -> Alpha Vantage 为 LTC
  'XRP/USDT': 'XRP',      // 瑞波币/USDT -> Alpha Vantage 为 XRP
  'DOGE/USDT': 'DOGE',    // 狗狗币/USDT -> Alpha Vantage 为 DOGE
  'ADA/USDT': 'ADA',      // 艾达币/USDT -> Alpha Vantage 为 ADA
  'SOL/USDT': 'SOL',      // 索拉纳/USDT -> Alpha Vantage 为 SOL
  'DOT/USDT': 'DOT',      // 波卡/USDT -> Alpha Vantage 为 DOT
  'SHIB/USDT': 'SHIB',    // 柴犬币/USDT -> Alpha Vantage 为 SHIB
  'MATIC/USDT': 'MATIC'   // Polygon/USDT -> Alpha Vantage 为 MATIC
};

// 周期映射
const periodMapping = {
  '1': '1min',
  '5': '5min',
  '15': '15min',
  '30': '30min',
  '60': '1hour',
  '240': '4hour',
  '1440': 'daily'
};

// 获取 Alpha Vantage 历史 K 线数据
async function getAlphaVantageKlines(symbol, interval, outputSize = 'compact') {
  try {
    // 处理符号映射
    const avSymbol = symbolMapping[symbol] || symbol;
    
    console.log(`请求 Alpha Vantage 数据: 原始符号=${symbol}, 转换后=${avSymbol}, 周期=${interval}`);
    
    const params = {
      function: 'TIME_SERIES_INTRADAY',
      symbol: avSymbol,
      interval: interval + 'min', // Alpha Vantage 支持的最小间隔是1分钟
      apikey: ALPHA_VANTAGE_API_KEY,
      outputsize: outputSize
    };
    
    const url = `${ALPHA_VANTAGE_BASE_URL}`;
    console.log(`请求URL: ${url}?${new URLSearchParams(params)}`);
    
    const response = await axios.get(url, { params });
    
    if (response.data && response.data['Time Series (1min)']) {
      const data = response.data['Time Series (1min)'];
      const klines = [];
      
      for (const timestamp in data) {
        const bar = data[timestamp];
        klines.push([
          Date.parse(timestamp), // 开盘时间
          parseFloat(bar['1. open']),   // 开盘价
          parseFloat(bar['2. high']),   // 最高价
          parseFloat(bar['3. low']),    // 最低价
          parseFloat(bar['4. close']),  // 收盘价
          parseFloat(bar['5. volume']), // 交易量
          null                       // Dukascopy额外字段
        ]);
      }
      
      console.log(`获取到${klines.length}条K线数据`);
      return klines;
    } else {
      console.log(`未获取到数据或数据为空`);
      return [];
    }
  } catch (error) {
    console.error(`获取 Alpha Vantage 数据失败: ${error.message}`);
    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error(`响应数据: ${JSON.stringify(error.response.data)}`);
    }
    return [];
  }
}

// 设置CORS头
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 模拟 Dukascopy API
app.get('/index.php', async (req, res) => {
  try {
    const path = req.query.path || '';
    const jsonpCallback = req.query.jsonp || 'callback';
    
    if (path === 'chart/json3') {
      let instrument = req.query.instrument || 'BTC/USDT';
      const period = req.query.period || '60';
      const binancePeriod = periodMapping[period] || '1hour';
      
      console.log(`接收到请求: instrument=${instrument}, period=${period}`);
      
      // 映射回 Alpha Vantage 符号
      const avSymbol = symbolMapping[instrument] || instrument;
      
      // 获取数据
      let klines = await getAlphaVantageKlines(avSymbol, binancePeriod);
      
      // 如果需要，可以在这里进行数据转换或缓存处理
      
      // 返回数据
      res.json({
        status: 'ok',
        data: klines
      });
    } else {
      // 处理其他路径
      res.json({
        status: 'error',
        message: '无效的路径'
      });
    }
  } catch (error) {
    console.error(`处理请求失败: ${error.message}`);
    res.json({
      status: 'error',
      message: error.message
    });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器已启动，监听端口 ${PORT}`);
});
