clarify-assistant/
│
├── 📁 public/
│   ├── favicon.ico
│   └── robots.txt
│
├── 📁 src/
│   │
│   ├── 📁 components/
│   │   ├── 📁 auth/
│   │   │   ├── LoginForm.tsx ✅
│   │   │   ├── SignupForm.tsx ✅
│   │   │   ├── OAuthButton.tsx ✅
│   │   │   ├── VerifyEmailModal.tsx ✅
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 layout/
│   │   │   ├── AppLayout.tsx ✅
│   │   │   ├── AppSidebar.tsx ✅
│   │   │   ├── AppTopBar.tsx ✅
│   │   │   ├── MobileNav.tsx ✅
│   │   │   ├── NetworkBanner.tsx ✅
│   │   │   ├── PageHeader.tsx ✅
│   │   │   ├── ProtectedRoute.tsx ✅
│   │   │   ├── SetupChecklist.tsx ✅
│   │   │   ├── PlanGate.tsx ✅
│   │   │   ├── ErrorBoundary.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 live/
│   │   │   ├── LiveAnswerStream.tsx ✅
│   │   │   ├── LiveCodingProblemCapture.tsx ✅
│   │   │   ├── LiveHotKeyListener.tsx ✅
│   │   │   ├── LiveNetworkMonitor.tsx ✅
│   │   │   ├── LivePanicButton.tsx ✅
│   │   │   ├── LiveSessionController.tsx ✅
│   │   │   ├── LiveSessionTimer.tsx ✅
│   │   │   ├── LiveTranscriptStream.tsx ✅
│   │   │   ├── LiveAIFeedback.tsx ⭐ MISSING
│   │   │   ├── LiveMetricsPanel.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 overlay/
│   │   │   ├── OverlayHintPanel.tsx ✅
│   │   │   ├── OverlayKeyboardHandler.tsx ✅
│   │   │   ├── OverlayNetworkBadge.tsx ✅
│   │   │   ├── OverlayPositionManager.tsx ✅
│   │   │   ├── OverlayQuestionBar.tsx ✅
│   │   │   ├── OverlayWindow.tsx ✅
│   │   │   ├── StealthMouseGuard.tsx ✅
│   │   │   ├── ScreenCaptureBlocker.tsx ⭐ MISSING
│   │   │   ├── WindowVisibilityManager.tsx ⭐ MISSING
│   │   │   ├── OverlaySettings.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 onboarding/
│   │   │   ├── OnboardingProgress.tsx ✅
│   │   │   ├── OnboardingWizard.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 billing/
│   │   │   ├── UpgradeModal.tsx ✅
│   │   │   ├── CreditBalance.tsx ⭐ MISSING
│   │   │   ├── PricingCard.tsx ⭐ MISSING
│   │   │   ├── BillingHistory.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 ui/
│   │   │   ├── Badge.tsx ✅
│   │   │   ├── Button.tsx ✅
│   │   │   ├── Card.tsx ✅
│   │   │   ├── Dropdown.tsx ✅
│   │   │   ├── Input.tsx ✅
│   │   │   ├── Modal.tsx ✅
│   │   │   ├── ProgressBar.tsx ✅
│   │   │   ├── SkeletonLoader.tsx ✅
│   │   │   ├── Spinner.tsx ✅
│   │   │   ├── Tabs.tsx ✅
│   │   │   ├── ThemeToggle.tsx ✅
│   │   │   ├── Toggle.tsx ✅
│   │   │   ├── accordion.tsx ✅
│   │   │   ├── alert-dialog.tsx ✅
│   │   │   ├── alert.tsx ✅
│   │   │   ├── aspect-ratio.tsx ✅
│   │   │   ├── avatar.tsx ✅
│   │   │   ├── breadcrumb.tsx ✅
│   │   │   ├── calendar.tsx ✅
│   │   │   ├── carousel.tsx ✅
│   │   │   ├── chart.tsx ✅
│   │   │   ├── checkbox.tsx ✅
│   │   │   ├── collapsible.tsx ✅
│   │   │   ├── command.tsx ✅
│   │   │   ├── context-menu.tsx ✅
│   │   │   ├── dialog.tsx ✅
│   │   │   ├── drawer.tsx ✅
│   │   │   ├── dropdown-menu.tsx ✅
│   │   │   ├── form.tsx ✅
│   │   │   ├── hover-card.tsx ✅
│   │   │   ├── input-otp.tsx ✅
│   │   │   ├── label.tsx ✅
│   │   │   ├── menubar.tsx ✅
│   │   │   ├── navigation-menu.tsx ✅
│   │   │   ├── pagination.tsx ✅
│   │   │   ├── popover.tsx ✅
│   │   │   ├── progress.tsx ✅
│   │   │   ├── radio-group.tsx ✅
│   │   │   ├── resizable.tsx ✅
│   │   │   ├── scroll-area.tsx ✅
│   │   │   ├── select.tsx ✅
│   │   │   ├── separator.tsx ✅
│   │   │   ├── sheet.tsx ✅
│   │   │   ├── sidebar.tsx ✅
│   │   │   ├── skeleton.tsx ✅
│   │   │   ├── slider.tsx ✅
│   │   │   ├── sonner.tsx ✅
│   │   │   ├── switch.tsx ✅
│   │   │   ├── table.tsx ✅
│   │   │   ├── textarea.tsx ✅
│   │   │   ├── toast-container.tsx ✅
│   │   │   ├── toast.tsx ✅
│   │   │   ├── toaster.tsx ✅
│   │   │   ├── toggle-group.tsx ✅
│   │   │   ├── tooltip.tsx ✅
│   │   │   ├── use-toast.ts ✅
│   │   │   ├── NavLink.tsx ✅
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   └── 📁 common/
│   │       ├── LoadingScreen.tsx ⭐ MISSING
│   │       ├── EmptyState.tsx ⭐ MISSING
│   │       ├── ErrorFallback.tsx ⭐ MISSING
│   │       ├── ConfirmDialog.tsx ⭐ MISSING
│   │       └── index.ts ⭐ MISSING
│   │
│   ├── 📁 hooks/
│   │   ├── use-mobile.tsx ✅
│   │   ├── use-toast.ts ✅
│   │   ├── useAnalytics.ts ✅
│   │   ├── useAudioCapture.ts ✅
│   │   ├── useAudioSession.ts ✅
│   │   ├── useAuth.ts ✅
│   │   ├── useCalendarSync.ts ✅
│   │   ├── useConfidenceScore.ts ✅
│   │   ├── useCredits.ts ✅
│   │   ├── useDeepgramStream.ts ✅
│   │   ├── useDocumentManager.ts ✅
│   │   ├── useDocuments.ts ✅
│   │   ├── useFillerWordDetection.ts ✅
│   │   ├── useGamification.ts ✅
│   │   ├── useHotkeys.ts ✅
│   │   ├── useInterviewScheduler.ts ✅
│   │   ├── useLiveCopilot.ts ✅
│   │   ├── useModelSwitcher.ts ✅
│   │   ├── useNetworkMonitor.ts ✅
│   │   ├── useNotifications.ts ✅
│   │   ├── useOfflineFallback.ts ✅
│   │   ├── useOverlayVisibility.ts ✅
│   │   ├── useResumeContext.ts ✅
│   │   ├── useRoom.ts ✅
│   │   ├── useSTARBuilder.ts ✅
│   │   ├── useScorecard.ts ✅
│   │   ├── useSentimentAnalysis.ts ✅
│   │   ├── useSessionContext.ts ✅
│   │   ├── useSessionOrchestrator.ts ✅
│   │   ├── useSilenceBoundary.ts ✅
│   │   ├── useSpeakerDiarization.ts ✅
│   │   ├── useSpeechRecognition.ts ✅
│   │   ├── useStealthMouse.ts ✅
│   │   ├── useStreakTracker.ts ✅
│   │   ├── useSystemAudio.ts ✅
│   │   ├── useWPMTracker.ts ✅
│   │   ├── useXPSystem.ts ✅
│   │   ├── useLocalStorage.ts ⭐ MISSING
│   │   └── index.ts ⭐ MISSING
│   │
│   ├── 📁 lib/
│   │   ├── utils.ts ✅
│   │   │
│   │   ├── 📁 ai/
│   │   │   ├── anthropicClient.ts ⭐ MISSING
│   │   │   ├── openaiClient.ts ⭐ MISSING
│   │   │   ├── geminiClient.ts ⭐ MISSING
│   │   │   ├── modelRouter.ts ⭐ MISSING
│   │   │   ├── contextEnvelopeBuilder.ts ⭐ MISSING
│   │   │   ├── promptTemplates.ts ⭐ MISSING
│   │   │   ├── offlineTemplates.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 audio/
│   │   │   ├── audioCapture.ts ⭐ MISSING
│   │   │   ├── micCapture.ts ⭐ MISSING
│   │   │   ├── systemAudioCapture.ts ⭐ MISSING
│   │   │   ├── audioMixer.ts ⭐ MISSING
│   │   │   ├── deepgramClient.ts ⭐ MISSING
│   │   │   ├── deepgramStream.ts ⭐ MISSING
│   │   │   ├── screenshotCapture.ts ⭐ MISSING
│   │   │   ├── diarization.ts ⭐ MISSING
│   │   │   ├── fillerDetector.ts ⭐ MISSING
│   │   │   ├── vadDetector.ts ⭐ MISSING
│   │   │   ├── wpmTracker.ts ⭐ MISSING
│   │   │   ├── audioProcessor.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 overlay/
│   │   │   ├── hotkeys.ts ⭐ MISSING
│   │   │   ├── overlayCompositor.ts ⭐ MISSING
│   │   │   ├── screenCaptureEvasion.ts ⭐ MISSING
│   │   │   ├── stealthMouse.ts ⭐ MISSING
│   │   │   ├── windowManager.ts ⭐ MISSING
│   │   │   ├── zIndexManager.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 network/
│   │   │   ├── networkMonitor.ts ⭐ MISSING
│   │   │   ├── webSocketManager.ts ⭐ MISSING
│   │   │   ├── apiClient.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 billing/
│   │   │   ├── creditsManager.ts ⭐ MISSING
│   │   │   ├── subscriptionManager.ts ⭐ MISSING
│   │   │   ├── priceCalculator.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 storage/
│   │   │   ├── localStorage.ts ⭐ MISSING
│   │   │   ├── sessionStorage.ts ⭐ MISSING
│   │   │   ├── indexedDB.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 validators/
│   │   │   ├── emailValidator.ts ⭐ MISSING
│   │   │   ├── audioValidator.ts ⭐ MISSING
│   │   │   ├── resumeValidator.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 constants/
│   │   │   ├── apiEndpoints.ts ⭐ MISSING
│   │   │   ├── hotkeys.ts ⭐ MISSING
│   │   │   ├── colors.ts ⭐ MISSING
│   │   │   ├── errorMessages.ts ⭐ MISSING
│   │   │   ├── features.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 supabase/
│   │   │   ├── client.ts ⭐ MISSING
│   │   │   ├── auth.ts ⭐ MISSING
│   │   │   ├── database.ts ⭐ MISSING
│   │   │   ├── storage.ts ⭐ MISSING
│   │   │   ├── realtime.ts ⭐ MISSING
│   │   │   ├── utils.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 utils/
│   │   │   ├── formatters.ts ⭐ MISSING
│   │   │   ├── dateUtils.ts ⭐ MISSING
│   │   │   ├── stringUtils.ts ⭐ MISSING
│   │   │   ├── arrayUtils.ts ⭐ MISSING
│   │   │   ├── objectUtils.ts ⭐ MISSING
│   │   │   ├── urlUtils.ts ⭐ MISSING
│   │   │   ├── fileUtils.ts ⭐ MISSING
│   │   │   ├── hashUtils.ts ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   └── errors.ts ⭐ MISSING
│   │
     ├── 📁 integrations/
