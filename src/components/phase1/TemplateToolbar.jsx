import React from 'react';
import { Cloud, Trash2, Upload, Loader2 } from 'lucide-react';

/**
 * 模板工具列：雲端載入/存檔/清除
 */
export default function TemplateToolbar({
    setShowCloudModal, handleClearTemplate,
    templateName, setTemplateName,
    handleSaveToCloud, isSaving, activeSaveAction
}) {
    return (
        <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-100 flex flex-col lg:flex-row justify-between gap-4 items-center">
            <div className="flex w-full lg:w-auto gap-2">
                <button onClick={() => setShowCloudModal(true)} className="flex-1 lg:flex-none py-2.5 px-4 bg-white hover:bg-indigo-50 text-indigo-700 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 shadow-sm transition-colors border border-indigo-200">
                    <Cloud size={16} />瀏覽雲端模板庫
                </button>
                <button onClick={handleClearTemplate} className="flex-1 lg:flex-none py-2.5 px-4 bg-white hover:bg-rose-50 text-rose-600 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 shadow-sm transition-colors border border-rose-200">
                    <Trash2 size={16} />清除當前模板
                </button>
            </div>
            <div className="flex w-full lg:w-auto gap-2 items-stretch">
                <div className="flex bg-white rounded-lg shadow-sm border border-indigo-200 overflow-hidden flex-1 lg:flex-none">
                    <input
                        type="text"
                        placeholder={`儲存名稱 (預設: 平台-遊戲)`}
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="px-3 py-2 text-sm focus:outline-none w-full lg:w-48 text-slate-700 font-medium"
                    />
                    <button onClick={handleSaveToCloud} disabled={isSaving} className={`px-4 py-2 text-white text-sm font-bold flex items-center justify-center gap-1 shrink-0 transition-colors border-l border-indigo-200 ${isSaving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                        {isSaving && activeSaveAction === 'initial' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {isSaving && activeSaveAction === 'initial' ? '存檔中' : '存檔'}
                    </button>
                </div>
            </div>
        </div>
    );
}
