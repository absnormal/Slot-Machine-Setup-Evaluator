import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * AI 賠率表分析前的確認 Modal
 * @param {{ show: boolean, onCancel: () => void, onConfirm: () => void }} props
 */
export default function PtConfirmModal({ show, onCancel, onConfirm }) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-5 border-b flex items-center gap-2 bg-slate-50">
                    <AlertCircle className="text-amber-500" />
                    <h2 className="text-xl font-bold">AI 分析前確認事項</h2>
                </div>
                <div className="p-6 text-sm text-slate-700 space-y-4">
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>確認賠率圖<strong className="text-rose-600">預設BET為 1</strong>。</li>
                        <li>AI 分析可能有誤，完成後請<strong className="text-indigo-600">人工比對表格</strong>並修正。<br /><span className="text-slate-500 text-xs mt-1 inline-block">【點開上傳圖片ICON可以方便人工比對表格】</span></li>
                        <li>(可選) 手動擷取縮圖供動畫預覽使用。</li>
                    </ol>
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-slate-600">取消</button>
                    <button onClick={onConfirm} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md">確認並分析</button>
                </div>
            </div>
        </div>
    );
}
