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

// 模拟Dukascopy API
app.get('/index.php', async (req, res) => {
  try {
    const path = req.query.path || '';
    const jsonpCallback = req.query.jsonp || 'callback';
    
    if (path === 'chart/json3') {
      let instrument = req.query.instrument || 'BTC-USDT';
      const period = req.query.period || '60';
      const okxBar = periodMapping[period] || '1H';
      
      console.log(`接收请求: instrument=${instrument}, period=${period} -> bar=${okxBar}`);
      
      // 规范化符号格式
      if (instrument.includes('-USD') && !instrument.endsWith('T')) {
        instrument = instrument + 'T'; // 添加T使其成为USDT对
      }
      
      // 缓存键
      const cacheKey = `${instrument}-${okxBar}`;
      
      // 检查缓存是否过期（30秒）
      const now = Date.now();
      if (!dataCache[cacheKey] || !dataCache[cacheKey].timestamp || (now - dataCache[cacheKey].timestamp > 30 * 1000)) {
        console.log(`缓存过期或不存在，获取新数据`);
        
        let klines = [];
        
        // 首先尝试使用映射
        if (symbolMapping[instrument]) {
          klines = await getOKXKlines(instrument, okxBar);
        }
        
        // 如果第一次尝试失败，尝试原始格式
        if (klines.length === 0) {
          klines = await getOKXKlines(instrument, okxBar);
        }
        
        // 如果仍然失败，尝试多种格式
        if (klines.length === 0) {
          console.log(`常规方法获取数据失败，尝试多种符号格式`);
          klines = await tryMultipleSymbolFormats(instrument, okxBar);
        }
        
        if (klines.length > 0) {
          dataCache[cacheKey] = {
            data: klines,
            timestamp: now
          };
          console.log(`成功更新缓存: ${klines.length}条K线`);
        } else {
          console.log(`所有尝试均失败，使用空数组或保留旧缓存`);
          if (!dataCache[cacheKey]) {
            dataCache[cacheKey] = { data: [], timestamp: now };
          }
        }
      } else {
        console.log(`使用缓存数据: ${instrument}-${okxBar}, 最后更新: ${new Date(dataCache[cacheKey].timestamp).toLocaleString()}`);
      }
      
      // 返回JSONP格式的数据
      const data = dataCache[cacheKey] ? dataCache[cacheKey].data : [];
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}(${JSON.stringify(data)})`);
    } else if (path === 'common/instruments') {
      // 提供可用交易对列表
      const instruments = [
        { id: 'BTC-USDT', name: '比特币/美元' },
        { id: 'ETH-USDT', name: '以太坊/美元' },
        { id: 'XRP-USDT', name: '瑞波币/美元' },
        { id: 'LTC-USDT', name: '莱特币/美元' },
        { id: 'DOGE-USDT', name: '狗狗币/美元' },
        { id: 'ADA-USDT', name: '艾达币/美元' },
        { id: 'SOL-USDT', name: '索拉纳/美元' },
        { id: 'DOT-USDT', name: '波卡/美元' },
        { id: 'SHIB-USDT', name: '柴犬币/美元' },
        { id: 'MATIC-USDT', name: 'Polygon/美元' }
      ];
      
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}(${JSON.stringify(instruments)})`);
    } else if (path === 'common/disclaimer' || path.includes('common/disclaimer')) {
      // 免责声明
      res.set('Content-Type', 'application/javascript');
      res.send(`${jsonpCallback}({})`);
    } else if (path === 'common/timezones' || path.includes('common/timezones')) {
      // 时区信息
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
          {"id":"Asia/Tokyo", "name":"东京", "offset": 9 * 3600000}
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
          .test-link { margin-top: 5px; }
          .test-link a { color: #2196F3; text-decoration: none; }
          .test-link a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Dukascopy适配器服务(OKX数据源)</h1>
        <p>当前缓存的交易对:</p>
        <ul>
          ${Object.keys(dataCache).map(key => `
            <li>
              <div><strong>${key}</strong></div>
              <div>K线数量: <span class="count">${dataCache[key].data?.length || 0}</span></div>
              <div class="timestamp">最后更新: ${new Date(dataCache[key].timestamp).toLocaleString()}</div>
              <div class="test-link">
                <a href="/index.php?path=chart/json3&instrument=${key.split('-')[0]}&period=60&jsonp=console.log" target="_blank">测试API</a>
              </div>
            </li>
          `).join('') || '<li>暂无缓存数据</li>'}
        </ul>
        <p>测试链接:</p>
        <ul>
          <li><a href="/index.php?path=chart/json3&instrument=BTC-USDT&period=60&jsonp=console.log" target="_blank">BTC-USDT 1小时K线</a></li>
          <li><a href="/index.php?path=chart/json3&instrument=ETH-USDT&period=15&jsonp=console.log" target="_blank">ETH-USDT 15分钟K线</a></li>
          <li><a href="/index.php?path=common/instruments&jsonp=console.log" target="_blank">获取可用交易对</a></li>
        </ul>
      </body>
    </html>
  `);
});

// 导出为Vercel无服务器函数
module.exports = app;