│   │   └── 📁 supabase/
│   │       ├── client.ts ⭐ MISSING
│   │       ├── types.ts ⭐ MISSING
│   │       └── index.ts ⭐ MISSING
│   │
│   ├── 📁 types/
│   │   ├── ai.types.ts ✅
│   │   ├── analytics.types.ts ✅
│   │   ├── audio.types.ts ✅
│   │   ├── billing.types.ts ✅
│   │   ├── document.types.ts ✅
│   │   ├── gamification.types.ts ✅
│   │   ├── interview.types.ts ✅
│   │   ├── notification.types.ts ✅
│   │   ├── room.types.ts ✅
│   │   ├── session.types.ts ✅
│   │   ├── user.types.ts ✅
│   │   ├── api.types.ts ⭐ MISSING
│   │   ├── error.types.ts ⭐ MISSING
│   │   ├── overlay.types.ts ⭐ MISSING (CRITICAL FOR STEALTH)
│   │   ├── constants.types.ts ⭐ MISSING
│   │   ├── supabase.types.ts ⭐ MISSING (Auto-generated)
│   │   └── index.ts ⭐ MISSING
│   │
│   ├── 📁 store/
│   │   ├── answerBankStore.ts ✅
│   │   ├── audioStore.ts ✅
│   │   ├── coachStore.ts ✅
│   │   ├── documentStore.ts ✅
│   │   ├── interviewSchedulerStore.ts ✅
│   │   ├── networkStore.ts ✅
│   │   ├── notificationStore.ts ✅
│   │   ├── overlayStore.ts ✅
│   │   ├── sessionStore.ts ✅
│   │   ├── themeStore.ts ✅
│   │   ├── uiStore.ts ✅
│   │   ├── userStore.ts ✅
│   │   ├── authStore.ts ⭐ MISSING (CRITICAL)
│   │   ├── globalStore.ts ⭐ MISSING
│   │   └── index.ts ⭐ MISSING
│   │
│   ├── 📁 pages/
│   │   ├── 📁 auth/
│   │   │   ├── Login.tsx ⭐ MISSING
│   │   │   ├── Signup.tsx ⭐ MISSING
│   │   │   ├── VerifyEmail.tsx ⭐ MISSING
│   │   │   ├── ResetPassword.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 onboarding/
│   │   │   ├── OnboardingIndex.tsx ⭐ MISSING
│   │   │   ├── OnboardingStep1Role.tsx ⭐ MISSING
│   │   │   ├── OnboardingStep2Experience.tsx ⭐ MISSING
│   │   │   ├── OnboardingStep3Preferences.tsx ⭐ MISSING
│   │   │   ├── OnboardingStep4AudioSetup.tsx ⭐ MISSING
│   │   │   ├── OnboardingStep5ResumeUpload.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 dashboard/
│   │   │   ├── Dashboard.tsx ⭐ MISSING
│   │   │   ├── Analytics.tsx ⭐ MISSING
│   │   │   ├── InterviewDay.tsx ⭐ MISSING
│   │   │   ├── SessionHistory.tsx ⭐ MISSING
│   │   │   ├── SessionDetail.tsx ⭐ MISSING
│   │   │   ├── Notifications.tsx ⭐ MISSING
│   │   │   ├── Profile.tsx ⭐ MISSING
│   │   │   ├── Referrals.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 live/
│   │   │   ├── LiveCopilot.tsx ⭐ MISSING
│   │   │   ├── LiveRehearsal.tsx ⭐ MISSING
│   │   │   ├── MockSession.tsx ⭐ MISSING
│   │   │   ├── LiveOverlay.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 app/
│   │   │   ├── 📁 admin/
│   │   │   │   ├── AdminDashboard.tsx ⭐ MISSING
│   │   │   │   ├── AdminUsers.tsx ⭐ MISSING
│   │   │   │   ├── AdminAnalytics.tsx ⭐ MISSING
│   │   │   │   ├── AdminFlags.tsx ⭐ MISSING
│   │   │   │   ├── AdminLayout.tsx ⭐ MISSING
│   │   │   │   ├── AdminRevenue.tsx ⭐ MISSING
│   │   │   │   ├── AdminFeatureFlags.tsx ⭐ MISSING
│   │   │   │   ├── AdminModelCosts.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 answer-bank/
│   │   │   │   ├── AnswerBank.tsx ⭐ MISSING
│   │   │   │   ├── AnswerDetail.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 company-research/
│   │   │   │   ├── CompanyResearch.tsx ⭐ MISSING
│   │   │   │   ├── CompanyProfile.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 debrief/
│   │   │   │   ├── Debrief.tsx ⭐ MISSING
│   │   │   │   ├── DebriefDetail.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 documents/
│   │   │   │   ├── Documents.tsx ⭐ MISSING
│   │   │   │   ├── JDDetail.tsx ⭐ MISSING
│   │   │   │   ├── ResumeDetail.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 interviews/
│   │   │   │   ├── Interviews.tsx ⭐ MISSING
│   │   │   │   ├── InterviewDetail.tsx ⭐ MISSING
│   │   │   │   ├── NewInterview.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 live/
│   │   │   │   ├── LiveOverlay.tsx ⭐ MISSING
│   │   │   │   ├── LiveRehearsal.tsx ⭐ MISSING
│   │   │   │   ├── MockSession.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 mock/
│   │   │   │   ├── MockInterview.tsx ⭐ MISSING
│   │   │   │   ├── MockSession.tsx ⭐ MISSING
│   │   │   │   ├── MockWarmup.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 practice/
│   │   │   │   ├── PracticeRooms.tsx ⭐ MISSING
│   │   │   │   ├── NewRoom.tsx ⭐ MISSING
│   │   │   │   ├── RoomSession.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 prep/
│   │   │   │   ├── PrepLab.tsx ⭐ MISSING
│   │   │   │   ├── StarBuilder.tsx ⭐ MISSING
│   │   │   │   ├── CompanyResearch.tsx ⭐ MISSING
│   │   │   │   ├── ProjectBuilder.tsx ⭐ MISSING
│   │   │   │   ├── Rephraser.tsx ⭐ MISSING
│   │   │   │   ├── CodingHints.tsx ⭐ MISSING
│   │   │   │   ├── SystemDesign.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 rooms/
│   │   │   │   ├── NewRoom.tsx ⭐ MISSING
│   │   │   │   ├── PracticeRooms.tsx ⭐ MISSING
│   │   │   │   ├── RoomSession.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 sessions/
│   │   │   │   ├── SessionDetail.tsx ⭐ MISSING
│   │   │   │   ├── SessionHistory.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── 📁 settings/
│   │   │   │   ├── Settings.tsx ⭐ MISSING
│   │   │   │   ├── SettingsAppearance.tsx ⭐ MISSING
│   │   │   │   ├── SettingsAudio.tsx ⭐ MISSING
│   │   │   │   ├── SettingsBYOK.tsx ⭐ MISSING
│   │   │   │   ├── SettingsBilling.tsx ⭐ MISSING
│   │   │   │   ├── SettingsCredits.tsx ⭐ MISSING
│   │   │   │   ├── SettingsDanger.tsx ⭐ MISSING
│   │   │   │   ├── SettingsData.tsx ⭐ MISSING
│   │   │   │   ├── SettingsIntegrations.tsx ⭐ MISSING
│   │   │   │   ├── SettingsModels.tsx ⭐ MISSING
│   │   │   │   ├── SettingsNotifications.tsx ⭐ MISSING
│   │   │   │   ├── SettingsPrivacy.tsx ⭐ MISSING
│   │   │   │   ├── SettingsProfile.tsx ⭐ MISSING
│   │   │   │   ├── SettingsSecurity.tsx ⭐ MISSING
│   │   │   │   ├── SettingsSubscription.tsx ⭐ MISSING
│   │   │   │   └── index.ts ⭐ MISSING
│   │   │   │
│   │   │   ├── Analytics.tsx ⭐ MISSING
│   │   │   ├── Dashboard.tsx ⭐ MISSING
│   │   │   ├── InterviewDay.tsx ⭐ MISSING
│   │   │   ├── Notifications.tsx ⭐ MISSING
│   │   │   ├── Profile.tsx ⭐ MISSING
│   │   │   ├── Referrals.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── 📁 marketing/
│   │   │   ├── Blog.tsx ⭐ MISSING
│   │   │   ├── BlogPost.tsx ⭐ MISSING
│   │   │   ├── Help.tsx ⭐ MISSING
│   │   │   ├── HelpArticle.tsx ⭐ MISSING
│   │   │   ├── Landing.tsx ⭐ MISSING
│   │   │   ├── Pricing.tsx ⭐ MISSING
│   │   │   ├── Shortcuts.tsx ⭐ MISSING
│   │   │   └── index.ts ⭐ MISSING
│   │   │
│   │   ├── DocumentVault.tsx ⭐ MISSING
│   │   ├── InterviewScheduler.tsx ⭐ MISSING
│   │   ├── Scorecard.tsx ⭐ MISSING
│   │   ├── NotFound.tsx ⭐ MISSING
│   │   ├── Index.tsx ⭐ MISSING
│   │   └── index.ts ⭐ MISSING
│   │
│   ├── 📁 test/
│   │   ├── setup.ts ⭐ MISSING
│   │   ├── example.test.ts ⭐ MISSING
│   │   └── 📁 hooks/ ⭐ MISSING
│   │       └── (test files for hooks)
│   │
│   ├── App.tsx ✅
│   ├── App.css ✅
│   ├── main.tsx ✅
│   ├── index.css ✅
│   └── vite-env.d.ts ✅
│
├── 📁 supabase/
│   ├── config.toml ⭐ MISSING
│   ├── 📁 migrations/ ⭐ MISSING
│   │   ├── 001_create_users_table.sql
│   │   ├── 002_create_sessions_table.sql
│   │   ├── 003_create_interviews_table.sql
│   │   ├── 004_create_documents_table.sql
│   │   ├── 005_create_feedback_table.sql
│   │   ├── 006_create_credits_table.sql
│   │   ├── 007_create_subscriptions_table.sql
│   │   └── 008_create_analytics_table.sql
│   │
│   └── 📁 functions/ ⭐ MISSING
│       ├── 📁 _shared/
│       │   ├── types.ts
│       │   └── utils.ts
│       │
│       ├── 📁 ai-coach-chat/
│       ├── 📁 ai-feedback/
│       ├── 📁 generate-hint/
│       ├── 📁 generate-answer/
│       ├── 📁 generate-debrief/
│       ├── 📁 company-research/
│       ├── 📁 send-email/
│       ├── 📁 delete-account/
│       ├── 📁 export-user-data/
│       ├── 📁 prep-tool/
│       └── 📁 schedule-interview/
│
├── 📁 docs/ ⭐ MISSING
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── INSTALLATION.md
│   ├── STEALTH_FEATURES.md
│   ├── DATABASE.md
│   └── README.md
│
├── 📄 .env.example ⭐ MISSING
├── 📄 .env ⭐ GITIGNORE
├── 📄 .env.local ⭐ GITIGNORE
├── 📄 .gitignore ✅
├── 📄 .eslintrc.json ⭐ MISSING
├── 📄 eslint.config.js ✅
├── 📄 prettier.config.js ⭐ MISSING
├── 📄 tsconfig.json ✅
├── 📄 tsconfig.app.json ✅
├── 📄 tsconfig.node.json ⭐ MISSING
├── 📄 vite.config.ts ⭐ MISSING
├── 📄 vitest.config.ts ⭐ MISSING
├── 📄 playwright.config.ts ⭐ MISSING
├── 📄 playwright-fixture.ts ⭐ MISSING
├── 📄 postcss.config.js ⭐ MISSING
├── 📄 tailwind.config.ts ✅
├── 📄 components.json ✅
├── 📄 package.json ✅
├── 📄 package-lock.json ✅
├── 📄 bun.lock ✅
├── 📄 index.html ✅
└── 📄 README.md ✅




