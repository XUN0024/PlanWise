import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full">
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h1 className="text-2xl font-bold text-red-800">Application Error</h1>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700 mb-4">
                Something went wrong with the PlanWise application. Please check the details below:
              </p>
              
              <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-red-800 mb-2">Error Details:</h3>
                <p className="text-red-700 text-sm font-mono">
                  {this.state.error && this.state.error.toString()}
                </p>
              </div>
              
              {this.state.errorInfo && (
                <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-800 mb-2">Stack Trace:</h3>
                  <pre className="text-xs text-gray-600 overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
            
            <div className="flex space-x-4">
              <button 
                onClick={() => window.location.reload()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Reload Application
              </button>
              <button 
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Try Again
              </button>
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Troubleshooting Tips:</h3>
              <ul className="text-blue-700 text-sm space-y-1">
                <li>• Check if your Supabase credentials are correct in the .env file</li>
                <li>• Ensure your internet connection is stable</li>
                <li>• Try refreshing the page</li>
                <li>• Check the browser console for additional error details</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
