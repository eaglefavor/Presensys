import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Save, RefreshCw, X, ArrowLeft, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from '@google/genai';

interface ExtractedRecord {
  regNumber: string;
  name?: string;
  matchedServerId?: string | null;
  status: 'matched' | 'unmatched';
}

interface Props {
  images: string[];
  enrollments: { serverId: string; regNumber: string; name: string; }[];
  onCancel: () => void;
  onSave: (matchedIds: string[]) => void;
}

export default function AIReconciliationScreen({ images, enrollments, onCancel, onSave }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedRecord[]>([]);
  const [editingReg, setEditingReg] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Convert base64 to parts for Gemini API
  const parseImagesForGemini = (base64Images: string[]) => {
    return base64Images.map(base64 => {
      // Format: data:image/jpeg;base64,...
      const parts = base64.split(',');
      const mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const data = parts[1];

      return {
        inlineData: {
          data,
          mimeType
        }
      };
    });
  };

  useEffect(() => {
    const processImages = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get API Key from environment OR fallback to provided token for local test

        // Get API Key from environment OR fallback to provided token for local test
        const apiKeyEnv = import.meta.env.VITE_GEMINI_API_KEY;
        const fallbackKeys = [
          'AIzaSyDRa_wjEwsymMjhf8ZyekM6KIBGIEZLkIc',
          'AIzaSyDimXT-qg0Ki4TdMTBySJiTMn7vDHtOtY0',
          'AIzaSyDlNwSrgmBsXB-DUsQkPT2rkL4y4EVvwts',
          'AIzaSyCXMZuI1CVe1FdqN5OI3zOq4jkGB7i-d8A',
          'AIzaSyDczRQ9fflubwO5rLCacZ-O-kZ1Nni6bhQ'
        ];

        // Use environment key if available, otherwise pick a random key from the fallback pool
        const apiKey = apiKeyEnv || fallbackKeys[Math.floor(Math.random() * fallbackKeys.length)];

        if (!apiKey) {
          throw new Error("Gemini API key is not configured. Configure VITE_GEMINI_API_KEY or route this request through a server-side endpoint.");
        }


        const ai = new GoogleGenAI({ apiKey });

        // Choose model dynamically based on conditions
        // As requested:
        // switch dynamically between these three models alone: Gemini 1.5 flash, Gemini 2.5 flash, and Gemini 2.5 flash-lite, depending on various conditions like the quality of the photo, network quality, handwriting visibility, lighting, API calls, and so on.
        // For our local assessment, network speed is our primary variable since images are basic base64 snapshots.
        // 1. Check network. If connection is very slow, we MUST use a smaller/faster model.
        // 2. If it's 2 images, we need a smarter model to correlate across pages.
        // 3. Fallback to Gemini 1.5 Flash for basic requests if needed, but 2.5 is preferred.

        let modelName = "gemini-2.5-flash-lite"; // Default to fastest/cheapest

        // Let's grab network speed from navigator
        const connection = (navigator as unknown as { connection?: { effectiveType: string; addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void } }).connection;
        const isSlowNetwork = connection && (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g');

        if (images.length === 2) {
           if (isSlowNetwork) {
               // Tradeoff: we need cross-image correlation, but network is slow.
               // 1.5 flash handles basic multi-image well and is often well-cached/faster than 2.5 heavy
               modelName = "gemini-1.5-flash-8b";
           } else {
               // Ideal condition: fast network, complex task (2 images)
               modelName = "gemini-2.5-flash";
           }
        } else {
           // Single image
           if (!isSlowNetwork) {
               // We have good network, let's use 1.5 flash for single-page which is extremely fast and robust for basic OCR
               modelName = "gemini-1.5-flash-8b";
           }
           // if slow network, keep default 2.5-flash-lite
        }

        const imageParts = parseImagesForGemini(images);


        // We can pass the database of reg numbers contextually if it's small enough to improve accuracy
        // by telling the AI about the static structure (first 4 = year, next 3 = dept code, last 3 = student id)
        const enrolledRegNumbers = enrollments.map(e => e.regNumber).join(', ');

        const prompt = `
          You are an advanced data extraction tool for a university attendance sheet.
          Attached are ${images.length} image(s) of an attendance sheet (front and potentially back).

          CRITICAL CONTEXT & RULES:
          1. Extract all 10-digit Registration Numbers and their corresponding Names.
          2. Merge the data from all images into a single list.
          3. Ignore duplicate Registration Numbers (e.g., if ink bled through the paper).
          4. Ignore reversed text or bleed-through.
          5. UNIVERSITY REG NUMBER STRUCTURE: The first 4 digits are the admission year, the next 3 are the department code (usually static for a class), and the last 3 are the unique student ID.
          6. CROSS-REFERENCE: Here is the list of enrolled student Registration Numbers for this class to help you verify unclear handwriting:
             [${enrolledRegNumbers}]
             Use this list to correct ambiguous digits (e.g., distinguishing '0' from 'O', '1' from '7', '8' from 'B'), but DO NOT hallucinate students who aren't on the paper. Only use this list to correct numbers that you can already partially read on the paper.
          7. Return STRICTLY a valid JSON array of objects with keys "regNumber" (string) and "name" (string).
          8. Do not include markdown blocks like \`\`\`json or \`\`\`. Output ONLY the raw JSON array.
        `;


        const response = await ai.models.generateContent({
            model: modelName,
            contents: [
                prompt,
                ...imageParts
            ]
        });

        let text = response.text || "[]";

        // Clean up potential markdown formatting if the model disobeys
        text = text.trim();
        if (text.startsWith("```json")) {
            text = text.substring(7);
        }
        if (text.startsWith("```")) {
             text = text.substring(3);
        }
        if (text.endsWith("```")) {
             text = text.substring(0, text.length - 3);
        }
        text = text.trim();

        let rawData;
        try {
          rawData = JSON.parse(text);
        } catch {
          console.error("Failed to parse JSON:", text);
          throw new Error("AI returned invalid data format. Please try again or use manual mode.");
        }

        if (!Array.isArray(rawData)) {
             throw new Error("AI returned invalid data format. Expected an array.");
        }

        // 1. Uniqueness Filter
        const uniqueMap = new Map();
        rawData.forEach(item => {
           if (item && item.regNumber) {
               // Basic cleanup of reg number
               const cleanReg = item.regNumber.toString().replace(/\D/g, '');
               if (cleanReg.length === 10 && !uniqueMap.has(cleanReg)) {
                   uniqueMap.set(cleanReg, { regNumber: cleanReg, name: item.name || 'Unknown' });
               }
           }
        });
        const uniqueData = Array.from(uniqueMap.values());

        // 2. The Matching Logic
        const processedRecords: ExtractedRecord[] = uniqueData.map(item => {
           const match = enrollments.find(e =>
               e.regNumber.toUpperCase() === item.regNumber ||
               e.regNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === item.regNumber
           );

           if (match) {
               return {
                   ...item,
                   status: 'matched',
                   matchedServerId: match.serverId,
                   name: match.name // Prefer DB name over OCR name
               };
           } else {
               return {
                   ...item,
                   status: 'unmatched',
                   matchedServerId: null
               };
           }
        });

        setExtractedData(processedRecords);

      } catch (err) {
        console.error("AI Error:", err);
        setError(err instanceof Error ? err.message : "Failed to process images.");
      } finally {
        setLoading(false);
      }
    };

    if (images.length > 0) {
      processImages();
    }
  }, [images, enrollments]);

  const matchedCount = extractedData.filter(r => r.status === 'matched').length;
  const unmatchedCount = extractedData.filter(r => r.status === 'unmatched').length;

  const handleFixUnmatched = (oldReg: string) => {
    if (!editValue.trim()) return;

    const cleanEdit = editValue.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const match = enrollments.find(e =>
        e.regNumber.toUpperCase().replace(/[^A-Za-z0-9]/g, '') === cleanEdit ||
        e.regNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === cleanEdit
    );

    setExtractedData(prev => prev.map(item => {
        if (item.regNumber === oldReg) {
            if (match) {
                return {
                    regNumber: cleanEdit,
                    name: match.name,
                    status: 'matched',
                    matchedServerId: match.serverId
                };
            } else {
                return {
                    ...item,
                    regNumber: cleanEdit
                };
            }
        }
        return item;
    }));

    setEditingReg(null);
    setEditValue("");
  };

  const handleSave = () => {
      const matchedIds = extractedData
          .filter(r => r.status === 'matched' && r.matchedServerId)
          .map(r => r.matchedServerId as string);

      // Ensure unique IDs
      const uniqueIds = Array.from(new Set(matchedIds));
      onSave(uniqueIds);
  };

  if (loading) {
    return (
      <div className="d-flex flex-column h-100 bg-white align-items-center justify-content-center p-4">
        <div className="spinner-border text-primary mb-4" style={{ width: '3rem', height: '3rem' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <h2 className="h4 fw-bold mb-2 text-center">AI is reading the list...</h2>
        <p className="text-muted text-center small max-w-sm">
          Please wait while we extract registration numbers and match them against your enrolled students.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="d-flex flex-column h-100 bg-white align-items-center justify-content-center p-4">
        <div className="bg-danger bg-opacity-10 text-danger p-4 rounded-circle mb-4">
          <AlertTriangle size={48} />
        </div>
        <h2 className="h4 fw-bold mb-2 text-center">Extraction Failed</h2>
        <p className="text-muted text-center small mb-4">{error}</p>
        <div className="d-flex gap-3">
          <button className="btn btn-outline-secondary px-4 py-2 rounded-pill fw-bold" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary px-4 py-2 rounded-pill fw-bold d-flex align-items-center gap-2" onClick={onCancel}>
            <RefreshCw size={18} /> Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100 bg-light">
      {/* Header */}
      <div className="bg-white sticky-top z-10 border-bottom shadow-sm">
        <div className="d-flex align-items-center justify-content-between p-3">
          <button className="btn btn-light rounded-circle p-2 border-0" onClick={onCancel}>
            <ArrowLeft size={24} />
          </button>
          <div className="text-center flex-grow-1">
            <h1 className="h6 fw-black mb-0 text-dark text-uppercase letter-spacing-n1">
              Review Results
            </h1>
            <p className="xx-small fw-bold text-muted mb-0">
              {matchedCount} Matched • {unmatchedCount} Unrecognized
            </p>
          </div>
          <button
             className="btn btn-primary btn-sm rounded-pill px-3 fw-bold d-flex align-items-center gap-1 shadow-sm"
             onClick={handleSave}
             disabled={matchedCount === 0}
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-4 container-mobile mx-auto w-100">

        {/* Unmatched Section (Top priority for user review) */}
        {unmatchedCount > 0 && (
          <div>
            <h6 className="fw-black text-danger text-uppercase tracking-widest mb-2 d-flex align-items-center gap-2 small">
              <AlertTriangle size={16} /> Needs Review ({unmatchedCount})
            </h6>
            <div className="d-flex flex-column gap-2">
              <AnimatePresence>
                {extractedData.filter(r => r.status === 'unmatched').map(record => (
                  <motion.div
                    key={record.regNumber}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="card border-danger border-opacity-50 bg-danger bg-opacity-10 shadow-sm rounded-3"
                  >
                    <div className="card-body p-3">
                      {editingReg === record.regNumber ? (
                         <div className="d-flex align-items-center gap-2">
                            <input
                               type="text"
                               className="form-control form-control-sm rounded-2 fw-bold font-monospace uppercase"
                               value={editValue}
                               onChange={e => setEditValue(e.target.value)}
                               placeholder="Correct Reg Number..."
                               autoFocus
                               onKeyDown={e => { if(e.key === 'Enter') handleFixUnmatched(record.regNumber); if(e.key === 'Escape') setEditingReg(null); }}
                            />
                            <button className="btn btn-success btn-sm rounded-2 px-2" onClick={() => handleFixUnmatched(record.regNumber)}>
                               <CheckCircle size={16} />
                            </button>
                            <button className="btn btn-light btn-sm rounded-2 px-2 border" onClick={() => setEditingReg(null)}>
                               <X size={16} />
                            </button>
                         </div>
                      ) : (
                        <div className="d-flex align-items-center justify-content-between">
                            <div>
                                <span className="fw-bold font-monospace text-danger text-decoration-line-through me-2">
                                    {record.regNumber}
                                </span>
                                <span className="small text-muted fst-italic">Not enrolled</span>
                            </div>
                            <button
                               className="btn btn-sm btn-outline-danger border-0 rounded-circle p-2"
                               onClick={() => { setEditingReg(record.regNumber); setEditValue(record.regNumber); }}
                               aria-label="Edit registration number"
                            >
                                <Pencil size={14} />
                            </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Matched Section */}
        <div>
          <h6 className="fw-black text-success text-uppercase tracking-widest mb-2 d-flex align-items-center gap-2 small">
            <CheckCircle size={16} /> Matched ({matchedCount})
          </h6>
          {matchedCount === 0 ? (
             <div className="text-center p-4 bg-white rounded-4 border">
                 <p className="text-muted small mb-0">No matches found.</p>
             </div>
          ) : (
              <div className="d-flex flex-column gap-2">
                <AnimatePresence>
                    {extractedData.filter(r => r.status === 'matched').map(record => (
                        <motion.div
                            key={record.regNumber}
                            layout
                            className="card border-0 bg-white shadow-sm rounded-3"
                        >
                            <div className="card-body p-3 d-flex align-items-center gap-3">
                                <div className="bg-success bg-opacity-10 text-success p-2 rounded-circle flex-shrink-0">
                                    <CheckCircle size={18} />
                                </div>
                                <div className="flex-grow-1 overflow-hidden">
                                    <h6 className="fw-bold mb-0 text-dark text-truncate small">{record.name}</h6>
                                    <span className="xx-small fw-black text-muted font-monospace tracking-widest">
                                        {record.regNumber}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
              </div>
          )}
        </div>

      </div>
    </div>
  );
}
