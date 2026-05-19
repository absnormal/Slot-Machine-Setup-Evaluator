import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'

// 取得最新的 git commit log
let commitLog = '';
try {
    commitLog = execSync('git log -1 --oneline').toString().trim();
} catch (e) {
    commitLog = 'unknown commit';
}

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    base: '/Slot-Machine-Setup-Evaluator/',
    worker: {
        format: 'es',
    },
    define: {
        __GIT_COMMIT_LOG__: JSON.stringify(commitLog),
    },
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks: {
                    // ── 重型 vendor 拆分 ──
                    'vendor-react': ['react', 'react-dom'],
                    'vendor-ort': ['onnxruntime-web'],
                    'vendor-ocr': ['@gutenye/ocr-browser'],
                    'vendor-xlsx': ['xlsx'],
                    // ── P4 偵測引擎群 ──
                    'engine-detection': [
                        './src/engine/vlineScanner.js',
                        './src/engine/winPollAgent.js',
                        './src/engine/ocrPipeline.js',
                        './src/engine/ocrWorkerBridge.js',
                        './src/engine/frameRateCalibrator.js',
                    ],
                    // ── P4/P5 Hooks 群 ──
                    'hooks-p4': [
                        './src/hooks/useKeyframeExtractor.js',
                        './src/hooks/useAutoRecognition.js',
                        './src/hooks/useReportGenerator.js',
                        './src/hooks/useSmartDedup.js',
                        './src/hooks/useSpinGroupAnalysis.js',
                    ],
                },
            },
        },
    },
    server: {
        watch: {
            ignored: ['**/screen-capture-server/**', '**/.agent/**', '**/README.md', '**/*.md']
        }
    }
})
