import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, BookOpen, CheckSquare, CalendarDays } from 'lucide-react';

const BottomNav: React.FC = () => {
  const navItems = [
    { path: '/', label: 'Feed', icon: LayoutDashboard },
    { path: '/students', label: 'Students', icon: Users },
    { path: '/attendance', label: 'Mark', icon: CheckSquare },
    { path: '/courses', label: 'Courses', icon: BookOpen },
    { path: '/semesters', label: 'Cycle', icon: CalendarDays },
  ];

  return (
    <nav className="bottom-nav bg-white border-top d-flex justify-content-around align-items-center py-2 px-1 shadow-top sticky-bottom">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => 
            `d-flex flex-column align-items-center text-decoration-none transition-all ${isActive ? 'text-primary' : 'text-muted opacity-75'}`
          }
          style={{ width: '20%' }}
        >
          {({ isActive }) => (
            <>
              <div className={`p-1 rounded-pill mb-1 transition-all ${isActive ? 'bg-primary-subtle' : 'bg-transparent'}`} style={{ width: '48px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="xx-small fw-black text-uppercase letter-spacing-n1">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <style>{`
        .bottom-nav {
          height: 70px;
          z-index: 1000;
        }
        .shadow-top {
          box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
        }
        .bg-primary-subtle {
          background-color: rgba(0, 105, 148, 0.1) !important;
        }
        @media (min-width: 501px) {
          .bottom-nav {
            position: absolute !important;
            bottom: 0;
            left: 0;
            right: 0;
          }
        }
      `}</style>
    </nav>
  );
};

export default BottomNav;
