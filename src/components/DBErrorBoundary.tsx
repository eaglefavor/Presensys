import React, { Component } from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isDexieError: boolean;
}

const DEXIE_ERROR_NAMES = [
  'VersionError',
  'DatabaseClosedError',
  'InvalidStateError',
  'QuotaExceededError',
  'AbortError',
];

/**
 * DBErrorBoundary catches Dexie / IndexedDB errors that bubble up from any
 * descendant component and presents the user with a clear recovery option
 * ("Clear App Data & Reload") instead of a blank screen.
 */
export class DBErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, isDexieError: false };

  static getDerivedStateFromError(error: Error): State {
    const isDexieError =
      DEXIE_ERROR_NAMES.some(n => error.name === n) ||
      DEXIE_ERROR_NAMES.some(n => error.message?.includes(n)) ||
      error.message?.toLowerCase().includes('indexeddb') ||
      error.message?.toLowerCase().includes('quota');

    return { hasError: true, error, isDexieError };
  }

  private handleClearAndReload = async () => {
    try {
      if ('databases' in indexedDB) {
        const dbs = await indexedDB.databases();
        await Promise.all(
          dbs.map(
            db =>
              new Promise<void>((resolve, reject) => {
                if (!db.name) return resolve();
                const req = indexedDB.deleteDatabase(db.name);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
              }),
          ),
        );
      }
    } catch {
      // Best-effort; proceed with reload.
    }
    try {
      localStorage.clear();
    } catch {
      // Ignore.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="min-vh-100 d-flex align-items-center justify-content-center p-4"
        style={{ background: 'var(--bg-gray, #f8f9fa)' }}
      >
        <div
          className="card border-0 shadow-lg rounded-4 p-4 text-center"
          style={{ maxWidth: 400 }}
        >
          <div className="mb-3" style={{ fontSize: 48 }}>⚠️</div>
          <h4 className="fw-black mb-2 text-dark">App Data Error</h4>
          <p className="text-muted small mb-4">
            {this.state.isDexieError
              ? 'The local database appears to be corrupted or your storage quota has been exceeded. Clear app data to restore normal operation.'
              : 'An unexpected error occurred. Please try reloading the app.'}
          </p>

          {this.state.isDexieError && (
            <button
              className="btn btn-danger rounded-pill px-4 py-2 fw-bold mb-2 w-100"
              onClick={this.handleClearAndReload}
            >
              Clear App Data &amp; Reload
            </button>
          )}

          <button
            className="btn btn-light rounded-pill px-4 py-2 fw-bold w-100"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>

          {import.meta.env.DEV && this.state.error && (
            <details className="mt-3 text-start">
              <summary className="xx-small fw-bold text-muted" style={{ cursor: 'pointer' }}>
                Error details (dev only)
              </summary>
              <pre
                className="xx-small text-danger mt-2"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {this.state.error.name}: {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
