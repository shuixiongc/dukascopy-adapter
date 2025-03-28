// api/index.js - 完整功能版
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

// 处理favicon请求
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
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
        
        // 尝试使用映射获取数据
        let klines = await getOKXKlines(instrument, okxBar);
        
        if (klines.length > 0) {
          dataCache[cacheKey] = {
            data: klines,
            timestamp: now
          };
          console.log(`成功更新缓存: ${klines.length}条K线`);
        } else {
          console.log(`获取数据失败，使用默认测试数据`);
          // 使用默认测试数据
          const testData = [
            [1679529600000, 28000.5, 28100.3, 27900.1, 28050.2, 1234.56, null],
            [1679533200000, 28050.2, 28200.7, 27950.3, 28150.4, 2345.67, null],
            [1679536800000, 28150.4, 28300.5, 28050.6, 28250.8, 3456.78, null]
          ];
          dataCache[cacheKey] = { 
            data: testData, 
            timestamp: now 
          };
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
        { id: 'SOL-USDT', name: '索拉纳/美元' }
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

// 导出Express应用
module.exports = app;
