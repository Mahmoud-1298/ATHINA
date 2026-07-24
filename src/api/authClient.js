import { invokeFunction } from '@/lib/functionApi';

const getLocalUser = () => {
  const stored = localStorage.getItem('athina_user');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Ignore malformed storage data and fallback to a default user.
    }
  }

  const localUser = {
    id: localStorage.getItem('athina_session_id') || crypto.randomUUID(),
    email: 'operator@local.athina',
    full_name: 'Operator',
    role: 'admin',
  };
  localStorage.setItem('athina_session_id', localUser.id);
  localStorage.setItem('athina_user', JSON.stringify(localUser));
  return localUser;
};

export const authClient = {
  auth: {
    me: async () => getLocalUser(),
    logout: (redirectTo) => {
      if (redirectTo) window.location.href = redirectTo;
    },
    redirectToLogin: (redirectTo) => {
      window.location.href = redirectTo || '/';
    },
    loginViaEmailPassword: async () => {
      throw new Error('Email/password auth is not configured.');
    },
    loginWithProvider: () => {
      throw new Error('OAuth login is not configured.');
    },
    resetPasswordRequest: async () => {
      throw new Error('Password reset is not configured.');
    },
    register: async () => {
      throw new Error('Registration is not configured.');
    },
    verifyOtp: async () => {
      throw new Error('OTP verification is not configured.');
    },
    setToken: () => {},
    resendOtp: async () => {
      throw new Error('OTP resend is not configured.');
    },
    resetPassword: async () => {
      throw new Error('Password reset is not configured.');
    },
  },
  functions: {
    invoke: (name, payload) => invokeFunction(name, payload),
  },
};
