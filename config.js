// Public settings. The anon key is meant to be public: every read and write
// is still checked by the access rules in supabase/setup.sql.
// The TMDB key is NOT stored here; it lives in the database behind the login.
window.OUR_CINEMA_CONFIG = {
  supabaseUrl: "https://yzkqhbueyqrtttjkvrhw.supabase.co",
  supabaseAnonKey: "PASTE_SUPABASE_ANON_KEY",
};
