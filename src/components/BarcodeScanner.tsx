import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, ScanLine, Zap } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScanSuccess, onClose }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-root";

  useEffect(() => {
    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    const config = { 
      fps: 10, 
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0 
    };

    // Request camera and start immediately
    html5QrCode.start(
      { facingMode: "environment" }, 
      config, 
      (decodedText) => {
        // Stop and return
        html5QrCode.stop().then(() => {
          onScanSuccess(decodedText);
        }).catch(() => {
          onScanSuccess(decodedText);
        });
      },
      () => { /* Ignore errors */ }
    ).catch(err => {
      console.error("Camera start failed:", err);
      alert("Could not start camera. Please ensure permissions are granted.");
      onClose();
    });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [onScanSuccess, onClose]);

  return (
    <div className="scanner-overlay animate-in">
      <div className="scanner-header p-4">
        <h5 className="mb-0 fw-black text-white letter-spacing-n1 d-flex align-items-center gap-2">
          <ScanLine size={24} style={{ color: 'var(--primary-blue)' }} /> SCANNER
        </h5>
        <button className="btn btn-light rounded-circle p-2 shadow" onClick={onClose}><X size={24} /></button>
      </div>

      <div className="scanner-viewport">
        <div id={containerId}></div>
        <div className="scan-focus-area">
          <div className="scan-bracket top-left"></div>
          <div className="scan-bracket top-right"></div>
          <div className="scan-bracket bottom-left"></div>
          <div className="scan-bracket bottom-right"></div>
          <div className="scan-laser"></div>
        </div>
      </div>

      <div className="scanner-footer p-4">
        <div className="bg-white rounded-4 p-3 shadow-lg d-flex align-items-center gap-3">
          <div className="bg-primary bg-opacity-10 text-primary p-2 rounded-3"><Zap size={20} /></div>
          <div>
            <div className="fw-black small text-dark">AUTO-CAPTURE ACTIVE</div>
            <div className="xx-small fw-bold text-muted uppercase">Align barcode inside the frame</div>
          </div>
        </div>
      </div>

      <style>{`
        .scanner-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: #000; z-index: 9999; display: flex; flex-direction: column;
        }
        .scanner-header { display: flex; justify-content: space-between; align-items: center; z-index: 10; }
        .scanner-viewport { flex: 1; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        #reader-root { width: 100% !important; height: 100% !important; }
        #reader-root video { width: 100% !important; height: 100% !important; object-fit: cover; }
        
        .scan-focus-area {
          position: absolute; width: 260px; height: 260px;
          box-shadow: 0 0 0 2000px rgba(0,0,0,0.5); border-radius: 20px;
          pointer-events: none;
        }
        .scan-bracket { position: absolute; width: 30px; height: 30px; border: 4px solid var(--primary-blue); border-radius: 4px; }
        .top-left { top: -2px; left: -2px; border-bottom: 0; border-right: 0; }
        .top-right { top: -2px; right: -2px; border-bottom: 0; border-left: 0; }
        .bottom-left { bottom: -2px; left: -2px; border-top: 0; border-right: 0; }
        .bottom-right { bottom: -2px; right: -2px; border-top: 0; border-left: 0; }
        
        .scan-laser {
          position: absolute; width: 100%; height: 2px; background: var(--primary-blue);
          top: 50%; box-shadow: 0 0 15px var(--primary-blue);
          animation: laserMove 2s infinite ease-in-out;
        }
        @keyframes laserMove { 0% { top: 10%; opacity: 0; } 50% { opacity: 1; } 100% { top: 90%; opacity: 0; } }
        
        .scanner-footer { z-index: 10; padding-bottom: max(24px, env(safe-area-inset-bottom)); }
      `}</style>
    </div>
  );
}
