import React from 'react';
import { X } from 'lucide-react';

/**
 * PreviewLightbox — 全幀截圖預覽 Lightbox
 * 顯示盤面停輪截圖與 WIN 特工截圖的全螢幕預覽
 */
const PreviewLightbox = ({ previewImage, onClose }) => {
    if (!previewImage) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center cursor-pointer animate-in fade-in duration-200"
            onClick={onClose}>
            <div className="relative flex gap-4 max-w-[95vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="relative">
                    <img src={previewImage.url} alt="reel-stop" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl border border-white/10" />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-xl">
                        <span className="text-white text-sm font-mono">🎰 盤面 @ {previewImage.time.toFixed(2)}s</span>
                    </div>
                </div>
                {previewImage.url2 && (
                    <div className="relative">
                        <img src={previewImage.url2} alt="win-poll" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl border-2 border-amber-400/60" />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-xl">
                            <span className="text-amber-300 text-sm font-mono">🕵️ WIN 特工 @ {previewImage.time2?.toFixed(2) || '?'}s</span>
                        </div>
                    </div>
                )}
                <button onClick={onClose}
                    className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 transition-colors">
                    <X size={16} className="text-slate-700" />
                </button>
            </div>
        </div>
    );
};

export default PreviewLightbox;
