import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  FingerprintPattern,
  Download,
  Terminal,
  Copy,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  RotateCcw,
} from 'lucide-react';
import { getBridgeUrl, setBridgeUrl } from '../../../lib/bridgeSettings';

type TestState = 'idle' | 'testing' | 'success' | 'failed';

const SETUP_STEPS = [
  {
    num: 1,
    title: 'Enable Developer Options on Android',
    body: 'Go to Settings → About phone → tap Build number 7 times. Then Settings → System → Developer options → enable USB debugging (only needed once).',
  },
  {
    num: 2,
    title: 'Install Termux',
    body: 'Download Termux from F-Droid (f-droid.org/packages/com.termux) — the Google Play version is outdated.',
  },
  {
    num: 3,
    title: 'Install Node.js inside Termux',
    body: 'Open Termux and run:\n  pkg update -y\n  pkg install -y nodejs\n  npm install ws',
  },
  {
    num: 4,
    title: 'Download the bridge script',
    body: 'Tap "Download Bridge Script" below — or inside Termux run the one-line command shown in the next section.',
  },
  {
    num: 5,
    title: 'Run the bridge',
    body: 'Inside Termux:\n  node ~/fingerprint-bridge.js\n\nYou should see:\n  [bridge] WebSocket server listening on ws://localhost:8080\n\nKeep the Termux window running. Tap the Termux notification → "Acquire wakelock" to prevent Android from killing it.',
  },
  {
    num: 6,
    title: 'Enrol student fingerprints',
    body: 'Go to Students → tap a student → "Register Fingerprint". The bridge must be running. Have the student touch the sensor, then tap Save.',
  },
  {
    num: 7,
    title: 'Start a Fingerprint Blitz session',
    body: 'Go to Attendance → start a session → Choose Method → Fingerprint Blitz. The status indicator turns green when the bridge is connected.',
  },
];

