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
      account_deletion_operations: {
        Row: {
          completed_at: string | null
          correlation_id: string | null
          created_at: string
          current_step: string | null
          error_code: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          current_step?: string | null
          error_code?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correlation_id?: string | null
          created_at?: string
          current_step?: string | null
          error_code?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      ai_acceleration_settings: {
        Row: {
          concurrent_request_ceiling: number
          id: string
          max_output_tokens_ceiling: number
          priority_tier: string
          scope: string
          scope_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          concurrent_request_ceiling?: number
          id?: string
          max_output_tokens_ceiling?: number
          priority_tier?: string
          scope?: string
          scope_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          concurrent_request_ceiling?: number
          id?: string
          max_output_tokens_ceiling?: number
          priority_tier?: string
          scope?: string
          scope_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_acceleration_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_free_tier_usage: {
        Row: {
          last_reset_at: string
          model_class: string
          tokens_limit: number
          tokens_used: number
          usage_date: string
          user_id: string
        }
        Insert: {
          last_reset_at?: string
          model_class?: string
          tokens_limit?: number
          tokens_used?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          last_reset_at?: string
          model_class?: string
          tokens_limit?: number
          tokens_used?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_free_tier_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_hub_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_hub_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_routing_policy: {
        Row: {
          enabled: boolean
          fallback_chain: string[]
          id: string
          max_output_tokens_default: number
          preferred_model: string
          preferred_provider: string
          task_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          fallback_chain?: string[]
          id?: string
          max_output_tokens_default?: number
          preferred_model: string
          preferred_provider: string
          task_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          fallback_chain?: string[]
          id?: string
          max_output_tokens_default?: number
          preferred_model?: string
          preferred_provider?: string
          task_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_routing_policy_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_test_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          model: string
          provider: string
          response_payload: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          model: string
          provider: string
          response_payload: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          model?: string
          provider?: string
          response_payload?: Json
        }
        Relationships: []
      }
      ai_test_results: {
        Row: {
          actual_cost_micro_usd: number
          cached: boolean
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_micro_usd: number
          finish_reason: string | null
          free_tier_used: boolean
          id: string
          input_tokens: number
          latency_ms: number
          model: string
          output_tokens: number
          provider: string
          response_text: string | null
          routing_reason: string | null
          success: boolean
          test_id: string
          total_tokens: number
        }
        Insert: {
          actual_cost_micro_usd?: number
          cached?: boolean
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_micro_usd?: number
          finish_reason?: string | null
          free_tier_used?: boolean
          id?: string
          input_tokens?: number
          latency_ms?: number
          model: string
          output_tokens?: number
          provider: string
          response_text?: string | null
          routing_reason?: string | null
          success?: boolean
          test_id: string
          total_tokens?: number
        }
        Update: {
          actual_cost_micro_usd?: number
          cached?: boolean
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_micro_usd?: number
          finish_reason?: string | null
          free_tier_used?: boolean
          id?: string
          input_tokens?: number
          latency_ms?: number
          model?: string
          output_tokens?: number
          provider?: string
          response_text?: string | null
          routing_reason?: string | null
          success?: boolean
          test_id?: string
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_test_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ai_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_test_runs: {
        Row: {
          actual_cost_micro_usd: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_micro_usd: number
          free_tier_used: boolean
          id: string
          mode: string
          prompt_hash: string
          prompt_preview: string | null
          routing_reason: string | null
          status: string
          system_prompt_preview: string | null
          user_id: string
        }
        Insert: {
          actual_cost_micro_usd?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_micro_usd?: number
          free_tier_used?: boolean
          id?: string
          mode?: string
          prompt_hash: string
          prompt_preview?: string | null
          routing_reason?: string | null
          status?: string
          system_prompt_preview?: string | null
          user_id: string
        }
        Update: {
          actual_cost_micro_usd?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_micro_usd?: number
          free_tier_used?: boolean
          id?: string
          mode?: string
          prompt_hash?: string
          prompt_preview?: string | null
          routing_reason?: string | null
          status?: string
          system_prompt_preview?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_test_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          action: string
          cost_microcents: number | null
          created_at: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          user_id: string | null
          was_fallback: boolean | null
        }
        Insert: {
          action: string
          cost_microcents?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          user_id?: string | null
          was_fallback?: boolean | null
        }
        Update: {
          action?: string
          cost_microcents?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          user_id?: string | null
          was_fallback?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          properties: Json | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          properties?: Json | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          properties?: Json | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      answer_bank: {
        Row: {
          answer_text: string
          category: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_favourite: boolean
          last_used_at: string | null
          question_text: string
          source: string | null
          tags: string[] | null
          times_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_text: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_favourite?: boolean
          last_used_at?: string | null
          question_text: string
          source?: string | null
          tags?: string[] | null
          times_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_text?: string
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_favourite?: boolean
          last_used_at?: string | null
          question_text?: string
          source?: string | null
          tags?: string[] | null
          times_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backend_operation_log: {
        Row: {
          correlation_id: string
          created_at: string
          execution_ms: number | null
          fallback_reason: string | null
          id: string
          model_version: string | null
          operation_id: string
          operation_type: string
          provider: string | null
          python_service_version: string | null
          source: string
          status: string
          user_id: string | null
        }
        Insert: {
          correlation_id: string
          created_at?: string
          execution_ms?: number | null
          fallback_reason?: string | null
          id?: string
          model_version?: string | null
          operation_id: string
          operation_type: string
          provider?: string | null
          python_service_version?: string | null
          source: string
          status?: string
          user_id?: string | null
        }
        Update: {
          correlation_id?: string
          created_at?: string
          execution_ms?: number | null
          fallback_reason?: string | null
          id?: string
          model_version?: string | null
          operation_id?: string
          operation_type?: string
          provider?: string | null
          python_service_version?: string | null
          source?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      billing_reconciliation_incidents: {
        Row: {
          created_at: string
          details: Json
          id: string
          payment_order_id: string | null
          provider: string
          provider_order_id: string | null
          reason: string
          resolved_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          payment_order_id?: string | null
          provider?: string
          provider_order_id?: string | null
          reason: string
          resolved_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          payment_order_id?: string | null
          provider?: string
          provider_order_id?: string | null
          reason?: string
          resolved_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          auto_deduct_credits: boolean
          credits_150_inr_paise: number
          credits_50_inr_paise: number
          credits_500_inr_paise: number
          enterprise_monthly_inr_paise: number
          id: number
          pro_monthly_inr_paise: number
          razorpay_enabled: boolean
          referee_credit_reward: number
          referral_discount_percent: number
          referrer_credit_reward: number
          updated_at: string
        }
        Insert: {
          auto_deduct_credits?: boolean
          credits_150_inr_paise?: number
          credits_50_inr_paise?: number
          credits_500_inr_paise?: number
          enterprise_monthly_inr_paise?: number
          id?: number
          pro_monthly_inr_paise?: number
          razorpay_enabled?: boolean
          referee_credit_reward?: number
          referral_discount_percent?: number
          referrer_credit_reward?: number
          updated_at?: string
        }
        Update: {
          auto_deduct_credits?: boolean
          credits_150_inr_paise?: number
          credits_50_inr_paise?: number
          credits_500_inr_paise?: number
          enterprise_monthly_inr_paise?: number
          id?: number
          pro_monthly_inr_paise?: number
          razorpay_enabled?: boolean
          referee_credit_reward?: number
          referral_discount_percent?: number
          referrer_credit_reward?: number
          updated_at?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author: string
          category: string
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string
          id: string
          published: boolean
          published_at: string
          read_time: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string
          category?: string
          content: string
          cover_image_url?: string | null
          created_at?: string
          excerpt: string
          id?: string
          published?: boolean
          published_at?: string
          read_time?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          category?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published?: boolean
          published_at?: string
          read_time?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_integrations: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      coach_conversations: {
        Row: {
          created_at: string
          id: string
          session_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_conversations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          operation_id: string | null
          role: string
          session_id: string
          source: string | null
          status: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          operation_id?: string | null
          role: string
          session_id: string
          source?: string | null
          status?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          operation_id?: string | null
          role?: string
          session_id?: string
          source?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_messages_user_id_fkey"
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
      coding_hints: {
        Row: {
          created_at: string
          description: string
          difficulty: string
          example_problems: Json
          id: string
          language: string
          pattern: string
          published: boolean
          slug: string
          sort_order: number
          tags: string[]
          template_code: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          difficulty?: string
          example_problems?: Json
          id?: string
          language?: string
          pattern: string
          published?: boolean
          slug: string
          sort_order?: number
          tags?: string[]
          template_code?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          difficulty?: string
          example_problems?: Json
          id?: string
          language?: string
          pattern?: string
          published?: boolean
          slug?: string
          sort_order?: number
          tags?: string[]
          template_code?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      coding_questions: {
        Row: {
          constraints: string | null
          content_owner: string | null
          copyright_status: string | null
          created_at: string
          created_by: string | null
          description: string
          difficulty: string
          evaluation_mode: string
          id: string
          language: string
          license_type: string
          license_url: string | null
          max_submissions: number
          publish_status: string
          sample_input: string | null
          sample_output: string | null
          source: string | null
          starter_code: string
          time_limit_ms: number
          title: string
          updated_at: string
        }
        Insert: {
          constraints?: string | null
          content_owner?: string | null
          copyright_status?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          difficulty: string
          evaluation_mode?: string
          id?: string
          language?: string
          license_type?: string
          license_url?: string | null
          max_submissions?: number
          publish_status?: string
          sample_input?: string | null
          sample_output?: string | null
          source?: string | null
          starter_code?: string
          time_limit_ms?: number
          title: string
          updated_at?: string
        }
        Update: {
          constraints?: string | null
          content_owner?: string | null
          copyright_status?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          difficulty?: string
          evaluation_mode?: string
          id?: string
          language?: string
          license_type?: string
          license_url?: string | null
          max_submissions?: number
          publish_status?: string
          sample_input?: string | null
          sample_output?: string | null
          source?: string | null
          starter_code?: string
          time_limit_ms?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      coding_submissions: {
        Row: {
          code: string
          execution_status: string | null
          failed_tests: number | null
          id: string
          language: string
          passed_tests: number | null
          question_id: string
          result_payload: Json
          score: number | null
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          code: string
          execution_status?: string | null
          failed_tests?: number | null
          id?: string
          language: string
          passed_tests?: number | null
          question_id: string
          result_payload?: Json
          score?: number | null
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          code?: string
          execution_status?: string | null
          failed_tests?: number | null
          id?: string
          language?: string
          passed_tests?: number | null
          question_id?: string
          result_payload?: Json
          score?: number | null
          status?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coding_submissions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "coding_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      coding_test_cases: {
        Row: {
          expected_json: Json | null
          id: string
          input_json: Json | null
          is_hidden: boolean
          name: string
          question_id: string
          sort_order: number
          weight: number
        }
        Insert: {
          expected_json?: Json | null
          id?: string
          input_json?: Json | null
          is_hidden?: boolean
          name: string
          question_id: string
          sort_order?: number
          weight?: number
        }
        Update: {
          expected_json?: Json | null
          id?: string
          input_json?: Json | null
          is_hidden?: boolean
          name?: string
          question_id?: string
          sort_order?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "coding_test_cases_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "coding_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      community_answers: {
        Row: {
          body: string
          created_at: string
          id: string
          is_accepted: boolean
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_accepted?: boolean
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_answers_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          answer_id: string | null
          body: string
          created_at: string
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          body: string
          created_at?: string
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          answer_id?: string | null
          body?: string
          created_at?: string
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "community_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          accepted_answer_id: string | null
          attachment_paths: string[]
          body: string
          category: string
          created_at: string
          id: string
          locked: boolean
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_answer_id?: string | null
          attachment_paths?: string[]
          body: string
          category: string
          created_at?: string
          id?: string
          locked?: boolean
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_answer_id?: string | null
          attachment_paths?: string[]
          body?: string
          category?: string
          created_at?: string
          id?: string
          locked?: boolean
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      community_votes: {
        Row: {
          created_at: string
          target_id: string
          target_type: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          target_id: string
          target_type: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          target_id?: string
          target_type?: string
          user_id?: string
          value?: number
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
      company_research: {
        Row: {
          company_name: string
          company_name_normalized: string
          created_at: string
          culture: string | null
          id: string
          overview: string | null
          prep_tips: string | null
          raw_data: Json | null
          role_title: string | null
          user_id: string
        }
        Insert: {
          company_name: string
          company_name_normalized?: string
          created_at?: string
          culture?: string | null
          id?: string
          overview?: string | null
          prep_tips?: string | null
          raw_data?: Json | null
          role_title?: string | null
          user_id: string
        }
        Update: {
          company_name?: string
          company_name_normalized?: string
          created_at?: string
          culture?: string | null
          id?: string
          overview?: string | null
          prep_tips?: string | null
          raw_data?: Json | null
          role_title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      content_quality_incidents: {
        Row: {
          created_at: string
          id: string
          incident_type: string
          metadata: Json
          notes: string | null
          paper_id: string | null
          question_id: string | null
          reason: string | null
          reported_by: string | null
          reporter_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_type?: string
          metadata?: Json
          notes?: string | null
          paper_id?: string | null
          question_id?: string | null
          reason?: string | null
          reported_by?: string | null
          reporter_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_type?: string
          metadata?: Json
          notes?: string | null
          paper_id?: string | null
          question_id?: string | null
          reason?: string | null
          reported_by?: string | null
          reporter_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_quality_incidents_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "gov_generated_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_quality_incidents_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_quality_incidents_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
        ]
      }
      course_certificates: {
        Row: {
          certificate_code: string
          completion_percentage: number
          course_duration_hours: number | null
          course_id: string
          course_name: string
          id: string
          issued_at: string
          student_name: string
          user_id: string
        }
        Insert: {
          certificate_code: string
          completion_percentage: number
          course_duration_hours?: number | null
          course_id: string
          course_name: string
          id?: string
          issued_at?: string
          student_name: string
          user_id: string
        }
        Update: {
          certificate_code?: string
          completion_percentage?: number
          course_duration_hours?: number | null
          course_id?: string
          course_name?: string
          id?: string
          issued_at?: string
          student_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learning_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          last_accessed: string | null
          percentage: number
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          last_accessed?: string | null
          percentage?: number
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          last_accessed?: string | null
          percentage?: number
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learning_courses"
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
      credits: {
        Row: {
          balance: number
          id: string
          total_earned: number
          total_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          total_earned?: number
          total_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          total_earned?: number
          total_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      current_affairs: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          exam_relevance: string | null
          id: string
          language: string
          last_verified_at: string
          occurred_on: string
          source_name: string
          source_url: string
          summary: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          exam_relevance?: string | null
          id?: string
          language?: string
          last_verified_at: string
          occurred_on: string
          source_name: string
          source_url: string
          summary: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          exam_relevance?: string | null
          id?: string
          language?: string
          last_verified_at?: string
          occurred_on?: string
          source_name?: string
          source_url?: string
          summary?: string
        }
        Relationships: []
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
      document_practice_sets: {
        Row: {
          created_at: string
          document_id: string
          id: string
          owner_id: string
          question_ids: string[]
          title: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          owner_id: string
          question_ids?: string[]
          title: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          owner_id?: string
          question_ids?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_practice_sets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "personal_library_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_name: string | null
          content: string | null
          content_hash: string | null
          created_at: string
          deleted_at: string | null
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
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
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
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
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
      document_processing_job_attempts: {
        Row: {
          attempt_number: number
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_id: string
          stage: string | null
          started_at: string
          status: string
          worker_id: string | null
        }
        Insert: {
          attempt_number: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id: string
          stage?: string | null
          started_at?: string
          status: string
          worker_id?: string | null
        }
        Update: {
          attempt_number?: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_id?: string
          stage?: string | null
          started_at?: string
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "document_processing_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          cancel_requested_at: string | null
          completed_at: string | null
          created_at: string
          credit_transaction_id: string | null
          credits_refunded_at: string | null
          credits_reserved: number
          credits_settled_at: string | null
          document_id: string
          error_code: string | null
          error_message: string | null
          error_stage: string | null
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          lease_expires_at: string | null
          max_attempts: number
          operation: string
          owner_id: string
          parser_version: string | null
          request_hash: string | null
          result_reference: string | null
          retryable: boolean
          status: string
          storage_reference: Json
          updated_at: string
          warnings: Json
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          cancel_requested_at?: string | null
          completed_at?: string | null
          created_at?: string
          credit_transaction_id?: string | null
          credits_refunded_at?: string | null
          credits_reserved?: number
          credits_settled_at?: string | null
          document_id: string
          error_code?: string | null
          error_message?: string | null
          error_stage?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key: string
          lease_expires_at?: string | null
          max_attempts?: number
          operation?: string
          owner_id: string
          parser_version?: string | null
          request_hash?: string | null
          result_reference?: string | null
          retryable?: boolean
          status?: string
          storage_reference?: Json
          updated_at?: string
          warnings?: Json
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number
          available_at?: string
          cancel_requested_at?: string | null
          completed_at?: string | null
          created_at?: string
          credit_transaction_id?: string | null
          credits_refunded_at?: string | null
          credits_reserved?: number
          credits_settled_at?: string | null
          document_id?: string
          error_code?: string | null
          error_message?: string | null
          error_stage?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string
          lease_expires_at?: string | null
          max_attempts?: number
          operation?: string
          owner_id?: string
          parser_version?: string | null
          request_hash?: string | null
          result_reference?: string | null
          retryable?: boolean
          status?: string
          storage_reference?: Json
          updated_at?: string
          warnings?: Json
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "personal_library_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempt_cohorts: {
        Row: {
          created_at: string
          exam_id: string | null
          id: string
          min_size: number
          paper_fingerprint: string
          status: string
        }
        Insert: {
          created_at?: string
          exam_id?: string | null
          id?: string
          min_size?: number
          paper_fingerprint: string
          status?: string
        }
        Update: {
          created_at?: string
          exam_id?: string | null
          id?: string
          min_size?: number
          paper_fingerprint?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempt_cohorts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_families: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      exam_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          paper_id: string | null
          public_url: string | null
          question_id: string | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          paper_id?: string | null
          public_url?: string | null
          question_id?: string | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          paper_id?: string | null
          public_url?: string | null
          question_id?: string | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_images_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_images_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_images_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_papers: {
        Row: {
          created_at: string | null
          difficulty_level: string | null
          duration_minutes: number | null
          exam_name: string
          exam_type: string
          id: string
          paper_number: string | null
          pdf_url: string | null
          session: string | null
          shift: string | null
          total_marks: number | null
          total_questions: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          exam_name: string
          exam_type: string
          id?: string
          paper_number?: string | null
          pdf_url?: string | null
          session?: string | null
          shift?: string | null
          total_marks?: number | null
          total_questions?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          exam_name?: string
          exam_type?: string
          id?: string
          paper_number?: string | null
          pdf_url?: string | null
          session?: string | null
          shift?: string | null
          total_marks?: number | null
          total_questions?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      exam_ranks: {
        Row: {
          cohort_id: string
          created_at: string
          id: string
          percentile: number | null
          rank: number | null
          score: number
          status: string
          test_id: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          id?: string
          percentile?: number | null
          rank?: number | null
          score: number
          status?: string
          test_id: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          id?: string
          percentile?: number | null
          rank?: number | null
          score?: number
          status?: string
          test_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_ranks_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "exam_attempt_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_ranks_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_readiness: {
        Row: {
          breakdown: Json
          exam_id: string
          id: string
          score: number
          stage_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          breakdown?: Json
          exam_id: string
          id?: string
          score?: number
          stage_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          breakdown?: Json
          exam_id?: string
          id?: string
          score?: number
          stage_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_readiness_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_readiness_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_templates: {
        Row: {
          category_distribution: Json
          created_at: string
          created_by: string | null
          description: string | null
          difficulty_distribution: Json
          duration_minutes: number
          id: string
          is_active: boolean
          is_published: boolean
          marks_negative: number
          marks_positive: number
          max_attempts: number | null
          passing_percentage: number
          question_count: number
          randomize: boolean
          role_slug: string
          slug: string
          strict_taxonomy: boolean
          title: string
          updated_at: string
        }
        Insert: {
          category_distribution?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_distribution?: Json
          duration_minutes: number
          id?: string
          is_active?: boolean
          is_published?: boolean
          marks_negative?: number
          marks_positive?: number
          max_attempts?: number | null
          passing_percentage?: number
          question_count: number
          randomize?: boolean
          role_slug?: string
          slug: string
          strict_taxonomy?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          category_distribution?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty_distribution?: Json
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_published?: boolean
          marks_negative?: number
          marks_positive?: number
          max_attempts?: number | null
          passing_percentage?: number
          question_count?: number
          randomize?: boolean
          role_slug?: string
          slug?: string
          strict_taxonomy?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      feedback: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          id: string
          rating: number | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      gap_analyses: {
        Row: {
          created_at: string
          id: string
          jd_id: string
          jd_updated_at: string | null
          result: Json
          resume_id: string
          resume_updated_at: string | null
          stale: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          jd_id: string
          jd_updated_at?: string | null
          result: Json
          resume_id: string
          resume_updated_at?: string | null
          stale?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          jd_id?: string
          jd_updated_at?: string | null
          result?: Json
          resume_id?: string
          resume_updated_at?: string | null
          stale?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gov_exam_aliases: {
        Row: {
          alias: string
          exam_id: string
          id: string
        }
        Insert: {
          alias: string
          exam_id: string
          id?: string
        }
        Update: {
          alias?: string
          exam_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_aliases_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_cycles: {
        Row: {
          code: string
          created_at: string
          effective_date: string | null
          exam_id: string
          id: string
          name: string
          notes: string | null
          review_state: string
          updated_at: string
          year: number | null
        }
        Insert: {
          code: string
          created_at?: string
          effective_date?: string | null
          exam_id: string
          id?: string
          name: string
          notes?: string | null
          review_state?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          effective_date?: string | null
          exam_id?: string
          id?: string
          name?: string
          notes?: string | null
          review_state?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_cycles_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_languages: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          language_code: string
          review_state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          language_code: string
          review_state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          language_code?: string
          review_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_languages_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_pattern_versions: {
        Row: {
          created_at: string
          duration_minutes: number
          effective_date: string | null
          exam_id: string
          id: string
          languages: string[]
          marks_per_question: number
          negative_mark: number
          notes: string | null
          review_state: string
          source_url: string | null
          stage_id: string
          superseded_by: string | null
          total_marks: number
          total_questions: number
          version: string
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          effective_date?: string | null
          exam_id: string
          id?: string
          languages?: string[]
          marks_per_question?: number
          negative_mark?: number
          notes?: string | null
          review_state?: string
          source_url?: string | null
          stage_id: string
          superseded_by?: string | null
          total_marks: number
          total_questions: number
          version: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          effective_date?: string | null
          exam_id?: string
          id?: string
          languages?: string[]
          marks_per_question?: number
          negative_mark?: number
          notes?: string | null
          review_state?: string
          source_url?: string | null
          stage_id?: string
          superseded_by?: string | null
          total_marks?: number
          total_questions?: number
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_pattern_versions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_exam_pattern_versions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_exam_pattern_versions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "gov_exam_pattern_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_rules: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          pattern_version_id: string
          rule_json: Json
          rule_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          pattern_version_id: string
          rule_json?: Json
          rule_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          pattern_version_id?: string
          rule_json?: Json
          rule_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_rules_pattern_version_id_fkey"
            columns: ["pattern_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_pattern_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_sections: {
        Row: {
          code: string
          id: string
          marks: number
          name: string
          pattern_version_id: string
          question_count: number
          sort_order: number
        }
        Insert: {
          code: string
          id?: string
          marks: number
          name: string
          pattern_version_id: string
          question_count: number
          sort_order?: number
        }
        Update: {
          code?: string
          id?: string
          marks?: number
          name?: string
          pattern_version_id?: string
          question_count?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_sections_pattern_version_id_fkey"
            columns: ["pattern_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_pattern_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_stages: {
        Row: {
          code: string
          exam_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          exam_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          exam_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_stages_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_syllabus_versions: {
        Row: {
          created_at: string
          effective_date: string | null
          exam_id: string
          id: string
          review_state: string
          source_url: string | null
          stage_id: string
          topics_json: Json
          version: string
        }
        Insert: {
          created_at?: string
          effective_date?: string | null
          exam_id: string
          id?: string
          review_state?: string
          source_url?: string | null
          stage_id: string
          topics_json?: Json
          version: string
        }
        Update: {
          created_at?: string
          effective_date?: string | null
          exam_id?: string
          id?: string
          review_state?: string
          source_url?: string | null
          stage_id?: string
          topics_json?: Json
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_syllabus_versions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_exam_syllabus_versions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exam_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          query_text: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          query_text: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          query_text?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gov_exam_topics: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          name: string
          section_code: string | null
          sort_order: number
          stage_id: string | null
          syllabus_version_id: string | null
          topic_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          name: string
          section_code?: string | null
          sort_order?: number
          stage_id?: string | null
          syllabus_version_id?: string | null
          topic_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          name?: string
          section_code?: string | null
          sort_order?: number
          stage_id?: string | null
          syllabus_version_id?: string | null
          topic_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_exam_topics_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_exam_topics_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_exam_topics_syllabus_version_id_fkey"
            columns: ["syllabus_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_syllabus_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_exams: {
        Row: {
          code: string
          created_at: string
          description: string | null
          family: string
          id: string
          is_public: boolean
          legacy_exam_type: string | null
          name: string
          recruiting_body_id: string
          review_state: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          family: string
          id?: string
          is_public?: boolean
          legacy_exam_type?: string | null
          name: string
          recruiting_body_id: string
          review_state?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          family?: string
          id?: string
          is_public?: boolean
          legacy_exam_type?: string | null
          name?: string
          recruiting_body_id?: string
          review_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_exams_family_fkey"
            columns: ["family"]
            isOneToOne: false
            referencedRelation: "exam_families"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "gov_exams_recruiting_body_id_fkey"
            columns: ["recruiting_body_id"]
            isOneToOne: false
            referencedRelation: "recruiting_bodies"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_generated_paper_questions: {
        Row: {
          id: string
          paper_id: string
          question_id: string
          section_code: string | null
          sort_order: number
          source_class: string
        }
        Insert: {
          id?: string
          paper_id: string
          question_id: string
          section_code?: string | null
          sort_order?: number
          source_class?: string
        }
        Update: {
          id?: string
          paper_id?: string
          question_id?: string
          section_code?: string | null
          sort_order?: number
          source_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_generated_paper_questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "gov_generated_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_generated_paper_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_generated_paper_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_generated_papers: {
        Row: {
          blueprint_json: Json
          created_at: string
          created_by: string | null
          disclaimer: string
          duration_minutes: number
          exam_id: string
          id: string
          job_id: string | null
          language: string
          mock_test_id: string | null
          negative_mark: number
          paper_class: string
          pattern_version_id: string | null
          provenance_json: Json
          quality_score: number | null
          question_count: number
          review_state: string
          stage_id: string | null
          syllabus_version_id: string | null
          title: string
          total_marks: number
        }
        Insert: {
          blueprint_json?: Json
          created_at?: string
          created_by?: string | null
          disclaimer?: string
          duration_minutes: number
          exam_id: string
          id?: string
          job_id?: string | null
          language?: string
          mock_test_id?: string | null
          negative_mark?: number
          paper_class?: string
          pattern_version_id?: string | null
          provenance_json?: Json
          quality_score?: number | null
          question_count: number
          review_state?: string
          stage_id?: string | null
          syllabus_version_id?: string | null
          title: string
          total_marks: number
        }
        Update: {
          blueprint_json?: Json
          created_at?: string
          created_by?: string | null
          disclaimer?: string
          duration_minutes?: number
          exam_id?: string
          id?: string
          job_id?: string | null
          language?: string
          mock_test_id?: string | null
          negative_mark?: number
          paper_class?: string
          pattern_version_id?: string | null
          provenance_json?: Json
          quality_score?: number | null
          question_count?: number
          review_state?: string
          stage_id?: string | null
          syllabus_version_id?: string | null
          title?: string
          total_marks?: number
        }
        Relationships: [
          {
            foreignKeyName: "gov_generated_papers_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_generated_papers_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "gov_paper_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_generated_papers_pattern_version_id_fkey"
            columns: ["pattern_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_pattern_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_generated_papers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_generated_papers_syllabus_version_id_fkey"
            columns: ["syllabus_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_syllabus_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_official_sources: {
        Row: {
          created_at: string
          document_type: string
          effective_date: string | null
          exam_id: string | null
          file_hash: string | null
          id: string
          is_official: boolean
          language: string | null
          license_class: string
          metadata: Json
          mime_type: string | null
          publication_date: string | null
          recruiting_body_id: string | null
          retrieved_at: string
          review_state: string
          source_url: string | null
          storage_path: string | null
          superseded_by: string | null
          title: string
        }
        Insert: {
          created_at?: string
          document_type: string
          effective_date?: string | null
          exam_id?: string | null
          file_hash?: string | null
          id?: string
          is_official?: boolean
          language?: string | null
          license_class?: string
          metadata?: Json
          mime_type?: string | null
          publication_date?: string | null
          recruiting_body_id?: string | null
          retrieved_at?: string
          review_state?: string
          source_url?: string | null
          storage_path?: string | null
          superseded_by?: string | null
          title: string
        }
        Update: {
          created_at?: string
          document_type?: string
          effective_date?: string | null
          exam_id?: string | null
          file_hash?: string | null
          id?: string
          is_official?: boolean
          language?: string | null
          license_class?: string
          metadata?: Json
          mime_type?: string | null
          publication_date?: string | null
          recruiting_body_id?: string | null
          retrieved_at?: string
          review_state?: string
          source_url?: string | null
          storage_path?: string | null
          superseded_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_official_sources_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_official_sources_recruiting_body_id_fkey"
            columns: ["recruiting_body_id"]
            isOneToOne: false
            referencedRelation: "recruiting_bodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_official_sources_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "gov_official_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_paper_generation_jobs: {
        Row: {
          attempt_count: number
          blueprint_json: Json | null
          completed_at: string | null
          created_at: string
          credit_reservation: string | null
          credits_charged: number
          error_code: string | null
          error_message: string | null
          exam_id: string
          generated_paper_id: string | null
          heartbeat_at: string | null
          id: string
          idempotency_key: string | null
          language: string
          lease_expires_at: string | null
          mock_test_id: string | null
          mode: string
          pattern_version_id: string | null
          progress_stage: string | null
          random_seed: string | null
          request_json: Json
          retryable: boolean
          stage_id: string | null
          started_at: string | null
          status: string
          syllabus_version_id: string | null
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number
          blueprint_json?: Json | null
          completed_at?: string | null
          created_at?: string
          credit_reservation?: string | null
          credits_charged?: number
          error_code?: string | null
          error_message?: string | null
          exam_id: string
          generated_paper_id?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string | null
          language?: string
          lease_expires_at?: string | null
          mock_test_id?: string | null
          mode: string
          pattern_version_id?: string | null
          progress_stage?: string | null
          random_seed?: string | null
          request_json?: Json
          retryable?: boolean
          stage_id?: string | null
          started_at?: string | null
          status?: string
          syllabus_version_id?: string | null
          updated_at?: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number
          blueprint_json?: Json | null
          completed_at?: string | null
          created_at?: string
          credit_reservation?: string | null
          credits_charged?: number
          error_code?: string | null
          error_message?: string | null
          exam_id?: string
          generated_paper_id?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string | null
          language?: string
          lease_expires_at?: string | null
          mock_test_id?: string | null
          mode?: string
          pattern_version_id?: string | null
          progress_stage?: string | null
          random_seed?: string | null
          request_json?: Json
          retryable?: boolean
          stage_id?: string | null
          started_at?: string | null
          status?: string
          syllabus_version_id?: string | null
          updated_at?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gov_paper_generation_jobs_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_paper_generation_jobs_pattern_version_id_fkey"
            columns: ["pattern_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_pattern_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_paper_generation_jobs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_paper_generation_jobs_syllabus_version_id_fkey"
            columns: ["syllabus_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_syllabus_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          answer: string
          body_md: string | null
          category_slug: string
          category_title: string
          created_at: string
          id: string
          published: boolean
          question: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          body_md?: string | null
          category_slug: string
          category_title: string
          created_at?: string
          id?: string
          published?: boolean
          question: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          body_md?: string | null
          category_slug?: string
          category_title?: string
          created_at?: string
          id?: string
          published?: boolean
          question?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      idempotency_log: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key: string
          metadata: Json
          response: Json | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key: string
          metadata?: Json
          response?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key?: string
          metadata?: Json
          response?: Json | null
        }
        Relationships: []
      }
      interview_day_checklists: {
        Row: {
          checked: boolean
          id: string
          interview_id: string
          item_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checked?: boolean
          id?: string
          interview_id: string
          item_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checked?: boolean
          id?: string
          interview_id?: string
          item_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_day_checklists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_practice_plan_items: {
        Row: {
          activity_type: string
          competency: string | null
          completed: boolean
          completed_at: string | null
          created_at: string
          due_offset_days: number
          id: string
          plan_id: string
          reason: string | null
          recommended_route: string | null
          title: string
          user_id: string
        }
        Insert: {
          activity_type: string
          competency?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          due_offset_days?: number
          id?: string
          plan_id: string
          reason?: string | null
          recommended_route?: string | null
          title: string
          user_id: string
        }
        Update: {
          activity_type?: string
          competency?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          due_offset_days?: number
          id?: string
          plan_id?: string
          reason?: string | null
          recommended_route?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_practice_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "interview_practice_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_practice_plans: {
        Row: {
          created_at: string
          id: string
          plan_json: Json
          source: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_json?: Json
          source?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_json?: Json
          source?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_rounds: {
        Row: {
          created_at: string
          debrief_id: string | null
          duration_minutes: number | null
          id: string
          interview_type: string | null
          interviewer_name: string | null
          interviewer_title: string | null
          meeting_link: string | null
          notes: string | null
          outcome: string | null
          platform: string | null
          round_label: string | null
          round_number: number
          round_type: string | null
          scheduled_at: string | null
          scheduled_interview_id: string
          session_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          debrief_id?: string | null
          duration_minutes?: number | null
          id?: string
          interview_type?: string | null
          interviewer_name?: string | null
          interviewer_title?: string | null
          meeting_link?: string | null
          notes?: string | null
          outcome?: string | null
          platform?: string | null
          round_label?: string | null
          round_number?: number
          round_type?: string | null
          scheduled_at?: string | null
          scheduled_interview_id: string
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          debrief_id?: string | null
          duration_minutes?: number | null
          id?: string
          interview_type?: string | null
          interviewer_name?: string | null
          interviewer_title?: string | null
          meeting_link?: string | null
          notes?: string | null
          outcome?: string | null
          platform?: string | null
          round_label?: string | null
          round_number?: number
          round_type?: string | null
          scheduled_at?: string | null
          scheduled_interview_id?: string
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_rounds_scheduled_interview_id_fkey"
            columns: ["scheduled_interview_id"]
            isOneToOne: false
            referencedRelation: "scheduled_interviews"
            referencedColumns: ["id"]
          },
        ]
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
      job_descriptions: {
        Row: {
          company: string | null
          content: string | null
          content_hash: string | null
          created_at: string
          file_url: string | null
          id: string
          input_method: string | null
          is_active: boolean | null
          parse_error: string | null
          parse_status: string | null
          parsed_data: Json | null
          target_role: string | null
          title: string
          updated_at: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          content?: string | null
          content_hash?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          input_method?: string | null
          is_active?: boolean | null
          parse_error?: string | null
          parse_status?: string | null
          parsed_data?: Json | null
          target_role?: string | null
          title: string
          updated_at?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          content?: string | null
          content_hash?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          input_method?: string | null
          is_active?: boolean | null
          parse_error?: string | null
          parse_status?: string | null
          parsed_data?: Json | null
          target_role?: string | null
          title?: string
          updated_at?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      learning_courses: {
        Row: {
          content_owner: string | null
          copyright_status: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_hours: number | null
          id: string
          license_type: string
          license_url: string | null
          publish_status: string
          slug: string
          source: string | null
          title: string
          unlock_mode: string
          updated_at: string
        }
        Insert: {
          content_owner?: string | null
          copyright_status?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          license_type?: string
          license_url?: string | null
          publish_status?: string
          slug: string
          source?: string | null
          title: string
          unlock_mode?: string
          updated_at?: string
        }
        Update: {
          content_owner?: string | null
          copyright_status?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_hours?: number | null
          id?: string
          license_type?: string
          license_url?: string | null
          publish_status?: string
          slug?: string
          source?: string | null
          title?: string
          unlock_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      learning_lessons: {
        Row: {
          content_owner: string | null
          content_text: string | null
          copyright_status: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          lesson_type: string
          license_type: string
          license_url: string | null
          module_id: string
          resource_url: string | null
          sort_order: number
          source: string | null
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_owner?: string | null
          content_text?: string | null
          copyright_status?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_type: string
          license_type?: string
          license_url?: string | null
          module_id: string
          resource_url?: string | null
          sort_order?: number
          source?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_owner?: string | null
          content_text?: string | null
          copyright_status?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          lesson_type?: string
          license_type?: string
          license_url?: string | null
          module_id?: string
          resource_url?: string | null
          sort_order?: number
          source?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learning_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_quizzes: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          is_final: boolean
          module_id: string | null
          passing_percentage: number
          question_ids: string[]
          title: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          is_final?: boolean
          module_id?: string | null
          passing_percentage?: number
          question_ids?: string[]
          title: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          is_final?: boolean
          module_id?: string | null
          passing_percentage?: number
          question_ids?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_quizzes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learning_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_quizzes_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_resources: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          resource_type: string
          storage_path: string | null
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          resource_type: string
          storage_path?: string | null
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          resource_type?: string
          storage_path?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_resources_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "learning_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          last_accessed: string | null
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          last_accessed?: string | null
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          last_accessed?: string | null
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "learning_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_tests: {
        Row: {
          attempt_phase: string | null
          cohort_id: string | null
          config: Json
          created_at: string | null
          evaluation_version: number
          id: string
          overall_score: number | null
          question_ids: string[]
          rank_status: string
          started_at: string | null
          expires_at: string | null
          status: string
          submitted_at: string | null
          test_name: string
          time_limit_minutes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempt_phase?: string | null
          cohort_id?: string | null
          config?: Json
          created_at?: string | null
          evaluation_version?: number
          id?: string
          overall_score?: number | null
          question_ids?: string[]
          rank_status?: string
          started_at?: string | null
          expires_at?: string | null
          status?: string
          submitted_at?: string | null
          test_name: string
          time_limit_minutes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempt_phase?: string | null
          cohort_id?: string | null
          config?: Json
          created_at?: string | null
          evaluation_version?: number
          id?: string
          overall_score?: number | null
          question_ids?: string[]
          rank_status?: string
          started_at?: string | null
          expires_at?: string | null
          status?: string
          submitted_at?: string | null
          test_name?: string
          time_limit_minutes?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      payment_orders: {
        Row: {
          amount_paise: number
          cancelled_at: string | null
          created_at: string
          credits_granted: number
          currency: string
          fulfilled_at: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          paid_at: string | null
          plan_id: string | null
          product_type: string
          promo_code: string | null
          promo_code_id: string | null
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          reconciliation_reason: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          amount_paise: number
          cancelled_at?: string | null
          created_at?: string
          credits_granted?: number
          currency?: string
          fulfilled_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          paid_at?: string | null
          plan_id?: string | null
          product_type: string
          promo_code?: string | null
          promo_code_id?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          reconciliation_reason?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          amount_paise?: number
          cancelled_at?: string | null
          created_at?: string
          credits_granted?: number
          currency?: string
          fulfilled_at?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          paid_at?: string | null
          plan_id?: string | null
          product_type?: string
          promo_code?: string | null
          promo_code_id?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          reconciliation_reason?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_library_document_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          document_id: string
          error_code: string | null
          error_message: string | null
          id: string
          parser_version: string | null
          status: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          document_id: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          parser_version?: string | null
          status: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          document_id?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          parser_version?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_library_document_attempts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "personal_library_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_library_documents: {
        Row: {
          content_hash: string | null
          content_rights: string
          created_at: string
          document_name: string
          file_category: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          owner_id: string
          parsed_content: string | null
          parsed_metadata: Json
          parser_version: string | null
          processing_error: string | null
          processing_status: string
          rights_confirmed: boolean
          source: string | null
          storage_path: string | null
          supersedes_id: string | null
          uploaded_by: string
          version_number: number
        }
        Insert: {
          content_hash?: string | null
          content_rights?: string
          created_at?: string
          document_name: string
          file_category?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          owner_id: string
          parsed_content?: string | null
          parsed_metadata?: Json
          parser_version?: string | null
          processing_error?: string | null
          processing_status?: string
          rights_confirmed?: boolean
          source?: string | null
          storage_path?: string | null
          supersedes_id?: string | null
          uploaded_by: string
          version_number?: number
        }
        Update: {
          content_hash?: string | null
          content_rights?: string
          created_at?: string
          document_name?: string
          file_category?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          owner_id?: string
          parsed_content?: string | null
          parsed_metadata?: Json
          parser_version?: string | null
          processing_error?: string | null
          processing_status?: string
          rights_confirmed?: boolean
          source?: string | null
          storage_path?: string | null
          supersedes_id?: string | null
          uploaded_by?: string
          version_number?: number
        }
        Relationships: []
      }
      practice_contexts: {
        Row: {
          company: string | null
          competency: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          jd_id: string | null
          question_text: string
          resume_id: string | null
          role: string | null
          source_id: string | null
          source_type: string
          source_version: string | null
          status: string
          user_id: string
        }
        Insert: {
          company?: string | null
          competency?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          jd_id?: string | null
          question_text?: string
          resume_id?: string | null
          role?: string | null
          source_id?: string | null
          source_type?: string
          source_version?: string | null
          status?: string
          user_id: string
        }
        Update: {
          company?: string | null
          competency?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          jd_id?: string | null
          question_text?: string
          resume_id?: string | null
          role?: string | null
          source_id?: string | null
          source_type?: string
          source_version?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_rooms: {
        Row: {
          created_at: string
          description: string | null
          host_id: string
          id: string
          is_public: boolean
          max_players: number
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          host_id: string
          id?: string
          is_public?: boolean
          max_players?: number
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          host_id?: string
          id?: string
          is_public?: boolean
          max_players?: number
          name?: string
          status?: string
        }
        Relationships: []
      }
      practice_workspace_sessions: {
        Row: {
          answers: Json
          created_at: string
          current_index: number
          difficulty: string | null
          elapsed_seconds: number
          ended_at: string | null
          expires_at: string | null
          id: string
          interview_type: string
          mode: string | null
          notes: string | null
          question_order: Json
          question_source: string | null
          role: string | null
          scores: Json | null
          skipped: Json
          started_at: string
          status: string
          user_id: string
          version: number
        }
        Insert: {
          answers?: Json
          created_at?: string
          current_index?: number
          difficulty?: string | null
          elapsed_seconds?: number
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          interview_type: string
          mode?: string | null
          notes?: string | null
          question_order?: Json
          question_source?: string | null
          role?: string | null
          scores?: Json | null
          skipped?: Json
          started_at?: string
          status?: string
          user_id: string
          version?: number
        }
        Update: {
          answers?: Json
          created_at?: string
          current_index?: number
          difficulty?: string | null
          elapsed_seconds?: number
          ended_at?: string | null
          expires_at?: string | null
          id?: string
          interview_type?: string
          mode?: string | null
          notes?: string | null
          question_order?: Json
          question_source?: string | null
          role?: string | null
          scores?: Json | null
          skipped?: Json
          started_at?: string
          status?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      preparation_plans: {
        Row: {
          exam_id: string
          id: string
          plan_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          exam_id: string
          id?: string
          plan_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          exam_id?: string
          id?: string
          plan_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preparation_plans_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      previous_year_paper_questions: {
        Row: {
          id: string
          page_ref: string | null
          paper_id: string
          question_id: string
          section_code: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          page_ref?: string | null
          paper_id: string
          question_id: string
          section_code?: string | null
          sort_order?: number
        }
        Update: {
          id?: string
          page_ref?: string | null
          paper_id?: string
          question_id?: string
          section_code?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "previous_year_paper_questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "previous_year_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_year_paper_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_year_paper_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
        ]
      }
      previous_year_papers: {
        Row: {
          answer_key_status: string
          created_at: string
          cycle: string | null
          duration_minutes: number | null
          exam_id: string
          id: string
          language: string
          marking: Json
          metadata: Json
          notes: string | null
          official_status: string
          pattern_version_id: string | null
          question_count: number | null
          review_status: string
          shift: string | null
          source_id: string | null
          stage_id: string | null
          syllabus_version_id: string | null
          tier: string | null
          title: string | null
          updated_at: string
          year: number
        }
        Insert: {
          answer_key_status?: string
          created_at?: string
          cycle?: string | null
          duration_minutes?: number | null
          exam_id: string
          id?: string
          language?: string
          marking?: Json
          metadata?: Json
          notes?: string | null
          official_status?: string
          pattern_version_id?: string | null
          question_count?: number | null
          review_status?: string
          shift?: string | null
          source_id?: string | null
          stage_id?: string | null
          syllabus_version_id?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          answer_key_status?: string
          created_at?: string
          cycle?: string | null
          duration_minutes?: number | null
          exam_id?: string
          id?: string
          language?: string
          marking?: Json
          metadata?: Json
          notes?: string | null
          official_status?: string
          pattern_version_id?: string | null
          question_count?: number | null
          review_status?: string
          shift?: string | null
          source_id?: string | null
          stage_id?: string | null
          syllabus_version_id?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "previous_year_papers_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_year_papers_pattern_version_id_fkey"
            columns: ["pattern_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_pattern_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_year_papers_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gov_official_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_year_papers_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "previous_year_papers_syllabus_version_id_fkey"
            columns: ["syllabus_version_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_syllabus_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          audio_input_device: string | null
          audio_output_device: string | null
          auto_deduct_credits: boolean
          auto_transcript: boolean
          avatar_url: string | null
          ban_reason: string | null
          bio: string | null
          byok_anthropic: boolean | null
          byok_gemini: boolean | null
          byok_openai: boolean | null
          created_at: string
          credits: number
          credits_reset_at: string | null
          credits_used_this_month: number
          current_company: string | null
          current_title: string | null
          data_collection: boolean
          data_retention_days: number
          deepgram_model: string
          deleted_at: string | null
          domain: string | null
          email: string | null
          email_normalized: string | null
          email_notifications: boolean
          experience_years: number | null
          full_name: string | null
          github_url: string | null
          headline: string | null
          id: string
          improvement_goals: string[]
          industry: string | null
          interview_date: string | null
          interview_difficulty: string | null
          interview_strengths: string[] | null
          interview_weaknesses: string[] | null
          is_actively_looking: boolean | null
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
          notification_prefs: Json | null
          onboarding_completed: boolean
          onboarding_step: number
          overlay_font_size: number
          overlay_hotkey: string
          overlay_opacity: number
          overlay_position: string
          payment_failed_at: string | null
          pending_promo_code: string | null
          phone: string | null
          plan_id: Database["public"]["Enums"]["plan_tier"]
          preferred_language: string
          preferred_model: Database["public"]["Enums"]["ai_model"]
          preferred_salary: string | null
          privacy_prefs: Json | null
          profile_visibility: string
          referral_code: string | null
          referred_by: string | null
          region: string | null
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
          auto_deduct_credits?: boolean
          auto_transcript?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          byok_anthropic?: boolean | null
          byok_gemini?: boolean | null
          byok_openai?: boolean | null
          created_at?: string
          credits?: number
          credits_reset_at?: string | null
          credits_used_this_month?: number
          current_company?: string | null
          current_title?: string | null
          data_collection?: boolean
          data_retention_days?: number
          deepgram_model?: string
          deleted_at?: string | null
          domain?: string | null
          email?: string | null
          email_normalized?: string | null
          email_notifications?: boolean
          experience_years?: number | null
          full_name?: string | null
          github_url?: string | null
          headline?: string | null
          id: string
          improvement_goals?: string[]
          industry?: string | null
          interview_date?: string | null
          interview_difficulty?: string | null
          interview_strengths?: string[] | null
          interview_weaknesses?: string[] | null
          is_actively_looking?: boolean | null
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
          notification_prefs?: Json | null
          onboarding_completed?: boolean
          onboarding_step?: number
          overlay_font_size?: number
          overlay_hotkey?: string
          overlay_opacity?: number
          overlay_position?: string
          payment_failed_at?: string | null
          pending_promo_code?: string | null
          phone?: string | null
          plan_id?: Database["public"]["Enums"]["plan_tier"]
          preferred_language?: string
          preferred_model?: Database["public"]["Enums"]["ai_model"]
          preferred_salary?: string | null
          privacy_prefs?: Json | null
          profile_visibility?: string
          referral_code?: string | null
          referred_by?: string | null
          region?: string | null
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
          auto_deduct_credits?: boolean
          auto_transcript?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          byok_anthropic?: boolean | null
          byok_gemini?: boolean | null
          byok_openai?: boolean | null
          created_at?: string
          credits?: number
          credits_reset_at?: string | null
          credits_used_this_month?: number
          current_company?: string | null
          current_title?: string | null
          data_collection?: boolean
          data_retention_days?: number
          deepgram_model?: string
          deleted_at?: string | null
          domain?: string | null
          email?: string | null
          email_normalized?: string | null
          email_notifications?: boolean
          experience_years?: number | null
          full_name?: string | null
          github_url?: string | null
          headline?: string | null
          id?: string
          improvement_goals?: string[]
          industry?: string | null
          interview_date?: string | null
          interview_difficulty?: string | null
          interview_strengths?: string[] | null
          interview_weaknesses?: string[] | null
          is_actively_looking?: boolean | null
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
          notification_prefs?: Json | null
          onboarding_completed?: boolean
          onboarding_step?: number
          overlay_font_size?: number
          overlay_hotkey?: string
          overlay_opacity?: number
          overlay_position?: string
          payment_failed_at?: string | null
          pending_promo_code?: string | null
          phone?: string | null
          plan_id?: Database["public"]["Enums"]["plan_tier"]
          preferred_language?: string
          preferred_model?: Database["public"]["Enums"]["ai_model"]
          preferred_salary?: string | null
          privacy_prefs?: Json | null
          profile_visibility?: string
          referral_code?: string | null
          referred_by?: string | null
          region?: string | null
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
      promo_codes: {
        Row: {
          applies_to: string
          bonus_credits: number
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_percent: number
          id: string
          is_active: boolean
          max_redemptions: number | null
          redemption_count: number
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          applies_to?: string
          bonus_credits?: number
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percent?: number
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          redemption_count?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          applies_to?: string
          bonus_credits?: number
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percent?: number
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          redemption_count?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_provenance: {
        Row: {
          created_at: string
          id: string
          license_class: string
          metadata: Json
          page_ref: string | null
          question_id: string
          source_class: string
          source_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          license_class?: string
          metadata?: Json
          page_ref?: string | null
          question_id: string
          source_class?: string
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          license_class?: string
          metadata?: Json
          page_ref?: string | null
          question_id?: string
          source_class?: string
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_provenance_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_provenance_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_provenance_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gov_official_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      question_reviews: {
        Row: {
          action: string
          author_id: string | null
          created_at: string
          id: string
          notes: string | null
          question_id: string
          reviewer_id: string | null
        }
        Insert: {
          action: string
          author_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id: string
          reviewer_id?: string | null
        }
        Update: {
          action?: string
          author_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          question_id?: string
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_reviews_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_reviews_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
        ]
      }
      question_translations: {
        Row: {
          created_at: string
          explanation: string | null
          id: string
          language: string
          options: Json | null
          question_id: string
          question_text: string
          review_state: string
          reviewer_id: string | null
          source_version: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          explanation?: string | null
          id?: string
          language: string
          options?: Json | null
          question_id: string
          question_text: string
          review_state?: string
          reviewer_id?: string | null
          source_version?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          explanation?: string | null
          id?: string
          language?: string
          options?: Json | null
          question_id?: string
          question_text?: string
          review_state?: string
          reviewer_id?: string | null
          source_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_translations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_translations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          bank_id: string | null
          category: string | null
          content_owner: string | null
          copyright_status: string | null
          correct_answer: string
          created_at: string | null
          created_by: string | null
          difficulty: string | null
          downvotes: number | null
          eligible_roles: string[]
          exam_type: string | null
          explanation: string | null
          explanation_blocks: Json | null
          explanation_html: string | null
          has_image: boolean | null
          id: string
          image_url: string | null
          is_public: boolean | null
          is_verified: boolean | null
          latex_present: boolean | null
          license_type: string | null
          license_url: string | null
          marks_negative: number | null
          marks_positive: number | null
          metadata: Json
          option_blocks: Json | null
          options: Json | null
          publish_status: string
          question_blocks: Json | null
          question_html: string | null
          question_text: string
          question_type: string
          review_status: string
          source: string | null
          source_paper: string | null
          source_year: number | null
          subject: string
          subtopic: string | null
          tags: string[]
          time_limit_seconds: number | null
          topic: string
          updated_at: string | null
          uploaded_by: string | null
          upvotes: number | null
          cross_functional: boolean
        }
        Insert: {
          bank_id?: string | null
          category?: string | null
          content_owner?: string | null
          copyright_status?: string | null
          correct_answer: string
          created_at?: string | null
          created_by?: string | null
          cross_functional?: boolean
          difficulty?: string | null
          downvotes?: number | null
          eligible_roles?: string[]
          exam_type?: string | null
          explanation?: string | null
          explanation_blocks?: Json | null
          explanation_html?: string | null
          has_image?: boolean | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          latex_present?: boolean | null
          license_type?: string | null
          license_url?: string | null
          marks_negative?: number | null
          marks_positive?: number | null
          metadata?: Json
          option_blocks?: Json | null
          options?: Json | null
          publish_status?: string
          question_blocks?: Json | null
          question_html?: string | null
          question_text: string
          question_type?: string
          review_status?: string
          source?: string | null
          source_paper?: string | null
          source_year?: number | null
          subject: string
          subtopic?: string | null
          tags?: string[]
          time_limit_seconds?: number | null
          topic: string
          updated_at?: string | null
          uploaded_by?: string | null
          upvotes?: number | null
        }
        Update: {
          bank_id?: string | null
          category?: string | null
          content_owner?: string | null
          copyright_status?: string | null
          correct_answer?: string
          created_at?: string | null
          created_by?: string | null
          cross_functional?: boolean
          difficulty?: string | null
          downvotes?: number | null
          eligible_roles?: string[]
          exam_type?: string | null
          explanation?: string | null
          explanation_blocks?: Json | null
          explanation_html?: string | null
          has_image?: boolean | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          latex_present?: boolean | null
          license_type?: string | null
          license_url?: string | null
          marks_negative?: number | null
          marks_positive?: number | null
          metadata?: Json
          option_blocks?: Json | null
          options?: Json | null
          publish_status?: string
          question_blocks?: Json | null
          question_html?: string | null
          question_text?: string
          question_type?: string
          review_status?: string
          source?: string | null
          source_paper?: string | null
          source_year?: number | null
          subject?: string
          subtopic?: string | null
          tags?: string[]
          time_limit_seconds?: number | null
          topic?: string
          updated_at?: string | null
          uploaded_by?: string | null
          upvotes?: number | null
        }
        Relationships: []
      }
      quiz_progress: {
        Row: {
          completed_at: string | null
          last_accessed: string | null
          quiz_id: string
          score: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          last_accessed?: string | null
          quiz_id: string
          score?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          last_accessed?: string | null
          quiz_id?: string
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_progress_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "learning_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          count: number
          key: string
          reset_at: string
        }
        Insert: {
          count?: number
          key: string
          reset_at: string
        }
        Update: {
          count?: number
          key?: string
          reset_at?: string
        }
        Relationships: []
      }
      recruiting_bodies: {
        Row: {
          code: string
          created_at: string
          disclaimer_note: string | null
          id: string
          is_active: boolean
          jurisdiction: string
          name: string
          official_url: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          disclaimer_note?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string
          name: string
          official_url?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          disclaimer_note?: string | null
          id?: string
          is_active?: boolean
          jurisdiction?: string
          name?: string
          official_url?: string | null
          updated_at?: string
        }
        Relationships: []
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
      request_metrics: {
        Row: {
          created_at: string
          duration_ms: number
          function_name: string
          id: string
          status_code: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          function_name: string
          id?: string
          status_code: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          function_name?: string
          id?: string
          status_code?: number
          user_id?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          created_at: string
          id: string
          parse_error: string | null
          parse_status: string
          parsed_data: Json | null
          resume_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parse_error?: string | null
          parse_status?: string
          parsed_data?: Json | null
          resume_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parse_error?: string | null
          parse_status?: string
          parsed_data?: Json | null
          resume_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          content: string | null
          content_hash: string | null
          created_at: string
          file_path: string | null
          id: string
          is_primary: boolean
          name: string
          url: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          content_hash?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          is_primary?: boolean
          name: string
          url?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          content_hash?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      revision_list: {
        Row: {
          added_from_test_id: string | null
          created_at: string | null
          id: string
          interval_days: number
          is_mastered: boolean
          next_review_date: string
          question_id: string
          review_count: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          added_from_test_id?: string | null
          created_at?: string | null
          id?: string
          interval_days?: number
          is_mastered?: boolean
          next_review_date?: string
          question_id: string
          review_count?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          added_from_test_id?: string | null
          created_at?: string | null
          id?: string
          interval_days?: number
          is_mastered?: boolean
          next_review_date?: string
          question_id?: string
          review_count?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_list_added_from_test_id_fkey"
            columns: ["added_from_test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_list_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_list_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
        ]
      }
      room_chat: {
        Row: {
          created_at: string
          id: string
          message: string
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          room_id?: string
          user_id?: string
        }
        Relationships: []
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
      room_questions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          question: string
          question_type: string | null
          room_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          question: string
          question_type?: string | null
          room_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          question?: string
          question_type?: string | null
          room_id?: string
        }
        Relationships: []
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
      saved_answers: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          question: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          question: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          question?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_interviews: {
        Row: {
          calendar_event_id: string | null
          calendar_provider: string | null
          company_name: string
          company_research_id: string | null
          created_at: string
          id: string
          is_remote: boolean
          jd_id: string | null
          job_posting_url: string | null
          location: string | null
          notes: string | null
          priority: string
          resume_id: string | null
          role_title: string
          salary_range: string | null
          stage: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          calendar_provider?: string | null
          company_name: string
          company_research_id?: string | null
          created_at?: string
          id?: string
          is_remote?: boolean
          jd_id?: string | null
          job_posting_url?: string | null
          location?: string | null
          notes?: string | null
          priority?: string
          resume_id?: string | null
          role_title: string
          salary_range?: string | null
          stage?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          calendar_provider?: string | null
          company_name?: string
          company_research_id?: string | null
          created_at?: string
          id?: string
          is_remote?: boolean
          jd_id?: string | null
          job_posting_url?: string | null
          location?: string | null
          notes?: string | null
          priority?: string
          resume_id?: string | null
          role_title?: string
          salary_range?: string | null
          stage?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scorecards: {
        Row: {
          communication: number | null
          confidence: number | null
          created_at: string
          details: Json
          feedback: string | null
          generated_at: string | null
          id: string
          improvements: string[] | null
          is_shared: boolean
          overall_score: number | null
          problem_solving: number | null
          session_id: string | null
          share_token: string | null
          strengths: string[] | null
          technical: number | null
          user_id: string
        }
        Insert: {
          communication?: number | null
          confidence?: number | null
          created_at?: string
          details?: Json
          feedback?: string | null
          generated_at?: string | null
          id?: string
          improvements?: string[] | null
          is_shared?: boolean
          overall_score?: number | null
          problem_solving?: number | null
          session_id?: string | null
          share_token?: string | null
          strengths?: string[] | null
          technical?: number | null
          user_id: string
        }
        Update: {
          communication?: number | null
          confidence?: number | null
          created_at?: string
          details?: Json
          feedback?: string | null
          generated_at?: string | null
          id?: string
          improvements?: string[] | null
          is_shared?: boolean
          overall_score?: number | null
          problem_solving?: number | null
          session_id?: string | null
          share_token?: string | null
          strengths?: string[] | null
          technical?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scorecards_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_failures: {
        Row: {
          created_at: string
          error: string | null
          id: string
          job_id: string | null
          source_url: string
          status_code: number | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          source_url: string
          status_code?: number | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          source_url?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_failures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_ingested: {
        Row: {
          file_hash: string
          id: string
          ingested_at: string
          job_id: string | null
          paper_id: string | null
          source_url: string
        }
        Insert: {
          file_hash: string
          id?: string
          ingested_at?: string
          job_id?: string | null
          paper_id?: string | null
          source_url: string
        }
        Update: {
          file_hash?: string
          id?: string
          ingested_at?: string
          job_id?: string | null
          paper_id?: string | null
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_ingested_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_ingested_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          exam_type: string
          id: string
          logs: Json
          progress: Json
          status: string
          updated_at: string
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          exam_type: string
          id?: string
          logs?: Json
          progress?: Json
          status?: string
          updated_at?: string
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          exam_type?: string
          id?: string
          logs?: Json
          progress?: Json
          status?: string
          updated_at?: string
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: []
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
      session_answers: {
        Row: {
          ai_feedback: string | null
          answer: string | null
          created_at: string
          duration_ms: number | null
          id: string
          question: string
          question_index: number | null
          score: number | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          ai_feedback?: string | null
          answer?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          question: string
          question_index?: number | null
          score?: number | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          ai_feedback?: string | null
          answer?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          question?: string
          question_index?: number | null
          score?: number | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_debriefs: {
        Row: {
          action_plan: Json
          created_at: string
          detailed_report: Json | null
          id: string
          improvements: string[] | null
          insight: string | null
          next_session_goals: string[]
          overall_grade: string | null
          priority_focus: string | null
          resources: Json
          session_id: string | null
          skill_gaps: Json
          strengths: string[] | null
          summary: string | null
          user_id: string
        }
        Insert: {
          action_plan?: Json
          created_at?: string
          detailed_report?: Json | null
          id?: string
          improvements?: string[] | null
          insight?: string | null
          next_session_goals?: string[]
          overall_grade?: string | null
          priority_focus?: string | null
          resources?: Json
          session_id?: string | null
          skill_gaps?: Json
          strengths?: string[] | null
          summary?: string | null
          user_id: string
        }
        Update: {
          action_plan?: Json
          created_at?: string
          detailed_report?: Json | null
          id?: string
          improvements?: string[] | null
          insight?: string | null
          next_session_goals?: string[]
          overall_grade?: string | null
          priority_focus?: string | null
          resources?: Json
          session_id?: string | null
          skill_gaps?: Json
          strengths?: string[] | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_debriefs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
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
          deleted_at: string | null
          document_id: string | null
          ended_at: string | null
          expires_at: string | null
          terminal_reason: string | null
          duration_seconds: number | null
          start_idempotency_key: string | null
          filler_words: number | null
          hints_used: number | null
          id: string
          interview_id: string | null
          jd_id: string | null
          lifecycle_status: string | null
          model_used: Database["public"]["Enums"]["ai_model"] | null
          notes: string | null
          overall_score: number | null
          practice_context_id: string | null
          questions_asked: number | null
          session_type: string | null
          source_type: string | null
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
          deleted_at?: string | null
          document_id?: string | null
          ended_at?: string | null
          expires_at?: string | null
          terminal_reason?: string | null
          duration_seconds?: number | null
          start_idempotency_key?: string | null
          filler_words?: number | null
          hints_used?: number | null
          id?: string
          interview_id?: string | null
          jd_id?: string | null
          lifecycle_status?: string | null
          model_used?: Database["public"]["Enums"]["ai_model"] | null
          notes?: string | null
          overall_score?: number | null
          practice_context_id?: string | null
          questions_asked?: number | null
          session_type?: string | null
          source_type?: string | null
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
          deleted_at?: string | null
          document_id?: string | null
          ended_at?: string | null
          expires_at?: string | null
          terminal_reason?: string | null
          duration_seconds?: number | null
          start_idempotency_key?: string | null
          filler_words?: number | null
          hints_used?: number | null
          id?: string
          interview_id?: string | null
          jd_id?: string | null
          lifecycle_status?: string | null
          model_used?: Database["public"]["Enums"]["ai_model"] | null
          notes?: string | null
          overall_score?: number | null
          practice_context_id?: string | null
          questions_asked?: number | null
          session_type?: string | null
          source_type?: string | null
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
      source_conflicts: {
        Row: {
          created_at: string
          field: string
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_a: string
          source_b: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_a: string
          source_b: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_a?: string
          source_b?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_conflicts_source_a_fkey"
            columns: ["source_a"]
            isOneToOne: false
            referencedRelation: "gov_official_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_conflicts_source_b_fkey"
            columns: ["source_b"]
            isOneToOne: false
            referencedRelation: "gov_official_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_ingestion_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          metadata: Json
          paper_id: string | null
          parser_version: string
          questions_imported: number
          source_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          metadata?: Json
          paper_id?: string | null
          parser_version?: string
          questions_imported?: number
          source_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          metadata?: Json
          paper_id?: string | null
          parser_version?: string
          questions_imported?: number
          source_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_ingestion_jobs_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "previous_year_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_ingestion_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "gov_official_sources"
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
          monthly_amount_cents: number | null
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
          monthly_amount_cents?: number | null
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
          monthly_amount_cents?: number | null
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
      support_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          sender_id: string | null
          sender_role: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          assigned_admin_id: string | null
          created_at: string
          guest_email: string | null
          guest_name: string | null
          guest_token: string | null
          id: string
          last_message_at: string
          last_message_preview: string | null
          priority: string
          status: string
          subject: string
          unread_for_admin: boolean
          unread_for_user: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_token?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          priority?: string
          status?: string
          subject?: string
          unread_for_admin?: boolean
          unread_for_user?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_token?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          priority?: string
          status?: string
          subject?: string
          unread_for_admin?: boolean
          unread_for_user?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_design_topics: {
        Row: {
          category: string
          components: Json
          created_at: string
          description: string
          difficulty: string
          example_companies: string[]
          id: string
          key_concepts: string[]
          published: boolean
          reference_url: string | null
          slug: string
          sort_order: number
          title: string
          tradeoffs: Json
          updated_at: string
        }
        Insert: {
          category: string
          components?: Json
          created_at?: string
          description: string
          difficulty?: string
          example_companies?: string[]
          id?: string
          key_concepts?: string[]
          published?: boolean
          reference_url?: string | null
          slug: string
          sort_order?: number
          title: string
          tradeoffs?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          components?: Json
          created_at?: string
          description?: string
          difficulty?: string
          example_companies?: string[]
          id?: string
          key_concepts?: string[]
          published?: boolean
          reference_url?: string | null
          slug?: string
          sort_order?: number
          title?: string
          tradeoffs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      test_analyses: {
        Row: {
          accuracy: number | null
          ai_analysis_text: string | null
          algorithm_version: string | null
          attempt_percentage: number | null
          created_at: string | null
          id: string
          improvement_vs_last: number | null
          max_score: number | null
          predicted_percentile: number | null
          strong_topics: string[] | null
          subject_breakdown: Json | null
          test_id: string
          time_analysis: Json | null
          topic_breakdown: Json | null
          total_score: number | null
          updated_at: string | null
          user_id: string
          weak_topics: string[] | null
        }
        Insert: {
          accuracy?: number | null
          ai_analysis_text?: string | null
          algorithm_version?: string | null
          attempt_percentage?: number | null
          created_at?: string | null
          id?: string
          improvement_vs_last?: number | null
          max_score?: number | null
          predicted_percentile?: number | null
          strong_topics?: string[] | null
          subject_breakdown?: Json | null
          test_id: string
          time_analysis?: Json | null
          topic_breakdown?: Json | null
          total_score?: number | null
          updated_at?: string | null
          user_id: string
          weak_topics?: string[] | null
        }
        Update: {
          accuracy?: number | null
          ai_analysis_text?: string | null
          algorithm_version?: string | null
          attempt_percentage?: number | null
          created_at?: string | null
          id?: string
          improvement_vs_last?: number | null
          max_score?: number | null
          predicted_percentile?: number | null
          strong_topics?: string[] | null
          subject_breakdown?: Json | null
          test_id?: string
          time_analysis?: Json | null
          topic_breakdown?: Json | null
          total_score?: number | null
          updated_at?: string | null
          user_id?: string
          weak_topics?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "test_analyses_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: true
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_responses: {
        Row: {
          answered_at: string | null
          created_at: string | null
          id: string
          is_attempted: boolean | null
          is_correct: boolean | null
          is_marked_review: boolean | null
          question_id: string
          test_id: string
          time_spent_seconds: number | null
          updated_at: string | null
          user_answer: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_attempted?: boolean | null
          is_correct?: boolean | null
          is_marked_review?: boolean | null
          question_id: string
          test_id: string
          time_spent_seconds?: number | null
          updated_at?: string | null
          user_answer?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_attempted?: boolean | null
          is_correct?: boolean | null
          is_marked_review?: boolean | null
          question_id?: string
          test_id?: string
          time_spent_seconds?: number | null
          updated_at?: string | null
          user_answer?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_playable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_responses_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "mock_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_mastery: {
        Row: {
          evidence_count: number
          exam_id: string
          id: string
          mastery_score: number
          state: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          evidence_count?: number
          exam_id: string
          id?: string
          mastery_score?: number
          state?: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          evidence_count?: number
          exam_id?: string
          id?: string
          mastery_score?: number
          state?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_mastery_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          content: string | null
          created_at: string
          filler_occurrences: Json | null
          id: string
          session_id: string | null
          user_id: string
          utterances: Json | null
          wpm_data_points: Json | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          filler_occurrences?: Json | null
          id?: string
          session_id?: string | null
          user_id: string
          utterances?: Json | null
          wpm_data_points?: Json | null
        }
        Update: {
          content?: string | null
          created_at?: string
          filler_occurrences?: Json | null
          id?: string
          session_id?: string | null
          user_id?: string
          utterances?: Json | null
          wpm_data_points?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
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
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_gov_exam_preferences: {
        Row: {
          attempt_date: string | null
          preferred_language: string
          preparation_level: string | null
          recent_searches: Json
          target_exam_id: string | null
          target_stage_id: string | null
          target_year: number | null
          updated_at: string
          user_id: string
          weekly_study_hours: number | null
        }
        Insert: {
          attempt_date?: string | null
          preferred_language?: string
          preparation_level?: string | null
          recent_searches?: Json
          target_exam_id?: string | null
          target_stage_id?: string | null
          target_year?: number | null
          updated_at?: string
          user_id: string
          weekly_study_hours?: number | null
        }
        Update: {
          attempt_date?: string | null
          preferred_language?: string
          preparation_level?: string | null
          recent_searches?: Json
          target_exam_id?: string | null
          target_stage_id?: string | null
          target_year?: number | null
          updated_at?: string
          user_id?: string
          weekly_study_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_gov_exam_preferences_target_exam_id_fkey"
            columns: ["target_exam_id"]
            isOneToOne: false
            referencedRelation: "gov_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_gov_exam_preferences_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "gov_exam_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_topic_performance: {
        Row: {
          accuracy: number | null
          avg_time_seconds: number | null
          created_at: string | null
          exam_type: string
          id: string
          last_practiced: string | null
          subject: string
          topic: string
          total_attempted: number
          total_correct: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          avg_time_seconds?: number | null
          created_at?: string | null
          exam_type?: string
          id?: string
          last_practiced?: string | null
          subject: string
          topic: string
          total_attempted?: number
          total_correct?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          avg_time_seconds?: number | null
          created_at?: string | null
          exam_type?: string
          id?: string
          last_practiced?: string | null
          subject?: string
          topic?: string
          total_attempted?: number
          total_correct?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_challenges: {
        Row: {
          completed: boolean
          created_at: string
          description: string | null
          goal: number
          id: string
          progress: number
          reward_xp: number
          title: string
          type: string
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          description?: string | null
          goal?: number
          id?: string
          progress?: number
          reward_xp?: number
          title: string
          type: string
          user_id: string
          week_end?: string
          week_start?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          description?: string | null
          goal?: number
          id?: string
          progress?: number
          reward_xp?: number
          title?: string
          type?: string
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_daily_costs: {
        Row: {
          avg_latency_ms: number | null
          call_count: number | null
          model: string | null
          total_cost_microcents: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
          usage_date: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags_public: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          is_enabled: boolean | null
          key: string | null
          name: string | null
          rollout_percent: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_enabled?: boolean | null
          key?: string | null
          name?: string | null
          rollout_percent?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_enabled?: boolean | null
          key?: string | null
          name?: string | null
          rollout_percent?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      gov_exam_bank_readiness: {
        Row: {
          approved_public_count: number | null
          exam_code: string | null
          exam_id: string | null
          exam_name: string | null
          family: string | null
          full_simulation_available: boolean | null
          legacy_exam_type: string | null
          pattern_version: string | null
          pattern_version_id: string | null
          public_count: number | null
          required_questions: number | null
          stage_code: string | null
          stage_id: string | null
          status: string | null
        }
        Relationships: []
      }
      questions_playable: {
        Row: {
          category: string | null
          created_at: string | null
          difficulty: string | null
          exam_type: string | null
          has_image: boolean | null
          id: string | null
          image_url: string | null
          is_public: boolean | null
          is_verified: boolean | null
          latex_present: boolean | null
          marks_negative: number | null
          marks_positive: number | null
          options: Json | null
          question_html: string | null
          question_text: string | null
          question_type: string | null
          source: string | null
          source_paper: string | null
          source_year: number | null
          subject: string | null
          subtopic: string | null
          tags: string[] | null
          time_limit_seconds: number | null
          topic: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          difficulty?: string | null
          exam_type?: string | null
          has_image?: boolean | null
          id?: string | null
          image_url?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          latex_present?: boolean | null
          marks_negative?: number | null
          marks_positive?: number | null
          options?: Json | null
          question_html?: string | null
          question_text?: string | null
          question_type?: string | null
          source?: string | null
          source_paper?: string | null
          source_year?: number | null
          subject?: string | null
          subtopic?: string | null
          tags?: string[] | null
          time_limit_seconds?: number | null
          topic?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          difficulty?: string | null
          exam_type?: string | null
          has_image?: boolean | null
          id?: string | null
          image_url?: string | null
          is_public?: boolean | null
          is_verified?: boolean | null
          latex_present?: boolean | null
          marks_negative?: number | null
          marks_positive?: number | null
          options?: Json | null
          question_html?: string | null
          question_text?: string | null
          question_type?: string | null
          source?: string | null
          source_paper?: string | null
          source_year?: number | null
          subject?: string | null
          subtopic?: string | null
          tags?: string[] | null
          time_limit_seconds?: number | null
          topic?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
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
      assemble_assessment_from_template: {
        Args: { p_idempotency_key?: string; p_template_id: string }
        Returns: Json
      }
      bulk_update_users: {
        Args: { p_patch: Json; p_user_ids: string[] }
        Returns: number
      }
      check_free_tier_limits: {
        Args: { p_action: string; p_user_id: string }
        Returns: Json
      }
      session_start_eligibility: {
        Args: { p_user_id: string }
        Returns: Json
      }
      start_owned_session: {
        Args: {
          p_user_id: string
          p_type: string
          p_title?: string | null
          p_document_id?: string | null
          p_jd_id?: string | null
          p_model_used?: string | null
          p_tags?: string[] | null
          p_practice_context_id?: string | null
          p_source_type?: string | null
          p_duration_minutes?: number
          p_idempotency_key?: string | null
        }
        Returns: Json
      }
      end_owned_session: {
        Args: {
          p_user_id: string
          p_session_id: string
          p_terminal_reason?: string
          p_lifecycle_status?: string | null
        }
        Returns: Json
      }
      restore_owned_session: {
        Args: {
          p_user_id: string
          p_session_id?: string | null
          p_type?: string | null
        }
        Returns: Json
      }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_ms: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at_ms: number
          retry_after_seconds: number
        }[]
      }
      claim_and_complete_test: {
        Args: {
          p_accuracy: number
          p_algorithm_version?: string
          p_attempt_percentage: number
          p_max_score: number
          p_predicted_percentile: number
          p_responses?: Json
          p_strong_topics: string[]
          p_subject_breakdown: Json
          p_test_id: string
          p_time_analysis: Json
          p_topic_breakdown: Json
          p_total_score: number
          p_user_id: string
          p_weak_topics: string[]
        }
        Returns: Json
      }
      cleanup_expired_documents: { Args: never; Returns: number }
      coding_hidden_cases_for_scoring: {
        Args: { p_question_id: string }
        Returns: {
          expected_json: Json
          id: string
          input_json: Json
          is_hidden: boolean
          name: string
          weight: number
        }[]
      }
      compute_gov_bank_readiness_status: {
        Args: { p_approved_count: number; p_required: number }
        Returns: string
      }
      create_test_atomic: {
        Args: {
          p_config: Json
          p_credit_cost?: number
          p_question_ids: string[]
          p_test_name: string
          p_time_limit: number
          p_user_id: string
        }
        Returns: Json
      }
      deduct_credits: {
        Args: { p_action: string; p_cost: number; p_session_id?: string }
        Returns: Json
      }
      deduct_credits_service: {
        Args: {
          p_user_id: string
          p_action: string
          p_cost: number
          p_session_id?: string
          p_idempotency_key?: string
          p_request_hash?: string
        }
        Returns: Json
      }
      delete_expired_session_data: { Args: never; Returns: Json }
      ensure_my_referral_code: { Args: never; Returns: string }
      get_admin_dau_mau: {
        Args: { p_days?: number }
        Returns: {
          dau: number
          day: string
        }[]
      }
      get_admin_perf_stats: {
        Args: { p_days?: number }
        Returns: {
          avg_ms: number
          call_count: number
          error_count: number
          error_rate: number
          function_name: string
          p50_ms: number
          p95_ms: number
          p99_ms: number
        }[]
      }
      get_gov_exam_bank_readiness: {
        Args: { p_exam_id?: string }
        Returns: {
          approved_public_count: number
          exam_code: string
          exam_id: string
          exam_name: string
          family: string
          full_simulation_available: boolean
          legacy_exam_type: string
          pattern_version: string
          pattern_version_id: string
          public_count: number
          required_questions: number
          stage_code: string
          stage_id: string
          status: string
        }[]
      }
      get_spendable_credits: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_referrals: {
        Args: never
        Returns: {
          converted_at: string
          created_at: string
          credits_awarded: number
          id: string
          referred_email_masked: string
          referred_id: string
          rewarded_at: string
          signed_up_at: string
          status: Database["public"]["Enums"]["referral_status"]
        }[]
      }
      get_shared_debrief: {
        Args: { p_token: string }
        Returns: {
          action_plan: Json
          created_at: string
          detailed_report: Json | null
          id: string
          improvements: string[] | null
          insight: string | null
          next_session_goals: string[]
          overall_grade: string | null
          priority_focus: string | null
          resources: Json
          session_id: string | null
          skill_gaps: Json
          strengths: string[] | null
          summary: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "session_debriefs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_scorecard: {
        Args: { p_token: string }
        Returns: {
          communication: number | null
          confidence: number | null
          created_at: string
          details: Json
          feedback: string | null
          generated_at: string | null
          id: string
          improvements: string[] | null
          is_shared: boolean
          overall_score: number | null
          problem_solving: number | null
          session_id: string | null
          share_token: string | null
          strengths: string[] | null
          technical: number | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scorecards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_own_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      claim_document_processing_job: {
        Args: { p_lease_seconds?: number; p_worker_id: string }
        Returns: Json
      }
      heartbeat_document_processing_job: {
        Args: { p_job_id: string; p_lease_seconds?: number; p_worker_id: string }
        Returns: Json
      }
      increment_profile_credits: {
        Args: { p_credits: number; p_customer_id: string; p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_moderator: { Args: never; Returns: boolean }
      get_public_feature_flags: {
        Args: never
        Returns: { key: string; is_enabled: boolean }[]
      }
      demote_admin: { Args: { p_user_id: string }; Returns: undefined }
      issue_course_certificate: { Args: { p_course_id: string }; Returns: Json }
      mark_notifications_read: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      mask_email: { Args: { p_email: string }; Returns: string }
      plan_monthly_credits: { Args: { p_plan: string }; Returns: number }
      profiles_own_update_allowed: {
        Args: { proposed: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      purge_expired_idempotency_log: { Args: never; Returns: number }
      record_referral_reward: {
        Args: { p_referral_code: string; p_referred_id: string }
        Returns: Json
      }
      refund_document_processing_job: {
        Args: { p_job_id: string; p_reason?: string }
        Returns: Json
      }
      settle_document_processing_job: {
        Args: { p_job_id: string }
        Returns: Json
      }
      transition_document_processing_job: {
        Args: {
          p_error_code?: string
          p_error_message?: string
          p_error_stage?: string
          p_job_id: string
          p_result_reference?: string
          p_status: string
          p_warnings?: Json
        }
        Returns: Json
      }
      refund_credits: {
        Args: {
          p_cost: number
          p_reason?: string
          p_source_transaction_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      update_topic_performance: {
        Args: {
          p_attempted_delta: number
          p_avg_time_seconds: number
          p_correct_delta: number
          p_exam_type: string
          p_subject: string
          p_topic: string
        }
        Returns: undefined
      }
      verify_course_certificate: { Args: { p_code: string }; Returns: Json }
    }
    Enums: {
      ai_model:
        | "gpt-4o"
        | "gpt-4o-mini"
        | "claude-3-5-sonnet"
        | "claude-3-haiku"
        | "gemini-1-5-pro"
        | "gemini-1-5-flash"
        | "gemini-2.0-flash"
      answer_type:
        | "behavioral"
        | "technical"
        | "system_design"
        | "coding"
        | "situational"
        | "other"
      app_role: "admin" | "moderator" | "user"
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
        "gemini-2.0-flash",
      ],
      answer_type: [
        "behavioral",
        "technical",
        "system_design",
        "coding",
        "situational",
        "other",
      ],
      app_role: ["admin", "moderator", "user"],
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
