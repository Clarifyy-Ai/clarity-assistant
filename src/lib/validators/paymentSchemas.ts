// src/lib/validators/paymentSchemas.ts
//
// Payment/billing validation APIs// Payment/billing validation schemas.
//
// Use these schemas in:
// - Billing page
// - Pricing page
// - Checkout actions
// - Subscription cancellation/resume flows
// - Credit pack purchase flows
// - Billing portal flows

import { z } from "zod";
import { sanitizeText } from "@/lib/security";

const MAX_TEXT_LENGTH = 500;
const MAX_COUPON_LENGTH = 100;
const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
const IDEMPOTENCY_KEY_MAX_LENGTH = 150;

export const billingPlanIdSchema = z.enum([
  "starter_monthly",
  "starter_yearly",
  "pro_monthly",
  "pro_yearly",
  "elite_monthly",
  "elite_yearly",
]);

export const subscriptionPlanSchema = z.enum(["starter", "pro", "elite"]);

export const billingIntervalSchema = z.enum(["monthly", "yearly"]);

export const creditPackIdSchema = z.enum([
  "credits_10",
  "credits_50",
  "credits_150",
  "credits_500",
]);

export const paymentProviderSchema = z.enum(["stripe"]);

export const subscriptionActionSchema = z.enum([
  "create",
  "cancel",
  "resume",
  "upgrade",
  "downgrade",
]);

export const checkoutModeSchema = z.enum(["subscription", "payment"]);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(
    IDEMPOTENCY_KEY_MIN_LENGTH,
    `Idempotency key must be at least ${IDEMPOTENCY_KEY_MIN_LENGTH} characters.`
  )
  .max(
    IDEMPOTENCY_KEY_MAX_LENGTH,
    `Idempotency key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`
  )
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency key contains invalid characters.")
  .transform((value) => sanitizeText(value));

export const couponCodeSchema = z
  .string()
  .trim()
  .max(MAX_COUPON_LENGTH, "Coupon code is too long.")
  .regex(/^[A-Za-z0-9_-]*$/, "Coupon code contains invalid characters.")
  .optional()
  .transform((value) => (value ? sanitizeText(value) : value));

export const checkoutRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  provider: paymentProviderSchema.default("stripe"),

  mode: checkoutModeSchema,

  planId: billingPlanIdSchema.optional(),

  creditPackId: creditPackIdSchema.optional(),

  couponCode: couponCodeSchema,

  successUrl: z.string().url("Invalid success URL."),

  cancelUrl: z.string().url("Invalid cancel URL."),

  idempotencyKey: idempotencyKeySchema,
})
.refine((data) => {
  if (data.mode === "subscription") {
    return Boolean(data.planId) && !data.creditPackId;
  }

  return true;
}, {
  message: "Subscription checkout requires planId and must not include creditPackId.",
  path: ["planId"],
})
.refine((data) => {
  if (data.mode === "payment") {
    return Boolean(data.creditPackId) && !data.planId;
  }

  return true;
}, {
  message: "Credit checkout requires creditPackId and must not include planId.",
  path: ["creditPackId"],
});

export const billingPortalRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  returnUrl: z.string().url("Invalid return URL."),

  idempotencyKey: idempotencyKeySchema,
});

export const cancelSubscriptionRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  subscriptionId: z
    .string()
    .trim()
    .min(1, "Subscription ID is required.")
    .max(MAX_TEXT_LENGTH, "Subscription ID is too long.")
    .transform((value) => sanitizeText(value)),

  reason: z
    .string()
    .trim()
    .max(2_000, "Cancellation reason is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  idempotencyKey: idempotencyKeySchema,
});

export const resumeSubscriptionRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  subscriptionId: z
    .string()
    .trim()
    .min(1, "Subscription ID is required.")
    .max(MAX_TEXT_LENGTH, "Subscription ID is too long.")
    .transform((value) => sanitizeText(value)),

  idempotencyKey: idempotencyKeySchema,
});

export const changeSubscriptionPlanRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  subscriptionId: z
    .string()
    .trim()
    .min(1, "Subscription ID is required.")
    .max(MAX_TEXT_LENGTH, "Subscription ID is too long.")
    .transform((value) => sanitizeText(value)),

  targetPlanId: billingPlanIdSchema,

  action: z.enum(["upgrade", "downgrade"]),

  idempotencyKey: idempotencyKeySchema,
});

export const creditPurchaseRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  creditPackId: creditPackIdSchema,

  provider: paymentProviderSchema.default("stripe"),

  successUrl: z.string().url("Invalid success URL."),

  cancelUrl: z.string().url("Invalid cancel URL."),

  idempotencyKey: idempotencyKeySchema,
});

