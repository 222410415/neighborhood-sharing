"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-[16px] font-medium text-[var(--nsr-text)] mb-2">
              Something went wrong
            </p>
            <p className="text-[14px] text-[var(--nsr-text-secondary)] mb-4">
              Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-[14px] font-medium rounded-[var(--nsr-radius-md)] bg-[var(--nsr-primary)] text-[var(--nsr-on-primary)] hover:bg-[var(--nsr-primary-hover)]"
            >
              Refresh
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
