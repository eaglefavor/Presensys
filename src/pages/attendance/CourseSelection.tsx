import { motion, AnimatePresence } from 'framer-motion';
import { Book, ChevronRight } from 'lucide-react';
import type { LocalCourse } from '../../db/db';

interface CourseSelectionProps {
  courses: LocalCourse[] | undefined;
  coursePage: number;
  setCoursePage: (page: number | ((p: number) => number)) => void;
  totalCoursePages: number;
  displayedCourses: LocalCourse[] | undefined;
  itemsPerPage: number;
  onSelectCourse: (id: string) => void;
}

export default function CourseSelection({
  courses,
  coursePage,
  setCoursePage,
  totalCoursePages,
  displayedCourses,
  itemsPerPage,
  onSelectCourse
}: CourseSelectionProps) {
  return (
    <div className="attendance-page animate-in min-vh-100 pb-5" style={{ backgroundColor: 'var(--bg-gray)' }}>
      <div className="bg-white border-bottom px-4 py-4 mb-4 shadow-sm">
        <h1 className="h4 fw-black mb-0 text-primary text-uppercase letter-spacing-n1" style={{ color: 'var(--primary-blue)' }}>MARK ATTENDANCE</h1>
        <p className="xx-small fw-bold text-uppercase tracking-widest text-muted mb-0">Select a course to begin</p>
      </div>
      <div className="px-4 container-mobile d-flex flex-column gap-2">
        {courses === undefined ? (
          <div className="text-center py-5">
            <div className="spinner-border spinner-border-sm text-primary" role="status" />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {displayedCourses?.map(course => (
              <motion.div key={course.serverId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="card border-0 bg-white shadow-sm p-3 d-flex flex-row align-items-center gap-3 cursor-pointer rounded-4 transition-all active-scale" onClick={() => onSelectCourse(course.serverId)}>
                  <div className="bg-primary bg-opacity-10 text-primary p-2 rounded-2 shadow-inner"><Book size={24} /></div>
                  <div className="flex-grow-1 overflow-hidden">
                    <h6 className="fw-black mb-0 text-dark text-uppercase letter-spacing-n1">{course.code}</h6>
                    <p className="xx-small fw-bold text-muted mb-0 text-uppercase truncate">{course.title}</p>
                  </div>
                  <ChevronRight size={18} className="text-muted opacity-50" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {courses && courses.length > itemsPerPage && (
          <div className="d-flex justify-content-between align-items-center mt-4">
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={coursePage === 1} onClick={() => setCoursePage(p => Math.max(p - 1, 1))}>PREV</button>
            <span className="xx-small fw-black text-muted uppercase">Page {coursePage} of {totalCoursePages}</span>
            <button className="btn btn-light btn-sm fw-bold rounded-pill px-3 shadow-sm border" disabled={coursePage === totalCoursePages} onClick={() => setCoursePage(p => Math.min(p + 1, totalCoursePages))}>NEXT</button>
          </div>
        )}

        {courses !== undefined && courses.length === 0 && (
          <div className="text-center py-5 bg-white rounded-4 border-dashed border-2">
            <p className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">No courses available</p>
          </div>
        )}
      </div>
    </div>
  );
}
