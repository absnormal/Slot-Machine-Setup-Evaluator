import React from 'react';
import { Scan, Send, Monitor, Link2, AlertCircle, Trash2 } from 'lucide-react';
import CandidateCard from './CandidateCard';
import CardErrorBoundary from './CardErrorBoundary';

const GROUP_COLOR_PALETTE = [
    { border: '#818cf8', bg: 'rgba(238,242,255,0.6)' },
    { border: '#fbbf24', bg: 'rgba(255,251,235,0.6)' },
    { border: '#22d3ee', bg: 'rgba(236,254,255,0.6)' },
    { border: '#f472b6', bg: 'rgba(253,242,248,0.6)' },
    { border: '#a3e635', bg: 'rgba(247,254,231,0.6)' },
];

/**
 * SpinGroupList — 候選幀分組列表（含 Header + 空狀態 + 分組渲染）
 * 從 Phase4Video.jsx L442-570 抽離
 */
const SpinGroupList = ({
    candidates,
    groupsWithMath,
    clearCandidates,
    recognizedCount, errorCount,
    // Card props
    editingOcr, setEditingOcr,
    updateCandidate, updateCandidateOcr,
    handleCardClick,
    onTransferToPhase3,
    removeCandidate,
    setManualBestCandidate,
    // Group actions
    recognizeLocalBatch, ocrDecimalPlaces,
    // Scroll ref
    listEndRef,
}) => {
    return (
        <>
            {/* 候選幀列表 Header */}
            <div className="px-4 py-2 border-b bg-white flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <h3 className="font-bold text-slate-700 flex items-center gap-2 text-xs">
                    <Scan size={14} className="text-indigo-500" /> 候選關鍵幀
                    <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px]">{candidates.length}</span>
                    {recognizedCount > 0 && <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full text-[10px]">✓{recognizedCount}</span>}
                    {errorCount > 0 && <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full text-[10px]">✗{errorCount}</span>}
                </h3>
                {candidates.length > 0 && (
                    <button onClick={clearCandidates} className="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="清除全部">
                        <Trash2 size={14} />
                    </button>
                )}
            </div>

            {/* 候選幀列表 */}
            <div className="overflow-y-auto p-3 space-y-2 custom-scrollbar" style={{ height: '450px' }}>
                {candidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-60">
                        <Scan size={48} className="mb-4 stroke-[1px]" />
                        <p className="text-xs text-center">
                            點擊「開始即時偵測」
                        </p>
                    </div>
                ) : (
                    (() => {
                        if (!groupsWithMath) {
                            return candidates.map((kf, idx) => (
                                <CandidateCard
                                    key={kf.id} kf={kf} idx={idx}
                                    editingOcr={editingOcr} setEditingOcr={setEditingOcr}
                                    updateCandidate={updateCandidate} updateCandidateOcr={updateCandidateOcr}
                                    handleCardClick={handleCardClick}
                                    onTransferToPhase3={onTransferToPhase3}
                                    removeCandidate={removeCandidate}
                                />
                            ));
                        }

                        return groupsWithMath.map(({ gid, group, mathValid, mathDiff, expectedBase, nextBase, isCascadeSequence }, listIndex) => {
                            const isMulti = group.length > 1;
                            const parsedGid = parseInt(gid);
                            const palette = isNaN(parsedGid) 
                                ? { border: '#cbd5e1', bg: 'rgba(248,250,252,0.6)' } 
                                : GROUP_COLOR_PALETTE[parsedGid % GROUP_COLOR_PALETTE.length];
                            return (
                                <div id={`spin-group-${gid}`} key={`spin-${gid}-${listIndex}`}
                                    className="rounded-xl p-1.5 space-y-1.5"
                                    style={{ borderLeft: `4px solid ${palette.border}`, backgroundColor: palette.bg }}
                                >
                                    <div className="text-[13px] font-bold px-1 flex flex-wrap items-center gap-2 mb-1 pb-1 border-b border-slate-200/50">
                                        {isCascadeSequence ? (
                                            <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">🔗 連鎖序列</span>
                                        ) : (
                                            <span className="text-slate-500 opacity-60 bg-slate-100 px-2 py-0.5 rounded shadow-sm">{isMulti ? '同局' : '單局'}</span>
                                        )}
                                        
                                        {expectedBase !== null && (
                                            mathValid ? (
                                                <span className="text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm" title={`與上局符合 (推算本局結餘 = ${nextBase?.toFixed(2)})`}>
                                                    <Link2 size={14} /> 連續
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-1.5 group/break">
                                                    <span className="text-rose-600 bg-rose-100/80 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm" title={`預期起始: ${expectedBase.toFixed(2)}`}>
                                                        <AlertCircle size={14} /> 斷層 {mathDiff !== 0 && `(${mathDiff > 0 ? '+' : ''}${mathDiff.toFixed(2)})`}
                                                    </span>
                                                </div>
                                            )
                                        )}
                                        
                                        <span className="ml-auto text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">{group.length} 張</span>
                                        <button onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const bestKf = group.find(g => g.kf.isSpinBest)?.kf || group[group.length - 1].kf;
                                            recognizeLocalBatch(ocrDecimalPlaces, [bestKf]); 
                                        }}
                                            title="本地辨識這局最佳結果"
                                            className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full text-[10px] font-bold border border-indigo-200 transition-all active:scale-95 shadow-sm">
                                            <Monitor size={10} /> 本地
                                        </button>
                                        <button onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const bestKf = group.find(g => g.kf.isSpinBest)?.kf || group[group.length - 1].kf;
                                            onTransferToPhase3([bestKf]); 
                                        }}
                                            title="送這局最佳結果到 Phase 3"
                                            className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-full text-[10px] font-bold border border-emerald-200 transition-all active:scale-95 shadow-sm">
                                            <Send size={10} /> P3
                                        </button>
                                    </div>
                                    {group.map(({ kf, idx }) => {
                                        const isBest = kf.isSpinBest;
                                        const hasBeenGrouped = kf.isSpinBest !== undefined;
                                        const isDimmed = isMulti && !isBest && !kf.isCascadeMember;
                                        return (
                                            <CardErrorBoundary key={`eb-${kf.id}`}>
                                            <CandidateCard
                                                key={kf.id} kf={kf} idx={idx}
                                                editingOcr={editingOcr} setEditingOcr={setEditingOcr}
                                                updateCandidate={updateCandidate} updateCandidateOcr={updateCandidateOcr}
                                                handleCardClick={handleCardClick}
                                                onTransferToPhase3={onTransferToPhase3}
                                                removeCandidate={removeCandidate}
                                                isBest={isBest}
                                                hasBeenGrouped={hasBeenGrouped}
                                                isDimmed={isDimmed}
                                                setManualBestCandidate={setManualBestCandidate}
                                            />
                                            </CardErrorBoundary>
                                        );
                                    })}
                                </div>
                            );
                        });
                    })()
                )}
                <div ref={listEndRef} />
            </div>
        </>
    );
};

export default SpinGroupList;
