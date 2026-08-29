// ─── Auth ─────────────────────────────────────────────────────────────────────
export {
  getSession,
  getCurrentUser,
  requireUserId,
  isAuthenticated,
  signUp,
  signIn,
  signInWithOAuth,
  sendMagicLink,
  sendPasswordReset,
  updatePassword,
  signOut,
  updateUserProfile,
  resendVerificationEmail,
  isEmailVerified,
  onAuthStateChange,
  getAccessToken,
  refreshSession,
} from "./auth";

export type {
  SignUpCredentials,
  SignInCredentials,
  OAuthProvider,
  AuthResult,
} from "./auth";

// ─── Database ─────────────────────────────────────────────────────────────────
export {
  profilesDB,
  sessionsDB,
  interviewsDB,
  documentsDB,
  feedbackDB,
  creditsDB,
  subscriptionsDB,
  analyticsDB,
} from "./database";

// ─── Storage ──────────────────────────────────────────────────────────────────
export {
  BUCKETS,
  storagePaths,
  uploadFile,
  uploadBlob,
  downloadFile,
  getSignedUrl,
  getPublicUrl,
  deleteFile,
  deleteFiles,
  listFiles,
  resumeStorage,
  avatarStorage,
  screenshotStorage,
} from "./storage";

export type {
  BucketName,
  UploadOptions,
  UploadResult,
} from "./storage";

// ─── Realtime ─────────────────────────────────────────────────────────────────
export {
  subscribeToTable,
  subscribeToBroadcast,
  subscribeToPresence,
  subscribeToSession,
  subscribeToNotifications,
  subscribeToNotificationFeed,
  subscribeToCredits,
  removeChannel,
  removeAllChannels,
  getActiveChannelNames,
  getActiveChannelCount,
} from "./realtime";

export type {
  RealtimeEvent,
  PostgresChange,
  ChannelConfig,
  PostgresChangeConfig,
  BroadcastConfig,
  PresenceConfig,
} from "./realtime";

// ─── Client ───────────────────────────────────────────────────────────────────
export { supabase } from "./client";
