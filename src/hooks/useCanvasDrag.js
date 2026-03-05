import { useState } from 'react';
import { toPx, toPct } from '../utils/helpers';

/**
 * Canvas 內矩形框的拖拽/縮放共用 Hook
 * @param {Object} imageObj - 圖片物件 (含 width, height)
 * @param {Object} position - 目前座標狀態 { x, y, w, h } (百分比)
 * @param {Function} setPosition - 座標 setter
 * @param {React.RefObject} canvasRef - canvas 的 ref
 * @returns {{ dragState, handleMouseDown, handleMouseMove, handleMouseUp, getMousePos }}
 */
export function useCanvasDrag(imageObj, position, setPosition, canvasRef) {
    const [dragState, setDragState] = useState(null);

    const getMousePos = (e) => {
        if (!canvasRef.current || !imageObj) return { x: 0, y: 0 };
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = imageObj.width / rect.width;
        const scaleY = imageObj.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    const handleMouseDown = (e) => {
        if (!imageObj) return;
        const pos = getMousePos(e);
        const handleSizePx = Math.max(12, Math.floor(imageObj.width / 60));

        const getPxRect = (obj) => ({
            x: toPx(obj.x, imageObj.width),
            y: toPx(obj.y, imageObj.height),
            w: toPx(obj.w, imageObj.width),
            h: toPx(obj.h, imageObj.height)
        });

        const rect = getPxRect(position);
        const isOverHandle = (x, y, r) => x >= r.x + r.w - handleSizePx * 1.5 && x <= r.x + r.w + handleSizePx * 1.5 && y >= r.y + r.h - handleSizePx * 1.5 && y <= r.y + r.h + handleSizePx * 1.5;
        const isOverRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

        if (isOverHandle(pos.x, pos.y, rect)) {
            setDragState({ action: 'resize', startX: pos.x, startY: pos.y, initObj: { ...position } });
        } else if (isOverRect(pos.x, pos.y, rect)) {
            setDragState({ action: 'move', startX: pos.x, startY: pos.y, initObj: { ...position } });
        }
    };

    const handleMouseMove = (e) => {
        if (!dragState || !imageObj) return;
        const pos = getMousePos(e);
        const dxPct = toPct(pos.x - dragState.startX, imageObj.width);
        const dyPct = toPct(pos.y - dragState.startY, imageObj.height);

        if (dragState.action === 'move') {
            setPosition({
                ...dragState.initObj,
                x: Math.max(0, Math.min(100 - dragState.initObj.w, dragState.initObj.x + dxPct)),
                y: Math.max(0, Math.min(100 - dragState.initObj.h, dragState.initObj.y + dyPct))
            });
        } else if (dragState.action === 'resize') {
            setPosition({
                ...dragState.initObj,
                w: Math.max(5, Math.min(100 - dragState.initObj.x, dragState.initObj.w + dxPct)),
                h: Math.max(5, Math.min(100 - dragState.initObj.y, dragState.initObj.h + dyPct))
            });
        }
    };

    const handleMouseUp = () => setDragState(null);

    return { dragState, handleMouseDown, handleMouseMove, handleMouseUp, getMousePos };
}
