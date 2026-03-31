import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * 模板建構資料不足 / 格式錯誤提示 Modal
 * @param {{ message: string, onClose: () => void }} props
 */
export default function BuildErrorModal({ message, onClose }) {
    if (!message) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b flex items-center gap-2 bg-rose-50">
                    <AlertCircle className="text-rose-500" size={24} />
                    <h2 className="text-xl font-bold text-slate-800">資料不足或格式錯誤</h2>
                </div>
                <div className="p-6 text-slate-700 leading-relaxed font-medium">
                    {message}
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-md transition-colors">
                        我知道了
                    </button>
                </div>
            </div>
        </div>
    );
}