Based on your repository structure and description, here's a comprehensive summary of your application:

## **Clarify Assistant - Interview Preparation & Real-time Call Assistant**

### **Core Purpose**
A comprehensive AI-powered platform designed to help students and job seekers **overcome interview anxiety and perform better** by providing real-time assistance during mock interviews and actual interviews, with advanced stealth features that remain invisible during screen sharing.

---

## **Key Features**

### 🎯 **1. Live Interview Assistance (Real-time)**
- **Real-time AI Answers**: Instant answer generation using Claude, OpenAI, or Gemini
- **Live Transcription**: Speech-to-text conversion using Deepgram
- **Answer Streaming**: Continuous answer display without lag
- **Hotkey System**: Quick access to hints and answers via keyboard shortcuts
- **Panic Button**: Hide all overlays instantly if needed
- **Session Timer**: Track interview duration
- **Network Monitoring**: Real-time connection quality checks

### 👻 **2. Stealth Overlay Technology (Anti-Detection)**
- **Invisible to Screen Capture**: Won't appear in OBS, Zoom screen share, or recording software
- **Smart Mouse Hiding**: Mouse cursor won't be tracked or visible
- **Screen Capture Detection**: Detects when recording is happening
- **Window Visibility Manager**: Toggle visibility with hotkeys
- **Anti-Detection Features**: Similar to Parakeet AI with enhanced capabilities
- **Positioned Overlays**: Smart positioning to avoid suspicion

