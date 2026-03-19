// @ts-nocheck
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { useNotifications } from '@/hooks/useNotifications';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

interface LoginFormProps {
  onSuccess?: () => void;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const { toast } = useNotifications();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Email validation regex
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error for this field when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const { error } = await login(formData.email, formData.password);

      if (error) {
        // Handle specific error messages
        if (error.message.includes('Invalid login credentials')) {
          setErrors({
            general: 'Invalid email or password. Please try again.',
          });
        } else if (error.message.includes('Email not confirmed')) {
          setErrors({
            general:
              'Please verify your email first. Check your inbox for the verification link.',
          });
        } else {
          setErrors({
            general: error.message || 'Failed to login. Please try again.',
          });
        }

        toast({
          type: 'error',
          title: 'Login Failed',
          description: error.message || 'Unable to login',
        });
      } else {
        toast({
          type: 'success',
          title: 'Welcome back!',
          description: 'You have been successfully logged in.',
        });

        // Store remember me preference
        if (rememberMe) {
          localStorage.setItem('rememberEmail', formData.email);
        }

        // Redirect to dashboard or onboarding
        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/dashboard');
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred';
      setErrors({
        general: errorMessage,
      });

      toast({
        type: 'error',
        title: 'Error',
        description: errorMessage,
      });
    }
  };

  // Handle forgot password
  const handleForgotPassword = () => {
    navigate('/auth/reset-password', { state: { email: formData.email } });
  };

  return (
    <div className="w-full max-w-md">
      <Card className="p-6 shadow-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign in to your Clarity Assistant account
          </p>
        </div>

        {/* General Error Alert */}
        {errors.general && (
          <Alert variant="destructive" className="mb-4">
            {errors.general}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleInputChange}
                disabled={isLoading}
                className={`pl-10 ${
                  errors.email ? 'border-red-500 focus:border-red-500' : ''
                }`}
                autoComplete="email"
                required
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleInputChange}
                disabled={isLoading}
                className={`pl-10 pr-10 ${
                  errors.password ? 'border-red-500 focus:border-red-500' : ''
                }`}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-500">{errors.password}</p>
            )}
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                Remember me
              </span>
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={isLoading}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
            >
              Forgot password?
            </button>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        {/* Sign Up Link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/auth/signup')}
              disabled={isLoading}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium disabled:opacity-50"
            >
              Sign up here
            </button>
          </p>
        </div>

        {/* Demo Credentials (for development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
            <p className="font-semibold mb-1">Demo Credentials:</p>
            <p>Email: demo@example.com</p>
            <p>Password: demo@123</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default LoginForm;
