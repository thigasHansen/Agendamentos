// supabaseClient.js
// Edit these two lines with your Supabase project values.
const SUPABASE_URL = "https://tecbuwpdhhlbzgjadego.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DDNV8FDFpgYoEelsTk0zbQ_AL7oePju";

window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helpers
window.getSession = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
};

window.signIn = async (email, password) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

window.signOut = async () => {
  return await supabase.auth.signOut();
};
