import React from 'react';
import { Settings, Trophy, Plus, X } from 'lucide-react';

/**
 * 特殊遊戲設定 Q&A 面板：Double Symbol / Multiplier / Collect / JP
 */
export default function SpecialSymbolQA({
    lineMode,
    hasDoubleSymbol, setHasDoubleSymbol,
    hasMultiplierReel, setHasMultiplierReel,
    multiplierCalcType, setMultiplierCalcType,
    hasDynamicMultiplier, setHasDynamicMultiplier,
    requiresCollectToWin, setRequiresCollectToWin,
    hasCashCollectFeature, setHasCashCollectFeature,
    hasJackpot, setHasJackpot, jpConfig, setJpConfig,
    hasBidirectionalPaylines, setHasBidirectionalPaylines,
    hasAdjustableLines, setHasAdjustableLines
}) {

    return (
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mt-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-3">
                <Settings className="text-indigo-600" size={20} />
                <h3 className="text-base font-bold text-slate-800">特殊遊戲設定 (Q&A)</h3>
            </div>

            <div className="space-y-6">
                {/* Q1: Double Symbol */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold text-slate-800">1. 此遊戲有無雙重符號?</p>
                            <p className="text-xs text-slate-500 mt-1">雙重符號：1格符號作為2連線計算</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                            <button onClick={() => setHasDoubleSymbol(true)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${hasDoubleSymbol ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有</button>
                            <button onClick={() => setHasDoubleSymbol(false)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!hasDoubleSymbol ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                        </div>
                    </div>
                </div>

                {/* Q2: Full-Grid Multiplier */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold text-slate-800">2. 此遊戲有無全盤乘倍機制?</p>
                            <p className="text-xs text-slate-500 mt-1">將盤面贏分乘以某固定值。可以是單個格子 (EX. 迦羅寶石)，也可以是一排乘倍選亮的 (EX. 超級麻將)</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                            <button onClick={() => setHasMultiplierReel(true)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${hasMultiplierReel ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有</button>
                            <button onClick={() => setHasMultiplierReel(false)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!hasMultiplierReel ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                        </div>
                    </div>
                </div>

                {/* Q3: Multiplier Config */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold text-slate-800">3. 此遊戲是否有乘倍機制 (如附加在符號上的倍率)？</p>
                            <p className="text-xs text-slate-500 mt-1">選「有」將為全部符號自動衍生 _xN 乘倍版本。請選擇連續乘倍發生時的計算方式。</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                            <button onClick={() => { setMultiplierCalcType('product'); setHasDynamicMultiplier(true); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${multiplierCalcType === 'product' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有 (相乘)</button>
                            <button onClick={() => { setMultiplierCalcType('sum'); setHasDynamicMultiplier(true); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${multiplierCalcType === 'sum' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有 (相加)</button>
                            <button onClick={() => { setMultiplierCalcType('none'); setHasDynamicMultiplier(false); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${multiplierCalcType === 'none' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                        </div>
                    </div>
                </div>



                {/* Q4: Cash Collect Feature */}
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold text-slate-800">4. 此遊戲有無收集現金獎設定?</p>
                            <p className="text-xs text-slate-500 mt-1">EX. 會出現帶有數字的金幣，達成條件會收集數字做為贏分</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                            <button onClick={() => setHasCashCollectFeature(true)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${hasCashCollectFeature ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有</button>
                            <button onClick={() => { setHasCashCollectFeature(false); setRequiresCollectToWin(true); setHasJackpot(false); }} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!hasCashCollectFeature ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                        </div>
                    </div>
                </div>

                {/* Conditional Q4-1 & Q4-2 */}
                {hasCashCollectFeature && (
                    <div className="pl-6 border-l-2 border-indigo-200 space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                        {/* Q4-1 */}
                        <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div><p className="text-sm font-bold text-indigo-900">4-1. 收集金幣是否需要 COLLECT 符號?</p></div>
                                <div className="flex bg-white border border-indigo-200 p-0.5 rounded-lg shrink-0 shadow-sm">
                                    <button onClick={() => setRequiresCollectToWin(true)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${requiresCollectToWin ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有</button>
                                    <button onClick={() => setRequiresCollectToWin(false)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!requiresCollectToWin ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                                </div>
                            </div>
                        </div>

                        {/* Q4-2 */}
                        <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                <div>
                                    <p className="text-sm font-bold text-indigo-900">4-2. 收集金幣中是否有 JP 符號?</p>
                                    <p className="text-xs text-indigo-700 mt-1">若有，除了新增 Jackpot 倍率設定之外，還要在下方賠付表額外加入所有 JP 符號 (賠率皆設定0)</p>
                                </div>
                                <div className="flex bg-white border border-indigo-200 p-0.5 rounded-lg shrink-0 shadow-sm">
                                    <button onClick={() => setHasJackpot(true)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${hasJackpot ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有</button>
                                    <button onClick={() => setHasJackpot(false)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!hasJackpot ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                                </div>
                            </div>

                            {/* JP Configuration */}
                            {hasJackpot && (
                                <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-inner mt-4 animate-in fade-in slide-in-from-top-2">
                                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                                        <Trophy size={16} className="text-amber-500" /> Jackpot 倍率設定
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {Object.entries(jpConfig).map(([jpName, jpMult], idx) => (
                                            <div key={idx} className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition-colors shadow-sm relative group">
                                                <input
                                                    type="text" value={jpName}
                                                    onChange={(e) => {
                                                        const newName = e.target.value.toUpperCase();
                                                        setJpConfig(prev => {
                                                            const newConfig = {};
                                                            Object.keys(prev).forEach(k => {
                                                                if (k === jpName) newConfig[newName] = prev[k];
                                                                else newConfig[k] = prev[k];
                                                            });
                                                            return newConfig;
                                                        });
                                                    }}
                                                    className="w-full text-sm font-bold text-slate-700 outline-none uppercase border-b border-transparent hover:border-slate-300 focus:border-indigo-400 bg-transparent mb-2 placeholder:font-normal placeholder:lowercase placeholder:text-slate-300 pb-1"
                                                    placeholder="JP分類"
                                                />
                                                <input
                                                    type="number" step="any" value={jpMult}
                                                    onChange={(e) => setJpConfig(prev => ({ ...prev, [jpName]: e.target.value }))}
                                                    className="w-full text-lg font-black text-amber-600 outline-none bg-white border border-slate-200 hover:border-amber-300 px-2 py-1.5 rounded focus:ring-1 focus:ring-amber-400 transition-colors"
                                                    placeholder="倍率"
                                                />
                                                <button
                                                    onClick={() => setJpConfig(prev => { const c = { ...prev }; delete c[jpName]; return c; })}
                                                    className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-rose-600 focus:outline-none"
                                                    disabled={Object.keys(jpConfig).length <= 1}
                                                ><X size={12} /></button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => setJpConfig(prev => ({ ...prev, [`CUSTOM_${Object.keys(prev).length + 1}`]: "" }))}
                                            className="flex flex-col items-center justify-center bg-transparent border-2 border-dashed border-slate-300 rounded-lg p-3 hover:bg-slate-100 hover:border-slate-400 hover:text-indigo-600 transition-colors text-slate-400 min-h-[95px] w-full"
                                        >
                                            <Plus size={24} className="mb-1" />
                                            <span className="text-xs font-bold">新增 JP</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Q5: Bi-directional Paylines (only for paylines mode) */}
                {lineMode === 'paylines' && (
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-bold text-slate-800">5. 此遊戲是否支援雙向連線機制?</p>
                                <p className="text-xs text-slate-500 mt-1">雙向連線：同一條賠付線左至右與右至左皆可連線，並取最高獎金做為該線結果</p>
                            </div>
                            <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                                <button onClick={() => setHasBidirectionalPaylines(true)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${hasBidirectionalPaylines ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有</button>
                                <button onClick={() => setHasBidirectionalPaylines(false)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!hasBidirectionalPaylines ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Q6: Adjustable Line Count (only for paylines mode) */}
                {lineMode === 'paylines' && (
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm transition-all hover:border-indigo-300">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-bold text-slate-800">6. 此遊戲是否支援調整押注線數？(開啟此設定後，所有常規贏分都會自動除以啟用的線數，轉換為單線押注來計算)</p>
                                <p className="text-xs text-slate-500 mt-1">部分遊戲可只押注前 N 條連線（如 40 線只押 10 線），啟用後可在 P2 手動調整。<br />EX. 1000BET、10線 = 每條線 100BET，以此倍率去乘贏分</p>
                            </div>
                            <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
                                <button onClick={() => setHasAdjustableLines(true)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${hasAdjustableLines ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>有</button>
                                <button onClick={() => setHasAdjustableLines(false)} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!hasAdjustableLines ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>無</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
