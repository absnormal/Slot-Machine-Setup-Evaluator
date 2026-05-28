import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * 模板建構資料不足 / 格式錯誤提示 Modal
 * @param {{ message: string, onClose: () => void }} props
 */
export default function BuildErrorModal({ message, onClose }) {
    if (!message) return null;
    return (
        <div className="modal-overlay">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b flex items-center gap-2 bg-rose-50">
                    <AlertCircle className="text-rose-500" size={24} />
                    <h2 className="text-xl font-bold text-slate-800">資料不足或格式錯誤</h2>
                </div>
                <div className="p-6 text-slate-700 leading-relaxed font-medium">
                    {message}
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-primary px-6 bg-slate-800 hover:bg-slate-900 shadow-none">
                        我知道了
                    </button>
                </div>
            </div>
        </div>
    );
}
