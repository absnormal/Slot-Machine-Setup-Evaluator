import React from 'react';
import { Send, X, Clock } from 'lucide-react';

/**
 * CandidateCard — 單張候選幀卡片
 *
 * 從 Phase4Video.renderCardContent 完整抽出，
 * 包含縮圖、OCR 數據、辨識結果比對、以及動作按鈕。
 *
 * Props 分為兩類：
 *   資料類 — kf, idx
 *   行為類 — editingOcr, setEditingOcr, updateCandidate, updateCandidateOcr,
 *            handleCardClick, onTransferToPhase3, removeCandidate
 */
const CandidateCard = ({
    kf,
    idx,
    // 行為
    editingOcr,
    setEditingOcr,
    updateCandidate,
    updateCandidateOcr,
    handleCardClick,
    onTransferToPhase3,
    removeCandidate,
    // 分組模式額外 props
    isBest,
    hasBeenGrouped,
    isDimmed,
    setManualBestCandidate,
}) => {
    // ── 狀態 → className 映射 ──
    const statusBorder = isBest && hasBeenGrouped
        ? 'ring-2 ring-emerald-400 border-emerald-300'
        : kf.status === 'recognized' ? 'border-emerald-200'
        : kf.status === 'error' ? 'border-rose-200'
        : kf.status === 'recognizing' ? 'border-indigo-300 ring-2 ring-indigo-200'
        : 'border-slate-200 hover:border-indigo-300';

    return (
        <div
            id={`kf-card-${kf.id}`}
            className={`group relative rounded-xl border p-2 shadow-sm hover:shadow-md transition-all
                ${isDimmed ? 'opacity-40 bg-slate-50 border-slate-200' : 'bg-white'}
                ${statusBorder}`}
        >
            {/* ★ 最佳標記 */}
            {isBest && hasBeenGrouped && (
                <div className="absolute -top-1.5 -left-1.5 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow z-10 pointer-events-none">
                    ★ 最佳
                </div>
            )}
            {/* ⭐ 設為最佳按鈕 */}
            {!isBest && hasBeenGrouped && setManualBestCandidate && (
                <button
                    onClick={(e) => { e.stopPropagation(); setManualBestCandidate(kf.id); }}
                    className="absolute -top-1.5 -left-1.5 bg-slate-200 text-slate-500 hover:bg-emerald-500 hover:text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow z-10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                >
                    ⭐ 設為最佳
                </button>
            )}

            {/* 卡片主體 */}
            <div className="flex gap-2.5 items-center">
                {/* 縮圖 */}
                <div
                    className={`w-20 h-14 rounded-lg overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:scale-110 hover:shadow-md hover:ring-2 hover:ring-indigo-400 transition-all z-10 relative ${kf.winPollThumbUrl ? 'bg-amber-900 ring-2 ring-amber-400' : 'bg-slate-900'}`}
                    onClick={(e) => { e.stopPropagation(); handleCardClick(kf); }}
                    title="點擊放大檢視盤面"
                >
                    <img
                        src={(kf.useWinFrame !== false) ? (kf.winPollThumbUrl || kf.thumbUrl) : kf.thumbUrl}
                        className="w-full h-full object-contain pointer-events-none"
                        alt=""
                    />
                    {kf.winPollThumbUrl && (
                        <button
                            onClick={(e) => { e.stopPropagation(); updateCandidate(kf.id, { useWinFrame: kf.useWinFrame === false }); }}
                            className={`absolute bottom-0 right-0 px-1 text-[8px] font-bold rounded-tl-md transition-colors ${
                                kf.useWinFrame !== false ? 'bg-amber-500 text-black' : 'bg-slate-600 text-white'
                            }`}
                            title={kf.useWinFrame !== false ? '目前：用 WIN 截圖辨識，點擊切換到停輪截圖' : '目前：用停輪截圖辨識，點擊切換到 WIN 截圖'}
                        >
                            {kf.useWinFrame !== false ? 'WIN' : '停輪'}
                        </button>
                    )}
                    
                    {kf.manualOverrides?.grid && (
                        <div className="absolute top-1 left-1 bg-amber-500/90 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow-sm border border-amber-400 z-10" title="盤面已人工手動修改">
                            ✍️ 人工盤面
                        </div>
                    )}
                </div>

                {/* 資訊區 */}
                <div className="flex-1 min-w-0 pr-5">
                    {/* 時間 + 狀態 badge */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <Clock size={12} className="text-slate-400" />
                            <span className="text-xs font-mono text-slate-500">{kf.time.toFixed(1)}s</span>
                            {kf.captureDelay > 0.05 && (
                                <span
                                    className="text-[10px] text-amber-500"
                                    title={`盤面停於 ${kf.reelStopTime?.toFixed(1)}s，等贏分 +${kf.captureDelay.toFixed(1)}s`}
                                >
                                    +{kf.captureDelay.toFixed(1)}s
                                </span>
                            )}
                        </div>
                        {(() => {
                            const ocrWin = kf.ocrData ? Math.floor(parseFloat(kf.ocrData.win) || 0) : 0;
                            const aiWin = kf.recognitionResult ? Math.floor(parseFloat(kf.recognitionResult.totalWin) || 0) : 0;
                            const isWinMatch = ocrWin === aiWin;
                            const hasResult = kf.status === 'recognized' && kf.recognitionResult;

                            let badgeClass = 'bg-slate-100 text-slate-500';
                            let badgeText = `#${idx + 1}`;

                            if (hasResult) {
                                if (isWinMatch) {
                                    badgeClass = 'bg-emerald-100 text-emerald-700';
                                    badgeText = '✓ 贏分正確';
                                } else {
                                    badgeClass = 'bg-rose-100 text-rose-700 font-black border border-rose-200 shadow-sm';
                                    badgeText = '⚠ 算分異常';
                                }
                            } else if (kf.status === 'recognized') {
                                badgeClass = 'bg-emerald-100 text-emerald-700';
                                badgeText = '✓ 已辨識';
                            } else if (kf.status === 'error') {
                                badgeClass = 'bg-rose-100 text-rose-600';
                                badgeText = '✗ 失敗';
                            } else if (kf.status === 'recognizing') {
                                badgeClass = 'bg-indigo-100 text-indigo-600 animate-pulse';
                                badgeText = '辨識中...';
                            }

                            return (
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold leading-none ${badgeClass}`}>
                                    {badgeText}
                                </span>
                            );
                        })()}
                    </div>

                    {/* OCR 數據 */}
                    {kf.ocrData && (
                        <div className={`grid ${kf.ocrData.multiplier !== undefined ? 'grid-cols-4' : 'grid-cols-3'} gap-1 mt-0.5 bg-slate-50 rounded-lg px-1.5 py-0.5`}>
                            {[
                                { label: '贏分', field: 'win', defaultColor: parseFloat(kf.ocrData.win) > 0 ? 'text-emerald-600' : 'text-slate-400' },
                                { label: '押注', field: 'bet', defaultColor: 'text-amber-600' },
                                { label: '總分', field: 'balance', defaultColor: 'text-sky-600' },
                                ...(kf.ocrData.multiplier !== undefined ? [{ label: '乘倍', field: 'multiplier', defaultColor: 'text-rose-600' }] : [])
                            ].map(({ label, field, defaultColor }) => {
                                const isEditing = editingOcr?.id === kf.id && editingOcr?.field === field;
                                const currentValue = kf.ocrData[field];
                                const isManual = kf.manualOverrides?.[field];

                                return (
                                    <div key={field} className="flex flex-col items-center leading-tight">
                                        <span className="text-[10px] text-slate-400">{label}</span>
                                        {isEditing ? (
                                            <input
                                                autoFocus
                                                className="w-16 text-[13px] font-bold text-center border-b border-indigo-500 bg-white shadow-inner focus:outline-none focus:bg-indigo-50 text-indigo-700"
                                                value={editingOcr.value}
                                                onChange={(e) => setEditingOcr({ ...editingOcr, value: e.target.value })}
                                                onBlur={() => {
                                                    if (editingOcr.value !== currentValue) {
                                                        updateCandidateOcr(kf.id, field, editingOcr.value);
                                                    }
                                                    setEditingOcr(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') e.target.blur();
                                                    if (e.key === 'Escape') setEditingOcr(null);
                                                }}
                                            />
                                        ) : (
                                            <span
                                                className={`text-[13px] font-bold cursor-pointer transition-all hover:scale-105 inline-block px-1 rounded ${isManual ? 'bg-amber-100 text-amber-800 border border-amber-300 ring-1 ring-amber-400 shadow-sm' : defaultColor} hover:bg-slate-200`}
                                                title="點擊手動修改數據"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingOcr({ id: kf.id, field, value: currentValue || '' });
                                                }}
                                            >
                                                {isManual && <span className="mr-0.5 text-[10px] opacity-70">✎</span>}
                                                {currentValue || (field === 'bet' || field === 'balance' ? '-' : '0')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 注單號 */}
                    {kf.ocrData?.orderId && (
                        <div className="mt-0.5 text-[11px] text-slate-400 font-mono tracking-wider leading-none">
                            ID: {kf.ocrData.orderId}
                        </div>
                    )}

                    {/* 結算比對 */}
                    {kf.status === 'recognized' && kf.recognitionResult && (
                        <div className="mt-1 pt-1 border-t border-slate-100">
                            {(() => {
                                const ocrWin = kf.ocrData ? Math.floor(parseFloat(kf.ocrData.win) || 0) : 0;
                                const aiWin = Math.floor(parseFloat(kf.recognitionResult.totalWin) || 0);
                                const isWinMatch = ocrWin === aiWin;

                                if (isWinMatch) {
                                    return (
                                        <div className="flex items-center justify-between leading-none mt-0.5">
                                            <span className="text-[11px] text-slate-400">結算贏分</span>
                                            <span className={`text-[14px] font-bold ${aiWin > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {aiWin.toLocaleString()}
                                            </span>
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div className="flex flex-col gap-0.5 mt-0.5">
                                            <div className="flex items-center justify-between leading-none">
                                                <span className="text-[11px] text-rose-500 font-bold">⚠️ 算分異常</span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] leading-tight">
                                                <span className="text-slate-500">OCR: <span className="font-bold text-slate-700">{ocrWin}</span></span>
                                                <span className="text-rose-600">AI: <span className="font-bold">{aiWin}</span></span>
                                            </div>
                                        </div>
                                    );
                                }
                            })()}
                        </div>
                    )}

                    {/* 錯誤訊息 */}
                    {kf.status === 'error' && kf.error && (
                        <div className="text-[11px] text-rose-500 mt-0.5 truncate leading-none">{kf.error}</div>
                    )}
                </div>
            </div>

            {/* 右上角動作按鈕 */}
            <button
                onClick={(e) => { e.stopPropagation(); onTransferToPhase3([kf]); }}
                title="送到 Phase 3 手動調校"
                className="absolute top-1.5 right-8 text-slate-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-all"
            >
                <Send size={12} />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); removeCandidate(kf.id); }}
                className="absolute top-1.5 right-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
            >
                <X size={12} />
            </button>
        </div>
    );
};

export default CandidateCard;
