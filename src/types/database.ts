export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activation_events: {
        Row: {
          actor_id: string | null
          event_name: string
          id: number
          occurred_at: string
          subject_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          event_name: string
          id?: never
          occurred_at?: string
          subject_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          event_name?: string
          id?: never
          occurred_at?: string
          subject_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["task_status"] | null
          id: string
          task_id: string | null
          task_ref_snapshot: string | null
          task_title_snapshot: string | null
          to_status: Database["public"]["Enums"]["task_status"] | null
          verb: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          task_id?: string | null
          task_ref_snapshot?: string | null
          task_title_snapshot?: string | null
          to_status?: Database["public"]["Enums"]["task_status"] | null
          verb: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          task_id?: string | null
          task_ref_snapshot?: string | null
          task_title_snapshot?: string | null
          to_status?: Database["public"]["Enums"]["task_status"] | null
          verb?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          last_error_code: string | null
          next_attempt_at: string
          notification_id: string
          processed_at: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          user_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error_code?: string | null
          next_attempt_at?: string
          notification_id: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          user_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error_code?: string | null
          next_attempt_at?: string
          notification_id?: string
          processed_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          assignments: boolean
          due_soon: boolean
          email_enabled: boolean
          invitations: boolean
          mentions: boolean
          status_changes: boolean
          updated_at: string
          user_id: string
          watched_comments: boolean
        }
        Insert: {
          assignments?: boolean
          due_soon?: boolean
          email_enabled?: boolean
          invitations?: boolean
          mentions?: boolean
          status_changes?: boolean
          updated_at?: string
          user_id: string
          watched_comments?: boolean
        }
        Update: {
          assignments?: boolean
          due_soon?: boolean
          email_enabled?: boolean
          invitations?: boolean
          mentions?: boolean
          status_changes?: boolean
          updated_at?: string
          user_id?: string
          watched_comments?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          dedupe_key: string
          id: string
          invitation_id: string | null
          kind: Database["public"]["Enums"]["notification_kind"]
          task_id: string | null
          task_ref_snapshot: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          invitation_id?: string | null
          kind: Database["public"]["Enums"]["notification_kind"]
          task_id?: string | null
          task_ref_snapshot?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          invitation_id?: string | null
          kind?: Database["public"]["Enums"]["notification_kind"]
          task_id?: string | null
          task_ref_snapshot?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "workspace_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_dismissals: {
        Row: {
          dismissed_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          dismissed_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          dismissed_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_dismissals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id: string
          name?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          id: string
          key: string
          name: string
          next_task_num: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          id?: string
          key: string
          name: string
          next_task_num?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          id?: string
          key?: string
          name?: string
          next_task_num?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_view_defaults: {
        Row: {
          created_at: string
          saved_view_id: string
          updated_at: string
          user_id: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          saved_view_id: string
          updated_at?: string
          user_id: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          saved_view_id?: string
          updated_at?: string
          user_id?: string
          view_type?: Database["public"]["Enums"]["saved_view_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_view_defaults_saved_view_id_fkey"
            columns: ["saved_view_id"]
            isOneToOne: false
            referencedRelation: "saved_views"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_view_defaults_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_view_defaults_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          configuration: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          visibility: Database["public"]["Enums"]["saved_view_visibility"]
          workspace_id: string
        }
        Insert: {
          configuration: Json
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          visibility?: Database["public"]["Enums"]["saved_view_visibility"]
          workspace_id: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          view_type?: Database["public"]["Enums"]["saved_view_type"]
          visibility?: Database["public"]["Enums"]["saved_view_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          done: boolean
          id: string
          position: number
          task_id: string
          title: string
        }
        Insert: {
          done?: boolean
          id?: string
          position?: number
          task_id: string
          title: string
        }
        Update: {
          done?: boolean
          id?: string
          position?: number
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          tag: string
          task_id: string
        }
        Insert: {
          tag: string
          task_id: string
        }
        Update: {
          tag?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_watchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string
          end_date: string | null
          id: string
          points: number | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          ref: string
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          end_date?: string | null
          id?: string
          points?: number | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          ref: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          end_date?: string | null
          id?: string
          points?: number | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          ref?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_assignee_fkey"
            columns: ["workspace_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["workspace_id", "user_id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email_normalized: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email_normalized: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email_normalized?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          capacity_per_week: number
          color: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          capacity_per_week?: number
          color?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          capacity_per_week?: number
          color?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_verified_invitations_for_user: {
        Args: { p_user_id: string }
        Returns: number
      }
      accept_workspace_invitations: { Args: never; Returns: number }
      archive_project: {
        Args: { p_project_id: string }
        Returns: {
          archived_at: string | null
          color: string
          created_at: string
          id: string
          key: string
          name: string
          next_task_num: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      capture_activation_event: {
        Args: {
          p_actor_id: string
          p_event_name: string
          p_occurred_at: string
          p_subject_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      claim_notification_outbox: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          notification_id: string
          notification_kind: Database["public"]["Enums"]["notification_kind"]
          outbox_id: string
          recipient_email: string
          task_ref: string
          workspace_id: string
        }[]
      }
      complete_notification_delivery: {
        Args: {
          p_error_code?: string
          p_outbox_id: string
          p_succeeded: boolean
        }
        Returns: undefined
      }
      create_comment: {
        Args: {
          p_body: string
          p_mentioned_user_ids?: string[]
          p_task_id: string
        }
        Returns: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_project: {
        Args: { p_key: string; p_name: string; p_workspace_id: string }
        Returns: {
          archived_at: string | null
          color: string
          created_at: string
          id: string
          key: string
          name: string
          next_task_num: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_saved_view: {
        Args: {
          p_configuration: Json
          p_name: string
          p_view_type: Database["public"]["Enums"]["saved_view_type"]
          p_visibility?: Database["public"]["Enums"]["saved_view_visibility"]
          p_workspace_id: string
        }
        Returns: {
          configuration: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          visibility: Database["public"]["Enums"]["saved_view_visibility"]
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_views"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_task: {
        Args: { p_project_id: string; p_title: string }
        Returns: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string
          end_date: string | null
          id: string
          points: number | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          ref: string
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace: {
        Args: {
          p_initial_project_key: string
          p_initial_project_name: string
          p_name: string
        }
        Returns: {
          project_id: string
          workspace_id: string
        }[]
      }
      delete_saved_view: { Args: { p_saved_view_id: string }; Returns: boolean }
      duplicate_saved_view: {
        Args: { p_name?: string; p_saved_view_id: string }
        Returns: {
          configuration: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          visibility: Database["public"]["Enums"]["saved_view_visibility"]
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_views"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_due_notifications: { Args: { p_days?: number }; Returns: number }
      enqueue_notification: {
        Args: {
          p_actor_id: string
          p_comment_id: string
          p_dedupe_key: string
          p_invitation_id: string
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_task_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      get_activation_status: {
        Args: { p_workspace_id: string }
        Returns: {
          activated_within_7_days: boolean
          checklist_complete: boolean
          core_view_opened: boolean
          dismissed: boolean
          invitation_sent: boolean
          project_created: boolean
          second_member_active: boolean
          task_count: number
          workspace_created: boolean
        }[]
      }
      get_default_saved_view: {
        Args: {
          p_view_type: Database["public"]["Enums"]["saved_view_type"]
          p_workspace_id: string
        }
        Returns: {
          configuration: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          visibility: Database["public"]["Enums"]["saved_view_visibility"]
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "saved_views"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_unread_notification_count: { Args: never; Returns: number }
      has_workspace_role: {
        Args: {
          allowed: Database["public"]["Enums"]["member_role"][]
          ws: string
        }
        Returns: boolean
      }
      is_member: { Args: { ws: string }; Returns: boolean }
      is_task_watched: { Args: { p_task_id: string }; Returns: boolean }
      mark_all_notifications_read: { Args: never; Returns: number }
      move_task: {
        Args: {
          p_after_task_id?: string
          p_before_task_id?: string
          p_task_id: string
          p_to_status: Database["public"]["Enums"]["task_status"]
        }
        Returns: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string
          end_date: string | null
          id: string
          points: number | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          ref: string
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      normalize_saved_view_array: {
        Args: {
          p_allow_empty?: boolean
          p_allowed?: string[]
          p_max_length?: number
          p_name: string
          p_value: Json
        }
        Returns: Json
      }
      query_inbox: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
        }
        Returns: {
          actor_id: string
          comment_id: string
          created_at: string
          id: string
          invitation_id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at: string
          task_id: string
          task_ref: string
          workspace_id: string
        }[]
      }
      query_my_work: {
        Args: {
          p_cursor_id?: string
          p_cursor_sort?: string
          p_limit?: number
          p_scope?: string
        }
        Returns: {
          end_date: string
          id: string
          points: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          project_key: string
          project_name: string
          ref: string
          sort_value: string
          start_date: string
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      query_tasks: {
        Args: {
          p_assignee?: string[]
          p_cursor_id?: string
          p_cursor_sort?: string
          p_include_unassigned?: boolean
          p_limit?: number
          p_priority?: Database["public"]["Enums"]["task_priority"][]
          p_schedule?: string
          p_search?: string
          p_sort?: string
          p_status?: Database["public"]["Enums"]["task_status"][]
          p_tags?: string[]
          p_type?: Database["public"]["Enums"]["task_type"][]
          p_window_end?: string
          p_window_start?: string
          p_workspace_id: string
        }
        Returns: {
          assignee_id: string
          created_at: string
          created_by: string
          description: string
          end_date: string
          id: string
          points: number
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          ref: string
          sort_value: string
          start_date: string
          status: Database["public"]["Enums"]["task_status"]
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          workspace_id: string
        }[]
      }
      query_workload: {
        Args: {
          p_week_count?: number
          p_window_start: string
          p_workspace_id: string
        }
        Returns: {
          assignee_id: string
          bucket: string
          points: number
          week_start: string
        }[]
      }
      record_activation_signal: {
        Args: { p_event_name: string; p_workspace_id: string }
        Returns: undefined
      }
      remove_workspace_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          removed_user_id: string
          unassigned_task_count: number
        }[]
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          email_normalized: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_default_saved_view: {
        Args: {
          p_saved_view_id?: string
          p_view_type: Database["public"]["Enums"]["saved_view_type"]
          p_workspace_id: string
        }
        Returns: boolean
      }
      set_member_capacity: {
        Args: { p_capacity: number; p_user_id: string; p_workspace_id: string }
        Returns: {
          capacity_per_week: number
          color: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["member_role"]
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          capacity_per_week: number
          color: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_task_watched: {
        Args: { p_task_id: string; p_watching: boolean }
        Returns: boolean
      }
      shares_workspace: { Args: { target: string }; Returns: boolean }
      transfer_workspace_ownership: {
        Args: { p_new_owner_id: string; p_workspace_id: string }
        Returns: {
          new_owner_id: string
          previous_owner_id: string
        }[]
      }
      update_project: {
        Args: { p_name: string; p_project_id: string }
        Returns: {
          archived_at: string | null
          color: string
          created_at: string
          id: string
          key: string
          name: string
          next_task_num: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_saved_view: {
        Args: {
          p_configuration: Json
          p_name: string
          p_saved_view_id: string
          p_visibility: Database["public"]["Enums"]["saved_view_visibility"]
        }
        Returns: {
          configuration: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          view_type: Database["public"]["Enums"]["saved_view_type"]
          visibility: Database["public"]["Enums"]["saved_view_visibility"]
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_views"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_workspace: {
        Args: { p_name: string; p_workspace_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_workspace_invitation: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["member_role"]
          p_workspace_id: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          email_normalized: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_saved_view_assignees: {
        Args: { p_configuration: Json; p_workspace_id: string }
        Returns: undefined
      }
      validate_saved_view_configuration: {
        Args: {
          p_configuration: Json
          p_view_type: Database["public"]["Enums"]["saved_view_type"]
        }
        Returns: Json
      }
    }
    Enums: {
      member_role: "owner" | "admin" | "member"
      notification_delivery_status: "pending" | "processing" | "sent" | "dead"
      notification_kind:
        | "assignment"
        | "mention"
        | "watched_comment"
        | "status_change"
        | "invitation"
        | "due_soon"
      saved_view_type: "list" | "board" | "gantt" | "timeline"
      saved_view_visibility: "private" | "workspace"
      task_priority: "urgent" | "high" | "medium" | "low"
      task_status: "backlog" | "todo" | "in_progress" | "in_review" | "done"
      task_type: "feature" | "bug" | "chore" | "improvement"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      member_role: ["owner", "admin", "member"],
      notification_delivery_status: ["pending", "processing", "sent", "dead"],
      notification_kind: [
        "assignment",
        "mention",
        "watched_comment",
        "status_change",
        "invitation",
        "due_soon",
      ],
      saved_view_type: ["list", "board", "gantt", "timeline"],
      saved_view_visibility: ["private", "workspace"],
      task_priority: ["urgent", "high", "medium", "low"],
      task_status: ["backlog", "todo", "in_progress", "in_review", "done"],
      task_type: ["feature", "bug", "chore", "improvement"],
    },
  },
} as const

