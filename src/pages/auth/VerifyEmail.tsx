import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";

export default function VerifyEmail() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-5">
        <div className="w-16 h-16 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center mx-auto">
          <MailCheck className="w-8 h-8 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Verify your email</h1>
          <p className="text-gray-400 text-sm mt-2 leading-relaxed">
            We've sent a confirmation link to your email address.
            Click the link in the email to activate your account.
          </p>
        </div>
        <p className="text-xs text-gray-600">
          Didn't receive it? Check your spam folder or{" "}
          <Link to="/signup" className="text-violet-400 hover:text-violet-300 transition-colors">
            try signing up again
          </Link>
          .
        </p>
        <Link
          to="/login"
          className="inline-block text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
