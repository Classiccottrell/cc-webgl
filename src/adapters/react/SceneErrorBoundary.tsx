import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
  onError?: (error: unknown) => void;
}

interface State {
  hasError: boolean;
}

/** React error-boundary component wrapping errors/ErrorBoundary.ts semantics: catches
 * render-time exceptions from scene-consuming subtrees and shows a fallback instead of
 * unmounting the whole tree. */
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
