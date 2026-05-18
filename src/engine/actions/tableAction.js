/**
 * tableAction.js — 表格積木執行動作
 *
 * 對應積木：for_each_row / append_result / export_results / read_row / clear_results
 * 這些積木共同依賴 appStore 中的 dataTables / resultTables 狀態。
 *
 * ⚠️ 表格名稱（table 參數）支援 $variable 插值，執行前會先用 runner._interpolate() 解析。
 *    例如：table = "$cardTable" 會被解析為 runner.variables["$cardTable"] 的值。
 */
import { exportExcel } from '../spreadsheetIO';

/**
 * 執行 for_each_row 積木
 * @param {Object} block
 * @param {number} depth
 * @param {Object} runner - FlowRunner 實例（取用 variables, _appStore, _emit, _executeBlocks, _checkPauseAndCancel）
 */
export async function execForEachRow(block, depth, runner) {
    const { table: tableExpr, rowVar = '$row' } = block.params;
    const children = block.children || [];

    if (!runner._appStore) throw new Error('[for_each_row] appStore 未設定');

    // 支援變數表格名：$tableName 或直接字串
    const table = runner._interpolate(tableExpr || '');

    const tableData = runner._appStore.getState().dataTables[table];
    if (!tableData?.rows) {
        throw new Error(
            `[for_each_row] 找不到資料表「${table}」` +
            `（已上傳 ${Object.keys(runner._appStore.getState().dataTables).join(', ') || '無'}）`
        );
    }

    const rows = tableData.rows;
    const total = rows.length;
    const prefix = rowVar.startsWith('$') ? rowVar : `$${rowVar}`;

    runner._emit('log', { message: `📊 開始迭代「${table}」(${total} 列)` });
    runner._sendPythonLog(`📊 迭代 ${table}: ${total} 列`);

    for (let i = 0; i < total; i++) {
        await runner._checkPauseAndCancel();

        const row = rows[i];
        // 綁定行變數：$row.column
        for (const [col, val] of Object.entries(row)) {
            const varName = `${prefix}.${col}`;
            runner.variables[varName] = val;
            runner._emit('varUpdate', { name: varName, value: val });
        }
        // 作用域索引
        runner.variables[`${prefix}._index`] = i;
        runner.variables[`${prefix}._total`] = total;
        runner._emit('varUpdate', { name: `${prefix}._index`, value: i });
        runner._emit('varUpdate', { name: `${prefix}._total`, value: total });
        // 全域相容
        runner.variables['$rowIndex'] = i;
        runner.variables['$rowTotal'] = total;

        runner._emit('loopProgress', { blockId: block.id, current: i + 1, total });

        try {
            await runner._executeBlocks(children, depth + 1);
        } catch (e) {
            if (e.message === 'break') break;
            throw e;
        }
    }

    runner._emit('log', { message: `📊 「${table}」迭代完成 (${total} 列)` });
}

/**
 * 執行 append_result 積木
 */
export function execAppendResult(block, runner) {
    const { table: tableExpr = 'results', columns } = block.params;
    if (!runner._appStore) throw new Error('[append_result] appStore 未設定');

    const table = runner._interpolate(tableExpr);

    const row = {};
    if (columns && typeof columns === 'object') {
        for (const [colName, varExpr] of Object.entries(columns)) {
            row[colName] = runner._interpolate(String(varExpr));
        }
    }

    runner._appStore.getState().appendResult(table, row);

    const count = (runner._appStore.getState().resultTables[table] || []).length;
    runner._emit('log', { message: `📝 結果已寫入「${table}」(第 ${count} 筆)` });
    runner._sendPythonLog(`📝 結果 #${count}: ${JSON.stringify(row)}`);

    return row;
}

/**
 * 執行 export_results 積木
 */
export function execExportResults(block, runner) {
    const { table: tableExpr = 'results', filename = '報告' } = block.params;
    if (!runner._appStore) throw new Error('[export_results] appStore 未設定');

    const table = runner._interpolate(tableExpr);
    const rows = runner._appStore.getState().resultTables[table] || [];
    if (rows.length === 0) {
        runner._emit('log', { message: `⚠️ 結果表「${table}」沒有資料，跳過匯出` });
        return;
    }

    const resolvedFilename = runner._interpolate(filename);
    exportExcel(rows, resolvedFilename, table);

    runner._emit('log', { message: `📥 已匯出「${resolvedFilename}」(${rows.length} 筆)` });
    runner._sendPythonLog(`📥 匯出 ${resolvedFilename}: ${rows.length} 筆`);
}

/**
 * 執行 read_row 積木
 */
export function execReadRow(block, runner) {
    const { table: tableExpr, indexExpr, rowVar = '$item' } = block.params;
    if (!runner._appStore) throw new Error('[read_row] appStore 未設定');

    // 支援變數表格名
    const table = runner._interpolate(tableExpr || '');

    const tableData = runner._appStore.getState().dataTables[table];
    if (!tableData?.rows) throw new Error(`[read_row] 找不到資料表「${table}」`);

    const rows = tableData.rows;
    const idx = Math.floor(runner._evalExpr(indexExpr));
    const clampedIdx = Math.max(0, Math.min(idx, rows.length - 1));
    const row = rows[clampedIdx];

    const prefix = rowVar.startsWith('$') ? rowVar : `$${rowVar}`;
    for (const [col, val] of Object.entries(row)) {
        const varName = `${prefix}.${col}`;
        runner.variables[varName] = val;
        runner._emit('varUpdate', { name: varName, value: val });
    }
    runner.variables[`${prefix}._index`] = clampedIdx;
    runner._emit('varUpdate', { name: `${prefix}._index`, value: clampedIdx });

    runner._emit('log', { message: `📖 讀取「${table}」第 ${clampedIdx} 行 → ${prefix}` });
    return row;
}

/**
 * 執行 clear_results 積木
 */
export function execClearResults(block, runner) {
    const { table: tableExpr = 'results' } = block.params;
    if (!runner._appStore) throw new Error('[clear_results] appStore 未設定');

    const table = runner._interpolate(tableExpr);
    runner._appStore.getState().clearResults(table);
    runner._emit('log', { message: `🧹 已清空結果表「${table}」` });
}
