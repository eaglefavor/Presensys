export default function AuthStyles() {
  return (
    <style>{`
      .auth-page {
        min-height: 100vh;
        background-color: #fcfcfd;
      }
      .auth-hero {
        background: linear-gradient(135deg, #0d6efd 0%, #0046af 100%);
        border-bottom-left-radius: 40px !important;
        border-bottom-right-radius: 40px !important;
      }
      .fw-black { font-weight: 900; }
      .letter-spacing-n1 { letter-spacing: -1.2px; }
      .x-small { font-size: 11px; }
      .xx-small { font-size: 10px; }
      .tracking-widest { letter-spacing: 3px; }

      .brand-icon-wrapper {
        width: 76px;
        height: 76px;
        background: rgba(255,255,255,0.1);
        backdrop-filter: blur(8px);
        border-radius: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255,255,255,0.2);
      }

      /* Mode Switcher Dial */
      .mode-switcher-wrapper {
        display: flex;
        background: #f1f3f5;
        border-radius: 100px;
        max-width: 240px;
        margin: 0 auto;
      }
      .mode-btn {
        flex: 1;
        border: none;
        background: transparent;
        padding: 10px 15px;
        font-size: 13px;
        font-weight: 700;
        color: #adb5bd;
        border-radius: 100px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .mode-btn.active {
        background: #fff;
        color: #0d6efd;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }

      /* Google Button Premium */
      .btn-google-premium {
        position: relative;
        background: #fff;
        border: 1px solid #e1e4e8;
        color: #3c4043;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .btn-google-premium:hover {
        background: #f8f9fa;
        border-color: #d1d4d8;
      }
      .faster-tag {
        position: absolute;
        top: -8px;
        right: 12px;
        background: #198754;
        color: #fff;
        font-size: 9px;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 50px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 8px rgba(25,135,84,0.3);
        border: 2px solid #fff;
      }

      .modern-input-unified {
        background: #f8f9fa;
        border-radius: 14px;
        overflow: hidden;
        border: 1.5px solid transparent;
        transition: all 0.2s ease;
      }
      .modern-input-unified:focus-within {
        border-color: #0d6efd;
        background: #fff;
        box-shadow: 0 8px 20px rgba(13,110,253,0.06);
      }
      .modern-input-unified .input-group-text {
        background: transparent;
        border: none;
        color: #ced4da;
        padding-left: 1.25rem;
      }
      .modern-input-unified .form-control {
        background: transparent;
        border: none;
        padding: 0.9rem 1.25rem 0.9rem 0;
        font-weight: 600;
        font-size: 15px;
      }
      .modern-input-unified .form-control:focus { box-shadow: none; }

      .btn-primary-unified {
        background: linear-gradient(135deg, #0d6efd 0%, #0056b3 100%);
        border: none;
        color: #fff;
        text-transform: uppercase;
      }

      .separator {
        position: relative;
        text-align: center;
      }
      .separator::before {
        content: "";
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 1px;
        background: #e9ecef;
      }
      .separator-text {
        position: relative;
        background: #fff;
        color: #adb5bd;
        font-size: 10px;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: 1px;
      }
    `}</style>
  );
}
