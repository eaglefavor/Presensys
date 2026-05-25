import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDarkModeStore } from '../../../store/useDarkModeStore';

export function DarkModeSection() {
  const { isDarkMode, toggleDarkMode } = useDarkModeStore();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <div className="d-flex align-items-center gap-2 mb-3 px-1">
        <Moon size={14} className="text-muted" />
        <h6 className="xx-small fw-black text-muted text-uppercase tracking-widest mb-0">
          Display Theme
        </h6>
      </div>

      <div className="card border-0 shadow-sm p-4 rounded-4 mb-4" style={{ backgroundColor: 'var(--soft-white)' }}>
        <div className="d-flex align-items-center justify-content-between">
          <div className="flex-grow-1">
            <h5 className="fw-black text-uppercase mb-1 letter-spacing-n1" style={{ color: 'var(--text-dark)' }}>
              Dark Mode
            </h5>
            <p className="xx-small fw-bold text-muted mb-0">
              {isDarkMode ? 'Currently using dark mode' : 'Currently using light mode'}
            </p>
          </div>
          <button
            onClick={toggleDarkMode}
            className="btn btn-primary rounded-pill d-flex align-items-center justify-content-center gap-2 px-4 py-2"
            style={{
              backgroundColor: isDarkMode ? 'var(--primary-blue)' : 'var(--primary-blue)',
              borderColor: isDarkMode ? 'var(--primary-blue)' : 'var(--primary-blue)',
            }}
          >
            {isDarkMode ? (
              <>
                <Sun size={18} />
                <span className="xx-small fw-bold">Light</span>
              </>
            ) : (
              <>
                <Moon size={18} />
                <span className="xx-small fw-bold">Dark</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-3 p-3 rounded-3 d-flex gap-2 align-items-start" style={{ backgroundColor: 'var(--bg-gray)' }}>
          {isDarkMode ? (
            <Moon size={18} style={{ color: 'var(--primary-blue)', marginTop: '2px', flexShrink: 0 }} />
          ) : (
            <Sun size={18} style={{ color: 'var(--primary-blue)', marginTop: '2px', flexShrink: 0 }} />
          )}
          <p className="xx-small mb-0 fw-bold" style={{ color: 'var(--text-muted)' }}>
            {isDarkMode
              ? 'Dark mode reduces eye strain in low-light environments and saves battery on OLED screens.'
              : 'Light mode provides better visibility in bright environments.'}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
