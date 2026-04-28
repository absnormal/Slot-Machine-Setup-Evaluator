import React, { useState, useEffect, useRef } from 'react';
import { Settings, Trophy, Plus, X } from 'lucide-react';

/**
 * JP 卡片子元件：名稱使用本地 state，僅 onBlur 時提交，
 * 避免每次打字都重建 jpConfig 導致卡片重新排列。
 */
function JpCard({ jpName, jpMult, onNameChange, onMultChange, onDelete, canDelete }) {
    const [localName, setLocalName] = useState(jpName);

    // 外部 jpConfig 變動時同步（例如重設模板）
    useEffect(() => { setLocalName(jpName); }, [jpName]);

    const commitName = () => {
        const trimmed = localName.trim();
        if (trimmed !== jpName) {
            onNameChange(trimmed);
        }
    };

    return (
        <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition-colors shadow-sm relative group">
            <input
                type="text" value={localName}
                onChange={(e) => setLocalName(e.target.value.toUpperCase())}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                className="w-full text-sm font-bold text-slate-700 outline-none uppercase border-b border-transparent hover:border-slate-300 focus:border-indigo-400 bg-transparent mb-2 placeholder:font-normal placeholder:lowercase placeholder:text-slate-300 pb-1"
                placeholder="JP分類"
            />
            <input
                type="number" step="any" value={jpMult}
                onChange={(e) => onMultChange(e.target.value)}
                className="w-full text-lg font-black text-amber-600 outline-none bg-white border border-slate-200 hover:border-amber-300 px-2 py-1.5 rounded focus:ring-1 focus:ring-amber-400 transition-colors"
                placeholder="倍率"
            />
            <button
                onClick={onDelete}
                className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-rose-600 focus:outline-none"
                disabled={!canDelete}
            ><X size={12} /></button>
        </div>
    );
}

/**
 * JP 設定面板：使用 cardOrder ref 自行追蹤卡片順序，
 * 完全不依賴 Object.entries() 的排列，徹底解決 JS 物件 key 重排問題。
 */
function JpConfigPanel({ jpConfig, setJpConfig }) {
    const nextId = useRef(0);
    // 自行管理的順序陣列：[{ id: number, key: string }, ...]
    const cardOrder = useRef(null);

    // 首次掛載時，從 jpConfig 建立初始順序
    if (cardOrder.current === null) {
        cardOrder.current = Object.keys(jpConfig).map(k => ({
            id: nextId.current++,
            key: k
        }));
    }

    // 同步：處理外部變動（如雲端載入導致 jpConfig 整體替換）
    const currentKeys = new Set(Object.keys(jpConfig));
    const trackedKeys = new Set(cardOrder.current.map(c => c.key));
    // 移除已不存在的 key
    cardOrder.current = cardOrder.current.filter(c => currentKeys.has(c.key));
    // 追加新增的 key（保持新 key 在尾端）
    for (const k of currentKeys) {
        if (!trackedKeys.has(k)) {
            cardOrder.current.push({ id: nextId.current++, key: k });
        }
    }

    return (
        <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-inner mt-4 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                <Trophy size={16} className="text-amber-500" /> Jackpot 倍率設定
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {cardOrder.current.map((card) => (
                    <JpCard
                        key={card.id}
                        jpName={card.key}
                        jpMult={jpConfig[card.key] ?? ''}
                        onNameChange={(newName) => {
                            const oldKey = card.key;
                            // 1. 先更新 ref 中的 key（保持位置不動）
                            card.key = newName;
                            // 2. 再更新 jpConfig（使用 cardOrder 的順序重建）
                            setJpConfig(prev => {
                                const newConfig = {};
                                cardOrder.current.forEach(c => {
                                    if (c.key === newName) {
                                        newConfig[newName] = prev[oldKey] ?? '';
                                    } else {
                                        newConfig[c.key] = prev[c.key] ?? '';
                                    }
                                });
                                return newConfig;
                            });
                        }}
                        onMultChange={(val) => setJpConfig(prev => ({ ...prev, [card.key]: val }))}
                        onDelete={() => {
                            const delKey = card.key;
                            // 1. 先從 ref 移除
                            cardOrder.current = cardOrder.current.filter(c => c.key !== delKey);
                            // 2. 再更新 jpConfig
                            setJpConfig(prev => { const c = { ...prev }; delete c[delKey]; return c; });
                        }}
                        canDelete={cardOrder.current.length > 1}
                    />
                ))}
                <button
                    onClick={() => {
                        const newKey = `CUSTOM_${(cardOrder.current.length || 0) + 1}`;
                        cardOrder.current.push({ id: nextId.current++, key: newKey });
                        setJpConfig(prev => ({ ...prev, [newKey]: "" }));
                    }}
                    className="flex flex-col items-center justify-center bg-transparent border-2 border-dashed border-slate-300 rounded-lg p-3 hover:bg-slate-100 hover:border-slate-400 hover:text-indigo-600 transition-colors text-slate-400 min-h-[95px] w-full"
                >
                    <Plus size={24} className="mb-1" />
                    <span className="text-xs font-bold">新增 JP</span>
                </button>
            </div>
        </div>
    );
}

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
                                <JpConfigPanel jpConfig={jpConfig} setJpConfig={setJpConfig} />
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
