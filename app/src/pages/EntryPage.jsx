import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const SUBMIT_GUARD_MS = 2000;   // 2 秒内不重复提交
const RATE_LIMIT_COOLDOWN = 30; // 429 后冷却秒数

export default function EntryPage() {
  const navigate = useNavigate();
  const { user, loading, profile, profileLoading } = useAuth();
  const [modal, setModal] = useState(null); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [signupCooldown, setSignupCooldown] = useState(0); // 429 后冷却秒数
  const [confirmEmailPopup, setConfirmEmailPopup] = useState(false);
  const lastSubmitRef = useRef(0); // 防止双击/重复提交

  // 冷却倒计时
  useEffect(() => {
    if (signupCooldown <= 0) return;
    const t = setInterval(() => {
      setSignupCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [signupCooldown]);

  // 已登录：有 profile 去主站，无 profile 去头像流程
  useEffect(() => {
    if (loading || profileLoading) return;
    if (!user) return;
    if (profile) navigate('/main', { replace: true });
    else navigate('/avatar/create', { replace: true });
  }, [user, profile, loading, profileLoading, navigate]);

  const authErrorMessage = (err, fallback) => {
    const msg = err?.message || '';
    if (err?.status === 429 || /rate|too many|429|status code 429|email rate limit/i.test(msg)) {
      return '请求过于频繁，请稍后再试。';
    }
    if (err?.status === 400 || msg) {
      if (/invalid login credentials|invalid_credentials/i.test(msg)) return '邮箱或密码错误。';
      if (/user already registered|already been registered/i.test(msg)) return '该邮箱已被注册，请直接登录。';
      if (/email not confirmed/i.test(msg)) return '请先到邮箱点击确认链接后再登录。';
      return msg || fallback;
    }
    return fallback;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastSubmitRef.current < SUBMIT_GUARD_MS) return;
    lastSubmitRef.current = now;
    setError('');
    setAuthLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (err) {
      setError(authErrorMessage(err, '登录失败，请重试。'));
      return;
    }
    setModal(null);
    setEmail('');
    setPassword('');
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastSubmitRef.current < SUBMIT_GUARD_MS) return;
    lastSubmitRef.current = now;
    setError('');
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位。');
      return;
    }
    setAuthLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/avatar/create`,
      },
    });
    setAuthLoading(false);
    if (err) {
      const msg = authErrorMessage(err, '注册失败，请重试。');
      setError(msg);
      if (msg === '请求过于频繁，请稍后再试。') setSignupCooldown(RATE_LIMIT_COOLDOWN);
      return;
    }
    // 若需邮箱确认且无 session，提示用户去邮箱；否则进入头像流程
    if (data?.user && !data?.session) {
      setModal(null);
      setConfirmEmailPopup(true);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      return;
    }
    setModal(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    navigate('/avatar/create', { replace: true });
  };

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="entry-page-hero">
      {/* Background uses /assets/bg-landing.png which already contains the title and band */}
      <div className="entry-page-hero-inner">
        <div className="entry-page-buttons">
          <button
            type="button"
            className="entry-page-btn"
            onClick={() => { setModal('login'); setError(''); }}
          >
            Login
          </button>
          <button
            type="button"
            className="entry-page-btn"
            onClick={() => { setModal('signup'); setError(''); }}
          >
            Sign up
          </button>
          <button
            type="button"
            className="entry-page-btn entry-page-btn-arrow"
            onClick={() => {
              setModal('login');
              setError('');
            }}
            aria-label="Open login"
          >
            <span className="entry-page-arrow-icon" />
          </button>
        </div>
      </div>

      {modal === 'login' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal">
              <div className="auth-modal-side" />
              <div className="auth-modal-main">
                <h3>Log In</h3>
                <form onSubmit={handleLogin}>
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  {error && <p className="form-error">{error}</p>}
                  <div className="modal-actions">
                    <button type="button" onClick={() => setModal(null)}>Cancel</button>
                    <button type="submit" disabled={authLoading}>
                      {authLoading ? 'Loading...' : 'Log In'}
                    </button>
                  </div>
                </form>
              </div>
              <div className="auth-modal-side" />
            </div>
          </div>
        </div>
      )}

      {modal === 'signup' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal">
              <div className="auth-modal-side" />
              <div className="auth-modal-main">
                <h3>Sign Up</h3>
                <form onSubmit={handleSignUp}>
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Confirm Password
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  {error && (
                    <p className="form-error">
                      {error}
                      {error === '请求过于频繁，请稍后再试。' && (
                        <span className="form-error-hint">（同一 IP/网络下之前的请求也会计入限流，可稍等再试）</span>
                      )}
                    </p>
                  )}
                  {signupCooldown > 0 && (
                    <p className="form-info">请 {signupCooldown} 秒后再试</p>
                  )}
                  <div className="modal-actions">
                    <button type="button" onClick={() => setModal(null)}>Cancel</button>
                    <button
                      type="submit"
                      disabled={authLoading || signupCooldown > 0}
                    >
                      {authLoading ? 'Loading...' : signupCooldown > 0 ? `${signupCooldown}s` : 'Create Account'}
                    </button>
                  </div>
                </form>
              </div>
              <div className="auth-modal-side" />
            </div>
          </div>
        </div>
      )}

      {confirmEmailPopup && (
        <div className="modal-overlay" onClick={() => setConfirmEmailPopup(false)}>
          <div className="confirm-email-popup" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-email-popup-text">
              Please check your email and click the confirmation link to continue.
            </p>
            <button
              type="button"
              className="confirm-email-popup-btn"
              onClick={() => setConfirmEmailPopup(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
