const fs = require('fs');

class JSONHandler {
  static save(data, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  static load(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
}

class CSVHandler {
  static save(data, filePath, headers = null) {
    let csv = '';
    
    if (headers) {
      csv += headers.join(',') + '\n';
    }
    
    for (const row of data) {
      const values = Array.isArray(row) ? row : Object.values(row);
      csv += values.map(v => `"${v}"`).join(',') + '\n';
    }
    
    fs.writeFileSync(filePath, csv);
    return filePath;
  }
}

module.exports = { JSONHandler, CSVHandler };
