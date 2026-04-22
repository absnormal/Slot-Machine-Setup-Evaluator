import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * 卡片級 Error Boundary
 * 單張 CandidateCard 渲染失敗時，只影響該卡片，不會炸掉整個列表。
 */
class CardErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('🃏 CandidateCard 渲染失敗:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="relative rounded-xl border-2 border-rose-300 bg-rose-50/80 p-3 text-xs text-rose-700 flex flex-col items-center gap-2 min-h-[120px] justify-center">
                    <AlertCircle className="w-6 h-6 text-rose-400" />
                    <span className="font-medium">⚠️ 此卡片渲染失敗</span>
                    <span className="text-rose-500/80 text-center break-all max-w-full">
                        {this.state.error?.message || '未知錯誤'}
                    </span>
                    <button
                        onClick={this.handleRetry}
                        className="mt-1 flex items-center gap-1 px-2 py-1 bg-rose-200 hover:bg-rose-300 rounded-md transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" /> 重試
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default CardErrorBoundary;
