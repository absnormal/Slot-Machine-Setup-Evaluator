/**
 * controlBlocks.js — 控制與偵測類積木
 *
 * 從 FlowRunner 抽出的純函數，接收 runner 實例作為第一參數。
 * 包含：click_roi, wait, key_press, type_text, hotkey, wait_stable, wait_change
 */
import { clickROI } from '../actions/clickAction';
import { wait } from '../actions/waitAction';
import { waitStable } from '../actions/waitStableAction';
import { waitChange } from '../actions/waitChangeAction';
import { FlowEvent } from '../flowRunner';

// ── 控制積木 ──

export async function execClick(runner, block) {
    const { roi, button } = block.params;
    // 動態目標優先（find_text 註冊的）
    const dynROI = runner._getDynamicTarget(roi);
    if (dynROI) {
        return await clickROI(runner._ws, dynROI, { button });
    }
    return await clickROI(runner._ws, roi, { button });
}

export async function execWait(runner, block) {
    // 優先用 seconds（新格式），fallback 到 ms（舊格式）
    const ms = block.params.seconds !== undefined
        ? runner._evalExpr(block.params.seconds) * 1000
        : runner._evalExpr(block.params.ms);
    await wait(ms, { cancelRef: runner._cancelRef });
}

export async function execKeyPress(runner, block) {
    const { key } = block.params;
    const resolvedKey = runner._interpolate(String(key || ''));
    const requestId = `key_${Date.now()}`;
    runner._emit(FlowEvent.LOG, { message: `⌨️ 按鍵: ${resolvedKey}` });

    const result = await runner._sendControl({ action: 'key', key: resolvedKey, requestId });
    if (!result?.success) {
        throw new Error(`按鍵失敗: ${result?.message || 'unknown'}`);
    }
    // 給目標視窗處理時間
    await new Promise(r => setTimeout(r, 100));
}

export async function execTypeText(runner, block) {
    const { text } = block.params;
    const resolved = runner._interpolate(String(text || ''));
    runner._emit(FlowEvent.LOG, { message: `💬 輸入: "${resolved}"` });

    const result = await runner._sendControl({ action: 'type_text', text: resolved });
    if (!result?.success) {
        throw new Error(`輸入失敗: ${result?.message || 'unknown'}`);
    }
    // 剪貼簿+貼上需要較長處理時間
    await new Promise(r => setTimeout(r, 300));
}

export async function execHotkey(runner, block) {
    const { keys } = block.params;
    const resolvedKeys = runner._interpolate(String(keys || ''));
    const keyList = resolvedKeys.split('+').map(k => k.trim()).filter(Boolean);
    if (keyList.length === 0) return;
    runner._emit(FlowEvent.LOG, { message: `🔑 組合鍵: ${keyList.join('+')}` });

    const result = await runner._sendControl({ action: 'hotkey', keys: keyList });
    if (!result?.success) {
        throw new Error(`組合鍵失敗: ${result?.message || 'unknown'}`);
    }
    await new Promise(r => setTimeout(r, 200));
}

// ── 偵測積木 ──

export async function execWaitStable(runner, block) {
    const { roi, stableCount, interval, timeout } = block.params;
    return await waitStable(runner._videoEl, roi, {
        stableCount: stableCount ?? 3,
        interval: interval ?? 200,
        timeout: timeout ?? 30000,
        cancelRef: runner._cancelRef,
    });
}

export async function execWaitChange(runner, block) {
    const { roi, changeCount, interval, timeout } = block.params;
    // waitChange 超時會 throw Error（由外層 errorPolicy 攔截）
    const result = await waitChange(runner._ws, roi, {
        changeCount: changeCount ?? 2,
        interval: interval ?? 200,
        timeout: (timeout ?? 30) * 1000,
        cancelRef: runner._cancelRef,
    });

    const msg = `⚡ ${roi}: ${result.oldValue} → ${result.newValue} (穩定 ${changeCount ?? 2} 次, ${(result.elapsed / 1000).toFixed(1)}s)`;
    runner._emit(FlowEvent.LOG, { message: msg });
    runner._sendPythonLog(msg);
    return result;
}
