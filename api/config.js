module.exports = async (req, res) => {
  return res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || process.env.rtbp_SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.rtbp_SUPABASE_ANON_KEY || ""
  });
};
