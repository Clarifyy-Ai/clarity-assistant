export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string | null
          condition_type: string | null
          condition_value: number | null
          created_at: string
          credit_reward: number
          description: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          xp_reward: number
        }
        Insert: {
          category?: string | null
          condition_type?: string | null
          condition_value?: number | null
          created_at?: string
          credit_reward?: number
          description: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          xp_reward?: number
        }
        Update: {
          category?: string | null
          condition_type?: string | null
          condition_value?: number | null
          created_at?: string
          credit_reward?: number
          description?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          xp_reward?: number
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          answer: string
          company_context: string | null
          created_at: string
          id: string
          is_favorite: boolean
          is_polished: boolean
          quality_score: number | null
          question: string
          role_context: string | null
          session_id: string | null
          star_action: string | null
          star_result: string | null
          star_situation: string | null
          star_task: string | null
          summary: string | null
          tags: string[] | null
          times_used: number | null
          type: Database["public"]["Enums"]["answer_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          answer: string
          company_context?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          is_polished?: boolean
          quality_score?: number | null
          question: string
          role_context?: string | null
          session_id?: string | null
          star_action?: string | null
          star_result?: string | null
          star_situation?: string | null
          star_task?: string | null
          summary?: string | null
          tags?: string[] | null
          times_used?: number | null
          type?: Database["public"]["Enums"]["answer_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string
          company_context?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          is_polished?: boolean
          quality_score?: number | null
          question?: string
          role_context?: string | null
          session_id?: string | null
          star_action?: string | null
          star_result?: string | null
          star_situation?: string | null
          star_task?: string | null
          summary?: string | null
          tags?: string[] | null
          times_used?: number | null
          type?: Database["public"]["Enums"]["answer_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_context: {
        Row: {
          avg_confidence_score: number
          filler_words_to_watch: string[] | null
          id: string
          last_session_at: string | null
          strong_areas: string[] | null
          total_sessions: number
          updated_at: string
          user_id: string
          weak_areas: string[] | null
        }
        Insert: {
          avg_confidence_score?: number
          filler_words_to_watch?: string[] | null
          id?: string
          last_session_at?: string | null
          strong_areas?: string[] | null
          total_sessions?: number
          updated_at?: string
          user_id: string
          weak_areas?: string[] | null
        }
        Update: {
          avg_confidence_score?: number
          filler_words_to_watch?: string[] | null
          id?: string
          last_session_at?: string | null
          strong_areas?: string[] | null
          total_sessions?: number
          updated_at?: string
          user_id?: string
          weak_areas?: string[] | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          common_questions: string[] | null
          created_at: string
          culture_notes: string | null
          hq_location: string | null
          id: string
          industry: string | null
          interview_tips: string | null
          is_favorite: boolean
          linkedin_url: string | null
          logo_url: string | null
          name: string
          recent_news: Json | null
          research_at: string | null
          size: string | null
          tech_stack: string[] | null
          updated_at: string
          user_id: string
          values: string[] | null
          website: string | null
        }
        Insert: {
          common_questions?: string[] | null
          created_at?: string
          culture_notes?: string | null
          hq_location?: string | null
          id?: string
          industry?: string | null
          interview_tips?: string | null
          is_favorite?: boolean
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          recent_news?: Json | null
          research_at?: string | null
          size?: string | null
          tech_stack?: string[] | null
          updated_at?: string
          user_id: string
          values?: string[] | null
          website?: string | null
        }
        Update: {
          common_questions?: string[] | null
          created_at?: string
          culture_notes?: string | null
          hq_location?: string | null
          id?: string
          industry?: string | null
          interview_tips?: string | null
          is_favorite?: boolean
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          recent_news?: Json | null
          research_at?: string | null
          size?: string | null
          tech_stack?: string[] | null
          updated_at?: string
          user_id?: string
          values?: string[] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          action: Database["public"]["Enums"]["credit_action"]
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          session_id: string | null
          stripe_payment_id: string | null
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["credit_action"]
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          session_id?: string | null
          stripe_payment_id?: string | null
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["credit_action"]
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          session_id?: string | null
          stripe_payment_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      debriefs: {
        Row: {
          clarity_score: number | null
          communication_score: number | null
          confidence_score: number | null
          created_at: string
          filler_analysis: Json | null
          generated_at: string | null
          id: string
          improvements: string[] | null
          key_moments: Json | null
          overall_score: number | null
          pace_analysis: Json | null
          prev_session_id: string | null
          recommendations: Json | null
          score_delta: number | null
          session_id: string
          status: Database["public"]["Enums"]["debrief_status"]
          strengths: string[] | null
          structure_score: number | null
          summary: string | null
          technical_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clarity_score?: number | null
          communication_score?: number | null
          confidence_score?: number | null
          created_at?: string
          filler_analysis?: Json | null
          generated_at?: string | null
          id?: string
          improvements?: string[] | null
          key_moments?: Json | null
          overall_score?: number | null
          pace_analysis?: Json | null
          prev_session_id?: string | null
          recommendations?: Json | null
          score_delta?: number | null
          session_id: string
          status?: Database["public"]["Enums"]["debrief_status"]
          strengths?: string[] | null
          structure_score?: number | null
          summary?: string | null
          technical_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clarity_score?: number | null
          communication_score?: number | null
          confidence_score?: number | null
          created_at?: string
          filler_analysis?: Json | null
          generated_at?: string | null
          id?: string
          improvements?: string[] | null
          key_moments?: Json | null
          overall_score?: number | null
          pace_analysis?: Json | null
          prev_session_id?: string | null
          recommendations?: Json | null
          score_delta?: number | null
          session_id?: string
          status?: Database["public"]["Enums"]["debrief_status"]
          strengths?: string[] | null
          structure_score?: number | null
          summary?: string | null
          technical_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debriefs_prev_session_id_fkey"
            columns: ["prev_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debriefs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debriefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_name: string | null
          content: string | null
          created_at: string
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          is_remote: boolean | null
          job_location: string | null
          job_title: string | null
          keywords: string[] | null
          mime_type: string | null
          parsed_education: Json | null
          parsed_experience: Json | null
          parsed_skills: string[] | null
          parsed_summary: string | null
          requirements: string[] | null
          salary_range: string | null
          title: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_remote?: boolean | null
          job_location?: string | null
          job_title?: string | null
          keywords?: string[] | null
          mime_type?: string | null
          parsed_education?: Json | null
          parsed_experience?: Json | null
          parsed_skills?: string[] | null
          parsed_summary?: string | null
          requirements?: string[] | null
          salary_range?: string | null
          title: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_remote?: boolean | null
          job_location?: string | null
          job_title?: string | null
          keywords?: string[] | null
          mime_type?: string | null
          parsed_education?: Json | null
          parsed_experience?: Json | null
          parsed_skills?: string[] | null
          parsed_summary?: string | null
          requirements?: string[] | null
          salary_range?: string | null
          title?: string
          type?: Database["public"]["Enums"]["document_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          allowed_plans: Database["public"]["Enums"]["plan_tier"][] | null
          allowed_users: string[] | null
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          key: string
          metadata: Json | null
          name: string
          rollout_percent: number
          updated_at: string
        }
        Insert: {
          allowed_plans?: Database["public"]["Enums"]["plan_tier"][] | null
          allowed_users?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key: string
          metadata?: Json | null
          name: string
          rollout_percent?: number
          updated_at?: string
        }
        Update: {
          allowed_plans?: Database["public"]["Enums"]["plan_tier"][] | null
          allowed_users?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key?: string
          metadata?: Json | null
          name?: string
          rollout_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      interviews: {
        Row: {
          calendar_event_id: string | null
          company_id: string | null
          created_at: string
          document_id: string | null
          duration_min: number | null
          feedback: string | null
          id: string
          interview_type: string | null
          interviewer: string | null
          location: string | null
          meeting_url: string | null
          notes: string | null
          outcome: string | null
          rating: number | null
          round: number | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["interview_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          company_id?: string | null
          created_at?: string
          document_id?: string | null
          duration_min?: number | null
          feedback?: string | null
          id?: string
          interview_type?: string | null
          interviewer?: string | null
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          outcome?: string | null
          rating?: number | null
          round?: number | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["interview_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          company_id?: string | null
          created_at?: string
          document_id?: string | null
          duration_min?: number | null
          feedback?: string | null
          id?: string
          interview_type?: string | null
          interviewer?: string | null
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          outcome?: string | null
          rating?: number | null
          round?: number | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["interview_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      model_cost_logs: {
        Row: {
          cost_usd: number
          created_at: string
          credits_charged: number
          feature: string | null
          id: string
          model: Database["public"]["Enums"]["ai_model"]
          session_id: string | null
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          credits_charged?: number
          feature?: string | null
          id?: string
          model: Database["public"]["Enums"]["ai_model"]
          session_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          credits_charged?: number
          feature?: string | null
          id?: string
          model?: Database["public"]["Enums"]["ai_model"]
          session_id?: string | null
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_cost_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_cost_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      model_pricing: {
        Row: {
          cost_per_1k_in: number
          cost_per_1k_out: number
          credits_per_call: number
          id: string
          is_active: boolean
          model: Database["public"]["Enums"]["ai_model"]
          updated_at: string
        }
        Insert: {
          cost_per_1k_in?: number
          cost_per_1k_out?: number
          credits_per_call?: number
          id?: string
          is_active?: boolean
          model: Database["public"]["Enums"]["ai_model"]
          updated_at?: string
        }
        Update: {
          cost_per_1k_in?: number
          cost_per_1k_out?: number
          credits_per_call?: number
          id?: string
          is_active?: boolean
          model?: Database["public"]["Enums"]["ai_model"]
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          body: string | null
          created_at: string
          expires_at: string | null
          icon: string | null
          id: string
          is_read: boolean
          metadata: Json | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          body?: string | null
          created_at?: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          body?: string | null
          created_at?: string
          expires_at?: string | null
          icon?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          audio_input_device: string | null
          audio_output_device: string | null
          auto_transcript: boolean
          avatar_url: string | null
          ban_reason: string | null
          bio: string | null
          byok_anthropic_hint: string | null
          byok_gemini_hint: string | null
          byok_openai_hint: string | null
          created_at: string
          credits: number
          credits_reset_at: string | null
          credits_used_this_month: number
          current_company: string | null
          current_title: string | null
          data_collection: boolean
          deepgram_model: string
          deleted_at: string | null
          domain: string | null
          email: string | null
          email_notifications: boolean
          experience_years: number | null
          full_name: string | null
          github_url: string | null
          headline: string | null
          id: string
          interview_date: string | null
          interview_strengths: string[] | null
          interview_weaknesses: string[] | null
          is_actively_looking: boolean | null
          is_admin: boolean
          is_banned: boolean
          last_active_date: string | null
          last_login_at: string | null
          level: number
          linkedin_url: string | null
          locale: string | null
          longest_streak: number
          marketing_emails: boolean
          noise_suppression: boolean
          notice_period: string | null
          onboarding_completed: boolean
          onboarding_step: number
          overlay_font_size: number
          overlay_hotkey: string
          overlay_opacity: number
          overlay_position: string
          phone: string | null
          plan_id: Database["public"]["Enums"]["plan_tier"]
          preferred_language: string
          preferred_model: Database["public"]["Enums"]["ai_model"]
          preferred_salary: string | null
          profile_visibility: string
          referral_code: string | null
          referred_by: string | null
          response_style: string
          role_type: string | null
          session_reminders: boolean
          stealth_mode: boolean
          streak_days: number
          stripe_customer_id: string | null
          subscription_id: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          target_companies: string[] | null
          target_role: string | null
          timezone: string | null
          total_practice_minutes: number
          total_sessions: number
          updated_at: string
          website_url: string | null
          xp: number
          years_of_exp: number | null
        }
        Insert: {
          audio_input_device?: string | null
          audio_output_device?: string | null
          auto_transcript?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          byok_anthropic_hint?: string | null
          byok_gemini_hint?: string | null
          byok_openai_hint?: string | null
          created_at?: string
          credits?: number
          credits_reset_at?: string | null
          credits_used_this_month?: number
          current_company?: string | null
          current_title?: string | null
          data_collection?: boolean
          deepgram_model?: string
          deleted_at?: string | null
          domain?: string | null
          email?: string | null
          email_notifications?: boolean
          experience_years?: number | null
          full_name?: string | null
          github_url?: string | null
          headline?: string | null
          id: string
          interview_date?: string | null
          interview_strengths?: string[] | null
          interview_weaknesses?: string[] | null
          is_actively_looking?: boolean | null
          is_admin?: boolean
          is_banned?: boolean
          last_active_date?: string | null
          last_login_at?: string | null
          level?: number
          linkedin_url?: string | null
          locale?: string | null
          longest_streak?: number
          marketing_emails?: boolean
          noise_suppression?: boolean
          notice_period?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          overlay_font_size?: number
          overlay_hotkey?: string
          overlay_opacity?: number
          overlay_position?: string
          phone?: string | null
          plan_id?: Database["public"]["Enums"]["plan_tier"]
          preferred_language?: string
          preferred_model?: Database["public"]["Enums"]["ai_model"]
          preferred_salary?: string | null
          profile_visibility?: string
          referral_code?: string | null
          referred_by?: string | null
          response_style?: string
          role_type?: string | null
          session_reminders?: boolean
          stealth_mode?: boolean
          streak_days?: number
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          target_companies?: string[] | null
          target_role?: string | null
          timezone?: string | null
          total_practice_minutes?: number
          total_sessions?: number
          updated_at?: string
          website_url?: string | null
          xp?: number
          years_of_exp?: number | null
        }
        Update: {
          audio_input_device?: string | null
          audio_output_device?: string | null
          auto_transcript?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          byok_anthropic_hint?: string | null
          byok_gemini_hint?: string | null
          byok_openai_hint?: string | null
          created_at?: string
          credits?: number
          credits_reset_at?: string | null
          credits_used_this_month?: number
          current_company?: string | null
          current_title?: string | null
          data_collection?: boolean
          deepgram_model?: string
          deleted_at?: string | null
          domain?: string | null
          email?: string | null
          email_notifications?: boolean
          experience_years?: number | null
          full_name?: string | null
          github_url?: string | null
          headline?: string | null
          id?: string
          interview_date?: string | null
          interview_strengths?: string[] | null
          interview_weaknesses?: string[] | null
          is_actively_looking?: boolean | null
          is_admin?: boolean
          is_banned?: boolean
          last_active_date?: string | null
          last_login_at?: string | null
          level?: number
          linkedin_url?: string | null
          locale?: string | null
          longest_streak?: number
          marketing_emails?: boolean
          noise_suppression?: boolean
          notice_period?: string | null
          onboarding_completed?: boolean
          onboarding_step?: number
          overlay_font_size?: number
          overlay_hotkey?: string
          overlay_opacity?: number
          overlay_position?: string
          phone?: string | null
          plan_id?: Database["public"]["Enums"]["plan_tier"]
          preferred_language?: string
          preferred_model?: Database["public"]["Enums"]["ai_model"]
          preferred_salary?: string | null
          profile_visibility?: string
          referral_code?: string | null
          referred_by?: string | null
          response_style?: string
          role_type?: string | null
          session_reminders?: boolean
          stealth_mode?: boolean
          streak_days?: number
          stripe_customer_id?: string | null
          subscription_id?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          target_companies?: string[] | null
          target_role?: string | null
          timezone?: string | null
          total_practice_minutes?: number
          total_sessions?: number
          updated_at?: string
          website_url?: string | null
          xp?: number
          years_of_exp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          converted_at: string | null
          created_at: string
          credits_awarded: number | null
          id: string
          referred_email: string
          referred_id: string | null
          referrer_id: string
          rewarded_at: string | null
          signed_up_at: string | null
          status: Database["public"]["Enums"]["referral_status"]
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          credits_awarded?: number | null
          id?: string
          referred_email: string
          referred_id?: string | null
          referrer_id: string
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          credits_awarded?: number | null
          id?: string
          referred_email?: string
          referred_id?: string | null
          referrer_id?: string
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_participants: {
        Row: {
          id: string
          joined_at: string
          left_at: string | null
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          interview_type: string | null
          is_private: boolean
          max_participants: number
          name: string
          password_hash: string | null
          room_code: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["room_status"]
          topic: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          interview_type?: string | null
          is_private?: boolean
          max_participants?: number
          name: string
          password_hash?: string | null
          room_code?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["room_status"]
          topic?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          interview_type?: string | null
          is_private?: boolean
          max_participants?: number
          name?: string
          password_hash?: string | null
          room_code?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["room_status"]
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_ai_interactions: {
        Row: {
          created_at: string
          credits_cost: number | null
          id: string
          latency_ms: number | null
          model: Database["public"]["Enums"]["ai_model"] | null
          prompt: string | null
          response: string | null
          session_id: string
          tokens_in: number | null
          tokens_out: number | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_cost?: number | null
          id?: string
          latency_ms?: number | null
          model?: Database["public"]["Enums"]["ai_model"] | null
          prompt?: string | null
          response?: string | null
          session_id: string
          tokens_in?: number | null
          tokens_out?: number | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_cost?: number | null
          id?: string
          latency_ms?: number | null
          model?: Database["public"]["Enums"]["ai_model"] | null
          prompt?: string | null
          response?: string | null
          session_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_ai_interactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_ai_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_transcripts: {
        Row: {
          confidence: number | null
          content: string
          created_at: string
          filler_count: number | null
          filler_words: string[] | null
          id: string
          is_final: boolean
          language: string | null
          offset_ms: number | null
          sentiment: string | null
          sentiment_score: number | null
          session_id: string
          speaker: string
          user_id: string
          wpm: number | null
        }
        Insert: {
          confidence?: number | null
          content: string
          created_at?: string
          filler_count?: number | null
          filler_words?: string[] | null
          id?: string
          is_final?: boolean
          language?: string | null
          offset_ms?: number | null
          sentiment?: string | null
          sentiment_score?: number | null
          session_id: string
          speaker?: string
          user_id: string
          wpm?: number | null
        }
        Update: {
          confidence?: number | null
          content?: string
          created_at?: string
          filler_count?: number | null
          filler_words?: string[] | null
          id?: string
          is_final?: boolean
          language?: string | null
          offset_ms?: number | null
          sentiment?: string | null
          sentiment_score?: number | null
          session_id?: string
          speaker?: string
          user_id?: string
          wpm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_transcripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_transcripts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          answers_generated: number | null
          avg_wpm: number | null
          clarity_score: number | null
          company_id: string | null
          confidence_score: number | null
          created_at: string
          credits_used: number | null
          document_id: string | null
          ended_at: string | null
          filler_words: number | null
          hints_used: number | null
          id: string
          interview_id: string | null
          jd_id: string | null
          model_used: Database["public"]["Enums"]["ai_model"] | null
          notes: string | null
          overall_score: number | null
          questions_asked: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          tags: string[] | null
          title: string | null
          type: Database["public"]["Enums"]["session_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          answers_generated?: number | null
          avg_wpm?: number | null
          clarity_score?: number | null
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          credits_used?: number | null
          document_id?: string | null
          ended_at?: string | null
          filler_words?: number | null
          hints_used?: number | null
          id?: string
          interview_id?: string | null
          jd_id?: string | null
          model_used?: Database["public"]["Enums"]["ai_model"] | null
          notes?: string | null
          overall_score?: number | null
          questions_asked?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          tags?: string[] | null
          title?: string | null
          type?: Database["public"]["Enums"]["session_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          answers_generated?: number | null
          avg_wpm?: number | null
          clarity_score?: number | null
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          credits_used?: number | null
          document_id?: string | null
          ended_at?: string | null
          filler_words?: number | null
          hints_used?: number | null
          id?: string
          interview_id?: string | null
          jd_id?: string | null
          model_used?: Database["public"]["Enums"]["ai_model"] | null
          notes?: string | null
          overall_score?: number | null
          questions_asked?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          tags?: string[] | null
          title?: string | null
          type?: Database["public"]["Enums"]["session_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          advanced_analytics: boolean
          byok_enabled: boolean
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          max_documents: number | null
          max_sessions_per_month: number | null
          monthly_credits: number
          plan_id: Database["public"]["Enums"]["plan_tier"]
          priority_support: boolean
          status: Database["public"]["Enums"]["subscription_status"]
          stealth_enabled: boolean
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          advanced_analytics?: boolean
          byok_enabled?: boolean
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          max_documents?: number | null
          max_sessions_per_month?: number | null
          monthly_credits?: number
          plan_id?: Database["public"]["Enums"]["plan_tier"]
          priority_support?: boolean
          status?: Database["public"]["Enums"]["subscription_status"]
          stealth_enabled?: boolean
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          advanced_analytics?: boolean
          byok_enabled?: boolean
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          max_documents?: number | null
          max_sessions_per_month?: number | null
          monthly_credits?: number
          plan_id?: Database["public"]["Enums"]["plan_tier"]
          priority_support?: boolean
          status?: Database["public"]["Enums"]["subscription_status"]
          stealth_enabled?: boolean
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          id: string
          question_text: string
          question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING"
          options: Json | null
          correct_answer: string
          explanation: string | null
          subject: string
          topic: string
          difficulty: "EASY" | "MEDIUM" | "HARD"
          marks_positive: number
          marks_negative: number
          source_year: number | null
          exam_type: string | null
          latex_present: boolean
          is_public: boolean
          is_verified: boolean
          source: string | null
          uploaded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          question_text: string
          question_type?: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING"
          options?: Json | null
          correct_answer: string
          explanation?: string | null
          subject: string
          topic: string
          difficulty?: "EASY" | "MEDIUM" | "HARD"
          marks_positive?: number
          marks_negative?: number
          source_year?: number | null
          exam_type?: string | null
          latex_present?: boolean
          is_public?: boolean
          is_verified?: boolean
          source?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          question_text?: string
          question_type?: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "NUMERICAL" | "CODING"
          options?: Json | null
          correct_answer?: string
          explanation?: string | null
          subject?: string
          topic?: string
          difficulty?: "EASY" | "MEDIUM" | "HARD"
          marks_positive?: number
          marks_negative?: number
          source_year?: number | null
          exam_type?: string | null
          latex_present?: boolean
          is_public?: boolean
          is_verified?: boolean
          source?: string | null
          uploaded_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_papers: {
        Row: {
          id: string
          title: string
          exam_type: string
          year: number | null
          subject: string | null
          description: string | null
          created_by: string | null
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          exam_type: string
          year?: number | null
          subject?: string | null
          description?: string | null
          created_by?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          exam_type?: string
          year?: number | null
          subject?: string | null
          description?: string | null
          created_by?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      mock_tests: {
        Row: {
          id: string
          user_id: string
          title: string
          exam_type: string
          status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
          time_limit_minutes: number | null
          started_at: string | null
          completed_at: string | null
          total_questions: number
          attempted: number
          correct: number
          score_pct: number | null
          config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          exam_type?: string
          status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
          time_limit_minutes?: number | null
          started_at?: string | null
          completed_at?: string | null
          total_questions?: number
          attempted?: number
          correct?: number
          score_pct?: number | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          exam_type?: string
          status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
          time_limit_minutes?: number | null
          started_at?: string | null
          completed_at?: string | null
          total_questions?: number
          attempted?: number
          correct?: number
          score_pct?: number | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_tests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_responses: {
        Row: {
          id: string
          test_id: string
          question_id: string
          user_answer: string | null
          is_correct: boolean | null
          time_taken_seconds: number | null
          marked_for_review: boolean
          sequence_no: number | null
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          question_id: string
          user_answer?: string | null
          is_correct?: boolean | null
          time_taken_seconds?: number | null
          marked_for_review?: boolean
          sequence_no?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          question_id?: string
          user_answer?: string | null
          is_correct?: boolean | null
          time_taken_seconds?: number | null
          marked_for_review?: boolean
          sequence_no?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_responses_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_analyses: {
        Row: {
          id: string
          test_id: string
          user_id: string
          summary: string | null
          weak_topics: Json | null
          strong_topics: Json | null
          recommendations: Json | null
          time_analysis: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          user_id: string
          summary?: string | null
          weak_topics?: Json | null
          strong_topics?: Json | null
          recommendations?: Json | null
          time_analysis?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          user_id?: string
          summary?: string | null
          weak_topics?: Json | null
          strong_topics?: Json | null
          recommendations?: Json | null
          time_analysis?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_analyses_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_list: {
        Row: {
          id: string
          user_id: string
          question_id: string
          added_at: string
          is_mastered: boolean
          next_review_at: string | null
          review_count: number
        }
        Insert: {
          id?: string
          user_id: string
          question_id: string
          added_at?: string
          is_mastered?: boolean
          next_review_at?: string | null
          review_count?: number
        }
        Update: {
          id?: string
          user_id?: string
          question_id?: string
          added_at?: string
          is_mastered?: boolean
          next_review_at?: string | null
          review_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "revision_list_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_topic_performance: {
        Row: {
          id: string
          user_id: string
          exam_type: string
          subject: string
          topic: string
          attempted: number
          correct: number
          accuracy_pct: number
          last_attempted_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          exam_type?: string
          subject: string
          topic: string
          attempted?: number
          correct?: number
          accuracy_pct?: number
          last_attempted_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          exam_type?: string
          subject?: string
          topic?: string
          attempted?: number
          correct?: number
          accuracy_pct?: number
          last_attempted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_credits: {
        Args: {
          p_action?: Database["public"]["Enums"]["credit_action"]
          p_amount: number
          p_description?: string
          p_payment_id?: string
          p_user_id: string
        }
        Returns: number
      }
      deduct_credits:
        | {
            Args: { p_action: string; p_cost: number; p_session_id?: string }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_description?: string
              p_session_id?: string
              p_user_id: string
            }
            Returns: number
          }
      is_admin: { Args: never; Returns: boolean }
      mark_notifications_read: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      ai_model:
        | "gpt-4o"
        | "gpt-4o-mini"
        | "claude-3-5-sonnet"
        | "claude-3-haiku"
        | "gemini-1-5-pro"
        | "gemini-1-5-flash"
      answer_type:
        | "behavioral"
        | "technical"
        | "system_design"
        | "coding"
        | "situational"
        | "other"
      credit_action:
        | "purchase"
        | "usage"
        | "refund"
        | "bonus"
        | "referral_reward"
        | "subscription_grant"
        | "expiry"
        | "admin_adjustment"
      debrief_status: "pending" | "processing" | "completed" | "failed"
      document_type: "resume" | "job_description" | "cover_letter" | "other"
      interview_status: "scheduled" | "completed" | "cancelled" | "rescheduled"
      notification_type:
        | "system"
        | "billing"
        | "session"
        | "achievement"
        | "referral"
        | "reminder"
      plan_tier: "free" | "starter" | "pro" | "enterprise"
      referral_status: "pending" | "signed_up" | "converted" | "rewarded"
      room_status: "waiting" | "active" | "ended"
      session_status:
        | "pending"
        | "active"
        | "paused"
        | "completed"
        | "abandoned"
      session_type: "live" | "mock" | "warmup" | "rehearsal" | "room"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "paused"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_model: [
        "gpt-4o",
        "gpt-4o-mini",
        "claude-3-5-sonnet",
        "claude-3-haiku",
        "gemini-1-5-pro",
        "gemini-1-5-flash",
      ],
      answer_type: [
        "behavioral",
        "technical",
        "system_design",
        "coding",
        "situational",
        "other",
      ],
      credit_action: [
        "purchase",
        "usage",
        "refund",
        "bonus",
        "referral_reward",
        "subscription_grant",
        "expiry",
        "admin_adjustment",
      ],
      debrief_status: ["pending", "processing", "completed", "failed"],
      document_type: ["resume", "job_description", "cover_letter", "other"],
      interview_status: ["scheduled", "completed", "cancelled", "rescheduled"],
      notification_type: [
        "system",
        "billing",
        "session",
        "achievement",
        "referral",
        "reminder",
      ],
      plan_tier: ["free", "starter", "pro", "enterprise"],
      referral_status: ["pending", "signed_up", "converted", "rewarded"],
      room_status: ["waiting", "active", "ended"],
      session_status: ["pending", "active", "paused", "completed", "abandoned"],
      session_type: ["live", "mock", "warmup", "rehearsal", "room"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "paused",
      ],
    },
  },
} as const
