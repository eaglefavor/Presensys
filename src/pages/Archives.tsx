import React, { useState } from 'react';
 //  'dexie-react-hooks';
import { Search, Archive, User, Download } from 'lucide-react';
import { db } from '../db/db';

export default function Archives() {
  const [searchReg, setSearchReg] = useState('');
  const [studentResult, setStudentResult] = useState<any>(null);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchReg.trim()) return;

    const student = await db.students.where('regNumber').equals(searchReg.trim()).first();
    if (!student) {
      setStudentResult(null);
      alert('Student not found');
      return;
    }

    setStudentResult(student);

    // Get all attendance records for this student
    const records = await db.attendanceRecords.where('studentId').equals(student.id!).toArray();
    
    const detailedRecords = [];
    for (const record of records) {
      const session = await db.attendanceSessions.get(record.sessionId);
      if (session) {
        const course = await db.courses.get(session.courseId);
        const semester = await db.semesters.get(course?.semesterId || -1);
        detailedRecords.push({
          ...record,
          session,
          course,
          semester
        });
      }
    }

    // Sort by date descending
    detailedRecords.sort((a, b) => new Date(b.session.date).getTime() - new Date(a.session.date).getTime());
    setStudentAttendance(detailedRecords);
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Archives & Search</h1>
      </div>

      <div className="card shadow-sm border-0 mb-4 bg-primary text-white">
        <div className="card-body p-4">
          <form onSubmit={handleSearch}>
            <label className="form-label fw-bold mb-3">Lookup Student History</label>
            <div className="input-group input-group-lg shadow">
              <span className="input-group-text bg-white border-0 text-primary">
                <Search size={24} />
              </span>
              <input 
                type="text" 
                className="form-control border-0" 
                placeholder="Enter UNIZIK Registration Number (e.g. 2020...)"
                value={searchReg}
                onChange={e => setSearchReg(e.target.value)}
              />
              <button className="btn btn-warning fw-bold px-4" type="submit">Search</button>
            </div>
          </form>
        </div>
      </div>

      {studentResult ? (
        <div className="row g-4">
          <div className="col-12 col-lg-4">
            <div className="card border-0 shadow-sm text-center p-4 h-100">
              <div className="mx-auto bg-light text-primary rounded-circle p-4 mb-3" style={{ width: 'fit-content' }}>
                <User size={48} />
              </div>
              <h3 className="fw-bold mb-1">{studentResult.name}</h3>
              <p className="text-muted mb-4 font-monospace">{studentResult.regNumber}</p>
              <hr />
              <div className="row g-2 mt-2">
                <div className="col-6">
                  <div className="p-3 bg-light rounded">
                    <div className="small text-muted mb-1">Total Classes</div>
                    <div className="h4 mb-0 fw-bold">{studentAttendance.length}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-3 bg-light rounded">
                    <div className="small text-muted mb-1">Present</div>
                    <div className="h4 mb-0 fw-bold text-success">
                      {studentAttendance.filter(r => r.status === 'present').length}
                    </div>
                  </div>
                </div>
              </div>
              <button className="btn btn-outline-primary mt-4 w-100 d-flex align-items-center justify-content-center gap-2">
                <Download size={18} /> Export History (PDF)
              </button>
            </div>
          </div>

          <div className="col-12 col-lg-8">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white py-3">
                <h5 className="mb-0 fw-bold">Attendance Timeline</h5>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light small text-uppercase text-muted">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th>Semester / Course</th>
                        <th className="text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentAttendance.map((record, idx) => (
                        <tr key={idx}>
                          <td className="px-4">
                            <div className="fw-bold">{record.session.date}</div>
                            <div className="small text-muted">{record.session.title}</div>
                          </td>
                          <td>
                            <div className="fw-medium text-primary small">{record.semester?.name}</div>
                            <div>{record.course?.code}: {record.course?.title}</div>
                          </td>
                          <td className="text-center">
                            {record.status === 'present' && <span className="badge bg-success">Present</span>}
                            {record.status === 'absent' && <span className="badge bg-danger">Absent</span>}
                            {record.status === 'excused' && <span className="badge bg-warning text-dark">Excused</span>}
                          </td>
                        </tr>
                      ))}
                      {studentAttendance.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-center py-5 text-muted">No attendance records found for this student.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-5">
          <Archive size={64} className="text-muted mb-3 opacity-25" />
          <p className="text-muted">Enter a registration number to view a student's full attendance history.</p>
        </div>
      )}
    </div>
  );
}