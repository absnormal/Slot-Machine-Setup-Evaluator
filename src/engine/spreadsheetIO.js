/**
 * spreadsheetIO.js — Excel 讀寫核心
 *
 * 使用 SheetJS (xlsx) 在前端解析/匯出 Excel 檔案。
 * 供 DataTablePanel 上傳、FlowRunner 匯出使用。
 */
import * as XLSX from 'xlsx';

/**
 * 解析 Excel 檔案為 JSON
 * @param {File} file - 使用者上傳的 Excel 檔案
 * @returns {Promise<{ name: string, headers: string[], rows: Object[] }>}
 */
export async function parseExcel(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // 取第一個 sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 轉成 JSON（header 自動取第一行）
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // 取得表頭
    const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

    // 清理：所有值轉字串，去除前後空白
    const rows = rawRows.map(row => {
        const cleaned = {};
        for (const [k, v] of Object.entries(row)) {
            cleaned[k] = v === null || v === undefined ? '' : String(v).trim();
        }
        return cleaned;
    });

    return {
        name: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
        headers,
        rows,
    };
}

/**
 * 匯出 JSON 資料為 Excel 檔案並觸發下載
 * @param {Object[]} rows - 資料列陣列
 * @param {string} filename - 檔名（不含副檔名）
 * @param {string} [sheetName='結果'] - sheet 名稱
 */
export function exportExcel(rows, filename, sheetName = '結果') {
    if (!rows || rows.length === 0) {
        console.warn('[spreadsheetIO] 沒有資料可匯出');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // 自動欄寬（取每欄最大內容長度）
    const headers = Object.keys(rows[0]);
    ws['!cols'] = headers.map(h => {
        const maxLen = Math.max(
            h.length,
            ...rows.map(r => String(r[h] || '').length)
        );
        return { wch: Math.min(maxLen + 2, 40) };
    });

    // 觸發下載
    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    XLSX.writeFile(wb, `${filename}_${dateStr}.xlsx`);
}
