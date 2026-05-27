import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Save, RefreshCw, X, ArrowLeft, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleGenAI } from '@google/genai';
import { getApiKeys, getFallbackModels } from '../../lib/apiKeyManager';

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

        // Get API Keys from shared manager (environment or encrypted fallbacks)
        const apiKeys = getApiKeys();

        // Dynamic model selection based on network quality and image count
        // Get model queue using shared apiKeyManager
        const modelQueue = getFallbackModels(images.length);

        const imageParts = parseImagesForGemini(images);

        const enrollmentsContext = enrollments.map(e => `${e.regNumber}: ${e.name}`).join('\n');

        const prompt = `
          You are an advanced data extraction and reconciliation tool. Attached are ${images.length} image(s) of a university attendance sheet (front and potentially back).
          Your task is to extract all handwritten 10-digit Registration Numbers and their corresponding Names, but with a CRITICAL cross-referencing step against a known database.

          --- DATABASE CONTEXT ---
          Here is the list of enrolled students (Registration Number: Name):
          ${enrollmentsContext}
          ------------------------

          --- REGISTRATION NUMBER SEGMENTATION ---
          Understand that the 10-digit Registration Numbers are segmented:
          - First 4 digits: Admission Date / Year (e.g., "2023").
          - Next 3 digits: Static Course / Department Code (e.g., "104", "105").
          - Last 3 digits: Unique Dynamic Student Identifier (e.g., "001", "003").

          CRITICAL RULES & WORKFLOW:
          1. Read the handwritten registration numbers and names from the images.
          2. CROSS-REFERENCE: For every handwritten entry, cross-reference it against the provided DATABASE CONTEXT.
             If handwriting is messy or unclear, heavily rely on the unique last 3 digits and the student's name to accurately infer the full 10-digit Registration Number.
          3. If the first 7 digits are ambiguous, assume they match the common patterns found in the database.
          4. Merge the data from all images into a single list.
          5. Ignore duplicate Registration Numbers (e.g., if ink bled through the paper).
          6. Ignore reversed text or bleed-through.
          7. Output the best-matched Registration Number from the database if a clear correlation is found.
          8. Return STRICTLY a valid JSON array of objects with keys "regNumber" (string) and "name" (string).
          9. Do not include markdown blocks like \`\`\`json or \`\`\`. Output ONLY the raw JSON array.
        `;

        let response = null;
        let lastError = null;

        // Loop through each API key
        for (const apiKey of apiKeys) {
            let keySuccess = false;

            // For the current key, loop through the fallback models
            for (const currentModel of modelQueue) {
                try {
                    const ai = new GoogleGenAI({ apiKey });
                    response = await ai.models.generateContent({
                        model: currentModel,
                        contents: [
                            prompt,
                            ...imageParts
                        ]
                    });
                    // If successful, break out of the model loop and mark key as success
                    keySuccess = true;
                    break;
                } catch (e: unknown) {
                    const errMsg = (e instanceof Error ? e.message : 'unknown error') || 'unknown error';
                    console.warn(`API key with model ${currentModel} failed (${errMsg}).`);
                    lastError = e;

                    // If the error suggests an invalid API key or quota exceeded across the board,
                    // it might make sense to break early to the next key, but for robustness
                    // against model-specific outages (like a 503 or 400 on an experimental model),
                    // we continue to the next model in the queue.
                }
            }

            // If the key succeeded on any model, break out of the API key loop
            if (keySuccess) {
                break;
            } else {
                console.warn("All models failed for current API key. Switching to next key...");
            }
        }

        if (!response) {
          throw lastError || new Error("All available API keys failed or were rate-limited.");
        }

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
               const cleanReg = item.regNumber.toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
               if (!uniqueMap.has(cleanReg)) {
                   uniqueMap.set(cleanReg, { regNumber: cleanReg, name: item.name || 'Unknown' });
               }
           }
        });
        const uniqueData = Array.from(uniqueMap.values());

        // 2. The Matching Logic
        const processedRecords: ExtractedRecord[] = uniqueData.map(item => {
           // Direct Match
           let match = enrollments.find(e =>
               e.regNumber.toUpperCase() === item.regNumber ||
               e.regNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === item.regNumber
           );

           // Fuzzy Match / Segmented Fallback
           if (!match && item.regNumber.length >= 3) {
               const last3 = item.regNumber.slice(-3);
               const fuzzyMatches = enrollments.filter(e => {
                   const eClean = e.regNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                   return eClean.endsWith(last3);
               });

               // If exactly one student has these last 3 digits, we can confidently assume it's them.
               if (fuzzyMatches.length === 1) {
                   match = fuzzyMatches[0];
               } else if (fuzzyMatches.length > 1 && item.name) {
                   // If multiple share the last 3, check if the name matches partially
                   const ocrNameParts = item.name.toLowerCase().split(/\s+/);
                   match = fuzzyMatches.find(e => {
                       const dbName = e.name.toLowerCase();
                       // Consider it a match if any significant part of the OCR name is in the DB name
                       return ocrNameParts.some((part: string) => part.length > 2 && dbName.includes(part));
                   });
               }
           }

           if (match) {
               return {
                   ...item,
                   status: 'matched',
                   matchedServerId: match.serverId,
                   name: match.name, // Prefer DB name over OCR name
                   regNumber: match.regNumber // Prefer DB regNumber to fix typos
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

    const cleanEdit = editValue.trim().toUpperCase();
    const match = enrollments.find(e =>
        e.regNumber.toUpperCase() === cleanEdit ||
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
