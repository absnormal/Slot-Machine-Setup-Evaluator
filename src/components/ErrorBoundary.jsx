import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error(`[ErrorBoundary] ${this.props.label || 'Unknown'} crashed:`, error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center shadow-sm">
                    <AlertCircle className="text-rose-500 mx-auto mb-3" size={32} />
                    <h3 className="text-lg font-bold text-rose-800 mb-1">
                        {this.props.label || '模組'} 發生非預期錯誤
                    </h3>
                    <p className="text-sm text-rose-600 mb-4">
                        {this.state.error?.message || '未知錯誤'}
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors shadow-md"
                    >
                        <RefreshCw size={16} />
                        重新載入此區塊
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
