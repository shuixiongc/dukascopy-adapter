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
