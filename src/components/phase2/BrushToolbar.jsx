import React from 'react';
import { Paintbrush, Keyboard, RefreshCw, Trash2 } from 'lucide-react';
import { isCashSymbol, isJpSymbol, getCashValue, getBaseSymbol, isDoubleSymbol, getSymbolMultiplier, getSymbolDisplayImage, isDynamicMultiplierSymbol, formatShorthandValue } from '../../utils/symbolUtils';

/**
 * 畫筆工具列 (Paint Mode)
 * 從 Phase2Manual.jsx 抽出，包含符號畫筆、橡皮擦、乘倍器、清除按鈕
 */
const BrushToolbar = ({
    template,
    panelInputMode, setPanelInputMode,
    activeBrush, setActiveBrush,
    availableSymbols,
    handleRandomizePanel, handleClearPanel,
}) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 border-b border-slate-700 pb-4 gap-3">
        <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold flex items-center gap-2 text-white">
                <span className="text-indigo-400"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg></span>
                盤面設定
            </h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
            {template && (
                <button onClick={handleRandomizePanel} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-indigo-400 hover:bg-slate-700 hover:text-indigo-300 rounded-lg text-sm font-bold transition-colors border border-slate-700 shadow-sm shrink-0">
                    <RefreshCw size={14} />隨機盤面
                </button>
            )}
            <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 shrink-0">
                <button onClick={() => setPanelInputMode('paint')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${panelInputMode === 'paint' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                    <Paintbrush size={14} /> 畫筆
                </button>
                <button onClick={() => setPanelInputMode('text')} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${panelInputMode === 'text' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                    <Keyboard size={14} /> 鍵盤
                </button>
            </div>
        </div>
    </div>
);

/**
 * 畫筆選擇器面板 (在 paint mode 時顯示)
 */
const BrushPalette = ({ template, panelInputMode, activeBrush, setActiveBrush, availableSymbols, handleClearPanel }) => {
    if (panelInputMode !== 'paint') return null;

    return (
        <div className="mb-4 bg-slate-800/80 border border-slate-700 rounded-lg p-3">
            <span className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">選擇畫筆 (點擊或拖曳下方網格填色)</span>
            <div className="flex flex-wrap gap-2">
                {availableSymbols.filter(sym => {
                    const hasImage = template?.symbolImages?.[sym];
                    const isBase = !sym.includes('_x') && !sym.includes('_double');
                    return hasImage || isBase;
                }).map(sym => {
                    const isCash = isCashSymbol(sym, template?.jpConfig);
                    const isDynamic = template?.hasDynamicMultiplier && isDynamicMultiplierSymbol(sym);
                    const baseSym = getBaseSymbol(sym, template?.jpConfig);
                    const isActive = getBaseSymbol(activeBrush, template?.jpConfig) === baseSym &&
                        isDoubleSymbol(activeBrush) === isDoubleSymbol(sym) &&
                        getSymbolMultiplier(activeBrush) === getSymbolMultiplier(sym);
                    const brushDisplayImg = getSymbolDisplayImage(sym, template?.symbolImages, template?.jpConfig);

                    return (
                        <button
                            key={sym}
                            onClick={() => {
                                if ((isCash && !isJpSymbol(sym, template?.jpConfig)) || isDynamic) {
                                    if (!isActive) setActiveBrush(sym);
                                } else {
                                    setActiveBrush(sym);
                                }
                            }}
                            className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex items-center justify-center transition-all ${isActive ? 'border-indigo-400 bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                            title={isCash ? "點擊選擇金幣畫筆" : (isDynamic ? "點擊設定乘倍數值" : sym)}
                        >
                            {brushDisplayImg ? (
                                <React.Fragment>
                                    <img src={brushDisplayImg} className={`max-w-full max-h-full object-contain p-1 ${(isActive && (isCash || isDynamic)) ? 'opacity-80' : ''}`} alt={sym} />
                                    {isActive && isCash && getCashValue(activeBrush, template?.jpConfig) > 0 && (
                                        <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-[10px] z-20 pointer-events-none">
                                            {isJpSymbol(activeBrush, template?.jpConfig) ? getCashValue(activeBrush, template?.jpConfig) + 'x' : formatShorthandValue(getCashValue(activeBrush, template?.jpConfig))}
                                        </div>
                                    )}
                                    {isDynamic && (
                                        <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-[10px] z-20 pointer-events-none">
                                            {(isActive && getSymbolMultiplier(activeBrush) > 1) ? `x${getSymbolMultiplier(activeBrush)}` : 'xN'}
                                        </div>
                                    )}
                                    {sym.toLowerCase().endsWith('_double') && (
                                        <div className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[8px] font-black px-1 rounded-sm shadow-sm border border-indigo-400 z-30">
                                            2X
                                        </div>
                                    )}
                                </React.Fragment>
                            ) : (
                                <span className="text-[10px] sm:text-xs font-black leading-tight text-center px-1 text-slate-200">
                                    {isCash ? (isActive && getCashValue(activeBrush, template?.jpConfig) > 0 ? `💰${isJpSymbol(activeBrush, template?.jpConfig) ? getCashValue(activeBrush, template?.jpConfig) + 'x' : formatShorthandValue(getCashValue(activeBrush, template?.jpConfig))}` : '💰設定') : (isDynamic ? (isActive && getSymbolMultiplier(activeBrush) > 1 ? `x${getSymbolMultiplier(activeBrush)}` : 'xN') : sym)}
                                    {sym.toLowerCase().endsWith('_double') && <div className="text-[8px] text-indigo-400 mt-0.5">DOUBLE</div>}
                                </span>
                            )}
                        </button>
                    );
                })}

                {/* Eraser */}
                <button
                    onClick={() => setActiveBrush('')}
                    className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex items-center justify-center transition-all ${activeBrush === '' ? 'border-rose-400 bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                    title="橡皮擦 (點擊網格清空單格)"
                >
                    <div className="w-5 h-5 border-2 border-rose-400 rounded-full flex items-center justify-center">
                        <div className="w-3 h-0.5 bg-rose-400 rotate-45"></div>
                    </div>
                </button>

                {/* Multiplier Reel Brush */}
                {template?.hasMultiplierReel && (
                    <React.Fragment>
                        <div className="w-px h-10 bg-slate-700 mx-1 self-center"></div>
                        <button
                            onClick={() => {
                                if (!activeBrush.startsWith('x')) setActiveBrush('x2');
                            }}
                            className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex flex-col items-center justify-center transition-all ${activeBrush.startsWith('x') ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                            title="全盤乘倍畫筆 (點擊對應格子)"
                        >
                            <span className="text-[10px] font-bold text-amber-500 mb-0.5 leading-none">MULT</span>
                            <span className="text-sm font-black text-amber-400 leading-none">
                                {activeBrush.startsWith('x') ? activeBrush : 'x?'}
                            </span>
                        </button>

                        {activeBrush.startsWith('x') && (
                            <div className="flex flex-col justify-center bg-amber-500/20 border border-amber-400/50 rounded-lg px-3 h-[48px] sm:h-[52px] animate-in fade-in slide-in-from-left-2 duration-200">
                                <label className="text-[9px] font-bold text-amber-300 mb-0.5">設定倍數值</label>
                                <div className="flex items-center gap-1">
                                    <span className="text-amber-400 font-bold text-xs italic">x</span>
                                    <input
                                        type="number"
                                        step="any"
                                        value={activeBrush.substring(1) || ''}
                                        onChange={(e) => setActiveBrush(`x${e.target.value}`)}
                                        className="w-16 px-1.5 py-0.5 text-xs font-black text-amber-900 bg-amber-50 hover:bg-white focus:bg-white rounded outline-none text-center focus:ring-2 focus:ring-amber-400 transition-all shadow-inner"
                                        placeholder="數值"
                                    />
                                </div>
                            </div>
                        )}
                    </React.Fragment>
                )}

                <div className="w-px h-10 bg-slate-700 mx-1 self-center"></div>

                {/* Clear Button */}
                <button
                    onClick={handleClearPanel}
                    className="relative px-3 h-[48px] sm:h-[52px] rounded-lg border-2 border-slate-600 bg-slate-800 hover:border-rose-400 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex flex-col items-center justify-center transition-all group shadow-sm"
                    title="一鍵清除整個盤面"
                >
                    <Trash2 size={18} className="group-active:scale-90 transition-transform mb-0.5" />
                    <span className="text-[10px] font-bold leading-none">清除盤面</span>
                </button>
            </div>
        </div>
    );
};

export { BrushToolbar, BrushPalette };
