/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Supabase Storage is the system of record for preview PNGs.
    remotePatterns: [
      { protocol: "https", hostname: "ycadmmngkdhvpcsrcuaq.supabase.co" },
    ],
  },
};

export default nextConfig;