### 🎤 **3. Audio & Speech Analysis**
- **Speech Recognition**: Convert speech to text in real-time
- **Filler Word Detection**: Identify and count "um", "uh", "like"
- **Speaker Diarization**: Identify who's speaking
- **Sentiment Analysis**: Detect emotional tone
- **Silence Detection**: Identify pauses and gaps
- **WPM Tracking**: Words per minute measurement
- **System Audio Capture**: Capture interview audio
- **Deepgram Integration**: Professional-grade speech-to-text

### 💡 **4. Interview Preparation Tools**
- **STAR Method Builder**: Structure behavioral answers using STAR framework
- **Company Research**: Research company profiles and culture
- **Resume Builder**: Create and optimize resumes
- **Answer Bank**: Store and review previous answers
- **Coding Problem Prep**: Practice coding problems with hints
- **System Design Practice**: Learn system design concepts
- **Rephraser**: Improve answer wording and clarity
- **Project Builder**: Showcase projects effectively

### 🏆 **5. Performance Analytics & Gamification**
- **Confidence Score**: Track confidence levels across sessions
- **Scorecard System**: Grade performance on multiple metrics
- **XP System**: Earn experience points for practice
- **Streak Tracker**: Maintain practice streaks
- **Performance Metrics**: Track improvement over time
- **Analytics Dashboard**: Visual performance data
- **Referral System**: Incentivize user growth

