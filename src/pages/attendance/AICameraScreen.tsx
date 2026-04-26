import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { RefreshCw, Check, ArrowRight, X, AlertCircle } from 'lucide-react';

interface Props {
  onCancel: () => void;
  onSubmit: (images: string[]) => void;
}

export default function AICameraScreen({ onCancel, onSubmit }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const [images, setImages] = useState<string[]>([]);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const capture = useCallback(() => {
    if (webcamRef.current) {
      // Get base64 string
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setImages(prev => [...prev, imageSrc]);
      }
    }
  }, [webcamRef]);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  };

  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: facingMode
  };

  return (
    <div className="d-flex flex-column h-100 bg-dark text-white position-fixed top-0 start-0 w-100 z-3">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between p-3 position-absolute top-0 w-100 z-10" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)' }}>
        <button className="btn btn-dark bg-opacity-50 border-0 rounded-circle p-2 text-white" onClick={onCancel}>
          <X size={24} />
        </button>
        <div className="fw-bold text-uppercase small tracking-widest">
          {images.length === 0 ? "Capture Front" : "Capture Back"}
        </div>
        <button className="btn btn-dark bg-opacity-50 border-0 rounded-circle p-2 text-white" onClick={toggleCamera}>
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Camera Viewport */}
      <div className="flex-grow-1 position-relative bg-black d-flex flex-column justify-content-center overflow-hidden">
        {images.length < 2 ? (
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.8}
            videoConstraints={videoConstraints}
            className="w-100 h-100 object-fit-cover"
            style={{ minHeight: '50vh' }}
          />
        ) : (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 p-4 text-center">
            <Check size={48} className="text-success mb-3" />
            <h3 className="h4 fw-bold">Both Sides Captured</h3>
            <p className="text-muted small">Ready to process the attendance sheet</p>
          </div>
        )}

        {/* Overlay Guide */}
        {images.length < 2 && (
          <div className="position-absolute top-50 start-50 translate-middle w-75 h-75 border border-2 border-white rounded-4 border-dashed pointer-events-none" style={{ opacity: 0.5 }}>
          </div>
        )}
      </div>

      {/* Captured Images Preview */}
      {images.length > 0 && (
        <div className="bg-dark p-3 d-flex gap-2 overflow-auto" style={{ minHeight: '100px' }}>
          {images.map((img, idx) => (
            <div key={idx} className="position-relative flex-shrink-0" style={{ width: '60px', height: '80px' }}>
              <img src={img} alt={`Capture ${idx + 1}`} className="w-100 h-100 object-fit-cover rounded-2 border border-secondary" />
              <button
                className="position-absolute top-0 end-0 translate-middle p-1 bg-danger text-white rounded-circle border-0 d-flex align-items-center justify-content-center shadow-sm"
                style={{ width: '20px', height: '20px', marginTop: '2px', marginRight: '-2px' }}
                onClick={() => removeImage(idx)}
              >
                <X size={12} />
              </button>
              <div className="position-absolute bottom-0 w-100 text-center bg-black bg-opacity-50 text-white" style={{ fontSize: '10px' }}>
                {idx === 0 ? 'Front' : 'Back'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Controls Footer */}
      <div className="p-4 pb-5 d-flex flex-column align-items-center gap-3 bg-dark">
        {images.length === 1 && (
          <div className="text-center w-100 mb-2">
            <p className="text-warning small mb-2 d-flex align-items-center justify-content-center gap-1">
              <AlertCircle size={14} />
              Flip paper and capture back (Skip if blank)
            </p>
            <button
              className="btn btn-outline-light w-100 rounded-pill py-2 fw-bold"
              onClick={() => onSubmit(images)}
            >
              Skip & Process 1 Image
            </button>
          </div>
        )}

        <div className="d-flex w-100 justify-content-center align-items-center position-relative">
          {images.length < 2 && (
            <button
              className="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center"
              style={{ width: '70px', height: '70px', border: '4px solid #fff', boxShadow: '0 0 0 4px rgba(255,255,255,0.3)' }}
              onClick={capture}
            >
              <div className="bg-dark rounded-circle" style={{ width: '56px', height: '56px' }}></div>
            </button>
          )}

          {images.length > 0 && (
            <button
              className={`btn btn-primary rounded-pill px-4 py-3 fw-bold d-flex align-items-center gap-2 ${images.length < 2 ? 'position-absolute end-0' : 'w-100 justify-content-center shadow-lg'}`}
              onClick={() => onSubmit(images)}
            >
              Process {images.length} {images.length === 1 ? 'Image' : 'Images'}
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
