/**
 * webBlocks.js — 網頁自動化積木處理器
 *
 * 將 FlowRunner 的積木定義轉譯為 webAction 呼叫。
 * 支援變數插值、結果存入變數空間。
 */
import { webNavigate, webAction, webSelect } from '../actions/webAction';
import { FlowEvent } from '../flowRunner';

/**
 * web_navigate 積木：開啟/導航網頁
 */
export async function execWebNavigate(runner, block) {
    const p = block.params || {};
    const browser = runner._interpolate(p.browser || 'default');
    const url = runner._interpolate(p.url || '');

    if (!url) throw new Error('[web_navigate] 未設定 URL');

    runner._emit(FlowEvent.LOG, { message: `🌐 [${browser}] 開啟: ${url.slice(0, 60)}...` });

    const result = await webNavigate(runner._ws, {
        browser,
        url,
        waitSelector: runner._interpolate(p.waitSelector || ''),
        selectorType: p.selectorType || 'xpath',
        timeout: p.timeout ?? 30,
        debugPort: p.debugPort || null,
    });

    runner._emit(FlowEvent.LOG, { message: `✅ [${browser}] 網頁已載入` });
    return result;
}

/**
 * web_action 積木：操作網頁 DOM 元素
 */
export async function execWebAction(runner, block) {
    const p = block.params || {};
    const browser = runner._interpolate(p.browser || 'default');
    const subAction = p.action || p.subAction || 'click';
    const selector = runner._interpolate(p.selector || '');
    const value = runner._interpolate(p.value || '');

    const actionLabels = {
        click: '點擊', input: '輸入', clear_input: '清除',
        read_text: '讀取文字', read_attr: '讀取屬性',
        wait_visible: '等待可見', switch_frame: '切換 Frame', switch_tab: '切換分頁',
    };
    const label = actionLabels[subAction] || subAction;

    runner._emit(FlowEvent.LOG, {
        message: `🖱️ [${browser}] ${label}: ${selector.slice(0, 40)}${value ? ` = "${value.slice(0, 20)}"` : ''}`
    });

    const result = await webAction(runner._ws, {
        browser,
        subAction,
        selector,
        selectorType: p.selectorType || 'xpath',
        value,
        timeout: p.timeout ?? 10,
        debugPort: p.debugPort || null,
    });

    // read_text / read_attr → 將結果存入變數
    if ((subAction === 'read_text' || subAction === 'read_attr') && result.text !== undefined) {
        const varName = p.varName ? runner._interpolate(p.varName) : null;
        if (varName) {
            runner.variables[varName] = result.text;
            runner._emit(FlowEvent.VAR_UPDATE, { name: varName, value: result.text });
            runner._emit(FlowEvent.LOG, { message: `📥 ${varName} = "${String(result.text).slice(0, 50)}"` });
        }
    }

    runner._emit(FlowEvent.LOG, { message: `✅ [${browser}] ${label}完成` });
    return result;
}

/**
 * web_select 積木：操作下拉選單
 */
export async function execWebSelect(runner, block) {
    const p = block.params || {};
    const browser = runner._interpolate(p.browser || 'default');
    const selector = runner._interpolate(p.selector || '');
    const option = runner._interpolate(p.option || '');
    const selectBy = p.selectBy || 'text';

    runner._emit(FlowEvent.LOG, {
        message: `📋 [${browser}] 選擇: "${option}" (by ${selectBy})`
    });

    const result = await webSelect(runner._ws, {
        browser,
        selector,
        selectorType: p.selectorType || 'xpath',
        option,
        selectBy,
        timeout: p.timeout ?? 10,
        debugPort: p.debugPort || null,
    });

    runner._emit(FlowEvent.LOG, { message: `✅ [${browser}] 選擇完成` });
    return result;
}