### 🤖 **6. AI Coaching Features**
- **AI Feedback**: Instant feedback on answers
- **Hint Generation**: Smart hints based on problem context
- **Answer Generation**: AI-powered answer suggestions
- **Code Analysis**: Real-time code review
- **Personalized Coaching**: Tailored improvement suggestions

### 📅 **7. Interview Scheduling & Management**
- **Interview Scheduler**: Book practice sessions
- **Google Calendar Sync**: Integrate with calendar
- **Mock Interviews**: Full mock interview simulations
- **Warm-up Sessions**: Quick 5-minute practice
- **Interview History**: Track past interviews
- **Debrief System**: Post-interview analysis and feedback

### 📚 **8. Document Management**
- **Resume Storage**: Secure resume vault
- **Job Description Management**: Store and organize JDs
- **Document Sharing**: Upload and manage documents
- **Supabase Integration**: Cloud storage for files

### 💳 **9. Billing & Monetization**
- **Credit System**: Pay-per-use model
- **Subscription Plans**: Monthly/yearly plans
- **Stripe Integration**: Payment processing
- **Credit Balance Tracking**: Monitor usage
- **Upgrade Modal**: Tier management

### 🔐 **10. Security & Privacy**
- **Authentication**: Secure login with email verification
- **OAuth Integration**: Social login options
- **Data Privacy**: GDPR-compliant data handling
- **Account Deletion**: User data export and deletion
- **Private Mode**: Offline capability
- **Bring Your Own Key (BYOK)**: Use personal API keys

