/**
 * varBlocks.js — 變數操作類積木
 *
 * 從 FlowRunner 抽出的純函數，接收 runner 實例作為第一參數。
 * 包含：set_var, log, var_replace, var_extract_number
 */
import { FlowEvent } from '../flowRunner';

export function execSetVar(runner, block) {
    const { name, value, op } = block.params;
    const resolved = runner._evalExpr(value);
    const current = runner.variables[name] ?? 0;
    let final;
    switch (op) {
        case '+=': final = (parseFloat(current) || 0) + (parseFloat(resolved) || 0); break;
        case '-=': final = (parseFloat(current) || 0) - (parseFloat(resolved) || 0); break;
        case '*=': final = (parseFloat(current) || 0) * (parseFloat(resolved) || 0); break;
        case '/=': final = (parseFloat(resolved) || 0) !== 0 ? (parseFloat(current) || 0) / parseFloat(resolved) : 0; break;
        case '%=': final = (parseFloat(resolved) || 0) !== 0 ? (parseFloat(current) || 0) % parseFloat(resolved) : 0; break;
        default:   final = resolved; break; // '=' 或舊資料沒有 op
    }
    runner.variables[name] = final;
    runner._emit(FlowEvent.VAR_UPDATE, { name, value: final });
    return final;
}

export function execLog(runner, block) {
    const msg = runner._interpolate(block.params.message);
    runner._emit(FlowEvent.LOG, { message: msg });
}

/**
 * var_replace — 變數內容取代
 * 將指定變數中的 find 字串取代為 replace 字串（全部取代）
 * find/replace 都支援 $var 變數引用
 */
export function execVarReplace(runner, block) {
    const { varName, find, replace = '' } = block.params;
    const findStr = String(runner._interpolate(find));
    const replStr = String(runner._interpolate(replace));
    const current = String(runner.variables[varName] ?? '');
    // 全部取代（不只第一個）
    const result = current.split(findStr).join(replStr);
    runner.variables[varName] = result;
    runner._emit(FlowEvent.VAR_UPDATE, { name: varName, value: result });
    runner._emit(FlowEvent.LOG, { message: `🔤 ${varName}: "${current}" → "${result}" (剔除"${findStr}")` });
    return result;
}

/**
 * var_extract_number — 從變數中提取數字
 * 移除所有非數字字元（保留 0-9 . , -），再清理千分位逗號與多餘小數點
 */
export function execVarExtractNumber(runner, block) {
    const { varName } = block.params;
    const current = String(runner.variables[varName] ?? '');
    // ① 只保留數字、小數點、逗號、負號
    let cleaned = current.replace(/[^0-9.,\-]/g, '');
    // ② 移除千分位逗號
    cleaned = cleaned.replace(/,/g, '');
    // ③ 清掉頭尾孤立小數點
    cleaned = cleaned.replace(/^\.+|\.+$/g, '');
    // ④ 多個小數點：只認最後一個為小數點（其他是千分位誤判）
    const dotParts = cleaned.split('.');
    if (dotParts.length > 2) {
        const decimals = dotParts.pop();
        cleaned = dotParts.join('') + '.' + decimals;
    }
    const result = cleaned || '0';
    runner.variables[varName] = result;
    runner._emit(FlowEvent.VAR_UPDATE, { name: varName, value: result });
    runner._emit(FlowEvent.LOG, { message: `🔢 ${varName}: "${current}" → "${result}"` });
    return result;
}
