// supabase client config
import { createClient } from "@supabase/supabase-js";

// Supabase configuration
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env file."
  );
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Auth helper functions
export const authHelpers = {
  // Sign up with email and password
  signUp: async (email, password, fullName = "") => {
    try {
      // Passwords are handled exclusively by Supabase Auth.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) throw authError;

      return { data: authData, error: null };
    } catch (error) {
      console.error("Sign up error:", error);
      return { data: null, error: error.message };
    }
  },

  // Sign in with email and password
  signIn: async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Sign in error:", error);
      return { data: null, error: error.message };
    }
  },

  // Sign in with Google
  signInWithGoogle: async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Google sign in error:", error);
      return { data: null, error: error.message };
    }
  },

  // Sign out
  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error("Sign out error:", error);
      return { error: error.message };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return supabase.auth.getUser();
  },

  // Get current session
  getCurrentSession: () => {
    return supabase.auth.getSession();
  },

  // Listen to auth changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback);
  },

  // Get user profile data from users table
  getUserProfile: async (userId) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return { data: null, error: error.message };
    }
  },

  // Update user profile
  updateUserProfile: async (userId, updates) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Error updating user profile:", error);
      return { data: null, error: error.message };
    }
  },

  // Get user settings
  getUserSettings: async (userId) => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Error fetching user settings:", error);
      return { data: null, error: error.message };
    }
  },

  // Manual sync user data (fallback if triggers don't work)
  syncUserData: async (user, fullName = "") => {
    try {
      console.log("Starting user data sync for:", user.id);

      // Check if user already exists in users table
      const { data: existingUser, error: checkError } = await supabase
        .from("users")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Error checking existing user:", checkError);
        return { success: false, error: checkError.message };
      }

      if (!existingUser) {
        console.log("Creating user profile...");

        // User doesn't exist, create profile
        const { error: userError } = await supabase.from("users").insert([
          {
            id: user.id,
            full_name: fullName || user.user_metadata?.full_name || "",
            email: user.email,
            avatar_url: user.user_metadata?.avatar_url || null,
            created_at: new Date().toISOString(),
          },
        ]);

        if (userError) {
          console.error("Error creating user profile:", userError);
          return { success: false, error: userError.message };
        }
        console.log("User profile created successfully");
      } else {
        console.log("User profile already exists");
      }

      // Check if settings exist
      const { data: existingSettings, error: settingsCheckError } =
        await supabase
          .from("settings")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

      if (settingsCheckError && settingsCheckError.code !== "PGRST116") {
        console.error("Error checking existing settings:", settingsCheckError);
        return { success: false, error: settingsCheckError.message };
      }

      if (!existingSettings) {
        console.log("Creating user settings...");
        // Settings don't exist, create them
        const { error: settingsError } = await supabase
          .from("settings")
          .insert([
            {
              user_id: user.id,
              dark_mode: false,
              language: "en",
            },
          ]);

        if (settingsError) {
          console.error("Error creating user settings:", settingsError);
          return { success: false, error: settingsError.message };
        }
        console.log("User settings created successfully");
      } else {
        console.log("User settings already exist");
      }

      return { success: true, error: null };
    } catch (error) {
      console.error("Error in syncUserData:", error);
      return { success: false, error: error.message };
    }
  },

};

export default supabase;