export function FingerprintBridgeSection() {
  const [bridgeUrl, setBridgeUrlState] = useState(getBridgeUrl);
  const [testState, setTestState] = useState<TestState>('idle');
  const [showSteps, setShowSteps] = useState(false);
  const [copied, setCopied] = useState(false);
  const wsTestRef = useRef<WebSocket | null>(null);
  // Track whether the test WebSocket opened successfully so onclose doesn't
  // overwrite a 'success' result with 'failed' (avoids reading stale state in closure).
  const testSucceededRef = useRef(false);

  const scriptUrl = `${window.location.origin}/fingerprint-bridge.js`;
  const termuxCommand = `curl -o ~/fingerprint-bridge.js ${scriptUrl} && npm install ws && node ~/fingerprint-bridge.js`;

  const handleUrlBlur = () => {
    setBridgeUrl(bridgeUrl);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBridgeUrlState(e.target.value);
  };

  const handleReset = () => {
    const defaultUrl = 'ws://localhost:8080';
    setBridgeUrlState(defaultUrl);
    setBridgeUrl(defaultUrl);
  };

  const handleTestConnection = () => {
    if (wsTestRef.current) {
      wsTestRef.current.onopen = null;
      wsTestRef.current.onerror = null;
      wsTestRef.current.onclose = null;
      wsTestRef.current.close();
      wsTestRef.current = null;
    }

    setTestState('testing');
    testSucceededRef.current = false;

    try {
      const ws = new WebSocket(bridgeUrl);
      wsTestRef.current = ws;

      const timeout = setTimeout(() => {
        if (wsTestRef.current === ws) {
          ws.onopen = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
          wsTestRef.current = null;
          setTestState('failed');
        }
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        testSucceededRef.current = true;
        setTestState('success');
        ws.close();
        wsTestRef.current = null;
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        setTestState('failed');
        wsTestRef.current = null;
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        // Only mark failed if we never successfully opened the connection.
        if (!testSucceededRef.current) setTestState('failed');
      };
    } catch {
      setTestState('failed');
    }
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(termuxCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select a textarea
    }
  };

  const testIcon = () => {
    switch (testState) {
      case 'testing': return <span className="spinner-border spinner-border-sm" role="status" />;
      case 'success': return <Wifi size={16} className="text-success" />;
      case 'failed':  return <WifiOff size={16} className="text-danger" />;
      default:        return null;
    }
  };

  const testLabel = () => {
    switch (testState) {
      case 'testing': return 'Testing…';
      case 'success': return 'Connected!';
      case 'failed':  return 'Unreachable';
      default:        return 'Test Connection';
    }
  };

  const testBtnClass = () => {
    switch (testState) {
      case 'success': return 'btn-outline-success';
      case 'failed':  return 'btn-outline-danger';
      default:        return 'btn-outline-secondary';
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <div className="d-flex align-items-center gap-2 mb-3 px-1">
        <FingerprintPattern size={14} className="text-muted" />
        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">
          Fingerprint Bridge
        </h6>
      </div>

      <div className="card border-0 bg-white shadow-sm rounded-4 mb-4 overflow-hidden">

        {/* Bridge URL */}
        <div className="p-4 border-bottom">
          <label className="form-label xx-small fw-bold text-uppercase text-muted ps-1 mb-1">
            Bridge WebSocket URL
          </label>
          <div className="d-flex gap-2 align-items-center">
            <input
              type="text"
              className="form-control modern-input-unified py-3 fw-bold font-monospace flex-grow-1"
              value={bridgeUrl}
              onChange={handleUrlChange}
              onBlur={handleUrlBlur}
              placeholder="ws://localhost:8080"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="btn btn-light rounded-3 py-3 px-3 border"
              onClick={handleReset}
              title="Reset to default"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <p className="xx-small text-muted fw-bold mt-2 mb-0 ps-1">
            Default is <code>ws://localhost:8080</code>. Change this if the bridge runs on a different device or port.
          </p>
        </div>

        {/* Test connection */}
        <div className="p-4 border-bottom d-flex align-items-center justify-content-between gap-3 flex-wrap">
          <div>
            <p className="fw-bold small mb-0">Test Connection</p>
            <p className="xx-small text-muted mb-0 fw-bold">Check whether the bridge daemon is reachable right now.</p>
          </div>
          <button
            className={`btn ${testBtnClass()} rounded-3 fw-bold px-4 py-2 d-flex align-items-center gap-2 flex-shrink-0`}
            onClick={handleTestConnection}
            disabled={testState === 'testing'}
          >
            {testIcon()}
            {testLabel()}
          </button>
        </div>

        {/* Download script */}
        <div className="p-4 border-bottom d-flex align-items-center justify-content-between gap-3 flex-wrap">
          <div>
            <p className="fw-bold small mb-0">Download Bridge Script</p>
            <p className="xx-small text-muted mb-0 fw-bold">Save <code>fingerprint-bridge.js</code> directly to the phone.</p>
          </div>
          <a
            href="/fingerprint-bridge.js"
            download="fingerprint-bridge.js"
            className="btn btn-outline-primary rounded-3 fw-bold px-4 py-2 d-flex align-items-center gap-2 flex-shrink-0 text-decoration-none"
          >
            <Download size={16} />
            Download
          </a>
        </div>

        {/* Termux one-liner */}
        <div className="p-4 border-bottom">
          <div className="d-flex align-items-center gap-2 mb-2">
            <Terminal size={14} className="text-muted flex-shrink-0" />
            <p className="fw-bold small mb-0">Termux One-Line Setup</p>
          </div>
          <p className="xx-small text-muted fw-bold mb-2">
            Paste this into Termux to download, install dependencies, and start the bridge in one step:
          </p>
          <div className="bg-dark rounded-3 p-3 d-flex align-items-start gap-2" style={{ overflowX: 'auto' }}>
            <code className="text-success small flex-grow-1" style={{ whiteSpace: 'pre', wordBreak: 'break-all' }}>
              {termuxCommand}
            </code>
            <button
              className="btn btn-sm btn-outline-secondary border-secondary flex-shrink-0 rounded-2"
              onClick={handleCopyCommand}
              title="Copy to clipboard"
              style={{ color: copied ? '#198754' : undefined, borderColor: copied ? '#198754' : undefined }}
            >
              {copied ? <CheckCircle size={14} className="text-success" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Collapsible step-by-step guide */}
        <div>
          <button
            className="btn btn-link w-100 d-flex align-items-center justify-content-between px-4 py-3 text-decoration-none text-dark fw-bold small rounded-0"
            onClick={() => setShowSteps(s => !s)}
          >
            <span>Step-by-Step Setup Guide</span>
            {showSteps ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
          </button>

          {showSteps && (
            <div className="px-4 pb-4">
              <div className="d-flex flex-column gap-3">
                {SETUP_STEPS.map(step => (
                  <div key={step.num} className="d-flex gap-3 align-items-start">
                    <div
                      className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-black flex-shrink-0"
                      style={{ width: 28, height: 28, fontSize: 13 }}
                    >
                      {step.num}
                    </div>
                    <div>
                      <p className="fw-bold small mb-1">{step.title}</p>
                      <p className="xx-small text-muted mb-0 fw-bold" style={{ whiteSpace: 'pre-line' }}>{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
