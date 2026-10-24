// Public settings. The anon key is meant to be public: every read and write
// is still checked by the access rules in supabase/setup.sql.
// The TMDB key is NOT stored here; it lives in the database behind the login.
window.OUR_CINEMA_CONFIG = {
  supabaseUrl: "https://yzkqhbueyqrtttjkvrhw.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6a3FoYnVleXFydHR0amt2cmh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NDg3NTMsImV4cCI6MjEwNzEyNDc1M30.m9vb08JHtGDKCkw8REx3zu5nSNRPyYIp3DnYdlbveGk",
  // SHA-256 fingerprints of the two member emails (lower-case). Used only to
  // enable the sign-in button; the server enforces membership on its own.
  // Public half of the key that signs phone notifications (the private half is only on the server).
  vapidPublicKey: "BCCwGx_89K5xP3B2V93QVcTaYxRYc8cY0sD2W-pnzPygzYich8EtFlU5o_8soy1jLPiibxkoj8gehtyDvp0HA8s",
  memberEmailHashes: [
    "65e472d0707e9923e5e640266734df95d0ba8d826212a872772c29cd86030097",
    "c1f9e37de4d18b4616cc0be507ee7a87d00cc2d297811786fc3ad6393d867148",
  ],
};
