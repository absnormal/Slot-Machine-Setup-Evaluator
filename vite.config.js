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
    define: {
        __GIT_COMMIT_LOG__: JSON.stringify(commitLog),
    },
    server: {
        watch: {
            ignored: ['**/.agent/**', '**/README.md', '**/*.md']
        }
    }
})
