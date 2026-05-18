/**
 * DataTablePanel.jsx — 資料表管理面板
 *
 * 放在 P5 FlowComposer 上方，提供 Excel 上傳、預覽、命名、移除功能。
 * 表格資料存入 useAppStore，供 FlowRunner 的 for_each_row 積木引用。
 */
import React, { useState, useRef } from 'react';
import { Upload, X, ChevronDown, ChevronRight, Table2, Edit3, Check } from 'lucide-react';
import useAppStore from '../../stores/useAppStore';
import { parseExcel } from '../../engine/spreadsheetIO';

const DataTablePanel = () => {
    const { dataTables, addDataTable, removeDataTable, renameDataTable } = useAppStore();
    const [isExpanded, setIsExpanded] = useState(false);
    const [previewTable, setPreviewTable] = useState(null); // 目前展開預覽的 table key
    const [editingName, setEditingName] = useState(null);   // 目前正在重命名的 table key
    const [editValue, setEditValue] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const tableEntries = Object.entries(dataTables);
    const tableCount = tableEntries.length;

    // 上傳 Excel
    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const parsed = await parseExcel(file);

            // 自動命名：table + 序號（避免重名）
            let baseName = parsed.name || 'table';
            let name = baseName;
            let counter = 1;
            while (dataTables[name]) {
                name = `${baseName}_${counter++}`;
            }

            addDataTable(name, {
                name,
                fileName: file.name,
                headers: parsed.headers,
                rows: parsed.rows,
            });

            setIsExpanded(true);
        } catch (err) {
            console.error('[DataTablePanel] Excel 解析失敗:', err);
            alert(`Excel 解析失敗: ${err.message}`);
        } finally {
            setIsUploading(false);
            // 清空 input 以便重複上傳同一檔案
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // 開始重命名
    const startRename = (key) => {
        setEditingName(key);
        setEditValue(key);
    };

    // 完成重命名
    const commitRename = () => {
        if (editingName && editValue.trim() && editValue.trim() !== editingName) {
            const newName = editValue.trim();
            // 檢查是否重名
            if (dataTables[newName]) {
                alert(`名稱「${newName}」已存在`);
                return;
            }
            renameDataTable(editingName, newName);
            if (previewTable === editingName) setPreviewTable(newName);
        }
        setEditingName(null);
    };

    if (tableCount === 0 && !isExpanded) {
        // 完全空白時只顯示上傳按鈕
        return (
            <div className="shrink-0">
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-dashed border-slate-600 hover:border-slate-500 transition-all w-full justify-center"
                >
                    <Upload size={12} />
                    {isUploading ? '解析中...' : '📊 上傳 Excel 資料表'}
                </button>
            </div>
        );
    }

    return (
        <div className="shrink-0 bg-slate-900/60 rounded-xl border border-slate-700/50 overflow-hidden">
            {/* ── 標題列 ── */}
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => setIsExpanded(prev => !prev)}
            >
                {isExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                <Table2 size={14} className="text-emerald-400" />
                <span className="text-xs font-medium text-slate-300">資料表</span>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 rounded-full">{tableCount}</span>
                <div className="flex-1" />
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
                <button
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    disabled={isUploading}
                    className="text-[10px] text-slate-500 hover:text-emerald-400 transition-colors px-1.5"
                >
                    {isUploading ? '解析中...' : '+ 上傳'}
                </button>
            </div>

            {/* ── 展開內容 ── */}
            {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                    {tableEntries.map(([key, table]) => (
                        <div key={key} className="bg-slate-950/50 rounded-lg border border-slate-700/30">
                            {/* 表格資訊列 */}
                            <div className="flex items-center gap-2 px-2.5 py-1.5">
                                <span className="text-slate-500 text-xs">📋</span>

                                {/* 名稱（可編輯） */}
                                {editingName === key ? (
                                    <div className="flex items-center gap-1 flex-1 min-w-0">
                                        <input
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingName(null); }}
                                            onBlur={commitRename}
                                            autoFocus
                                            className="bg-slate-800 border border-indigo-500 rounded text-xs text-slate-200 px-1.5 py-0.5 outline-none flex-1 min-w-0 font-mono"
                                        />
                                        <button onClick={commitRename} className="text-emerald-400 hover:text-emerald-300">
                                            <Check size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <span
                                        className="text-xs text-cyan-400 font-mono cursor-pointer hover:text-cyan-300 truncate flex-1 min-w-0"
                                        onDoubleClick={() => startRename(key)}
                                        title={`雙擊重命名 | 檔案: ${table.fileName}`}
                                    >
                                        {key}
                                    </span>
                                )}

                                <span className="text-[10px] text-slate-600 shrink-0">{table.rows.length}列</span>

                                {/* 預覽切換 */}
                                <button
                                    onClick={() => setPreviewTable(previewTable === key ? null : key)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${previewTable === key ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    預覽
                                </button>

                                {/* 重命名 */}
                                <button
                                    onClick={() => startRename(key)}
                                    className="text-slate-600 hover:text-slate-400 transition-colors"
                                    title="重命名"
                                >
                                    <Edit3 size={10} />
                                </button>

                                {/* 移除 */}
                                <button
                                    onClick={() => { removeDataTable(key); if (previewTable === key) setPreviewTable(null); }}
                                    className="text-slate-600 hover:text-rose-400 transition-colors"
                                    title="移除"
                                >
                                    <X size={12} />
                                </button>
                            </div>

                            {/* 預覽表格 */}
                            {previewTable === key && table.rows.length > 0 && (
                                <div className="px-2.5 pb-2 overflow-x-auto">
                                    <table className="w-full text-[10px] border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="text-slate-600 text-left px-1.5 py-1 border-b border-slate-800 font-normal">#</th>
                                                {table.headers.map(h => (
                                                    <th key={h} className="text-slate-400 text-left px-1.5 py-1 border-b border-slate-800 font-medium whitespace-nowrap">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {table.rows.slice(0, 5).map((row, i) => (
                                                <tr key={i} className="hover:bg-slate-800/50">
                                                    <td className="text-slate-600 px-1.5 py-0.5 border-b border-slate-800/50">{i + 1}</td>
                                                    {table.headers.map(h => (
                                                        <td key={h} className="text-slate-300 px-1.5 py-0.5 border-b border-slate-800/50 whitespace-nowrap max-w-[120px] truncate">
                                                            {row[h]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {table.rows.length > 5 && (
                                        <div className="text-[10px] text-slate-600 text-center pt-1">
                                            ... 共 {table.rows.length} 列（僅顯示前 5 列）
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DataTablePanel;
