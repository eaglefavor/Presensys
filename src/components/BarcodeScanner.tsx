import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
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
        aspectRatio: 1.0
      },
      /* verbose= */ false
    );
    
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        // Success callback
        // Stop scanning after success to prevent multiple triggers
        scanner.clear().then(() => {
            onScanSuccess(decodedText);
        }).catch(err => console.error("Failed to clear scanner", err));
      },
      () => {
        // Failure callback (called on every frame frame scan fails)
        // We ignore this to prevent console spam
      }
    );

    return () => {
      // Cleanup
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
            console.warn("Failed to clear html5-qrcode scanner during cleanup", error);
        });
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 bg-black d-flex flex-column align-items-center justify-content-center" style={{ zIndex: 2000 }}>
      <button 
        className="btn btn-light position-absolute top-0 end-0 m-4 rounded-circle p-2" 
        style={{zIndex: 2001}}
        onClick={onClose}
      >
        <X size={24} />
      </button>
      
      <div className="text-white mb-4 text-center px-4">
        <h5 className="fw-bold">Scan Student ID</h5>
        <p className="small opacity-75">Point camera at the barcode on the ID card</p>
      </div>

      <div id="reader" style={{ width: '100%', maxWidth: '400px', background: '#000' }}></div>
      
    </div>
  );
}
