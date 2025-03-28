// api/index.js
const express = require('express');
const axios = require('axios');
const app = express();

// 缓存来自Binance的数据
let dataCache = {};

// 改进的符号映射
const symbolMapping = {
  'XAU/USD': 'XAUUSDT',   // 黄金/美元 -> 币安上是XAUUSDT
  'EUR/USD': 'EURUSDT',   // 欧元/美元 -> 币安上是EURUSDT
  'BTC/USD': 'BTCUSDT',   // 比特币/美元 -> 币安上是BTCUSDT
  'ETH/USD': 'ETHUSDT',   // 以太坊/美元 -> 币安上是ETHUSDT
  // 新增更多常用对
  'LTC/USD': 'LTCUSDT',   // 莱特币/美元
  'XRP/USD': 'XRPUSDT',   // 瑞波币/美元
  'DOGE/USD': 'DOGEUSDT', // 狗狗币/美元
  'ADA/USD': 'ADAUSDT',   // 艾达币/美元
  'SOL/USD': 'SOLUSDT',   // 索拉纳/美元
  'DOT/USD': 'DOTUSDT',   // 波卡/美元
  'SHIB/USD': 'SHIBUSDT', // 柴犬币/美元
  'MATIC/USD': 'MATICUSDT' // Polygon/美元
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
    // 处理符号映射
    let binanceSymbol;
    if (symbolMapping[symbol]) {
      binanceSymbol = symbolMapping[symbol];
    } else if (symbol.includes('/')) {
      // 如果是xx/xx格式，转换为xxxx格式
      binanceSymbol = symbol.replace('/', '') + 'USDT';
    } else {
      // 已经是binance格式
      binanceSymbol = symbol;
    }
    
    console.log(`请求Binance数据: 原始符号=${symbol}, 转换后=${binanceSymbol}, 周期=${interval}`);
    
    // 确保符号为大写
    binanceSymbol = binanceSymbol.toUpperCase();
    
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
    console.log(`请求URL: ${url}`);
    
    const response = await axios.get(url);
    
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      console.log(`获取到${response.data.length}条K线数据`);
      
      // 转换为Dukascopy格式
      return response.data.map(kline => [
        parseInt(kline[0]),     // 开盘时间
        parseFloat(kline[1]),   // 开盘价
        parseFloat(kline[2]),   // 最高价
        parseFloat(kline[3]),   // 最低价
        parseFloat(kline[4]),   // 收盘价
        parseFloat(kline[5]),   // 交易量
        null                    // Dukascopy额外字段
      ]);
    } else {
      console.log(`未获取到数据或数据为空`);
      return [];
    }
  } catch (error) {
    console.error(`获取Binance数据失败: ${error.message}`);
    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error(`响应数据: ${JSON.stringify(error.response.data)}`);
    }
    return [];
  }
}

// 尝试多种格式获取数据
async function tryMultipleFormats(baseSymbol, interval, limit = 500) {
  // 尝试多种可能的格式
  const possibleSymbols = [
    baseSymbol,
    baseSymbol.toUpperCase(),
    baseSymbol.replace('/', '') + 'USDT',
    baseSymbol.replace('/', '') + 'USD',
    baseSymbol.replace('/', '')
  ];
  
  console.log(`尝试多种格式: ${possibleSymbols.join(', ')}`);
  
  // 依次尝试每种格式
  for (const symbol of possibleSymbols) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      console.log(`尝试请求: ${url}`);
      
      const response = await axios.get(url);
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        console.log(`成功获取数据，使用符号: ${symbol}`);
        return response.data.map(kline => [
          parseInt(kline[0]),     // 开盘时间
          parseFloat(kline[1]),   // 开盘价
          parseFloat(kline[2]),   // 最高价
          parseFloat(kline[3]),   // 最低价
          parseFloat(kline[4]),   // 收盘价
          parseFloat(kline[5]),   // 交易量
          null                    // Dukascopy额外字段
        ]);
      }
    } catch (e) {
      console.log(`格式 ${symbol} 请求失败: ${e.message}`);
    }
  }
  
  // 所有格式都失败，返回空数组
  console.log(`所有格式都失败，返回空数组`);
  return [];
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

