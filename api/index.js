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
    // 处理符号映射
    let binanceSymbol = symbol.replace('/', '');
    if (symbolMapping[symbol]) {
      binanceSymbol = symbolMapping[symbol];
    }
    
    console.log(`正在请求Binance数据: ${binanceSymbol}, ${interval}`);
    
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
      let instrument = req.query.instrument || 'BTC/USD';
      const period = req.query.period || '60';
      const binancePeriod = periodMapping[period] || '1h';
      
      // 处理符号映射
      if (instrument.includes('/')) {
        // 确保格式正确
        console.log(`处理交易对: ${instrument}`);
      } else {
        // 可能是直接传入的Binance符号
        instrument = instrument.toUpperCase();
        if (instrument.endsWith('USD')) {
          instrument = instrument.slice(0, -3) + '/USD';
        }
        console.log(`格式化交易对: ${instrument}`);
      }
      
      // 缓存键
      const cacheKey = `${instrument}-${binancePeriod}`;
      
      // 检查缓存是否过期（2分钟）
      const now = Date.now();
      if (!dataCache[cacheKey] || !dataCache[cacheKey].timestamp || (now - dataCache[cacheKey].timestamp > 2 * 60 * 1000)) {
        console.log(`获取新数据: ${instrument}, ${binancePeriod}`);
        try {
          const klines = await getBinanceKlines(instrument, binancePeriod);
          if (klines && klines.length > 0) {
            dataCache[cacheKey] = {
              data: klines,
              timestamp: now
            };
            console.log(`已更新数据: ${klines.length} 条K线`);
          } else {
            console.log(`未能获取数据，使用空数组`);
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
      }
      
      // 返回JSONP格式
      const data = dataCache[cacheKey] ? dataCache[cacheKey].data : [];
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}(${JSON.stringify(data)})`);
    } else if (path === 'common/instruments') {
      // 提供可用交易对列表
      const instruments = [
        { id: 'BTC/USD', name: '比特币/美元' },
        { id: 'ETH/USD', name: '以太坊/美元' },
        { id: 'XRP/USD', name: '瑞波币/美元' },
        { id: 'LTC/USD', name: '莱特币/美元' },
        { id: 'XAU/USD', name: '黄金/美元' },
        { id: 'EUR/USD', name: '欧元/美元' }
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
          {"id":"Asia/Shanghai", "name":"Asia/Shanghai", "offset": 8 * 3600000},
          {"id":"America/New_York", "name":"America/New_York", "offset": -4 * 3600000}
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
      <head><title>Dukascopy适配器服务</title></head>
      <body>
        <h1>Dukascopy适配器服务正在运行</h1>
        <p>当前缓存的交易对:</p>
        <ul>
          ${Object.keys(dataCache).map(key => `<li>${key}: ${dataCache[key].data.length}根K线, 最后更新: ${new Date(dataCache[key].timestamp).toLocaleString()}</li>`).join('')}
        </ul>
      </body>
    </html>
  `);
});

// 导出为Vercel无服务器函数
module.exports = app;
