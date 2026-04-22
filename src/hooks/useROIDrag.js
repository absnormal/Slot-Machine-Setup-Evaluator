import { useState, useCallback } from 'react';
import usePhase4Store from '../stores/usePhase4Store';

/**
 * ROI (Region of Interest) 拖曳邏輯 hook
 * 管理在影片預覽區域上拖曳/縮放 ROI 框的行為
 * @param {React.RefObject} containerRef - 影片容器的 ref
 * @param {string} roiMode - 當前選中的 ROI 模式 ('reel'|'win'|'balance'|'bet'|'orderId')
 */
const useROIDrag = (containerRef, roiMode) => {
    const reelROI = usePhase4Store(s => s.reelROI);
    const setReelROI = usePhase4Store(s => s.setReelROI);
    const winROI = usePhase4Store(s => s.winROI);
    const setWinROI = usePhase4Store(s => s.setWinROI);
    const balanceROI = usePhase4Store(s => s.balanceROI);
    const setBalanceROI = usePhase4Store(s => s.setBalanceROI);
    const betROI = usePhase4Store(s => s.betROI);
    const setBetROI = usePhase4Store(s => s.setBetROI);
    const orderIdROI = usePhase4Store(s => s.orderIdROI);
    const setOrderIdROI = usePhase4Store(s => s.setOrderIdROI);

    const [dragState, setDragState] = useState(null);

    const getMousePos = useCallback((e) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
    }, [containerRef]);

    const handleMouseDown = useCallback((e) => {
        const pos = getMousePos(e);
        const handleSize = 5;
        let targetROI, setTargetROI;
        if (roiMode === 'win') { targetROI = winROI; setTargetROI = setWinROI; }
        else if (roiMode === 'balance') { targetROI = balanceROI; setTargetROI = setBalanceROI; }
        else if (roiMode === 'bet') { targetROI = betROI; setTargetROI = setBetROI; }
        else if (roiMode === 'orderId') { targetROI = orderIdROI; setTargetROI = setOrderIdROI; }
        else { targetROI = reelROI; setTargetROI = setReelROI; }

        const isOverHandle = pos.x >= targetROI.x + targetROI.w - handleSize && pos.x <= targetROI.x + targetROI.w &&
            pos.y >= targetROI.y + targetROI.h - handleSize && pos.y <= targetROI.y + targetROI.h;

        setDragState({
            action: isOverHandle ? 'resize' : 'move',
            startX: pos.x, startY: pos.y,
            initObj: { ...targetROI }, setter: setTargetROI
        });
    }, [roiMode, reelROI, setReelROI, winROI, setWinROI, balanceROI, setBalanceROI, betROI, setBetROI, orderIdROI, setOrderIdROI, getMousePos]);

    const handleMouseMove = useCallback((e) => {
        if (!dragState) return;
        const pos = getMousePos(e);
        const dx = pos.x - dragState.startX;
        const dy = pos.y - dragState.startY;
        if (dragState.action === 'move') {
            dragState.setter({
                ...dragState.initObj,
                x: Math.max(0, Math.min(100 - dragState.initObj.w, dragState.initObj.x + dx)),
                y: Math.max(0, Math.min(100 - dragState.initObj.h, dragState.initObj.y + dy))
            });
        } else {
            dragState.setter({
                ...dragState.initObj,
                w: Math.max(0.5, Math.min(100 - dragState.initObj.x, dragState.initObj.w + dx)),
                h: Math.max(0.5, Math.min(100 - dragState.initObj.y, dragState.initObj.h + dy))
            });
        }
    }, [dragState, getMousePos]);

    const handleMouseUp = useCallback(() => setDragState(null), []);

    return { handleMouseDown, handleMouseMove, handleMouseUp };
};

export default useROIDrag;
