import React from 'react';
import { Settings, CheckCircle2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

import TemplateToolbar from './phase1/TemplateToolbar';
import LineModeConfig from './phase1/LineModeConfig';
import SpecialSymbolQA from './phase1/SpecialSymbolQA';
import PaytableConfig from './phase1/PaytableConfig';

/**
 * Phase 1: 模板設定 — 容器元件
 * 組合 4 個子元件：TemplateToolbar, LineModeConfig, SpecialSymbolQA, PaytableConfig
 */
export default function Phase1Setup(props) {
    const {
        templateMessage,
        isTemplateMinimized, setIsTemplateMinimized,
        onToggle,
        template, templateError,
        showCloudModal, setShowCloudModal,
        handleImportLocalTemplate, handleExportLocalTemplate,
        handleClearTemplate,
        templateName, setTemplateName, defaultSaveName,
        handleSaveToCloud, isSaving, activeSaveAction,
        platformName, setPlatformName,
        gameName, setGameName,
        lineMode, setLineMode,
        linesMode, setLinesMode,
        linesTextInput, setLinesTextInput,
        extractResults, setExtractResults,
        gridRows, setGridRows,
        gridCols, setGridCols,
        hasMultiplierReel, setHasMultiplierReel,
        requiresCollectToWin, setRequiresCollectToWin,
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
        showPtModal, setShowPtModal,
        hasDoubleSymbol, setHasDoubleSymbol,
        hasDynamicMultiplier, setHasDynamicMultiplier,
        multiplierCalcType, setMultiplierCalcType,
        hasApiKey
    } = props;

    return (
        <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors" onClick={onToggle}>
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

                {/* Body */}
                {!isTemplateMinimized && (
                    <div className="p-6 pt-0 border-t border-slate-100 mt-4 space-y-6">
                        {templateError && (
                            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-sm font-bold flex items-center gap-2 animate-in fade-in zoom-in duration-200 shadow-sm">
                                <AlertCircle size={18} className="shrink-0" />
                                <span>{templateError}</span>
                            </div>
                        )}

                        {/* 1. Toolbar */}
                        <TemplateToolbar
                            handleImportLocalTemplate={handleImportLocalTemplate}
                            setShowCloudModal={setShowCloudModal}
                            handleClearTemplate={handleClearTemplate}
                            handleExportLocalTemplate={handleExportLocalTemplate}
                            templateName={templateName}
                            setTemplateName={setTemplateName}
                            handleSaveToCloud={handleSaveToCloud}
                            isSaving={isSaving}
                            activeSaveAction={activeSaveAction}
                        />

                        {/* 2. Basic Info */}
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">平台名稱</label>
                                    <input type="text" value={platformName} onChange={(e) => setPlatformName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="例如: 金銀島, VF, 滿貫大亨..." />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-bold text-slate-700 mb-1">
                                        遊戲名稱 <span className="text-rose-500 font-normal text-[10px] ml-1">(金銀島專案，需加上game ID，範例：757_超級麻將 2)</span>
                                    </label>
                                    <input type="text" value={gameName} onChange={(e) => setGameName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="例如: 757_超級麻將 2, 40_Sparkling Crown..." />
                                </div>
                            </div>
                        </div>

                        {/* 3. Line Mode */}
                        <LineModeConfig
                            lineMode={lineMode} setLineMode={setLineMode}
                            gridRows={gridRows} setGridRows={setGridRows}
                            gridCols={gridCols} setGridCols={setGridCols}
                            hasMultiplierReel={hasMultiplierReel} setHasMultiplierReel={setHasMultiplierReel}
                            linesMode={linesMode} setLinesMode={setLinesMode}
                            linesTextInput={linesTextInput} setLinesTextInput={setLinesTextInput}
                            extractResults={extractResults} setExtractResults={setExtractResults}
                            lineImages={lineImages} removeLineImage={removeLineImage}
                            activeLineImageId={activeLineImageId} setActiveLineImageId={setActiveLineImageId}
                            handleLineImageUpload={handleLineImageUpload}
                            dragState={dragState} setDragState={setDragState}
                            containerRef={containerRef} layoutStyle={layoutStyle}
                            handleMouseDown={handleMouseDown} handleMouseMove={handleMouseMove} handleMouseUp={handleMouseUp}
                            canvasRef={canvasRef} draw={draw} canvasSize={canvasSize}
                            p1={p1} pEnd={pEnd} analyzeImage={analyzeImage}
                            startIndex={startIndex} setStartIndex={setStartIndex}
                            patternRows={patternRows} setPatternRows={setPatternRows}
                            patternCols={patternCols} setPatternCols={setPatternCols}
                            linesTabMode={linesTabMode} setLinesTabMode={setLinesTabMode}
                            activeLineImage={activeLineImage} imageSrc={imageSrc} imageObj={imageObj}
                        />

                        {/* 4. Special Symbol Q&A */}
                        <SpecialSymbolQA
                            hasDoubleSymbol={hasDoubleSymbol} setHasDoubleSymbol={setHasDoubleSymbol}
                            hasMultiplierReel={hasMultiplierReel} setHasMultiplierReel={setHasMultiplierReel}
                            multiplierCalcType={multiplierCalcType} setMultiplierCalcType={setMultiplierCalcType}
                            hasDynamicMultiplier={hasDynamicMultiplier} setHasDynamicMultiplier={setHasDynamicMultiplier}
                            requiresCollectToWin={requiresCollectToWin} setRequiresCollectToWin={setRequiresCollectToWin}
                            hasJackpot={hasJackpot} setHasJackpot={setHasJackpot}
                            jpConfig={jpConfig} setJpConfig={setJpConfig}
                        />

                        {/* 5. Paytable */}
                        <PaytableConfig
                            paytableMode={paytableMode} setPaytableMode={setPaytableMode}
                            paytableInput={paytableInput} handlePaytableTextChange={handlePaytableTextChange}
                            ptImages={ptImages} removePtImage={removePtImage} clearPtAll={clearPtAll}
                            handlePtFileChange={handlePtFileChange} handlePtDrop={handlePtDrop}
                            isPtProcessing={isPtProcessing} hasApiKey={hasApiKey}
                            setShowPtModal={setShowPtModal}
                            ptResultItems={ptResultItems} setPtResultItems={setPtResultItems}
                            ptCropState={ptCropState} setPtCropState={setPtCropState}
                            ptEnlargedImg={ptEnlargedImg} setPtEnlargedImg={setPtEnlargedImg}
                            handlePtTableChange={handlePtTableChange} handlePtTableDelete={handlePtTableDelete}
                            handleAddPtRow={handleAddPtRow} handleRemoveThumb={handleRemoveThumb}
                            hasDoubleSymbol={hasDoubleSymbol} gridCols={gridCols}
                        />

                        {/* Build Button */}
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
