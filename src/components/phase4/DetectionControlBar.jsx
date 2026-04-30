import React from 'react';
import { Play, Square, Camera } from 'lucide-react';
import SettingTooltip from './SettingTooltip';

/**
 * DetectionControlBar — 偵測控制列（開始/停止 + 手動截圖 + 4 個參數開關）
 * 從 Phase4Video.jsx L258-356 抽離
 */
const DetectionControlBar = ({
    isLiveActive,
    videoSrc,
    onStartLive,
    onStopLive,
    onManualCapture,
    // 辨識來源
    useWinFrame, onToggleUseWinFrame,
    // WIN 追蹤
    enableWinTracker, setEnableWinTracker,
    // WIN 模式
    hasRollingWin, setHasRollingWin,
    // 連鎖模式
    enableEmptyBoardFilter, setEnableEmptyBoardFilter,
}) => {
    return (
        <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm">
            <button onClick={isLiveActive ? onStopLive : onStartLive}
                disabled={!videoSrc}
                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md ${isLiveActive ? 'bg-rose-600 text-white animate-pulse shadow-rose-200' : !videoSrc ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 active:scale-95'}`}>
                {isLiveActive ? (
                    <><Square size={16} fill="currentColor" /> 停止偵測</>
                ) : (
                    <><Play size={18} fill="currentColor" /> 開始即時偵測</>
                )}
            </button>

            <button onClick={onManualCapture}
                disabled={!videoSrc}
                className="h-full px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200 active:scale-95 shadow-sm">
                <Camera size={16} className="text-amber-500" /> 手動截圖
            </button>

            <div className="flex flex-wrap items-center gap-3 ml-auto border-l border-slate-200 pl-4">
                <SettingTooltip
                    title="🏆 辨識來源"
                    desc="選擇用哪張截圖進行盤面辨識"
                    tech="WIN截圖＝抓到 WIN 時的畫面；停輪截圖＝轉輪停止的瞬間">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-slate-400">辨識來源</span>
                    <button onClick={onToggleUseWinFrame}
                        className={`h-7 flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95 ${
                            useWinFrame
                                ? 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100'
                                : 'bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {useWinFrame ? '🏆 WIN截圖' : '🎰 停輪截圖'}
                    </button>
                </div>
                </SettingTooltip>
                <SettingTooltip
                    title="🎯 WIN 追蹤器"
                    desc={enableWinTracker
                        ? '由 WIN 特工接手辨識。停輪後會每秒偵測 20 次，追蹤贏分變化直到結束結算'
                        : '由 V-Line 主力偵測。全盤完全靜止才會截圖，不會持續追蹤'}
                    usage={enableWinTracker ? '連鎖消除、大獎跳轉、贏分有動態變化的機台' : '一般單局結算機台'}
                    tech={enableWinTracker ? '啟動 WebWorker 特工，高頻輪詢 WIN ROI 的數字變化' : '依賴全盤 MAE 變更計算，穩定後進行單次 OCR'}>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-slate-400">WIN 追蹤</span>
                    <button onClick={() => setEnableWinTracker(!enableWinTracker)}
                        className={`h-7 px-3 rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95 flex items-center justify-center ${
                            enableWinTracker
                                ? 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100'
                                : 'bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {enableWinTracker ? '🎯 追蹤開' : '⏸️ 追蹤關'}
                    </button>
                </div>
                </SettingTooltip>
                <SettingTooltip
                    title="📈 WIN 模式"
                    desc="設定 WIN 數字的顯示方式"
                    usage="滾動上升＝WIN 從 0 往上跑、穩定跳轉＝直接顯示最終值"
                    tech="滾動模式容許 2 秒閃爍，穩定模式僅 0.5 秒">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-slate-400">WIN 模式</span>
                    <button onClick={() => setHasRollingWin(v => !v)}
                        className={`h-7 flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95 ${
                            hasRollingWin
                                ? 'bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {hasRollingWin ? '📈 滾動上升' : '⏸️ 穩定跳轉'}
                    </button>
                </div>
                </SettingTooltip>
                <SettingTooltip
                    title="🔗 連鎖模式 (Cascade)"
                    desc={enableEmptyBoardFilter
                        ? '消除/連鎖型遊戲專用偵測模式，包含三層防護：\n① 空盤過濾：清空動畫時不截圖\n② 碎片辨識：局部掉落不誤判靜止\n③ WIN 變化截圖：只在贏分數字改變時截圖'
                        : '一般模式，適用於盤面不會消除重排的遊戲'}
                    usage={enableEmptyBoardFilter ? '盤面會消除→掉落→再消除的遊戲' : '一般單局結算遊戲'}
                    tech={"① σ<35 空盤跳過\n② Dead Zone Guard 解除\n③ WIN ROI 像素差異 ≥ 8 觸發截圖"}>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-slate-400">連鎖模式</span>
                    <button onClick={() => setEnableEmptyBoardFilter(!enableEmptyBoardFilter)}
                        className={`h-7 px-3 rounded-lg text-xs font-bold shadow-sm cursor-pointer transition-all active:scale-95 ${
                            enableEmptyBoardFilter
                                ? 'bg-violet-50 border border-violet-300 text-violet-700 hover:bg-violet-100'
                                : 'bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {enableEmptyBoardFilter ? '🔗 連鎖開' : '⭕ 連鎖關'}
                    </button>
                </div>
                </SettingTooltip>
            </div>
        </div>
    );
};

export default DetectionControlBar;
