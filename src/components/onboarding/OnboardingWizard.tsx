import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/userStore';
import { useNotifications } from '@/hooks/useNotifications';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * OnboardingWizard Component
 *
 * Main wizard container that orchestrates the onboarding flow:
 * - Step detection from URL
 * - Navigation (next/prev)
 * - Progress tracking
 * - Data persistence
 * - Form validation
 * - Completion handling
 */

interface OnboardingStep {
  number: number;
  path: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
  skipAllowed?: boolean;
}

interface OnboardingWizardProps {
  steps?: OnboardingStep[];
  onComplete?: () => void;
  onSkip?: () => void;
}

const DEFAULT_STEPS: OnboardingStep[] = [
  {
    number: 1,
    path: '/onboarding/step-1',
    title: 'Role & Domain',
    description: 'Tell us about yourself',
    component: () => null, // Will be imported dynamically
  },
  {
    number: 2,
    path: '/onboarding/step-2',
    title: 'Experience',
    description: 'Your experience level',
    component: () => null,
  },
  {
    number: 3,
    path: '/onboarding/step-3',
    title: 'Preferences',
    description: 'Interview preferences',
    component: () => null,
  },
  {
    number: 4,
    path: '/onboarding/step-4',
    title: 'Audio Setup',
    description: 'Test your microphone',
    component: () => null,
    skipAllowed: true,
  },
  {
    number: 5,
    path: '/onboarding/step-5',
    title: 'Resume',
    description: 'Upload your resume',
    component: () => null,
    skipAllowed: true,
  },
];

export function OnboardingWizard({
  steps = DEFAULT_STEPS,
  onComplete,
  onSkip,
}: OnboardingWizardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuthStore();
  const toast = useToast();

  // Determine current step from URL
  const currentStepNumber = parseInt(
    location.pathname.split('-').pop() || '1',
    10
  );
  const currentStep = steps.find((s) => s.number === currentStepNumber) || steps[0];
  const currentStepIndex = steps.indexOf(currentStep);

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [canSkip, setCanSkip] = useState(
    currentStep.skipAllowed === true
  );

  // Effects
  useEffect(() => {
    // Redirect if not authenticated
    if (!user) {
      navigate('/auth/login');
      return;
    }

    // Skip completed onboarding
    if (profile?.onboarding_complete && currentStepNumber === 1) {
      navigate('/dashboard');
      return;
    }

    // Validate step access (prevent jumping ahead)
    if (profile && profile.onboarding_step < currentStepNumber) {
      navigate(`/onboarding/step-${profile.onboarding_step}`);
      return;
    }
  }, [user, profile, navigate, currentStepNumber]);

  // Handlers
  const handleNext = async () => {
    if (isLoading) return;

    const nextStepIndex = currentStepIndex + 1;
    const isLastStep = nextStepIndex >= steps.length;

    if (isLastStep) {
      handleComplete();
    } else {
      const nextStep = steps[nextStepIndex];
      navigate(nextStep.path);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      const prevStep = steps[currentStepIndex - 1];
      navigate(prevStep.path);
    }
  };

  const handleSkip = () => {
    if (!canSkip) return;

    onSkip?.();
    toast({
      type: 'success',
      title: 'Skipped',
      description: `Skipped ${currentStep.title}`,
    });

    handleNext();
  };

  const handleComplete = async () => {
    setIsLoading(true);

    try {
      // Mark onboarding as complete in database
      // This would be handled by the final step page
      onComplete?.();

      toast({
        type: 'success',
        title: 'Welcome!',
        description: 'Onboarding complete. Redirecting to dashboard...',
      });

      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (error) {
      toast({
        type: 'error',
        title: 'Error',
        description: 'Failed to complete onboarding',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Top Progress Bar */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Step info */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/20 border border-violet-600/40">
                <span className="text-xs font-bold text-violet-300">
                  {currentStep.number}/{steps.length}
                </span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-white">
                  {currentStep.title}
                </h1>
                <p className="text-xs text-gray-500">
                  {currentStep.description}
                </p>
              </div>
            </div>

            {/* Right: Progress percentage */}
            <div className="text-right">
              <div className="text-xs font-medium text-gray-400">
                {Math.round((currentStepIndex / steps.length) * 100)}%
              </div>
              <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-300"
                  style={{
                    width: `${(currentStepIndex / steps.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Page outlet - Step content renders here */}
        <div className="rounded-lg border border-white/10 bg-white/[0.01] p-8 backdrop-blur-sm">
          {/* Steps content will be rendered by router */}
        </div>

        {/* Bottom Navigation */}
        <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
          {/* Left: Back Button */}
          <Button
            variant="outline"
            size="md"
            onClick={handleBack}
            disabled={currentStepIndex === 0 || isLoading}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {/* Middle: Skip Button (if allowed) */}
          {canSkip && (
            <Button
              variant="ghost"
              size="md"
              onClick={handleSkip}
              disabled={isLoading}
            >
              Skip Step
            </Button>
          )}

          {/* Right: Next/Complete Button */}
          <Button
            variant="primary"
            size="md"
            onClick={handleNext}
            disabled={isLoading}
            loading={isLoading}
            className="flex items-center gap-2"
          >
            {currentStepIndex === steps.length - 1 ? 'Complete' : 'Next'}
            {currentStepIndex < steps.length - 1 && (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>
            💡 You can update these settings anytime in your profile
          </p>
        </div>
      </div>

      {/* Mobile Bottom Navigation (Fixed) */}
      <div className="sticky bottom-0 border-t border-white/10 bg-slate-900 px-4 py-3 sm:hidden">
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={currentStepIndex === 0 || isLoading}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleNext}
            disabled={isLoading}
            loading={isLoading}
            className="flex-1"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;
