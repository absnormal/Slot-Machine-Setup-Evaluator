import React from 'react';
import { Plus, X, Image as ImageIcon } from 'lucide-react';
import { useLightbox } from '../../hooks/useLightbox';

/**
 * 賠率表符號縮圖手動擷取 Modal
 * 包含：多圖切換、框選擷取、Lightbox 預覽
 */
export default function PtCropModal({
    ptCropState,
    setPtCropState,
    ptImages,
    ptResultItems,
    setPtResultItems,
    ptCropImageRef,
    ptEnlargedImg,
    setPtEnlargedImg
}) {
    const { lightboxState, handleLbDragStart, handleLbResizeStart } = useLightbox(ptEnlargedImg);

    if (!ptCropState.active) return null;

    const handleCropConfirm = () => {
        const img = ptCropImageRef.current;
        const rect = img.getBoundingClientRect();
        const sX = img.naturalWidth / rect.width, sY = img.naturalHeight / rect.height;

        const startX = Math.min(ptCropState.startX, ptCropState.endX);
        const startY = Math.min(ptCropState.startY, ptCropState.endY);
        const cW = Math.abs(ptCropState.startX - ptCropState.endX) * sX;
        const cH = Math.abs(ptCropState.startY - ptCropState.endY) * sY;

        // 防呆：如果只有點一下沒有拖曳寬高，則不進行擷取
        if (cW <= 0 || cH <= 0) {
            setPtCropState(p => ({ ...p, active: false }));
            return;
        }

        const canvas = document.createElement('canvas');

        // 壓縮補強：限制最大尺寸並使用 JPEG 0.7
        const MAX_THUMB_SIZE = 128;
        let targetW = cW;
        let targetH = cH;
        if (cW > MAX_THUMB_SIZE || cH > MAX_THUMB_SIZE) {
            if (cW > cH) {
                targetW = MAX_THUMB_SIZE;
                targetH = (cH / cW) * MAX_THUMB_SIZE;
            } else {
                targetH = MAX_THUMB_SIZE;
                targetW = (cW / cH) * MAX_THUMB_SIZE;
            }
        }

        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, startX * sX, startY * sY, cW, cH, 0, 0, targetW, targetH);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);

        setPtResultItems(prev => {
            const arr = [...prev];
            const targetField = ptCropState.isDouble ? 'doubleThumbUrls' : 'thumbUrls';
            if (!arr[ptCropState.itemIndex][targetField]) {
                arr[ptCropState.itemIndex][targetField] = [];
            }
            arr[ptCropState.itemIndex][targetField].push(compressedDataUrl);
            return arr;
        });
        setPtCropState(p => ({ ...p, active: false }));
    };

    const selectedImage = ptImages.find(img => img.id === ptCropState.selectedImageId);

    return (
        <>
            <div className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" style={{ zIndex: 99999 }}>
                <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col border border-slate-700 h-[80vh]">
                    <div className="flex flex-col border-b border-slate-700 shrink-0">
                        <div className="flex items-center justify-between p-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                手動擷取: <span className="text-indigo-400">{ptCropState.isDouble ? '雙重 ' : ''}{ptResultItems[ptCropState.itemIndex]?.name}</span>
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={handleCropConfirm} className="bg-indigo-600 hover:bg-indigo-500 transition-colors text-white px-4 py-1.5 rounded font-bold shadow-md flex items-center gap-1">
                                    <Plus size={16} /> 增加特徵圖
                                </button>
                                <button onClick={() => setPtCropState(p => ({ ...p, active: false }))} className="text-slate-400 hover:text-white p-1 transition-colors ml-2"><X /></button>
                            </div>
                        </div>

                        {/* 多圖切換區塊 */}
                        {ptImages.length > 1 && (
                            <div className="flex gap-2 px-4 pb-3 overflow-x-auto custom-scrollbar">
                                {ptImages.map((img, idx) => (
                                    <button
                                        key={img.id}
                                        onClick={() => setPtCropState(p => ({ ...p, selectedImageId: img.id, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false }))}
                                        className={`relative w-14 h-14 shrink-0 rounded-lg border-2 overflow-hidden transition-all ${ptCropState.selectedImageId === img.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'border-slate-700 opacity-50 hover:opacity-100 hover:border-slate-500'}`}
                                        title={`切換至圖片 ${idx + 1}`}
                                    >
                                        <img src={img.previewUrl} className="w-full h-full object-cover" />
                                        <span className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1.5 font-bold rounded-tl-md">{idx + 1}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 bg-black overflow-auto flex p-4">
                        <div className="relative inline-block m-auto shrink-0">
                            <img
                                ref={ptCropImageRef}
                                src={selectedImage?.previewUrl}
                                draggable={false}
                                className="max-h-[70vh] max-w-full block cursor-crosshair shadow-2xl"
                                onMouseDown={(e) => {
                                    const r = e.target.getBoundingClientRect();
                                    setPtCropState(p => ({ ...p, startX: e.clientX - r.left, startY: e.clientY - r.top, endX: e.clientX - r.left, endY: e.clientY - r.top, isDragging: true }));
                                }}
                                onMouseMove={(e) => {
                                    if (!ptCropState.isDragging) return;
                                    const r = e.target.getBoundingClientRect();
                                    setPtCropState(p => ({ ...p, endX: e.clientX - r.left, endY: e.clientY - r.top }));
                                }}
                                onMouseUp={() => setPtCropState(p => ({ ...p, isDragging: false }))}
                                onMouseLeave={() => setPtCropState(p => ({ ...p, isDragging: false }))}
                            />
                            {(ptCropState.isDragging || (Math.abs(ptCropState.startX - ptCropState.endX) > 0 && Math.abs(ptCropState.startY - ptCropState.endY) > 0)) && (
                                <div className="absolute border-2 border-indigo-500 bg-indigo-500/30 pointer-events-none" style={{ left: Math.min(ptCropState.startX, ptCropState.endX), top: Math.min(ptCropState.startY, ptCropState.endY), width: Math.abs(ptCropState.startX - ptCropState.endX), height: Math.abs(ptCropState.startY - ptCropState.endY) }} />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 放大檢視 (Lightbox) */}
            {ptEnlargedImg && (
                <div
                    className="fixed flex flex-col bg-slate-900/95 backdrop-blur-md rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] border border-slate-700"
                    style={{ zIndex: 9999, left: `${lightboxState.x}px`, top: `${lightboxState.y}px`, width: `${lightboxState.w}px`, height: `${lightboxState.h}px` }}
                >
                    <div className="flex justify-between items-center p-3 pb-2 cursor-move border-b border-slate-800 hover:bg-slate-800/50 rounded-t-xl transition-colors" onMouseDown={handleLbDragStart}>
                        <span className="text-white/80 text-sm font-bold flex items-center gap-1.5 select-none pointer-events-none"><ImageIcon size={16} className="text-indigo-400" /> 原圖預覽對照</span>
                        <button className="text-white/60 hover:text-white p-1 transition-colors hover:bg-rose-500 rounded-lg cursor-pointer z-[101]" onClick={(e) => { e.stopPropagation(); setPtEnlargedImg(null); }} onMouseDown={e => e.stopPropagation()}><X size={18} /></button>
                    </div>
                    <div className="flex-1 overflow-hidden flex items-center justify-center p-2 relative bg-black/40">
                        <img src={ptEnlargedImg} alt="Enlarged" className="max-w-full max-h-full object-contain drop-shadow-md pointer-events-none select-none" draggable={false} />
                    </div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize flex justify-end items-end p-2 text-slate-500 hover:text-indigo-400" onMouseDown={handleLbResizeStart} title="拖曳以縮放視窗">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 24 24 24 24 16"></polyline><line x1="14" y1="14" x2="24" y2="24"></line></svg>
                    </div>
                </div>
            )}
        </>
    );
}
