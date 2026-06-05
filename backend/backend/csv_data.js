const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

function loadAccountCsv() {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(path.join(__dirname, "Accounts.csv"))
      .pipe(csv())
      .on("data", (row) => results.push(row))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

module.exports = {
  loadAccountCsv,
};