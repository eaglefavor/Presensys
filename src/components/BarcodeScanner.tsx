import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, ScanLine, AlertCircle } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize Scanner
    const scanner = new Html5QrcodeScanner(
      "reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true
      },
      /* verbose= */ false
    );
    
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        // Success callback
        
        // Intelligent Parsing Logic
        // 1. Check if it's a URL and extract the last 10 digits
        const regNoMatch = decodedText.match(/(\d{10})/); // Look for 10 digits anywhere
        
        const finalValue = regNoMatch ? regNoMatch[0] : decodedText;

        scanner.clear().then(() => {
            onScanSuccess(finalValue);
        }).catch(err => console.error("Failed to clear scanner", err));
      },
      () => {
        // Failure callback (ignore to prevent spam)
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="scanner-overlay animate-in">
      {/* Header */}
      <div className="scanner-header">
        <h5 className="mb-0 fw-bold text-white d-flex align-items-center gap-2">
          <ScanLine size={20} className="text-primary" /> Scan ID
        </h5>
        <button className="btn btn-dark btn-sm rounded-circle" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      {/* Camera Area */}
      <div className="scanner-viewport">
        <div id="reader"></div>
        {/* Visual Guide Overlay */}
        <div className="scan-guide">
          <div className="scan-corner top-left"></div>
          <div className="scan-corner top-right"></div>
          <div className="scan-corner bottom-left"></div>
          <div className="scan-corner bottom-right"></div>
          <div className="scan-line"></div>
        </div>
      </div>

      {/* Footer / Instructions */}
      <div className="scanner-footer">
        <div className="bg-dark bg-opacity-75 text-white p-3 rounded-4 shadow-lg backdrop-blur text-center border border-white border-opacity-10">
          <p className="mb-0 small fw-medium">
            Point camera at the barcode or QR code on the Student ID card.
          </p>
          <div className="mt-2 text-primary small d-flex align-items-center justify-content-center gap-1">
            <AlertCircle size={14} /> 
            <span>Auto-detects Reg Number</span>
          </div>
        </div>
        
        <button 
          className="btn btn-light w-100 py-3 rounded-pill fw-bold shadow mt-3 text-uppercase small tracking-wider"
          onClick={onClose}
        >
          Cancel Scan
        </button>
      </div>

      <style>{`
        .scanner-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: #000;
          z-index: 9999;
          display: flex;
          flex-direction: column;
        }

        .scanner-header {
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: absolute;
          top: 0;
          width: 100%;
          z-index: 10;
          background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
        }

        .scanner-viewport {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        #reader {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover;
        }
        #reader video {
          object-fit: cover;
          height: 100vh;
        }

        /* Hide default html5-qrcode UI elements we don't want */
        #reader__dashboard_section_csr span, 
        #reader__dashboard_section_swaplink {
          display: none !important;
        }

        .scan-guide {
          position: absolute;
          width: 250px;
          height: 250px;
          border-radius: 20px;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7); /* The darkened overlay */
          pointer-events: none;
        }

        .scan-corner {
          position: absolute;
          width: 40px;
          height: 40px;
          border: 4px solid #0d6efd;
          border-radius: 4px;
        }
        .top-left { top: -2px; left: -2px; border-bottom: 0; border-right: 0; }
        .top-right { top: -2px; right: -2px; border-bottom: 0; border-left: 0; }
        .bottom-left { bottom: -2px; left: -2px; border-top: 0; border-right: 0; }
        .bottom-right { bottom: -2px; right: -2px; border-top: 0; border-left: 0; }

        .scan-line {
          position: absolute;
          width: 100%;
          height: 2px;
          background: #0d6efd;
          top: 50%;
          box-shadow: 0 0 10px #0d6efd;
          animation: scanMove 2s infinite linear;
        }

        @keyframes scanMove {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }

        .scanner-footer {
          padding: 24px;
          padding-bottom: max(24px, env(safe-area-inset-bottom));
          position: absolute;
          bottom: 0;
          width: 100%;
          z-index: 10;
        }
        
        .backdrop-blur {
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
      `}</style>
    </div>
  );
}