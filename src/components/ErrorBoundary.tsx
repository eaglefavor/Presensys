import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="d-flex flex-column align-items-center justify-content-center vh-100 bg-light p-4 text-center">
          <div className="bg-white p-5 rounded-4 shadow-sm max-w-md w-100">
            <div className="bg-danger bg-opacity-10 text-danger p-4 rounded-circle d-inline-block mb-4">
              <AlertTriangle size={48} />
            </div>
            <h1 className="h4 fw-bold text-dark mb-3">Something went wrong</h1>
            <p className="text-muted mb-4">
              An unexpected error occurred. Please refresh the page or try again later.
            </p>
            {this.state.error && (
              <div className="bg-light p-3 rounded-3 text-start mb-4 overflow-auto" style={{ maxHeight: '150px' }}>
                <code className="small text-danger">{this.state.error.message}</code>
              </div>
            )}
            <button
              className="btn btn-primary btn-lg w-100 d-flex align-items-center justify-content-center gap-2"
              onClick={() => window.location.reload()}
            >
              <RotateCcw size={20} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
