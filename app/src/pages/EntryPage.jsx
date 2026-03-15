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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const lastSubmitRef = useRef(0); // 防止双击/重复提交

  const INVALID_CREDENTIALS_MSG = 'Invalid email or password.';

  // Detect password reset callback (hash contains type=recovery)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash) return;
    if (window.location.hash.includes('type=recovery')) setRecoveryMode(true);
  }, []);

  // 冷却倒计时
  useEffect(() => {
    if (signupCooldown <= 0) return;
    const t = setInterval(() => {
      setSignupCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [signupCooldown]);

  // 已登录：有 profile 去主站，无 profile 去头像流程（recovery 时先不跳转，等用户设置新密码）
  useEffect(() => {
    if (loading || profileLoading) return;
    if (!user) return;
    if (recoveryMode) return; // wait for user to set new password
    if (profile) navigate('/main', { replace: true });
    else navigate('/avatar/create', { replace: true });
  }, [user, profile, loading, profileLoading, recoveryMode, navigate]);

  const authErrorMessage = (err, fallback) => {
    const msg = (err?.message || '').trim();
    // Rate limit (429): always show English; catch Chinese or other locale messages
    if (
      err?.status === 429 ||
      /rate|too many|429|status code 429|email rate limit|请求过于频繁|稍后再试|限流/i.test(msg)
    ) {
      return 'Too many requests. Please try again later.';
    }
    if (err?.status === 400 || msg) {
      if (/invalid login credentials|invalid_credentials/i.test(msg)) return INVALID_CREDENTIALS_MSG;
      if (/user already registered|already been registered/i.test(msg)) return 'This email is already registered. Please log in.';
      if (/email not confirmed/i.test(msg)) return 'Please confirm your email by clicking the link we sent you.';
      // If server returned a non-ASCII (e.g. Chinese) message, use fallback so UI stays in English
      if (/[^\x00-\x7F]/.test(msg)) return fallback;
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
      setError(authErrorMessage(err, 'Login failed. Please try again.'));
      return;
    }
    setModal(null);
    setEmail('');
    setPassword('');
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      setRecoveryError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setRecoveryError('Password must be at least 6 characters.');
      return;
    }
    setRecoveryError('');
    setRecoveryLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setRecoveryLoading(false);
    if (err) {
      setRecoveryError(err.message || 'Failed to update password.');
      return;
    }
    window.history.replaceState(null, '', window.location.pathname);
    setRecoveryMode(false);
    setNewPassword('');
    setNewPasswordConfirm('');
    navigate('/main', { replace: true });
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    setResetLoading(false);
    if (err) {
      setResetError(err.message || 'Failed to send reset link. Please try again.');
      return;
    }
    setResetLinkSent(true);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastSubmitRef.current < SUBMIT_GUARD_MS) return;
    lastSubmitRef.current = now;
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
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
      const msg = authErrorMessage(err, 'Sign up failed. Please try again.');
      setError(msg);
      if (msg === 'Too many requests. Please try again later.') setSignupCooldown(RATE_LIMIT_COOLDOWN);
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
      {/* Password reset callback: set new password */}
      {recoveryMode && user && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal">
              <div className="auth-modal-side" />
              <div className="auth-modal-main">
                <h3>Set new password</h3>
                <form onSubmit={handleSetNewPassword}>
                  <label>
                    New password
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                    />
                  </label>
                  <label>
                    Confirm password
                    <input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  {recoveryError && <p className="form-error">{recoveryError}</p>}
                  <div className="modal-actions">
                    <button type="submit" disabled={recoveryLoading}>
                      {recoveryLoading ? 'Updating...' : 'Update password'}
                    </button>
                  </div>
                </form>
              </div>
              <div className="auth-modal-side" />
            </div>
          </div>
        </div>
      )}

      {/* Background uses /assets/bg-landing.png which already contains the title and band */}
      <div className="entry-page-hero-inner">
        <div className="entry-page-buttons">
          <button
            type="button"
            className="entry-page-btn"
            onClick={() => { setModal('login'); setError(''); setShowForgotPassword(false); setResetLinkSent(false); setResetError(''); }}
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
              setShowForgotPassword(false);
              setResetLinkSent(false);
              setResetError('');
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
                {!showForgotPassword ? (
                  <>
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
                      {error && (
                        <p className="form-error">
                          {error}
                          {error === INVALID_CREDENTIALS_MSG && (
                            <button
                              type="button"
                              className="form-forgot-password-link"
                              onClick={() => { setShowForgotPassword(true); setError(''); setResetError(''); setResetLinkSent(false); }}
                            >
                              Forgot password?
                            </button>
                          )}
                        </p>
                      )}
                      <div className="modal-actions">
                        <button type="button" onClick={() => setModal(null)}>Cancel</button>
                        <button type="submit" disabled={authLoading}>
                          {authLoading ? 'Loading...' : 'Log In'}
                        </button>
                      </div>
                    </form>
                  </>
                ) : resetLinkSent ? (
                  <>
                    <h3>Check your email</h3>
                    <p className="form-info">We sent a password reset link to {email}. Click the link in the email to set a new password.</p>
                    <div className="modal-actions">
                      <button type="button" onClick={() => { setShowForgotPassword(false); setResetLinkSent(false); }}>Back to login</button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3>Reset password</h3>
                    <form onSubmit={handleForgotPasswordSubmit}>
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
                      {resetError && <p className="form-error">{resetError}</p>}
                      <div className="modal-actions">
                        <button type="button" onClick={() => { setShowForgotPassword(false); setResetError(''); }}>Back to login</button>
                        <button type="submit" disabled={resetLoading}>
                          {resetLoading ? 'Sending...' : 'Send reset link'}
                        </button>
                      </div>
                    </form>
                  </>
                )}
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
                      {error === 'Too many requests. Please try again later.' && (
                        <span className="form-error-hint"> (Previous requests from this IP count toward the limit. Wait a moment and try again.)</span>
                      )}
                    </p>
                  )}
                  {signupCooldown > 0 && (
                    <p className="form-info">Please try again in {signupCooldown} seconds</p>
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
