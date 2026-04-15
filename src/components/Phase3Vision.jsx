import React, { useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronUp, X, Upload, ImageIcon, Trash2, ChevronLeft, ChevronRight, ListChecks, Loader2, StopCircle, AlertCircle, Trophy, Monitor, RotateCcw } from 'lucide-react';
import ResultView from './ResultView';
import { getBaseSymbol, getCashValue, isCashSymbol, formatShorthandValue, isJpSymbol, getCollectValue, getSymbolDisplayImage, isDynamicMultiplierSymbol, getSymbolMultiplier } from '../utils/symbolUtils';
import { buildReferenceIndex, matchCell } from '../engine/localBoardRecognizer';

export default function Phase3Vision({
    template,
    isPhase3Minimized, setIsPhase3Minimized,
    onToggle,
    visionImages, activeVisionId, setActiveVisionId, removeVisionImage, resetVisionImage, handleVisionImageUpload,
    activeVisionImg, visionContainerRef, visionCanvasRef,
    handleVisionMouseDown, handleVisionMouseMove, handleVisionMouseUp,
    goToPrevVisionImage, goToNextVisionImage,
    isVisionProcessing, performAIVisionBatchMatching,
    performLocalVisionBatchMatching, ocrDecimalPlaces,
    isVisionStopping, visionBatchProgress, cancelVisionProcessing,
    visionGrid, visionError, visionCalcResults, visionCalculateError,
    getSafeGrid, betInput, setBetInput,
    hasBetBox, setHasBetBox,
    onTransfer,
    hasApiKey,
    totalBalance, setTotalBalance,
    setTemplateMessage,
    isBalanceExpanded, setIsBalanceExpanded
}) {
    // 獨立管理 Phase 3 專屬的 ResultView 懸停與線條顯示狀態
    const [visionHoveredLineId, setVisionHoveredLineId] = useState(null);
    const [visionShowAllLines, setVisionShowAllLines] = useState(false);

    const handleSingleCellTestUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !template || !template.symbolImagesAll) return;

        try {
            // 讀取圖片建立 ImageData
            const img = new Image();
            const url = URL.createObjectURL(file);
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = 64; // MATCH_SIZE
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 64, 64);
            const imageData = ctx.getImageData(0, 0, 64, 64);
            
            // 載入即時參照表
            const refIndex = await buildReferenceIndex(template.symbolImagesAll);
            
            // 辨識單格
            const result = matchCell(imageData, refIndex);
            
            alert(`【單格測試結果】\n判斷符號：${result.symbol}\n信心度：${result.confidence}%\nSSIM 分數：${result.mse} (極限值 1.0)`);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("單格測試失敗", err);
            alert("測試失敗：" + err.message);
        }
        e.target.value = '';
    };

    return (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${!template ? 'opacity-60 pointer-events-none' : ''}`}>
            <div
                className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => { if(template) { if(!isPhase3Minimized) { onTransfer(); } else { onToggle(); } } }}
            >
                <div className="flex items-center space-x-2">
                    <BrainCircuit className="text-indigo-500" size={20} />
                    <h2 className="text-xl font-semibold text-slate-800">Phase 3: AI 實機截圖辨識 <span className="text-sm font-normal text-slate-500 ml-2">(支援多圖批次自動結算)</span></h2>
                </div>
                <div className="flex items-center space-x-4">
                    {isPhase3Minimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                </div>
            </div>

            {/* Main Content Area - Hidden using CSS when minimized */}
            <div className={`p-6 pt-0 border-t border-slate-100 mt-4 bg-slate-50 ${isPhase3Minimized ? 'hidden' : ''}`}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="flex flex-col h-full">
                        <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col h-full">

                            {/* Phase 3 頂部：多圖縮圖列與上傳 */}
                            {visionImages.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto p-3 bg-slate-950 border-b border-slate-800 shrink-0 custom-scrollbar z-20">
                                    {visionImages.map((img, idx) => (
                                        <div
                                            key={img.id}
                                            onClick={() => setActiveVisionId(img.id)}
                                            className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all
                                                ${activeVisionId === img.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] scale-105' : 'border-transparent opacity-60 hover:opacity-100'}
                                                ${img.grid ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-slate-950' : ''}`}
                                        >
                                            <img src={img.previewUrl} className="w-full h-full object-cover" />
                                            {/* 狀態標籤 */}
                                            {img.grid && <div className="absolute top-0 left-0 bg-emerald-500 text-white text-[8px] px-1 font-bold rounded-br z-10">已辨識</div>}
                                            {img.error && <div className="absolute top-0 left-0 bg-rose-500 text-white text-[8px] px-1 font-bold rounded-br z-10">失敗</div>}
                                            <button onClick={(e) => { e.stopPropagation(); removeVisionImage(img.id); }} className="absolute top-0 right-0 bg-rose-500 text-white p-0.5 rounded-bl-lg hover:bg-rose-600 transition-colors z-10">
                                                <X size={12} />
                                            </button>
                                            {img.grid && (
                                                <button onClick={(e) => { e.stopPropagation(); resetVisionImage(img.id); }} className="absolute bottom-0 left-0 bg-amber-500 text-white p-0.5 rounded-tr-lg hover:bg-amber-400 transition-colors z-10" title="還原到辨識前">
                                                    <RotateCcw size={10} />
                                                </button>
                                            )}
                                            <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1.5 font-bold rounded-tl-md z-10">{idx + 1}</div>
                                        </div>
                                    ))}
                                    <label className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-slate-500 text-slate-400 transition-colors" title="上傳更多圖片">
                                        <Upload size={20} className="mb-1" />
                                        <span className="text-[10px]">新增</span>
                                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleVisionImageUpload} />
                                    </label>
                                </div>
                            )}

                            {!activeVisionImg ? (
                                <div className="p-8 text-center flex flex-col items-center justify-center flex-1 min-h-[300px]">
                                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 border border-slate-700 shadow-inner">
                                        <ImageIcon size={32} className="text-indigo-400" />
                                    </div>
                                    <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-bold transition shadow-lg flex items-center gap-2">
                                        <Upload size={20} /> 批次上傳實機截圖 (可多選)
                                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleVisionImageUpload} />
                                    </label>
                                    <p className="mt-4 text-sm text-slate-400 max-w-md leading-relaxed">
                                        上傳多張截圖，共用一個裁切範圍，由 AI 自動為您「批次辨識盤面」並產出結算結果。<br />
                                        <span className="text-emerald-400 font-bold inline-block mt-1">優勢：不受灰階、變暗或些微特效干擾，容錯率極高！</span>
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col flex-1">
                                    <div className="p-3 border-b border-slate-800 bg-slate-950 flex justify-between items-center shrink-0">
                                        <div className="flex flex-col gap-0.5 px-2 text-sm text-slate-300">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 bg-emerald-500 border border-slate-400 rounded-sm shrink-0"></div>
                                                <span>請調整綠色框線對齊「遊戲盤面」 (將套用至所有圖片)</span>
                                            </div>
                                            {template?.hasMultiplierReel && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 bg-amber-500 border border-slate-400 rounded-sm shrink-0"></div>
                                                    <span className="text-amber-400 font-bold">請調整琥珀色框線對齊「全盤乘倍格」</span>
                                                </div>
                                            )}
                                            {template?.hasBetBox && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 bg-cyan-400 border border-slate-400 rounded-sm shrink-0"></div>
                                                    <span className="text-cyan-400 font-bold">請調整青色框線對齊「押注金額 (BET)」區域</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer group px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">
                                                <input
                                                    type="checkbox"
                                                    checked={hasBetBox}
                                                    onChange={e => setHasBetBox(e.target.checked)}
                                                    className="w-4 h-4 text-cyan-500 border-cyan-300 rounded focus:ring-cyan-500 transition-all"
                                                />
                                                <span className="text-xs font-bold text-cyan-400">🎯 啟用辨識 BET</span>
                                            </label>
                                            {visionImages.some(img => img.grid) && (
                                                <button onClick={() => resetVisionImage('ALL')} className="text-xs font-bold text-amber-400 hover:text-amber-300 px-3 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 transition-colors flex items-center gap-1" title="還原全部截圖到辨識前狀態">
                                                    <RotateCcw size={14} /> 還原全部辨識
                                                </button>
                                            )}
                                            <button onClick={() => { removeVisionImage('ALL'); setActiveVisionId(''); }} className="text-xs font-bold text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 transition-colors flex items-center gap-1">
                                                <Trash2 size={14} /> 清空全部截圖
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center min-h-[300px] no-invert" ref={visionContainerRef}>
                                        <div className={`relative w-full flex items-center justify-center overflow-hidden ${activeVisionImg?.grid ? 'h-auto py-4' : 'h-full'}`}>
                                            <canvas
                                                ref={visionCanvasRef}
                                                className={`max-w-full max-h-full object-contain ${activeVisionImg?.grid ? 'cursor-default pointer-events-none drop-shadow-lg' : 'cursor-crosshair'}`}
                                                onMouseDown={!activeVisionImg?.grid ? handleVisionMouseDown : undefined}
                                                onMouseMove={!activeVisionImg?.grid ? handleVisionMouseMove : undefined}
                                                onMouseUp={!activeVisionImg?.grid ? handleVisionMouseUp : undefined}
                                                onMouseLeave={!activeVisionImg?.grid ? handleVisionMouseUp : undefined}
                                            />

                                            {/* 左右圖片切換浮動按鈕 */}
                                            {visionImages.length > 1 && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); goToPrevVisionImage(); }}
                                                        disabled={visionImages.findIndex(img => img.id === activeVisionId) === 0}
                                                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed group/nav z-30"
                                                    >
                                                        <ChevronLeft size={24} className="group-hover/nav:-translate-x-0.5 transition-transform" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); goToNextVisionImage(); }}
                                                        disabled={visionImages.findIndex(img => img.id === activeVisionId) === visionImages.length - 1}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed group/nav z-30"
                                                    >
                                                        <ChevronRight size={24} className="group-hover/nav:translate-x-0.5 transition-transform" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Phase 3 執行按鈕與進度 */}
                                    <div className="p-4 border-t border-slate-800 bg-slate-950 shrink-0">
                                        {!isVisionProcessing ? (
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => performLocalVisionBatchMatching(ocrDecimalPlaces)}
                                                    className="w-full py-3 rounded-lg text-lg font-bold flex items-center justify-center gap-2 transition-all shadow-md bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20"
                                                >
                                                    <Monitor size={20} />
                                                    本地辨識盤面 (零延遲)
                                                </button>

                                                {/* 單格測試區塊 */}
                                                <label className="w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                                                    <Upload size={16} /> 上傳單格裁圖測試 SSIM (反灰分析)
                                                    <input type="file" accept="image/*" className="hidden" onChange={handleSingleCellTestUpload} />
                                                </label>

                                                <button
                                                    onClick={performAIVisionBatchMatching}
                                                    disabled={!hasApiKey}
                                                    className={`w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm 
                                                    ${!hasApiKey ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-700/30' : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30'}`}
                                                >
                                                    <ListChecks size={18} />
                                                    {visionImages.filter(img => !img.grid).length > 0
                                                        ? `Gemini 輔助辨識未處理圖片 (${visionImages.filter(img => !img.grid).length} 張)`
                                                        : 'Gemini 重新辨識全部圖片'}
                                                </button>
                                                {!hasApiKey && visionImages.length > 0 && (
                                                    <div className="px-3 py-2 bg-amber-950/40 border border-amber-900 rounded-lg text-xs text-amber-400 font-bold flex items-center gap-2">
                                                        <AlertCircle size={14} className="shrink-0" />
                                                        未偵測到 API Key。請點擊右上角「齒輪」圖示進行設定後，再使用 AI 辨識功能。
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex gap-3">
                                                <div className="flex-1 py-3 bg-indigo-600/50 rounded-lg text-lg font-bold flex items-center justify-center gap-2 text-white/80 select-none shadow-inner border border-indigo-500/30">
                                                    <Loader2 size={20} className="animate-spin" />
                                                    {isVisionStopping
                                                        ? '正在等待當前回合完成並停止...'
                                                        : `AI 批次辨識中 (${visionBatchProgress.current}/${visionBatchProgress.total})...`}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        cancelVisionProcessing();
                                                    }}
                                                    disabled={isVisionStopping}
                                                    className={`shrink-0 px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all shadow-md border ${isVisionStopping ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-rose-500/20 active:scale-95'}`}
                                                >
                                                    <StopCircle size={20} />
                                                    🛑 停止辨識
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* 錯誤顯示區塊 */}
                                    {visionError && (
                                        <div className="p-3 bg-rose-950/50 border-t border-rose-900 text-rose-400 text-sm font-bold flex items-center justify-center gap-2">
                                            <AlertCircle size={18} className="shrink-0" />
                                            <span>{visionError}</span>
                                        </div>
                                    )}

                                    {/* AI 辨識後的唯讀小盤面預覽 */}
                                    {!isVisionProcessing && visionGrid && visionCalcResults && (
                                        <div className="p-4 bg-black/60 border-t border-slate-800">
                                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-3">
                                                <span className="text-xs text-slate-400 font-bold">目前 AI 辨識盤面狀態 (唯讀預覽)</span>
                                                <button
                                                    onClick={onTransfer}
                                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95 group"
                                                >
                                                    <ChevronUp size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                                                    傳送至 Phase 2 手動調整 (↑)
                                                </button>
                                            </div>
                                            <div className="flex flex-col gap-1 w-max mx-auto pointer-events-none">
                                                {getSafeGrid(visionGrid).map((row, rIndex) => (
                                                    <div key={rIndex} className="flex gap-1">
                                                        {row.map((symbol, cIndex) => {
                                                            let isWinSymbol = false;
                                                            let isOnLine = false;
                                                            if (visionCalcResults) {
                                                                if (visionHoveredLineId) {
                                                                    const hoveredResult = visionCalcResults.details.find(d => d.lineId === visionHoveredLineId);
                                                                    if (hoveredResult) {
                                                                        const isFeatureWin = String(hoveredResult.lineId).startsWith('SCATTER') || String(hoveredResult.lineId).startsWith('COLLECT');
                                                                        if (!isFeatureWin) {
                                                                            isOnLine = template.lines[visionHoveredLineId]?.[cIndex] - 1 === rIndex;
                                                                        }
                                                                        isWinSymbol = hoveredResult.winCoords.some(c => c.row === rIndex && c.col === cIndex);
                                                                    }
                                                                } else {
                                                                    isWinSymbol = visionCalcResults.details.some(d => d.winAmount > 0 && d.winCoords.some(c => c.row === rIndex && c.col === cIndex));
                                                                }
                                                            }

                                                            let cellClass = "relative w-10 h-10 flex items-center justify-center rounded border transition-all duration-300 text-[10px] font-bold text-center overflow-hidden ";
                                                            if (visionHoveredLineId) {
                                                                if (isWinSymbol) cellClass += "bg-indigo-600 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)] z-10 scale-105 text-white";
                                                                else if (isOnLine) cellClass += "bg-slate-700 border-slate-500 text-slate-300 opacity-60";
                                                                else cellClass += "bg-slate-900 border-slate-800 text-slate-600 opacity-30";
                                                            } else {
                                                                if (isWinSymbol) cellClass += "bg-indigo-500 border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.4)] z-10 scale-105 text-white";
                                                                else cellClass += "bg-slate-800 border-slate-700 text-slate-300";
                                                            }

                                                            const baseSym = getBaseSymbol(symbol, template?.jpConfig);
                                                            const isGridSymCash = isCashSymbol(symbol, template?.jpConfig);
                                                            const isGridSymCollect = symbol && symbol.toUpperCase().includes('COLLECT');
                                                            const cashVal = isGridSymCash ? getCashValue(symbol, template?.jpConfig) : (isGridSymCollect ? getCollectValue(symbol) : 0);

                                                            const displayImg = getSymbolDisplayImage(symbol, template?.symbolImages, template?.jpConfig);
                                                            const isCellDynamic = template?.hasDynamicMultiplier && isDynamicMultiplierSymbol(symbol);
                                                            const multVal = isCellDynamic ? getSymbolMultiplier(symbol) : 1;

                                                            return (
                                                                <div key={cIndex} className={cellClass}>
                                                                    {symbol ? (
                                                                        displayImg ? (
                                                                            <React.Fragment>
                                                                                <img src={displayImg} className={`max-w-full max-h-full object-contain p-1 drop-shadow-md ${(isGridSymCash || isGridSymCollect || isCellDynamic) ? 'opacity-80' : ''}`} alt={symbol} />
                                                                                {cashVal > 0 && <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] text-[10px] z-20 pointer-events-none">{isJpSymbol(symbol, template?.jpConfig) ? cashVal + 'x' : formatShorthandValue(cashVal)}</div>}
                                                                                {isCellDynamic && <div className="absolute inset-0 flex items-center justify-center font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] text-[10px] z-20 pointer-events-none">{multVal > 1 ? `x${multVal}` : 'xN'}</div>}
                                                                                {symbol.toLowerCase().endsWith('_double') && (
                                                                                    <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[6px] font-black px-0.5 rounded-bl shadow-sm border-l border-b border-indigo-400 z-30">
                                                                                        2X
                                                                                    </div>
                                                                                )}
                                                                            </React.Fragment>
                                                                        ) : (
                                                                            <div className="flex flex-col items-center">
                                                                                <span>{(isGridSymCash || isGridSymCollect) && cashVal > 0 ? `💰${isJpSymbol(symbol, template?.jpConfig) ? cashVal + 'x' : formatShorthandValue(cashVal)}` : (isCellDynamic ? (multVal > 1 ? `x${multVal}` : 'xN') : baseSym)}</span>
                                                                                {symbol.toLowerCase().endsWith('_double') && <span className="text-[6px] text-indigo-400 font-bold -mt-1">DBL</span>}
                                                                            </div>
                                                                        )
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="text-center mt-3">
                                                <span className="text-[10px] text-slate-500">若發現 AI 辨識有誤，可先傳送至 Phase 2 再進行手動微調</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Phase 3 專屬獨立結算 UI */}
                    {activeVisionImg && visionGrid ? (
                        <ResultView template={template} calcData={visionCalcResults} calcErr={visionCalculateError} hoveredId={visionHoveredLineId} setHoveredId={setVisionHoveredLineId} showAll={visionShowAllLines} setShowAll={setVisionShowAllLines} betInput={betInput} setBetInput={setBetInput} totalBalance={totalBalance} setTotalBalance={setTotalBalance} setTemplateMessage={setTemplateMessage} isBalanceExpanded={isBalanceExpanded} setIsBalanceExpanded={setIsBalanceExpanded} />
                    ) : (
                        <div className="relative flex flex-col h-full lg:block w-full">
                            <div className="static lg:absolute lg:inset-0 flex flex-col w-full h-full">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center flex-1 min-h-0 text-slate-400 opacity-60 border-dashed">
                                    <Trophy size={48} className="mb-3 opacity-50" />
                                    <p className="font-bold text-lg">等待 AI 批次辨識結果...</p>
                                    <p className="text-sm mt-1">結果將在此獨立呈現，不影響 Phase 2</p>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
