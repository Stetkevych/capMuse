const fs = require('fs');
let js = fs.readFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine.js', 'utf8');

// Switch from CSV to JSON
js = js.replace("fx('funding_book.csv')", "fx('funding_book_live.json')");

// Update mapDeal to handle both old xlsx column names AND new webhook field names
const oldMapDeal = "function mapDeal(r){return{name:r.Deal_Name||'',";
const newMapDeal = "function mapDeal(r){return{name:r.Deal_Name||r.company||'',";
js = js.replace(oldMapDeal, newMapDeal);

// Fix field mappings to accept both formats
js = js.replace(
  "amount:nn(r.Funded_Amount),",
  "amount:nn(r.Funded_Amount||r.funding),"
);
js = js.replace(
  "payback:nn(r.Payback_Amount)",
  "payback:nn(r.Payback_Amount||r.payback)"
);
js = js.replace(
  "buy_rate:nn(r.Buy_Rate),",
  "buy_rate:nn(r.Buy_Rate||r.buy_rate),"
);
js = js.replace(
  "daily_payment:nn(r.Daily_Payment),",
  "daily_payment:nn(r.Daily_Payment||r.daily_payment),"
);

// Also need to handle JSON response (not CSV) - the fetchCSV function returns parsed CSV
// but funding_book_live.json is already JSON. Let me add a JSON fetch path.
// Replace the fx function to handle both CSV and JSON
const oldFx = "function fx(file){return fetch(BUCKET+'/'+file).then(function(r){return r.ok?r.text():null;}).then(function(t){return t?csvParse(t):null;}).catch(function(){return null;});}";
const newFx = "function fx(file){return fetch(BUCKET+'/'+file).then(function(r){return r.ok?r.text():null;}).then(function(t){if(!t)return null;if(file.endsWith('.json')){try{return JSON.parse(t);}catch(e){return null;}}return csvParse(t);}).catch(function(){return null;});}";
js = js.replace(oldFx, newFx);

fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/public/capmuse-engine.js', js);
fs.writeFileSync('c:/Users/AlexStetkevych/Desktop/capMuse/FrontendUI/capmuse-engine.js', js);

// Validate
try { require('vm').createScript(js); console.log('JS VALID ✅'); }
catch(e) { console.log('ERROR:', e.message); }

console.log('Engine updated: reads funding_book_live.json, handles both field formats');
