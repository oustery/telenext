/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // GramJS тянет нативные вещи, исключаем из client bundle где надо
    config.externals.push({ telegram: "telegram" });
    return config;
  },
};
export default nextConfig;
