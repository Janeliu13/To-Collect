import { useNavigate } from 'react-router-dom';

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div className="about-page">
      <button
        type="button"
        className="my-profile-back-btn"
        onClick={() => navigate('/main', { replace: true })}
        aria-label="Back to main"
      >
        <img
          src="/assets/back-button-shape.png?v=3"
          alt=""
          className="my-profile-back-btn-shape"
        />
      </button>
      <div className="about-page-rect-purple" aria-hidden />
      <div className="about-page-rect-blue" aria-hidden />
    </div>
  );
}
