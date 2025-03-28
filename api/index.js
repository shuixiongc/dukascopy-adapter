// api/index.js
const express = require('express');
const axios = require('axios');
const app = express();

// 缓存来自Binance的数据
let dataCache = {};
const symbolMapping = {
  'XAU/USD': 'XAUUSD',
  'EUR/USD': 'EURUSD',
  'BTC/USD': 'BTCUSDT',
  'ETH/USD': 'ETHUSDT'
};

// 周期映射
const periodMapping = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  '1440': '1d'
};

// 获取Binance历史K线数据
async function getBinanceKlines(symbol, interval, limit = 500) {
  try {
    const binanceSymbol = symbolMapping[symbol] || symbol.replace('/', '');
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
    
    const response = await axios.get(url);
    
    // 转换为Dukascopy格式 [时间戳，开盘价，最高价，最低价，收盘价，交易量，null]
    return response.data.map(kline => [
      parseInt(kline[0]),     // 开盘时间
      parseFloat(kline[1]),   // 开盘价
      parseFloat(kline[2]),   // 最高价
      parseFloat(kline[3]),   // 最低价
      parseFloat(kline[4]),   // 收盘价
      parseFloat(kline[5]),   // 交易量
      null                    // Dukascopy额外字段
    ]);
  } catch (error) {
    console.error('获取Binance数据失败:', error.message);
    return [];
  }
}

// 设置CORS头
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 处理预检请求
app.options('*', (req, res) => {
  res.status(200).end();
});

// 模拟Dukascopy API
app.get('/index.php', async (req, res) => {
  const path = req.query.path;
  const callback = req.query.jsonp || 'callback';
  
  if (path === 'chart/json3') {
    const instrument = req.query.instrument || 'BTC/USD';
    const period = req.query.period || '60';
    const binancePeriod = periodMapping[period] || '1h';
    
    // 缓存键
    const cacheKey = `${instrument}-${binancePeriod}`;
    
    // 检查缓存是否过期（5分钟）
    const now = Date.now();
    if (!dataCache[cacheKey] || !dataCache[cacheKey].timestamp || (now - dataCache[cacheKey].timestamp > 5 * 60 * 1000)) {
      console.log(`获取新数据: ${instrument}, ${binancePeriod}`);
      const klines = await getBinanceKlines(instrument, binancePeriod);
      dataCache[cacheKey] = {
        data: klines,
        timestamp: now
      };
    }
    
    // 返回JSONP格式
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`${callback}(${JSON.stringify(dataCache[cacheKey].data)})`);
  } else if (path === 'common/instruments') {
    // 提供可用交易对列表
    const instruments = [
      { id: 'BTC/USD', name: '比特币/美元' },
      { id: 'ETH/USD', name: '以太坊/美元' },
      { id: 'XAU/USD', name: '黄金/美元' },
      { id: 'EUR/USD', name: '欧元/美元' }
    ];
    
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`${callback}(${JSON.stringify(instruments)})`);
  } else {
    // 处理其他API调用
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`${callback}({})`);
  }
});

// 健康检查端点
app.get('/', (req, res) => {
  res.send('Dukascopy适配器服务正在运行');
});

// 导出为Vercel无服务器函数
module.exports = app;