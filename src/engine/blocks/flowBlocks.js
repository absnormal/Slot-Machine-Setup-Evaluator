/**
 * flowBlocks.js — 流程控制類積木
 *
 * 從 FlowRunner 抽出的純函數，接收 runner 實例作為第一參數。
 * 包含：loop, if_then, sub_flow
 */
import { FlowEvent } from '../flowRunner';

export async function execLoop(runner, block, depth) {
    const { count, condition } = block.params;
    const children = block.children || [];

    if (count !== undefined && count !== null) {
        // 固定次數迴圈
        const total = runner._evalExpr(count);
        for (let i = 0; i < total; i++) {
            await runner._checkPauseAndCancel();
            runner.variables['$loopIndex'] = i;
            runner._emit(FlowEvent.LOOP_PROGRESS, {
                blockId: block.id,
                current: i + 1,
                total,
                depth,
                inSubFlow: !!runner._inSubFlow,
            });

            try {
                await runner._executeBlocks(children, depth + 1);
            } catch (e) {
                if (e.message === 'break') break;
                throw e;
            }
        }
    } else if (condition) {
        // 條件迴圈
        let i = 0;
        while (runner._evalCondition(condition)) {
            await runner._checkPauseAndCancel();
            runner.variables['$loopIndex'] = i++;
            runner._emit(FlowEvent.LOOP_PROGRESS, {
                blockId: block.id,
                current: i,
                total: -1, // 未知總數
                depth,
                inSubFlow: !!runner._inSubFlow,
            });

            try {
                await runner._executeBlocks(children, depth + 1);
            } catch (e) {
                if (e.message === 'break') break;
                throw e;
            }
        }
    }
}

export async function execIfThen(runner, block, depth) {
    const { condition } = block.params;
    if (runner._evalCondition(condition)) {
        await runner._executeBlocks(block.children, depth + 1);
    } else if (block.elseChildren) {
        await runner._executeBlocks(block.elseChildren, depth + 1);
    }
}

export async function execSubFlow(runner, block, depth) {
    const MAX_DEPTH = 10;
    if (depth >= MAX_DEPTH) {
        throw new Error(`子流程巢狀深度超過上限 (${MAX_DEPTH})，可能存在循環引用`);
    }

    const { flowId, label } = block.params;
    if (!flowId) {
        throw new Error('子流程未選擇（flowId 為空）');
    }
    if (!runner._subFlowResolver) {
        throw new Error('子流程解析器未設定');
    }

    const subFlow = runner._subFlowResolver(flowId);
    if (!subFlow || !subFlow.blocks) {
        throw new Error(`找不到子流程: ${label || flowId}`);
    }

    runner._emit(FlowEvent.LOG, { message: `📦 進入子流程: ${subFlow.name || label || flowId}` });
    runner._sendPythonLog(`📦 子流程: ${subFlow.name || flowId}`);
    runner._inSubFlow = (runner._inSubFlow || 0) + 1;
    try {
        await runner._executeBlocks(subFlow.blocks, depth + 1);
    } finally {
        runner._inSubFlow = Math.max(0, (runner._inSubFlow || 1) - 1);
    }
    runner._emit(FlowEvent.LOG, { message: `📦 離開子流程: ${subFlow.name || label || flowId}` });
}
