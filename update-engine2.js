const fs = require('fs');
let js = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine-clean.js', 'utf8');

// 1. Switch from CSV to JSON for funding book
js = js.replace("fx('funding_book.csv')", "fx('funding_book_live.json')");

// 2. Update mapDeal to handle webhook field names too
js = js.replace(
  "function mapDeal(r){return{name:r.Deal_Name||'',",
  "function mapDeal(r){return{name:r.Deal_Name||r.company||'',"
);
js = js.replace("amount:nn(r.Funded_Amount),", "amount:nn(r.Funded_Amount||r.funding),");
js = js.replace("payback:nn(r.Payback_Amount)", "payback:nn(r.Payback_Amount||r.payback)");
js = js.replace("buy_rate:nn(r.Buy_Rate),", "buy_rate:nn(r.Buy_Rate||r.buy_rate),");
js = js.replace("daily_payment:nn(r.Daily_Payment),", "daily_payment:nn(r.Daily_Payment||r.daily_payment),");

// 3. Update fx() to handle JSON files (not just CSV)
js = js.replace(
  "function fx(file){return fetch(BUCKET+'/'+file).then(function(r){return r.ok?r.text():null;}).then(function(t){return t?csvParse(t):null;}).catch(function(){return null;});}",
  "function fx(file){return fetch(BUCKET+'/'+file).then(function(r){return r.ok?r.text():null;}).then(function(t){if(!t)return null;if(file.endsWith('.json')){try{return JSON.parse(t);}catch(e){return null;}}return csvParse(t);}).catch(function(){return null;});}"
);

// Save
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine.js', js);
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/capmuse-engine.js', js);

// Validate
try { require('vm').createScript(js); console.log('✅ JS Valid'); }
catch(e) { console.log('❌', e.message); }
