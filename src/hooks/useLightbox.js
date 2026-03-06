import { useState, useEffect, useRef } from 'react';

/**
 * 可拖拽/縮放的燈箱視窗 Hook
 * @param {boolean} isOpen - 燈箱是否開啟
 * @returns {{ lightboxState, handleLbDragStart, handleLbResizeStart }}
 */
export function useLightbox(isOpen) {
    const [lightboxState, setLightboxState] = useState({ x: 20, y: 20, w: 380, h: 500 });
    const [isDraggingLb, setIsDraggingLb] = useState(false);
    const [isResizingLb, setIsResizingLb] = useState(false);
    const lbDragRef = useRef({ startX: 0, startY: 0, initX: 0, initY: 0, initW: 0, initH: 0 });

    useEffect(() => {
        if (isOpen) {
            setLightboxState({
                x: Math.max(20, window.innerWidth * 0.05),
                y: Math.max(20, window.innerHeight - 540),
                w: Math.min(380, window.innerWidth * 0.9),
                h: Math.min(500, window.innerHeight * 0.8)
            });
        }
    }, [isOpen]);

    useEffect(() => {
        const handleGlobalMouseMove = (e) => {
            if (isDraggingLb) {
                const dx = e.clientX - lbDragRef.current.startX;
                const dy = e.clientY - lbDragRef.current.startY;
                setLightboxState(prev => ({ ...prev, x: lbDragRef.current.initX + dx, y: lbDragRef.current.initY + dy }));
            } else if (isResizingLb) {
                const dx = e.clientX - lbDragRef.current.startX;
                const dy = e.clientY - lbDragRef.current.startY;
                setLightboxState(prev => ({
                    ...prev,
                    w: Math.max(250, lbDragRef.current.initW + dx),
                    h: Math.max(250, lbDragRef.current.initH + dy)
                }));
            }
        };
        const handleGlobalMouseUp = () => {
            setIsDraggingLb(false);
            setIsResizingLb(false);
        };

        if (isDraggingLb || isResizingLb) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isDraggingLb, isResizingLb]);

    const handleLbDragStart = (e) => {
        setIsDraggingLb(true);
        lbDragRef.current = { ...lbDragRef.current, startX: e.clientX, startY: e.clientY, initX: lightboxState.x, initY: lightboxState.y };
    };

    const handleLbResizeStart = (e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizingLb(true);
        lbDragRef.current = { ...lbDragRef.current, startX: e.clientX, startY: e.clientY, initW: lightboxState.w, initH: lightboxState.h };
    };

    return { lightboxState, handleLbDragStart, handleLbResizeStart };
}
