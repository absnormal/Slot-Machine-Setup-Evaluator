/**
 * useFlowRunner.js — Flow 執行引擎的 React Hook
 *
 * 將 FlowRunner 的事件轉為 React 狀態，
 * 供 Phase5 UI 監聽與控制。
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { FlowRunner, RunState, FlowEvent, PRESET_FLOWS } from '../engine/flowRunner';

export function useFlowRunner() {
    const runnerRef = useRef(null);

    // ── 狀態 ──
    const [runState, setRunState] = useState(RunState.IDLE);
    const [variables, setVariables] = useState({});
    const [currentBlock, setCurrentBlock] = useState(null);
    const [loopProgress, setLoopProgress] = useState(null); // { current, total }
    const [logs, setLogs] = useState([]);
    const [spinCount, setSpinCount] = useState(0);

    // ── 初始化 Runner ──
    useEffect(() => {
        const runner = new FlowRunner();
        runnerRef.current = runner;

        // 監聽事件
        runner.addEventListener(FlowEvent.STATE_CHANGE, (e) => {
            setRunState(e.detail.state);
        });

        runner.addEventListener(FlowEvent.BLOCK_START, (e) => {
            // 子流程內部的積木不覆蓋 currentBlock（保持 sub_flow 積木高亮）
            if (!e.detail.inSubFlow) {
                setCurrentBlock(e.detail.block);
            }
        });

        runner.addEventListener(FlowEvent.BLOCK_END, () => {
            // 不清空 currentBlock，保持最後執行的積木高亮
        });

        runner.addEventListener(FlowEvent.VAR_UPDATE, (e) => {
            setVariables(prev => ({ ...prev, [e.detail.name]: e.detail.value }));
        });

        runner.addEventListener(FlowEvent.LOOP_PROGRESS, (e) => {
            // 只顯示主流程的迴圈進度，子流程內的迴圈不覆蓋
            if (e.detail.inSubFlow) return;
            setLoopProgress({
                blockId: e.detail.blockId,
                current: e.detail.current,
                total: e.detail.total,
            });
        });

        runner.addEventListener(FlowEvent.LOG, (e) => {
            setLogs(prev => [...prev.slice(-99), {
                time: new Date().toLocaleTimeString(),
                message: e.detail.message,
            }]);
        });

        runner.addEventListener(FlowEvent.SPIN_RECORDED, () => {
            setSpinCount(prev => prev + 1);
        });

        runner.addEventListener(FlowEvent.ERROR, (e) => {
            console.error('[FlowRunner]', e.detail.error);
            setLogs(prev => [...prev.slice(-99), {
                time: new Date().toLocaleTimeString(),
                message: `❌ ${e.detail.error?.message || 'Unknown error'}`,
            }]);
        });

        return () => {
            runner.stop();
        };
    }, []);

    // ── 執行 ──
    const runFlow = useCallback(async (flow, context) => {
        if (!runnerRef.current) return;

        // 重置狀態
        setVariables({});
        setCurrentBlock(null);
        setLoopProgress(null);
        setLogs([]);
        setSpinCount(0);

        await runnerRef.current.run(flow, context);
    }, []);

    // ── 控制 ──
    const pause = useCallback(() => runnerRef.current?.pause(), []);
    const resume = useCallback(() => runnerRef.current?.resume(), []);
    const stop = useCallback(() => runnerRef.current?.stop(), []);

    return {
        // 狀態
        runState,
        isRunning: runState === RunState.RUNNING,
        isPaused: runState === RunState.PAUSED,
        isIdle: runState === RunState.IDLE,
        variables,
        currentBlock,
        loopProgress,
        logs,
        spinCount,

        // 動作
        runFlow,
        pause,
        resume,
        stop,

        // 預設模板
        presetFlows: PRESET_FLOWS,
    };
}