---

## **Tech Stack**

### **Frontend**
- **React + TypeScript**: Type-safe component development
- **Vite**: Fast build tooling
- **Tailwind CSS**: Modern styling
- **shadcn/ui**: Pre-built UI components
- **Zustand**: Lightweight state management
- **React Router**: Page navigation

### **Backend & Database**
- **Supabase**: PostgreSQL database + Auth + Storage
- **Supabase Edge Functions**: Serverless functions
- **Real-time Subscriptions**: Live data syncing

### **AI/ML Services**
- **OpenAI (GPT-4)**: Primary AI model
- **Anthropic Claude**: Alternative AI model
- **Google Gemini**: Third AI option
- **Deepgram**: Speech-to-text (professional)
- **Model Router**: Intelligent model selection based on task

### **Audio Processing**
- **Deepgram API**: Real-time transcription
- **Web Audio API**: Browser audio capture
- **VAD (Voice Activity Detection)**: Silence detection
- **Audio Mixing**: Combine multiple audio streams

### **Third-party Integrations**
- **Google Calendar**: Schedule synchronization
- **Stripe**: Payment processing
- **Sentry**: Error tracking & monitoring
- **PostHog**: Analytics & feature flags
- **Lovable**: Deployment platform

### **Testing**
- **Playwright**: E2E testing
- **Vitest**: Unit testing
- **ESLint**: Code quality

