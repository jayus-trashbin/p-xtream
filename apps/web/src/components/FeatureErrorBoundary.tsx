import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Fallback UI to show when an error is caught. Defaults to a minimal error message. */
  fallback?: ReactNode;
  /**
   * Descriptive name for this boundary — used in error logs.
   * E.g. "Player", "Discover", "Settings"
   */
  name: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary for isolated feature areas.
 * Prevents a crash in one section (e.g. Player) from taking down the whole app.
 *
 * @example
 * <FeatureErrorBoundary name="Player">
 *   <PlayerView />
 * </FeatureErrorBoundary>
 */
export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Structured log — will be picked up by Sentry/Datadog if integrated
    console.error(`[ErrorBoundary: ${this.props.name}]`, {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center p-8 text-center"
        >
          <p className="text-type-danger text-lg font-semibold mb-2">
            Something went wrong in {this.props.name}.
          </p>
          <p className="text-type-secondary text-sm mb-4">
            {this.state.error?.message}
          </p>
          <button
            type="button"
            className="text-sm underline text-type-secondary hover:text-white transition-colors"
            onClick={this.handleReset}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
