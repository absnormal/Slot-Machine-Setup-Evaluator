/**
 * Action Registry — 原子動作總匯出
 *
 * 所有積木的底層動作都從這裡匯出。
 * 執行引擎 (flowRunner) 通過此模組呼叫所有動作。
 */

// 控制積木
export { clickROI } from './clickAction';
export { wait } from './waitAction';

// 偵測積木
export { waitStable } from './waitStableAction';

// 讀取積木
export { ocrBatch, ocrRead } from './ocrAction';
export { captureFrame, computePixelHash } from './captureAction';

// 記錄積木
export { recordSpin } from './recordAction';
