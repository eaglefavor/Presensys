import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { read, utils } from 'xlsx';

interface FileMapperProps {
  file: File;
  onComplete: (data: { name: string; regNumber: string }[]) => void;
  onCancel: () => void;
}

export default function FileMapper({ file, onComplete, onCancel }: FileMapperProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [mapping, setMapping] = useState({ name: '', regNumber: '' });
  const [previewData, setPreviewData] = useState<any[]>([]);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const workbook = read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = utils.sheet_to_json(sheet, { header: 1 });
      
      if (json.length > 0) {
        const headerRow = json[0] as string[];
        setHeaders(headerRow);
        setRawData(json.slice(1)); // All rows except header
        
        // Auto-guess columns
        const nameGuess = headerRow.find(h => h.toLowerCase().includes('name')) || '';
        const regGuess = headerRow.find(h => h.toLowerCase().includes('reg') || h.toLowerCase().includes('matric') || h.toLowerCase().includes('no')) || '';
        setMapping({ name: nameGuess, regNumber: regGuess });
      }
    };
    reader.readAsBinaryString(file);
  }, [file]);

  useEffect(() => {
    if (mapping.name && mapping.regNumber) {
      const nameIdx = headers.indexOf(mapping.name);
      const regIdx = headers.indexOf(mapping.regNumber);
      
      const preview = rawData.slice(0, 5).map(row => ({
        name: row[nameIdx],
        regNumber: row[regIdx]
      }));
      setPreviewData(preview);
    }
  }, [mapping, headers, rawData]);

  const handleFinish = () => {
    const nameIdx = headers.indexOf(mapping.name);
    const regIdx = headers.indexOf(mapping.regNumber);
    
    const finalData = rawData.map(row => ({
      name: String(row[nameIdx] || '').trim(),
      regNumber: String(row[regIdx] || '').trim()
    })).filter(r => r.name && r.regNumber); // Filter empty rows

    onComplete(finalData);
  };

  return (
    <div className="h-100 d-flex flex-column">
      <div className="mb-4">
        <h5 className="fw-bold">Map Your Columns</h5>
        <p className="text-muted small">We found the following columns in your file. Please verify they match.</p>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-md-6">
          <label className="form-label fw-bold small text-uppercase text-muted">Student Name Column</label>
          <select 
            className="form-select"
            value={mapping.name}
            onChange={e => setMapping({...mapping, name: e.target.value})}
          >
            <option value="">-- Select Column --</option>
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label fw-bold small text-uppercase text-muted">Reg Number Column</label>
          <select 
            className="form-select"
            value={mapping.regNumber}
            onChange={e => setMapping({...mapping, regNumber: e.target.value})}
          >
            <option value="">-- Select Column --</option>
            {headers.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>

      {previewData.length > 0 && (
        <div className="bg-light rounded-3 p-3 mb-4 border">
          <h6 className="fw-bold small text-uppercase text-muted mb-3">Live Preview (First 5 Rows)</h6>
          <div className="table-responsive">
            <table className="table table-sm table-borderless mb-0">
              <thead>
                <tr>
                  <th className="w-50">Name</th>
                  <th className="w-50">Reg Number</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.name}</td>
                    <td><span className="font-monospace">{row.regNumber}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-auto d-flex gap-2">
        <button className="btn btn-light flex-grow-1" onClick={onCancel}>Cancel</button>
        <button 
          className="btn btn-success flex-grow-1 d-flex align-items-center justify-content-center gap-2"
          disabled={!mapping.name || !mapping.regNumber}
          onClick={handleFinish}
        >
          Import {rawData.length} Students <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
