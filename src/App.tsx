import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Semesters from './pages/Semesters';
import Students from './pages/Students';
import Courses from './pages/Courses';
import Attendance from './pages/Attendance';
import Archives from './pages/Archives';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="semesters" element={<Semesters />} />
          <Route path="students" element={<Students />} />
          <Route path="courses" element={<Courses />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="archives" element={<Archives />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;