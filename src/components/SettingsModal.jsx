import React from 'react';
import { Settings, X, Key, Moon, Github } from 'lucide-react';

export default function SettingsModal({ show, customApiKey, setCustomApiKey, isDarkMode, setIsDarkMode, onClose, onSave }) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-800"><Settings className="text-indigo-500" /><span>環境與金鑰設定</span></h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5"><Key size={16} className="text-amber-500" /> 1. Gemini API Key (AI 辨識必填)</label>
                            <p className="text-xs text-slate-500 mb-3 leading-relaxed">提供給 AI 解析賠率表與截圖使用，將安全儲存於您的瀏覽器本地端 (localStorage)。</p>
                            <input
                                type="password"
                                placeholder="請輸入 AIzaSy..."
                                value={customApiKey}
                                onChange={(e) => setCustomApiKey(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono tracking-wider mb-2"
                            />
                        </div>
                        
                        <div className="pt-2 border-t border-slate-100">
                            <p className="text-[11px] text-slate-500 mb-2">💡 尚未有 API Key？您可以前往 Google AI Studio 免費申請：</p>
                            <a 
                                href="https://aistudio.google.com/app/api-keys" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors border border-slate-200"
                            >
                                <img src="https://www.gstatic.com/lamda/images/favicon_v2_16x16.png" alt="Google" className="w-3.5 h-3.5" />
                                獲取 Gemini API Key (Google AI Studio)
                            </a>
                        </div>
                    </div>

                    {/* 暗黑模式設定 */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-1"><Moon size={16} className="text-indigo-500" /> 2. 暗黑模式 (Beta)</label>
                            <p className="text-xs text-slate-500">減輕長時間盯著螢幕的眼睛疲勞。切換後即時生效，無需重整頁面。</p>
                        </div>
                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                            <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${isDarkMode ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                        <h3 className="text-sm font-bold text-indigo-800 mb-1">💡 關於 Google Sheets 雲端資料庫</h3>
                        <p className="text-xs text-indigo-700/80 leading-relaxed space-y-1">
                            <span>本工具已切換為無伺服器 (Serverless) 的 Google Sheets 儲存方案。</span><br />
                            <span>您的模板庫網址已安全地內嵌於程式碼中，無需在此設定。</span><br />
                            <span className="inline-block mt-1 pt-1 border-t border-indigo-200 font-medium">持有帳號：oldts001@gmail.com</span>
                        </p>
                    </div>
                    
                    {/* GitHub 專案連結 */}
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-1"><Github size={16} className="text-slate-700" /> 3. 關於專案 (GitHub)</h3>
                        <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                            本專案為開源維護，歡迎前往 GitHub 追蹤最新進度或回報問題。
                        </p>
                        <a 
                            href="https://github.com/absnormal/Slot-Machine-Setup-Evaluator" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition-colors border border-slate-200 shadow-sm"
                        >
                            <Github size={14} className="text-slate-600" /> 
                            前往 Slot-Machine-Setup-Evaluator
                        </a>
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
