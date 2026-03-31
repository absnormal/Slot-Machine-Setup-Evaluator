import React from 'react';
import { ListChecks, LayoutGrid, FileText, ImagePlus, Upload, X, Trash2 } from 'lucide-react';
import step1Img from '../../assets/guide/step1.jpg';
import step2Img from '../../assets/guide/step2.jpg';
import step3Img from '../../assets/guide/step3.jpg';

/**
 * 連線模式設定：Paylines / All Ways 選擇，文字輸入/圖片提取工作區
 */
export default function LineModeConfig({
    lineMode, setLineMode,
    gridRows, setGridRows, gridCols, setGridCols,
    hasMultiplierReel, setHasMultiplierReel,
    linesMode, setLinesMode,
    linesTextInput, setLinesTextInput,
    extractResults, setExtractResults,
    lineImages, removeLineImage, activeLineImageId, setActiveLineImageId, handleLineImageUpload,
    dragState, setDragState, containerRef, layoutStyle, handleMouseDown, handleMouseMove, handleMouseUp,
    canvasRef, draw, canvasSize, p1, pEnd, analyzeImage, startIndex, setStartIndex,
    patternRows, setPatternRows, patternCols, setPatternCols, linesTabMode, setLinesTabMode,
    activeLineImage, imageSrc, imageObj
}) {
    return (
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            {/* Line Mode Selector */}
            <div className="mb-4 border-b border-slate-200 pb-4">
                <label className="text-base font-bold text-slate-800 mb-3 block">連線模式設定</label>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setLineMode('paylines')} className={`p-3 rounded-xl border-2 text-left transition-all ${lineMode === 'paylines' ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <p className="text-sm font-bold mb-2 flex items-center gap-1.5"><ListChecks size={14} className="text-indigo-500" /> 固定線獎 (Paylines)</p>
                        <div className="bg-slate-900 rounded-lg p-2 mb-2">
                            <div className="grid grid-cols-5 gap-0.5">
                                {Array(15).fill(0).map((_,i) => (
                                    <div key={i} className={`h-6 rounded-sm ${i>=5&&i<10 ? 'bg-yellow-400/80 ring-1 ring-yellow-300' : 'bg-slate-700'}`} />
                                ))}
                            </div>
                            <div className="text-[9px] text-yellow-300 text-center mt-1 font-bold">← Line 1：中間一排全連 →</div>
                        </div>
                        <p className="text-[11px] text-slate-500">依固定路徑判定連線，需設定每條線的 Row 位置</p>
                    </button>
                    <button onClick={() => setLineMode('allways')} className={`p-3 rounded-xl border-2 text-left transition-all ${lineMode === 'allways' ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <p className="text-sm font-bold mb-2 flex items-center gap-1.5"><LayoutGrid size={14} className="text-emerald-500" /> All Ways</p>
                        <div className="bg-slate-900 rounded-lg p-2 mb-2">
                            <div className="grid grid-cols-5 gap-0.5">
                                {Array(15).fill(0).map((_,i) => {
                                    const hl = [0,5,10,1,6,2];
                                    return <div key={i} className={`h-6 rounded-sm ${hl.includes(i) ? 'bg-emerald-400/80 ring-1 ring-emerald-300' : 'bg-slate-700'}`} />;
                                })}
                            </div>
                            <div className="text-[9px] text-emerald-300 text-center mt-1 font-bold">← 相鄰 Reel 同符號即中獎 →</div>
                        </div>
                        <p className="text-[11px] text-slate-500">左到右相鄰 Reel 有相同符號即贏，不限位置</p>
                    </button>
                </div>
            </div>

            {/* All Ways Config */}
            {lineMode === 'allways' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg"><LayoutGrid size={24} className="text-indigo-600" /></div>
                        <div>
                            <p className="text-sm font-bold text-indigo-800">All Ways 模式</p>
                            <p className="text-xs text-indigo-600">不使用固定賠付線，從左至右逐 Reel 檢查相鄰符號。Ways 數 = 各 Reel 匹配數量的乘積。</p>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 font-bold">Row</span>
                            <input type="number" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-16 border border-indigo-300 rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" min="1" />
                        </div>
                        <span className="text-slate-400 font-bold">×</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 font-bold">Col</span>
                            <input type="number" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-16 border border-indigo-300 rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" min="1" />
                        </div>
                        <span className="text-slate-400 font-bold">=</span>
                        <div className="bg-white px-3 py-1.5 rounded-lg border border-indigo-300 shadow-sm flex items-center">
                            <span className="text-lg font-black text-indigo-700">{Math.pow(gridRows, gridCols).toLocaleString()}</span>
                            <span className="text-xs text-indigo-500 ml-1 font-bold">Ways</span>
                        </div>
                        <label className="flex items-center gap-2 ml-4 cursor-pointer">
                            <input type="checkbox" checked={hasMultiplierReel} onChange={e => setHasMultiplierReel(e.target.checked)} className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500" />
                            <span className="text-sm font-bold text-slate-700">啟用全盤乘倍</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Paylines Config */}
            {lineMode === 'paylines' && (
                <>
                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                        <label className="text-base font-bold text-slate-800">線獎資料設定</label>
                        <div className="flex bg-slate-200 p-1 rounded-lg">
                            <button
                                onClick={() => {
                                    setLinesTextInput(extractResults.map(r => r.data.join(' ')).join('\n'));
                                    setLinesMode('text');
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md transition-all ${linesMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <FileText size={16} /><span>純文字輸入</span>
                            </button>
                            <button
                                onClick={() => setLinesMode('image')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md transition-all ${linesMode === 'image' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <ImagePlus size={16} /><span>圖片提取</span>
                            </button>
                        </div>
                    </div>

                    {linesMode === 'text' && (
                        <div className="flex flex-col lg:flex-row gap-6">
                            <div className="flex-1 flex flex-col">
                                <textarea
                                    value={linesTextInput}
                                    onChange={(e) => {
                                        setLinesTextInput(e.target.value);
                                        const validLines = e.target.value.split('\n').map(l => l.trim()).filter(l => l !== '');
                                        const newResults = validLines.map((line, idx) => {
                                            const nums = line.match(/\d+/g);
                                            if (!nums) return null;
                                            let data = nums.map(Number);
                                            if (data.length > gridCols) data = data.slice(-gridCols);
                                            return { id: idx + 1, data };
                                        }).filter(Boolean);
                                        setExtractResults(newResults);
                                    }}
                                    className="w-full flex-1 min-h-[350px] p-4 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                                    placeholder={"請輸入連線矩陣，每行代表一條連線的列數 (Row)\n格式範例:\n2 2 2 2 2\n1 1 1 1 1\n3 3 3 3 3"}
                                />
                            </div>
                            <div className="w-full lg:w-80 bg-white border border-slate-300 rounded-lg flex flex-col shadow-sm shrink-0 h-[350px]">
                                <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                                    <label className="text-xs text-slate-500 uppercase font-bold mb-2 block">遊戲盤面 (單一網格大小)</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <span className="text-xs block mb-1 text-slate-700 font-bold">Row (列數)</span>
                                            <input type="number" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold" min="1" />
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-xs block mb-1 text-slate-700 font-bold">Col (欄數)</span>
                                            <input type="number" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-full border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold" min="1" />
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 mt-3 cursor-pointer">
                                        <input type="checkbox" checked={hasMultiplierReel} onChange={e => setHasMultiplierReel(e.target.checked)} className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500" />
                                        <span className="text-sm font-bold text-slate-700">啟用全盤乘倍</span>
                                    </label>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                    <label className="text-xs text-slate-500 uppercase font-bold mb-2 block">已提取結果 ({extractResults.length} 條)</label>
                                    {extractResults.length === 0 ? (
                                        <div className="text-slate-400 text-center mt-6 text-sm">尚未提取任何數據。</div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {extractResults.map((res) => {
                                                const hasZero = res.data.includes(0);
                                                const lengthWarning = res.data.length !== gridCols;
                                                return (
                                                    <div key={res.id} className={`flex items-center justify-between p-2 rounded text-sm bg-slate-50 border ${hasZero || lengthWarning ? 'border-rose-400 bg-rose-50' : 'border-slate-100'} transition-colors`}>
                                                        <span className="font-mono text-indigo-600 font-bold w-8">{res.id.toString().padStart(2, '0')}.</span>
                                                        <span className={`font-mono tracking-widest ${hasZero || lengthWarning ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>{res.data.join(', ')}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {linesMode === 'image' && (
                        <div
                            className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col xl:flex-row transition-all duration-300"
                            style={{ height: layoutStyle.wrapperHeight }}
                        >
                            <div className="flex-1 relative flex flex-col bg-slate-900 transition-all duration-300 min-h-[400px]">
                                {lineImages.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto p-3 bg-slate-950 border-b border-slate-800 shrink-0 custom-scrollbar z-20">
                                        {lineImages.map(img => (
                                            <div key={img.id} onClick={() => setActiveLineImageId(img.id)} className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${activeLineImageId === img.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                                                <img src={img.previewUrl} className="w-full h-full object-cover" />
                                                <button onClick={(e) => { e.stopPropagation(); removeLineImage(img.id); }} className="absolute top-0 right-0 bg-rose-500 text-white p-0.5 rounded-bl-lg hover:bg-rose-600 transition-colors"><X size={12} /></button>
                                            </div>
                                        ))}
                                        <label className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-slate-500 text-slate-400 transition-colors" title="上傳更多圖片">
                                            <Upload size={20} className="mb-1" /><span className="text-[10px]">新增</span>
                                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleLineImageUpload} />
                                        </label>
                                    </div>
                                )}
                                <div className="flex-1 relative flex flex-col p-4 overflow-y-auto custom-scrollbar">
                                    {!imageSrc ? (
                                        <div className="m-auto w-full text-center flex flex-col items-center">
                                            <div className="w-full max-w-md">
                                                <label htmlFor="slot-image-upload" className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition inline-flex items-center space-x-2 shadow-lg w-full justify-center">
                                                    <Upload size={18} /><span>上傳老虎機連線圖 (可多選)</span>
                                                    <input id="slot-image-upload" type="file" className="hidden" multiple accept="image/*" onChange={handleLineImageUpload} />
                                                </label>
                                                <p className="mt-4 text-slate-400 text-sm leading-relaxed mb-8">支援一次上傳多張連線圖進行分批提取 (JFIF/JPG/PNG)<br />或在上方點擊「瀏覽雲端模板庫」直接套用</p>
                                            </div>
                                            <div className="w-full max-w-5xl border border-slate-700/50 rounded-xl p-6 bg-slate-900/50 shadow-inner text-left">
                                                <span className="text-sm text-slate-400 font-bold mb-4 flex items-center justify-center gap-1.5">操作步驟說明</span>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                    {[{ num: 1, src: step1Img }, { num: 2, src: step2Img }, { num: 3, src: step3Img }].map(s => (
                                                        <div key={s.num} className="bg-slate-800 rounded-xl border-2 border-slate-600 overflow-hidden shadow-2xl relative group hover:border-indigo-400 transition-colors">
                                                            <img src={s.src} alt={`Step ${s.num}`} className="w-full h-auto object-cover block group-hover:scale-105 transition-transform duration-500" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="relative w-full max-w-4xl mx-auto my-auto shrink-0">
                                            <img src={imageSrc} alt="layout" className="w-full h-auto opacity-0 pointer-events-none select-none block" />
                                            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair border border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-sm" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="w-full xl:w-80 bg-slate-800 border-t xl:border-t-0 xl:border-l border-slate-700 flex flex-col xl:h-auto shrink-0">
                                <div className="p-4 border-b border-slate-700 flex-shrink-0">
                                    <div className="flex justify-between items-center mb-3">
                                        <h2 className="text-lg font-bold text-white">連線擷取設定</h2>
                                        {extractResults.length > 0 && (
                                            <button onClick={() => setExtractResults([])} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-500/10 px-2 py-1 rounded transition-colors"><Trash2 size={12} /> 清空所有結果</button>
                                        )}
                                    </div>
                                    {imageSrc && (
                                        <div className="mb-4 bg-slate-900/50 rounded-lg p-2.5 text-xs border border-slate-700">
                                            <div className="flex items-center gap-2 mb-1.5"><div className="w-2.5 h-2.5 bg-indigo-500 border border-slate-400 rounded-sm shrink-0"></div><span className="text-slate-300">藍框對準第 <b className="text-white">{patternRows * patternCols}</b> 個圖案</span></div>
                                            <div className="flex items-center gap-2 mb-1.5"><div className="w-2.5 h-2.5 bg-rose-500 border border-slate-400 rounded-sm shrink-0"></div><span className="text-slate-300">紅框對準第 <b className="text-white">{patternRows * patternCols}</b> 個圖案</span></div>
                                            <div className="text-slate-500 mt-1">※ 拖曳框的右下角可縮放大小</div>
                                        </div>
                                    )}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">圖片配置 (圖案陣列)</label>
                                            <div className="flex gap-2">
                                                <div className="flex-1"><span className="text-xs block mb-1 text-slate-300">總行數 (Rows)</span><input type="number" value={patternRows} onChange={e => setPatternRows(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" min="1" /></div>
                                                <div className="flex-1"><span className="text-xs block mb-1 text-slate-300">總列數 (Cols)</span><input type="number" value={patternCols} onChange={e => setPatternCols(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" min="1" /></div>
                                            </div>
                                            <div className="mt-3 bg-indigo-900/20 border border-indigo-500/30 p-2 rounded-lg">
                                                <div className="flex justify-between items-end mb-1">
                                                    <span className="text-xs block text-indigo-300 font-bold">此圖起始連線編號 (Start ID)</span>
                                                    {extractResults.length > 0 && (
                                                        <button onClick={() => setStartIndex(Math.max(...extractResults.map(r => r.id)) + 1)} className="text-[10px] text-indigo-400 hover:text-indigo-200 border border-indigo-500/40 hover:border-indigo-400 px-1.5 py-0.5 rounded transition-colors" title="自動設定為目前已提取的最大編號 + 1">接續最大編號</button>
                                                    )}
                                                </div>
                                                <input type="number" value={startIndex} onChange={e => setStartIndex(Number(e.target.value))} className="w-full bg-slate-800 border border-indigo-500/50 rounded px-2 py-1.5 text-white font-bold focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" min="1" />
                                            </div>
                                        </div>
                                        <div className="pt-3 border-t border-slate-700/50">
                                            <label className="text-xs text-slate-400 uppercase font-bold mb-2 block text-rose-400">遊戲盤面 (單一網格大小)</label>
                                            <div className="flex gap-2">
                                                <div className="flex-1"><span className="text-xs block mb-1 text-slate-300">Row (列數)</span><input type="number" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500" min="1" /></div>
                                                <div className="flex-1"><span className="text-xs block mb-1 text-slate-300">Col (欄數)</span><input type="number" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500" min="1" /></div>
                                            </div>
                                        </div>
                                        <button onClick={analyzeImage} disabled={!imageSrc} className={`w-full py-2.5 rounded font-bold transition flex items-center justify-center space-x-2 ${!imageSrc ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}>
                                            <span>提取當前圖片連線</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900/50">
                                    <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">已提取總結果 ({extractResults.length} 條)</label>
                                    {extractResults.length === 0 ? (
                                        <div className="text-slate-500 text-center mt-6 text-sm">尚未提取任何數據。</div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {extractResults.map((res) => (
                                                <div key={res.id} className="flex items-center justify-between p-2 rounded text-sm bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-colors">
                                                    <span className="font-mono text-indigo-400 font-bold w-8">{res.id.toString().padStart(2, '0')}.</span>
                                                    <span className="font-mono tracking-widest text-slate-200">{res.data.join(', ')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
