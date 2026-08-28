import React, { useState } from 'react';
import { Settings, X, Key, Moon, Github, Cpu, Search, RefreshCw, Video } from 'lucide-react';
import { listGeminiModels, pickVisionModel } from '../utils/geminiApi';
import useAppStore from '../stores/useAppStore';

export default function SettingsModal({
    show,
    customApiKey, setCustomApiKey,
    isDarkMode, setIsDarkMode,
    onClose, onSave,
    apiProvider, setApiProvider,
    localEndpoint, setLocalEndpoint,
    localModel, setLocalModel,
    localApiKey, setLocalApiKey,
    geminiModel, setGeminiModel,
    geminiModelResolved,
}) {
    const showPhase4 = useAppStore(s => s.showPhase4);
    const setShowPhase4 = useAppStore(s => s.setShowPhase4);
    const [detecting, setDetecting] = useState(false);
    const [detectedModels, setDetectedModels] = useState([]);
    const [detectError, setDetectError] = useState('');

    const handleDetectModels = async () => {
        const key = (customApiKey || '').trim();
        if (!key) {
            setDetectError('請先輸入 Gemini API Key 再偵測');
            return;
        }
        setDetecting(true);
        setDetectError('');
        try {
            const models = await listGeminiModels(key);
            setDetectedModels(models);
            if (models.length === 0) setDetectError('這把 Key 沒有可用的視覺模型');
            // 未指定時，自動填入建議模型
            if (!geminiModel) {
                const best = pickVisionModel(models, '');
                if (best) setGeminiModel(best);
            }
        } catch (e) {
            setDetectError(e.message || '偵測失敗');
        } finally {
            setDetecting(false);
        }
    };

    if (!show) return null;

    const isGitHubPages =
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:' &&
        !window.location.hostname.includes('localhost') &&
        !window.location.hostname.includes('127.0.0.1');

    return (
        <div className="modal-overlay">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-800">
                        <Settings className="text-indigo-500" /><span>環境與金鑰設定</span>
                    </h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">

                    {/* ── 1. AI 模型來源 + 對應設定（整合區塊）── */}
                    <div className="card p-4 space-y-4">
                        <label className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            <Cpu size={16} className="text-indigo-500" /> 1. AI 模型設定
                        </label>

                        {/* 切換按鈕 */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setApiProvider('gemini')}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold border transition-colors ${
                                    apiProvider === 'gemini'
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                ☁️ Gemini（雲端）
                            </button>
                            <button
                                onClick={() => setApiProvider('local')}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold border transition-colors ${
                                    apiProvider === 'local'
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                🖥️ 地端模型
                            </button>
                        </div>

                        {/* Gemini 模式 */}
                        {apiProvider === 'gemini' && (
                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                                        <Key size={13} className="text-amber-500" /> Gemini API Key（必填）
                                    </label>
                                    <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                                        將安全儲存於您的瀏覽器本地端 (localStorage)，不會上傳至任何伺服器。
                                    </p>
                                    <input
                                        type="password"
                                        placeholder="AIzaSy..."
                                        value={customApiKey}
                                        onChange={(e) => setCustomApiKey(e.target.value)}
                                        className="input font-mono tracking-wider"
                                    />
                                </div>
                                <div className="pt-1">
                                    <p className="text-[11px] text-slate-500 mb-2">💡 尚未有 API Key？前往 Google AI Studio 免費申請：</p>
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

                                {/* 模型設定（留空＝自動偵測，免費層停用模型時自動換） */}
                                <div className="pt-3 border-t border-slate-100">
                                    <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                                        <Cpu size={13} className="text-indigo-500" /> 模型（留空＝自動選擇，建議）
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="留空＝自動偵測可用模型"
                                            value={geminiModel}
                                            onChange={(e) => setGeminiModel(e.target.value)}
                                            list="gemini-model-list"
                                            className="input font-mono text-xs flex-1"
                                        />
                                        <button
                                            onClick={handleDetectModels}
                                            disabled={detecting}
                                            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            title={(customApiKey || '').trim() ? '列出這把 Key 支援的視覺模型' : '請先輸入 Gemini API Key'}
                                        >
                                            {detecting ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                                            偵測可用模型
                                        </button>
                                    </div>
                                    <datalist id="gemini-model-list">
                                        {detectedModels.map((m) => <option key={m} value={m} />)}
                                    </datalist>
                                    {!(customApiKey || '').trim() && !detectError && (
                                        <p className="text-[11px] text-amber-600 mt-1">💡 請先在上方輸入 Gemini API Key，才能偵測可用模型</p>
                                    )}
                                    {detectError && <p className="text-[11px] text-red-500 mt-1">⚠️ {detectError}</p>}
                                    {!detectError && detectedModels.length > 0 && (
                                        <p className="text-[11px] text-emerald-600 mt-1">✅ 偵測到 {detectedModels.length} 個可用模型（點欄位可選）</p>
                                    )}
                                    {!geminiModel && geminiModelResolved && (
                                        <p className="text-[11px] text-slate-500 mt-1">目前自動使用：<span className="font-mono text-slate-700">{geminiModelResolved}</span></p>
                                    )}
                                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">留空時，工具會自動挑一個可用視覺模型；若之後被停用會自動換，不需手動改。</p>
                                </div>
                            </div>
                        )}

                        {/* 地端模式 */}
                        {apiProvider === 'local' && (
                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                {/* GitHub Pages 警告 */}
                                {isGitHubPages && (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <p className="text-xs text-amber-800 font-bold">⚠️ GitHub Pages 環境限制</p>
                                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                                            地端模型（HTTP）在 GitHub Pages（HTTPS）上會被瀏覽器封鎖。<br />
                                            請在本機 <code className="bg-amber-100 px-1 rounded">npm run dev</code> 環境下使用地端模式。
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Endpoint（Base URL）<span className="text-red-400 ml-1">*必填</span></label>
                                    <input
                                        type="text"
                                        placeholder="http://your-server/v1"
                                        value={localEndpoint}
                                        onChange={(e) => setLocalEndpoint(e.target.value)}
                                        className="input font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Model 名稱<span className="text-red-400 ml-1">*必填</span></label>
                                    <input
                                        type="text"
                                        placeholder="Model 名稱"
                                        value={localModel}
                                        onChange={(e) => setLocalModel(e.target.value)}
                                        className="input font-mono text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">API Key（若無可留空）</label>
                                    <input
                                        type="password"
                                        placeholder="API Key（選填）"
                                        value={localApiKey}
                                        onChange={(e) => setLocalApiKey(e.target.value)}
                                        className="input font-mono text-xs"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    需符合 OpenAI Chat Completions API 規格（<code>/v1/chat/completions</code>）。
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ── 2. 暗黑模式 ── */}
                    <div className="card p-4 flex items-center justify-between">
                        <div>
                            <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                                <Moon size={16} className="text-indigo-500" /> 2. 暗黑模式 (Beta)
                            </label>
                            <p className="text-xs text-slate-500">減輕長時間盯著螢幕的眼睛疲勞。切換後即時生效。</p>
                        </div>
                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                            <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${isDarkMode ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* ── 2.5 Phase 4/5 顯示開關 ── */}
                    <div className="card p-4 flex items-center justify-between">
                        <div>
                            <label className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                                <Video size={16} className="text-indigo-500" /> 顯示 Phase 4/5（影片分析與自動化）
                            </label>
                            <p className="text-xs text-slate-500">日常驗算用不到可保持關閉；開啟後完整模式才會出現 Phase 4 與底部自動化列。</p>
                        </div>
                        <button
                            onClick={() => setShowPhase4(!showPhase4)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${showPhase4 ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                            <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${showPhase4 ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* ── 3. 雲端資料庫 ── */}
                    <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                        <h3 className="text-sm font-bold text-indigo-800 mb-1">💡 關於 Google Sheets 雲端資料庫</h3>
                        <p className="text-xs text-indigo-700/80 leading-relaxed">
                            本工具已切換為無伺服器 (Serverless) 的 Google Sheets 儲存方案。<br />
                            您的模板庫網址已安全地內嵌於程式碼中，無需在此設定。<br />
                            <span className="inline-block mt-1 pt-1 border-t border-indigo-200 font-medium">持有帳號：oldts001@gmail.com</span>
                        </p>
                    </div>

                    {/* ── 4. GitHub ── */}
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                            <Github size={16} className="text-slate-700" /> 3. 關於專案 (GitHub)
                        </h3>
                        <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">本專案為開源維護，歡迎前往 GitHub 追蹤最新進度或回報問題。</p>
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

                <div className="modal-footer">
                    <button onClick={onSave} className="btn-primary px-6">
                        儲存並關閉
                    </button>
                </div>
            </div>
        </div>
    );
}
