import React from 'react';
import { locale } from '../locales/i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Top-level error boundary preventing uncaught runtime exceptions from unmounting the app silently.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#F2F1EC] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 shadow-lg p-6 space-y-3">
            <h1 className="text-base font-bold text-slate-900">
              {locale.errorBoundary.title}
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              {locale.errorBoundary.description}
            </p>
            {this.state.errorMessage && (
              <pre className="p-3 rounded-xl bg-slate-100 text-xs text-slate-800 font-mono overflow-x-auto whitespace-pre-wrap break-words">
                {this.state.errorMessage}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition"
            >
              {locale.errorBoundary.reloadButton}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

