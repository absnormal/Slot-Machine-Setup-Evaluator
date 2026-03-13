import React from 'react';
import { LayoutGrid, ChevronDown, ChevronUp, MousePointer2, RefreshCw, Paintbrush, Keyboard, Trash2, Zap, Trophy } from 'lucide-react';
import ResultView from './ResultView';
import { getBaseSymbol, getCashValue, isCashSymbol, isJpSymbol, formatShorthandValue } from '../utils/symbolUtils';

const Phase2Manual = ({
    template,
    isPhase2Minimized, setIsPhase2Minimized,
    handleRandomizePanel,
    panelInputMode, setPanelInputMode,
    activeBrush, setActiveBrush,
    availableSymbols,
    handleClearPanel,
    hoveredLineId, setHoveredLineId,
    calcResults, calculateError,
    showAllLines, setShowAllLines,
    betInput, setBetInput,
    panelGrid, handleCellChange,
    getSafeGrid
}) => {
    const [showCashModal, setShowCashModal] = React.useState(false);
    const [modalCell, setModalCell] = React.useState({ row: 0, col: 0 });
    const [cashValueInput, setCashValueInput] = React.useState('');

    const handleConfirmCashValue = () => {
        if (cashValueInput && activeBrush) {
            const baseBrush = getBaseSymbol(activeBrush, template?.jpConfig);
            const newSymbol = `${baseBrush}_${cashValueInput}`;
            handleCellChange(modalCell.row, modalCell.col, newSymbol);
        }
        setShowCashModal(false);
    };

    const handleGridCellClick = (r, c) => {
        if (panelInputMode !== 'paint') return;

        const isCash = isCashSymbol(activeBrush, template?.jpConfig);
        const isJP = isJpSymbol(activeBrush, template?.jpConfig);

        // If it's a regular CASH symbol (not a fixed-value JP), open the modal
        if (isCash && !isJP) {
            setModalCell({ row: r, col: c });
            // If the cell already has a value, use it as default
            const currentVal = getCashValue(panelGrid[r][c], template?.jpConfig);
            setCashValueInput(currentVal > 0 ? formatShorthandValue(currentVal) : '');
            setShowCashModal(true);
        } else {
            handleCellChange(r, c, activeBrush);
        }
    };
    return (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${!template ? 'opacity-30 pointer-events-none' : ''}`}>
            <div
                className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => template && setIsPhase2Minimized(!isPhase2Minimized)}
            >
                <div className="flex items-center space-x-2">
                    <LayoutGrid className="text-indigo-500" size={20} />
                    <h2 className="text-xl font-semibold text-slate-800">Phase 2: 手動盤面設定與結算 <span className="text-sm font-normal text-slate-400 ml-2">(透過畫筆或鍵盤微調盤面)</span></h2>
                </div>
                <div className="flex items-center space-x-4">
                    {isPhase2Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                </div>
            </div>

            {!isPhase2Minimized && (
                <div className="p-6 pt-0 border-t border-slate-100 mt-4 bg-slate-50">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="flex flex-col h-full">
                            <div className="bg-slate-900 p-5 sm:p-6 rounded-xl shadow-2xl border border-slate-800 flex flex-col flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 border-b border-slate-700 pb-4 gap-3">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-semibold flex items-center gap-2 text-white"><MousePointer2 className="text-indigo-400" size={20} />盤面設定</h2>
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

                                <div className="space-y-5">
                                    <div>
                                        {panelInputMode === 'paint' && (
                                            <div className="mb-4 bg-slate-800/80 border border-slate-700 rounded-lg p-3">
                                                <span className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">選擇畫筆 (點擊或拖曳下方網格填色)</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {availableSymbols.map(sym => {
                                                        const isCash = isCashSymbol(sym, template?.jpConfig);
                                                        const baseSym = getBaseSymbol(sym, template?.jpConfig);
                                                        const isActive = getBaseSymbol(activeBrush, template?.jpConfig) === baseSym;

                                                        return (
                                                            <button
                                                                key={sym}
                                                                onClick={() => {
                                                                    if (isCash && !isJpSymbol(sym, template?.jpConfig)) {
                                                                        if (!isActive) {
                                                                            setActiveBrush(sym);
                                                                        }
                                                                    } else {
                                                                        setActiveBrush(sym);
                                                                    }
                                                                }}
                                                                className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex items-center justify-center transition-all ${isActive ? 'border-indigo-400 bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                                                                title={isCash ? "點擊選擇金幣畫筆" : sym}
                                                            >
                                                                {template?.symbolImages?.[baseSym] ? (
                                                                    <React.Fragment>
                                                                        <img src={template.symbolImages[baseSym]} className="max-w-full max-h-full object-contain p-1" alt={baseSym} />
                                                                        {isActive && isCash && getCashValue(activeBrush, template?.jpConfig) > 0 && (
                                                                            <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-[10px] z-20 pointer-events-none">
                                                                                 {isJpSymbol(activeBrush, template?.jpConfig) ? getCashValue(activeBrush, template?.jpConfig) + 'x' : formatShorthandValue(getCashValue(activeBrush, template?.jpConfig))}
                                                                            </div>
                                                                        )}
                                                                    </React.Fragment>
                                                                ) : (
                                                                    <span className="text-[10px] sm:text-xs font-black leading-tight text-center px-1 text-slate-200">
                                                                         {isCash ? (isActive && getCashValue(activeBrush, template?.jpConfig) > 0 ? `💰${isJpSymbol(activeBrush, template?.jpConfig) ? getCashValue(activeBrush, template?.jpConfig) + 'x' : formatShorthandValue(getCashValue(activeBrush, template?.jpConfig))}` : '💰設定') : sym}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        )
                                                    })}
                                                    <button
                                                        onClick={() => setActiveBrush('')}
                                                        className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex items-center justify-center transition-all ${activeBrush === '' ? 'border-rose-400 bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                                                        title="橡皮擦 (點擊網格清空單格)"
                                                    >
                                                        <div className="w-5 h-5 border-2 border-rose-400 rounded-full flex items-center justify-center">
                                                            <div className="w-3 h-0.5 bg-rose-400 rotate-45"></div>
                                                        </div>
                                                    </button>

                                                    {/* 新增：乘倍輪專用畫筆 */}
                                                    {template?.hasMultiplierReel && (
                                                        <React.Fragment>
                                                            <div className="w-px h-10 bg-slate-700 mx-1 self-center"></div>
                                                            <button
                                                                onClick={() => {
                                                                    if (!activeBrush.startsWith('x')) {
                                                                        setActiveBrush('x2');
                                                                    }
                                                                }}
                                                                className={`relative w-[48px] h-[48px] sm:w-[52px] sm:h-[52px] rounded-lg border-2 flex flex-col items-center justify-center transition-all ${activeBrush.startsWith('x') ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.3)] scale-105 z-10' : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700'}`}
                                                                title="乘倍畫筆 (點擊最後一軸中間格子)"
                                                            >
                                                                <span className="text-[10px] font-bold text-amber-500 mb-0.5 leading-none">MULT</span>
                                                                <span className="text-sm font-black text-amber-400 leading-none">
                                                                    {activeBrush.startsWith('x') ? activeBrush : 'x?'}
                                                                </span>
                                                            </button>

                                                            {activeBrush.startsWith('x') && (
                                                                <div className="flex flex-col justify-center bg-amber-500/20 border border-amber-400/50 rounded-lg px-3 h-[48px] sm:h-[52px] animate-in fade-in slide-in-from-left-2 duration-200">
                                                                    <label className="text-[9px] font-bold text-amber-300 mb-0.5">設定乘倍數值</label>
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
                                        )}

                                        <div className="flex items-center h-8 mb-4">
                                            {hoveredLineId ? (
                                                <div className="flex items-center gap-2 text-indigo-300 text-sm font-bold bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/30 animate-in fade-in slide-in-from-left-2 duration-200 shadow-sm">
                                                    <Zap size={14} className="fill-indigo-400" />
                                                    <span>正在查看第 <span className="text-white text-base mx-0.5">{hoveredLineId}</span> 條連線軌跡</span>
                                                    {calcResults?.details?.find(d => d.lineId === hoveredLineId) && calcResults.details.find(d => d.lineId === hoveredLineId).winAmount > 0 && (
                                                        <span className="text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded ml-1 flex items-center gap-1">
                                                            <Trophy size={12} /> +{calcResults.details.find(d => d.lineId === hoveredLineId).winAmount.toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-slate-500 text-xs flex items-center gap-1.5 opacity-80">
                                                    <MousePointer2 size={14} />
                                                    <span>將滑鼠移至右側結算清單，即可在此預覽連線軌跡</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-3 sm:p-5 bg-black/40 border border-slate-800/80 rounded-xl overflow-x-auto shadow-inner select-none custom-scrollbar">
                                            <div className="flex flex-col gap-1.5 sm:gap-2 w-max mx-auto" onMouseLeave={() => setHoveredLineId(null)}>
                                                {getSafeGrid(panelGrid).map((row, rIndex) => (
                                                    <div key={rIndex} className="flex gap-1.5 sm:gap-2">
                                                        {row.map((symbol, cIndex) => {
                                                            let isWinSymbol = false;
                                                            let isOnLine = false;
                                                            if (calcResults) {
                                                                if (hoveredLineId) {
                                                                    const hoveredResult = calcResults.details.find(d => d.lineId === hoveredLineId);
                                                                    if (hoveredResult) {
                                                                        const isFeatureWin = String(hoveredResult.lineId).startsWith('SCATTER') || String(hoveredResult.lineId).startsWith('COLLECT');
                                                                        if (!isFeatureWin) {
                                                                            isOnLine = template.lines[hoveredResult.lineId]?.[cIndex] - 1 === rIndex;
                                                                        }
                                                                        isWinSymbol = hoveredResult.winCoords.some(c => c.row === rIndex && c.col === cIndex);
                                                                    }
                                                                } else {
                                                                    isWinSymbol = calcResults.details.some(d => d.winAmount > 0 && d.winCoords.some(c => c.row === rIndex && c.col === cIndex));
                                                                }
                                                            }

                                                            let cellClasses = "relative w-16 h-16 sm:w-[88px] sm:h-[72px] flex items-center justify-center rounded-lg overflow-hidden transition-all duration-300 font-black text-xl ";

                                                            if (hoveredLineId) {
                                                                if (isWinSymbol) cellClasses += "opacity-100 bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_0_20px_rgba(99,102,241,0.6)] z-10 scale-105 border-2 border-indigo-300 text-white";
                                                                else if (isOnLine) cellClasses += "opacity-40 grayscale scale-95 bg-slate-800 border border-slate-600 text-slate-300";
                                                                else cellClasses += "opacity-10 grayscale scale-90 bg-slate-900 border border-slate-800 text-slate-500";
                                                            } else {
                                                                if (isWinSymbol) cellClasses += "opacity-100 bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] z-10 scale-[1.02] border-2 border-indigo-300 text-white";
                                                                else cellClasses += "opacity-100 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-500 text-white shadow-inner";
                                                            }

                                                            const baseSym = getBaseSymbol(symbol, template?.jpConfig);
                                                            const cashVal = getCashValue(symbol, template?.jpConfig);

                                                            // === Multiplier Reel Constraints ===
                                                            const isMultiplierReelCol = template?.hasMultiplierReel && cIndex === template.cols - 1;
                                                            const isCenterRow = rIndex === Math.floor(template?.rows / 2);
                                                            const isDisabledMultiplierCell = isMultiplierReelCol && !isCenterRow;

                                                            if (isDisabledMultiplierCell) {
                                                                cellClasses += " opacity-20 pointer-events-none grayscale bg-slate-900 border-none";
                                                            }

                                                            const handleGridPaste = (e, targetRow, targetCol) => {
                                                                e.preventDefault();
                                                                const pastedData = e.clipboardData.getData('text');
                                                                if (!pastedData) return;

                                                                const lines = pastedData.trim().split(/\r?\n/);
                                                                const newGrid = panelGrid.map(row => [...row]);

                                                                for (let i = 0; i < lines.length; i++) {
                                                                    const symbols = lines[i].trim().split(/\s+/);
                                                                    for (let j = 0; j < symbols.length; j++) {
                                                                        const r = targetRow + i;
                                                                        const c = targetCol + j;
                                                                        if (r < template?.rows && c < template?.cols) {
                                                                            newGrid[r][c] = symbols[j];
                                                                        }
                                                                    }
                                                                }

                                                                newGrid.forEach((row, ri) => {
                                                                    row.forEach((sym, ci) => {
                                                                        if (sym !== panelGrid[ri][ci]) {
                                                                            handleCellChange(ri, ci, sym);
                                                                        }
                                                                    });
                                                                });
                                                            };

                                                            return (
                                                                <div
                                                                    key={cIndex}
                                                                    className={`${cellClasses} ${panelInputMode === 'paint' && !isDisabledMultiplierCell ? 'cursor-pointer' : ''}`}
                                                                    onMouseDown={(e) => { if (panelInputMode === 'paint' && !isDisabledMultiplierCell) { e.preventDefault(); handleGridCellClick(rIndex, cIndex); } }}
                                                                    onMouseEnter={(e) => { if (panelInputMode === 'paint' && e.buttons === 1 && !isDisabledMultiplierCell) handleGridCellClick(rIndex, cIndex); }}
                                                                >
                                                                    {panelInputMode === 'text' && !isDisabledMultiplierCell ? (
                                                                        <input
                                                                            id={`cell-${rIndex}-${cIndex}`}
                                                                            value={symbol}
                                                                            placeholder="空"
                                                                            onFocus={(e) => e.target.select()}
                                                                            onChange={(e) => handleCellChange(rIndex, cIndex, e.target.value)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === 'ArrowUp') { e.preventDefault(); document.getElementById(`cell-${rIndex - 1}-${cIndex}`)?.focus(); }
                                                                                else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); document.getElementById(`cell-${rIndex + 1}-${cIndex}`)?.focus(); }
                                                                                else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) document.getElementById(`cell-${rIndex}-${cIndex + 1}`)?.focus();
                                                                                else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) document.getElementById(`cell-${rIndex}-${cIndex - 1}`)?.focus();
                                                                            }}
                                                                            onPaste={(e) => handleGridPaste(e, rIndex, cIndex)}
                                                                            className={`w-full h-full text-center font-black text-base sm:text-lg bg-transparent outline-none placeholder:text-slate-600 placeholder:font-normal ${isWinSymbol ? 'text-white' : 'text-slate-100'}`}
                                                                        />
                                                                    ) : (
                                                                        symbol ? (
                                                                            template?.symbolImages?.[baseSym] ? (
                                                                                <React.Fragment>
                                                                                    <img src={template.symbolImages[baseSym]} className={`max-w-full max-h-full object-contain p-1.5 drop-shadow-md pointer-events-none select-none ${isCashSymbol(symbol, template?.jpConfig) ? 'opacity-80' : ''}`} draggable={false} alt={baseSym} />
                                                                                     {cashVal > 0 && <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-sm sm:text-base z-20 pointer-events-none">{isJpSymbol(symbol, template?.jpConfig) ? cashVal + 'x' : formatShorthandValue(cashVal)}</div>}
                                                                                </React.Fragment>
                                                                            ) : (
                                                                                <span className="z-10 pointer-events-none select-none drop-shadow-md text-sm sm:text-xl">
                                                                                     {isCashSymbol(symbol, template?.jpConfig) && cashVal > 0 ? `💰${isJpSymbol(symbol, template?.jpConfig) ? cashVal + 'x' : formatShorthandValue(cashVal)}` : baseSym}
                                                                                </span>
                                                                            )
                                                                        ) : (
                                                                            <div className="w-2 h-2 rounded-full bg-slate-600/50 pointer-events-none"></div>
                                                                        )
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Phase 2 專屬結算 UI */}
                        <ResultView template={template} calcData={calcResults} calcErr={calculateError} hoveredId={hoveredLineId} setHoveredId={setHoveredLineId} showAll={showAllLines} setShowAll={setShowAllLines} betInput={betInput} setBetInput={setBetInput} />
                    </div>
                </div>
            )}
            {/* Cash Value Modal */}
            {showCashModal && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[10000] animate-in fade-in duration-200">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-700 bg-slate-800/50 flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                                <Zap className="text-indigo-400" size={20} />
                            </div>
                            <div>
                                <h3 className="text-white font-bold">設定金幣數值</h3>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-slate-400 text-xs font-bold mb-2 uppercase tracking-wider">實際面額</label>
                                <div className="relative">
                                     <input
                                         autoFocus
                                         type="text"
                                         value={cashValueInput}
                                         onChange={(e) => setCashValueInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleConfirmCashValue();
                                            if (e.key === 'Escape') setShowCashModal(false);
                                        }}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-2xl font-black focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                         placeholder="例如:10、3.5M、2.5K"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {[0.5, 1, 2, 5, 10, 20, 50, 100].map(v => (
                                    <button
                                        key={v}
                                        onClick={() => setCashValueInput(String(v))}
                                        className="py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-colors border border-slate-600"
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-end gap-3">
                            <button onClick={() => setShowCashModal(false)} className="px-4 py-2 text-slate-400 font-bold text-sm hover:text-slate-200 transition-colors">取消</button>
                            <button onClick={handleConfirmCashValue} className="px-8 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95">確認設定</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Phase2Manual;