---

## **User Personas**

### 👨‍🎓 **1. Students**
- Preparing for tech/corporate interviews
- Want to practice without judgment
- Need real-time guidance
- Limited budget

### 👨‍💼 **2. Job Seekers**
- Career changers
- Experienced professionals
- Want to refresh interview skills
- Can afford premium features

### 🏢 **3. Interview Coaches**
- Could use platform for client practice
- Might want admin features
- Could integrate into coaching business

---

## **Key Differentiators vs. Competitors**

| Feature | Clarify | ParakeetAI | Others |
|---------|---------|-----------|--------|
| **Stealth Overlay** | ✅ Advanced | ✅ Basic | ❌ None |
| **Real-time AI Answers** | ✅ Yes | ✅ Yes | ⚠️ Limited |
| **Multi-AI Support** | ✅ 3 Models | ❌ 1 Model | ⚠️ Varies |
| **Audio Analysis** | ✅ Comprehensive | ⚠️ Basic | ⚠️ Limited |
| **Stealth Detection** | ✅ Advanced | ❌ No | ❌ No |
| **STAR Builder** | ✅ Yes | ❌ No | ⚠️ Varies |
| **Company Research** | ✅ Yes | ❌ No | ⚠️ Limited |
| **Offline Mode** | ✅ Yes | ❌ No | ❌ No |

