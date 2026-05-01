import './SplashLogo.css';

export function SplashLogo() {
  return (
    <div className="splashLogoContainer" aria-label="Loading Presensys...">
      <svg className="splashLogoSvg" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">
        <path className="splashBaseLine" d="M 30 50 L 100 50 L 130 50 L 170 50"></path>
        <path className="splashFillLine" d="M 30 50 L 100 50 L 130 50 L 170 50"></path>
      </svg>
      <div className="splashTextContainer">
        <span className="splashTextPresen">Presen</span>
        <span className="splashTextSys">Sys</span>
      </div>
    </div>
  );
};
