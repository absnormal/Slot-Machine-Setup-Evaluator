import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import useSpinGroupAnalysis from '../hooks/useSpinGroupAnalysis';
import FlowComposer from './phase5/FlowComposer';
import DataTablePanel from './phase5/DataTablePanel';
import StatusBar from './phase5/StatusBar';

/**
 * Phase5Automation — 固定底部狀態列 + 排程器面板
 *
 * 容器元件：負責膠水邏輯、狀態衍生、佈局。
 * 實際內容委派給子元件：
 *   - StatusBar: 底部狀態列
 *   - FlowComposer: 排程器
 */
const Phase5Automation = ({
    videoRef, candidates, setCandidates,
    isNativeMode, nativeCapture, isDetecting,
    startLiveDetection, stopLiveDetection, smartDedup,
    template, gameName, setTemplateMessage,
    reelROI, scanOpts, recognizeLocal,
}) => {
    // ── candidates ref ──
    const candidatesRef = useRef(candidates);
    useEffect(() => { candidatesRef.current = candidates; }, [candidates]);

    // ── 分局分析 ──
    const { groupsWithMath } = useSpinGroupAnalysis(candidates);
    const actualSpins = groupsWithMath?.length || 0;

    // ── 展開/收合 ──
    const [isExpanded, setIsExpanded] = useState(false);

    const isConnected = nativeCapture?.isConnected;
    const wsRef = nativeCapture?.wsRef || { current: null };

    // ── 衍生統計（精簡版）──
    const derived = useMemo(() => ({
        rtp: '0.0', hitRate: '0.0', netPL: 0,
    }), []);

    // 底部列只在 nativeMode 時顯示
    if (!isNativeMode) return null;

    return createPortal(
        <div className="fixed bottom-0 left-0 right-0 z-[9998]" style={{ pointerEvents: 'none' }}>
            {/* ══ 展開面板 ══ */}
            <div
                className="ml-4 max-w-lg mb-0 bg-slate-900/95 backdrop-blur-xl rounded-t-2xl border border-b-0 border-slate-700/50 shadow-2xl"
                style={{ pointerEvents: isExpanded ? 'auto' : 'none', display: isExpanded ? 'block' : 'none' }}
            >
                <div className="p-5 flex flex-col gap-4 h-[90vh]">
                    <DataTablePanel />
                    <div className="flex-1 min-h-0">
                        <FlowComposer
                            ws={wsRef?.current}
                            videoEl={videoRef?.current}
                            setCandidates={setCandidates}
                            reelROI={reelROI}
                            recognizeLocal={recognizeLocal}
                        />
                    </div>
                </div>
            </div>

            {/* ══ 固定底部列 ══ */}
            <StatusBar
                isConnected={isConnected} isDetecting={isDetecting} isPlaying={false}
                stateColor={'bg-slate-500'} stateLabel={'準備中'}
                actualSpins={actualSpins} derived={derived} candidateCount={candidates.length}
                isExpanded={isExpanded} setIsExpanded={setIsExpanded}
            />
        </div>,
        document.body
    );
};

export default Phase5Automation;