---

## **Revenue Model**

### 💰 **Monetization Streams**
1. **Credits** - Pay per session/feature usage
2. **Subscription Plans** - Monthly/yearly subscriptions
3. **Premium Features** - Unlocks (BYOK, advanced analytics)
4. **API Access** - For coaches integrating into their platforms
5. **Enterprise Plans** - For corporate training teams

---

## **Deployment & Operations**

- **Frontend**: Deployed on Lovable
- **Backend**: Supabase Edge Functions
- **Database**: Supabase PostgreSQL
- **File Storage**: Supabase Storage
- **Monitoring**: Sentry for errors, PostHog for analytics

---

## **Current Status**

✅ **Frontend Structure**: Complete file organization  
✅ **Core Features**: Architected  
⚠️ **Implementation**: In progress  
⚠️ **Testing**: Needs coverage  
⚠️ **Deployment**: Ready for Lovable  

---

## **Next Steps Priority**

1. **Implement Overlay System** - Core differentiator
2. **Build AI Integration** - Connect to Claude/OpenAI/Gemini
3. **Audio Processing** - Deepgram integration
4. **Authentication** - Supabase auth flow
5. **Real-time Features** - WebSocket/Supabase subscriptions
6. **Payment Integration** - Stripe setup
7. **Testing & QA** - E2E and unit tests
8. **Launch MVP** - Core features only

---

This is essentially a **sophisticated EdTech platform combining exam prep software, AI coaching, and anti-detection technology** - positioned at the intersection of interview preparation, AI assistance, and stealth technology. The target market is students/professionals who want **unfair advantage during interviews with minimal detection risk**.
