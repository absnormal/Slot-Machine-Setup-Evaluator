import React from 'react';
import { Settings, X, Key } from 'lucide-react';

export default function SettingsModal({ show, customApiKey, setCustomApiKey, onClose, onSave }) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-800"><Settings className="text-indigo-500" /><span>環境與金鑰設定</span></h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5"><Key size={16} className="text-amber-500" /> 1. Gemini API Key (AI 辨識必填)</label>
                        <p className="text-xs text-slate-500 mb-3 leading-relaxed">提供給 AI 解析賠率表使用，將安全儲存於您的瀏覽器本地端 (localStorage)。</p>
                        <input
                            type="password"
                            placeholder="請輸入 AIzaSy..."
                            value={customApiKey}
                            onChange={(e) => setCustomApiKey(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono tracking-wider"
                        />
                    </div>
                    <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                        <h3 className="text-sm font-bold text-indigo-800 mb-1">💡 關於 Google Sheets 雲端資料庫</h3>
                        <p className="text-xs text-indigo-700/80 leading-relaxed">
                            本工具已切換為無伺服器 (Serverless) 的 Google Sheets 儲存方案。<br />
                            您的模板庫網址已安全地內嵌於程式碼中，無需在此設定。
                        </p>
                    </div>
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                    <button onClick={onSave} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-colors">
                        儲存並關閉
                    </button>
                </div>
            </div>
        </div>
    );
}
