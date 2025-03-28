// api/index.js
const express = require('express');
const axios = require('axios');
const app = express();

// 缓存K线数据
let dataCache = {};

// 交易对映射 (Dukascopy格式 -> OKX格式)
const symbolMapping = {
  'XAU/USD': 'XAU-USD',
  'EUR/USD': 'EUR-USD',
  'BTC/USD': 'BTC-USDT',
  'ETH/USD': 'ETH-USDT',
  'LTC/USD': 'LTC-USDT',
  'XRP/USD': 'XRP-USDT',
  'DOGE/USD': 'DOGE-USDT',
  'ADA/USD': 'ADA-USDT',
  'SOL/USD': 'SOL-USDT',
};

// 周期映射 (Dukascopy -> OKX)
const periodMapping = {
  '1': '1m',    // 1分钟
  '5': '5m',    // 5分钟
  '15': '15m',  // 15分钟
  '30': '30m',  // 30分钟
  '60': '1H',   // 1小时
  '240': '4H',  // 4小时
  '1440': '1D'  // 1天
};

// 从OKX获取K线数据
async function getOKXKlines(symbol, bar, limit = 100) {
  try {
    // 处理符号映射
    let okxSymbol;
    if (symbolMapping[symbol]) {
      okxSymbol = symbolMapping[symbol];
    } else if (symbol.includes('/')) {
      // 处理xx/xx格式
      okxSymbol = symbol.replace('/', '-');
      if (okxSymbol.endsWith('-USD')) {
        okxSymbol = okxSymbol + 'T'; // 添加T使其成为USDT对
      }
    } else {
      // 已经是交易所格式
      okxSymbol = symbol;
    }
    
    console.log(`请求OKX数据: 原始符号=${symbol}, 转换后=${okxSymbol}, 周期=${bar}`);
    
    // OKX API请求
    const url = `https://www.okx.com/api/v5/market/candles?instId=${okxSymbol}&bar=${bar}&limit=${limit}`;
    console.log(`请求URL: ${url}`);
    
    const response = await axios.get(url);
    console.log(`收到OKX响应状态: ${response.status}`);
    
    // 检查OKX响应格式
    if (response.data && response.data.code === '0' && response.data.data && Array.isArray(response.data.data)) {
      console.log(`获取到${response.data.data.length}条K线数据`);
      
      // OKX返回的格式: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
      // 转换为Dukascopy格式: [timestamp, open, high, low, close, volume, null]
      return response.data.data.map(kline => [
        parseInt(kline[0]),     // 时间戳
        parseFloat(kline[1]),   // 开盘价
        parseFloat(kline[2]),   // 最高价
        parseFloat(kline[3]),   // 最低价
        parseFloat(kline[4]),   // 收盘价
        parseFloat(kline[5]),   // 成交量
        null                    // Dukascopy额外字段
      ]).reverse(); // OKX返回的是最新的在前，我们需要反转使最早的在前
    } else {
      console.log(`OKX响应格式错误或数据为空: ${JSON.stringify(response.data)}`);
      return [];
    }
  } catch (error) {
    console.error(`获取OKX数据失败: ${error.message}`);
    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error(`响应数据: ${JSON.stringify(error.response.data)}`);
    }
    return [];
  }
}

// 尝试多种可能的符号格式
async function tryMultipleSymbolFormats(baseSymbol, bar) {
  const possibleSymbols = [
    baseSymbol,
    baseSymbol.replace('-', '/'),
    baseSymbol.replace('/', '-'),
    baseSymbol.replace('/', '-') + 'T',  // 尝试USDT格式
    baseSymbol.toUpperCase()
  ];
  
  console.log(`尝试多种符号格式: ${possibleSymbols.join(', ')}`);
  
  // 依次尝试每种格式
  for (const symbol of possibleSymbols) {
    try {
      const url = `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=${bar}&limit=100`;
      console.log(`尝试符号: ${symbol}, URL: ${url}`);
      
      const response = await axios.get(url);
      
      if (response.data && response.data.code === '0' && response.data.data && response.data.data.length > 0) {
        console.log(`成功获取数据，使用符号: ${symbol}`);
        return response.data.data.map(kline => [
          parseInt(kline[0]),   // 时间戳
          parseFloat(kline[1]),  // 开盘价
          parseFloat(kline[2]),  // 最高价
          parseFloat(kline[3]),  // 最低价
          parseFloat(kline[4]),  // 收盘价
          parseFloat(kline[5]),  // 成交量
          null                   // Dukascopy额外字段
        ]).reverse();
      }
    } catch (e) {
      console.log(`符号 ${symbol} 请求失败: ${e.message}`);
    }
  }
  
  console.log('所有符号格式尝试失败');
  return [];
}

// 设置CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 处理favicon请求 - 添加这个路由来解决404错误
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // 返回无内容状态码
});

// 处理静态图标文件请求
app.get('/favicon.png', (req, res) => {
  res.status(204).end();
});

// 处理静态图标文件请求
app.get('/favicon.*', (req, res) => {
  res.status(204).end();
});

// 模拟Dukascopy API
app.get('/index.php', async (req, res) => {
  try {
    const path = req.query.path || '';
    const jsonpCallback = req.query