// 模拟Dukascopy API
app.get('/index.php', async (req, res) => {
  try {
    const path = req.query.path || '';
    const jsonpCallback = req.query.jsonp || 'callback';
    
    if (path === 'chart/json3') {
      let instrument = req.query.instrument || 'BTCUSDT';
      const period = req.query.period || '60';
      const binancePeriod = periodMapping[period] || '1h';
      
      console.log(`接收到请求: instrument=${instrument}, period=${period}`);
      
      // 缓存键
      const cacheKey = `${instrument}-${binancePeriod}`;
      
      // 检查缓存是否过期（1分钟）
      const now = Date.now();
      if (!dataCache[cacheKey] || !dataCache[cacheKey].timestamp || (now - dataCache[cacheKey].timestamp > 1 * 60 * 1000)) {
        console.log(`缓存过期或不存在，获取新数据`);
        try {
          // 先尝试使用映射
          let klines = [];
          if (symbolMapping[instrument]) {
            klines = await getBinanceKlines(instrument, binancePeriod);
          }
          
          // 如果映射失败，尝试多种格式
          if (klines.length === 0) {
            console.log(`映射方式获取数据失败，尝试多种格式`);
            klines = await tryMultipleFormats(instrument, binancePeriod);
          }
          
          if (klines.length > 0) {
            dataCache[cacheKey] = {
              data: klines,
              timestamp: now
            };
            console.log(`已更新缓存: ${klines.length}条K线`);
          } else {
            console.log(`未能获取数据，使用空数组或保留旧缓存`);
            if (!dataCache[cacheKey]) {
              dataCache[cacheKey] = { data: [], timestamp: now };
            }
          }
        } catch (error) {
          console.error(`获取数据出错: ${error.message}`);
          if (!dataCache[cacheKey]) {
            dataCache[cacheKey] = { data: [], timestamp: now };
          }
        }
      } else {
        console.log(`使用缓存数据: ${instrument}-${binancePeriod}`);
      }
      
      // 返回JSONP格式
      const data = dataCache[cacheKey] ? dataCache[cacheKey].data : [];
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}(${JSON.stringify(data)})`);
    } else if (path === 'common/instruments') {
      // 提供可用交易对列表
      const instruments = [
        { id: 'BTCUSDT', name: '比特币/美元' },
        { id: 'ETHUSDT', name: '以太坊/美元' },
        { id: 'XRPUSDT', name: '瑞波币/美元' },
        { id: 'LTCUSDT', name: '莱特币/美元' },
        { id: 'DOGEUSDT', name: '狗狗币/美元' },
        { id: 'ADAUSDT', name: '艾达币/美元' },
        { id: 'SOLUSDT', name: '索拉纳/美元' },
        { id: 'DOTUSDT', name: '波卡/美元' },
        { id: 'MATICUSDT', name: 'Polygon/美元' },
        { id: 'SHIBUSDT', name: '柴犬币/美元' }
      ];
      
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}(${JSON.stringify(instruments)})`);
    } else if (path === 'common/disclaimer' || path.includes('common/disclaimer')) {
      // 处理免责声明
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}({})`);
    } else if (path === 'common/timezones' || path.includes('common/timezones')) {
      // 处理时区信息
      const timezone = req.query.timezone || 'Asia/Shanghai';
      const timezones = {
        "current": {
          "id": timezone,
          "name": timezone,
          "offset": 8 * 3600000
        },
        "list": [
          {"id":"Asia/Shanghai", "name":"上海", "offset": 8 * 3600000},
          {"id":"America/New_York", "name":"纽约", "offset": -4 * 3600000},
          {"id":"Europe/London", "name":"伦敦", "offset": 1 * 3600000},
          {"id":"Japan", "name":"东京", "offset": 9 * 3600000}
        ]
      };
      
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}(${JSON.stringify(timezones)})`);
    } else {
      // 处理其他API调用
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}({})`);
    }
  } catch (error) {
    console.error('处理请求出错:', error);
    // 即使出错也返回正确格式的JSONP
    const jsonpCallback = req.query.jsonp || 'callback';
    res.set('Content-Type', 'application/javascript');
    res.send(`${jsonpCallback}({"error":"${error.message}"})`);
  }
});

// 健康检查端点
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Dukascopy适配器服务</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #333; }
          ul { list-style-type: none; padding: 0; }
          li { margin-bottom: 10px; padding: 10px; background: #f5f5f5; border-radius: 5px; }
          .timestamp { color: #888; font-size: 0.8em; }
          .count { font-weight: bold; color: #4CAF50; }
        </style>
      </head>
      <body>
        <h1>Dukascopy适配器服务正在运行</h1>
        <p>当前缓存的交易对:</p>
        <ul>
          ${Object.keys(dataCache).map(key => `
            <li>
              <div><strong>${key}</strong></div>
              <div>K线数量: <span class="count">${dataCache[key].data.length}</span></div>
              <div class="timestamp">最后更新: ${new Date(dataCache[key].timestamp).toLocaleString()}</div>
            </li>
          `).join('')}
        </ul>
        <p>测试链接:</p>
        <ul>
          <li><a href="/index.php?path=chart/json3&instrument=BTCUSDT&period=60&jsonp=console.log" target="_blank">BTCUSDT 1小时K线</a></li>
          <li><a href="/index.php?path=common/instruments&jsonp=console.log" target="_blank">获取可用交易对</a></li>
        </ul>
      </body>
    </html>
  `);
});

// 导出为Vercel无服务器函数
module.exports = app;
