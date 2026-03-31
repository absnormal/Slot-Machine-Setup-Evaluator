import React from 'react';
import { AlertCircle, Upload, X, Plus, ImagePlus, Loader2, LayoutList, Trash2 } from 'lucide-react';

/**
 * 賠率表設定：文字/圖片模式、AI 分析、結果表格編輯
 */
export default function PaytableConfig({
    paytableMode, setPaytableMode, paytableInput, handlePaytableTextChange,
    ptImages, removePtImage, clearPtAll, handlePtFileChange, handlePtDrop,
    isPtProcessing, hasApiKey, setShowPtModal,
    ptResultItems, setPtResultItems, ptCropState, setPtCropState,
    ptEnlargedImg, setPtEnlargedImg,
    handlePtTableChange, handlePtTableDelete, handleAddPtRow, handleRemoveThumb,
    hasDoubleSymbol, gridCols
}) {
    const [showNamingGuide, setShowNamingGuide] = React.useState(false);

    return (
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mt-6">
            <div className="flex flex-col">
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                        <label className="text-base font-bold text-slate-800">賠付表資料設定</label>
                        <button
                            onClick={() => setShowNamingGuide(!showNamingGuide)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold transition-all ${showNamingGuide ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            title="點擊查看特殊符號命名規則"
                        >
                            <AlertCircle size={14} />
                            {showNamingGuide ? '隱藏說明' : '命名規則說明'}
                        </button>
                    </div>
                    <div className="flex bg-slate-200 p-1 rounded-lg">
                        <button onClick={() => setPaytableMode('text')} className={`px-3 py-1.5 text-sm font-bold rounded-md ${paytableMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>純文字</button>
                        <button onClick={() => setPaytableMode('image')} className={`px-3 py-1.5 text-sm font-bold rounded-md ${paytableMode === 'image' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>圖片提取</button>
                    </div>
                </div>

                {/* Naming Guide */}
                {showNamingGuide && (
                    <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 text-indigo-800 border-b border-indigo-200 pb-2">
                            <AlertCircle size={18} className="text-indigo-600" />
                            <h4 className="font-black text-sm uppercase tracking-wider">特殊符號命名規則說明</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <div className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">W</div><div><p className="text-sm font-bold text-slate-800">WILD (百搭)</p><p className="text-xs text-slate-500 mt-0.5 leading-relaxed">名稱內必須包含 <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 text-indigo-600 font-bold mx-0.5">WILD</code> (不分大小寫)。<br />範例：WILD, JokerWILD, Super_Wild</p></div></div>
                                <div className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-pink-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">S</div><div><p className="text-sm font-bold text-slate-800">SCATTER (分散)</p><p className="text-xs text-slate-500 mt-0.5 leading-relaxed">名稱內必須包含 <code className="bg-white px-1 py-0.5 rounded border border-pink-200 text-pink-600 font-bold mx-0.5">SCATTER</code> (不分大小寫)。<br />範例：SCATTER, Bonus_Scatter</p></div></div>
                                <div className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">C</div><div><p className="text-sm font-bold text-slate-800">COLLECT (收集符號)</p><p className="text-xs text-slate-500 mt-0.5 leading-relaxed">名稱內必須包含 <code className="bg-white px-1 py-0.5 rounded border border-emerald-200 text-emerald-600 font-bold mx-0.5">COLLECT</code> (不分大小寫)。<br />範例：COLLECT, WILD_Collect</p></div></div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">JP</div><div><p className="text-sm font-bold text-slate-800">Jackpot (JP 獎項)</p><p className="text-xs text-slate-500 mt-0.5 leading-relaxed">名稱必須與「Jackpot 倍率設定」中所定義的名稱<span className="text-amber-600 font-bold mx-0.5 underline decoration-amber-300 decoration-2">完全一致</span>。<br />範例：GRAND, MAJOR, MINI (大小寫需相符)</p></div></div>
                                <div className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">xN</div><div><p className="text-sm font-bold text-slate-800">xN Multiplier (乘倍符號)</p><p className="text-xs text-slate-500 mt-0.5 leading-relaxed">名稱後綴必須為 <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 text-indigo-600 font-bold mx-0.5">_x數字</code>。<br />範例：Grape_x5, Seven_x10 (計算時視為該原符號)</p></div></div>
                                <div className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">$</div><div><p className="text-sm font-bold text-slate-800">CASH (金幣/現金符號)</p><p className="text-xs text-slate-500 mt-0.5 leading-relaxed">名稱必須以 <code className="bg-white px-1 py-0.5 rounded border border-slate-300 text-slate-700 font-bold mx-0.5">CASH</code> 開頭 (不分大小寫)。<br />範例：CASH_銅幣、CASH_金幣</p></div></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Text Mode */}
                {paytableMode === 'text' && (
                    <textarea
                        value={paytableInput}
                        onChange={(e) => handlePaytableTextChange(e.target.value)}
                        className="w-full flex-1 min-h-[220px] p-4 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                        placeholder={"格式：符號名稱 + 5格連線數賠率\n孔雀 0 0 1 2.5 5\n金幣 0 0 0.8 1.5 3..."}
                    />
                )}

                {/* Image Mode */}
                {paytableMode === 'image' && (
                    <div className="flex flex-col lg:flex-row gap-4 h-auto min-h-[400px]">
                        {/* Left: Upload */}
                        <div className="w-full lg:w-1/3 flex flex-col bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm relative">
                            <label onDragOver={(e) => e.preventDefault()} onDrop={handlePtDrop} className="flex-1 border-2 border-dashed border-slate-300 m-2 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors py-4">
                                <input type="file" className="hidden" multiple accept="image/*" onChange={handlePtFileChange} />
                                <Upload className="text-slate-400 mb-1" size={24} />
                                <p className="text-xs text-slate-500 font-medium">點擊或拖曳上傳賠率圖 (可多選)</p>
                            </label>

                            {ptImages.length > 0 && (
                                <div className="px-3 pb-2">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-xs font-semibold text-slate-500">已選 {ptImages.length} 張</span>
                                        <button onClick={clearPtAll} className="text-[10px] text-rose-500 hover:text-rose-700 font-bold">清空全部</button>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                        {ptImages.map(img => (
                                            <div key={img.id} className="relative w-12 h-12 shrink-0 rounded border border-slate-200 bg-slate-900 overflow-hidden cursor-pointer shadow-sm hover:border-indigo-400 transition-colors" onClick={() => setPtEnlargedImg(img.previewUrl)}>
                                                <img src={img.previewUrl} className="w-full h-full object-contain" />
                                                <button onClick={(e) => { e.stopPropagation(); removePtImage(img.id); }} className="absolute top-0 right-0 bg-rose-500 text-white rounded-bl opacity-80 hover:opacity-100 p-0.5 transition-opacity"><X size={10} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button onClick={() => setShowPtModal(true)} disabled={isPtProcessing || ptImages.length === 0 || !hasApiKey} className={`m-2 mt-0 py-2.5 rounded-lg font-bold flex justify-center items-center gap-1.5 shadow-sm transition-colors ${isPtProcessing || ptImages.length === 0 || !hasApiKey ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                                {isPtProcessing ? <Loader2 size={16} className="animate-spin" /> : null}
                                {isPtProcessing ? '分析中...' : 'AI 分析賠率'}
                            </button>
                            {!hasApiKey && ptImages.length > 0 && (
                                <div className="mx-2 mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                    <AlertCircle size={10} />未偵測到 API Key。請點擊右上角「齒輪」圖示進行設定。
                                </div>
                            )}
                        </div>

                        {/* Right: Result Table */}
                        <div className="w-full lg:w-2/3 bg-white border border-slate-300 rounded-lg overflow-auto shadow-sm relative">
                            {ptResultItems.length > 0 ? (
                                <div className="flex flex-col h-full">
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-600 sticky top-0 shadow-sm z-10">
                                                    <th className="p-2 border-b font-medium w-16 text-center">縮圖集</th>
                                                    {hasDoubleSymbol && <th className="p-2 border-b font-medium w-16 text-center text-indigo-600">雙重縮圖</th>}
                                                    <th className="p-2 border-b font-medium text-center w-12">名稱</th>
                                                    {[...Array(hasDoubleSymbol ? gridCols * 2 - 1 : gridCols - 1)].map((_, i) => (
                                                        <th key={i} className="p-2 border-b font-medium text-center w-12">{i + 2}連</th>
                                                    ))}
                                                    <th className="p-2 border-b font-medium text-center w-8"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ptResultItems.map((item, idx) => (
                                                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                                                        <td className="p-1.5">
                                                            <div className="flex flex-row flex-nowrap gap-1 items-center overflow-x-auto max-w-[120px]">
                                                                {item.thumbUrls && item.thumbUrls.map((url, tIdx) => (
                                                                    <div key={tIdx} className="relative w-7 h-7 bg-slate-800 rounded border border-slate-300 shadow-sm group/thumb">
                                                                        <img src={url} className="w-full h-full object-contain" />
                                                                        <button onClick={() => handleRemoveThumb(idx, tIdx)} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity"><X size={8} /></button>
                                                                    </div>
                                                                ))}
                                                                <button onClick={() => setPtCropState({ active: true, itemIndex: idx, selectedImageId: ptImages[0]?.id, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false, isDouble: false })} className="w-7 h-7 bg-slate-100 hover:bg-indigo-50 hover:border-indigo-300 rounded flex items-center justify-center border border-slate-200 border-dashed text-slate-400 hover:text-indigo-500 transition-colors" title="新增此符號的另一張特徵圖"><Plus size={12} /></button>
                                                            </div>
                                                        </td>
                                                        {hasDoubleSymbol && (
                                                            <td className="p-1.5 bg-indigo-50/30">
                                                                <div className="flex flex-row flex-nowrap gap-1 items-center overflow-x-auto max-w-[120px]">
                                                                    {item.doubleThumbUrls && item.doubleThumbUrls.map((url, tIdx) => (
                                                                        <div key={tIdx} className="relative w-7 h-7 bg-indigo-900 rounded border border-indigo-300 shadow-sm group/thumb-double">
                                                                            <img src={url} className="w-full h-full object-contain" />
                                                                            <button onClick={() => handleRemoveThumb(idx, tIdx, true)} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover/thumb-double:opacity-100 transition-opacity"><X size={8} /></button>
                                                                        </div>
                                                                    ))}
                                                                    <button onClick={() => setPtCropState({ active: true, itemIndex: idx, selectedImageId: ptImages[0]?.id, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false, isDouble: true })} className="w-7 h-7 bg-indigo-100 hover:bg-indigo-200 hover:border-indigo-400 rounded flex items-center justify-center border border-indigo-300 border-dashed text-indigo-500 hover:text-indigo-700 transition-colors shadow-inner" title="擷取此符號的雙重特徵圖"><ImagePlus size={12} /></button>
                                                                </div>
                                                            </td>
                                                        )}
                                                        <td className="p-1"><input type="text" value={item.name} onChange={(e) => handlePtTableChange(idx, 'name', e.target.value)} className="w-full font-bold text-slate-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1.5 py-1 outline-none transition-all" /></td>
                                                        {[...Array(hasDoubleSymbol ? gridCols * 2 - 1 : gridCols - 1)].map((_, i) => {
                                                            const matchKey = `match${i + 2}`;
                                                            return (
                                                                <td key={i} className="p-1">
                                                                    <input type="text" value={item[matchKey] || 0} onChange={(e) => handlePtTableChange(idx, matchKey, e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="p-1 text-center">
                                                            <button onClick={() => handlePtTableDelete(idx)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100" title="刪除此符號"><Trash2 size={14} /></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center sticky bottom-0 z-10 shrink-0">
                                        <button onClick={handleAddPtRow} className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:text-indigo-800 transition-colors py-1.5 px-4 rounded-md hover:bg-indigo-100 border border-indigo-200 bg-white shadow-sm">
                                            <Plus size={14} /> 新增賠付符號
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 p-4 text-center">
                                    <LayoutList size={28} className="mb-2 opacity-30" />
                                    <p className="text-sm font-medium">等待 AI 分析結果</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
