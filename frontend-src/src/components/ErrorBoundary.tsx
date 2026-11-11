import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <div className="fatal-error__content">
            <span className="eyebrow">Something went wrong</span>
            <h1>This page couldn’t be displayed.</h1>
            <p>Your videos are safe. Refresh the page to try again.</p>
            <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
              Refresh page
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
