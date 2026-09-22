import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/diagnostics';

export default class ErrorBoundary extends Component<{ children: ReactNode; region: string }, { error: Error | null; reference: string }> {
  state = { error: null as Error | null, reference: '' };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    const diagnostic = new Error(`${error.message}\n${info.componentStack ?? ''}`);
    diagnostic.stack = error.stack;
    this.setState({ reference: reportError(`render.${this.props.region}`, diagnostic).id });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <section role="alert" className="rounded-xl border border-red-400 bg-card p-5 text-foreground">
      <h2 className="font-semibold">Unable to display {this.props.region}</h2>
      <p>Your other workspace areas can still be used.</p>
      <p className="text-xs">Reference: {this.state.reference}</p>
      <button className="m-2 rounded border p-2" onClick={() => this.setState({ error: null })}>Try again</button>
      <button className="m-2 rounded border p-2" onClick={() => void navigator.clipboard.writeText(
        `${this.state.reference}\n${this.state.error?.stack ?? this.state.error?.message}`,
      ).catch(() => {})}>Copy error details</button>
    </section>;
  }
}
