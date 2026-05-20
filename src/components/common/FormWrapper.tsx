// src/components/common/FormWrapper.tsx
//
// Reusable validated form wrapper.
//
// SECURITY PURPOSE:
// - Centralize form validation
// - Sanitize FormData before validation
// - Add CSRF hidden token automatically
// - Prevent duplicate submissions
// - Provide field-level validation errors to child render functions
//
// Usage:
// <FormWrapper
//   schema={loginSchema}
//   onSubmit={async (data) => { ... }}
// >
//   {({ fieldErrors, isSubmitting }) => (
//     <>
//       <input name="email" />
//       {fieldErrors.email?.[0] && <p>{fieldErrors.email[0]}</p>}
//       <button disabled={isSubmitting}>Submit</button>
//     </>
//   )}
// </FormWrapper>

import React, { useCallback, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { z } from "zod";

import { getCSRFHiddenInputProps, validateCSRFToken } from "@/lib/security";

import {
  sanitizeFormData,
  safeValidate,
  type ValidationFieldErrors,
} from "@/lib/validators";

export type FormWrapperRenderProps<T> = {
  fieldErrors: ValidationFieldErrors;
  formError: string | null;
  isSubmitting: boolean;
  submitCount: number;
  clearErrors: () => void;
  setFieldError: (fieldName: string, message: string) => void;
  values: Partial<T> | null;
};

export type FormWrapperProps<T> = {
  schema: z.ZodType<T>;
  onSubmit: (data: T, rawFormData: FormData) => Promise<void> | void;
  children: ReactNode | ((props: FormWrapperRenderProps<T>) => ReactNode);
  className?: string;
  id?: string;
  noValidate?: boolean;
  disabled?: boolean;
  validateCsrf?: boolean;
  resetOnSuccess?: boolean;
  onValidationError?: (errors: ValidationFieldErrors) => void;
  onSubmitError?: (error: unknown) => void;
  onSubmitSuccess?: (data: T) => void;
};

function getFirstError(errors: ValidationFieldErrors): string | null {
  for (const messages of Object.values(errors)) {
    const first = messages[0];

    if (first) {
      return first;
    }
  }

  return null;
}

function isFunctionChildren<T>(
  children: FormWrapperProps<T>["children"]
): children is (props: FormWrapperRenderProps<T>) => ReactNode {
  return typeof children === "function";
}

export function FormWrapper<T>({
  schema,
  onSubmit,
  children,
  className,
  id,
  noValidate = true,
  disabled = false,
  validateCsrf = true,
  resetOnSuccess = false,
  onValidationError,
  onSubmitError,
  onSubmitSuccess,
}: FormWrapperProps<T>): JSX.Element {
  const [fieldErrors, setFieldErrors] = useState<ValidationFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [values, setValues] = useState<Partial<T> | null>(null);

  const csrfInputProps = useMemo(() => getCSRFHiddenInputProps(), []);

  const clearErrors = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
  }, []);

  const setFieldError = useCallback((fieldName: string, message: string) => {
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [fieldName]: [message],
    }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (disabled || isSubmitting) {
        return;
      }

      const form = event.currentTarget;
      const formData = new FormData(form);

      setSubmitCount((count) => count + 1);
      setIsSubmitting(true);
      clearErrors();

      try {
        if (validateCsrf) {
          const submittedCsrfToken = formData.get("csrfToken");

          if (
            typeof submittedCsrfToken !== "string" ||
            !validateCSRFToken(submittedCsrfToken)
          ) {
            const csrfErrors: ValidationFieldErrors = {
              _form: ["Security token expired. Please refresh and try again."],
            };

            setFieldErrors(csrfErrors);
            setFormError(csrfErrors._form?.[0] ?? "Security validation failed.");
            onValidationError?.(csrfErrors);
            return;
          }
        }

        const sanitizedPayload = sanitizeFormData(formData);
        const result = safeValidate(schema, sanitizedPayload);

        if (!result.success) {
          setFieldErrors(result.errors);
          setFormError(result.message ?? getFirstError(result.errors));
          onValidationError?.(result.errors);
          return;
        }

        setValues(result.data as Partial<T>);

        await onSubmit(result.data, formData);

        onSubmitSuccess?.(result.data);

        if (resetOnSuccess) {
          form.reset();
          setValues(null);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong.";

        setFormError(message);
        setFieldErrors({
          _form: [message],
        });
        onSubmitError?.(error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      clearErrors,
      disabled,
      isSubmitting,
      onSubmit,
      onSubmitError,
      onSubmitSuccess,
      onValidationError,
      resetOnSuccess,
      schema,
      validateCsrf,
    ]
  );

  const renderProps: FormWrapperRenderProps<T> = {
    fieldErrors,
    formError,
    isSubmitting,
    submitCount,
    clearErrors,
    setFieldError,
    values,
  };

  return (
    <form
      id={id}
      className={className}
      noValidate={noValidate}
      onSubmit={handleSubmit}
    >
      {validateCsrf && <input {...csrfInputProps} />}

      {isFunctionChildren(children) ? children(renderProps) : children}
    </form>
  );
}

export default FormWrapper;