export const deductCreditsRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  amount: z
    .number()
    .int("Credit amount must be a whole number.")
    .min(1, "Credit amount must be at least 1.")
    .max(10_000, "Credit amount is too large."),

  reason: z.enum([
    "generate_answer",
    "generate_questions",
    "generate_debrief",
    "generate_hint",
    "parse_resume",
    "mock_test",
    "live_session",
    "manual_adjustment",
  ]),

  referenceId: z
    .string()
    .uuid("Invalid reference ID.")
    .optional(),

  idempotencyKey: idempotencyKeySchema,
});

export const addCreditsRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  amount: z
    .number()
    .int("Credit amount must be a whole number.")
    .min(1, "Credit amount must be at least 1.")
    .max(1_000_000, "Credit amount is too large."),

  reason: z.enum([
    "purchase",
    "subscription_renewal",
    "admin_adjustment",
    "refund",
    "promotion",
  ]),

  referenceId: z
    .string()
    .trim()
    .max(MAX_TEXT_LENGTH, "Reference ID is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  idempotencyKey: idempotencyKeySchema,
});

export const stripeCustomerSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  email: z
    .string()
    .trim()
    .email("Invalid email address.")
    .max(254, "Email is too long.")
    .transform((value) => value.toLowerCase()),

  name: z
    .string()
    .trim()
    .max(MAX_TEXT_LENGTH, "Name is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),
});

export const stripeWebhookEventSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "Webhook event ID is required.")
    .max(MAX_TEXT_LENGTH, "Webhook event ID is too long.")
    .transform((value) => sanitizeText(value)),

  type: z
    .string()
    .trim()
    .min(1, "Webhook event type is required.")
    .max(MAX_TEXT_LENGTH, "Webhook event type is too long.")
    .transform((value) => sanitizeText(value)),

  created: z
    .number()
    .int("Webhook created timestamp must be a whole number.")
    .positive("Webhook created timestamp must be positive."),

  livemode: z.boolean(),
});

export const paymentStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

export const subscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "cancelled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

export const billingRecordSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  provider: paymentProviderSchema.default("stripe"),

  customerId: z
    .string()
    .trim()
    .min(1, "Customer ID is required.")
    .max(MAX_TEXT_LENGTH, "Customer ID is too long.")
    .transform((value) => sanitizeText(value)),

  subscriptionId: z
    .string()
    .trim()
    .max(MAX_TEXT_LENGTH, "Subscription ID is too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  planId: billingPlanIdSchema.optional(),

  subscriptionStatus: subscriptionStatusSchema.optional(),

  paymentStatus: paymentStatusSchema.optional(),

  currentPeriodEnd: z.string().datetime("Invalid current period end date.").optional(),

  cancelAtPeriodEnd: z.boolean().optional(),
});

export const refundRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),

  paymentIntentId: z
    .string()
    .trim()
    .min(1, "Payment intent ID is required.")
    .max(MAX_TEXT_LENGTH, "Payment intent ID is too long.")
    .transform((value) => sanitizeText(value)),

  reason: z.enum([
    "duplicate",
    "fraudulent",
    "requested_by_customer",
    "service_issue",
    "other",
  ]),

  notes: z
    .string()
    .trim()
    .max(2_000, "Refund notes are too long.")
    .optional()
    .transform((value) => (value ? sanitizeText(value) : value)),

  idempotencyKey: idempotencyKeySchema,
});

export const paymentValidationLimits = {
  MAX_TEXT_LENGTH,
  MAX_COUPON_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH,
} as const;

export type BillingPlanId = z.infer<typeof billingPlanIdSchema>;
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;
export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export type CreditPackId = z.infer<typeof creditPackIdSchema>;
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;
export type SubscriptionAction = z.infer<typeof subscriptionActionSchema>;
export type CheckoutMode = z.infer<typeof checkoutModeSchema>;

export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;
export type BillingPortalRequestInput = z.infer<typeof billingPortalRequestSchema>;
export type CancelSubscriptionRequestInput = z.infer<typeof cancelSubscriptionRequestSchema>;
export type ResumeSubscriptionRequestInput = z.infer<typeof resumeSubscriptionRequestSchema>;
export type ChangeSubscriptionPlanRequestInput = z.infer<typeof changeSubscriptionPlanRequestSchema>;
export type CreditPurchaseRequestInput = z.infer<typeof creditPurchaseRequestSchema>;
export type DeductCreditsRequestInput = z.infer<typeof deductCreditsRequestSchema>;
export type AddCreditsRequestInput = z.infer<typeof addCreditsRequestSchema>;
export type StripeCustomerInput = z.infer<typeof stripeCustomerSchema>;
export type StripeWebhookEventInput = z.infer<typeof stripeWebhookEventSchema>;
export type BillingRecordInput = z.infer<typeof billingRecordSchema>;
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

//
// SECURITY PURPOSE:
// - Validate Stripe checkout requests before calling backend/Edge Functions
// - Validate subscription actions
// - Validate credit pack purchases
// - Validate billing portal requests
// - Enforce idempotency keys for payment/credit operations
