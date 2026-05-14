import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    // 外部画像ソースのホスト名を追加
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },    // モック用
      { protocol: 'https', hostname: 'pics.dmm.co.jp' },  // DMM 本番画像（メイン CDN）
      { protocol: 'https', hostname: 'pics.dmm.com' },    // DMM 本番画像（予備 CDN）
      { protocol: 'https', hostname: 'janoaissungtmkdngmnf.supabase.co' }, // Supabase Storage
    ],
  },
  // Supabase SSR のクッキー警告抑制と Server Actions 設定
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3001',
        'verity-official.com',
        'www.verity-official.com',
      ],
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;