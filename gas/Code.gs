function doGet(e) {
  var action = e.parameter.action || 'list';
  var nocache = e.parameter.nocache === 'true'; // 新增：接收前端傳來的強制更新指令
  
  // 1. 單筆完整資料 API (按需載入) - 不快取
  if (action === 'getTemplate') {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var id = e.parameter.id;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        return ContentService.createTextOutput(data[i][3])
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({error: 'Not found'}))
          .setMimeType(ContentService.MimeType.JSON);
  }

  // 2. 輕量級列表 API (極速快取版)
  if (action === 'list') {
    var cache = CacheService.getScriptCache();
    var cachedList = cache.get("slotTemplateList");
    
    // 【修改點】如果沒有強制要求刷新 (!nocache)，且有快取，才直接秒回傳
    if (!nocache && cachedList != null) {
      return ContentService.createTextOutput(cachedList)
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 如果沒有快取，或是要求強制刷新 (nocache=true)，才去讀試算表
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var result = [];
    if (data.length > 1) {
      for (var i = 1; i < data.length; i++) {
        try {
          var obj = JSON.parse(data[i][3]);
          
          // 判斷是否包含 Cash 與 JP 機制 (支援新版布林與舊版全文比對)
          var hasCash = obj.hasCash || false;
          var hasJp = obj.hasJp || false;
          
          if (!hasCash && obj.paytableInput) {
             hasCash = obj.paytableInput.indexOf('CASH') !== -1;
          }
          
          if (!hasJp && obj.paytableInput && obj.jpConfig) {
              var jpKeys = Object.keys(obj.jpConfig);
              for (var k = 0; k < jpKeys.length; k++) {
                  if (jpKeys[k].trim() === '') continue;
                  var regex = new RegExp('(^|\\s)' + jpKeys[k] + '(\\s|$)', 'i');
                  if (regex.test(obj.paytableInput)) {
                      hasJp = true;
                      break;
                  }
              }
          }

          result.push({
            id: obj.id,
            name: obj.name,
            platformName: obj.platformName,
            gameName: obj.gameName,
            gridRows: obj.gridRows,
            gridCols: obj.gridCols,
            hasMultiplierReel: obj.hasMultiplierReel || false, 
            hasDoubleSymbol: obj.hasDoubleSymbol || false,
            requiresCollectToWin: obj.requiresCollectToWin !== undefined ? obj.requiresCollectToWin : true,
            hasCash: hasCash,
            hasJp: hasJp,
            linesCount: obj.extractResults ? obj.extractResults.length : 0,
            creatorId: obj.creatorId,
            createdAt: obj.createdAt
          });
        } catch(err) {}
      }
    }
    result.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    var jsonString = JSON.stringify(result);
    // 將最新結果存入快取 (保存 6 小時 = 21600 秒)，覆蓋掉舊快取
    cache.put("slotTemplateList", jsonString, 21600);
    
    return ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var req = JSON.parse(e.postData.contents);
  var cache = CacheService.getScriptCache(); // 準備清除快取

  if (req.action === 'save') {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["ID", "建立者", "建立時間", "完整JSON資料"]);
    }
    var d = req.data;
    sheet.appendRow([d.id, d.creatorId, d.createdAt, JSON.stringify(d)]);
    
    cache.remove("slotTemplateList"); // 有新資料，清除舊快取
    return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // 在現有 doPost 的 if (req.action === 'save') 之後加入：
  else if (req.action === 'update') {
    var d = req.data;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == d.id) {
        sheet.getRange(i + 1, 1, 1, 4).setValues([[d.id, d.creatorId, d.createdAt, JSON.stringify(d)]]);
        cache.remove("slotTemplateList");
        return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    // 找不到就改為新增
    sheet.appendRow([d.id, d.creatorId, d.createdAt, JSON.stringify(d)]);
    cache.remove("slotTemplateList");
    return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (req.action === 'delete') {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === req.id) { 
        sheet.deleteRow(i + 1);
        break;
      }
    }
    
    cache.remove("slotTemplateList"); // 刪除資料，清除舊快取
    return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}