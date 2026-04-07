import React from 'react';
import { LayoutGrid, ChevronDown, ChevronUp, MousePointer2, Zap, Trophy } from 'lucide-react';
import ResultView from './ResultView';
import { BrushToolbar, BrushPalette } from './phase2/BrushToolbar';
import CashValueModal from './modals/CashValueModal';
import { getBaseSymbol, getCashValue, isCashSymbol, isJpSymbol, formatShorthandValue, isDoubleSymbol, getSymbolMultiplier, getCollectValue, getSymbolDisplayImage, isDynamicMultiplierSymbol } from '../utils/symbolUtils';

const Phase2Manual = ({
    template,
    isPhase2Minimized, setIsPhase2Minimized,
    onToggle,
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
    getSafeGrid,
    onReturn,
    totalBalance, setTotalBalance,
    setTemplateMessage,
    isBalanceExpanded, setIsBalanceExpanded
}) => {
    const [showCashModal, setShowCashModal] = React.useState(false);
    const [modalCell, setModalCell] = React.useState({ row: 0, col: 0 });
    const [cashValueInput, setCashValueInput] = React.useState('');

    const handleConfirmCashValue = () => {
        if (cashValueInput && activeBrush) {
            const isDouble = activeBrush.toLowerCase().endsWith('_double');
            let baseBrush = getBaseSymbol(activeBrush, template?.jpConfig);
            let newSymbol = `${baseBrush}_${cashValueInput}${isDouble ? '_double' : ''}`;
            if (template?.hasDynamicMultiplier && isDynamicMultiplierSymbol(activeBrush)) {
                newSymbol = `x${cashValueInput}`;
            }
            handleCellChange(modalCell.row, modalCell.col, newSymbol);
        }
        setShowCashModal(false);
    };

    const handleGridCellClick = (r, c) => {
        if (panelInputMode !== 'paint') return;
        const isCash = isCashSymbol(activeBrush, template?.jpConfig);
        const isJP = isJpSymbol(activeBrush, template?.jpConfig);
        const isDynamic = template?.hasDynamicMultiplier && isDynamicMultiplierSymbol(activeBrush);

        if ((isCash && !isJP) || isDynamic) {
            setModalCell({ row: r, col: c });
            if (isDynamic) {
                const currentVal = getSymbolMultiplier(panelGrid[r][c]);
                setCashValueInput(currentVal > 1 ? String(currentVal) : '');
            } else {
                const currentVal = getCashValue(panelGrid[r][c], template?.jpConfig);
                setCashValueInput(currentVal > 0 ? formatShorthandValue(currentVal) : '');
            }
            setShowCashModal(true);
        } else {
            handleCellChange(r, c, activeBrush);
        }
    };

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
                if (sym !== panelGrid[ri][ci]) handleCellChange(ri, ci, sym);
            });
        });
    };

    return (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${!template ? 'opacity-30 pointer-events-none' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-5">
                <div className="flex items-center space-x-2 cursor-pointer group" onClick={() => template && onToggle()}>
                    <LayoutGrid className="text-indigo-500 group-hover:scale-110 transition-transform" size={20} />
                    <h2 className="text-xl font-semibold text-slate-800">Phase 2: 手動盤面設定與結算 <span className="text-sm font-normal text-slate-400 ml-2">(透過畫筆或鍵盤微調盤面)</span></h2>
                </div>
                <div className="flex items-center space-x-4">
                    <button
                        onClick={(e) => { e.stopPropagation(); onReturn(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all active:scale-95 border border-slate-200"
                    >
                        <ChevronDown size={14} /> 返回 AI 辨識 (↓)
                    </button>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <div className="cursor-pointer p-1 hover:bg-slate-100 rounded-full transition-colors" onClick={() => { if(template) { if(!isPhase2Minimized) { onReturn(); } else { onToggle(); } } }}>
                        {isPhase2Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                    </div>
                </div>
            </div>

            {!isPhase2Minimized && (
                <div className="p-6 pt-0 border-t border-slate-100 mt-4 bg-slate-50">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="flex flex-col h-full">
                            <div className="bg-slate-900 p-5 sm:p-6 rounded-xl shadow-2xl border border-slate-800 flex flex-col flex-1">
                                <BrushToolbar
                                    template={template}
                                    panelInputMode={panelInputMode} setPanelInputMode={setPanelInputMode}
                                    activeBrush={activeBrush} setActiveBrush={setActiveBrush}
                                    availableSymbols={availableSymbols}
                                    handleRandomizePanel={handleRandomizePanel} handleClearPanel={handleClearPanel}
                                />

                                <div className="space-y-5">
                                    <div>
                                        <BrushPalette
                                            template={template}
                                            panelInputMode={panelInputMode}
                                            activeBrush={activeBrush} setActiveBrush={setActiveBrush}
                                            availableSymbols={availableSymbols}
                                            handleClearPanel={handleClearPanel}
                                        />

                                        {/* Line Hover Indicator */}
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

                                        {/* Grid */}
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
                                                                        if (!isFeatureWin) isOnLine = template.lines[hoveredResult.lineId]?.[cIndex] - 1 === rIndex;
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
                                                            const isGridSymCash = isCashSymbol(symbol, template?.jpConfig);
                                                            const isGridSymCollect = symbol && symbol.toUpperCase().includes('COLLECT');
                                                            const cashVal = isGridSymCash ? getCashValue(symbol, template?.jpConfig) : (isGridSymCollect ? getCollectValue(symbol) : 0);
                                                            const isMultiplierReelCol = template?.hasMultiplierReel && cIndex === template.cols - 1;
                                                            const isDisabledMultiplierCell = false;

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
                                                                            (() => {
                                                                                const displayImg = getSymbolDisplayImage(symbol, template?.symbolImages, template?.jpConfig);
                                                                                const isCellDynamic = (template?.hasDynamicMultiplier || template?.hasMultiplierReel) && isDynamicMultiplierSymbol(symbol);
                                                                                const multVal = isCellDynamic ? getSymbolMultiplier(symbol) : 1;

                                                                                return displayImg ? (
                                                                                    <React.Fragment>
                                                                                        <img src={displayImg} className={`max-w-full max-h-full object-contain p-1.5 drop-shadow-md pointer-events-none select-none ${(isGridSymCash || isGridSymCollect || isCellDynamic) ? 'opacity-80' : ''}`} draggable={false} alt={symbol} />
                                                                                        {cashVal > 0 && <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-sm sm:text-base z-20 pointer-events-none">{isJpSymbol(symbol, template?.jpConfig) ? cashVal + 'x' : formatShorthandValue(cashVal)}</div>}
                                                                                        {isCellDynamic && <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,1)] text-sm sm:text-base z-20 pointer-events-none">{multVal > 1 ? `x${multVal}` : 'xN'}</div>}
                                                                                    </React.Fragment>
                                                                                ) : (
                                                                                    <span className="z-10 pointer-events-none select-none drop-shadow-md text-sm sm:text-xl flex flex-col items-center">
                                                                                        {(isGridSymCash || isGridSymCollect) && cashVal > 0 ? `💰${isJpSymbol(symbol, template?.jpConfig) ? cashVal + 'x' : formatShorthandValue(cashVal)}` : (isCellDynamic ? (multVal > 1 ? `x${multVal}` : 'xN') : baseSym)}
                                                                                        {symbol.toLowerCase().endsWith('_double') && <span className="text-[8px] sm:text-[10px] text-indigo-300 font-black mt-1">DOUBLE</span>}
                                                                                    </span>
                                                                                );
                                                                            })()
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

                        {/* ResultView */}
                        <ResultView template={template} calcData={calcResults} calcErr={calculateError} hoveredId={hoveredLineId} setHoveredId={setHoveredLineId} showAll={showAllLines} setShowAll={setShowAllLines} betInput={betInput} setBetInput={setBetInput} totalBalance={totalBalance} setTotalBalance={setTotalBalance} setTemplateMessage={setTemplateMessage} isBalanceExpanded={isBalanceExpanded} setIsBalanceExpanded={setIsBalanceExpanded} />
                    </div>
                </div>
            )}

            {/* Cash Value Modal */}
            <CashValueModal
                show={showCashModal}
                onClose={() => setShowCashModal(false)}
                onConfirm={handleConfirmCashValue}
                cashValueInput={cashValueInput}
                setCashValueInput={setCashValueInput}
                template={template}
                activeBrush={activeBrush}
            />
        </div>
    );
};

export default Phase2Manual;
