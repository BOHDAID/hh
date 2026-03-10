import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isArabic = document.documentElement.lang === 'ar';
      const errorMessage = this.state.error?.message || 'Unknown error';
      const errorStack = this.state.error?.stack || '';

      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="text-center max-w-lg">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 mb-6">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">
              {isArabic ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
            </h1>
            <p className="text-muted-foreground mb-4">
              {isArabic
                ? 'نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.'
                : 'We apologize for this error. Please try again.'}
            </p>
            
            {/* Error details for debugging */}
            <details className="mb-6 text-left bg-muted/50 rounded-lg p-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground font-medium mb-2">
                {isArabic ? 'تفاصيل الخطأ (للمطور)' : 'Error Details (Developer)'}
              </summary>
              <pre className="whitespace-pre-wrap break-all text-destructive overflow-auto max-h-48 p-2 bg-background rounded">
                {errorMessage}
                {'\n\n'}
                {errorStack}
              </pre>
            </details>

            <div className="flex gap-3 justify-center">
              <Button variant="hero" onClick={this.handleRetry} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {isArabic ? 'إعادة المحاولة' : 'Try Again'}
              </Button>
              <Button variant="outline" onClick={() => (window.location.href = '/')}>
                {isArabic ? 'الصفحة الرئيسية' : 'Go Home'}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
