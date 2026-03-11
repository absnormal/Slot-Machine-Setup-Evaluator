import React from 'react';
import { Settings, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, FolderOpen, Cloud, Save, Upload, ListChecks, LayoutGrid, FileText, ImagePlus, X, PenTool, Crop, Check, Image as ImageIcon, Trash2, Plus, LayoutList, Trophy, Loader2 } from 'lucide-react';

export default function Phase1Setup(props) {
    const {
        templateMessage,
        isTemplateMinimized, setIsTemplateMinimized,
        template, templateError,
        showCloudModal, setShowCloudModal,
        handleImportLocalTemplate, handleExportLocalTemplate,
        templateName, setTemplateName, defaultSaveName,
        handleSaveToCloud, isSaving,
        platformName, setPlatformName,
        gameName, setGameName,
        lineMode, setLineMode,
        linesMode, setLinesMode,
        linesTextInput, setLinesTextInput,
        extractResults, setExtractResults,
        gridRows, setGridRows,
        gridCols, setGridCols,
        hasMultiplierReel, setHasMultiplierReel,
        lineImages, removeLineImage, activeLineImageId, setActiveLineImageId, handleLineImageUpload,
        isPtProcessing, handlePtExtract, ptImages, removePtImage, clearPtAll, handlePtFileChange, handlePtDrop,
        dragState, setDragState, containerRef, layoutStyle, handleMouseDown, handleMouseMove, handleMouseUp,
        canvasRef, draw, canvasSize, p1, pEnd, analyzeImage, startIndex, setStartIndex, threshold, setThreshold,
        patternRows, setPatternRows, patternCols, setPatternCols, linesTabMode, setLinesTabMode,
        activeLineImage, imageSrc, imageObj,
        paytableMode, setPaytableMode, paytableInput, setPaytableInput, handlePaytableTextChange,
        ptResultItems, setPtResultItems, ptCropState, setPtCropState, ptCropImageRef, ptEnlargedImg, setPtEnlargedImg,
        handlePtTableChange, handlePtTableDelete, handleAddPtRow, handleRemoveThumb,
        hasJackpot, setHasJackpot, jpConfig, setJpConfig, buildErrorMsg, handleBuildTemplate,
        showPtModal, setShowPtModal
    } = props;

    return (
        <>
                {/* Phase 1 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
                    <div
                        className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setIsTemplateMinimized(!isTemplateMinimized)}
                    >
                        <div className="flex items-center space-x-2">
                            <Settings className="text-indigo-500" size={20} />
                            <h2 className="text-xl font-semibold">Phase 1: 模板設定 (影像提取)</h2>
                        </div>
                        <div className="flex items-center space-x-4">
                            {template && isTemplateMinimized && (
                                <div className="flex items-center space-x-2 text-emerald-600 text-sm font-medium">
                                    <CheckCircle2 size={16} />
                                    <span>已載入: {template.rows}x{template.hasMultiplierReel ? template.cols - 1 : template.cols} 盤面, {template.linesCount} 條連線{template.hasMultiplierReel && ", 啟用乘倍輪"}</span>
                                </div>
                            )}
                            {isTemplateMinimized ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
                        </div>
                    </div>

                    {!isTemplateMinimized && (
                        <div className="p-6 pt-0 border-t border-slate-100 mt-4 space-y-6">

                            {templateError && (
                                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm font-bold flex items-center gap-2 animate-in fade-in zoom-in duration-200 shadow-sm">
                                    <AlertCircle size={18} className="shrink-0" />
                                    <span>{templateError}</span>
                                </div>
                            )}

                            <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-100 flex flex-col lg:flex-row justify-between gap-4 items-center">
                                <div className="flex w-full lg:w-auto gap-2">
                                    <label className="flex-1 lg:flex-none py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm border border-slate-200">
                                        <FolderOpen size={16} />載入本地模板
                                        <input type="file" className="hidden" accept=".json" onChange={handleImportLocalTemplate} />
                                    </label>
                                    <button onClick={() => setShowCloudModal(true)} className="flex-1 lg:flex-none py-2.5 px-4 bg-white hover:bg-indigo-50 text-indigo-700 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 shadow-sm transition-colors border border-indigo-200">
                                        <Cloud size={16} />瀏覽雲端模板庫
                                    </button>
                                </div>
                                <div className="flex w-full lg:w-auto gap-2 items-stretch">
                                    <button onClick={handleExportLocalTemplate} className="py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors shadow-sm border border-slate-200 shrink-0">
                                        <Save size={16} />匯出
                                    </button>
                                    <div className="flex bg-white rounded-lg shadow-sm border border-indigo-200 overflow-hidden flex-1 lg:flex-none">
                                        <input type="text" placeholder={`儲存名稱 (預設: ${defaultSaveName})`} value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="px-3 py-2 text-sm focus:outline-none w-full lg:w-48 text-slate-700 font-medium" />
                                        <button onClick={handleSaveToCloud} disabled={isSaving} className={`px-4 py-2 text-white text-sm font-bold flex items-center justify-center gap-1 shrink-0 transition-colors border-l border-indigo-200 ${isSaving ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                            <Upload size={16} /> 存檔
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">平台名稱</label>
                                        <input
                                            type="text"
                                            value={platformName}
                                            onChange={(e) => setPlatformName(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                            placeholder="例如: PG, JDB..."
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">遊戲名稱</label>
                                        <input
                                            type="text"
                                            value={gameName}
                                            onChange={(e) => setGameName(e.target.value)}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                            placeholder="例如: 麻將胡了, 40 Sparkling Crown..."
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                                    <label className="text-base font-bold text-slate-800">連線模式設定</label>
                                    <div className="flex bg-slate-200 p-1 rounded-lg">
                                        <button
                                            onClick={() => setLineMode('paylines')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md transition-all ${lineMode === 'paylines' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <ListChecks size={16} /><span>固定線獎 (Paylines)</span>
                                        </button>
                                        <button
                                            onClick={() => setLineMode('allways')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md transition-all ${lineMode === 'allways' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <LayoutGrid size={16} /><span>All Ways</span>
                                        </button>
                                    </div>
                                </div>

                                {lineMode === 'allways' && (
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-100 rounded-lg">
                                                <LayoutGrid size={24} className="text-indigo-600" />
                                            </div>
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
                                                <input
                                                    type="checkbox"
                                                    checked={hasMultiplierReel}
                                                    onChange={e => {
                                                        setHasMultiplierReel(e.target.checked);
                                                    }}
                                                    className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
                                                />
                                                <span className="text-sm font-bold text-slate-700">啟用特殊乘倍輪 (最後一軸)</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

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
                                                        placeholder="請輸入連線矩陣，每行代表一條連線的列數 (Row)&#10;格式範例:&#10;2 2 2 2 2&#10;1 1 1 1 1&#10;3 3 3 3 3"
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
                                                            <input
                                                                type="checkbox"
                                                                checked={hasMultiplierReel}
                                                                onChange={e => setHasMultiplierReel(e.target.checked)}
                                                                className="w-4 h-4 text-indigo-600 border-indigo-300 rounded focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm font-bold text-slate-700">啟用特殊乘倍輪 (最後一軸)</span>
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
                                                                <div
                                                                    key={img.id}
                                                                    onClick={() => setActiveLineImageId(img.id)}
                                                                    className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition-all 
                                    ${activeLineImageId === img.id ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                                >
                                                                    <img src={img.previewUrl} className="w-full h-full object-cover" />
                                                                    <button onClick={(e) => { e.stopPropagation(); removeLineImage(img.id); }} className="absolute top-0 right-0 bg-rose-500 text-white p-0.5 rounded-bl-lg hover:bg-rose-600 transition-colors">
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <label className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800 hover:border-slate-500 text-slate-400 transition-colors" title="上傳更多圖片">
                                                                <Upload size={20} className="mb-1" />
                                                                <span className="text-[10px]">新增</span>
                                                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleLineImageUpload} />
                                                            </label>
                                                        </div>
                                                    )}

                                                    <div className="flex-1 relative flex flex-col p-4 overflow-y-auto custom-scrollbar">
                                                        {!imageSrc ? (
                                                            <div className="m-auto text-center w-full max-w-md">
                                                                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-600">
                                                                    <ImageIcon size={32} className="text-slate-400" />
                                                                </div>
                                                                <label htmlFor="slot-image-upload" className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition inline-flex items-center space-x-2 shadow-lg w-full justify-center">
                                                                    <Upload size={18} />
                                                                    <span>上傳老虎機連線圖 (可多選)</span>
                                                                    <input id="slot-image-upload" type="file" className="hidden" multiple accept="image/*" onChange={handleLineImageUpload} />
                                                                </label>
                                                                <p className="mt-4 text-slate-400 text-sm leading-relaxed">
                                                                    支援一次上傳多張連線圖進行分批提取 (JFIF/JPG/PNG)<br />
                                                                    或在上方點擊「瀏覽雲端模板庫」直接套用
                                                                </p>

                                                                <div className="mt-6 border border-slate-700/50 rounded-xl p-4 bg-slate-900/50 shadow-inner text-left">
                                                                    <span className="text-xs text-slate-400 font-bold mb-3 flex items-center justify-center gap-1.5"><ImageIcon size={14} /> 線獎圖上傳範例參考 (40 Sparkling Crown)</span>
                                                                    <div className="w-full bg-[#000000] rounded-lg border border-slate-700 p-4 grid grid-cols-3 sm:grid-cols-6 gap-3 opacity-90 select-none shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                                                                        {[
                                                                            { id: '01', line: [1, 1, 1, 1, 1] }, { id: '02', line: [0, 0, 0, 0, 0] }, { id: '03', line: [2, 2, 2, 2, 2] },
                                                                            { id: '04', line: [3, 3, 3, 3, 3] }, { id: '05', line: [0, 1, 2, 1, 0] }, { id: '06', line: [2, 1, 0, 1, 2] }
                                                                        ].map((item) => (
                                                                            <div key={item.id} className="flex gap-1.5 items-center justify-center">
                                                                                <span className="text-[#fcd34d] text-[10px] font-mono font-bold tracking-widest">{item.id}</span>
                                                                                <div className="grid grid-cols-5 gap-[1px] bg-[#78350f] p-[1px] rounded-[2px] shadow-sm">
                                                                                    {Array.from({ length: 20 }).map((_, i) => {
                                                                                        const row = Math.floor(i / 5); const col = i % 5; const isLine = item.line[col] === row;
                                                                                        return <div key={i} className={`w-[6px] h-[4px] ${isLine ? 'bg-[#fde68a]' : 'bg-black'}`}></div>
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>

                                                            </div>
                                                        ) : (
                                                            <div className="relative w-full max-w-4xl mx-auto my-auto shrink-0">
                                                                <img src={imageSrc} alt="layout" className="w-full h-auto opacity-0 pointer-events-none select-none block" />
                                                                <canvas
                                                                    ref={canvasRef}
                                                                    className="absolute inset-0 w-full h-full cursor-crosshair border border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-sm"
                                                                    onMouseDown={handleMouseDown}
                                                                    onMouseMove={handleMouseMove}
                                                                    onMouseUp={handleMouseUp}
                                                                    onMouseLeave={handleMouseUp}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="w-full xl:w-80 bg-slate-800 border-t xl:border-t-0 xl:border-l border-slate-700 flex flex-col xl:h-auto shrink-0">
                                                    <div className="p-4 border-b border-slate-700 flex-shrink-0">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <h2 className="text-lg font-bold text-white">連線擷取設定</h2>
                                                            {extractResults.length > 0 && (
                                                                <button onClick={() => setExtractResults([])} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-500/10 px-2 py-1 rounded transition-colors">
                                                                    <Trash2 size={12} /> 清空所有結果
                                                                </button>
                                                            )}
                                                        </div>

                                                        {imageSrc && (
                                                            <div className="mb-4 bg-slate-900/50 rounded-lg p-2.5 text-xs border border-slate-700">
                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                    <div className="w-2.5 h-2.5 bg-indigo-500 border border-slate-400 rounded-sm shrink-0"></div>
                                                                    <span className="text-slate-300">藍框對準第 <b className="text-white">{patternRows * patternCols}</b> 個圖案</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                    <div className="w-2.5 h-2.5 bg-rose-500 border border-slate-400 rounded-sm shrink-0"></div>
                                                                    <span className="text-slate-300">紅框對準第 <b className="text-white">{patternRows * patternCols}</b> 個圖案</span>
                                                                </div>
                                                                <div className="text-slate-500 mt-1">※ 拖曳框的右下角可縮放大小</div>
                                                            </div>
                                                        )}

                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className="text-xs text-slate-400 uppercase font-bold mb-2 block">圖片配置 (圖案陣列)</label>
                                                                <div className="flex gap-2">
                                                                    <div className="flex-1">
                                                                        <span className="text-xs block mb-1 text-slate-300">總行數 (Rows)</span>
                                                                        <input type="number" value={patternRows} onChange={e => setPatternRows(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" min="1" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <span className="text-xs block mb-1 text-slate-300">總列數 (Cols)</span>
                                                                        <input type="number" value={patternCols} onChange={e => setPatternCols(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500" min="1" />
                                                                    </div>
                                                                </div>

                                                                <div className="mt-3 bg-indigo-900/20 border border-indigo-500/30 p-2 rounded-lg">
                                                                    <div className="flex justify-between items-end mb-1">
                                                                        <span className="text-xs block text-indigo-300 font-bold">此圖起始連線編號 (Start ID)</span>
                                                                        {extractResults.length > 0 && (
                                                                            <button
                                                                                onClick={() => setStartIndex(Math.max(...extractResults.map(r => r.id)) + 1)}
                                                                                className="text-[10px] text-indigo-400 hover:text-indigo-200 border border-indigo-500/40 hover:border-indigo-400 px-1.5 py-0.5 rounded transition-colors"
                                                                                title="自動設定為目前已提取的最大編號 + 1"
                                                                            >
                                                                                接續最大編號
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <input type="number" value={startIndex} onChange={e => setStartIndex(Number(e.target.value))} className="w-full bg-slate-800 border border-indigo-500/50 rounded px-2 py-1.5 text-white font-bold focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" min="1" />
                                                                </div>
                                                            </div>

                                                            <div className="pt-3 border-t border-slate-700/50">
                                                                <label className="text-xs text-slate-400 uppercase font-bold mb-2 block text-rose-400">遊戲盤面 (單一網格大小)</label>
                                                                <div className="flex gap-2">
                                                                    <div className="flex-1">
                                                                        <span className="text-xs block mb-1 text-slate-300">Row (列數)</span>
                                                                        <input type="number" value={gridRows} onChange={e => setGridRows(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500" min="1" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <span className="text-xs block mb-1 text-slate-300">Col (欄數)</span>
                                                                        <input type="number" value={gridCols} onChange={e => setGridCols(Number(e.target.value))} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500" min="1" />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <button
                                                                onClick={analyzeImage}
                                                                disabled={!imageSrc}
                                                                className={`w-full py-2.5 rounded font-bold transition flex items-center justify-center space-x-2 
                                  ${!imageSrc ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}
                                                            >
                                                                <Settings size={16} />
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

                            {/* Step 2: 賠率設定 */}
                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                                        <label className="text-base font-bold text-slate-800">賠付表資料設定</label>
                                        <div className="flex bg-slate-200 p-1 rounded-lg">
                                            <button onClick={() => setPaytableMode('text')} className={`px-3 py-1.5 text-sm font-bold rounded-md ${paytableMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>純文字</button>
                                            <button onClick={() => setPaytableMode('image')} className={`px-3 py-1.5 text-sm font-bold rounded-md ${paytableMode === 'image' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>圖片提取</button>
                                        </div>
                                    </div>
                                    {paytableMode === 'text' && (
                                        <textarea
                                            value={paytableInput}
                                            onChange={(e) => handlePaytableTextChange(e.target.value)}
                                            className="w-full flex-1 min-h-[220px] p-4 text-sm font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                                            placeholder="格式：符號名稱 + 5格連線數賠率&#10;孔雀 0 0 1 2.5 5&#10;金幣 0 0 0.8 1.5 3..."
                                        />
                                    )}
                                    {paytableMode === 'image' && (
                                        <div className="flex flex-col lg:flex-row gap-4 h-auto min-h-[400px]">
                                            <div className="w-full lg:w-1/3 flex flex-col bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm relative">
                                                <label
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={handlePtDrop}
                                                    className="flex-1 border-2 border-dashed border-slate-300 m-2 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors py-4"
                                                >
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

                                                <button onClick={() => setShowPtModal(true)} disabled={isPtProcessing || ptImages.length === 0} className={`m-2 mt-0 py-2.5 rounded-lg font-bold flex justify-center items-center gap-1.5 shadow-sm transition-colors ${isPtProcessing || ptImages.length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                                                    {isPtProcessing ? <Loader2 size={16} className="animate-spin" /> : null}
                                                    {isPtProcessing ? '分析中...' : 'AI 分析賠率'}
                                                </button>
                                            </div>
                                            <div className="w-full lg:w-2/3 bg-white border border-slate-300 rounded-lg overflow-auto shadow-sm relative">
                                                {ptResultItems.length > 0 ? (
                                                    <div className="flex flex-col h-full">
                                                        <div className="flex-1 overflow-auto">
                                                            <table className="w-full text-left border-collapse text-xs">
                                                                <thead>
                                                                    <tr className="bg-slate-100 text-slate-600 sticky top-0 shadow-sm z-10">
                                                                        <th className="p-2 border-b font-medium w-16 text-center">縮圖集</th>
                                                                        <th className="p-2 border-b font-medium">名稱</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">2連</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">3連</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">4連</th>
                                                                        <th className="p-2 border-b font-medium text-center w-12">5連</th>
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
                                                                                            <button onClick={() => handleRemoveThumb(idx, tIdx)} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                                                                                <X size={8} />
                                                                                            </button>
                                                                                        </div>
                                                                                    ))}
                                                                                    <button
                                                                                        onClick={() => setPtCropState({ active: true, itemIndex: idx, selectedImageId: ptImages[0]?.id, startX: 0, startY: 0, endX: 0, endY: 0, isDragging: false })}
                                                                                        className="w-7 h-7 bg-slate-100 hover:bg-indigo-50 hover:border-indigo-300 rounded flex items-center justify-center border border-slate-200 border-dashed text-slate-400 hover:text-indigo-500 transition-colors"
                                                                                        title="新增此符號的另一張特徵圖"
                                                                                    >
                                                                                        <Plus size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.name} onChange={(e) => handlePtTableChange(idx, 'name', e.target.value)} className="w-full font-bold text-slate-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1.5 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match2} onChange={(e) => handlePtTableChange(idx, 'match2', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match3} onChange={(e) => handlePtTableChange(idx, 'match3', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match4} onChange={(e) => handlePtTableChange(idx, 'match4', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1">
                                                                                <input type="text" value={item.match5} onChange={(e) => handlePtTableChange(idx, 'match5', e.target.value)} className="w-full text-center text-slate-600 bg-transparent border border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-1 py-1 outline-none transition-all" />
                                                                            </td>
                                                                            <td className="p-1 text-center">
                                                                                <button onClick={() => handlePtTableDelete(idx)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover:opacity-100" title="刪除此符號">
                                                                                    <Trash2 size={14} />
                                                                                </button>
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

                            {/* Step 3: Jackpot (JP) 倍率設定 */}
                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mt-6">
                                <div className="flex flex-col">
                                    <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                                        <div className="flex flex-col">
                                            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                                <Trophy size={20} className="text-amber-500" /> Jackpot (JP) 倍率設定
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-1">
                                                啟用後即可設定各級別 JP (如 MINI, GRAND) 觸發收集時的面額倍率。可自行新增自訂大獎名稱，留空表示未使用。<br /><span className="text-indigo-500 font-bold">💡 若需要讓 Phase 3 AI 辨識 JP 符號，請在上方「賠付表資料設定 (圖片提取)」中新增對應名稱的符號行，並裁切該 JP 的特徵圖即可。</span>
                                            </p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={hasJackpot}
                                                onChange={(e) => setHasJackpot(e.target.checked)}
                                            />
                                            <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500 shadow-inner"></div>
                                        </label>
                                    </div>

                                    {hasJackpot && (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {Object.entries(jpConfig).map(([jpName, jpMult], idx) => (
                                                <div key={idx} className="flex flex-col bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition-colors shadow-sm relative group">
                                                    <input
                                                        type="text"
                                                        value={jpName}
                                                        onChange={(e) => {
                                                            const newName = e.target.value.toUpperCase();
                                                            setJpConfig(prev => {
                                                                const newConfig = {};
                                                                Object.keys(prev).forEach(k => {
                                                                    if (k === jpName) newConfig[newName] = prev[k];
                                                                    else newConfig[k] = prev[k];
                                                                });
                                                                return newConfig;
                                                            });
                                                        }}
                                                        className="w-full text-sm font-bold text-slate-700 outline-none uppercase border-b border-transparent hover:border-slate-200 focus:border-indigo-300 mb-2 placeholder:font-normal placeholder:lowercase placeholder:text-slate-300 pb-1"
                                                        placeholder="JP分類"
                                                    />
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        value={jpMult}
                                                        onChange={(e) => {
                                                            setJpConfig(prev => ({ ...prev, [jpName]: e.target.value }));
                                                        }}
                                                        className="w-full text-lg font-black text-amber-600 outline-none bg-amber-50 hover:bg-amber-100 px-2 py-1.5 rounded focus:ring-1 focus:ring-amber-300 transition-colors"
                                                        placeholder="倍率"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            setJpConfig(prev => {
                                                                const newConfig = { ...prev };
                                                                delete newConfig[jpName];
                                                                return newConfig;
                                                            });
                                                        }}
                                                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-rose-600 focus:outline-none"
                                                        disabled={Object.keys(jpConfig).length <= 1}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => {
                                                    setJpConfig(prev => ({ ...prev, [`CUSTOM_${Object.keys(prev).length + 1}`]: "" }));
                                                }}
                                                className="flex flex-col items-center justify-center bg-transparent border-2 border-dashed border-slate-300 rounded-lg p-3 hover:bg-slate-100 hover:border-slate-400 hover:text-indigo-600 transition-colors text-slate-400 min-h-[95px] w-full"
                                            >
                                                <Plus size={24} className="mb-1" />
                                                <span className="text-xs font-bold">新增 JP</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mt-6 flex items-center justify-between shadow-sm">
                                <div className="flex flex-col">
                                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                        ✨ 特殊乘倍輪 (Multiplier Reel)
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        啟用後，系統將自動把這款遊戲的「最後一軸」獨立作為乘倍輪 (自動將盤面軸數 + 1)。<br />
                                        只要主盤面有贏分，就會自動乘上該軸「中間格子」萃取出的數字倍數 (支援如 x2, x5, MULT_10 等符號)。
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={hasMultiplierReel}
                                        onChange={(e) => setHasMultiplierReel(e.target.checked)}
                                    />
                                    <div className="w-14 h-7 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
                                </label>
                            </div>

                            {/* 建構結算模板大按鈕 */}
                            <button onClick={handleBuildTemplate} className="w-full mt-6 py-4 bg-slate-800 hover:bg-slate-900 text-white text-lg font-bold rounded-xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]">
                                <CheckCircle2 size={24} />
                                完成設定，建構結算模板
                            </button>
                        </div>
                    )}
                </div>
        </>

    );
}
