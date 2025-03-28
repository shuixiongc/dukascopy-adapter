// api/index.js - 简化版
const express = require('express');
const app = express();

// 设置CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// 处理favicon请求
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 测试端点
app.get('/', (req, res) => {
  res.send('API 正常工作中');
});

// 简化的API端点
app.get('/index.php', (req, res) => {
  const callback = req.query.jsonp || 'callback';
  const path = req.query.path || '';
  
  if (path === 'chart/json3') {
    // 返回一些静态测试数据
    const testData = [
      [1679529600000, 28000.5, 28100.3, 27900.1, 28050.2, 1234.56, null],
      [1679533200000, 28050.2, 28200.7, 27950.3, 28150.4, 2345.67, null],
      [1679536800000, 28150.4, 28300.5, 28050.6, 28250.8, 3456.78, null]
    ];
    
    res.set('Content-Type', 'application/javascript');
    res.send(`${callback}(${JSON.stringify(testData)})`);
  } else {
    res.set('Content-Type', 'application/javascript');
    res.send(`${callback}({})`);
  }
});

module.exports = app;
