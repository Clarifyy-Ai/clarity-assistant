import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { useNotifications } from '@/hooks/useNotifications';
import { Mail, Check, X, Clock } from 'lucide-react';

interface VerifyEmailModalProps {
  email?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export const VerifyEmailModal = ({
  email: initialEmail,
  isOpen = true,
  onClose,
}: VerifyEmailModalProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyEmail, resendVerificationEmail, isLoading } = useAuth();
  const { toast } = useNotifications();

  // Get email from props or location state
  const email = initialEmail || (location.state?.email as string) || '';

  const [verificationCode, setVerificationCode] = useState('');
  const [errors, setErrors] = useState<{ code?: string; general?: string }>({});
  const [isVerified, setIsVerified] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [canResend, setCanResend] = useState(true);

  // Resend timer logic
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (resendTimer === 0 && !canResend) {
      setCanResend(true);
    }
  }, [resendTimer, canResend]);

  // Handle code verification
  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    if (!verificationCode.trim()) {
      setErrors({ code: 'Verification code is required' });
      return;
    }

    if (verificationCode.length < 6) {
      setErrors({ code: 'Verification code must be at least 6 characters' });
      return;
    }

    try {
      const { error } = await verifyEmail(email, verificationCode);

      if (error) {
        if (error.message.includes('invalid') || error.message.includes('wrong')) {
          setErrors({ code: 'Invalid verification code. Please try again.' });
        } else {
          setErrors({ general: error.message });
        }

        toast({
          type: 'error',
          title: 'Verification Failed',
          description: error.message || 'Invalid verification code',
        });
      } else {
        setIsVerified(true);
        toast({
          type: 'success',
          title: 'Email Verified!',
          description: 'Your email has been verified successfully.',
        });

        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/auth/login', { state: { email } });
        }, 2000);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred';

      setErrors({ general: errorMessage });
      toast({
        type: 'error',
        title: 'Error',
        description: errorMessage,
      });
    }
  };

  // Handle resend verification email
  const handleResendEmail = async () => {
    setErrors({});

    if (!canResend || resendTimer > 0) {
      return;
    }

    try {
      const { error } = await resendVerificationEmail(email);

      if (error) {
        setErrors({ general: error.message });
        toast({
          type: 'error',
          title: 'Resend Failed',
          description: error.message || 'Failed to resend verification email',
        });
      } else {
        toast({
          type: 'success',
          title: 'Email Sent!',
          description: `Verification email sent to ${email}`,
        });

        setCanResend(false);
        setResendTimer(60); // 60 second cooldown
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred';

      setErrors({ general: errorMessage });
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  };

  // Format verification code input (spaces every 3 characters)
  const formatVerificationCode = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const formatted = cleaned.match(/.{1,3}/g)?.join(' ') || cleaned;
    return formatted.toUpperCase();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full max-w-md">
        <Card className="p-6 shadow-lg">
          {!isVerified ? (
            <>
              <div className="mb-6 text-center">
                <div className="mb-4 flex justify-center">
                  <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-4">
                    <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Verify Your Email
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  We've sent a verification code to{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {email}
                  </span>
                </p>
              </div>

              {/* General Error Alert */}
              {errors.general && (
                <Alert variant="destructive" className="mb-4">
                  {errors.general}
                </Alert>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                {/* Verification Code Input */}
                <div>
                  <label htmlFor="code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Verification Code
                  </label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="000 000"
                    value={verificationCode}
                    onChange={(e) => {
                      const formatted = formatVerificationCode(e.target.value);
                      setVerificationCode(formatted);
                      if (errors.code) {
                        setErrors((prev) => ({ ...prev, code: undefined }));
                      }
                    }}
                    disabled={isLoading}
                    className={`text-center text-2xl font-mono tracking-widest ${
                      errors.code ? 'border-red-500 focus:border-red-500' : ''
                    }`}
                    maxLength={7}
                    required
                  />
                  {errors.code && (
                    <p className="mt-1 text-sm text-red-500">{errors.code}</p>
                  )}
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isLoading || verificationCode.length < 7}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 rounded-lg transition"
                >
                  {isLoading ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Email'
                  )}
                </Button>
              </form>

              {/* Resend Section */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Didn't receive the code?
                </p>
                <Button
                  onClick={handleResendEmail}
                  disabled={isLoading || !canResend || resendTimer > 0}
                  variant="outline"
                  className="w-full py-2 rounded-lg transition"
                >
                  {resendTimer > 0 ? (
                    <>
                      <Clock className="mr-2 h-4 w-4" />
                      Resend in {resendTimer}s
                    </>
                  ) : (
                    'Resend Code'
                  )}
                </Button>
              </div>

              {/* Change Email Link */}
              <div className="mt-4 text-center">
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
                >
                  Change email address
                </button>
              </div>
            </>
          ) : (
            // Success State
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900 p-4">
                  <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Email Verified!
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Your email has been successfully verified. You can now log in to your account.
              </p>
              <Button
                onClick={() => navigate('/auth/login', { state: { email } })}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition"
              >
                Go to Login
              </Button>
            </div>
          )}
        </Card>

        {/* Info Message */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
          <p>
            <strong>Note:</strong> Check your spam folder if you don't see the
            verification email within a few minutes.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default VerifyEmailModal;
